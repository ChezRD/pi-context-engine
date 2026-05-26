import type { RuntimeState } from "../runtime-state.ts";
import { stableHash } from "./prefix-fingerprint.ts";
import { getActiveLocale } from "../i18n/index.ts";
import { detectToolIntent, detectUserIntentMultilingual, extractUserIntentText, loadToolIntentVocabulary, reconcileToolIntentWithCall, recordToolIntentDetection, type GuidanceKind, type GuidanceRecord, type PendingToolIntent, type UserIntentDetection } from "./tool-intent.ts";
import { buildGuidanceProjection, deactivateToolIntentGuidance, upsertToolIntentGuidance, upsertUserIntentGuidance } from "./tool-intent-injection.ts";
import { safeAppendEntry } from "../stale-context.ts";

const CONFIDENCE_RANK = { low: 0, medium: 1, high: 2 } as const;
const MODEL_INVALID_TOOL_ARGS = "Invalid tool arguments; retry with valid schema.";
const MODEL_DUPLICATE_TOOL_CALL = "Duplicate tool call suppressed to avoid cache/context churn.";
export const CUSTOM_TYPE_GUIDANCE = "context-engine-guidance";

function normalizeReadInput(input: any): void {
	if (!input || typeof input !== "object") return;
	if (typeof input.file === "string" && typeof input.path !== "string") {
		input.path = input.file;
		delete input.file;
	}
}

function isInvalidReadInput(input: any): boolean {
	return !input || typeof input !== "object" || (typeof input.path !== "string" && typeof input.file !== "string");
}

function inputPath(input: any): string | undefined {
	if (!input || typeof input !== "object") return undefined;
	const value = input.path ?? input.file;
	return typeof value === "string" && value.trim() ? value : undefined;
}

function inputRef(input: any): string | undefined {
	return input && typeof input === "object" && typeof input.ref === "string" && input.ref.trim() ? input.ref : undefined;
}

function hasDroppableFact(state: RuntimeState, kind: "ref" | "path", value: string): boolean {
	const segments = state.engine.prune.sessionMap?.segments ?? [];
	return segments.some((segment) => {
		if (!segment.dropCandidate) return false;
		const values = kind === "ref" ? segment.facts?.refs : segment.facts?.paths;
		return values?.includes(value);
	});
}

function recordCompressionRegret(toolName: string | undefined, input: any, state: RuntimeState): void {
	const impact = state.engine.prune.impact;
	impact.postPruneLookupRegret ??= 0;
	impact.postPruneReadRegret ??= 0;
	impact.postFoldReadRegret ??= 0;
	if (toolName === "context_result_lookup") {
		const ref = inputRef(input);
		if (ref && hasDroppableFact(state, "ref", ref)) impact.postPruneLookupRegret++;
		return;
	}
	if (toolName === "read") {
		const path = inputPath(input);
		if (path && hasDroppableFact(state, "path", path)) impact.postPruneReadRegret++;
		if (path && state.engine.semanticFold.active) impact.postFoldReadRegret++;
	}
}

function guidanceKey(records: GuidanceRecord[]): string | undefined {
	const keys = records
		.filter((record) => record.active)
		.map((record) => record.stableKey)
		.sort();
	return keys.length > 0 ? keys.join("|") : undefined;
}

function activeGuidanceRecords(state: RuntimeState, kinds?: GuidanceKind[]): GuidanceRecord[] {
	const allowed = kinds ? new Set(kinds) : undefined;
	return state.engine.toolIntent.guidanceRecords.filter((record) => record.active && (!allowed || allowed.has(record.kind)));
}

function persistGuidanceEntry(pi: any, state: RuntimeState, source: string, records: GuidanceRecord[]): void {
	if (records.length === 0) return;
	const stableKey = guidanceKey(records);
	if (!stableKey) return;
	if (state.engine.toolIntent.persistedGuidanceKeys.includes(stableKey)) return;
	state.engine.toolIntent.persistedGuidanceKeys.unshift(stableKey);
	state.engine.toolIntent.persistedGuidanceKeys = state.engine.toolIntent.persistedGuidanceKeys.slice(0, 20);
	const content = buildGuidanceProjection(records, state.config.toolIntentNudgeMaxChars);
	if (!content) return;
	safeAppendEntry(pi, CUSTOM_TYPE_GUIDANCE, {
		version: 1,
		stableKey,
		source,
		turnIndex: state.engine.turnIndex,
		records,
		content,
	});
}

export function maybePersistEffectiveGuidance(state: RuntimeState, pi?: any, source = "state", kinds?: GuidanceKind[]): string | undefined {
	if (!state.config.toolIntentNudge) return undefined;
	const active = activeGuidanceRecords(state, kinds);
	const stableKey = guidanceKey(active);
	if (!stableKey) return undefined;
	const content = buildGuidanceProjection(active, state.config.toolIntentNudgeMaxChars);
	if (!content) return undefined;
	persistGuidanceEntry(pi, state, source, active);
	return content;
}

export function maybeBuildEffectiveGuidanceMessage(state: RuntimeState, pi?: any, source = "before_agent_start", kinds?: GuidanceKind[]): any | undefined {
	const pendingConf = state.engine.toolIntent.pendingUserIntentConfirmation;
	if (pendingConf) {
		const actionName = pendingConf.kind === "diagnose" ? "run diagnostics"
			: pendingConf.kind === "save-memory" ? "save/remember information"
			: pendingConf.kind === "prune-request" ? "prune the context"
			: pendingConf.kind === "search" ? "search the codebase"
			: pendingConf.kind === "analyze" ? "analyze/audit the code"
			: pendingConf.kind;
		const content = `<!-- pi-context-engine: intent confirmation prompt -->
System suspects the user wants to: ${actionName} (reason: ${pendingConf.reasonCode}).
Do NOT apply the steering rules or actions for this intent yet.
Instead, mention in your response that based on the user's message, you suspect they want to ${actionName}.
Ask the user to confirm if this is correct (e.g. by responding with an affirmation). You must write this request in the language used by the user in their messages.
<!-- /pi-context-engine: intent confirmation prompt -->`;
		return { role: "custom", customType: "context-engine-guidance", display: false, content };
	}

	const active = activeGuidanceRecords(state, kinds);
	const stableKey = guidanceKey(active);
	if (!stableKey || state.engine.toolIntent.deliveredGuidanceKey === stableKey) return undefined;
	const content = maybePersistEffectiveGuidance(state, pi, source, kinds);
	if (!content) return undefined;
	state.engine.toolIntent.deliveredGuidanceKey = stableKey;
	state.engine.toolIntent.stats.nudgeChars += content.length;
	return { role: "custom", customType: "context-engine-guidance", display: false, content };
}

function messageText(message: any): string {
	const content = message?.content;
	if (typeof content === "string") return content;
	if (!Array.isArray(content)) return "";
	return content.map((part) => {
		if (typeof part === "string") return part;
		if (part && typeof part === "object" && typeof part.text === "string") return part.text;
		return "";
	}).filter(Boolean).join("\n");
}

export function maybeAppendEffectiveGuidanceMessage(messages: any[], _ctx: any, state: RuntimeState, pi?: any): any[] | undefined {
	if (!state.config.toolIntentNudge) return undefined;
	if (messages.some((message) => messageText(message).includes("[pi-context-engine guidance]") || messageText(message).includes("<!-- pi-context-engine: guidance -->"))) return undefined;
	const active = activeGuidanceRecords(state, ["tool-intent"]);
	const stableKey = guidanceKey(active);
	if (!stableKey) return undefined;
	const content = maybePersistEffectiveGuidance(state, pi, "context", ["tool-intent"]);
	if (!content) return undefined;
	state.engine.toolIntent.contextGuidanceKey = stableKey;
	state.engine.toolIntent.stats.nudges++;
	state.engine.toolIntent.stats.nudgeChars += content.length;
	return [...messages, { role: "custom", customType: "context-engine-guidance", display: false, content }];
}

export function detectTextualToolCall(message: any): boolean {
	return detectToolIntent(message, { locale: getActiveLocale() }).kind === "imminent-tool-call";
}

export function handleAssistantMessageIntent(message: any, state: RuntimeState): ReturnType<typeof detectToolIntent> {
	const detection = detectToolIntent(message, { locale: getActiveLocale() });
	const pending = recordToolIntentDetection(state.engine.toolIntent, detection, state.engine.turnIndex);
	if (pending) upsertToolIntentGuidance(state.engine.toolIntent, pending, state.engine.toolIntent.lastUserIntent, state.engine.turnIndex);
	return detection;
}

function isUserConfirmation(text: string, confirmationWords: string[]): boolean {
	const lower = text.toLowerCase().trim();
	for (const word of confirmationWords) {
		const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
		const regex = new RegExp(`^(?:${escaped})\\b`, "i");
		if (regex.test(lower)) return true;
	}
	return false;
}

export function handleUserIntent(event: any, state: RuntimeState, options: { onlyIfInputNotSeen?: boolean } = {}): ReturnType<typeof detectUserIntentMultilingual> {
	const text = extractUserIntentText(event);
	const inputHash = text ? stableHash({ userInput: text }) : undefined;
	if (options.onlyIfInputNotSeen && inputHash && state.engine.toolIntent.lastUserInputHash === inputHash && state.engine.toolIntent.lastUserIntent) {
		return state.engine.toolIntent.lastUserIntent;
	}
	if (!options.onlyIfInputNotSeen && inputHash && state.engine.toolIntent.lastUserInputHash !== inputHash) {
		state.engine.toolIntent.lastUserIntentNudgeKey = undefined;
	}

	const previous = state.engine.toolIntent.lastUserIntent;
	const pending = state.engine.toolIntent.pendingUserIntentConfirmation;
	const detection = detectUserIntentMultilingual(event, { locale: getActiveLocale() });
	const vocab = loadToolIntentVocabulary(getActiveLocale());

	if (pending && text && isUserConfirmation(text, vocab.userConfirmationWords)) {
		state.engine.toolIntent.lastUserIntent = pending;
		state.engine.toolIntent.pendingUserIntentConfirmation = undefined;
		state.engine.toolIntent.lastUserInputHash = inputHash;
		upsertUserIntentGuidance(state.engine.toolIntent, pending, state.engine.turnIndex);
		return pending;
	}

	if (detection.kind !== "general") {
		if (previous && previous.kind === detection.kind) {
			state.engine.toolIntent.lastUserIntent = detection;
			state.engine.toolIntent.lastUserInputHash = inputHash;
			upsertUserIntentGuidance(state.engine.toolIntent, detection, state.engine.turnIndex);
			return detection;
		}
		if (!previous || previous.kind === "general") {
			state.engine.toolIntent.pendingUserIntentConfirmation = detection;
			state.engine.toolIntent.lastUserInputHash = inputHash;
			const generalIntent: UserIntentDetection = { kind: "general", confidence: "high", reasonCode: "no_specific_intent" };
			state.engine.toolIntent.lastUserIntent = generalIntent;
			return generalIntent;
		}
	}

	state.engine.toolIntent.pendingUserIntentConfirmation = undefined;
	state.engine.toolIntent.lastUserIntent = detection;
	state.engine.toolIntent.lastUserInputHash = inputHash;
	upsertUserIntentGuidance(state.engine.toolIntent, detection, state.engine.turnIndex);
	return detection;
}

export function handleToolCall(event: any, _ctx: any, state: RuntimeState): any | undefined {
	if (!state.config.enabled) return undefined;
	const toolName = event?.toolName ?? event?.name;
	const input = event?.input;
	if (toolName === "read" && isInvalidReadInput(input)) return { block: true, reason: MODEL_INVALID_TOOL_ARGS };
	if (toolName === "read") normalizeReadInput(input);
	const key = stableHash({ tool: toolName, input });
	const matched = state.engine.toolIntent.pending.find((pending) => {
		const expected = pending.detection.expectedToolNames ?? (pending.detection.toolName ? [pending.detection.toolName] : []);
		return expected.length === 0 || !toolName || expected.includes(toolName);
	});
	reconcileToolIntentWithCall(state.engine.toolIntent, toolName, event?.toolCallId ?? event?.id);
	if (matched) deactivateToolIntentGuidance(state.engine.toolIntent, matched);
	const bypass = Array.isArray(state.config.toolStabilityBypass) ? state.config.toolStabilityBypass : [];
	if (toolName && bypass.includes(toolName)) {
		state.engine.recentToolCalls.set(key, state.engine.turnIndex);
		recordCompressionRegret(toolName, input, state);
		return undefined;
	}
	const threshold = typeof state.config.toolBlockThreshold === "number" ? state.config.toolBlockThreshold : 2;
	const last = state.engine.recentToolCalls.get(key);
	if (last !== undefined && state.engine.turnIndex - last < threshold) {
		return { block: true, reason: MODEL_DUPLICATE_TOOL_CALL };
	}
	state.engine.recentToolCalls.set(key, state.engine.turnIndex);
	recordCompressionRegret(toolName, input, state);
	return undefined;
}

/** Clear the recent-tool-call tracking map. Call after fold, compact, or prune to prevent stale duplicate suppression. */
export function clearRecentToolCalls(state: RuntimeState): void {
	state.engine.recentToolCalls.clear();
}

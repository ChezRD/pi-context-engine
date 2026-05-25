import type { RuntimeState } from "../runtime-state.ts";
import { stableHash } from "./prefix-fingerprint.ts";
import { getActiveLocale, t } from "../i18n/index.ts";
import { detectToolIntent, detectUserIntent, reconcileToolIntentWithCall, recordToolIntentDetection } from "./tool-intent.ts";
import { buildToolIntentNudge, reserveToolIntentNudge } from "./tool-intent-injection.ts";

const CONFIDENCE_RANK = { low: 0, medium: 1, high: 2 } as const;

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

export function detectTextualToolCall(message: any): boolean {
	return detectToolIntent(message, { locale: getActiveLocale() }).kind === "imminent-tool-call";
}

export function handleAssistantMessageIntent(message: any, state: RuntimeState): ReturnType<typeof detectToolIntent> {
	const detection = detectToolIntent(message, { locale: getActiveLocale() });
	recordToolIntentDetection(state.engine.toolIntent, detection, state.engine.turnIndex);
	return detection;
}

export function handleUserIntent(event: any, state: RuntimeState): ReturnType<typeof detectUserIntent> {
	const detection = detectUserIntent(event, { locale: getActiveLocale() });
	state.engine.toolIntent.lastUserIntent = detection;
	return detection;
}

export function maybeInjectToolIntentNudge(event: any, ctx: any, state: RuntimeState): any | undefined {
	if (!state.config.toolIntentNudge) return undefined;
	const pending = state.engine.toolIntent.pending.find((item) => {
		if (item.nudged) return false;
		return CONFIDENCE_RANK[item.detection.confidence] >= CONFIDENCE_RANK[state.config.toolIntentNudgeMinConfidence];
	});
	if (!pending) return undefined;
	const sessionId = String(ctx?.session?.id ?? ctx?.sessionId ?? ctx?.sessionID ?? "default");
	if (!reserveToolIntentNudge(state.engine.toolIntent, pending, sessionId)) return undefined;
	const nudge = buildToolIntentNudge(pending, state.config.toolIntentNudgeMaxChars, state.engine.toolIntent.lastUserIntent);
	state.engine.toolIntent.stats.nudges++;
	state.engine.toolIntent.stats.nudgeChars += nudge.length;
	const payload = event?.payload ?? event?.body ?? event;
	if (Array.isArray(payload?.messages)) {
		payload.messages = [...payload.messages, { role: "system", content: nudge }];
		return { messages: payload.messages };
	}
	if (Array.isArray(event?.messages)) {
		event.messages = [...event.messages, { role: "system", content: nudge }];
		return { messages: event.messages };
	}
	return undefined;
}

export function handleToolCall(event: any, _ctx: any, state: RuntimeState): any | undefined {
	if (!state.config.enabled) return undefined;
	const toolName = event?.toolName ?? event?.name;
	const input = event?.input;
	if (toolName === "read" && isInvalidReadInput(input)) return { block: true, reason: t("engine.tool.invalidArgs") };
	if (toolName === "read") normalizeReadInput(input);
	const key = stableHash({ tool: toolName, input });
	reconcileToolIntentWithCall(state.engine.toolIntent, toolName, event?.toolCallId ?? event?.id);
	const last = state.engine.recentToolCalls.get(key);
	if (last !== undefined && state.engine.turnIndex - last < 2) {
		return { block: true, reason: t("engine.tool.duplicate") };
	}
	state.engine.recentToolCalls.set(key, state.engine.turnIndex);
	recordCompressionRegret(toolName, input, state);
	return undefined;
}

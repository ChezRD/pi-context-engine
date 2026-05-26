import { I18N_LOCALES, localeFallbackChain, tArrayMerged } from "../i18n/index.ts";

export type ToolIntentKind =
	| "structured-call-present"
	| "imminent-tool-call"
	| "example-or-schema"
	| "tool-discussion"
	| "none";

export type ToolIntentConfidence = "high" | "medium" | "low";

export type UserIntentKind = "tool-request" | "search" | "analyze" | "prune-request" | "save-memory" | "diagnose" | "general";

export type ToolIntentReasonCode =
	| "structured_tool_calls"
	| "imperative_tool_action"
	| "call_expression"
	| "example_context"
	| "code_block_only"
	| "no_tool_intent";

export interface ToolIntentDetection {
	kind: ToolIntentKind;
	confidence: ToolIntentConfidence;
	toolName?: string;
	expectedToolNames?: string[];
	locale?: string;
	vocabularyLocale?: string;
	matchedAction?: string;
	matchedObject?: string;
	reasonCode: ToolIntentReasonCode;
	evidence?: {
		proseSnippet?: string;
		codeBlockOnly?: boolean;
		registeredToolMatched?: boolean;
	};
}

export interface UserIntentDetection {
	kind: UserIntentKind;
	confidence: ToolIntentConfidence;
	locale?: string;
	vocabularyLocale?: string;
	toolName?: string;
	matchedAction?: string;
	reasonCode: "explicit_tool_request" | "search_request" | "analysis_request" | "prune_request" | "save_memory_request" | "diagnose_request" | "no_specific_intent";
	evidence?: {
		proseSnippet?: string;
		registeredToolMatched?: boolean;
	};
}

export interface ToolIntentVocabulary {
	locale: string;
	fallbackLocales: string[];
	actionVerbs: string[];
	toolNouns: string[];
	explanationMarkers: string[];
	futureMarkers: string[];
	metaLabelWords: string[];
	userSearchWords: string[];
	userAnalyzeWords: string[];
	userPruneWords: string[];
	userRememberWords: string[];
	userDiagnoseWords: string[];
	userConfirmationWords: string[];
}

export interface DetectToolIntentOptions {
	locale?: string;
	registeredTools?: string[];
	vocabulary?: Partial<ToolIntentVocabulary>;
}

export interface PendingToolIntent {
	id: string;
	turnIndex: number;
	detection: ToolIntentDetection;
	createdAt: number;
	nudged?: boolean;
}

export type GuidanceKind = "user-intent" | "tool-intent";

export interface GuidanceRecord {
	version: 1;
	kind: GuidanceKind;
	stableKey: string;
	content: string;
	createdTurn: number;
	updatedTurn: number;
	confidence: ToolIntentConfidence;
	intentKind: UserIntentKind | ToolIntentKind;
	reasonCode: string;
	matchedSignal?: string;
	toolName?: string;
	active: boolean;
	sourceEvent: "user_input" | "assistant_message";
}

export interface RecentToolIntent {
	id: string;
	turnIndex: number;
	detection: ToolIntentDetection;
	matchedToolCallId?: string;
	outcome: "matched" | "unmatched" | "suppressed" | "expired";
}

export interface IntentNudgeGateState {
	active?: {
		sessionId: string;
		dedupeKey: string;
		source: "tool-intent-nudge" | "user-intent-nudge";
		expiresAt: number;
	};
	recentDedupeKeys: string[];
}

export interface ToolIntentState {
	pending: PendingToolIntent[];
	recent: RecentToolIntent[];
	lastUserIntent?: UserIntentDetection;
	pendingUserIntentConfirmation?: UserIntentDetection;
	lastUserIntentNudgeKey?: string;
	persistedUserIntentNudgeKey?: string;
	persistedToolIntentNudgeKeys: string[];
	persistedGuidanceKeys: string[];
	guidanceRecords: GuidanceRecord[];
	deliveredGuidanceKey?: string;
	contextGuidanceKey?: string;
	lastUserInputHash?: string;
	stats: {
		detected: number;
		matched: number;
		unmatched: number;
		suppressed: number;
		nudges: number;
		userNudges: number;
		nudgeSuppressedDuplicate: number;
		nudgeChars: number;
	};
	nudgeGate: IntentNudgeGateState;
}

const DEFAULT_TOOLS = [
	"read",
	"write",
	"edit",
	"bash",
	"shell",
	"grep",
	"rg",
	"context_result_lookup",
	"context_pin",
	"context_checkpoint",
	"context_rewind",
	"context_timeline",
];

const CODE_BLOCK_PATTERN = /```[\s\S]*?```/g;
const INLINE_CODE_PATTERN = /`[^`]+`/g;

function normalizeLocale(locale?: string): string {
	if (!locale) return "en";
	return locale.toLowerCase().replace("_", "-");
}

function unique(values: string[]): string[] {
	return Array.from(new Set(values.filter(Boolean)));
}

export function loadToolIntentVocabulary(locale: string | undefined, override: Partial<ToolIntentVocabulary> = {}): ToolIntentVocabulary {
	const normalized = normalizeLocale(locale);
	const fallbackLocales = override.fallbackLocales ?? localeFallbackChain(normalized);
	return {
		locale: override.locale ?? normalized,
		fallbackLocales,
		actionVerbs: unique(override.actionVerbs ?? tArrayMerged("intent.actionVerbs", normalized)),
		toolNouns: unique(override.toolNouns ?? tArrayMerged("intent.toolNouns", normalized)),
		explanationMarkers: unique(override.explanationMarkers ?? tArrayMerged("intent.explanationMarkers", normalized)),
		futureMarkers: unique(override.futureMarkers ?? tArrayMerged("intent.futureMarkers", normalized)),
		metaLabelWords: unique(override.metaLabelWords ?? tArrayMerged("intent.metaLabelWords", normalized)),
		userSearchWords: unique(override.userSearchWords ?? tArrayMerged("intent.user.searchWords", normalized)),
		userAnalyzeWords: unique(override.userAnalyzeWords ?? tArrayMerged("intent.user.analyzeWords", normalized)),
		userPruneWords: unique(override.userPruneWords ?? tArrayMerged("intent.user.pruneWords", normalized)),
		userRememberWords: unique(override.userRememberWords ?? tArrayMerged("intent.user.rememberWords", normalized)),
		userDiagnoseWords: unique(override.userDiagnoseWords ?? tArrayMerged("intent.user.diagnoseWords", normalized)),
		userConfirmationWords: unique(override.userConfirmationWords ?? tArrayMerged("intent.user.confirmationWords", normalized)),
	};
}

function escapeRegExp(text: string): string {
	return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function wordPattern(words: string[]): RegExp | null {
	if (words.length === 0) return null;
	return new RegExp(`(?:^|[^\\p{L}\\p{N}_])(${words.map(escapeRegExp).join("|")})(?=$|[^\\p{L}\\p{N}_])`, "iu");
}

export function hasStructuredToolCalls(message: any): boolean {
	return (Array.isArray(message?.toolCalls) && message.toolCalls.length > 0)
		|| (Array.isArray(message?.tool_calls) && message.tool_calls.length > 0);
}

export function extractMessageText(message: any): string {
	const content = message?.content;
	if (typeof content === "string") return content;
	if (!Array.isArray(content)) return "";
	return content
		.map((part) => {
			if (typeof part === "string") return part;
			if (part && typeof part === "object" && typeof part.text === "string") return part.text;
			return "";
		})
		.filter(Boolean)
		.join(" ");
}

function stripCode(text: string): { prose: string; hadCode: boolean; codeText: string } {
	let codeText = "";
	const withoutFences = text.replace(CODE_BLOCK_PATTERN, (match) => {
		codeText += `\n${match}`;
		return " ";
	});
	const prose = withoutFences.replace(INLINE_CODE_PATTERN, (match) => {
		codeText += `\n${match}`;
		return " ";
	});
	return { prose, hadCode: codeText.trim().length > 0, codeText };
}

function detectToolName(text: string, tools: string[]): string | undefined {
	for (const tool of tools.sort((a, b) => b.length - a.length)) {
		const escaped = escapeRegExp(tool);
		if (new RegExp(`(?:^|[^\\p{L}\\p{N}_])${escaped}(?:\\s*\\(|(?=$|[^\\p{L}\\p{N}_]))`, "iu").test(text)) return tool;
	}
	return undefined;
}

function toolNameIndex(text: string, tool: string | undefined): number | undefined {
	if (!tool) return undefined;
	const escaped = escapeRegExp(tool);
	const match = new RegExp(`(?:^|[^\\p{L}\\p{N}_])(${escaped})(?:\\s*\\(|(?=$|[^\\p{L}\\p{N}_]))`, "iu").exec(text);
	if (!match || match.index < 0) return undefined;
	return match.index + Math.max(0, match[0].indexOf(match[1]));
}

function nearbyIntent(actionMatch: RegExpExecArray | undefined | null, objectIndex: number | undefined, maxDistance = 120): boolean {
	if (!actionMatch || objectIndex === undefined) return false;
	const actionIndex = actionMatch.index + Math.max(0, actionMatch[0].indexOf(actionMatch[1]));
	return Math.abs(actionIndex - objectIndex) <= maxDistance;
}

function detectCallExpression(text: string, tools: string[]): string | undefined {
	for (const tool of tools.sort((a, b) => b.length - a.length)) {
		if (new RegExp(`(?:^|[^\\p{L}\\p{N}_])${escapeRegExp(tool)}\\s*\\(`, "iu").test(text)) return tool;
	}
	return undefined;
}

function detectNamedToolObject(text: string, vocab: ToolIntentVocabulary): string | undefined {
	const nounAlternation = vocab.toolNouns.map(escapeRegExp).join("|");
	if (!nounAlternation) return undefined;
	const match = new RegExp(`(?:${nounAlternation})\\s+([A-Za-z_][\\w.-]*)`, "iu").exec(text);
	const candidate = match?.[1];
	if (!candidate) return undefined;
	const reserved = new Set([
		...vocab.actionVerbs,
		...vocab.toolNouns,
		...vocab.explanationMarkers,
		...vocab.futureMarkers,
			"is",
			"are",
			"was",
			"were",
		]);
	return reserved.has(candidate.toLowerCase()) ? undefined : candidate;
}

function snippet(text: string): string {
	return text.replace(/\s+/g, " ").trim().slice(0, 180);
}

function hasExplanationOnly(text: string, vocab: ToolIntentVocabulary): boolean {
	const explanation = wordPattern(vocab.explanationMarkers);
	if (!explanation?.test(text)) return false;
	const action = wordPattern(vocab.actionVerbs);
	return !action?.test(text);
}

export function detectToolIntent(message: any, options: DetectToolIntentOptions = {}): ToolIntentDetection {
	const locale = normalizeLocale(options.locale);
	const vocab = loadToolIntentVocabulary(locale, options.vocabulary);
	const tools = unique([...(options.registeredTools ?? []), ...DEFAULT_TOOLS]);
	if (hasStructuredToolCalls(message)) {
		return {
			kind: "structured-call-present",
			confidence: "high",
			locale,
			vocabularyLocale: vocab.locale,
			reasonCode: "structured_tool_calls",
			evidence: { registeredToolMatched: true },
		};
	}

	const text = extractMessageText(message);
	if (!text.trim()) {
		return { kind: "none", confidence: "high", locale, vocabularyLocale: vocab.locale, reasonCode: "no_tool_intent" };
	}

	const { prose, hadCode, codeText } = stripCode(text);
	const clean = prose.trim();
	const codeOnlyTool = hadCode && !clean && (
		detectCallExpression(codeText, tools)
		|| /(?:^|[^\p{L}\p{N}_])(?:tool_call|function\s*call)(?=$|[^\p{L}\p{N}_])/iu.test(codeText)
		|| /"name"\s*:\s*"[A-Za-z_][\w.-]*"/.test(codeText)
	);
	if (codeOnlyTool) {
		return {
			kind: "example-or-schema",
			confidence: "high",
			locale,
			vocabularyLocale: vocab.locale,
			toolName: typeof codeOnlyTool === "string" ? codeOnlyTool : undefined,
			reasonCode: "code_block_only",
			evidence: { codeBlockOnly: true },
		};
	}

	if (!clean) return { kind: "none", confidence: "high", locale, vocabularyLocale: vocab.locale, reasonCode: "no_tool_intent" };

	const callExprTool = detectCallExpression(clean, tools);
	const actionPattern = wordPattern(vocab.actionVerbs);
	const nounPattern = wordPattern(vocab.toolNouns);
	const futurePattern = wordPattern(vocab.futureMarkers);
	const actionMatch = actionPattern?.exec(clean);
	const nounMatch = nounPattern?.exec(clean);
	const explicitTool = detectToolName(clean, tools) ?? detectNamedToolObject(clean, vocab);
	const explicitToolIndex = toolNameIndex(clean, explicitTool);
	const nounIndex = nounMatch ? nounMatch.index + Math.max(0, nounMatch[0].indexOf(nounMatch[1])) : undefined;

	if (hasExplanationOnly(clean, vocab)) {
		return {
			kind: "example-or-schema",
			confidence: "high",
			locale,
			vocabularyLocale: vocab.locale,
			toolName: explicitTool,
			reasonCode: "example_context",
			evidence: { proseSnippet: snippet(clean), registeredToolMatched: Boolean(explicitTool) },
		};
	}

	if (actionMatch && explicitTool && nearbyIntent(actionMatch, explicitToolIndex)) {
		return {
			kind: "imminent-tool-call",
			confidence: "high",
			locale,
			vocabularyLocale: vocab.locale,
			toolName: explicitTool,
			expectedToolNames: [explicitTool],
			matchedAction: actionMatch[1],
			matchedObject: explicitTool,
			reasonCode: "imperative_tool_action",
			evidence: { proseSnippet: snippet(clean), registeredToolMatched: true },
		};
	}

	if (actionMatch && nounMatch && nearbyIntent(actionMatch, nounIndex, 80) && futurePattern?.test(clean)) {
		return {
			kind: "imminent-tool-call",
			confidence: "medium",
			locale,
			vocabularyLocale: vocab.locale,
			matchedAction: actionMatch[1],
			matchedObject: nounMatch[1],
			reasonCode: "imperative_tool_action",
			evidence: { proseSnippet: snippet(clean), registeredToolMatched: false },
		};
	}

	if (callExprTool) {
		return {
			kind: "imminent-tool-call",
			confidence: "medium",
			locale,
			vocabularyLocale: vocab.locale,
			toolName: callExprTool,
			expectedToolNames: [callExprTool],
			matchedObject: callExprTool,
			reasonCode: "call_expression",
			evidence: { proseSnippet: snippet(clean), registeredToolMatched: true },
		};
	}

	if (explicitTool && nounMatch) {
		return {
			kind: "tool-discussion",
			confidence: "medium",
			locale,
			vocabularyLocale: vocab.locale,
			toolName: explicitTool,
			matchedObject: explicitTool,
			reasonCode: "no_tool_intent",
			evidence: { proseSnippet: snippet(clean), registeredToolMatched: true },
		};
	}

	return { kind: "none", confidence: "high", locale, vocabularyLocale: vocab.locale, reasonCode: "no_tool_intent" };
}

export function extractUserIntentText(input: any): string {
	if (typeof input === "string") return input;
	if (!input || typeof input !== "object") return "";
	const directMessageText = extractMessageText(input);
	if (directMessageText.trim()) return directMessageText;
	const candidates = [
		input.prompt,
		input.text,
		input.input,
		input.message,
		input.userMessage,
		input.body?.prompt,
		input.body?.text,
		input.payload?.prompt,
		input.payload?.text,
	];
	for (const candidate of candidates) {
		if (typeof candidate === "string" && candidate.trim()) return candidate;
		if (candidate && typeof candidate === "object") {
			const text = extractMessageText(candidate);
			if (text.trim()) return text;
		}
	}
	return "";
}

function containsAny(text: string, words: string[], metaLabelWords: string[]): string | undefined {
	const metaLabelPattern = wordPattern(metaLabelWords);
	for (const word of words) {
		if (/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u.test(word) && text.includes(word)) return word;
		const escaped = escapeRegExp(word);
		const suffix = word.includes(" ") || word.length < 4 ? "" : "[\\p{L}\\p{N}_-]*";
		const match = new RegExp(`(?:^|[^\\p{L}\\p{N}_])(${escaped}${suffix})(?=$|[^\\p{L}\\p{N}_])`, "iu").exec(text);
		if (!match) continue;
		const wordStart = match.index + Math.max(0, match[0].indexOf(match[1]));
		const prefix = text.slice(Math.max(0, wordStart - 32), wordStart).toLowerCase();
		if (metaLabelPattern) {
			const labelMatch = metaLabelPattern.exec(prefix);
			if (labelMatch && prefix.slice(labelMatch.index + labelMatch[0].length).trim() === "") continue;
		}
		return word;
	}
	return undefined;
}

export function detectUserIntent(input: any, options: DetectToolIntentOptions = {}): UserIntentDetection {
	const locale = normalizeLocale(options.locale);
	const vocab = loadToolIntentVocabulary(locale, options.vocabulary);
	const tools = unique([...(options.registeredTools ?? []), ...DEFAULT_TOOLS]);
	const raw = extractUserIntentText(input);
	const text = stripCode(raw).prose.trim();
	if (!text) {
		return { kind: "general", confidence: "high", locale, vocabularyLocale: vocab.locale, reasonCode: "no_specific_intent" };
	}
	const explicitTool = detectToolName(text, tools) ?? detectNamedToolObject(text, vocab);
	const actionPattern = wordPattern(vocab.actionVerbs);
	const actionMatch = actionPattern?.exec(text);
	if (actionMatch && explicitTool) {
		return {
			kind: "tool-request",
			confidence: "high",
			locale,
			vocabularyLocale: vocab.locale,
			toolName: explicitTool,
			matchedAction: actionMatch[1],
			reasonCode: "explicit_tool_request",
			evidence: { proseSnippet: snippet(text), registeredToolMatched: true },
		};
	}
	const pruneWord = containsAny(text, vocab.userPruneWords, vocab.metaLabelWords);
	if (pruneWord) {
		return { kind: "prune-request", confidence: "high", locale, vocabularyLocale: vocab.locale, matchedAction: pruneWord, reasonCode: "prune_request", evidence: { proseSnippet: snippet(text) } };
	}
	const searchWord = containsAny(text, vocab.userSearchWords, vocab.metaLabelWords);
	if (searchWord) {
		return { kind: "search", confidence: "medium", locale, vocabularyLocale: vocab.locale, matchedAction: searchWord, reasonCode: "search_request", evidence: { proseSnippet: snippet(text) } };
	}
	const analyzeWord = containsAny(text, vocab.userAnalyzeWords, vocab.metaLabelWords);
	if (analyzeWord) {
		return { kind: "analyze", confidence: "medium", locale, vocabularyLocale: vocab.locale, matchedAction: analyzeWord, reasonCode: "analysis_request", evidence: { proseSnippet: snippet(text) } };
	}
	const rememberWord = containsAny(text, vocab.userRememberWords, vocab.metaLabelWords);
	if (rememberWord) {
		return { kind: "save-memory", confidence: "medium", locale, vocabularyLocale: vocab.locale, matchedAction: rememberWord, reasonCode: "save_memory_request", evidence: { proseSnippet: snippet(text) } };
	}
	const diagnoseWord = containsAny(text, vocab.userDiagnoseWords, vocab.metaLabelWords);
	if (diagnoseWord) {
		return { kind: "diagnose", confidence: "medium", locale, vocabularyLocale: vocab.locale, matchedAction: diagnoseWord, reasonCode: "diagnose_request", evidence: { proseSnippet: snippet(text) } };
	}
	return { kind: "general", confidence: "high", locale, vocabularyLocale: vocab.locale, reasonCode: "no_specific_intent", evidence: { proseSnippet: snippet(text) } };
}

export function detectUserIntentMultilingual(input: any, options: DetectToolIntentOptions = {}): UserIntentDetection {
	const primary = detectUserIntent(input, options);
	if (primary.kind !== "general") return primary;
	const tried = new Set(localeFallbackChain(options.locale));
	for (const locale of I18N_LOCALES) {
		if (tried.has(locale)) continue;
		const detection = detectUserIntent(input, { ...options, locale });
		if (detection.kind !== "general") return detection;
	}
	return primary;
}

export function createToolIntentState(): ToolIntentState {
	return {
		pending: [],
		recent: [],
		lastUserIntent: undefined,
		lastUserIntentNudgeKey: undefined,
		persistedUserIntentNudgeKey: undefined,
		persistedToolIntentNudgeKeys: [],
		persistedGuidanceKeys: [],
		guidanceRecords: [],
		deliveredGuidanceKey: undefined,
		contextGuidanceKey: undefined,
		lastUserInputHash: undefined,
		stats: {
			detected: 0,
			matched: 0,
			unmatched: 0,
			suppressed: 0,
			nudges: 0,
			userNudges: 0,
			nudgeSuppressedDuplicate: 0,
			nudgeChars: 0,
		},
		nudgeGate: { recentDedupeKeys: [] },
	};
}

export function recordToolIntentDetection(intentState: ToolIntentState, detection: ToolIntentDetection, turnIndex: number, now = Date.now()): PendingToolIntent | undefined {
	if (detection.kind === "structured-call-present") {
		reconcileToolIntentWithCall(intentState, detection.toolName, undefined);
		return undefined;
	}
	if (detection.kind === "example-or-schema" || detection.kind === "tool-discussion") {
		intentState.stats.suppressed++;
		intentState.recent.unshift({
			id: `intent-${turnIndex}-${now}-${intentState.stats.detected}`,
			turnIndex,
			detection,
			outcome: "suppressed",
		});
		intentState.recent = intentState.recent.slice(0, 20);
		return undefined;
	}
	if (detection.kind !== "imminent-tool-call") return undefined;
	intentState.stats.detected++;
	const pending: PendingToolIntent = {
		id: `intent-${turnIndex}-${now}-${intentState.stats.detected}`,
		turnIndex,
		detection,
		createdAt: now,
	};
	intentState.pending.push(pending);
	intentState.pending = intentState.pending.slice(-10);
	intentState.recent.unshift({ id: pending.id, turnIndex, detection, outcome: "unmatched" });
	intentState.recent = intentState.recent.slice(0, 20);
	return pending;
}

export function reconcileToolIntentWithCall(intentState: ToolIntentState, toolName?: string, toolCallId?: string): boolean {
	const index = intentState.pending.findIndex((pending) => {
		const expected = pending.detection.expectedToolNames ?? (pending.detection.toolName ? [pending.detection.toolName] : []);
		return expected.length === 0 || !toolName || expected.includes(toolName);
	});
	if (index < 0) return false;
	const [matched] = intentState.pending.splice(index, 1);
	if (!matched) return false;
	intentState.stats.matched++;
	intentState.recent.unshift({
		id: matched.id,
		turnIndex: matched.turnIndex,
		detection: matched.detection,
		matchedToolCallId: toolCallId,
		outcome: "matched",
	});
	intentState.recent = intentState.recent.slice(0, 20);
	return true;
}

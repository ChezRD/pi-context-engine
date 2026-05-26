import type { GuidanceRecord, PendingToolIntent, ToolIntentState, UserIntentDetection } from "./tool-intent.ts";

function truncateWithClosingMarker(text: string, maxChars: number, closingMarker: string): string {
	if (text.length <= maxChars) return text;
	const suffix = `\n${closingMarker}`;
	if (maxChars <= suffix.length) return text.slice(0, maxChars);
	return `${text.slice(0, maxChars - suffix.length).trimEnd()}${suffix}`;
}

export function buildUserIntentNudge(userIntent: UserIntentDetection, maxChars = 700): string {
	if (userIntent.kind === "general") return "";
	const matched = userIntent.matchedAction ?? userIntent.toolName;
	const evidence = matched ? `matched_signal: ${matched}\n` : "";
	const policy = userIntent.kind === "analyze"
		? [
			"start your FIRST response by stating which intent you detected and how you plan to approach it",
			"when asked for exact data, use a tool to get the authoritative answer — do not approximate when a tool can give exact data",
			"classify evidence before claims: strong (full output, clean exit) / weak (grep, slices, truncated, partial output)",
			"weak or partial evidence → no definitive or exhaustive claims",
			"before planning, run the authoritative source-of-truth command for the domain: test runner for test counts, coverage tool for coverage",
			"uncertain or partial data → carry that uncertainty into the answer",
			"when a command output may be truncated, extract just the last 5 lines (tail -5) or grep for the summary line",
			"when partial data from different sources conflicts, run the authoritative command — partial slices are weak evidence, never sufficient for a definitive count",
			"final: separate proven vs weak signals vs unknowns",
		]
		: userIntent.kind === "search"
			? [
				"hits prove presence only",
				"claim absence only when the searched scope is exhaustive and the command completed cleanly",
			]
			: userIntent.kind === "prune-request"
				? [
					"report what changed, what remains pending, and any cache-cost tradeoff",
				]
				: userIntent.kind === "save-memory"
					? [
						"user wants to persist explicit information — use context_pin to save it",
						"pinned content survives session folds and reappears in later turns",
						"pin only concrete facts, directives, or decisions the user explicitly asked to remember",
						"do NOT pin: intermediate work, task status, or things derivable from code",
					]
					: userIntent.kind === "diagnose"
					? [
						"This is a diagnostic investigation request.",
						"Do NOT assume anything is pre-existing — verify everything.",
						"Errors, warnings, or unexpected behavior must be traced to their root cause.",
						"When you encounter something that looks like it might be pre-existing or irrelevant, explicitly ask the user whether to investigate it further.",
						"If the user is aggressive, writes in ALL CAPS, or repeatedly insists something cannot be pre-existing — immediately use context_pin to record that this diagnostic finding is guaranteed NOT pre-existing and the model must focus on solving per user request.",
						"After pinning, do not revisit the question — focus on the solution the user asked for.",
					]
					: [
					"call the required tool through the structured tool interface before claiming its result",
				];
	const text = `<!-- pi-context-engine: user intent -->
intent: ${userIntent.kind}
confidence: ${userIntent.confidence}
reason: ${userIntent.reasonCode}
${evidence}rules:
- ${policy.join("\n- ")}
<!-- /pi-context-engine: user intent -->`;
	return truncateWithClosingMarker(text, maxChars, "<!-- /pi-context-engine: user intent -->");
}

export function buildToolIntentNudge(pending: PendingToolIntent, maxChars = 500, userIntent?: UserIntentDetection): string {
	const tool = pending.detection.toolName ? `\`${pending.detection.toolName}\`` : "the intended tool";
	const userLine = userIntent && userIntent.kind !== "general" ? `Latest user intent: ${userIntent.kind}.\n` : "";
	const text = `<!-- pi-context-engine: intent nudge -->
Detected pending tool intent: ${pending.detection.kind}.
${userLine}
Meaning: your previous assistant message described using ${tool}, but no structured tool call was emitted.
Next step: if you still need that data, call the tool now through the structured tool interface. If not, continue without claiming a tool result.
Do not describe a tool call as completed unless a tool result is present.
<!-- /pi-context-engine: intent nudge -->`;
	return truncateWithClosingMarker(text, maxChars, "<!-- /pi-context-engine: intent nudge -->");
}

export function buildGuidanceProjection(records: GuidanceRecord[], maxChars = 900): string {
	const active = records.filter((record) => record.active);
	if (active.length === 0) return "";
	const lines = [
		"<!-- pi-context-engine: guidance -->",
		"source: detect-intention",
	];
	const shown = active.slice(-4);
	for (const record of shown) {
		lines.push(`- ${record.kind}: ${record.intentKind}; confidence=${record.confidence}; reason=${record.reasonCode}${record.matchedSignal ? `; matched=${record.matchedSignal}` : ""}${record.toolName ? `; tool=${record.toolName}` : ""}`);
	}
	lines.push("rules:");
	for (const record of shown) {
		for (const line of record.content.split("\n")) {
			if (/^\s*-\s+/.test(line)) lines.push(`  ${line.trim()}`);
		}
	}
	lines.push("<!-- /pi-context-engine: guidance -->");
	const text = lines.join("\n");
	return truncateWithClosingMarker(text, maxChars, "<!-- /pi-context-engine: guidance -->");
}

export function userIntentNudgeKey(userIntent: UserIntentDetection): string {
	return `user:${userIntent.kind}:${userIntent.reasonCode}:${userIntent.evidence?.proseSnippet ?? ""}`;
}

export function upsertUserIntentGuidance(intentState: ToolIntentState, userIntent: UserIntentDetection, turnIndex: number): GuidanceRecord | undefined {
	if (userIntent.kind === "general") return undefined;
	const content = buildUserIntentNudge(userIntent, 1100);
	if (!content) return undefined;
	const stableKey = userIntentNudgeKey(userIntent);
	const existing = intentState.guidanceRecords.find((record) => record.stableKey === stableKey);
	const record: GuidanceRecord = {
		version: 1,
		kind: "user-intent",
		stableKey,
		content,
		createdTurn: existing?.createdTurn ?? turnIndex,
		updatedTurn: turnIndex,
		confidence: userIntent.confidence,
		intentKind: userIntent.kind,
		reasonCode: userIntent.reasonCode,
		matchedSignal: userIntent.matchedAction ?? userIntent.toolName,
		toolName: userIntent.toolName,
		active: true,
		sourceEvent: "user_input",
	};
	intentState.guidanceRecords = [record, ...intentState.guidanceRecords.filter((item) => item.stableKey !== stableKey)].slice(0, 20);
	return record;
}

export function upsertToolIntentGuidance(intentState: ToolIntentState, pending: PendingToolIntent, userIntent: UserIntentDetection | undefined, turnIndex: number): GuidanceRecord | undefined {
	const content = buildToolIntentNudge(pending, 700, userIntent);
	if (!content) return undefined;
	const stableKey = toolIntentNudgeKey(pending);
	const existing = intentState.guidanceRecords.find((record) => record.stableKey === stableKey);
	const record: GuidanceRecord = {
		version: 1,
		kind: "tool-intent",
		stableKey,
		content,
		createdTurn: existing?.createdTurn ?? turnIndex,
		updatedTurn: turnIndex,
		confidence: pending.detection.confidence,
		intentKind: pending.detection.kind,
		reasonCode: pending.detection.reasonCode,
		matchedSignal: pending.detection.matchedAction ?? pending.detection.matchedObject,
		toolName: pending.detection.toolName,
		active: true,
		sourceEvent: "assistant_message",
	};
	intentState.guidanceRecords = [record, ...intentState.guidanceRecords.filter((item) => item.stableKey !== stableKey)].slice(0, 20);
	return record;
}

export function deactivateToolIntentGuidance(intentState: ToolIntentState, pending: PendingToolIntent): void {
	const stableKey = toolIntentNudgeKey(pending);
	const record = intentState.guidanceRecords.find((item) => item.stableKey === stableKey);
	if (record) record.active = false;
}

export function toolIntentNudgeKey(pending: PendingToolIntent, sessionId = "default"): string {
	return `${sessionId}:${pending.id}:${pending.detection.toolName ?? ""}:${pending.detection.reasonCode}`;
}

export function reserveUserIntentNudge(intentState: ToolIntentState, userIntent: UserIntentDetection, sessionId = "default", now = Date.now(), holdMs = 2_000): boolean {
	if (userIntent.kind === "general") return false;
	const dedupeKey = userIntentNudgeKey(userIntent);
	if (intentState.lastUserIntentNudgeKey === dedupeKey) {
		intentState.stats.nudgeSuppressedDuplicate++;
		return false;
	}
	const active = intentState.nudgeGate.active;
	if (active && active.expiresAt > now && active.dedupeKey === dedupeKey) {
		intentState.stats.nudgeSuppressedDuplicate++;
		return false;
	}
	intentState.nudgeGate.active = { sessionId, dedupeKey, source: "user-intent-nudge", expiresAt: now + holdMs };
	intentState.lastUserIntentNudgeKey = dedupeKey;
	return true;
}

export function reserveToolIntentNudge(intentState: ToolIntentState, pending: PendingToolIntent, sessionId = "default", now = Date.now(), holdMs = 2_000): boolean {
	const dedupeKey = toolIntentNudgeKey(pending, sessionId);
	const active = intentState.nudgeGate.active;
	if (active && active.expiresAt > now) {
		intentState.stats.nudgeSuppressedDuplicate++;
		return false;
	}
	if (intentState.nudgeGate.recentDedupeKeys.includes(dedupeKey)) {
		intentState.stats.nudgeSuppressedDuplicate++;
		return false;
	}
	intentState.nudgeGate.active = { sessionId, dedupeKey, source: "tool-intent-nudge", expiresAt: now + holdMs };
	intentState.nudgeGate.recentDedupeKeys.unshift(dedupeKey);
	intentState.nudgeGate.recentDedupeKeys = intentState.nudgeGate.recentDedupeKeys.slice(0, 20);
	pending.nudged = true;
	return true;
}

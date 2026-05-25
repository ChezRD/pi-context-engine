import type { PendingToolIntent, ToolIntentState, UserIntentDetection } from "./tool-intent.ts";

export function buildToolIntentNudge(pending: PendingToolIntent, maxChars = 500, userIntent?: UserIntentDetection): string {
	const tool = pending.detection.toolName ? `\`${pending.detection.toolName}\`` : "the intended tool";
	const userLine = userIntent && userIntent.kind !== "general" ? `Latest user intent: ${userIntent.kind}.\n` : "";
	const text = `[pi-context-engine intent nudge]
Detected pending tool intent: ${pending.detection.kind}.
${userLine}
Meaning: your previous assistant message described using ${tool}, but no structured tool call was emitted.
Next step: if you still need that data, call the tool now through the structured tool interface. If not, continue without claiming a tool result.
Do not describe a tool call as completed unless a tool result is present.
[/pi-context-engine intent nudge]`;
	return text.length <= maxChars ? text : text.slice(0, Math.max(0, maxChars - 1)).trimEnd();
}

export function reserveToolIntentNudge(intentState: ToolIntentState, pending: PendingToolIntent, sessionId = "default", now = Date.now(), holdMs = 2_000): boolean {
	const dedupeKey = `${sessionId}:${pending.id}:${pending.detection.toolName ?? ""}:${pending.detection.reasonCode}`;
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

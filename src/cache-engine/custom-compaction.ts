import { createHash } from "node:crypto";
import type { ExtensionConfig } from "../config.ts";
import type { RuntimeState } from "../runtime-state.ts";
import { buildEffectiveFoldGuidance } from "../projection/history-folder.ts";

export function simpleHash(input: string): string {
	return createHash("sha256").update(input).digest("hex");
}

export function estimateTokens(value: unknown): number {
	if (value === undefined || value === null) return 0;
	const text = typeof value === "string" ? value : JSON.stringify(value);
	return Math.max(0, Math.round(text.length / 4));
}

export function foldInstructions(config: ExtensionConfig, state?: RuntimeState): string {
	const guidance = state ? buildEffectiveFoldGuidance(state.engine.toolIntent?.lastUserIntent) : buildEffectiveFoldGuidance();
	return [
		"pi-context-engine fold: preserve current task state, file decisions, constraints, and recent turns. Summarize older completed work compactly.",
		`Preferred summary model/profile: ${config.foldSummaryModel}.`,
		"",
		guidance,
	].join("\n");
}

export function compactOptions(config: ExtensionConfig, _ctx: any, state?: RuntimeState): Record<string, unknown> {
	return { customInstructions: config.autoFold ? foldInstructions(config, state) : undefined };
}

export function maybeAdjustCutForCache(_entries: any[], _cutIndex: number, _foldTailPct: number): string | undefined {
	// Plan vLatest: default strategy must not override session_before_compact.
	// Boundary helpers stay for diagnostics/tests but host compaction owns summaries.
	return undefined;
}

export function handleSessionBeforeCompact(_event: any, _ctx: any, state: { config: ExtensionConfig }): any | undefined {
	if (!state.config.enabled) return undefined;
	const preparation = _event?.preparation;
	const summarizedCount = Array.isArray(preparation?.messagesToSummarize) ? preparation.messagesToSummarize.length : undefined;
	const splitPrefixCount = Array.isArray(preparation?.turnPrefixMessages) ? preparation.turnPrefixMessages.length : undefined;
	if (summarizedCount === 0 && splitPrefixCount === 0) return { cancel: true };
	return undefined;
}

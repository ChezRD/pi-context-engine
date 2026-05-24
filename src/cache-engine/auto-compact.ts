import type { RuntimeState } from "../runtime-state.ts";
import { costToCompact, deepSeekOfficialCost, formatRatio } from "../stats.ts";
import { buildContextStatus } from "./decision-engine.ts";
import { compactOptions } from "./custom-compaction.ts";
import { activateAppendOnlyProjectionFromCompact } from "./append-only-projection.ts";
import { markCompaction } from "../stats.ts";
import { t } from "../i18n/index.ts";

function notify(ctx: any, text: string, level: "info" | "warning" | "error" = "warning"): void {
	ctx?.ui?.notify?.(text, level);
}

export function requestFold(ctx: any, state: RuntimeState): { ok: true } | { ok: false; error: string } {
	if (typeof ctx?.compact !== "function") return { ok: false, error: t("engine.compactUnavailable") };
	try {
		ctx.compact({
			...compactOptions({ ...state.config, autoFold: true }, ctx),
			onComplete: (result: any) => {
				state.stats = markCompaction(state.stats, { turn: state.engine.turnIndex, reason: "auto", completed: true });
				activateAppendOnlyProjectionFromCompact(result, state);
				notify(ctx, t("engine.foldComplete"), "info");
			},
			onError: (error: Error) => {
				state.stats = markCompaction(state.stats, { turn: state.engine.turnIndex, reason: "auto", completed: false, error: error.message });
				notify(ctx, t("engine.foldFailed", { error: error.message }), "error");
			},
		});
	} catch (error) {
		return { ok: false, error: error instanceof Error ? error.message : String(error) };
	}
	state.engine.lastCompactTurn = state.engine.turnIndex;
	state.engine.compactCount++;
	return { ok: true };
}

export function requestCompact(ctx: any, state: RuntimeState): { ok: true } | { ok: false; error: string } {
	if (typeof ctx?.compact !== "function") return { ok: false, error: t("engine.compactUnavailable") };
	try {
		ctx.compact({
			onComplete: (result: any) => {
				state.stats = markCompaction(state.stats, { turn: state.engine.turnIndex, reason: "manual", completed: true });
				activateAppendOnlyProjectionFromCompact(result, state);
				notify(ctx, t("engine.compactComplete"), "info");
			},
			onError: (error: Error) => {
				state.stats = markCompaction(state.stats, { turn: state.engine.turnIndex, reason: "manual", completed: false, error: error.message });
				notify(ctx, t("engine.compactFailed", { error: error.message }), "error");
			},
		});
	} catch (error) {
		return { ok: false, error: error instanceof Error ? error.message : String(error) };
	}
	state.engine.lastCompactTurn = state.engine.turnIndex;
	state.engine.compactCount++;
	return { ok: true };
}

export function holdCompaction(state: RuntimeState, turns = state.config.minTurnsBetweenCompacts): void {
	state.engine.holdUntilTurn = state.engine.turnIndex + Math.max(1, turns);
	state.engine.lastDecision = "hold";
}

function estimateCompactMissCost(state: RuntimeState): number {
	const usage = state.stats.last ?? { input: state.stats.input, cacheRead: state.stats.cacheRead, cacheWrite: state.stats.cacheWrite };
	return costToCompact(usage, deepSeekOfficialCost(state.detection.modelId));
}

function choiceText(state: RuntimeState, status: ReturnType<typeof buildContextStatus>): string {
	const pct = status.ratio === undefined ? t("status.unknown") : `${Math.round(status.ratio * 100)}%`;
	const hit = formatRatio(status.hitRate);
	const turns = status.turnsToOverflow === undefined ? t("status.unknown") : `~${status.turnsToOverflow}`;
	return t("engine.notify.choice", { pct, hit, turns, saved: state.stats.savings.toFixed(4), compact: estimateCompactMissCost(state).toFixed(4) });
}

export function handleTurnEnd(pi: any, ctx: any, state: RuntimeState): void {
	if (!state.config.enabled) return;
	const status = buildContextStatus(ctx, state.stats, state.config);
	state.engine.lastZone = status.zone;
	state.engine.lastDecision = status.decision;
	if (state.engine.holdUntilTurn !== undefined && state.engine.turnIndex < state.engine.holdUntilTurn && status.decision !== "force_fold") return;
	if (status.zone === "orange" || status.zone === "red" || status.zone === "critical") notify(ctx, choiceText(state, status), "warning");
}

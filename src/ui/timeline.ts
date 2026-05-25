/**
 * Context Timeline tool — ASCII tree of session history.
 * Ported from ttttmr/pi-context.
 */
import { Type } from "typebox";
import type { Static } from "typebox";
import { t } from "../i18n/index.ts";
import type { RuntimeState } from "../runtime-state.ts";

function formatTokens(n: number): string {
	if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
	if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
	return String(n);
}

function estimateTokens(text: string): number {
	return Math.ceil((text?.length ?? 0) / 4);
}

function getMsgContent(entry: any): string {
	const msg = entry.message;
	if (!msg) return "";
	if (typeof msg.content === "string") return msg.content;
	if (Array.isArray(msg.content)) {
		return msg.content
			.filter((p: any) => p.type === "text")
			.map((p: any) => p.text)
			.join(" ");
	}
	return JSON.stringify(msg.content).slice(0, 200);
}

export async function buildTimeline(pi: any, ctx: any, opts: { limit?: number; verbose?: boolean }, state?: RuntimeState): Promise<string> {
	const sm = ctx.sessionManager;
	if (!sm) return t("tool.timeline.error.noSession");

	const branch = sm.getBranch?.() ?? [];
	const tree = sm.getTree?.() ?? [];
	const currentLeafId = sm.getLeafId?.();
	const limit = opts.limit ?? 50;
	const verbose = opts.verbose ?? false;

	const lines: string[] = [];
	let hiddenCount = 0;

	for (let i = 0; i < branch.length; i++) {
		const entry = branch[i];
		if (i === 0 || i === branch.length - 1) {
			// always show root + head
		} else if (!verbose && entry.type === "message" && entry.message?.role === "assistant") {
			// Check if this assistant message has tool calls
			const hasToolCalls = Array.isArray(entry.message.tool_calls) && entry.message.tool_calls.length > 0;
			if (hasToolCalls) {
				hiddenCount++;
				continue;
			}
			// Check if it's a pure text assistant message (keep these)
		}

		if (lines.length >= limit) {
			lines.push(`  :  ... (truncated at ${limit} entries)`);
			break;
		}

		const isHead = entry.id === currentLeafId;
		const label = sm.getLabel?.(entry.id);
		const content = getMsgContent(entry).replace(/\s+/g, " ").slice(0, 100);

		// Find cache checkpoints aligned to this entry
		const cacheCps = state?.engine.checkpoints?.filter((cp) => cp.conversationEntryId === entry.id || (cp.turn === (entry.turnIndex ?? -1) && cp.reason !== "session_start")) ?? [];
		const cacheMarker = cacheCps.length > 0
			? ` ${t("tool.timeline.cachePrefix")}: ${cacheCps.map((cp) => {
					const idx = state?.engine.checkpoints.indexOf(cp);
					return `#${idx !== undefined && idx >= 0 ? idx + 1 : "?"} ${cp.reason}`;
				}).join(", ")}`
			: "";

		let role = entry.type?.toUpperCase() ?? "?";
		if (entry.type === "message") {
			const m = entry.message;
			if (m?.role === "assistant") role = "AI";
			else if (m?.role === "user") role = "USER";
			else if (m?.role === "tool" || m?.role === "toolResult") role = "TOOL";
			else if (m?.role === "bash" || m?.role === "bashExecution") role = "BASH";
			else role = m?.role?.toUpperCase() ?? "?";
		} else if (entry.type === "branch_summary" || entry.type === "compaction") {
			role = "SUMMARY";
		}

		const id = entry.id ?? "?";
		const isRoot = branch.length > 0 && entry.id === branch[0].id;
		const meta = [isRoot ? t("tool.timeline.root") : null, isHead ? t("tool.timeline.head") : null, label ? t("tool.timeline.checkpointLabel", { label }) : null, cacheMarker || null]
			.filter(Boolean).join(", ");

		const body = content.length > 100 ? content.slice(0, 100) + "..." : content;
		const marker = isHead ? "*" : (role === "USER" ? "•" : "|");

		lines.push(`${marker} ${id}${meta ? ` (${meta})` : ""} [${role}] ${body}`);
	}

	if (hiddenCount > 0) {
		lines.push(`  :  ... (${hiddenCount} hidden messages) ...`);
	}

	// Context HUD
	const usage = await ctx.getContextUsage?.();
	let usageStr = "Unknown";
	if (usage?.percent != null && usage?.tokens != null && usage?.contextWindow != null) {
		usageStr = `${usage.percent.toFixed(1)}% (${formatTokens(usage.tokens)}/${formatTokens(usage.contextWindow)})`;
	}

	let stepsSinceCheckpoint = 0;
	let nearestCheckpointName = "None";
	for (let i = branch.length - 1; i >= 0; i--) {
		const label = sm.getLabel?.(branch[i].id);
		if (label) {
			nearestCheckpointName = label;
			break;
		}
		stepsSinceCheckpoint++;
	}

	// Cache checkpoint summary
	let cacheHud = "";
	if (state && state.engine.checkpoints.length > 1) {
		const latestCps = state.engine.checkpoints.slice(-3);
		cacheHud = latestCps.map((cp) => {
			const label = cp.conversationLabel ? ` "${cp.conversationLabel}"` : "";
			const modelChange = cp.previousModelId && cp.modelId && cp.previousModelId !== cp.modelId ? ` ${cp.previousModelId}→${cp.modelId}` : "";
			return `#${state.engine.checkpoints.indexOf(cp) + 1} ${cp.reason}${label}@${cp.turn}${modelChange}`;
		}).join(" | ");
	}

	const hud = [
		`[Context Dashboard]`,
		`• Context Usage:    ${usageStr}`,
		`• Segment Size:     ${stepsSinceCheckpoint} steps since last checkpoint '${nearestCheckpointName}'`,
		cacheHud ? `${t("tool.timeline.cacheHud")} ${cacheHud}` : null,
		`---------------------------------------------------`,
	].filter(Boolean).join("\n");

	return hud + "\n" + (lines.join("\n") || "(Root Path Only)");
}

export function registerTimelineTool(input: any): void {
	const pi = input?.pi ?? input;
	const getState: (() => RuntimeState) | undefined = input?.getState;
	const TimelineParams = Type.Object({
		limit: Type.Optional(Type.Number({ description: t("tool.timeline.param.limit") })),
		verbose: Type.Optional(Type.Boolean({ description: t("tool.timeline.param.verbose") })),
	});

	pi.registerTool?.({
		name: "context_timeline",
		label: t("tool.timeline.label"),
		description: t("tool.timeline.longDescription"),
		parameters: TimelineParams,
		async execute(_id: string, params: Static<typeof TimelineParams>, _signal: any, _onUpdate: any, ctx: any) {
			const text = await buildTimeline(pi, ctx, {
				limit: params.limit ?? 50,
				verbose: params.verbose ?? false,
			}, getState?.());
			return { content: [{ type: "text", text }], details: {} };
		},
	});
}

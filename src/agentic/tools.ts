/**
 * Agentic branching tools — context_checkpoint + context_rewind.
 * Ported from ttttmr/pi-context.
 */
import { Type } from "typebox";
import type { Static } from "typebox";
import { t } from "../i18n/index.ts";
import type { RuntimeState } from "../runtime-state.ts";
import { openCacheCheckpoint } from "../cache-engine/cache-checkpoints.ts";
import { buildModelVisibleContext } from "../model-visible.ts";

const ContextCheckpointParams = Type.Object({
	name: Type.String({ description: t("tool.checkpoint.param.name") }),
	target: Type.Optional(Type.String({ description: t("tool.checkpoint.param.target") })),
});

const ContextRewindParams = Type.Object({
	target: Type.String({ description: t("tool.rewind.param.target") }),
	message: Type.String({ description: t("tool.rewind.param.message") }),
	backupCheckpoint: Type.Optional(Type.String({ description: t("tool.rewind.param.backupCheckpoint") })),
});

function findLabelInTree(sm: any, checkpointName: string): string | null {
	const tree = sm.getTree?.() ?? [];
	const stack: any[] = [...tree];
	while (stack.length > 0) {
		const n = stack.pop()!;
		if (sm.getLabel?.(n.entry?.id) === checkpointName) return n.entry.id;
		if (n.children) stack.push(...n.children);
	}
	return null;
}

export function registerAgenticTools(pi: any, state?: { cacheState?: RuntimeState; rewindParams?: any; onRewind?: () => void }): void {
	const rewindState = state ?? { rewindParams: null };

	// ── context_checkpoint ──
	pi.registerTool?.({
		name: "context_checkpoint",
		label: t("tool.checkpoint.label"),
		description: t("tool.checkpoint.longDescription"),
		parameters: ContextCheckpointParams,
		async execute(_id: string, params: Static<typeof ContextCheckpointParams>, _signal: any, _onUpdate: any, ctx: any) {
			const sm = ctx.sessionManager;
			if (!sm) return { content: [{ type: "text", text: t("tool.checkpoint.error.noSession") }], details: {} };

			// Dedup check
			const existing = findLabelInTree(sm, params.name);
			if (existing) {
				return { content: [{ type: "text", text: t("tool.checkpoint.error.alreadyExists", { name: params.name, id: existing }) }], details: {} };
			}

			let id = params.target;
			if (id && !/^[0-9a-f]{8,}$/i.test(id)) {
				const resolved = findLabelInTree(sm, id);
				if (resolved) id = resolved;
			}
			if (!id) {
				const branch = sm.getBranch?.() ?? [];
				id = branch[branch.length - 1]?.id;
			}
			if (!id) return { content: [{ type: "text", text: t("tool.checkpoint.error.noTarget") }], details: {} };

			pi.setLabel?.(id, params.name);

			// Create linked cache checkpoint (does not start segment by default unless checkpointStartsSegment)
			const cacheState = state?.cacheState;
			if (cacheState) {
				openCacheCheckpoint(cacheState, "agent_checkpoint", {
					conversationEntryId: id,
					conversationLabel: params.name,
					note: `checkpoint: ${params.name}`,
				});
				cacheState.engine.prune.checkpointTriggered = true;
			}

			return { content: [{ type: "text", text: t("tool.checkpoint.created", { name: params.name, id }) }], details: { entryId: id } };
		},
	});

	// ── context_rewind ──
	pi.registerTool?.({
		name: "context_rewind",
		label: t("tool.rewind.label"),
		description: t("tool.rewind.longDescription"),
		parameters: ContextRewindParams,
		async execute(_id: string, params: Static<typeof ContextRewindParams>, _signal: any, _onUpdate: any, ctx: any) {
			const sm = ctx.sessionManager;
			if (!sm) return { content: [{ type: "text", text: t("tool.rewind.error.noSession") }], details: {} };

			// Resolve target
			let tid = params.target;
			if (!/^[0-9a-f]{8,}$/i.test(tid)) {
				const resolved = findLabelInTree(sm, tid);
				if (resolved) tid = resolved;
			}

			const currentLeaf = sm.getLeafId?.();
			if (currentLeaf === tid) {
				return { content: [{ type: "text", text: t("tool.rewind.error.alreadyAtTarget", { id: tid }) }], details: {} };
			}

			// Optional backup checkpoint
			if (params.backupCheckpoint && currentLeaf) {
				pi.setLabel?.(currentLeaf, params.backupCheckpoint);
			}

			const currentLabel = currentLeaf ? sm.getLabel?.(currentLeaf) : undefined;
			const origin = currentLabel ? `checkpoint: ${currentLabel}` : (currentLeaf ?? "unknown");
			const enrichedMessage = buildModelVisibleContext({
				kind: "context_rewind_summary",
				ui: "hidden",
				metadata: {
					reason: "continue_after_conversation_rewind",
					origin,
					target: params.target,
					backup_checkpoint: params.backupCheckpoint,
				},
				sections: [{ name: "carryover_summary", content: params.message }],
			});

			const nid = await sm.branchWithSummary?.(tid, enrichedMessage);
			if (!nid) return { content: [{ type: "text", text: t("tool.rewind.error.branchFailed") }], details: {} };

			// Create rewind cache checkpoint and start new segment (warmup)
			const cacheState = state?.cacheState;
			if (cacheState) {
				openCacheCheckpoint(cacheState, "rewind", {
					conversationEntryId: tid,
					conversationBranchId: nid,
					conversationLabel: params.target,
					note: `rewind to ${params.target}`,
					startSegment: true,
				});
			}

			// Store rewind params for agent_end handler
			rewindState.rewindParams = { nid, tid, enrichedMessage, targetName: params.target };

			return { content: [{ type: "text", text: t("tool.rewind.started") }], details: {} };
		},
	});

	// ── turn_end handler: abort after rewind ──
	pi.on?.("turn_end", async (_event: any, _ctx: any) => {
		if (!rewindState.rewindParams) return;
		// Signal abort — the agent_end handler will complete the rewind
	});

	// ── agent_end handler: navigate to new branch ──
	pi.on?.("agent_end", async (_event: any, ctx: any) => {
		const rp = rewindState.rewindParams;
		if (!rp) return;

		await ctx.navigateTree?.(rp.nid, { summarize: false });
		ctx.ui?.notify?.(
			t("tool.rewind.notify.detail", { target: rp.targetName, message: rp.enrichedMessage.slice(0, 200) }),
			"info",
		);

		rewindState.rewindParams = null;

		// Clear old prune state — invalid in the new timeline
		state?.onRewind?.();

		// Trigger next turn with summary context
		pi.sendMessage?.(
			{ customType: "context-rewind", content: rp.enrichedMessage, display: false },
			{ triggerTurn: true, streamingBehavior: "followUp" },
		);
	});
}

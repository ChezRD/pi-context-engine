import { openCacheCheckpoint } from "../cache-engine/cache-checkpoints.ts";
import type { RuntimeState } from "../runtime-state.ts";
import { markAwaitingPruneImpact } from "./prune-impact.ts";
import { pruneMessages } from "./pruner.ts";

export interface PruneRebuildResult {
	changed: boolean;
	messages: any[];
	prunableIds: string[];
	newlyApplied: string[];
	checkpointOpened: boolean;
	sourceMessages: number;
	outputMessages: number;
	savedApproxChars: number;
}

function asAssistantContent(content: any): any {
	if (Array.isArray(content)) return content;
	if (content == null) return [];
	if (typeof content === "string") return [{ type: "text", text: content }];
	if (typeof content?.text === "string" && typeof content?.type === "string") return [content];
	return [{ type: "text", text: String(content) }];
}

export function messagesFromBranch(branch: any[] | undefined): any[] {
	if (!Array.isArray(branch)) return [];
	const messages: any[] = [];
	for (const entry of branch) {
		if (entry?.type === "message" && entry.message) {
			messages.push(entry.message);
		} else if (entry?.type === "custom_message") {
			if (entry.customType === "context-engine-prune-summary") continue;
			messages.push({
				role: "custom",
				customType: entry.customType,
				content: asAssistantContent(entry.content),
				display: entry.display,
				details: entry.details,
				timestamp: entry.timestamp ? new Date(entry.timestamp).getTime() : Date.now(),
			});
		} else if (entry?.type === "branch_summary" && entry.summary) {
			messages.push({ role: "assistant", content: asAssistantContent(entry.summary), timestamp: entry.timestamp ? new Date(entry.timestamp).getTime() : Date.now() });
		} else if (entry?.type === "compaction" && entry.summary) {
			messages.push({ role: "assistant", content: asAssistantContent(entry.summary), timestamp: entry.timestamp ? new Date(entry.timestamp).getTime() : Date.now() });
		}
	}
	return messages;
}

export function collectPrunableToolResultIds(messages: any[], state: RuntimeState): string[] {
	const ids: string[] = [];
	for (const msg of messages) {
		if (msg?.role !== "tool" && msg?.role !== "toolResult") continue;
		const id = msg.toolCallId ?? msg.tool_call_id;
		if (id && state.toolIndexer.isSummarized(id)) ids.push(id);
	}
	return ids;
}

export function rebuildPrunedContext(messages: any[], state: RuntimeState, note?: string): PruneRebuildResult {
	const source = Array.isArray(messages) ? messages : [];
	const prunableIds = collectPrunableToolResultIds(source, state);
	const sourceChars = estimateMessagesChars(source);
	const pruned = state.toolIndexer.getAllSummarized().length > 0 ? pruneMessages(source, state.toolIndexer) : source;
	const outputChars = estimateMessagesChars(pruned);
	const newlyApplied = prunableIds.filter((id) => !state.engine.prune.appliedIds.includes(id));
	let checkpointOpened = false;

	if (newlyApplied.length > 0) {
		state.engine.prune.appliedIds.push(...newlyApplied);
		state.engine.prune.pruneRunCount++;
		state.engine.prune.pendingSummaries = [];
		markAwaitingPruneImpact(state, newlyApplied);
		openCacheCheckpoint(state, "prune", { startSegment: true, note: note ?? `${newlyApplied.length} tool results pruned` });
		checkpointOpened = true;
	}

	recordRebuildMetrics(state, {
		sourceMessages: source.length,
		outputMessages: pruned.length,
		prunableIds: prunableIds.length,
		newlyApplied: newlyApplied.length,
		checkpointOpened,
		savedApproxChars: Math.max(0, sourceChars - outputChars),
		reason: note,
	});

	return {
		changed: pruned.length !== source.length || prunableIds.length > 0,
		messages: pruned,
		prunableIds,
		newlyApplied,
		checkpointOpened,
		sourceMessages: source.length,
		outputMessages: pruned.length,
		savedApproxChars: Math.max(0, sourceChars - outputChars),
	};
}

export async function rebuildPrunedContextFromSession(ctx: any, state: RuntimeState, note?: string): Promise<PruneRebuildResult> {
	const branch = await ctx?.sessionManager?.getBranch?.();
	return rebuildPrunedContext(messagesFromBranch(branch), state, note);
}

function recordRebuildMetrics(state: RuntimeState, metrics: { sourceMessages: number; outputMessages: number; prunableIds: number; newlyApplied: number; checkpointOpened: boolean; savedApproxChars: number; reason?: string }): void {
	const impact = state.engine.prune.impact;
	impact.lastRebuildSourceMessages = metrics.sourceMessages;
	impact.lastRebuildOutputMessages = metrics.outputMessages;
	impact.lastRebuildPrunableIds = metrics.prunableIds;
	impact.lastRebuildNewlyApplied = metrics.newlyApplied;
	impact.lastRebuildCheckpointOpened = metrics.checkpointOpened;
	impact.lastRebuildSavedApproxChars = metrics.savedApproxChars;
	impact.lastRebuildReason = metrics.reason;
}

function estimateMessagesChars(messages: any[]): number {
	return messages.reduce((total, msg) => total + estimateValueChars(msg), 0);
}

function estimateValueChars(value: unknown): number {
	if (value == null) return 0;
	if (typeof value === "string") return value.length;
	if (typeof value === "number" || typeof value === "boolean") return String(value).length;
	if (Array.isArray(value)) return value.reduce((total, item) => total + estimateValueChars(item), 0);
	if (typeof value === "object") {
		return Object.entries(value as Record<string, unknown>).reduce((total, [key, item]) => total + key.length + estimateValueChars(item), 0);
	}
	return String(value).length;
}

import type { RuntimeState } from "../runtime-state.ts";
import type { SessionContentMap, SessionMapNode, SessionMapNodeKind, SessionMapSegment, SessionMapSegmentKind } from "../types.ts";
import { extractAssistantToolCalls } from "./batch-capture.ts";

const PREVIEW_CHARS = 160;

function previewText(value: unknown): string | undefined {
	if (typeof value === "string") {
		const text = value.trim().replace(/\s+/g, " ");
		return text ? text.slice(0, PREVIEW_CHARS) : undefined;
	}
	if (Array.isArray(value)) {
		const text = value
			.map((part: any) => {
				if (typeof part === "string") return part;
				if (part?.type === "text" && typeof part.text === "string") return part.text;
				return "";
			})
			.filter(Boolean)
			.join(" ")
			.replace(/\s+/g, " ")
			.trim();
		return text ? text.slice(0, PREVIEW_CHARS) : undefined;
	}
	return undefined;
}

function parseLookupArgs(rawArgs: string | undefined): { ref?: string; offset?: number; limit?: number } {
	if (!rawArgs) return {};
	try {
		const parsed = JSON.parse(rawArgs);
		return {
			ref: typeof parsed?.ref === "string" ? parsed.ref : undefined,
			offset: typeof parsed?.offset === "number" ? parsed.offset : undefined,
			limit: typeof parsed?.limit === "number" ? parsed.limit : undefined,
		};
	} catch {
		return {};
	}
}

function toolResultId(msg: any): string | undefined {
	return msg?.toolCallId ?? msg?.tool_call_id ?? msg?.id ?? msg?.callId;
}

function nodeId(kind: SessionMapNodeKind, turnIndex: number, localIndex: number, suffix?: string): string {
	return [kind, String(turnIndex), String(localIndex), suffix].filter(Boolean).join(":");
}

function segmentId(kind: SessionMapSegmentKind, turnIndex: number, localIndex: number): string {
	return `${kind}:${turnIndex}:${localIndex}`;
}

function nodeFromMessage(msg: any, entry: any, turnIndex: number, localIndex: number): SessionMapNode {
	return {
		id: nodeId("message", turnIndex, localIndex, entry?.id),
		entryId: entry?.id,
		turnIndex,
		role: typeof msg?.role === "string" ? msg.role : undefined,
		kind: "message",
		textPreview: previewText(msg?.content),
	};
}

export function buildSessionContentMap(branch: any[] | undefined, state: RuntimeState): SessionContentMap {
	const nodes: SessionMapNode[] = [];
	const segments: SessionMapSegment[] = [];
	const activeNodeIds: string[] = [];
	let segmentKind: SessionMapSegmentKind | null = null;
	let segmentTurn = 0;
	let segmentIndex = 0;
	let nodeIndex = 0;
	const toolCallNodeIds = new Map<string, string>();

	const flushSegment = (reason?: string): void => {
		if (!segmentKind || activeNodeIds.length === 0) return;
		const segmentNodes = activeNodeIds
			.map((id) => nodes.find((node) => node.id === id))
			.filter(Boolean) as SessionMapNode[];
		const removableNodes = segmentNodes.filter((node) => node.kind === "tool-call" || node.kind === "tool-result" || node.kind === "summary");
		const dropCandidate = removableNodes.length > 0 && removableNodes.every((node) => node.dropCandidate);
		segments.push({
			id: segmentId(segmentKind, segmentTurn, segmentIndex++),
			turnIndex: segmentTurn,
			kind: segmentKind,
			nodeIds: [...activeNodeIds],
			dropCandidate,
			reason,
		});
		activeNodeIds.length = 0;
		segmentKind = null;
	};

	const pushNode = (node: SessionMapNode, nextSegmentKind: SessionMapSegmentKind, reason?: string): void => {
		if (segmentKind && segmentKind !== nextSegmentKind) flushSegment(reason);
		if (!segmentKind) {
			segmentKind = nextSegmentKind;
			segmentTurn = node.turnIndex;
		}
		nodes.push(node);
		activeNodeIds.push(node.id);
	};

	for (const entry of branch ?? []) {
		if (entry?.type === "custom_message" && entry?.customType === "context-engine-prune-summary") {
			const turnIndex = typeof entry?.turnIndex === "number" ? entry.turnIndex : 0;
			pushNode({
				id: nodeId("summary", turnIndex, nodeIndex++, entry?.id),
				entryId: entry?.id,
				turnIndex,
				role: "assistant",
				kind: "summary",
				textPreview: previewText(entry?.content),
				dropCandidate: false,
			}, "summary");
			continue;
		}

		if (entry?.type !== "message" || !entry?.message) continue;
		const msg = entry.message;
		const turnIndex = typeof entry?.turnIndex === "number" ? entry.turnIndex : 0;

		if (msg?.role === "assistant") {
			const toolCalls = extractAssistantToolCalls(msg);
			if (toolCalls.length > 0) {
				const assistantNode = nodeFromMessage(msg, entry, turnIndex, nodeIndex++);
				pushNode(assistantNode, "tool-batch");
				for (const toolCall of toolCalls) {
					const id = toolCall.id ?? toolCall.name ?? `tool-${nodeIndex}`;
					const lookup = (toolCall.name ?? "") === "context_result_lookup" ? parseLookupArgs(toolCall.args) : {};
					const summarized = state.toolIndexer.isSummarized(id);
					const callNode: SessionMapNode = {
						id: nodeId("tool-call", turnIndex, nodeIndex++, id),
						entryId: entry?.id,
						turnIndex,
						role: "assistant",
						kind: "tool-call",
						textPreview: previewText(toolCall.args),
						toolCallId: id,
						toolName: toolCall.name,
						parentNodeId: assistantNode.id,
						ref: lookup.ref,
						offset: lookup.offset,
						limit: lookup.limit,
						summarized,
						dropCandidate: summarized,
					};
					toolCallNodeIds.set(id, callNode.id);
					pushNode(callNode, "tool-batch");
				}
				continue;
			}
			flushSegment("assistant-dialogue");
			pushNode(nodeFromMessage(msg, entry, turnIndex, nodeIndex++), "dialogue");
			continue;
		}

		if (msg?.role === "tool" || msg?.role === "toolResult") {
			const toolCallId = toolResultId(msg);
			const summarized = toolCallId ? state.toolIndexer.isSummarized(toolCallId) : false;
			const details = msg?.details ?? {};
			pushNode({
				id: nodeId("tool-result", turnIndex, nodeIndex++, toolCallId),
				entryId: entry?.id,
				turnIndex,
				role: msg.role,
				kind: "tool-result",
				textPreview: previewText(msg?.content) ?? previewText(msg?.result),
				toolCallId,
				toolName: msg?.toolName,
				parentNodeId: toolCallId ? toolCallNodeIds.get(toolCallId) : undefined,
				ref: typeof details?.ref === "string" ? details.ref : undefined,
				offset: typeof details?.offset === "number" ? details.offset : undefined,
				limit: typeof details?.limit === "number" ? details.limit : undefined,
				summarized,
				dropCandidate: summarized,
			}, "tool-batch");
			continue;
		}

		flushSegment("role-switch");
		pushNode(nodeFromMessage(msg, entry, turnIndex, nodeIndex++), "dialogue");
	}

	flushSegment("end");

	return {
		version: 1,
		builtAt: Date.now(),
		nodes,
		segments,
		totals: {
			messages: nodes.filter((node) => node.kind === "message").length,
			toolCalls: nodes.filter((node) => node.kind === "tool-call").length,
			toolResults: nodes.filter((node) => node.kind === "tool-result").length,
			lookups: nodes.filter((node) => node.toolName === "context_result_lookup").length,
			summarized: nodes.filter((node) => node.summarized).length,
			dropCandidates: nodes.filter((node) => node.dropCandidate).length,
		},
	};
}

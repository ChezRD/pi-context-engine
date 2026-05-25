import type { RuntimeState } from "../runtime-state.ts";
import { stableHash } from "../cache-engine/prefix-fingerprint.ts";
import type { SessionContentMap, SessionMapNode, SessionMapNodeKind, SessionMapSegment, SessionMapSegmentKind, SessionPruneSuggestion, SessionPruneSuggestionValidation } from "../types.ts";
import { extractAssistantToolCalls } from "./batch-capture.ts";
import { extractHarnessResultFacts } from "./harness-content.ts";

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

function fullText(value: unknown): string | undefined {
	if (typeof value === "string") return value;
	if (!Array.isArray(value)) return undefined;
	const text = value
		.map((part: any) => {
			if (typeof part === "string") return part;
			if (part?.type === "text" && typeof part.text === "string") return part.text;
			return "";
		})
		.filter(Boolean)
		.join("\n");
	return text || undefined;
}

function contentHash(value: unknown): string | undefined {
	if (value === undefined) return undefined;
	return stableHash(value);
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

function parseToolArgs(rawArgs: string | undefined): Record<string, unknown> | undefined {
	if (!rawArgs) return undefined;
	try {
		const parsed = JSON.parse(rawArgs);
		return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : undefined;
	} catch {
		return undefined;
	}
}

function pathFromArgs(rawArgs: string | undefined): string | undefined {
	const parsed = parseToolArgs(rawArgs);
	const candidate = parsed?.path ?? parsed?.file ?? parsed?.cwd;
	return typeof candidate === "string" && candidate.trim() ? candidate : undefined;
}

function uniqueSorted(values: Array<string | undefined>): string[] {
	return Array.from(new Set(values.filter((value): value is string => typeof value === "string" && value.length > 0))).sort();
}

function nodeSummary(node: SessionMapNode): string | undefined {
	if (node.kind === "tool-call") {
		const target = node.path ?? node.ref ?? node.textPreview;
		return [node.toolName, target].filter(Boolean).join(" ");
	}
	if (node.kind === "summary") return node.textPreview;
	return undefined;
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
		contentHash: contentHash(msg?.content),
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
	const latestTurnIndex = Math.max(0, ...(branch ?? []).map((entry) => typeof entry?.turnIndex === "number" ? entry.turnIndex : 0));

	const flushSegment = (reason?: string): void => {
		if (!segmentKind || activeNodeIds.length === 0) return;
		const segmentNodes = activeNodeIds
			.map((id) => nodes.find((node) => node.id === id))
			.filter(Boolean) as SessionMapNode[];
		const removableNodes = segmentNodes.filter((node) => node.kind === "tool-call" || node.kind === "tool-result" || node.kind === "summary");
		const containsUserMessage = segmentNodes.some((node) => node.kind === "message" && node.role === "user");
		const hasPendingToolCall = segmentNodes.some((node) => node.kind === "tool-call" && !node.summarized);
		const inCurrentTail = segmentNodes.some((node) => node.turnIndex >= latestTurnIndex);
		const dropCandidate = removableNodes.length > 0
			&& !containsUserMessage
			&& !hasPendingToolCall
			&& !inCurrentTail
			&& removableNodes.every((node) => node.dropCandidate);
		const refs = uniqueSorted(segmentNodes.map((node) => node.ref));
		const paths = uniqueSorted(segmentNodes.map((node) => node.path));
		const toolNames = uniqueSorted(segmentNodes.map((node) => node.toolName));
		const hasUnfetchedTail = segmentNodes.some((node) => node.hasUnfetchedTail);
		const risk: "low" | "medium" | "high" = containsUserMessage || hasPendingToolCall || inCurrentTail
			? "high"
			: hasUnfetchedTail
				? "medium"
				: dropCandidate
					? "low"
					: "medium";
		segments.push({
			id: segmentId(segmentKind, segmentTurn, segmentIndex++),
			turnIndex: segmentTurn,
			kind: segmentKind,
			nodeIds: [...activeNodeIds],
			dropCandidate,
			summary: uniqueSorted(segmentNodes.map(nodeSummary)).slice(0, 4).join("; ") || undefined,
			risk,
			facts: { refs, paths, hasUnfetchedTail, toolNames },
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
				contentHash: contentHash(entry?.content),
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
					const path = pathFromArgs(toolCall.args);
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
						contentHash: contentHash({ name: toolCall.name, args: toolCall.args }),
						argsHash: contentHash(toolCall.args),
						ref: lookup.ref,
						offset: lookup.offset,
						limit: lookup.limit,
						path,
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
			const resultText = fullText(msg?.content) ?? fullText(msg?.result);
			const facts = extractHarnessResultFacts(resultText);
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
				contentHash: contentHash({ content: msg?.content, result: msg?.result }),
				resultHash: contentHash(resultText),
				ref: typeof details?.ref === "string" ? details.ref : facts?.ref,
				offset: typeof details?.offset === "number" ? details.offset : facts?.offset,
				limit: typeof details?.limit === "number" ? details.limit : facts?.limit,
				hasUnfetchedTail: facts?.hasMore,
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

export function validateSessionPruneSuggestion(map: SessionContentMap, suggestion: SessionPruneSuggestion): SessionPruneSuggestionValidation {
	const byId = new Map(map.segments.map((segment) => [segment.id, segment]));
	const nodeById = new Map(map.nodes.map((node) => [node.id, node]));
	const latestTurnIndex = Math.max(0, ...map.nodes.map((node) => node.turnIndex));
	const acceptedSegmentIds: string[] = [];
	const rejected: SessionPruneSuggestionValidation["rejected"] = [];

	for (const id of suggestion.dropSegmentIds) {
		const segment = byId.get(id);
		if (!segment) {
			rejected.push({ id, reason: "unknown-segment" });
			continue;
		}
		const segmentNodes = segment.nodeIds.map((nodeId) => nodeById.get(nodeId)).filter(Boolean) as SessionMapNode[];
		if (segmentNodes.some((node) => node.kind === "message" && node.role === "user")) {
			rejected.push({ id, reason: "contains-user-message" });
			continue;
		}
		if (segmentNodes.some((node) => node.turnIndex >= latestTurnIndex)) {
			rejected.push({ id, reason: "current-tail" });
			continue;
		}
		if (segmentNodes.some((node) => node.kind === "tool-call" && !node.summarized)) {
			rejected.push({ id, reason: "pending-tool-call" });
			continue;
		}
		if (!segment.dropCandidate) {
			rejected.push({ id, reason: "not-drop-candidate" });
			continue;
		}
		acceptedSegmentIds.push(id);
	}

	return { acceptedSegmentIds, rejected };
}

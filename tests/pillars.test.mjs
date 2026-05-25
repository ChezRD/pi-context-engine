import { describe, it } from "node:test";
import assert from "node:assert/strict";

// Top-level await for dynamic imports
let createToolCallIndexer, pruneMessages, summarizeToolBatch, summarizeToolBatchPool, normalizeToolResultForSummary, buildPoolPrompt, registerAgenticTools, registerTimelineTool, registerDashboardCommand, registerCompactToolRenderers, HugeResultStore, buildSessionContentMap, messagesFromBranch, DUPLICATE_SKIP_INTERNAL_MARKER;
let extractPinnedSkills, extractPinnedConstraints, buildFoldMessage, trimTrailingAssistantToolCalls, captureBatches, extractMessageContext, extractAssistantToolCalls, shouldTriggerPrune, decideAfterUsage, estimateTurnStart;

try {
	createToolCallIndexer = (await import("../src/projection/indexer.ts")).createToolCallIndexer;
	pruneMessages = (await import("../src/projection/pruner.ts")).pruneMessages;
	({ summarizeToolBatch, summarizeToolBatchPool, normalizeToolResultForSummary, buildPoolPrompt, DUPLICATE_SKIP_INTERNAL_MARKER } = await import("../src/projection/tool-pruner.ts"));
	registerAgenticTools = (await import("../src/agentic/tools.ts")).registerAgenticTools;
	registerTimelineTool = (await import("../src/ui/timeline.ts")).registerTimelineTool;
	registerDashboardCommand = (await import("../src/ui/dashboard.ts")).registerDashboardCommand;
	registerCompactToolRenderers = (await import("../src/ui/tool-renderers.ts")).registerCompactToolRenderers;
	HugeResultStore = (await import("../src/capper.ts")).HugeResultStore;
	buildSessionContentMap = (await import("../src/projection/session-map.ts")).buildSessionContentMap;
	messagesFromBranch = (await import("../src/projection/rebuild.ts")).messagesFromBranch;
	extractPinnedSkills = (await import("../src/projection/history-folder.ts")).extractPinnedSkills;
	extractPinnedConstraints = (await import("../src/projection/history-folder.ts")).extractPinnedConstraints;
	buildFoldMessage = (await import("../src/projection/history-folder.ts")).buildFoldMessage;
	trimTrailingAssistantToolCalls = (await import("../src/projection/history-folder.ts")).trimTrailingAssistantToolCalls;
	({ captureBatches, extractMessageContext, extractAssistantToolCalls, shouldTriggerPrune } = await import("../src/projection/batch-capture.ts"));
	decideAfterUsage = (await import("../src/cache-engine/decision-engine.ts")).decideAfterUsage;
	estimateTurnStart = (await import("../src/cache-engine/decision-engine.ts")).estimateTurnStart;
} catch (e) {
	// Fallback for compiled JS
	createToolCallIndexer = (await import("../dist/projection/indexer.js")).createToolCallIndexer;
	pruneMessages = (await import("../dist/projection/pruner.js")).pruneMessages;
	({ summarizeToolBatch, summarizeToolBatchPool, normalizeToolResultForSummary, buildPoolPrompt, DUPLICATE_SKIP_INTERNAL_MARKER } = await import("../dist/projection/tool-pruner.js"));
	registerAgenticTools = (await import("../dist/agentic/tools.js")).registerAgenticTools;
	registerTimelineTool = (await import("../dist/ui/timeline.js")).registerTimelineTool;
	registerDashboardCommand = (await import("../dist/ui/dashboard.js")).registerDashboardCommand;
	registerCompactToolRenderers = (await import("../dist/ui/tool-renderers.js")).registerCompactToolRenderers;
	HugeResultStore = (await import("../dist/capper.js")).HugeResultStore;
	buildSessionContentMap = (await import("../dist/projection/session-map.js")).buildSessionContentMap;
	messagesFromBranch = (await import("../dist/projection/rebuild.js")).messagesFromBranch;
	({ captureBatches, extractMessageContext, extractAssistantToolCalls, shouldTriggerPrune } = await import("../dist/projection/batch-capture.js"));
}

// ── Tool pruning (Pillar 1) ──

describe("ToolCallIndexer", () => {
	let indexer;

	it("starts empty", () => {
		indexer = createToolCallIndexer();
		assert.equal(indexer.getAllSummarized().length, 0);
	});

	it("records tool calls", () => {
		indexer.markSummarized("tc-1", "read_file", 0);
		assert.ok(indexer.isSummarized("tc-1"));
		assert.equal(indexer.isSummarized("tc-2"), false);
	});

	it("returns records", () => {
		const rec = indexer.getRecord("tc-1");
		assert.ok(rec);
		assert.equal(rec.toolName, "read_file");
		assert.equal(rec.turnIndex, 0);
	});

	it("lists summarized", () => {
		indexer.markSummarized("tc-2", "write_file", 1);
		assert.equal(indexer.getAllSummarized().length, 2);
	});

	it("resets", () => {
		indexer.reset();
		assert.equal(indexer.getAllSummarized().length, 0);
	});
});

describe("pruneMessages", () => {
	it("removes summarized tool results", () => {
		const idx = createToolCallIndexer();
		idx.markSummarized("tc-1", "read", 0);

		const msgs = [
			{ role: "user", content: "hi" },
			{ role: "assistant", content: "ok", tool_calls: [{ id: "tc-1", function: { name: "read", arguments: "{}" } }] },
			{ role: "tool", toolCallId: "tc-1", content: "big result" },
		];

		const pruned = pruneMessages(msgs, idx);
		assert.equal(pruned.length, 1);
		assert.equal(pruned[0].role, "user");
	});

	it("keeps unsummarized tool results", () => {
		const idx = createToolCallIndexer();
		const msgs = [
			{ role: "user", content: "hi" },
			{ role: "tool", toolCallId: "tc-new", content: "result" },
		];
		const pruned = pruneMessages(msgs, idx);
		assert.equal(pruned.length, 2);
	});

	it("keeps assistant tool-call blocks and removes repeated summarized raw results", () => {
		const idx = createToolCallIndexer();
		idx.markSummarized("tc-1", "read", 0, "summary");
		idx.markSummarized("tc-2", "rg", 0, "summary");
		const pruned = pruneMessages([
			{ role: "assistant", tool_calls: [{ id: "tc-1" }, { id: "tc-2" }] },
			{ role: "tool", toolCallId: "tc-1", content: "large result 1" },
			{ role: "tool", toolCallId: "tc-2", content: "large result 2" },
		], idx);
		assert.equal(pruned.length, 1);
		assert.equal(pruned[0].role, "assistant");
	});

	it("keeps contiguous assistant call sites while dropping summarized tool results", () => {
		const idx = createToolCallIndexer();
		idx.markSummarized("tc-1", "read", 0, "summary one");
		idx.markSummarized("tc-2", "rg", 0, "summary two");
		const pruned = pruneMessages([
			{ role: "user", content: "найди причину" },
			{ role: "assistant", content: "сначала читаю", tool_calls: [{ id: "tc-1" }, { id: "tc-2" }] },
			{ role: "tool", toolCallId: "tc-1", content: "large result 1" },
			{ role: "tool", toolCallId: "tc-2", content: "large result 2" },
			{ role: "assistant", content: "дальше правлю" },
		], idx);
		assert.equal(pruned.length, 3);
		assert.equal(pruned[0].role, "user");
		assert.equal(pruned[1].role, "assistant");
		assert.deepEqual(pruned[1].content, [{ type: "text", text: "summary one\n\nsummary two" }]);
		assert.equal(pruned[2].content, "дальше правлю");
	});

	it("keeps non-contiguous assistant call sites even when summarized tool results arrive later", () => {
		const idx = createToolCallIndexer();
		idx.markSummarized("tc-1", "read", 0, "batch summary");
		const pruned = pruneMessages([
			{ role: "user", content: "проверь config" },
			{ role: "assistant", content: "читаю конфиг", tool_calls: [{ id: "tc-1" }] },
			{ role: "assistant", content: "пока отмечу гипотезу" },
			{ role: "tool", toolCallId: "tc-1", content: "large config dump" },
			{ role: "assistant", content: "дальше правлю" },
		], idx);
		assert.equal(pruned.length, 4);
		assert.equal(pruned[1].role, "assistant");
		assert.equal(pruned[2].content, "пока отмечу гипотезу");
		assert.equal(pruned[3].content, "дальше правлю");
	});

	it("handles empty messages", () => {
		const idx = createToolCallIndexer();
		assert.equal(pruneMessages([], idx).length, 0);
	});
});

describe("messagesFromBranch", () => {
	it("normalizes custom and summary entries to assistant-style content parts", () => {
		const messages = messagesFromBranch([
			{ type: "custom_message", customType: "context-note", content: "custom text", timestamp: "2026-05-25T10:00:00.000Z" },
			{ type: "branch_summary", summary: "branch summary", timestamp: "2026-05-25T10:00:01.000Z" },
			{ type: "compaction", summary: "compaction summary", timestamp: "2026-05-25T10:00:02.000Z" },
		]);
		assert.deepEqual(messages.map((msg) => msg.content), [
			[{ type: "text", text: "custom text" }],
			[{ type: "text", text: "branch summary" }],
			[{ type: "text", text: "compaction summary" }],
		]);
	});
});

describe("summarizeToolBatch", () => {
	it("normalizes capped model-visible tool results before sending them to the summarizer", () => {
		const normalized = normalizeToolResultForSummary([
			"[pi-context-engine: model-visible context]",
			"<model_visible_context schema=\"pi.model_visible_context.v1\" kind=\"context_result_truncated\" ui=\"custom-rendered\">",
			"<payload name=\"lookup\">",
			"[context_result_lookup kind=slice ref=dsc-read-1 offset=0 limit=10 range=0:10 returned_chars=10 total_chars=10 bytes=10 has_more=false]",
			"abcdefghij",
			"</payload>",
			"<payload name=\"preview\">",
			"preview text",
			"</payload>",
			"</model_visible_context>",
		].join("\n"));
		assert.equal(normalized, "Result metadata: kind=slice ref=dsc-read-1 offset=0 limit=10 range=0:10 returned_chars=10 total_chars=10 total_bytes=10 has_more=false\nabcdefghij");
	});

	it("falls back to preview text when model-visible lookup payload contains only the lookup header", () => {
		const normalized = normalizeToolResultForSummary([
			"[pi-context-engine: model-visible context]",
			"<model_visible_context schema=\"pi.model_visible_context.v1\" kind=\"context_result_truncated\" ui=\"custom-rendered\">",
			"<payload name=\"lookup\">",
			"[context_result_lookup kind=slice ref=dsc-read-2 offset=0 limit=10 range=0:10 returned_chars=10 total_chars=10 bytes=10 has_more=false]",
			"</payload>",
			"<payload name=\"preview\">",
			"preview head",
			"…",
			"preview tail",
			"</payload>",
			"</model_visible_context>",
		].join("\n"));
		assert.equal(normalized, "Result metadata: kind=slice ref=dsc-read-2 offset=0 limit=10 range=0:10 returned_chars=10 total_chars=10 total_bytes=10 has_more=false\npreview head\n…\npreview tail");
	});

	it("drops duplicate-skip boilerplate from summarize input", () => {
		assert.equal(normalizeToolResultForSummary(DUPLICATE_SKIP_INTERNAL_MARKER), "");
		assert.equal(normalizeToolResultForSummary("Duplicate tool call suppressed to avoid cache/context churn"), "");
		assert.equal(normalizeToolResultForSummary("Дублирующийся вызов инструмента пропущен во избежание кэш-инвалидации/шума в контексте"), "");
	});

	it("returns null when pi has no complete function", async () => {
		const result = await summarizeToolBatch(
			{},
			{ turnIndex: 0, toolCalls: [{ id: "t1", name: "read", result: "data" }] },
			{ enabled: true, pruneOn: "every-turn", summarizerModel: "default" },
		);
		assert.equal(result, null);
	});

	it("accepts common structured summary field variants", async () => {
		const pool = await summarizeToolBatchPool(
			{ complete: async () => ({ content: [{ type: "text", text: JSON.stringify({ summaries: [{ index: 0, summaryText: "read config" }] }) }], usage: { input: 0, output: 0 } }) },
			[{ turnIndex: 0, toolCalls: [{ id: "t1", name: "read", result: "data" }] }],
			{ enabled: true, pruneOn: "every-turn", summarizerModel: "default" },
		);
		assert.equal(pool.results[0].summaryText, "read config");
		assert.ok(pool.metrics.inputTokens > 0);
		assert.ok(pool.metrics.outputTokens > 0);
	});

	it("preserves coverage and evidence fields in accepted summaries", async () => {
		const pool = await summarizeToolBatchPool(
			{ complete: async () => ({ content: [{ type: "text", text: JSON.stringify({ summaries: [{ batchIndex: 0, coverage: "partial", evidence: ["offsets 1-636 and 1273-1907 observed; gap 637-1272 missing"], summary: "Read chunk samples from a large file." }] }) }] }) },
			[{ turnIndex: 0, toolCalls: [{ id: "t1", name: "read", result: "data" }] }],
			{ enabled: true, pruneOn: "agent-message", summarizerModel: "default" },
		);
		assert.match(pool.results[0].summaryText, /Coverage: partial/);
		assert.match(pool.results[0].summaryText, /Evidence: offsets 1-636/);
	});

	it("does not duplicate coverage line when model already includes it in the summary body", async () => {
		const pool = await summarizeToolBatchPool(
			{ complete: async () => ({ content: [{ type: "text", text: JSON.stringify({ summaries: [{ batchIndex: 0, coverage: "partial", summary: "Coverage: partial\nGoal: inspect partial slice." }] }) }] }) },
			[{ turnIndex: 0, toolCalls: [{ id: "t1", name: "read", result: "data" }] }],
			{ enabled: true, pruneOn: "agent-message", summarizerModel: "default" },
		);
		assert.equal(pool.results[0].summaryText, "Coverage: partial\nGoal: inspect partial slice.");
	});

	it("downgrades contradictory complete coverage labels when the summary itself describes skipped ranges", async () => {
		const pool = await summarizeToolBatchPool(
			{ complete: async () => ({ content: [{ type: "text", text: JSON.stringify({ summaries: [{ batchIndex: 0, coverage: "complete", summary: "Skipped lines 1908-28999; remaining verification is incomplete." }] }) }] }) },
			[{ turnIndex: 0, toolCalls: [{ id: "t1", name: "read", result: "data" }] }],
			{ enabled: true, pruneOn: "agent-message", summarizerModel: "default" },
		);
		assert.match(pool.results[0].summaryText, /^Coverage: partial\b/);
	});

	it("recovers unstructured multi-batch response via per-batch retry instead of duplicating one response across all batches", async () => {
		const pool = await summarizeToolBatchPool(
			{ complete: async () => ({ message: { content: [{ type: "text", text: "Combined summary of the tool batch" }] } }) },
			[
				{ turnIndex: 0, toolCalls: [{ id: "t1", name: "read", result: "data" }] },
				{ turnIndex: 1, toolCalls: [{ id: "t2", name: "rg", result: "matches" }] },
			],
			{ enabled: true, pruneOn: "agent-message", summarizerModel: "default" },
		);
		assert.equal(pool.results.length, 2);
		assert.equal(pool.results[0]?.summaryText, "Combined summary of the tool batch");
		assert.equal(pool.results[1]?.summaryText, "Combined summary of the tool batch");
		assert.match(pool.metrics.error ?? "", /recovered via per-batch retry/);
	});

	it("retries per-batch when multi-batch structured response is unusable", async () => {
		let call = 0;
		const pool = await summarizeToolBatchPool(
			{
				complete: async () => {
					call++;
					if (call === 1) {
						return { content: [{ type: "text", text: JSON.stringify({ summaries: [{ batchIndex: 0, nope: "bad" }] }) }], usage: { input: 10, output: 5 } };
					}
					return { content: [{ type: "text", text: JSON.stringify({ summaries: [{ batchIndex: 0, summary: `ok-${call}` }] }) }], usage: { input: 10, output: 5 } };
				},
			},
			[
				{ turnIndex: 0, toolCalls: [{ id: "t1", name: "read", result: "data-1" }] },
				{ turnIndex: 1, toolCalls: [{ id: "t2", name: "rg", result: "data-2" }] },
			],
			{ enabled: true, pruneOn: "agent-message", summarizerModel: "default" },
		);
		assert.equal(pool.results.length, 2);
		assert.equal(pool.results[0]?.summaryText, "ok-2");
		assert.equal(pool.results[1]?.summaryText, "ok-3");
		assert.match(pool.metrics.error ?? "", /recovered via per-batch retry/);
		assert.equal(call, 3);
	});

	it("sends reconstructed local context to the summarizer for each batch", async () => {
		const prompts = [];
		await summarizeToolBatchPool(
			{
				complete: async (_model, messages) => {
					prompts.push(messages[0]?.content ?? "");
					return { content: [{ type: "text", text: JSON.stringify({ summaries: [{ batchIndex: 0, summary: "ok" }] }) }] };
				},
			},
			[{
				turnIndex: 5,
				context: "user: проверь pruning\n\nassistant: сначала найду config",
				toolCalls: [{
					id: "c",
					name: "rg",
					args: "{\"pattern\":\"prune\"}",
					result: "src/projection/pruner.ts",
					context: "user: проверь pruning\n\nassistant: сначала найду config",
				}],
			}],
			{ enabled: true, pruneOn: "agent-message", summarizerModel: "default" },
		);
		assert.equal(prompts.length, 1);
		assert.match(prompts[0], /self-contained replacement fragment/i);
		assert.match(prompts[0], /Input JSON:/);
		assert.match(prompts[0], /"payload_kind": "tool_call_batches_v2"/);
		assert.match(prompts[0], /"carry_forward_inventory": \[\]/);
		assert.match(prompts[0], /"batch_context": "user: проверь pruning\\n\\nassistant: сначала найду config"/);
		assert.match(prompts[0], /"call_context": "user: проверь pruning\\n\\nassistant: сначала найду config"/);
		assert.match(prompts[0], /assistant: сначала найду config/);
		assert.match(prompts[0], /"args_text": "\{\\\"pattern\\\":\\\"prune\\\"\}"/);
		assert.match(prompts[0], /"result_excerpt": "src\/projection\/pruner\.ts"/);
		assert.match(prompts[0], /treat higher batchIndex values as newer evidence/i);
		assert.match(prompts[0], /do not preserve disproved counts, filenames, symbols, or conclusions as active facts/i);
		assert.match(prompts[0], /Trust tool args and tool results over assistant narration/i);
		assert.match(prompts[0], /coverage is complete only when observed result metadata/i);
	});

	it("omits model-visible wrapper noise but keeps lookup metadata and recovered slice", async () => {
		const prompts = [];
		await summarizeToolBatchPool(
			{
				complete: async (_model, messages) => {
					prompts.push(messages[0]?.content ?? "");
					return { content: [{ type: "text", text: JSON.stringify({ summaries: [{ batchIndex: 0, summary: "ok" }] }) }] };
				},
			},
			[{
				turnIndex: 2,
				context: "user: прочитай файл",
				toolCalls: [{
					id: "t1",
					name: "read",
					result: [
						"[pi-context-engine: model-visible context]",
						"<model_visible_context schema=\"pi.model_visible_context.v1\" kind=\"context_result_truncated\" ui=\"custom-rendered\">",
						"<payload name=\"lookup\">",
						"[context_result_lookup kind=slice ref=dsc-read-1 offset=0 limit=10 range=0:10 returned_chars=10 total_chars=10 bytes=10 has_more=false]",
						"abcdefghij",
						"</payload>",
						"<payload name=\"preview\">",
						"preview text",
						"</payload>",
						"</model_visible_context>",
					].join("\n"),
				}],
			}],
			{ enabled: true, pruneOn: "agent-message", summarizerModel: "default" },
		);
		assert.equal(prompts.length, 1);
		assert.match(prompts[0], /"result_metadata": \{/);
		assert.match(prompts[0], /"ref": "dsc-read-1"/);
		assert.match(prompts[0], /"returned_chars": 10/);
		assert.match(prompts[0], /abcdefghij/);
		assert.doesNotMatch(prompts[0], /<model_visible_context/);
	});

	it("keeps context_result_lookup slice metadata for coverage checks", async () => {
		const prompts = [];
		await summarizeToolBatchPool(
			{
				complete: async (_model, messages) => {
					prompts.push(messages[0]?.content ?? "");
					return { content: [{ type: "text", text: JSON.stringify({ summaries: [{ batchIndex: 0, summary: "ok" }] }) }] };
				},
			},
			[{
				turnIndex: 3,
				toolCalls: [{
					id: "lookup",
					name: "context_result_lookup",
					args: "{\"ref\":\"dsc-read-n\",\"offset\":0,\"limit\":51265}",
					result: "[context_result_lookup kind=slice ref=dsc-read-n offset=0 limit=51265 range=0:51265 returned_chars=51265 total_chars=51265 bytes=51265 has_more=false]\nLINE_00001\nLINE_00636",
				}],
			}],
			{ enabled: true, pruneOn: "agent-message", summarizerModel: "default" },
		);
		assert.match(prompts[0], /"result_metadata": \{/);
		assert.match(prompts[0], /"ref": "dsc-read-n"/);
		assert.match(prompts[0], /"limit": 51265/);
		assert.match(prompts[0], /LINE_00001/);
	});

	it("does not leak call_context when includeContext=false and strips UI continuation banner text", async () => {
		const prompts = [];
		await summarizeToolBatchPool(
			{
				complete: async (_model, messages) => {
					prompts.push(messages[0]?.content ?? "");
					return { content: [{ type: "text", text: JSON.stringify({ summaries: [{ batchIndex: 0, summary: "ok" }] }) }] };
				},
			},
			[{
				turnIndex: 3,
				context: "assistant: this batch context should be omitted",
				toolCalls: [{
					id: "lookup-banner",
					name: "context_result_lookup",
					args: "{\"ref\":\"dsc-read-z\",\"offset\":0,\"limit\":51265}",
					context: "assistant: this call context should be omitted",
					result: "[context_result_lookup kind=slice ref=dsc-read-z offset=0 limit=51265 range=0:51265 returned_chars=51265 total_chars=51265 bytes=51265 has_more=false]\nLINE_00001 | Alpha\nLINE_00002 | Beta\n[Showing lines 1-636 of 30002 (50.0KB limit). Use offset=637 to continue.]",
				}],
			}],
			{ enabled: true, pruneOn: "agent-message", summarizerModel: "default", includeContext: false },
		);
		assert.equal(prompts.length, 1);
		assert.doesNotMatch(prompts[0], /this batch context should be omitted/);
		assert.doesNotMatch(prompts[0], /this call context should be omitted/);
		assert.doesNotMatch(prompts[0], /\[Showing lines 1-636/);
		assert.match(prompts[0], /"has_ui_continuation_hint": true/);
	});

	it("does not mark unfetched tail when metadata proves full slice despite UI continuation hint", async () => {
		const prompts = [];
		await summarizeToolBatchPool(
			{
				complete: async (_model, messages) => {
					prompts.push(messages[0]?.content ?? "");
					return { content: [{ type: "text", text: JSON.stringify({ summaries: [{ batchIndex: 0, summary: "ok" }] }) }] };
				},
			},
			[{
				turnIndex: 3,
				toolCalls: [{
					id: "lookup-full",
					name: "context_result_lookup",
					args: "{\"ref\":\"dsc-read-full\",\"offset\":0,\"limit\":10}",
					result: "[context_result_lookup kind=slice ref=dsc-read-full offset=0 limit=10 range=0:10 returned_chars=10 total_chars=10 bytes=10 has_more=false]\nLINE_00001 | Alpha\n[Showing lines 1-1 of 1 (10B limit). Use offset=2 to continue.]",
				}],
			}],
			{ enabled: true, pruneOn: "agent-message", summarizerModel: "default", includeContext: false },
		);
		assert.match(prompts[0], /"has_unfetched_tail": false/);
	});

	it("neutralizes numbered slice content for char-slice tool results", async () => {
		const prompts = [];
		await summarizeToolBatchPool(
			{
				complete: async (_model, messages) => {
					prompts.push(messages[0]?.content ?? "");
					return { content: [{ type: "text", text: JSON.stringify({ summaries: [{ batchIndex: 0, summary: "ok" }] }) }] };
				},
			},
			[{
				turnIndex: 3,
				toolCalls: [{
					id: "lookup-neutralized",
					name: "context_result_lookup",
					args: "{\"ref\":\"dsc-read-y\",\"offset\":0,\"limit\":51265}",
					result: "[context_result_lookup kind=slice ref=dsc-read-y offset=0 limit=51265 range=0:51265 returned_chars=51265 total_chars=51265 bytes=51265 has_more=false]\nLINE_00001 | Alpha\nLINE_00002 | Beta\nLINE_00003 | Gamma",
				}],
			}],
			{ enabled: true, pruneOn: "agent-message", summarizerModel: "default", includeContext: false },
		);
		assert.match(prompts[0], /LINE_LABEL \| Alpha/);
		assert.doesNotMatch(prompts[0], /LINE_00001 \| Alpha/);
	});

	it("keeps both head and tail samples for long read results instead of head-only truncation", async () => {
		const prompts = [];
		const longBody = Array.from({ length: 400 }, (_, index) => `LINE_${String(index + 1).padStart(5, "0")}`).join("\n");
		await summarizeToolBatchPool(
			{
				complete: async (_model, messages) => {
					prompts.push(messages[0]?.content ?? "");
					return { content: [{ type: "text", text: JSON.stringify({ summaries: [{ batchIndex: 0, summary: "ok" }] }) }] };
				},
			},
			[{
				turnIndex: 3,
				toolCalls: [{
					id: "read-long",
					name: "read",
					result: longBody,
				}],
			}],
			{ enabled: true, pruneOn: "agent-message", summarizerModel: "default" },
		);
		assert.match(prompts[0], /LINE_00001/);
		assert.match(prompts[0], /LINE_00400/);
		assert.match(prompts[0], /\[\.\.\. \d+ lines omitted \.\.\.\]/);
	});

	it("normalizes legacy lookup headers to explicit returned_chars and total_bytes names", () => {
		const normalized = normalizeToolResultForSummary("[context_result_lookup ref=dsc-bash-a offset=12000 limit=700 returned=0 bytes=12666]\n");
		assert.equal(normalized, "Result metadata: ref=dsc-bash-a offset=12000 limit=700 returned_chars=0 total_bytes=12666");
	});

	it("compacts oversized bash heredoc args while preserving target path hints", async () => {
		const prompts = [];
		await summarizeToolBatchPool(
			{
				complete: async (_model, messages) => {
					prompts.push(messages[0]?.content ?? "");
					return { content: [{ type: "text", text: JSON.stringify({ summaries: [{ batchIndex: 0, summary: "ok" }] }) }] };
				},
			},
			[{
				turnIndex: 0,
				toolCalls: [{
					id: "bash-long",
					name: "bash",
					args: "{\"command\":\"cat > /tmp/analyze_uk.mjs << 'SCRIPT'\\nimport { readFileSync } from 'node:fs';\\nconst EN_FILE = '/home/chez/projects/pi-extensions/pi-context-engine/src/i18n/locales/en.json';\\nconst UK_FILE = '/home/chez/projects/pi-extensions/pi-context-engine/src/i18n/locales/uk.json';\\n" + "x".repeat(1200) + "\"}",
					result: "done",
				}],
			}],
			{ enabled: true, pruneOn: "agent-message", summarizerModel: "default" },
		);
		assert.match(prompts[0], /target=\/tmp\/analyze_uk\.mjs/);
		assert.match(prompts[0], /paths=\/home\/chez\/projects\/pi-extensions\/pi-context-engine\/src\/i18n\/locales\/en\.json/);
		assert.match(prompts[0], /\[bash args compacted from /);
	});

	it("deduplicates repeated identical tool results inside one summarize request", async () => {
		const prompts = [];
		await summarizeToolBatchPool(
			{
				complete: async (_model, messages) => {
					prompts.push(messages[0]?.content ?? "");
					return { content: [{ type: "text", text: JSON.stringify({ summaries: [{ batchIndex: 0, summary: "ok" }] }) }] };
				},
			},
			[{
				turnIndex: 2,
				toolCalls: [
					{ id: "t1", name: "read", result: "same file body" },
					{ id: "t2", name: "read", result: "same file body" },
				],
			}],
			{ enabled: true, pruneOn: "agent-message", summarizerModel: "default" },
		);
		assert.equal(prompts.length, 1);
		assert.match(prompts[0], /"result_excerpt": "same file body"/);
		assert.match(prompts[0], /\[same result as earlier read output in this prune request\]/);
	});

	it("glues repeated context_result_lookup slices by ref without duplicating already-seen content", async () => {
		const prompts = [];
		await summarizeToolBatchPool(
			{
				complete: async (_model, messages) => {
					prompts.push(messages[0]?.content ?? "");
					return { content: [{ type: "text", text: JSON.stringify({ summaries: [{ batchIndex: 0, summary: "ok" }] }) }] };
				},
			},
			[{
				turnIndex: 2,
				toolCalls: [
					{
						id: "lookup-1",
						name: "context_result_lookup",
						args: "{\"ref\":\"dsc-read-r\",\"offset\":0,\"limit\":12}",
						result: "[context_result_lookup kind=slice ref=dsc-read-r offset=0 limit=12 range=0:12 returned_chars=12 total_chars=18 bytes=18 has_more=true]\nAlpha\nBeta\n",
					},
					{
						id: "lookup-2",
						name: "context_result_lookup",
						args: "{\"ref\":\"dsc-read-r\",\"offset\":6,\"limit\":12}",
						result: "[context_result_lookup kind=slice ref=dsc-read-r offset=6 limit=12 range=6:18 returned_chars=12 total_chars=18 bytes=18 has_more=false]\nBeta\nGamma\n",
					},
				],
			}],
			{ enabled: true, pruneOn: "agent-message", summarizerModel: "default", includeContext: false },
		);
		assert.equal(prompts.length, 1);
		assert.match(prompts[0], /"source_ref": "dsc-read-r"/);
		assert.match(prompts[0], /Alpha\\nBeta/);
		assert.match(prompts[0], /\[continues dsc-read-r after \d+ overlapping chars already seen earlier\]\\nGamma/);
		assert.doesNotMatch(prompts[0], /Alpha\\nBeta\\nBeta\\nGamma/);
	});

	it("includes carry-forward inventory when later summarize requests continue after earlier ref batches", () => {
		const prompt = buildPoolPrompt(
			[{
				turnIndex: 3,
				toolCalls: [{
					id: "lookup-late",
					name: "context_result_lookup",
					args: "{\"ref\":\"dsc-read-z\",\"offset\":5000,\"limit\":5000}",
					result: "[context_result_lookup kind=slice ref=dsc-read-z offset=5000 limit=5000 range=5000:10000 returned_chars=5000 total_chars=12781 bytes=12781 has_more=true]\nTail text",
				}],
			}],
			false,
			undefined,
			[{
				source_ref: "dsc-read-z",
				seen_in_prior_request: true,
				observed_offsets: [0],
				total_chars: 12781,
				subject_hint: "README head",
			}],
		);
		assert.match(prompt, /"carry_forward_inventory": \[/);
		assert.match(prompt, /"source_ref": "dsc-read-z"/);
		assert.match(prompt, /"seen_in_prior_request": true/);
		assert.match(prompt, /"observed_offsets": \[\s*0\s*\]/);
	});

	it("serializes structured toolCall arguments from live content parts", () => {
		const calls = extractAssistantToolCalls({
			role: "assistant",
			content: [{
				type: "toolCall",
				id: "call_1",
				name: "read",
				arguments: { path: "/tmp/example.ts" },
			}],
		});
		assert.deepEqual(calls, [{
			id: "call_1",
			name: "read",
			args: "{\"path\":\"/tmp/example.ts\"}",
		}]);
	});
});

describe("captureBatches context", () => {
	it("extracts reasoning from live thinking content parts", () => {
		const text = extractMessageContext({
			content: [
				{ type: "thinking", thinking: "Сначала найду нужный файл" },
				{ type: "toolCall", id: "x", name: "read" },
			],
		});
		assert.match(text ?? "", /Сначала найду нужный файл/);
	});

	it("adds bridge context only after dialogue gaps between tool episodes", () => {
		const pruneState = { pendingBatches: [], batchStepCounter: 0 };
		const branch = [
			{ turnIndex: 1, message: { role: "user", content: "Найди причину падения теста" } },
			{ turnIndex: 1, message: { role: "assistant", content: "Проверю лог", tool_calls: [{ id: "a", function: { name: "read", arguments: "{}" } }] } },
			{ turnIndex: 1, message: { role: "tool", toolCallId: "a", content: "log output" } },
			{ turnIndex: 2, message: { role: "assistant", content: "Сразу проверю соседний файл", tool_calls: [{ id: "b", function: { name: "read", arguments: "{}" } }] } },
			{ turnIndex: 2, message: { role: "tool", toolCallId: "b", content: "file output" } },
			{ turnIndex: 3, message: { role: "user", content: "Теперь проверь настройку pruning" } },
			{ turnIndex: 4, message: { role: "assistant", content: "Сначала найду config" } },
			{ turnIndex: 5, message: { role: "assistant", content: "Ищу файл", tool_calls: [{ id: "c", function: { name: "rg", arguments: "{}" } }] } },
			{ turnIndex: 5, message: { role: "tool", toolCallId: "c", content: "config.ts" } },
		];

		captureBatches(branch, [], pruneState, 5);
		assert.equal(pruneState.pendingBatches.length, 2);
		assert.equal(pruneState.pendingBatches[0].toolCalls.length, 2);
		assert.match(pruneState.pendingBatches[0].context, /user: Найди причину/);
		assert.match(pruneState.pendingBatches[1].context, /user: Теперь проверь/);
		assert.match(pruneState.pendingBatches[1].context, /assistant: Сначала найду/);
		assert.doesNotMatch(pruneState.pendingBatches[1].context ?? "", /Найди причину/);
	});

	it("keeps consecutive tool episodes in one local batch flow without dragging old bridge context", () => {
		const pruneState = { pendingBatches: [], batchStepCounter: 0 };
		const branch = [
			{ turnIndex: 1, message: { role: "user", content: "Проверь pruner" } },
			{ turnIndex: 1, message: { role: "assistant", content: "Сначала читаю файл", tool_calls: [{ id: "a", function: { name: "read", arguments: "{}" } }] } },
			{ turnIndex: 1, message: { role: "tool", toolCallId: "a", content: "file A" } },
			{ turnIndex: 2, message: { role: "assistant", content: "Сразу читаю второй", tool_calls: [{ id: "b", function: { name: "read", arguments: "{}" } }] } },
			{ turnIndex: 2, message: { role: "tool", toolCallId: "b", content: "file B" } },
		];

		captureBatches(branch, [], pruneState, 2);
		assert.equal(pruneState.pendingBatches.length, 1);
		assert.equal(pruneState.pendingBatches[0].toolCalls.length, 2);
		assert.match(pruneState.pendingBatches[0].context ?? "", /Проверь pruner/);
		assert.doesNotMatch(pruneState.pendingBatches[0].toolCalls[1].context ?? "", /user: П/);
		assert.match(pruneState.pendingBatches[0].toolCalls[1].context ?? "", /Сразу читаю второй/);
	});

	it("caps distant bridge context to the most recent local window for broken-up tool batches", () => {
		const pruneState = { pendingBatches: [], batchStepCounter: 0 };
		const branch = [
			{ turnIndex: 1, message: { role: "user", content: "Старый контекст 1" } },
			{ turnIndex: 2, message: { role: "assistant", content: "Старый контекст 2" } },
			{ turnIndex: 3, message: { role: "user", content: "Старый контекст 3" } },
			{ turnIndex: 4, message: { role: "assistant", content: "Старый контекст 4" } },
			{ turnIndex: 5, message: { role: "user", content: "Локальная задача" } },
			{ turnIndex: 6, message: { role: "assistant", content: "Локальная гипотеза" } },
			{ turnIndex: 7, message: { role: "user", content: "Уточнение перед tool call" } },
			{ turnIndex: 8, message: { role: "assistant", content: "Запускаю поиск", tool_calls: [{ id: "c", function: { name: "rg", arguments: "{}" } }] } },
			{ turnIndex: 8, message: { role: "tool", toolCallId: "c", content: "match" } },
		];

		captureBatches(branch, [], pruneState, 8);
		assert.equal(pruneState.pendingBatches.length, 1);
		assert.match(pruneState.pendingBatches[0].context ?? "", /Локальная задача/);
		assert.match(pruneState.pendingBatches[0].context ?? "", /Локальная гипотеза/);
		assert.match(pruneState.pendingBatches[0].context ?? "", /Уточнение перед tool call/);
		assert.match(pruneState.pendingBatches[0].context ?? "", /Запускаю поиск/);
		assert.doesNotMatch(pruneState.pendingBatches[0].context ?? "", /Старый контекст 1/);
		assert.doesNotMatch(pruneState.pendingBatches[0].context ?? "", /Старый контекст 2/);
	});

	it("splits batches when the dialogue bridge exceeds the configured bridge length", () => {
		const pruneState = { pendingBatches: [], batchStepCounter: 0 };
		const branch = [
			{ turnIndex: 1, message: { role: "user", content: "Проверь pruner" } },
			{ turnIndex: 1, message: { role: "assistant", content: "Читаю первый файл", tool_calls: [{ id: "a", function: { name: "read", arguments: "{}" } }] } },
			{ turnIndex: 1, message: { role: "tool", toolCallId: "a", content: "file A" } },
			{ turnIndex: 2, message: { role: "assistant", content: "Сначала сформулирую гипотезу" } },
			{ turnIndex: 3, message: { role: "user", content: "Добавь ещё проверку" } },
			{ turnIndex: 4, message: { role: "assistant", content: "Теперь ищу второй файл", tool_calls: [{ id: "b", function: { name: "rg", arguments: "{}" } }] } },
			{ turnIndex: 4, message: { role: "tool", toolCallId: "b", content: "file B" } },
		];

		captureBatches(branch, [], pruneState, 4, { bridgeLength: 2 });
		assert.equal(pruneState.pendingBatches.length, 2);
		assert.equal(pruneState.pendingBatches[0].toolCalls.length, 1);
		assert.equal(pruneState.pendingBatches[1].toolCalls.length, 1);
		assert.match(pruneState.pendingBatches[1].context ?? "", /Добавь ещё проверку/);
		assert.doesNotMatch(pruneState.pendingBatches[1].context ?? "", /Проверь pruner/);
	});

	it("preserves text payload from live toolResult arrays so the summarizer can normalize capped slices", () => {
		const pruneState = { pendingBatches: [], batchStepCounter: 0 };
		const branch = [
			{
				turnIndex: 3,
				message: {
					role: "assistant",
					content: [
						{ type: "thinking", thinking: "Читаю большой файл" },
						{ type: "toolCall", id: "t-read", name: "read", arguments: { path: "big.txt" } },
					],
				},
			},
			{
				turnIndex: 3,
				message: {
					role: "toolResult",
					toolCallId: "t-read",
					content: [{
						type: "text",
						text: [
							"[pi-context-engine: model-visible context]",
							"<model_visible_context schema=\"pi.model_visible_context.v1\" kind=\"context_result_truncated\" ui=\"custom-rendered\">",
							"<payload name=\"lookup\">",
							"[context_result_lookup kind=slice ref=dsc-read-7 offset=0 limit=10 range=0:10 returned_chars=10 total_chars=10 bytes=10 has_more=false]",
							"abcdefghij",
							"</payload>",
							"</model_visible_context>",
						].join("\n"),
					}],
				},
			},
		];

		captureBatches(branch, [], pruneState, 3);
		assert.equal(pruneState.pendingBatches.length, 1);
	assert.match(pruneState.pendingBatches[0].toolCalls[0].result ?? "", /^\[pi-context-engine: model-visible context\]/);
	assert.doesNotMatch(pruneState.pendingBatches[0].toolCalls[0].result ?? "", /^\[\{/);
	});
});

describe("session map", () => {
	it("captures the whole session with tool batches and lookup metadata", () => {
		const indexer = createToolCallIndexer();
		indexer.markSummarized("lookup-1", "context_result_lookup", 2, "summary");
		const state = { toolIndexer: indexer };
		const branch = [
			{ id: "u1", type: "message", turnIndex: 1, message: { role: "user", content: "inspect locale coverage" } },
			{ id: "a1", type: "message", turnIndex: 2, message: { role: "assistant", content: "reading file", tool_calls: [{ id: "lookup-1", function: { name: "context_result_lookup", arguments: "{\"ref\":\"dsc-1\",\"offset\":0,\"limit\":12000}" } }] } },
			{ id: "t1", type: "message", turnIndex: 2, message: { role: "tool", toolCallId: "lookup-1", toolName: "context_result_lookup", details: { ref: "dsc-1", offset: 0, limit: 12000 }, content: "slice one" } },
			{ id: "s1", type: "custom_message", turnIndex: 2, customType: "context-engine-prune-summary", content: "Coverage: partial\n- read slice" },
			{ id: "a2", type: "message", turnIndex: 3, message: { role: "assistant", content: "next step" } },
		];
		const map = buildSessionContentMap(branch, state);
		assert.equal(map.totals.messages, 3);
		assert.equal(map.totals.toolCalls, 1);
		assert.equal(map.totals.toolResults, 1);
		assert.equal(map.totals.lookups, 2);
		assert.ok(map.totals.summarized >= 2);
		assert.ok(map.segments.some((segment) => segment.kind === "tool-batch" && segment.dropCandidate));
		const lookupCall = map.nodes.find((node) => node.kind === "tool-call");
		assert.equal(lookupCall?.ref, "dsc-1");
		assert.equal(lookupCall?.offset, 0);
		assert.equal(lookupCall?.limit, 12000);
	});
});

// ── Agentic branching (Pillar 2) ──

describe("agentic tools registration", () => {
	it("registerAgenticTools registers context_checkpoint and context_rewind", () => {
		const tools = [];
		registerAgenticTools({
			registerTool: (def) => tools.push(def),
			setLabel: () => {},
			on: () => {},
		});
		const names = tools.map((t) => t.name);
		assert.ok(names.includes("context_checkpoint"));
		assert.ok(names.includes("context_rewind"));
	});

	it("tools have descriptions", () => {
		const tools = [];
		registerAgenticTools({
			registerTool: (def) => tools.push(def),
			setLabel: () => {},
			on: () => {},
		});
		const cp = tools.find((t) => t.name === "context_checkpoint");
		assert.ok(cp.description.length > 10);
	});
});

// ── Visualization (Pillar 3) ──

describe("timeline tool registration", () => {
	it("registerTimelineTool registers context_timeline", () => {
		const tools = [];
		registerTimelineTool({ registerTool: (def) => tools.push(def) });
		assert.equal(tools[0].name, "context_timeline");
	});
});

describe("dashboard command registration", () => {
	it("registerDashboardCommand registers /context", () => {
		const commands = [];
		registerDashboardCommand({ registerCommand: (name, def) => commands.push({ name, ...def }) });
		assert.equal(commands[0].name, "context");
	});
});

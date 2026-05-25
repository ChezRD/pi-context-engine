import { describe, it } from "node:test";
import assert from "node:assert/strict";

// Top-level await for dynamic imports
let createToolCallIndexer, pruneMessages, summarizeToolBatch, summarizeToolBatchPool, normalizeToolResultForSummary, registerAgenticTools, registerTimelineTool, registerDashboardCommand;
let extractPinnedSkills, extractPinnedConstraints, buildFoldMessage, trimTrailingAssistantToolCalls, captureBatches, extractMessageContext, extractAssistantToolCalls, shouldTriggerPrune, decideAfterUsage, estimateTurnStart;

try {
	createToolCallIndexer = (await import("../src/projection/indexer.ts")).createToolCallIndexer;
	pruneMessages = (await import("../src/projection/pruner.ts")).pruneMessages;
	({ summarizeToolBatch, summarizeToolBatchPool, normalizeToolResultForSummary } = await import("../src/projection/tool-pruner.ts"));
	registerAgenticTools = (await import("../src/agentic/tools.ts")).registerAgenticTools;
	registerTimelineTool = (await import("../src/ui/timeline.ts")).registerTimelineTool;
	registerDashboardCommand = (await import("../src/ui/dashboard.ts")).registerDashboardCommand;
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
	({ summarizeToolBatch, summarizeToolBatchPool, normalizeToolResultForSummary } = await import("../dist/projection/tool-pruner.js"));
	registerAgenticTools = (await import("../dist/agentic/tools.js")).registerAgenticTools;
	registerTimelineTool = (await import("../dist/ui/timeline.js")).registerTimelineTool;
	registerDashboardCommand = (await import("../dist/ui/dashboard.js")).registerDashboardCommand;
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
		assert.equal(pruned.length, 2);
		assert.equal(pruned[1].role, "assistant");
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

	it("injects a pruned summary once and removes repeated raw results", () => {
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
		assert.match(pruned[0].content, /summary/);
	});

	it("replaces a contiguous summarized tool block with one local summary analogue", () => {
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
		assert.match(pruned[1].content, /summary one/);
		assert.match(pruned[1].content, /summary two/);
		assert.equal(pruned[2].content, "дальше правлю");
	});

	it("anchors summarized analogue at the assistant call site even when tool results are non-contiguous", () => {
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
		assert.match(pruned[1].content, /batch summary/);
		assert.equal(pruned[2].content, "пока отмечу гипотезу");
		assert.equal(pruned[3].content, "дальше правлю");
	});

	it("handles empty messages", () => {
		const idx = createToolCallIndexer();
		assert.equal(pruneMessages([], idx).length, 0);
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
		assert.equal(normalized, "abcdefghij");
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
		assert.equal(normalized, "preview head\n…\npreview tail");
	});

	it("drops duplicate-skip boilerplate from summarize input", () => {
		const normalized = normalizeToolResultForSummary("Дублирующийся вызов инструмента пропущен во избежание кэш-инвалидации/шума в контексте");
		assert.equal(normalized, "");
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

	it("falls back to unstructured response text instead of blocking prune", async () => {
		const pool = await summarizeToolBatchPool(
			{ complete: async () => ({ message: { content: [{ type: "text", text: "Combined summary of the tool batch" }] } }) },
			[
				{ turnIndex: 0, toolCalls: [{ id: "t1", name: "read", result: "data" }] },
				{ turnIndex: 1, toolCalls: [{ id: "t2", name: "rg", result: "matches" }] },
			],
			{ enabled: true, pruneOn: "agent-message", summarizerModel: "default" },
		);
		assert.equal(pool.results.length, 2);
		assert.equal(pool.results[0].summaryText, "Combined summary of the tool batch");
		assert.equal(pool.results[1].summaryText, "Combined summary of the tool batch");
		assert.match(pool.metrics.error, /unstructured fallback/);
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
		assert.match(prompts[0], /Batch timeline context:/);
		assert.match(prompts[0], /Call context:/);
		assert.match(prompts[0], /assistant: сначала найду config/);
		assert.match(prompts[0], /Args: \{\"pattern\":\"prune\"\}/);
		assert.match(prompts[0], /Result: src\/projection\/pruner\.ts/);
		assert.match(prompts[0], /treat higher batchIndex values as newer evidence/i);
		assert.match(prompts[0], /do not preserve disproved counts, filenames, symbols, or conclusions as active facts/i);
	});

	it("omits model-visible wrapper noise from summarizer prompt and keeps the recovered slice", async () => {
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
		assert.match(prompts[0], /Result: abcdefghij/);
		assert.doesNotMatch(prompts[0], /<model_visible_context/);
		assert.doesNotMatch(prompts[0], /\[context_result_lookup kind=slice/);
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
		assert.match(prompts[0], /Result: same file body/);
		assert.match(prompts[0], /\[same result as earlier read output in this prune request\]/);
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

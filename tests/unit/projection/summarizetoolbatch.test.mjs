import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";
register("../../__mocks__/loader.mjs", import.meta.url);

const m = {};
const emptyStats = {
	requests: 0, input: 0, cacheRead: 0, cacheWrite: 0, output: 0,
	cost: 0, savings: 0, sinceCompactionRequests: 0, usages: [], compacts: [],
	last: undefined,
};
const cfg = {
	foldThreshold: 0.75, aggressiveFoldThreshold: 0.78, exitSummaryThreshold: 0.80,
	preflightFoldThreshold: 0.90, foldTailPct: 0.10, aggressiveFoldTailPct: 0.15,
	minFoldSavings: 0.30, contextCompactPct: 0.70, contextForceFoldPct: 0.85,
	maxCompactsPerSession: 5, foldInterval: 3, appendOnlyProjection: false,
	locale: "en", enableAgenticTools: true, pruneEnabled: true, pruneOn: "every-turn",
	showCostSavings: true, showTurnEstimate: true, hugeResultCapper: true,
	statusLine: true, registerDynamicProvider: true, enabled: true,
};

describe("summarizeToolBatch", () => {
  it("loads module and functions", async () => {
m.summarizeToolBatch = (await import("../../../src/projection/tool-pruner.ts")).summarizeToolBatch;
m.summarizeToolBatchPool = (await import("../../../src/projection/tool-pruner.ts")).summarizeToolBatchPool;
m.normalizeToolResultForSummary = (await import("../../../src/projection/tool-pruner.ts")).normalizeToolResultForSummary;
m.buildPoolPrompt = (await import("../../../src/projection/tool-pruner.ts")).buildPoolPrompt;
m.DUPLICATE_SKIP_INTERNAL_MARKER = (await import("../../../src/projection/tool-pruner.ts")).DUPLICATE_SKIP_INTERNAL_MARKER;
m.hasUnsupportedReadCompleteness = (await import("../../../src/projection/tool-pruner.ts")).hasUnsupportedReadCompleteness;
m.buildModelVisibleContext = (await import("../../../src/model-visible.ts")).buildModelVisibleContext;
    assert.ok(m.summarizeToolBatch);
  });

describe("summarizeToolBatch", () => {
	it("returns an observation mask when pi has no complete function", async () => {
		const result = await m.summarizeToolBatch({}, { turnIndex: 0, toolCalls: [{ id: "t1", name: "read", result: "data" }] }, { enabled: true, pruneOn: "every-turn", summarizerModel: "default" });
		assert.match(result.summaryText, /Coverage: unknown/);
		assert.match(result.summaryText, /Tool output masked/);
	});
	it("forces partial coverage when structured evidence is weak", async () => {
		let capturedPrompt = "";
		const pi = {
			complete: async (_model, messages) => {
				const content = messages[0]?.content;
				capturedPrompt = typeof content === "string" ? content : (content?.[0]?.text ?? "");
				return {
					content: "{\"summaries\":[{\"batchIndex\":0,\"coverage\":\"complete\",\"summary\":\"Read src/test.ts and got full content.\"}]}",
					usage: { input: 120, output: 20, cacheRead: 0 },
				};
			},
		};
		const result = await m.summarizeToolBatch(pi, {
			turnIndex: 0,
			toolCalls: [{
				id: "t1",
				name: "read",
				args: "{\"path\":\"src/test.ts\",\"offset\":0,\"limit\":5}",
				result: "Result metadata: offset=0 returned_chars=5\nshort",
				context: "need test",
			}],
		}, { enabled: true, pruneOn: "every-turn", summarizerModel: "default" });
		assert.ok(/"evidence_strength"\s*:\s*"weak"/.test(capturedPrompt));
		assert.ok(/"evidence_claim_strength_weak"/.test(capturedPrompt) || /"bounded_excerpt_without_total_proof"/.test(capturedPrompt));
		assert.match(result.summaryText, /Coverage: partial/i);
	});
	it("keeps complete coverage when metadata proves full read slice", async () => {
		let capturedPrompt = "";
		const pi = {
			complete: async (_model, messages) => {
				const content = messages[0]?.content;
				capturedPrompt = typeof content === "string" ? content : (content?.[0]?.text ?? "");
				return {
					content: "{\"summaries\":[{\"batchIndex\":0,\"coverage\":\"complete\",\"summary\":\"Full src/test.ts slice captured.\"}]}",
					usage: { input: 120, output: 20, cacheRead: 0 },
				};
			},
		};
		const result = await m.summarizeToolBatch(pi, {
			turnIndex: 0,
			toolCalls: [{
				id: "t2",
				name: "read",
				args: "{\"path\":\"src/test.ts\",\"offset\":0,\"limit\":5}",
				result: "Result metadata: offset=0 returned_chars=5 total_chars=5\nfull",
				context: "need test",
			}],
		}, { enabled: true, pruneOn: "every-turn", summarizerModel: "default" });
		assert.ok(!/"evidence_strength"\s*:\s*"weak"/.test(capturedPrompt));
		assert.match(result.summaryText, /Coverage: complete/i);
	});

	it("normalizes legacy lookup headers and model-visible output sections", () => {
		const legacy = m.normalizeToolResultForSummary("[context_result_lookup ref=dsc-read-1 returned=10 bytes=20]\nlookup body");
		assert.ok(legacy.startsWith("Result metadata:"));
		assert.ok(legacy.includes("ref=dsc-read-1"));
		assert.ok(legacy.includes("returned_chars=10"));
		assert.ok(legacy.includes("total_bytes=20"));
		assert.ok(legacy.includes("lookup body"));

		const modelVisible = m.buildModelVisibleContext({
			kind: "tool-output",
			ui: "hidden",
			metadata: { claim_strength: "weak" },
			sections: [{ name: "output", content: "Evidence body" }],
		});
		const normalized = m.normalizeToolResultForSummary(modelVisible);
		assert.ok(normalized.startsWith("Evidence metadata:"));
		assert.ok(normalized.includes("Evidence body"));

		const fallbackHeader = m.normalizeToolResultForSummary("[context_result_lookup custom=value returned=1 bytes=2]\nbody");
		assert.ok(fallbackHeader.includes("custom=value"));
		assert.ok(fallbackHeader.includes("returned_chars=1"));

		const passthroughModelVisible = m.buildModelVisibleContext({
			kind: "unknown",
			ui: "hidden",
			metadata: {},
			sections: [{ name: "other", content: "[context_result_lookup custom=value]" }],
		});
		assert.ok(m.normalizeToolResultForSummary(passthroughModelVisible).includes("context_result_lookup"));
	});

	it("deduplicates repeated lookup slices in buildPoolPrompt", () => {
		const prompt = m.buildPoolPrompt([{
			turnIndex: 1,
			toolCalls: [
				{ id: "a", name: "context_result_lookup", args: "{\"ref\":\"dsc-read-1\",\"offset\":0,\"limit\":10}", result: "[context_result_lookup ref=dsc-read-1 offset=0 returned=10 bytes=20]\nabcdef" },
				{ id: "b", name: "context_result_lookup", args: "{\"ref\":\"dsc-read-1\",\"offset\":6,\"limit\":10}", result: "[context_result_lookup ref=dsc-read-1 offset=6 returned=10 bytes=20]\ncdefghij" },
				{ id: "c", name: "read", args: "{\"path\":\"src/a.ts\"}", result: "same result" },
				{ id: "d", name: "read", args: "{\"path\":\"src/b.ts\"}", result: "same result" },
			],
		}], false);

		assert.ok(prompt.includes("continues dsc-read-1 after"));
		assert.ok(prompt.includes("same result as earlier read output"));
	});

	it("normalizes lookup metadata fallback, duplicate slices, model-visible preview, and text parts", () => {
		const noFacts = m.normalizeToolResultForSummary("[context_result_lookup ref=dsc-read-x returned=6 bytes=6]\n[context_result_lookup ref=dsc-read-x returned=6 bytes=6]");
		assert.equal(noFacts, "Result metadata: kind=full ref=dsc-read-x returned_chars=6 total_bytes=6");

		const preview = m.buildModelVisibleContext({
			kind: "context_result_truncated",
			ui: "hidden",
			metadata: {},
			sections: [
				{ name: "slice_metadata", content: "[context_result_lookup ref=dsc-read-2 returned=4 bytes=4]\nbody" },
				{ name: "preview", content: "preview body" },
			],
		});
		assert.match(m.normalizeToolResultForSummary(preview), /Result metadata:/);

		const prompt = m.buildPoolPrompt([{
			turnIndex: 2,
			toolCalls: [
				{ id: "a", name: "context_result_lookup", args: "{\"ref\":\"dsc-same\"}", result: "[context_result_lookup ref=dsc-same returned=3 bytes=3]\nabc" },
				{ id: "b", name: "context_result_lookup", args: "{\"ref\":\"dsc-same\"}", result: "[context_result_lookup ref=dsc-same returned=3 bytes=3]\nabc" },
				{ id: "c", name: "read", args: "", result: "array text\nloose text" },
			],
		}], false);
		assert.ok(prompt.includes("same dsc-same slice content"));
		assert.ok(prompt.includes("array text"));
		assert.ok(prompt.includes("loose text"));
	});

	it("covers metadata compaction and lookup continuation edge cases", () => {
		const prompt = m.buildPoolPrompt([{
			turnIndex: 1,
			toolCalls: [
				{ id: "meta", name: "read", args: "{\"path\":\"src/meta.ts\"}", result: `Result metadata: ref=dsc-meta returned_chars=5000 total_chars=5000\n${"x".repeat(5000)}` },
				{ id: "first", name: "context_result_lookup", args: "{\"ref\":\"dsc-short\"}", result: "[context_result_lookup ref=dsc-short returned=3 bytes=6]\nabc" },
				{ id: "second", name: "context_result_lookup", args: "{\"ref\":\"dsc-short\"}", result: "[context_result_lookup ref=dsc-short returned=6 bytes=6]\nabcdef" },
				{ id: "dup", name: "read", args: "{\"path\":\"src/dup.ts\"}", result: m.DUPLICATE_SKIP_INTERNAL_MARKER },
			],
		}], false);

		assert.ok(prompt.includes("dsc-meta"));
		assert.ok(prompt.includes("truncated"));
		assert.ok(prompt.includes("continues dsc-short after earlier lookup content"));
		assert.ok(!prompt.includes(m.DUPLICATE_SKIP_INTERNAL_MARKER));
	});

	it("handles embedded malformed JSON and structured coverage variants conservatively", async () => {
		const malformed = await m.summarizeToolBatch({
			complete: async () => ({ content: "prefix { bad json } suffix" }),
		}, {
			turnIndex: 0,
			toolCalls: [{ id: "bad-json", name: "read", args: "{\"path\":\"src/bad.ts\"}", result: "bad result" }],
		}, { enabled: true, pruneOn: "every-turn", summarizerModel: "default" });
		assert.match(malformed.summaryText, /prefix \{ bad json \} suffix/);

		const structured = await m.summarizeToolBatch({
			complete: async () => ({
				content: JSON.stringify({ summaries: [{ batchIndex: 0, summary: [{ type: "text", text: "Coverage: partial\nStructured summary." }], evidence: ["bounded excerpt"] }] }),
			}),
		}, {
			turnIndex: 1,
			toolCalls: [{ id: "structured", name: "read", args: "{\"path\":\"src/structured.ts\",\"limit\":3}", result: "Result metadata: offset=0 returned_chars=3\nabc" }],
		}, { enabled: true, pruneOn: "every-turn", summarizerModel: "default" });
		assert.match(structured.summaryText, /Coverage: partial/);
		assert.match(structured.summaryText, /Structured summary/);
	});

	it("reads loose text response content parts", async () => {
		const result = await m.summarizeToolBatch({
			complete: async () => ({
				content: [{ type: "image", data: "x" }, { text: "{\"summaries\":[{\"batchIndex\":0,\"coverage\":\"partial\",\"summary\":\"Loose part summary.\"}]}" }],
			}),
		}, {
			turnIndex: 0,
			toolCalls: [{ id: "loose", name: "bash", args: "printf ok", result: "ok" }],
		}, { enabled: true, pruneOn: "every-turn", summarizerModel: "default" });

		assert.match(result.summaryText, /Loose part summary/);
	});

	it("handles malformed evidence metadata without trusting complete coverage", async () => {
		let capturedPrompt = "";
		const result = await m.summarizeToolBatch({
			complete: async (_model, messages) => {
				const content = messages[0]?.content;
				capturedPrompt = typeof content === "string" ? content : (content?.[0]?.text ?? "");
				return { content: "{\"summaries\":[{\"batchIndex\":0,\"coverage\":\"complete\",\"summary\":\"Full output was read.\"}]}" };
			},
		}, {
			turnIndex: 0,
			toolCalls: [{ id: "bad-evidence", name: "read", args: "{\"path\":\"src/evidence.ts\",\"limit\":10}", result: "Evidence metadata: {bad json}\nbody" }],
		}, { enabled: true, pruneOn: "every-turn", summarizerModel: "default" });

		assert.ok(capturedPrompt.includes("Evidence metadata: {bad json}"));
		assert.match(result.summaryText, /Full output was read|Coverage: partial/);
	});

	it("downgrades unsupported full-read claims for bounded read args", async () => {
		const result = await m.summarizeToolBatch({
			complete: async () => ({
				content: "{\"summaries\":[{\"batchIndex\":0,\"coverage\":\"complete\",\"summary\":\"Coverage: complete\\nFull src/partial.ts read.\"}]}",
			}),
		}, {
			turnIndex: 0,
			toolCalls: [{ id: "bounded-read", name: "read", args: "{\"path\":\"src/partial.ts\",\"limit\":10}", result: "first chars" }],
		}, { enabled: true, pruneOn: "every-turn", summarizerModel: "default" });

		assert.match(result.summaryText, /Coverage: partial/);
	});

	it("ignores explicitly partial full-read wording before checking later unsupported claims", async () => {
		const result = await m.summarizeToolBatch({
			complete: async () => ({
				content: "{\"summaries\":[{\"batchIndex\":0,\"coverage\":\"complete\",\"summary\":\"Coverage: complete\\nFull src/partial.ts remains partial.\\nFull src/partial.ts read.\"}]}",
			}),
		}, {
			turnIndex: 0,
			toolCalls: [{ id: "bounded-read-2", name: "read", args: "{\"path\":\"src/partial.ts\",\"limit\":10}", result: "first chars" }],
		}, { enabled: true, pruneOn: "every-turn", summarizerModel: "default" });

		assert.match(result.summaryText, /Coverage: partial/);
	});

	it("checks unsupported read-completeness helper line by line", () => {
		const batch = {
			turnIndex: 0,
			toolCalls: [{ id: "bounded", name: "read", args: "{\"path\":\"src/file.ts\",\"limit\":10}", result: "first chars" }],
		};
		assert.equal(m.hasUnsupportedReadCompleteness(batch, "Full src/file.ts remains partial.\nFull src/file.ts read."), true);
	});

	it("compacts long metadata result bodies in buildPoolPrompt", () => {
		const longBody = Array.from({ length: 1000 }, (_, index) => `line ${index}`).join("\n");
		const prompt = m.buildPoolPrompt([{
			turnIndex: 1,
			toolCalls: [{ id: "long", name: "read", args: "{\"path\":\"src/long.ts\"}", result: `Result metadata: ref=dsc-long returned_chars=5000 total_chars=9000\n${longBody}` }],
		}], true);

		assert.ok(prompt.includes("dsc-long"));
		assert.ok(prompt.includes("lines omitted") || prompt.includes("truncated"));
	});

	it("recovers structured summaries embedded in surrounding text", async () => {
		const result = await m.summarizeToolBatch({
			complete: async () => ({
				content: "prefix {\"summaries\":[{\"batchIndex\":0,\"coverage\":\"partial\",\"summary\":\"Coverage: partial\\nRead bounded src/embed.ts excerpt.\"}]} suffix",
				usage: { prompt_tokens: 80, completion_tokens: 12 },
			}),
		}, {
			turnIndex: 0,
			toolCalls: [{ id: "embedded", name: "read", args: "{\"path\":\"src/embed.ts\",\"limit\":10}", result: "Result metadata: offset=0 returned_chars=10\nshort" }],
		}, { enabled: true, pruneOn: "every-turn", summarizerModel: "default" });

		assert.match(result.summaryText, /Coverage: partial/);
	});

	it("reads response content arrays with text-only parts", async () => {
		const result = await m.summarizeToolBatch({
			complete: async () => ({
				content: [{ text: "{\"summaries\":[{\"batchIndex\":0,\"coverage\":\"partial\",\"summary\":\"Array response summary.\"}]}" }],
			}),
		}, {
			turnIndex: 0,
			toolCalls: [{ id: "array", name: "bash", args: "printf ok", result: "ok" }],
		}, { enabled: true, pruneOn: "every-turn", summarizerModel: "default" });

		assert.match(result.summaryText, /Array response summary/);
	});

	it("returns observation masks when pi-ai auth lacks an API key", async () => {
		const pool = await m.summarizeToolBatchPool({}, [{
			turnIndex: 0,
			toolCalls: [{ id: "auth", name: "read", args: "{\"path\":\"src/auth.ts\"}", result: "auth result" }],
		}], { enabled: true, pruneOn: "every-turn", summarizerModel: "default" }, {
			ctx: {
				model: { provider: "deepseek", id: "deepseek-v4-flash" },
				modelRegistry: { getApiKeyAndHeaders: async () => ({ ok: true }) },
			},
		});

		assert.equal(pool.metrics.errorKey, "engine.prune.error.summaryAuth");
		assert.match(pool.results[0].summaryText, /Coverage: unknown/);
	});

	it("summarizes through pi-ai when model registry auth is available", async () => {
		globalThis.__piAiComplete = async (model, payload, options) => {
			assert.equal(model.provider, "deepseek");
			assert.equal(model.id, "deepseek-v4-flash");
			assert.equal(options.apiKey, "test-key");
			assert.equal(options.reasoningEffort, undefined);
			assert.equal(payload.messages[0].role, "user");
			return {
				content: "{\"summaries\":[{\"batchIndex\":0,\"coverage\":\"partial\",\"summary\":\"Registry-backed summary.\"}]}",
				usage: { input: 50, output: 8, cacheRead: 5 },
			};
		};
		try {
			const pool = await m.summarizeToolBatchPool({}, [{
				turnIndex: 0,
				toolCalls: [{ id: "registry", name: "read", args: "{\"path\":\"src/registry.ts\"}", result: "registry result" }],
			}], { enabled: true, pruneOn: "every-turn", summarizerModel: "deepseek/deepseek-v4-flash" }, {
				ctx: {
					model: { provider: "deepseek", id: "deepseek-v4-flash" },
					modelRegistry: { getApiKeyAndHeaders: async () => ({ ok: true, apiKey: "test-key", headers: { "x-test": "1" } }) },
				},
			});

			assert.match(pool.results[0].summaryText, /Registry-backed summary/);
			assert.equal(pool.metrics.modelId, "deepseek/deepseek-v4-flash");
		} finally {
			delete globalThis.__piAiComplete;
		}
	});

	it("summarizes through pi-ai using current provider for unqualified model ids", async () => {
		globalThis.__piAiComplete = async (model) => {
			assert.equal(model.provider, "deepseek");
			assert.equal(model.id, "deepseek-v4-flash");
			return {
				content: "{\"summaries\":[{\"batchIndex\":0,\"coverage\":\"partial\",\"summary\":\"Current-provider summary.\"}]}",
				usage: { input: 10, output: 3, cacheRead: 0 },
			};
		};
		try {
			const pool = await m.summarizeToolBatchPool({}, [{
				turnIndex: 0,
				toolCalls: [{ id: "provider", name: "read", args: "{\"path\":\"src/provider.ts\"}", result: "provider result" }],
			}], { enabled: true, pruneOn: "every-turn", summarizerModel: "deepseek-v4-flash" }, {
				ctx: {
					model: { provider: "deepseek", id: "deepseek-chat" },
					modelRegistry: { getApiKeyAndHeaders: async () => ({ ok: true, apiKey: "test-key" }) },
				},
			});
			assert.match(pool.results[0].summaryText, /Current-provider summary/);
		} finally {
			delete globalThis.__piAiComplete;
		}
	});
});
});

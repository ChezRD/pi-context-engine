import { describe, it } from "node:test";
import assert from "node:assert/strict";

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

describe("capper.ts", () => {
  it("loads module and functions", async () => {
m.buildModelVisibleContext = (await import("../../src/model-visible.ts")).buildModelVisibleContext;
m.isModelVisibleContext = (await import("../../src/model-visible.ts")).isModelVisibleContext;
m.extractModelVisibleMetadata = (await import("../../src/model-visible.ts")).extractModelVisibleMetadata;
m.extractModelVisibleSection = (await import("../../src/model-visible.ts")).extractModelVisibleSection;
m.HugeResultStore = (await import("../../src/capper.ts")).HugeResultStore;
m.maybeCapToolResult = (await import("../../src/capper.ts")).maybeCapToolResult;
    assert.ok(m.buildModelVisibleContext);
  });

describe("model-visible", () => {
	it("builds a model-visible block with metadata and named payload sections", () => {
		const text = m.buildModelVisibleContext({
			kind: "context_result_truncated",
			ui: "custom-rendered",
			instructions: "Model-only instruction.",
			metadata: { ref: "dsc-1", bytes: 123 },
			sections: [
				{ name: "slice_metadata", content: "lookup body" },
				{ name: "preview", content: "preview body" },
			],
		});

		assert.ok(m.isModelVisibleContext(text));
		assert.match(text, /<!-- pi-context-engine: model-visible context -->/);
		assert.match(text, /schema="pi\.model_visible_context\.v1"/);
		assert.match(text, /<instructions>\nModel-only instruction\.\n<\/instructions>/);
		assert.ok(text.indexOf("<instructions>") < text.indexOf("<metadata>"));
		assert.match(text, /<payload name="slice_metadata">/);
		assert.match(text, /<payload name="preview">/);
		assert.deepEqual(m.extractModelVisibleMetadata(text), {
			schema: "pi.model_visible_context.v1",
			kind: "context_result_truncated",
			ui: "custom-rendered",
			ref: "dsc-1",
			bytes: 123,
		});
		assert.equal(m.extractModelVisibleSection(text, "slice_metadata"), "lookup body");
		assert.equal(m.extractModelVisibleSection(text, "preview"), "preview body");
	});

	it("returns undefined when metadata JSON is invalid", () => {
		const text = [
			"<!-- pi-context-engine: model-visible context -->",
			"<model_visible_context schema=\"pi.model_visible_context.v1\" kind=\"x\" ui=\"hidden\">",
			"<metadata>",
			"{not json}",
			"</metadata>",
			"</model_visible_context>",
		].join("\n");
		assert.equal(m.extractModelVisibleMetadata(text), undefined);
	});

	it("extracts payload names safely when the section name contains regex characters", () => {
		const text = [
			"<!-- pi-context-engine: model-visible context -->",
			"<model_visible_context schema=\"pi.model_visible_context.v1\" kind=\"x\" ui=\"hidden\">",
			"<metadata>",
			"{}",
			"</metadata>",
			"<payload name=\"slice[0].txt\">",
			"hello",
			"</payload>",
			"</model_visible_context>",
		].join("\n");
		assert.equal(m.extractModelVisibleSection(text, "slice[0].txt"), "hello");
	});

	it("handles model-visible optional metadata, sections, and malformed extraction paths", () => {
		const text = m.buildModelVisibleContext({
			kind: "hidden_context",
			ui: "hidden",
			instructions: "   ",
		});
		assert.equal(text.includes("<instructions>"), false);
		assert.equal(m.isModelVisibleContext(undefined), false);
		assert.equal(m.extractModelVisibleMetadata("<metadata>\nnull\n</metadata>"), undefined);
		assert.equal(m.extractModelVisibleSection(text, "missing"), undefined);
	});
});

describe("HugeResultStore", () => {
	it("stores and retrieves", () => {
		const store = new m.HugeResultStore();
		const rec = store.remember("big data", "tool-1");
		assert.ok(rec.ref);
		assert.equal(rec.toolCallId, "tool-1");
		const got = store.get(rec.ref);
		assert.equal(got.toolCallId, "tool-1");
	});
	it("returns undefined for unknown ref", () => {
		const store = new m.HugeResultStore();
		assert.equal(store.get("unknown"), undefined);
	});
	it("records empty text and non-string tool metadata without losing byte/ref accounting", () => {
		const persisted = [];
		const store = new m.HugeResultStore((record) => persisted.push(record));
		const empty = store.remember("", 42, undefined);
		assert.equal(empty.ref, "dsc-result-1");
		assert.equal(empty.bytes, 0);
		assert.equal(empty.text, "");
		assert.equal(empty.toolCallId, 42);
		assert.equal(persisted.length, 1);
		assert.equal(persisted[0].ref, empty.ref);

		const oddTool = store.remember("payload", null, "Tool Name With Spaces");
		assert.equal(oddTool.ref, "dsc-tool-name-with-space-2");
		assert.equal(oddTool.bytes, Buffer.byteLength("payload"));
		assert.equal(oddTool.toolCallId, null);
		assert.equal(store.get(oddTool.ref).text, "payload");
	});
});

describe("maybeCapToolResult", () => {
	it("passes through when disabled", () => {
		const store = new m.HugeResultStore();
		const r = m.maybeCapToolResult({ toolCallId: "t1", content: "data" }, { hugeResultCapper: false }, store);
		assert.equal(r, undefined);
	});
	it("caps when above threshold", () => {
		const store = new m.HugeResultStore();
		const event = { toolCallId: "t1", content: ["x".repeat(10000)] };
		const r = m.maybeCapToolResult(event, { hugeResultCapper: true, hugeResultChars: 100, hugeResultHeadChars: 50, hugeResultTailChars: 20 }, store);
		assert.ok(JSON.stringify(r.content).includes("<!-- pi-context-engine: model-visible context -->"));
	});
	it("handles undefined event", () => {
		const store = new m.HugeResultStore();
		assert.equal(m.maybeCapToolResult(undefined, { hugeResultCapper: true }, store), undefined);
	});
});
});

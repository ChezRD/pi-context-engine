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

describe("fold-tool.ts", () => {
  it("loads module and functions", async () => {
m.registerFoldTool = (await import("../../../src/cache-engine/fold-tool.ts")).registerFoldTool;
    assert.ok(m.registerFoldTool);
  });

describe("registerFoldTool", () => {
	it("registers context_cache_fold tool", () => {
		const tools = [];
		const state = { config: { locale: "en", enabled: true, autoFold: true }, engine: { foldToolRegistered: false } };
		m.registerFoldTool({ registerTool: (def) => tools.push(def) }, state);
		assert.equal(tools[0].name, "context_cache_fold");
	});
	it("skips when already registered", () => {
		const tools = [];
		const state = { config: { locale: "en", enabled: true, autoFold: true }, engine: { foldToolRegistered: true } };
		m.registerFoldTool({ registerTool: (def) => tools.push(def) }, state);
		assert.equal(tools.length, 0);
	});

	it("skips when extension disabled", () => {
		const tools = [];
		const state = { config: { locale: "en", enabled: false, autoFold: true }, engine: { foldToolRegistered: false } };
		m.registerFoldTool({ registerTool: (def) => tools.push(def) }, state);
		assert.equal(tools.length, 0);
	});

	it("skips when autoFold disabled", () => {
		const tools = [];
		const state = { config: { locale: "en", enabled: true, autoFold: false }, engine: { foldToolRegistered: false } };
		m.registerFoldTool({ registerTool: (def) => tools.push(def) }, state);
		assert.equal(tools.length, 0);
	});

	it("execute triggers fold via compact", async () => {
		const tools = [];
		const state = { config: { locale: "en", enabled: true, autoFold: true }, engine: { foldToolRegistered: false, recentToolCalls: new Map() } };
		let compactCalled = false;
		const pi = {
			registerTool: (def) => tools.push(def),
			compact: async () => { compactCalled = true; return { ok: true, text: "folded" }; },
		};
		m.registerFoldTool(pi, state);
		const tool = tools[0];
		const ctx = { compact: (opts) => pi.compact(opts) };
		const result = await tool.execute("call-1", {}, undefined, undefined, ctx);
		assert.equal(compactCalled, true);
		assert.ok(result.content[0].text);
	});

	it("execute returns failure text when requestFold fails", async () => {
		const tools = [];
		const state = { config: { locale: "en", enabled: true, autoFold: true }, engine: { foldToolRegistered: false, recentToolCalls: new Map() } };
		const pi = {
			registerTool: (def) => tools.push(def),
			compact: async () => ({ ok: false, error: "something went wrong" }),
		};
		m.registerFoldTool(pi, state);
		const tool = tools[0];
		const ctx = { compact: (opts) => pi.compact(opts) };
		const result = await tool.execute("call-2", {}, undefined, undefined, ctx);
		assert.ok(result.content[0].text);
	});
});
});

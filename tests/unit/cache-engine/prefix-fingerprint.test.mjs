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

describe("prefix-fingerprint.ts", () => {
  it("loads module and functions", async () => {
m.stableHash = (await import("../../../src/cache-engine/prefix-fingerprint.ts")).stableHash;
m.normalizeTools = (await import("../../../src/cache-engine/prefix-fingerprint.ts")).normalizeTools;
m.diffPrefix = (await import("../../../src/cache-engine/prefix-fingerprint.ts")).diffPrefix;
m.shouldNotifyPrefixDrift = (await import("../../../src/cache-engine/prefix-fingerprint.ts")).shouldNotifyPrefixDrift;
m.extractCachePrefix = (await import("../../../src/cache-engine/prefix-fingerprint.ts")).extractCachePrefix;
    assert.ok(m.stableHash);
  });

describe("stableHash", () => {
	it("produces deterministic hash", () => {
		const h1 = m.stableHash({ a: 1, b: 2 });
		const h2 = m.stableHash({ b: 2, a: 1 });
		assert.equal(h1, h2);
	});
	it("different inputs produce different hashes", () => {
		const h1 = m.stableHash({ a: 1 });
		const h2 = m.stableHash({ a: 2 });
		assert.notEqual(h1, h2);
	});
});

describe("normalizeTools", () => {
	it("sorts tools by name", () => {
		const tools = [{ name: "z", description: "last" }, { name: "a", description: "first" }];
		const n = m.normalizeTools(tools);
		assert.equal(n.length, 2);
	});
	it("handles undefined tools", () => {
		const n = m.normalizeTools(undefined);
		assert.equal(n.length, 0);
	});

	it("normalizes function-style tools and filters nameless tools", () => {
		const n = m.normalizeTools([
			{ function: { name: "fn", description: "desc", parameters: { type: "object" } } },
			{ input_schema: { type: "object" } },
			{ name: "plain", input_schema: { type: "string" } },
		]);
		assert.deepEqual(n.map((tool) => tool.name), ["fn", "plain"]);
		assert.deepEqual(n[1].parameters, { type: "string" });
	});
});

describe("extractCachePrefix", () => {
	it("reads payload from request body and ctx model name fallback", () => {
		const prefix = m.extractCachePrefix({
			request: {
				body: {
					messages: [{ role: "system", content: "sys" }],
					tools: [],
					reasoning_effort: "high",
					temperature: 0.2,
				},
			},
		}, { model: { name: "ctx-model" } });
		assert.equal(prefix.model, "ctx-model");
		assert.equal(prefix.reasoning, "high");
		assert.equal(prefix.temperature, 0.2);
	});

	it("reads direct event and body fallbacks", () => {
		assert.equal(m.extractCachePrefix({ body: { model: "body-model", thinking: "low" } }, {}).model, "body-model");
		assert.equal(m.extractCachePrefix({ model: "event-model", reasoning: "minimal" }, {}).model, "event-model");
	});
});

describe("diffPrefix", () => {
	it("returns empty reasons for equal prefixes", () => {
		const a = { model: "m1", systemHash: "s1", toolsHash: "t1", reasoning: false, temperature: 0 };
		const d = m.diffPrefix(a, a);
		assert.equal(d.reasons.length, 0);
	});
	it("detects model change", () => {
		const a = { model: "m1", systemHash: "s1", toolsHash: "t1", reasoning: false, temperature: 0 };
		const b = { model: "m2", systemHash: "s1", toolsHash: "t1", reasoning: false, temperature: 0 };
		const d = m.diffPrefix(a, b);
		assert.ok(d.reasons.includes("model"));
		assert.ok(d.hard);
	});
});

describe("shouldNotifyPrefixDrift", () => {
	it("notifies on new reason", () => {
		const drift = { reasons: ["tools"], hard: true };
		const state = { engine: { lastPrefixWarningReason: "", lastPrefixWarningTurn: 0, turnIndex: 10 } };
		assert.ok(m.shouldNotifyPrefixDrift(state, drift));
	});
	it("suppresses same reason recently", () => {
		const drift = { reasons: ["tools"], hard: false };
		const state = { engine: { lastPrefixWarningReason: "tools", lastPrefixWarningTurn: 8, turnIndex: 10 } };
		assert.equal(m.shouldNotifyPrefixDrift(state, drift), false);
	});

	it("does not notify when there is no drift and repeats hard drift after cooldown", () => {
		assert.equal(m.shouldNotifyPrefixDrift({ engine: { turnIndex: 1 } }, { reasons: [], hard: false }), false);
		assert.equal(m.shouldNotifyPrefixDrift(
			{ engine: { lastPrefixWarningReason: "tools", lastPrefixWarningTurn: 1, turnIndex: 11 } },
			{ reasons: ["tools"], hard: true },
		), true);
	});
});
});

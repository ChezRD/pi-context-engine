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

describe("Append-only projection", () => {
  it("loads module and functions", async () => {
m.activateAppendOnlyProjectionFromCompact = (await import("../../../src/cache-engine/append-only-projection.ts")).activateAppendOnlyProjectionFromCompact;
m.applyAppendOnlyProjection = (await import("../../../src/cache-engine/append-only-projection.ts")).applyAppendOnlyProjection;
    assert.ok(m.activateAppendOnlyProjectionFromCompact);
  });

describe("activateAppendOnlyProjectionFromCompact", () => {
	it("sets projection active with summary", () => {
		const st = { config: { appendOnlyProjection: true }, engine: { appendOnly: { enabled: false, projectionActive: false, stableSummary: null, tailStartEntryId: "", tailFingerprint: undefined, invalidatedReasonKey: undefined } } };
		m.activateAppendOnlyProjectionFromCompact({ summary: "fold summary", firstKeptEntryId: "entry-5" }, st);
		assert.ok(st.engine.appendOnly.projectionActive);
		assert.equal(st.engine.appendOnly.tailStartEntryId, "entry-5");
	});
	it("re-activates with new summary and clears stale invalidation", () => {
		const st = {
			config: { appendOnlyProjection: true },
			engine: {
				appendOnly: {
					enabled: true,
					projectionActive: true,
					stableSummary: { role: "assistant", content: "old" },
					tailStartEntryId: "old-tail",
					tailFingerprint: "old-hash",
					invalidatedReasonKey: "engine.appendOnly.invalidated.tailChanged",
				},
			},
		};
		m.activateAppendOnlyProjectionFromCompact({ summary: "new summary", firstKeptEntryId: "new-tail" }, st);
		assert.equal(st.engine.appendOnly.projectionActive, true);
		assert.equal(st.engine.appendOnly.stableSummary.content[0].text, "new summary");
		assert.equal(st.engine.appendOnly.stableSummary.content[0].type, "text");
		assert.equal(st.engine.appendOnly.tailStartEntryId, "new-tail");
		assert.equal(st.engine.appendOnly.tailFingerprint, undefined);
		assert.equal(st.engine.appendOnly.invalidatedReasonKey, undefined);
	});
	it("skips activation when summary or tail start id is missing", () => {
		const st = { config: { appendOnlyProjection: true }, engine: { appendOnly: { projectionActive: false } } };
		m.activateAppendOnlyProjectionFromCompact({ summary: "x" }, st);
		assert.equal(st.engine.appendOnly.projectionActive, false);
		m.activateAppendOnlyProjectionFromCompact({ firstKeptEntryId: "tail" }, st);
		assert.equal(st.engine.appendOnly.projectionActive, false);
	});
	it("skips when appendOnlyProjection disabled", () => {
		const st = { config: { appendOnlyProjection: false }, engine: { appendOnly: {} } };
		m.activateAppendOnlyProjectionFromCompact({ summary: "x", firstKeptEntryId: "y" }, st);
		assert.equal(st.engine.appendOnly.projectionActive, undefined);
	});
});

describe("applyAppendOnlyProjection", () => {
	it("returns undefined when projection inactive", () => {
		const st = { config: { enabled: true, appendOnlyProjection: true }, engine: { appendOnly: { enabled: true, projectionActive: false } } };
		assert.equal(m.applyAppendOnlyProjection({ messages: [] }, {}, st), undefined);
	});
	it("returns undefined when disabled", () => {
		const st = { config: { enabled: true, appendOnlyProjection: false }, engine: { appendOnly: { enabled: false } } };
		assert.equal(m.applyAppendOnlyProjection({ messages: [] }, {}, st), undefined);
	});
});
});

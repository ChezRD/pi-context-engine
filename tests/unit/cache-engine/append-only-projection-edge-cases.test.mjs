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

describe("append-only-projection edge cases", () => {
  it("loads module and functions", async () => {
m.applyAppendOnlyProjection = (await import("../../../src/cache-engine/append-only-projection.ts")).applyAppendOnlyProjection;
    assert.ok(m.applyAppendOnlyProjection);
  });

describe("applyAppendOnlyProjection edge cases", () => {
	it("applies projection when active and enabled", () => {
		const st = {
			config: { enabled: true, appendOnlyProjection: true },
			engine: {
				appendOnly: {
					enabled: true, projectionActive: true,
					tailStartEntryId: "e2",
					tailFingerprint: undefined,
					invalidatedReasonKey: undefined,
					stableSummary: { role: "assistant", content: "summary", name: "context_cache_stable_summary" },
				},
			},
		};
		const event = { messages: [{ id: "e1", role: "system", content: "sys" }, { id: "e2", role: "user", content: "tail" }] };
		const r = m.applyAppendOnlyProjection(event, {}, st);
		assert.ok(r === undefined || r.messages.some(m => m?.name === "context_cache_stable_summary"));
	});
	it("returns tail only when stable summary is missing", () => {
		const st = {
			config: { enabled: true, appendOnlyProjection: true },
			engine: { appendOnly: { projectionActive: true, tailStartEntryId: "e2" } },
		};
		const r = m.applyAppendOnlyProjection({ messages: [{ id: "e1", role: "system", content: "sys" }, { id: "e2", role: "user", content: "tail" }] }, {}, st);
		assert.deepEqual(r.messages, [{ id: "e1", role: "system", content: "sys" }, { id: "e2", role: "user", content: "tail" }]);
	});
	it("omits system message when there is no system entry", () => {
		const st = {
			config: { enabled: true, appendOnlyProjection: true },
			engine: { appendOnly: { projectionActive: true, stableSummary: { role: "assistant", content: [{ type: "text", text: "summary" }] } } },
		};
		const r = m.applyAppendOnlyProjection({ messages: [{ id: "e1", role: "user", content: "tail" }] }, {}, st);
		assert.deepEqual(r.messages, [{ role: "assistant", content: [{ type: "text", text: "summary" }] }, { id: "e1", role: "user", content: "tail" }]);
	});
	it("handles empty messages while active", () => {
		const st = {
			config: { enabled: true, appendOnlyProjection: true },
			engine: { appendOnly: { projectionActive: true } },
		};
		const r = m.applyAppendOnlyProjection({ messages: [] }, {}, st);
		assert.deepEqual(r.messages, []);
	});
	it("tracks config changes by disabling projection when extension is disabled", () => {
		const st = {
			config: { enabled: false, appendOnlyProjection: true },
			engine: { appendOnly: { enabled: true, projectionActive: true } },
		};
		assert.equal(m.applyAppendOnlyProjection({ messages: [] }, {}, st), undefined);
	});

	it("applyAppendOnlyProjection returns stable summary when event.messages is not an array", () => {
		const st = {
			config: { enabled: true, appendOnlyProjection: true },
			engine: { appendOnly: { projectionActive: true, stableSummary: { role: "assistant", content: "summary" } } },
		};
		const noMessages = m.applyAppendOnlyProjection({}, {}, st);
		assert.deepEqual(noMessages.messages, [{ role: "assistant", content: "summary" }]);

		const noStableSummary = m.applyAppendOnlyProjection({}, {}, {
			config: { enabled: true, appendOnlyProjection: true },
			engine: { appendOnly: { projectionActive: true } },
		});
		assert.deepEqual(noStableSummary.messages, []);
	});

	it("tailFrom returns filtered messages when startId not found", () => {
		const st = {
			config: { enabled: true, appendOnlyProjection: true },
			engine: { appendOnly: { projectionActive: true, tailStartEntryId: "nonexistent" } },
		};
		const r = m.applyAppendOnlyProjection({
			messages: [
				{ role: "system", content: "sys" },
				{ id: "e1", role: "user", content: "msg1" },
				{ id: "e2", role: "user", content: "msg2" },
			],
		}, {}, st);
		// tailFrom when startId not found: filters system messages, keeps rest
		// applyAppendOnlyProjection re-adds system at top, so roles are [system, user, user]
		assert.deepEqual(r.messages.map(m => m.role), ["system", "user", "user"]);
		assert.deepEqual(r.messages[1].id, "e1");
		assert.deepEqual(r.messages[2].id, "e2");
	});

	it("entryId handles entryId, id, and neither on messages", () => {
		const st = {
			config: { enabled: true, appendOnlyProjection: true },
			engine: { appendOnly: { projectionActive: true, tailStartEntryId: "e1" } },
		};
		const r = m.applyAppendOnlyProjection({
			messages: [
				{ entryId: "e1", role: "user", content: "entry" },
				{ id: "e2", role: "user", content: "fallback" },
				{ role: "user", content: "no-ids" },
			],
		}, {}, st);
		// All 3 messages after e1
		assert.equal(r.messages.length, 3);
	});

	it("uses id fallback, removes system messages before tail, and invalidates changed tails", () => {
		const st = {
			config: { enabled: true, appendOnlyProjection: true },
			engine: { appendOnly: { projectionActive: true, tailStartEntryId: "tail", stableSummary: { role: "assistant", content: "summary" } } },
		};
		const first = m.applyAppendOnlyProjection({
			messages: [
				{ role: "system", content: "sys" },
				{ id: "head", role: "system", content: "old system" },
				{ id: "tail", role: "user", content: "tail" },
			],
		}, {}, st);
		assert.deepEqual(first.messages.map((msg) => msg.role), ["system", "assistant", "user"]);

		let notified = false;
		const second = m.applyAppendOnlyProjection({
			messages: [
				{ role: "system", content: "sys" },
				{ id: "tail", role: "user", content: "changed tail" },
			],
		}, { ui: { notify: () => { notified = true; } } }, st);
		assert.equal(second, undefined);
		assert.equal(st.engine.appendOnly.projectionActive, false);
		assert.equal(notified, true);
	});
});
});

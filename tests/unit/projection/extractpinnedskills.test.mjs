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

describe("extractPinnedSkills", () => {
  it("loads module and functions", async () => {
m.extractPinnedSkills = (await import("../../../src/projection/history-folder.ts")).extractPinnedSkills;
    assert.ok(m.extractPinnedSkills);
  });

describe("extractPinnedSkills", () => {
	it("extracts from system message", () => {
		const s = m.extractPinnedSkills([{ role: "system", content: '<skill-pin name="skills-a">\ncontent a\n</skill-pin>' }]);
		assert.equal(s.length, 1);
		assert.equal(s[0].id, "skills-a");
	});
	it("returns empty for no matches", () => assert.equal(m.extractPinnedSkills([{ role: "user", content: "hi" }]).length, 0));
	it("deduplicates by name, last wins", () => {
		const s = m.extractPinnedSkills([
			{ role: "system", content: '<skill-pin name="x">\nv1\n</skill-pin>' },
			{ role: "system", content: '<skill-pin name="x">\nv2\n</skill-pin>' },
		]);
		assert.equal(s.length, 1);
		assert.ok(s[0].content.includes("v2"));
	});
	it("handles non-string content", () => assert.equal(m.extractPinnedSkills([{ role: "user", content: ["not string"] }]).length, 0));
	it("multiple skills from one message", () => {
		const s = m.extractPinnedSkills([{ role: "system", content: '<skill-pin name="a">\nx\n</skill-pin><skill-pin name="b">\ny\n</skill-pin>' }]);
		assert.equal(s.length, 2);
	});
});
});

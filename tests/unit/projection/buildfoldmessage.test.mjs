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

describe("buildFoldMessage", () => {
  it("loads module and functions", async () => {
m.buildFoldMessage = (await import("../../../src/projection/history-folder.ts")).buildFoldMessage;
m.buildEffectiveFoldGuidance = (await import("../../../src/projection/history-folder.ts")).buildEffectiveFoldGuidance;
m.extractEffectiveNudgeGuidance = (await import("../../../src/projection/history-folder.ts")).extractEffectiveNudgeGuidance;
m.extractSessionIntent = (await import("../../../src/projection/history-folder.ts")).extractSessionIntent;
    assert.ok(m.buildFoldMessage);
  });

describe("buildFoldMessage", () => {
	it("includes marker, skills, constraints", () => {
		const msg = m.buildFoldMessage("<m>", "summary text", [{ id: "s1", content: "<skill-pin name=\"s1\">\nc\n</skill-pin>" }], ["[HIGH PRIORITY] urgent"], [], "Initial user goal: prune safely", "Use structured tool calls.");
		assert.ok(Array.isArray(msg.content));
		assert.equal(msg.content[0].type, "text");
		assert.ok(msg.content[0].text.includes("<m>"));
		assert.ok(msg.content[0].text.includes("summary text"));
		assert.ok(msg.content[0].text.includes("Session intent"));
		assert.ok(msg.content[0].text.includes("prune safely"));
		assert.ok(msg.content[0].text.includes("operating guidance"));
		assert.ok(msg.content[0].text.includes("structured tool calls"));
		assert.ok(msg.content[0].text.includes("skill-pin"));
		assert.ok(msg.content[0].text.includes("HIGH PRIORITY"));
		assert.equal(msg.role, "user");
	});
	it("omits skills when empty", () => {
		const msg = m.buildFoldMessage("<m>", "s", [], ["[HIGH PRIORITY] x"]);
		assert.ok(!msg.content[0].text.includes("skill-pin"));
	});
	it("omits constraints when empty", () => {
		const msg = m.buildFoldMessage("<m>", "s", [], []);
		assert.ok(!msg.content[0].text.includes("HIGH PRIORITY"));
	});
});

describe("buildEffectiveFoldGuidance", () => {
	it("preserves intent and tool/evidence rules outside model-generated summaries", () => {
		const guidance = m.buildEffectiveFoldGuidance({ kind: "analyze", reasonCode: "analysis_request", confidence: "medium", matchedAction: "аудит" });
		assert.match(guidance, /Current detected user intent: analyze/);
		assert.match(guidance, /matched=аудит/);
		assert.match(guidance, /structured tool calls/);
		assert.match(guidance, /partial reads/);
		assert.match(guidance, /separate proven facts, weak signals, and unknowns/);
	});

	it("extracts prior intent nudges from folded messages", () => {
		const guidance = m.extractEffectiveNudgeGuidance([
			{ role: "custom", content: "[pi-context-engine user intent]\nintent: analyze\nreason: analysis_request\nmatched_signal: аудит\n[/pi-context-engine user intent]" },
			{ role: "system", content: "[pi-context-engine intent nudge]\nDetected pending tool intent: read.\n[/pi-context-engine intent nudge]" },
		]);
		assert.match(guidance, /Observed prior user-intent nudge: analyze/);
		assert.match(guidance, /matched=аудит/);
		assert.match(guidance, /Observed prior tool-intent nudge: read/);
		assert.match(guidance, /structured tool calls/);
	});
});

describe("extractSessionIntent", () => {
	it("extracts first user goal and explicit constraints deterministically", () => {
		const intent = m.extractSessionIntent([
			{ role: "assistant", content: "hello" },
			{ role: "user", content: "Keep prune cheap and auditable." },
			{ role: "user", content: "[Project memory] prefer deterministic metadata" },
		], 240);
		assert.match(intent, /Initial user goal: Keep prune cheap/);
		assert.match(intent, /Constraint: \[Project memory\] prefer deterministic metadata/);
		assert.ok(intent.length <= 240);
	});
});
});

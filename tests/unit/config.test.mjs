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

describe("config.ts", () => {
  it("loads module and functions", async () => {
m.readConfig = (await import("../../src/config.ts")).readConfig;
m.DEFAULT_CONFIG = (await import("../../src/config.ts")).DEFAULT_CONFIG;
m.writeConfig = (await import("../../src/config.ts")).writeConfig;
    assert.ok(m.readConfig);
  });

describe("readConfig", () => {
	it("returns default config when no file exists", () => {
		const cfg = m.readConfig("/nonexistent/path.json");
		assert.ok(cfg.enabled);
		assert.equal(cfg.foldThreshold, 0.75);
	});

	it("returns defaults for malformed config and reports write failures", () => {
		const previousWarn = console.warn;
		const warnings = [];
		console.warn = (message) => warnings.push(message);
		try {
			const cfg = m.readConfig(new URL("../fixtures/malformed-config.json", import.meta.url));
			assert.equal(cfg.enabled, true);
			assert.ok(warnings.some((message) => String(message).includes("failed to read config")));
		} finally {
			console.warn = previousWarn;
		}

		const result = m.writeConfig(m.DEFAULT_CONFIG, process.cwd());
		assert.equal(result.ok, false);
		assert.equal(typeof result.error, "string");
	});
});

describe("defaultConfig", () => {
	it("has fold threshold", () => assert.equal(m.DEFAULT_CONFIG.foldThreshold, 0.75));
	it("has aggressive threshold", () => assert.equal(m.DEFAULT_CONFIG.aggressiveFoldThreshold, 0.78));
	it("has prune enabled by default", () => assert.equal(m.DEFAULT_CONFIG.pruneEnabled, true));
	it("has prune after agent response by default", () => assert.equal(m.DEFAULT_CONFIG.pruneOn, "agent-message"));
	it("defers agent-message prune fallback until next user turn by default", () => assert.equal(m.DEFAULT_CONFIG.pruneAgentMessageFallback, "next-agent-start"));
	it("has toolStabilityBypass containing read by default", () => assert.deepEqual(m.DEFAULT_CONFIG.toolStabilityBypass, ["read"]));
	it("has toolBlockThreshold of 2 by default", () => assert.equal(m.DEFAULT_CONFIG.toolBlockThreshold, 2));
	it("parseConfig reads toolStabilityBypass from JSON", async () => {
		const { parseConfig } = await import("../../src/config.ts");
		const parsed = parseConfig({ toolStabilityBypass: ["bash", "edit"] });
		assert.deepEqual(parsed.toolStabilityBypass, ["bash", "edit"]);
	});
	it("parseConfig handles malformed toolStabilityBypass", async () => {
		const { parseConfig } = await import("../../src/config.ts");
		const parsed = parseConfig({ toolStabilityBypass: "not-array" });
		assert.deepEqual(parsed.toolStabilityBypass, ["read"]);
	});
	it("parseConfig reads toolBlockThreshold", async () => {
		const { parseConfig } = await import("../../src/config.ts");
		const parsed = parseConfig({ toolBlockThreshold: 5 });
		assert.equal(parsed.toolBlockThreshold, 5);
	});
	it("parseConfig clamps toolBlockThreshold to 1-10", async () => {
		const { parseConfig } = await import("../../src/config.ts");
		assert.equal(parseConfig({ toolBlockThreshold: 0 }).toolBlockThreshold, 1);
		assert.equal(parseConfig({ toolBlockThreshold: 11 }).toolBlockThreshold, 10);
	});
});
});

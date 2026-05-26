import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
register("../__mocks__/loader.mjs", import.meta.url);

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

describe("i18n", () => {
  it("loads module and functions", async () => {
m.t = (await import("../../src/i18n/index.ts")).t;
m.tArray = (await import("../../src/i18n/index.ts")).tArray;
m.tArrayMerged = (await import("../../src/i18n/index.ts")).tArrayMerged;
m.detectLocale = (await import("../../src/i18n/index.ts")).detectLocale;
m.applyLocale = (await import("../../src/i18n/index.ts")).applyLocale;
m.getActiveLocale = (await import("../../src/i18n/index.ts")).getActiveLocale;
m.findLocaleMap = (await import("../../src/i18n/index.ts")).findLocaleMap;
    assert.ok(m.t);
  });

describe("t()", () => {
	it("falls back to default locale when locale missing", () => {
		const result = m.t({ locale: "xx" }, "status.title");
		assert.ok(typeof result === "string");
		assert.ok(result.length > 0);
	});
	it("interpolates variables", () => assert.ok(m.t({ locale: "en" }, "status.ctxPct", { pct: 42 }).includes("42")));

	it("detects locale from config file without asserting translated text", () => {
		const previousHome = process.env.HOME;
		const home = mkdtempSync(join(tmpdir(), "i18n-home-"));
		mkdirSync(join(home, ".config", "rpiv-i18n"), { recursive: true });
		writeFileSync(join(home, ".config", "rpiv-i18n", "locale.json"), JSON.stringify({ locale: "zh_TW.UTF-8" }));
		process.env.HOME = home;
		m.applyLocale(undefined);
		try {
			assert.equal(m.detectLocale(), "zh-TW");
			assert.equal(m.getActiveLocale(), "zh-TW");
			assert.equal(typeof m.t("status.title"), "string");
		} finally {
			if (previousHome === undefined) delete process.env.HOME;
			else process.env.HOME = previousHome;
			m.applyLocale("en");
		}
	});

	it("ignores unreadable or malformed locale config without assuming root language", () => {
		const previousHome = process.env.HOME;
		const previousLang = process.env.LANG;
		const home = mkdtempSync(join(tmpdir(), "i18n-bad-home-"));
		mkdirSync(join(home, ".config", "rpiv-i18n"), { recursive: true });
		writeFileSync(join(home, ".config", "rpiv-i18n", "locale.json"), "{bad json");
		process.env.HOME = home;
		process.env.LANG = "C";
		m.applyLocale(undefined);
		try {
			assert.equal(typeof m.detectLocale(), "string");
			assert.equal(typeof m.t("status.title"), "string");
		} finally {
			if (previousHome === undefined) delete process.env.HOME;
			else process.env.HOME = previousHome;
			if (previousLang === undefined) delete process.env.LANG;
			else process.env.LANG = previousLang;
			m.applyLocale("en");
		}
	});

	it("falls back through locale parents for arrays by key shape", () => {
		const merged = m.tArrayMerged("engine.deadlockPatterns", "zh-TW");
		assert.ok(Array.isArray(merged));
		assert.ok(merged.length > 0);
		assert.equal(new Set(merged).size, merged.length);
	});

	it("merges parent-locale arrays without assuming root locale text", () => {
		const merged = m.tArrayMerged("engine.deadlockPatterns", "pt-PT");
		assert.ok(Array.isArray(merged));
		assert.ok(merged.length > 0);
		assert.equal(new Set(merged).size, merged.length);
	});

	it("uses sibling locale fallback and string-array conversion by key shape", () => {
		m.applyLocale("zh-HK");
		assert.equal(typeof m.t("status.title"), "string");
		const merged = m.tArrayMerged("status.title", "zh-HK");
		assert.ok(Array.isArray(merged));
		assert.ok(merged.length > 0);
		m.applyLocale("en");
	});

	it("finds sibling locale maps directly by language prefix", () => {
		const zhCN = { marker: "zh-cn" };
		const result = m.findLocaleMap(new Map([["en", { marker: "en" }], ["zh-CN", zhCN]]), "zh-HK");
		assert.equal(result, zhCN);
	});

	it("returns arrays from active locale and pipe-delimited string keys", () => {
		m.applyLocale("en");
		assert.ok(m.tArray("engine.deadlockPatterns").length > 0);
		assert.deepEqual(m.tArray("status.title"), [m.t("status.title")]);
		assert.deepEqual(m.tArray("missing.array.key"), []);
	});
});
});

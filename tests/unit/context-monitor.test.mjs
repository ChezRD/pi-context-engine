import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";
register("../__mocks__/loader.mjs", import.meta.url);

const m = {};

describe("context-monitor", () => {
  it("loads module and functions", async () => {
    Object.assign(m, await import("../../src/context-monitor.ts"));
    assert.equal(typeof m.getContextPercent, "function");
    assert.equal(typeof m.readContextPercent, "function");
    assert.equal(typeof m.recommendContextAction, "function");
  });

  it("getContextPercent returns undefined for empty object", () => {
    assert.equal(m.getContextPercent({}), undefined);
  });

  it("getContextPercent returns undefined when max is 0", () => {
    assert.equal(m.getContextPercent({ usedTokens: 100, maxTokens: 0 }), undefined);
  });

  it("getContextPercent returns ratio when both used and max present", () => {
    assert.equal(m.getContextPercent({ usedTokens: 50, maxTokens: 100 }), 0.5);
  });

  it("getContextPercent handles percent field directly", () => {
    assert.equal(m.getContextPercent({ percent: 75 }), 0.75);
    assert.equal(m.getContextPercent({ pct: 0.5 }), 0.5);
  });

  it("getContextPercent returns undefined for non-object", () => {
    assert.equal(m.getContextPercent(null), undefined);
    assert.equal(m.getContextPercent("foo"), undefined);
  });
});

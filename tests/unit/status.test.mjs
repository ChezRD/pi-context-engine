import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";
register("../__mocks__/loader.mjs", import.meta.url);

const m = {};

describe("status", () => {
  it("loads module and exports", async () => {
    Object.assign(m, await import("../../src/status.ts"));
    Object.assign(m, await import("../../src/runtime-state.ts"));
    assert.ok(m.buildStatus);
    assert.ok(m.buildDetailedStatus);
    assert.ok(m.setStatus);
  });

  it("includes detection warnings in detailed status", () => {
    const state = m.createRuntimeState();
    state.detection = {
      ok: false,
      provider: "test-provider",
      modelId: "test-model",
      kind: "misconfigured",
      warnings: ["warning one", "warning two"],
    };

    const text = m.buildDetailedStatus({}, state);

    assert.ok(text.includes("warning one"));
    assert.ok(text.includes("warning two"));
  });

  it("setStatus handles missing context without touching UI", () => {
    const state = m.createRuntimeState();
    state.config.enabled = true;
    state.config.statusLine = true;
    state.detection = { ok: true, active: true, provider: "deepseek", modelId: "deepseek-chat", kind: "deepseek" };

    assert.doesNotThrow(() => m.setStatus(undefined, state));
  });

  it("setStatus falls back to state context percentage when ctx has only UI", () => {
    const state = m.createRuntimeState();
    state.config.enabled = true;
    state.config.statusLine = true;
    state.contextPct = 0.42;
    state.detection = { ok: true, warnings: [], provider: "deepseek", modelId: "deepseek-chat", kind: "native" };
    let status;

    m.setStatus({ ui: { setStatus: (_key, value) => { status = value; } } }, state);

    assert.equal(typeof status, "string");
  });
});

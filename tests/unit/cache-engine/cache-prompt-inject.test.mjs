import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";
register("./../../__mocks__/loader.mjs", import.meta.url);

const m = {};
describe("cache-prompt-inject", () => {
  it("loads module", async () => {
    const mod = await import("../../../src/cache-engine/cache-prompt-inject.ts");
    m.maybeInjectCachePrompt = mod.maybeInjectCachePrompt;
    assert.equal(typeof m.maybeInjectCachePrompt, "function");
  });

  it("returns undefined when disabled", async () => {
    const state = { config: { enabled: true, cachePromptInjection: false } };
    const result = m.maybeInjectCachePrompt({}, {}, state);
    assert.equal(result, undefined);
  });

  it("returns undefined when engine disabled", async () => {
    const state = { config: { enabled: false, cachePromptInjection: true } };
    const result = m.maybeInjectCachePrompt({}, {}, state);
    assert.equal(result, undefined);
  });

  it("returns undefined when cache prompt already present", async () => {
    const state = { config: { enabled: true, cachePromptInjection: true } };
    const event = { systemPrompt: "Some prompt\n[Context Engine]\nwith content" };
    const result = m.maybeInjectCachePrompt(event, {}, state);
    assert.equal(result, undefined);
  });

  it("injects cache prompt via event.systemPrompt", async () => {
    const state = { config: { enabled: true, cachePromptInjection: true } };
    const event = { systemPrompt: "Existing prompt" };
    const result = m.maybeInjectCachePrompt(event, {}, state);
    assert.notEqual(result, undefined);
    assert.ok(result.systemPrompt.includes("[Context Engine]"));
    assert.ok(result.systemPrompt.startsWith("Existing prompt"));
  });

  it("injects cache prompt via ctx.getSystemPrompt", async () => {
    const state = { config: { enabled: true, cachePromptInjection: true } };
    const ctx = { getSystemPrompt: () => "Context prompt" };
    const result = m.maybeInjectCachePrompt(undefined, ctx, state);
    assert.notEqual(result, undefined);
    assert.ok(result.systemPrompt.includes("[Context Engine]"));
  });

  it("returns injection for no system prompt source (uses empty string)", async () => {
    const state = { config: { enabled: true, cachePromptInjection: true } };
    const result = m.maybeInjectCachePrompt(undefined, {}, state);
    assert.notEqual(result, undefined);
    assert.ok(result.systemPrompt.includes("[Context Engine]"));
  });

  it("injects to empty system prompt", async () => {
    const state = { config: { enabled: true, cachePromptInjection: true } };
    const event = { systemPrompt: "" };
    const result = m.maybeInjectCachePrompt(event, {}, state);
    assert.notEqual(result, undefined);
    assert.ok(result.systemPrompt.includes("[Context Engine]"));
  });
});

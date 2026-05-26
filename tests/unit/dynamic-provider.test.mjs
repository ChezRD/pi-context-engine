import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";
register("../__mocks__/loader.mjs", import.meta.url);

const m = {};

describe("dynamic-provider", () => {
  it("loads module and exports", async () => {
    Object.assign(m, await import("../../src/dynamic-provider.ts"));
    assert.ok(m.maybeRegisterDynamicProvider);
  });

  it("maybeRegisterDynamicProvider returns [] for no provider", async () => {
    const result = await m.maybeRegisterDynamicProvider({}, {});
    assert.ok(Array.isArray(result));
  });

  it("fetchDeepSeekModelIds handles missing key, non-ok, empty, and duplicate responses", async () => {
    const previousFetch = globalThis.fetch;
    const previousKey = process.env.DEEPSEEK_API_KEY;
    delete process.env.DEEPSEEK_API_KEY;
    try {
      assert.equal(await m.fetchDeepSeekModelIds({
        deepseekApiKeyEnv: "DEEPSEEK_API_KEY",
        deepseekBaseUrl: "https://example.test///",
      }), undefined);

      process.env.DEEPSEEK_API_KEY = "test-key";
      globalThis.fetch = async () => ({ ok: false });
      assert.equal(await m.fetchDeepSeekModelIds({
        deepseekApiKeyEnv: "DEEPSEEK_API_KEY",
        deepseekBaseUrl: "https://example.test///",
      }), undefined);

      globalThis.fetch = async () => ({ ok: true, json: async () => ({ data: [{ id: "a" }, { id: "" }, {}, { id: "a" }, { id: "b" }] }) });
      assert.deepEqual(await m.fetchDeepSeekModelIds({
        deepseekApiKeyEnv: "DEEPSEEK_API_KEY",
        deepseekBaseUrl: "https://example.test///",
      }), ["a", "b"]);

      globalThis.fetch = async () => ({ ok: true, json: async () => ({ data: [] }) });
      assert.equal(await m.fetchDeepSeekModelIds({
        deepseekApiKeyEnv: "DEEPSEEK_API_KEY",
        deepseekBaseUrl: "",
      }), undefined);

      globalThis.fetch = async () => ({ ok: true, json: async () => ({ data: { id: "not-array" } }) });
      assert.equal(await m.fetchDeepSeekModelIds({
        deepseekApiKeyEnv: "DEEPSEEK_API_KEY",
        deepseekBaseUrl: "https://example.test",
      }), undefined);
    } finally {
      globalThis.fetch = previousFetch;
      if (previousKey === undefined) delete process.env.DEEPSEEK_API_KEY;
      else process.env.DEEPSEEK_API_KEY = previousKey;
    }
  });

  it("builds dynamic models and registers fallback or fetched providers", async () => {
    const models = m.buildDynamicModels(["deepseek-v4-pro", "deepseek_reasoner", "deepseek-chat"]);
    assert.equal(models[0].name, "Deepseek V4 Pro");
    assert.equal(models[0].reasoning, true);
    assert.equal(models[2].contextWindow, 128000);
    assert.equal(models[0].cost.input, 0.435);

    const registered = [];
    const previousFetch = globalThis.fetch;
    const previousKey = process.env.DEEPSEEK_API_KEY;
    process.env.DEEPSEEK_API_KEY = "test-key";
    globalThis.fetch = async () => ({ ok: true, json: async () => ({ data: [{ id: "deepseek-chat" }] }) });
    try {
      const ids = await m.maybeRegisterDynamicProvider({ registerProvider: (...args) => registered.push(args) }, {
        registerDynamicProvider: true,
        dynamicProviderName: "context-engine",
        allowOverrideBuiltInDeepSeek: false,
        deepseekApiKeyEnv: "DEEPSEEK_API_KEY",
        deepseekBaseUrl: "https://example.test/",
      });
      assert.deepEqual(ids, ["deepseek-chat"]);
      assert.equal(registered[0][0], "context-engine-provider");
      assert.equal(registered[0][1].name, "DeepSeek Cache");

      const deepseekIds = await m.maybeRegisterDynamicProvider({ registerProvider: (...args) => registered.push(args) }, {
        registerDynamicProvider: true,
        dynamicProviderName: "custom",
        allowOverrideBuiltInDeepSeek: true,
        deepseekApiKeyEnv: "MISSING_KEY",
        deepseekBaseUrl: "https://example.test",
      });
      assert.deepEqual(deepseekIds, ["deepseek-v4-flash", "deepseek-v4-pro"]);
      assert.equal(registered[1][0], "deepseek");
      assert.equal(registered[1][1].name, "DeepSeek");
    } finally {
      globalThis.fetch = previousFetch;
      if (previousKey === undefined) delete process.env.DEEPSEEK_API_KEY;
      else process.env.DEEPSEEK_API_KEY = previousKey;
    }
  });

  it("returns undefined when model fetch throws", async () => {
    const previousFetch = globalThis.fetch;
    const previousKey = process.env.DEEPSEEK_API_KEY;
    process.env.DEEPSEEK_API_KEY = "test-key";
    globalThis.fetch = async () => {
      throw new Error("network unavailable");
    };
    try {
      const result = await m.fetchDeepSeekModelIds({
        deepseekApiKeyEnv: "DEEPSEEK_API_KEY",
        deepseekBaseUrl: "https://example.test/",
      });
      assert.equal(result, undefined);
    } finally {
      globalThis.fetch = previousFetch;
      if (previousKey === undefined) delete process.env.DEEPSEEK_API_KEY;
      else process.env.DEEPSEEK_API_KEY = previousKey;
    }
  });
});

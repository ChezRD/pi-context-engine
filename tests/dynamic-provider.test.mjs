import test from "node:test";
import assert from "node:assert/strict";

import { DEFAULT_CONFIG } from "../src/config.ts";
import { buildDynamicModels, fetchDeepSeekModelIds, maybeRegisterDynamicProvider } from "../src/dynamic-provider.ts";

test("buildDynamicModels assigns DeepSeek compat and thinking map", () => {
  const [flash, pro] = buildDynamicModels(["deepseek-v4-flash", "deepseek-v4-pro"]);
  assert.equal(flash.compat.thinkingFormat, "deepseek");
  assert.equal(flash.compat.requiresReasoningContentOnAssistantMessages, true);
  assert.equal(flash.thinkingLevelMap.high, "high");
  assert.equal(flash.thinkingLevelMap.xhigh, "max");
  assert.equal(flash.reasoning, true);
  assert.ok(pro.cost.input > flash.cost.input);
});

test("fetchDeepSeekModelIds returns undefined without api key", async () => {
  const old = process.env.NO_SUCH_DEEPSEEK_KEY;
  delete process.env.NO_SUCH_DEEPSEEK_KEY;
  try {
    const ids = await fetchDeepSeekModelIds({ ...DEFAULT_CONFIG, deepseekApiKeyEnv: "NO_SUCH_DEEPSEEK_KEY" });
    assert.equal(ids, undefined);
  } finally {
    if (old === undefined) delete process.env.NO_SUCH_DEEPSEEK_KEY;
    else process.env.NO_SUCH_DEEPSEEK_KEY = old;
  }
});

test("fetchDeepSeekModelIds reads /models with bearer key", async () => {
  const oldFetch = globalThis.fetch;
  const oldKey = process.env.TEST_DEEPSEEK_KEY;
  process.env.TEST_DEEPSEEK_KEY = "secret";
  let seenUrl;
  let seenAuth;
  globalThis.fetch = async (url, options) => {
    seenUrl = String(url);
    seenAuth = options.headers.Authorization;
    return { ok: true, json: async () => ({ data: [{ id: "deepseek-v4-flash" }, { id: "deepseek-v4-flash" }, { id: "deepseek-v4-pro" }] }) };
  };
  try {
    const ids = await fetchDeepSeekModelIds({ ...DEFAULT_CONFIG, deepseekApiKeyEnv: "TEST_DEEPSEEK_KEY", deepseekBaseUrl: "https://api.deepseek.com/" });
    assert.deepEqual(ids, ["deepseek-v4-flash", "deepseek-v4-pro"]);
    assert.equal(seenUrl, "https://api.deepseek.com/models");
    assert.equal(seenAuth, "Bearer secret");
  } finally {
    globalThis.fetch = oldFetch;
    if (oldKey === undefined) delete process.env.TEST_DEEPSEEK_KEY;
    else process.env.TEST_DEEPSEEK_KEY = oldKey;
  }
});

test("maybeRegisterDynamicProvider is off by default", async () => {
  const calls = [];
  const ids = await maybeRegisterDynamicProvider({ registerProvider: (...args) => calls.push(args) }, DEFAULT_CONFIG);
  assert.deepEqual(ids, []);
  assert.deepEqual(calls, []);
});

test("maybeRegisterDynamicProvider registers safe provider name by default", async () => {
  const oldFetch = globalThis.fetch;
  const oldKey = process.env.TEST_DEEPSEEK_KEY;
  process.env.TEST_DEEPSEEK_KEY = "secret";
  globalThis.fetch = async () => ({ ok: true, json: async () => ({ data: [{ id: "deepseek-v4-flash" }] }) });
  const calls = [];
  try {
    const ids = await maybeRegisterDynamicProvider({ registerProvider: (...args) => calls.push(args) }, { ...DEFAULT_CONFIG, registerDynamicProvider: true, deepseekApiKeyEnv: "TEST_DEEPSEEK_KEY" });
    assert.deepEqual(ids, ["deepseek-v4-flash"]);
    assert.equal(calls[0][0], "context-engine-provider");
    assert.equal(calls[0][1].models[0].id, "deepseek-v4-flash");
  } finally {
    globalThis.fetch = oldFetch;
    if (oldKey === undefined) delete process.env.TEST_DEEPSEEK_KEY;
    else process.env.TEST_DEEPSEEK_KEY = oldKey;
  }
});

test("maybeRegisterDynamicProvider only overrides deepseek when explicit", async () => {
  const oldKey = process.env.NO_SUCH_DEEPSEEK_KEY;
  delete process.env.NO_SUCH_DEEPSEEK_KEY;
  const calls = [];
  try {
    const ids = await maybeRegisterDynamicProvider({ registerProvider: (...args) => calls.push(args) }, { ...DEFAULT_CONFIG, registerDynamicProvider: true, allowOverrideBuiltInDeepSeek: true, deepseekApiKeyEnv: "NO_SUCH_DEEPSEEK_KEY" });
    assert.deepEqual(ids, ["deepseek-v4-flash", "deepseek-v4-pro"]);
    assert.equal(calls[0][0], "deepseek");
  } finally {
    if (oldKey === undefined) delete process.env.NO_SUCH_DEEPSEEK_KEY;
    else process.env.NO_SUCH_DEEPSEEK_KEY = oldKey;
  }
});

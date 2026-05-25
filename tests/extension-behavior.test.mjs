import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { applyLocale } from "../src/i18n/index.ts";
import extension, { getDeepSeekCacheCompletions } from "../src/index.ts";

function createMockPi() {
  const calls = [];
  const handlers = new Map();
  const commands = new Map();
  const activeTools = ["read", "bash", "edit", "write"];
  const allTools = activeTools.map((name) => ({ name }));
  return {
    calls,
    handlers,
    commands,
    pi: {
      on(name, handler) {
        calls.push(["on", name]);
        handlers.set(name, handler);
      },
      registerCommand(name, def) {
        calls.push(["registerCommand", name]);
        commands.set(name, def);
      },
      registerTool(def) {
        calls.push(["registerTool", def.name]);
        allTools.push({ name: def.name });
      },
      registerProvider(name, def) {
        calls.push(["registerProvider", name, def]);
      },
      setActiveTools(tools) {
        calls.push(["setActiveTools", tools]);
      },
      getActiveTools() {
        return [...activeTools];
      },
      getAllTools() {
        return [...allTools];
      },
      getCommands() {
        return [...commands.keys()].map((name) => ({ name }));
      },
      appendEntry(...args) {
        calls.push(["appendEntry", ...args]);
      },
    },
  };
}

function createMockCtx() {
  const status = [];
  const notifications = [];
  const compactCalls = [];
  return {
    status,
    notifications,
    compactCalls,
    ctx: {
      model: {
        provider: "deepseek",
        id: "deepseek-v4-flash",
        cost: { input: 0.14, cacheRead: 0.0028, cacheWrite: 0, output: 0.28 },
        reasoning: true,
        compat: { thinkingFormat: "deepseek", requiresReasoningContentOnAssistantMessages: true },
        thinkingLevelMap: { high: "high", xhigh: "max" },
      },
      ui: {
        setStatus(key, value) {
          status.push([key, value]);
        },
        notify(text, level = "info") {
          notifications.push([text, level]);
        },
      },
      getContextUsage: () => ({ tokens: 600, contextWindow: 1000 }),
      compact: async (options) => {
        compactCalls.push(options ?? {});
        return { ok: true };
      },
    },
  };
}

async function withTempHome(fn) {
  const oldHome = process.env.HOME;
  const home = await mkdtemp(join(tmpdir(), "pi-context-engine-test-"));
  process.env.HOME = home;
  applyLocale("en");
  try {
    return await fn(home);
  } finally {
    applyLocale(undefined);
    process.env.HOME = oldHome;
    await rm(home, { recursive: true, force: true });
  }
}

test("command argument completions match Pi registerCommand docs", async () => {
  const expected = ["status", "diagnose", "fold", "compact", "hold", "prune", "config", "reset-stats", "enable-capper", "disable-capper", "init"];
  assert.deepEqual(getDeepSeekCacheCompletions("sta").map((item) => item.value), ["status"]);
  assert.deepEqual(getDeepSeekCacheCompletions("" ).map((item) => item.value), expected);
  assert.equal(getDeepSeekCacheCompletions("status extra"), null);
  assert.equal(getDeepSeekCacheCompletions("missing"), null);

  await withTempHome(async () => {
    const { pi, commands } = createMockPi();
    await extension(pi);
    const registered = commands.get("context-engine");
    assert.equal(typeof registered.getArgumentCompletions, "function");
    assert.deepEqual(registered.getArgumentCompletions("").map((item) => item.value), expected);
    for (const subcommand of expected) assert.match(registered.argumentHint, new RegExp(`(^|[ |])${subcommand}([ |]|$)`), subcommand);
    assert.equal(commands.has("prune"), true);
  });
});

test("extension factory follows Pi contract: accepts only pi and waits for event/command ctx", async () => {
  await withTempHome(async () => {
    const { pi, calls, commands, handlers } = createMockPi();
    const { ctx, status } = createMockCtx();

    await extension(pi);

    assert.equal(commands.has("context-engine"), true);
    assert.equal(commands.has("prune"), true);
    assert.equal(calls.some((call) => call[0] === "setActiveTools"), false);
    assert.equal(calls.some((call) => call[0] === "registerProvider"), false);
    assert.equal(calls.some((call) => call[0] === "registerTool" && call[1] === "context_result_lookup"), true);
    assert.equal(calls.some((call) => call[0] === "on" && call[1] === "before_agent_start"), true);
    assert.equal(status.length, 0);

    await handlers.get("session_start")({}, ctx);
    assert.equal(status.at(-1)[0], "context-engine");
  });
});

test("extension skips lookup registration when hugeResultCapper is disabled", async () => {
  await withTempHome(async (home) => {
    const { pi, calls } = createMockPi();
    await mkdir(join(home, ".pi/agent"), { recursive: true });
    await writeFile(join(home, ".pi/agent/context-engine.json"), JSON.stringify({ hugeResultCapper: false }), "utf8");

    await extension(pi);

    assert.equal(calls.some((call) => call[0] === "registerTool" && call[1] === "context_result_lookup"), false);
  });
});

test("extension registers dynamic provider with fallback model ids when enabled", async () => {
  await withTempHome(async (home) => {
    const { pi, calls } = createMockPi();
    await mkdir(join(home, ".pi/agent"), { recursive: true });
    await writeFile(join(home, ".pi/agent/context-engine.json"), JSON.stringify({ registerDynamicProvider: true }), "utf8");
    process.env.DEEPSEEK_API_KEY = "";

    await extension(pi);

    const providerCall = calls.find((call) => call[0] === "registerProvider");
    assert.ok(providerCall);
    assert.equal(providerCall[1], "context-engine-provider");
    assert.deepEqual(providerCall[2].models.map((model) => model.id), ["deepseek-v4-flash", "deepseek-v4-pro"]);
  });
});

test("status command reports cache stats after message_end usage and notifies UI", async () => {
  await withTempHome(async () => {
    const { pi, handlers, commands } = createMockPi();
    const { ctx, notifications } = createMockCtx();

    await extension(pi);
    await handlers.get("message_end")({ message: { usage: { input: 25, cacheRead: 75, cacheWrite: 0, output: 10 } } }, ctx);

    const output = await commands.get("context-engine").handler("status", ctx);
    assert.match(output, /(DeepSeek|Context) cache/);
    assert.match(output, /Model: deepseek\/deepseek-v4-flash ✓/);
    assert.match(output, /Cache: 75\.0% session \/ 75\.0% last/);
    assert.match(output, /cached 75 · uncached 25/);
    assert.match(output, /Context: 60% ⚠/);
    assert.match(output, /Engine: prefix changes 0 · history rewrites 0/);
    assert.match(output, /Prefix hash: unknown · tool hash: unknown/);
    assert.equal(output.split("\n").filter((line) => /99% (possible|blocked)/.test(line)).length, 1);
    assert.match(notifications.at(-1)[0], /Cache: 75\.0% session \/ 75\.0% last/);
    assert.equal(notifications.at(-1)[1], "info");
  });
});

test("message_end reads Pi cache-aware cost without overriding message", async () => {
  await withTempHome(async () => {
    const { pi, handlers, commands } = createMockPi();
    const { ctx } = createMockCtx();

    await extension(pi);
    const result = await handlers.get("message_end")({ message: { role: "assistant", usage: { input: 100, cacheRead: 900, cacheWrite: 0, output: 500, cost: { total: 0.000268 } } } }, ctx);

    assert.equal(result, undefined);
    const statusText = await commands.get("context-engine").handler("status", ctx);
    assert.match(statusText, /90(\.0)?%/);
    assert.match(statusText, /\$0\.000268|Estimated cost/);
  });
});

test("status and diagnose hit rates include cacheWrite in denominator", async () => {
  await withTempHome(async () => {
    const { pi, handlers, commands } = createMockPi();
    const { ctx } = createMockCtx();

    await extension(pi);
    await handlers.get("message_end")({ message: { usage: { input: 100, cacheRead: 50, cacheWrite: 50, output: 10 } } }, ctx);

    const statusText = await commands.get("context-engine").handler("status", ctx);
    assert.match(statusText, /Cache: 25\.0% session \/ 25\.0% last/);
    const diagnoseText = await commands.get("context-engine").handler("diagnose", ctx);
    assert.match(diagnoseText, /Session hit rate: 25\.0%/);
    assert.match(diagnoseText, /Last request hit rate: 25\.0%/);
  });
});

test("before_agent_start injects cache prompt when enabled", async () => {
  await withTempHome(async () => {
    const { pi, handlers, commands } = createMockPi();
    const { ctx } = createMockCtx();

    await extension(pi);
    const initial = await handlers.get("before_agent_start")({ systemPrompt: "base" }, ctx);
    assert.match(initial.systemPrompt, /Context Engine/);
    const result = await handlers.get("before_agent_start")({ systemPrompt: "base" }, ctx);
    assert.match(result.systemPrompt, /base/);
    assert.match(result.systemPrompt, /Context Engine/);
  });
});

test("before_agent_start skips when cachePromptInjection is disabled", async () => {
  await withTempHome(async (home) => {
    const { pi, handlers } = createMockPi();
    const { ctx } = createMockCtx();
    await mkdir(join(home, ".pi/agent"), { recursive: true });
    await writeFile(join(home, ".pi/agent/context-engine.json"), JSON.stringify({ cachePromptInjection: false }), "utf8");

    await extension(pi);
    assert.equal(await handlers.get("before_agent_start")({ systemPrompt: "base" }, ctx), undefined);
  });
});

test("before_agent_start skips duplicate cache prompt injection when marker already exists", async () => {
  await withTempHome(async () => {
    const { pi, handlers } = createMockPi();
    const { ctx } = createMockCtx();

    await extension(pi);
    const result = await handlers.get("before_agent_start")({ systemPrompt: "[DeepSeek Cache Optimization]\nbase" }, ctx);
    assert.ok(result);
    assert.doesNotMatch(result.systemPrompt, /\[Context Engine\]/);
    assert.match(result.systemPrompt, /\[DeepSeek Cache Optimization\]/);
    assert.match(result.systemPrompt, /Context Engine Pins/);
  });
});

test("before_agent_start triggers preflight fold and warning when context is above threshold", async () => {
  await withTempHome(async () => {
    const { pi, handlers } = createMockPi();
    const mock = createMockCtx();
    mock.ctx.getContextUsage = () => ({ tokens: 950, contextWindow: 1000 });

    await extension(pi);
    await handlers.get("turn_end")({ turnIndex: 1 }, mock.ctx);
    const before = mock.compactCalls.length;
    const result = await handlers.get("before_agent_start")({ systemPrompt: "base" }, mock.ctx);

    assert.match(result.systemPrompt, /Context Engine/);
    assert.equal(mock.compactCalls.length > before, true);
    assert.match(mock.notifications.at(-1)[0], /pre-flight fold triggered/i);
    assert.equal(mock.notifications.at(-1)[1], "warning");
  });
});

test("session_before_compact never returns placeholder compaction", async () => {
  await withTempHome(async (home) => {
    const { pi, handlers } = createMockPi();
    const { ctx } = createMockCtx();
    await mkdir(join(home, ".pi/agent"), { recursive: true });
    await writeFile(join(home, ".pi/agent/context-engine.json"), JSON.stringify({ autoFold: true }), "utf8");

    await extension(pi);
    const result = await handlers.get("session_before_compact")({
      preparation: { cutEntryIndex: 3, firstKeptEntryId: "e4", tokensBefore: 1000 },
      branchEntries: [
        { entryId: "e1", content: "a".repeat(400) },
        { entryId: "e2", content: "b".repeat(400) },
        { entryId: "e3", content: "c".repeat(400) },
        { entryId: "e4", content: "d".repeat(40) },
      ],
    }, ctx);
    assert.equal(result, undefined);
  });
});

test("session_before_compact lets host default compact", async () => {
  await withTempHome(async () => {
    const { pi, handlers } = createMockPi();
    const { ctx } = createMockCtx();
    await extension(pi);
    const result = await handlers.get("session_before_compact")({ preparation: { cutEntryIndex: 0 }, branchEntries: [{ entryId: "e1", content: "x" }] }, ctx);
    assert.equal(result, undefined);
  });
});

test("red zone auto-folds by default", async () => {
  await withTempHome(async () => {
    const { pi, handlers } = createMockPi();
    const mock = createMockCtx();
    mock.ctx.getContextUsage = () => ({ tokens: 960, contextWindow: 1000 });

    await extension(pi);
    await handlers.get("message_end")({ message: { role: "assistant", usage: { input: 1000, cacheRead: 900, output: 100 } } }, mock.ctx);
    await handlers.get("turn_end")({}, mock.ctx);

    assert.equal(mock.compactCalls.length, 1);
    assert.match(mock.compactCalls[0].customInstructions, /(DeepSeek|Context) cache fold/);
  });
});

test("green zone produces status only and no compact or warning", async () => {
  await withTempHome(async () => {
    const { pi, handlers } = createMockPi();
    const mock = createMockCtx();
    mock.ctx.getContextUsage = () => ({ tokens: 550, contextWindow: 1000 });

    await extension(pi);
    await handlers.get("message_end")({ message: { role: "assistant", usage: { input: 1000, cacheRead: 900, output: 100 } } }, mock.ctx);
    await handlers.get("turn_end")({}, mock.ctx);

    assert.equal(mock.compactCalls.length, 0);
    assert.equal(mock.notifications.some(([text]) => /choice|decision|fold/i.test(text)), false);
    assert.match(mock.status.at(-1)[1], /Cache/);
  });
});

test("yellow zone status shows turns estimate without compaction", async () => {
  await withTempHome(async () => {
    const { pi, handlers } = createMockPi();
    const mock = createMockCtx();
    mock.ctx.getContextUsage = () => ({ tokens: 650, contextWindow: 1000 });

    await extension(pi);
    await handlers.get("message_end")({ message: { role: "assistant", usage: { input: 100, cacheRead: 94, output: 10 } } }, mock.ctx);
    await handlers.get("turn_end")({}, mock.ctx);

    assert.equal(mock.compactCalls.length, 0);
    assert.match(mock.status.at(-1)[1], /Cache/);
    assert.match(mock.status.at(-1)[1], /~1 turns/);
  });
});

test("orange zone shows choice UI and does not compact", async () => {
  await withTempHome(async () => {
    const { pi, handlers } = createMockPi();
    const mock = createMockCtx();
    mock.ctx.getContextUsage = () => ({ tokens: 780, contextWindow: 1000 });

    await extension(pi);
    await handlers.get("message_end")({ message: { role: "assistant", usage: { input: 50, cacheRead: 950, output: 10 } } }, mock.ctx);
    await handlers.get("turn_end")({}, mock.ctx);

    assert.equal(mock.compactCalls.length, 0);
    assert.match(mock.notifications.at(-1)[0], /Options: \[1\]/);
  });
});

test("critical zone auto-folds by default", async () => {
  await withTempHome(async () => {
    const { pi, handlers } = createMockPi();
    const mock = createMockCtx();
    mock.ctx.getContextUsage = () => ({ tokens: 960, contextWindow: 1000 });

    await extension(pi);
    await handlers.get("turn_end")({}, mock.ctx);
    assert.equal(mock.compactCalls.length, 1);
    assert.match(mock.compactCalls[0].customInstructions, /(DeepSeek|Context) cache fold/);
  });
});

test("context prefix heuristic is quiet by default and warns only in strict mode", async () => {
  await withTempHome(async (home) => {
    const { pi, handlers } = createMockPi();
    const mock = createMockCtx();
    await extension(pi);

    const event1 = { messages: [{ role: "system", content: "s" }, { role: "user", content: "u" }] };
    const event2 = { messages: [{ role: "system", content: "s" }, { role: "user", content: "u" }] };
    const event3 = { messages: [{ role: "system", content: "changed" }, { role: "user", content: "u" }] };
    await handlers.get("context")(event1, mock.ctx);
    await handlers.get("context")(event2, mock.ctx);
    await handlers.get("context")(event3, mock.ctx);
    assert.equal(mock.notifications.length, 0);

    await mkdir(join(home, ".pi/agent"), { recursive: true });
    await writeFile(join(home, ".pi/agent/context-engine.json"), JSON.stringify({ strictPrefixWarnings: true }), "utf8");
    await handlers.get("context")({ messages: [{ role: "system", content: "strict" }, { role: "user", content: "u" }] }, mock.ctx);
    assert.match(mock.notifications.at(-1)[0], /prefix changed/i);
  });
});

test("provider prefix fingerprint is not polluted by context history heuristic", async () => {
  await withTempHome(async () => {
    const { pi, handlers, commands } = createMockPi();
    const mock = createMockCtx();
    await extension(pi);

    await handlers.get("before_provider_request")({ payload: { model: "deepseek-v4-flash", messages: [{ role: "system", content: "s" }, { role: "user", content: "u" }], tools: [], temperature: 0 } }, mock.ctx);
    await handlers.get("context")({ messages: [{ role: "system", content: "s" }, { role: "user", content: "u" }] }, mock.ctx);

    const status = await commands.get("context-engine").handler("status", mock.ctx);
    assert.equal(mock.notifications.filter(([text, level]) => level === "warning" && /prefix changed|history rewritten/i.test(text)).length, 0);
    assert.match(status, /prefix changes 0/);
  });
});

test("fold tool registers by default", async () => {
  await withTempHome(async (home) => {
    const mock = createMockPi();
    const { ctx } = createMockCtx();
    await extension(mock.pi);
    await mock.handlers.get("session_start")({}, ctx);
    assert.equal(mock.calls.some((call) => call[0] === "registerTool" && call[1] === "context_cache_fold"), true);
  });
});

test("end-to-end session auto-folds under pressure when hit rate is weak", async () => {
  await withTempHome(async () => {
    const { pi, handlers, commands } = createMockPi();
    const mock = createMockCtx();
    let tokens = 100;
    mock.ctx.getContextUsage = () => ({ tokens, contextWindow: 1000 });

    await extension(pi);
    await handlers.get("context")({ messages: [{ role: "system", content: "s" }, { role: "user", content: "u1" }] }, mock.ctx);

    const monitoredTurns = [
      { tokens: 100, input: 1000, read: 0, out: 100, emoji: /Cache/ },
      { tokens: 250, input: 200, read: 800, out: 100, emoji: /Cache/ },
      { tokens: 450, input: 80, read: 920, out: 100, emoji: /Cache/ },
      { tokens: 650, input: 60, read: 940, out: 100, emoji: /Cache/ },
      { tokens: 780, input: 50, read: 950, out: 100, emoji: /Cache/ },
    ];

    for (const turn of monitoredTurns) {
      tokens = turn.tokens;
      await handlers.get("message_end")({ message: { role: "assistant", usage: { input: turn.input, cacheRead: turn.read, output: turn.out } } }, mock.ctx);
      await handlers.get("turn_end")({}, mock.ctx);
      assert.match(mock.status.at(-1)[1], turn.emoji);
    }
    assert.equal(mock.compactCalls.length, 1);
    assert.match(mock.compactCalls[0].customInstructions, /(DeepSeek|Context) cache fold/);
    assert.equal(mock.status.at(-1)[1].includes("fold"), true);
  });
});

test("before_provider_request hashes real payload prefix, ignores tool order, and suppresses repeated drift spam", async () => {
  await withTempHome(async () => {
    const { pi, handlers, commands } = createMockPi();
    const mock = createMockCtx();
    await extension(pi);
    const base = {
      payload: {
        provider: "deepseek",
        model: "deepseek-v4-flash",
        messages: [{ role: "system", content: "stable" }, { role: "user", content: "u" }],
        tools: [{ type: "function", function: { name: "read", parameters: { type: "object" } } }],
        thinking: { type: "enabled" },
        temperature: 0,
      },
    };
    await handlers.get("before_provider_request")(base, mock.ctx);
    await handlers.get("before_provider_request")({ payload: { ...base.payload, messages: [...base.payload.messages, { role: "assistant", content: "ok" }, { role: "user", content: "next" }] } }, mock.ctx);
    assert.equal(mock.notifications.length, 0);
    await handlers.get("before_provider_request")({ payload: { ...base.payload, tools: [...base.payload.tools].reverse() } }, mock.ctx);
    assert.equal(mock.notifications.length, 0);
    await handlers.get("before_provider_request")({ payload: { ...base.payload, tools: [{ type: "function", function: { name: "read", parameters: { type: "object", properties: { path: { type: "string" } } } } }] } }, mock.ctx);
    assert.equal(mock.notifications.length, 0);
    await handlers.get("before_provider_request")({ payload: { ...base.payload, tools: [{ type: "function", function: { name: "read", parameters: { type: "object", properties: { path2: { type: "string" } } } } }] } }, mock.ctx);
    assert.equal(mock.notifications.length, 0);
    const warnCount = mock.notifications.length;
    await handlers.get("before_provider_request")({ payload: { ...base.payload, tools: [{ type: "function", function: { name: "read", parameters: { type: "object", properties: { next: { type: "string" } } } } }] } }, mock.ctx);
    assert.equal(mock.notifications.length, warnCount);
    const status = await commands.get("context-engine").handler("status", mock.ctx);
    assert.match(status, /Engine: prefix changes 3 · history rewrites 0/);
    assert.match(status, /Prefix hash: [a-f0-9]{12} · tool hash: [a-f0-9]{12} · tool changes 3 · last reason: tool set/);
    assert.match(status, /Last prefix warning turn: not reported · suppressed: yes/);
    const out = await commands.get("context-engine").handler("diagnose", mock.ctx);
    assert.match(out, /Prefix hash:/);
    assert.match(out, /tool changes 3/);
    assert.match(out, /last reason: tool set/);
    assert.match(out, /Last prefix warning turn: not reported · suppressed: yes/);
    assert.match(out, /99% blocked: .*tools changed/);
  });
});

test("tool_call blocks invalid args, normalizes read input, and suppresses duplicate storm", async () => {
  await withTempHome(async () => {
    const { pi, handlers } = createMockPi();
    const { ctx } = createMockCtx();
    await extension(pi);

    const invalid = await handlers.get("tool_call")({ toolName: "read", input: {} }, ctx);
    assert.equal(invalid.block, true);
    assert.match(invalid.reason, /Invalid tool arguments/);

    const first = { toolName: "read", input: { file: "a.ts" } };
    assert.equal(await handlers.get("tool_call")(first, ctx), undefined);
    assert.deepEqual(first.input, { path: "a.ts" });
    const duplicate = { toolName: "read", input: { path: "a.ts" } };
    const blocked = await handlers.get("tool_call")(duplicate, ctx);
    assert.equal(blocked.block, true);
    assert.match(blocked.reason, /Duplicate tool call/);
  });
});

test("manual fold uses custom instructions while compact delegates raw host compaction", async () => {
  await withTempHome(async () => {
    const { pi, commands } = createMockPi();
    const mock = createMockCtx();

    await extension(pi);
    await commands.get("context-engine").handler("fold", mock.ctx);
    await commands.get("context-engine").handler("compact", mock.ctx);

    assert.equal(mock.compactCalls.length, 2);
    assert.match(mock.compactCalls[0].customInstructions, /(DeepSeek|Context) cache fold/);
    assert.equal("customInstructions" in mock.compactCalls[1], false);
  });
});

test("compact request failure returns error without marking accepted request", async () => {
  await withTempHome(async () => {
    const { pi, commands } = createMockPi();
    const mock = createMockCtx();
    mock.ctx.compact = () => { throw new Error("boom"); };

    await extension(pi);
    const out = await commands.get("context-engine").handler("fold", mock.ctx);

    assert.match(out, /Failed: boom/);
    const diagnose = await commands.get("context-engine").handler("diagnose", mock.ctx);
    assert.match(diagnose, /Compaction history: not reported/);
  });
});

test("appendOnly projection activates after compact completion and invalidates on tail rewrite", async () => {
  await withTempHome(async (home) => {
    const { pi, handlers, commands } = createMockPi();
    const mock = createMockCtx();
    await mkdir(join(home, ".pi/agent"), { recursive: true });
    await writeFile(join(home, ".pi/agent/context-engine.json"), JSON.stringify({ appendOnlyProjection: true }), "utf8");

    await extension(pi);
    await commands.get("context-engine").handler("fold", mock.ctx);
    assert.equal(mock.compactCalls.length, 1);
    mock.compactCalls[0].onComplete({ summary: "stable summary", firstKeptEntryId: "tail1" });

    const projected = await handlers.get("context")({ messages: [
      { role: "system", content: "sys" },
      { role: "assistant", content: "old", id: "old" },
      { role: "user", content: "tail", id: "tail1" },
    ] }, mock.ctx);
    assert.equal(projected.messages[0].role, "system");
    assert.equal(projected.messages[1].content, "stable summary");
    assert.equal(projected.messages[2].id, "tail1");

    const invalidated = await handlers.get("context")({ messages: [
      { role: "system", content: "sys" },
      { role: "user", content: "rewritten", id: "tail1" },
    ] }, mock.ctx);
    assert.equal(invalidated, undefined);
    assert.equal(mock.notifications.some(([text]) => /AppendOnly projection invalidated/.test(text)), true);
    const diagnose = await commands.get("context-engine").handler("diagnose", mock.ctx);
    assert.match(diagnose, /AppendOnly projection:/);
    assert.match(diagnose, /tail changed non-append-only/);
  });
});

test("appendOnly projection stays inactive for invalid compact result and compact errors", async () => {
  await withTempHome(async (home) => {
    const { pi, handlers, commands } = createMockPi();
    const mock = createMockCtx();
    await mkdir(join(home, ".pi/agent"), { recursive: true });
    await writeFile(join(home, ".pi/agent/context-engine.json"), JSON.stringify({ appendOnlyProjection: true }), "utf8");

    await extension(pi);
    await commands.get("context-engine").handler("fold", mock.ctx);
    mock.compactCalls[0].onComplete({ summary: "missing tail" });
    assert.equal(await handlers.get("context")({ messages: [{ role: "system", content: "sys" }, { role: "user", content: "tail", id: "tail1" }] }, mock.ctx), undefined);
    let diagnose = await commands.get("context-engine").handler("diagnose", mock.ctx);
    assert.match(diagnose, /AppendOnly projection: disabled/);
    assert.match(diagnose, /auto@0:completed/);

    await commands.get("context-engine").handler("fold", mock.ctx);
    mock.compactCalls[1].onError(new Error("summary failed"));
    assert.equal(await handlers.get("context")({ messages: [{ role: "system", content: "sys" }, { role: "user", content: "tail", id: "tail1" }] }, mock.ctx), undefined);
    diagnose = await commands.get("context-engine").handler("diagnose", mock.ctx);
    assert.match(diagnose, /AppendOnly projection: disabled/);
    assert.match(diagnose, /auto@0:failed/);
  });
});

test("appendOnly projection disabled leaves context event untouched", async () => {
  await withTempHome(async (home) => {
    const { pi, handlers, commands } = createMockPi();
    const mock = createMockCtx();
    await mkdir(join(home, ".pi/agent"), { recursive: true });
    await writeFile(join(home, ".pi/agent/context-engine.json"), JSON.stringify({ appendOnlyProjection: false }), "utf8");

    await extension(pi);
    await commands.get("context-engine").handler("fold", mock.ctx);
    mock.compactCalls[0].onComplete({ summary: "stable summary", firstKeptEntryId: "tail1" });

    const messages = [{ role: "system", content: "sys" }, { role: "user", content: "tail", id: "tail1" }];
    assert.equal(await handlers.get("context")({ messages }, mock.ctx), undefined);
    assert.deepEqual(messages, [{ role: "system", content: "sys" }, { role: "user", content: "tail", id: "tail1" }]);
  });
});

test("hold command suppresses warnings for configured turns", async () => {
  await withTempHome(async () => {
    const { pi, handlers, commands } = createMockPi();
    const mock = createMockCtx();
    mock.ctx.getContextUsage = () => ({ tokens: 850, contextWindow: 1000 });
    await extension(pi);
    await commands.get("context-engine").handler("hold", mock.ctx);
    await handlers.get("message_end")({ message: { role: "assistant", usage: { input: 900, cacheRead: 100, output: 10 } } }, mock.ctx);
    await handlers.get("turn_end")({ turnIndex: 1 }, mock.ctx);
    assert.equal(mock.notifications.filter(([text]) => /Options:/.test(text)).length, 0);
  });
});

test("message_end detects textual tool call without provider tool_calls", async () => {
  await withTempHome(async () => {
    const { pi, handlers } = createMockPi();
    const mock = createMockCtx();
    await extension(pi);
    await handlers.get("message_end")({ message: { role: "assistant", content: "I will call tool read now", usage: { input: 10, cacheRead: 0, output: 5 } } }, mock.ctx);
    assert.equal(mock.notifications.some(([text]) => /did not emit provider tool_calls/.test(text)), true);
  });
});

test("usage is attributed to actual provider request model after model switch", async () => {
  await withTempHome(async () => {
    const { pi, handlers, commands } = createMockPi();
    const mock = createMockCtx();
    await extension(pi);

    await handlers.get("before_provider_request")({
      payload: { model: "deepseek-v4-flash", messages: [{ role: "system", content: "s" }], tools: [] },
    }, mock.ctx);
    await handlers.get("message_end")({
      message: { role: "assistant", usage: { input: 100, cacheRead: 900, cacheWrite: 0, output: 10 } },
    }, mock.ctx);

    await handlers.get("before_provider_request")({
      payload: { model: "deepseek-v4-pro", messages: [{ role: "system", content: "s" }], tools: [] },
    }, mock.ctx);
    await handlers.get("message_end")({
      message: { role: "assistant", usage: { input: 200, cacheRead: 0, cacheWrite: 0, output: 20 } },
    }, mock.ctx);

    const diagnose = await commands.get("context-engine").handler("diagnose", mock.ctx);
    assert.match(diagnose, /provider_model_drift/);
    assert.match(diagnose, /deepseek-v4-pro/);
  });
});

test("stable prefix session reaches 99% warm hit eligibility", async () => {
  await withTempHome(async () => {
    const { pi, handlers, commands } = createMockPi();
    const mock = createMockCtx();
    await extension(pi);
    const payload = (content) => ({ payload: { model: "deepseek-v4-flash", messages: [{ role: "system", content: "S" }, { role: "user", content }], tools: [], temperature: 0 } });
    await handlers.get("before_provider_request")(payload("one"), mock.ctx);
    const turns = [
      { turnIndex: 1, input: 1000, cacheRead: 0, output: 100, expectedLast: "0\.0%" },
      { turnIndex: 2, input: 10, cacheRead: 990, output: 100, expectedLast: "99\.0%" },
      { turnIndex: 3, input: 10, cacheRead: 990, output: 100, expectedLast: "99\.0%" },
      { turnIndex: 4, input: 10, cacheRead: 990, output: 100, expectedLast: "99\.0%" },
    ];
    for (const turn of turns) {
      await handlers.get("message_end")({ message: { role: "assistant", usage: turn } }, mock.ctx);
      const status = await commands.get("context-engine").handler("status", mock.ctx);
      assert.match(status, new RegExp(`\\/ ${turn.expectedLast} last`));
      await handlers.get("turn_end")({ turnIndex: turn.turnIndex }, mock.ctx);
    }
    await handlers.get("before_provider_request")(payload("two"), mock.ctx);
    const diagnose = await commands.get("context-engine").handler("diagnose", mock.ctx);
    assert.match(diagnose, /99% possible: .*warm hit 99\.\d%/);
    assert.match(diagnose, /prefix changes 0/);
  });
});

test("system drift warns once in strict mode and blocks 99 eligibility", async () => {
  await withTempHome(async (home) => {
    const { pi, handlers, commands } = createMockPi();
    const mock = createMockCtx();
    await mkdir(join(home, ".pi/agent"), { recursive: true });
    await writeFile(join(home, ".pi/agent/context-engine.json"), JSON.stringify({ strictPrefixWarnings: true }), "utf8");
    await extension(pi);
    const p = (system) => ({ payload: { model: "deepseek-v4-flash", messages: [{ role: "system", content: system }], tools: [], temperature: 0 } });
    await handlers.get("before_provider_request")(p("A"), mock.ctx);
    await handlers.get("before_provider_request")(p("B"), mock.ctx);
    await handlers.get("before_provider_request")(p("C"), mock.ctx);
    assert.equal(mock.notifications.filter(([text]) => /prefix changed/i.test(text)).length, 1);
    const diagnose = await commands.get("context-engine").handler("diagnose", mock.ctx);
    assert.match(diagnose, /99% blocked: .*prefix changed/);
    assert.match(diagnose, /last reason: system prompt/);
  });
});

test("compact recovery records compact then later hit recovers", async () => {
  await withTempHome(async () => {
    const { pi, handlers, commands } = createMockPi();
    const mock = createMockCtx();
    // Keep below fold threshold (75%) to avoid post-usage fold from new decision engine
    mock.ctx.getContextUsage = () => ({ tokens: 650, contextWindow: 1000 });
    await extension(pi);
    await handlers.get("message_end")({ message: { role: "assistant", usage: { input: 1000, cacheRead: 0, output: 100 } } }, mock.ctx);
    await commands.get("context-engine").handler("fold", mock.ctx);
    await handlers.get("turn_end")({ turnIndex: 1 }, mock.ctx);
    assert.equal(mock.compactCalls.length, 1);
    mock.compactCalls[0].onComplete({ summary: "s", firstKeptEntryId: "tail" });
    mock.ctx.getContextUsage = () => ({ tokens: 450, contextWindow: 1000 });
    await handlers.get("message_end")({ message: { role: "assistant", usage: { input: 900, cacheRead: 100, output: 100 } } }, mock.ctx);
    await handlers.get("turn_end")({ turnIndex: 2 }, mock.ctx);
    await handlers.get("message_end")({ message: { role: "assistant", usage: { input: 50, cacheRead: 950, output: 100 } } }, mock.ctx);
    await handlers.get("turn_end")({ turnIndex: 3 }, mock.ctx);
    await handlers.get("message_end")({ message: { role: "assistant", usage: { input: 30, cacheRead: 970, output: 100 } } }, mock.ctx);
    await handlers.get("turn_end")({ turnIndex: 4 }, mock.ctx);
    const status = await commands.get("context-engine").handler("diagnose", mock.ctx);
    assert.match(status, /9\d\.\d%/);
    assert.match(status, /completed/);
  });
});

test("e2e lifecycle covers session, prompt, context, provider, stats, turn, and host compact", async () => {
  await withTempHome(async () => {
    const { pi, handlers, commands } = createMockPi();
    const mock = createMockCtx();

    await extension(pi);
    await handlers.get("session_start")({}, mock.ctx);
    assert.equal(mock.status.at(-1)[0], "context-engine");

    const prompt = await handlers.get("before_agent_start")({ systemPrompt: "base" }, mock.ctx);
    assert.match(prompt.systemPrompt, /Context Engine/);
    assert.equal(await handlers.get("context")({ messages: [{ role: "system", content: "sys" }] }, mock.ctx), undefined);

    const providerResult = await handlers.get("before_provider_request")({ payload: { model: "deepseek-v4-flash", messages: [{ role: "system", content: "sys" }], tools: [], temperature: 0 } }, mock.ctx);
    assert.equal(providerResult, undefined);
    await handlers.get("message_end")({ message: { role: "assistant", usage: { input: 100, cacheRead: 900, output: 10 } } }, mock.ctx);
    await handlers.get("turn_end")({ turnIndex: 1 }, mock.ctx);
    await handlers.get("session_compact")({}, mock.ctx);

    const diagnose = await commands.get("context-engine").handler("diagnose", mock.ctx);
    assert.match(diagnose, /Session hit rate: 90\.0%/);
    assert.match(diagnose, /Prefix hash:/);
    assert.match(diagnose, /Compaction history: host@1:completed/);
  });
});

test("session_start restores usage stats from branch when telemetry is absent", async () => {
  await withTempHome(async () => {
    const { pi, handlers, commands } = createMockPi();
    const mock = createMockCtx();
    mock.ctx.sessionManager = {
      getEntries: () => [],
      getBranch: async () => [
        { type: "message", turnIndex: 3, message: { role: "assistant", usage: { input: 20, cacheRead: 80, cacheWrite: 0, output: 5 } } },
      ],
    };

    await extension(pi);
    await handlers.get("session_start")({}, mock.ctx);

    const status = await commands.get("context-engine").handler("status", mock.ctx);
    assert.match(status, /Cache: 80\.0% session \/ 80\.0% last/);
    assert.equal(mock.status.at(-1)[0], "context-engine");
  });
});

test("session_start refresh stays graceful when session branch lookup fails", async () => {
  await withTempHome(async () => {
    const { pi, handlers, commands } = createMockPi();
    const mock = createMockCtx();
    mock.ctx.sessionManager = {
      getEntries: () => [],
      getBranch: async () => { throw new Error("branch unavailable"); },
    };

    await extension(pi);
    await handlers.get("session_start")({}, mock.ctx);

    const diagnose = await commands.get("context-engine").handler("diagnose", mock.ctx);
    assert.match(diagnose, /No completed model requests with usage data yet\./);
    assert.match(diagnose, /Usage: 60%/);
    assert.equal(mock.status.at(-1)[0], "context-engine");
  });
});

test("message_end ignores non-assistant messages while session_compact records host compaction", async () => {
  await withTempHome(async () => {
    const { pi, handlers, commands } = createMockPi();
    const mock = createMockCtx();

    await extension(pi);
    await handlers.get("message_end")({ message: { role: "user", usage: { input: 50, cacheRead: 50, output: 10 } } }, mock.ctx);
    await handlers.get("session_compact")({}, mock.ctx);

    const diagnose = await commands.get("context-engine").handler("diagnose", mock.ctx);
    assert.match(diagnose, /No completed model requests with usage data yet\./);
    assert.match(diagnose, /Compaction history: host@0:completed/);
  });
});

test("e2e command flow covers init, status, diagnose, hold, fold, and reset-stats", async () => {
  await withTempHome(async (home) => {
    const { pi, handlers, commands } = createMockPi();
    const mock = createMockCtx();

    await extension(pi);
    const command = commands.get("context-engine");
    assert.match(await command.handler("init", mock.ctx), /Wrote .*context-engine\.json/);
    assert.match(await readFile(join(home, ".pi/agent/context-engine.json"), "utf8"), /"diagnostics"/);
    await handlers.get("message_end")({ message: { role: "assistant", usage: { input: 100, cacheRead: 900, output: 10 } } }, mock.ctx);
    assert.match(await command.handler("status", mock.ctx), /Cache: 90\.0% session/);
    assert.match(await command.handler("diagnose", mock.ctx), /(DeepSeek|Context) cache details/);
    assert.match(await command.handler("hold", mock.ctx), /hold set for 3 turns/);
    assert.match(await command.handler("fold", mock.ctx), /fold triggered/i);
    assert.equal(mock.compactCalls.length, 1);
    assert.match(await command.handler("reset-stats", mock.ctx), /stats reset/);
    assert.match(await command.handler("status", mock.ctx), /Cache: no usage yet/);
  });
});

test("diagnose command includes read-only provider payload diagnostics", async () => {
  await withTempHome(async () => {
    const { pi, handlers, commands } = createMockPi();
    const { ctx } = createMockCtx();

    await extension(pi);
    const body = {
      messages: [{ role: "assistant", content: "x" }],
      tools: [{ type: "function" }],
      thinking: { type: "enabled" },
      reasoning_effort: "high",
      stream_options: { include_usage: true },
    };
    const result = await handlers.get("before_provider_request")({ payload: body }, ctx);
    assert.equal(result, undefined);

    const output = await commands.get("context-engine").handler("diagnose", ctx);
    assert.match(output, /Last provider request/);
    assert.match(output, /Messages sent: 1/);
    assert.match(output, /Tools exposed: 1/);
    assert.match(output, /DeepSeek thinking: enabled/);
    assert.match(output, /1 assistant message\(s\) missing reasoning_content/);
  });
});

test("reset-stats command clears accumulated telemetry", async () => {
  await withTempHome(async () => {
    const { pi, handlers, commands } = createMockPi();
    const { ctx } = createMockCtx();

    await extension(pi);
    await handlers.get("message_end")({ message: { usage: { input: 10, cacheRead: 90, cacheWrite: 0 } } }, ctx);
    assert.match(await commands.get("context-engine").handler("status", ctx), /Cache: 90\.0% session \/ 90\.0% last/);

    assert.match(await commands.get("context-engine").handler("reset-stats", ctx), /reset/);
    assert.match(await commands.get("context-engine").handler("status", ctx), /Cache: no usage yet/);
  });
});

test("enable-capper persists config and registers only namespaced lookup tool", async () => {
  await withTempHome(async (home) => {
    const { pi, calls, commands } = createMockPi();
    const { ctx } = createMockCtx();

    await extension(pi);
    const output = await commands.get("context-engine").handler("enable-capper", ctx);

    assert.match(output, /enabled/);
    assert.equal(calls.some((call) => call[0] === "registerTool" && call[1] === "context_result_lookup"), true);
    assert.equal(calls.some((call) => call[0] === "registerTool" && call[1] === "context_tree_query"), false);
    const config = JSON.parse(await readFile(join(home, ".pi/agent/context-engine.json"), "utf8"));
    assert.equal(config.hugeResultCapper, true);
  });
});

test("tool_result hook caps huge outputs by default", async () => {
  await withTempHome(async () => {
    const { pi, handlers } = createMockPi();
    const { ctx } = createMockCtx();

    await extension(pi);
    const event = { content: [{ type: "text", text: "x".repeat(70_000) }], toolCallId: "tc1", toolName: "bash" };
    const capped = await handlers.get("tool_result")(event, ctx);
    assert.match(capped.content[0].text, /pi-context-engine: model-visible context/);
    assert.match(capped.content[0].text, /"ref": "dsc-bash-1"/);
    assert.match(capped.content[0].text, /\[context_result_lookup kind=slice ref=dsc-bash-1/);
    assert.match(capped.content[0].text, /<model_visible_context/);
    assert.match(capped.content[0].text, /kind="context_result_truncated"/);
    assert.match(capped.content[0].text, /"tool": "context_result_lookup"/);
    assert.equal(capped.details.elidedBy, "pi-context-engine");
  });
});

test("tool_result hook does not cap context_result_lookup output again", async () => {
  await withTempHome(async () => {
    const { pi, handlers } = createMockPi();
    const { ctx } = createMockCtx();

    await extension(pi);
    const event = { content: [{ type: "text", text: "x".repeat(70_000) }], toolCallId: "lookup-1", toolName: "context_result_lookup" };
    const capped = await handlers.get("tool_result")(event, ctx);
    assert.equal(capped, undefined);
  });
});

test("pruner advisor reads source settings for 99% eligibility", async () => {
  await withTempHome(async (home) => {
    const mock = createMockPi();
    const { ctx } = createMockCtx();
    await mkdir(join(home, ".pi/agent/context-prune"), { recursive: true });
    await writeFile(join(home, ".pi/agent/context-prune/settings.json"), JSON.stringify({
      enabled: true,
      pruneOn: "agent-message",
      batchingMode: "agent-message",
      summarizerModel: "deepseek/deepseek-v4-flash",
      summarizerThinking: "off",
    }), "utf8");
    mock.pi.registerCommand("pruner", { handler: async () => "" });
    mock.pi.registerTool({ name: "context_tree_query" });
    mock.pi.registerTool({ name: "context_prune" });
    await extension(mock.pi);
    await mock.handlers.get("turn_end")({ turnIndex: 2 }, ctx);
    await mock.handlers.get("message_end")({ message: { role: "assistant", usage: { input: 10, cacheRead: 990, output: 10 } } }, ctx);
    await mock.handlers.get("turn_end")({ turnIndex: 3 }, ctx);
    await mock.handlers.get("message_end")({ message: { role: "assistant", usage: { input: 10, cacheRead: 990, output: 10 } } }, ctx);

    const diagnose = await mock.commands.get("context-engine").handler("status", ctx);
    assert.match(diagnose, /99% possible/);
  });
});

test("every-turn pruner profile blocks 99 eligibility with prompt-cache churn reason", async () => {
  await withTempHome(async (home) => {
    const mock = createMockPi();
    const { ctx } = createMockCtx();
    await mkdir(join(home, ".pi/agent/context-prune"), { recursive: true });
    await writeFile(join(home, ".pi/agent/context-prune/settings.json"), JSON.stringify({ enabled: true, pruneOn: "every-turn" }), "utf8");
    mock.pi.registerCommand("pruner", { handler: async () => "" });
    await extension(mock.pi);

    const status = await mock.commands.get("context-engine").handler("status", ctx);
    assert.match(status, /99% blocked: .*pruner profile bad.*prompt-cache churn/);
  });
});

test("good pruner profile keeps 99 eligibility possible when no other blockers exist", async () => {
  await withTempHome(async (home) => {
    const mock = createMockPi();
    const { ctx } = createMockCtx();
    await mkdir(join(home, ".pi/agent/context-prune"), { recursive: true });
    await writeFile(join(home, ".pi/agent/context-prune/settings.json"), JSON.stringify({ enabled: true, pruneOn: "on-demand" }), "utf8");
    mock.pi.registerCommand("pruner", { handler: async () => "" });
    await extension(mock.pi);
    await mock.handlers.get("turn_end")({ turnIndex: 2 }, ctx);
    await mock.handlers.get("message_end")({ message: { role: "assistant", usage: { input: 10, cacheRead: 990, output: 10 } } }, ctx);
    await mock.handlers.get("turn_end")({ turnIndex: 3 }, ctx);
    await mock.handlers.get("message_end")({ message: { role: "assistant", usage: { input: 10, cacheRead: 990, output: 10 } } }, ctx);

    const status = await mock.commands.get("context-engine").handler("status", ctx);
    assert.match(status, /99% possible/);
    assert.doesNotMatch(status, /pruner profile bad/);
  });
});

test("all context-engine subcommands execute and notify", async () => {
  await withTempHome(async () => {
    const { pi, commands, handlers } = createMockPi();
    const { ctx, notifications } = createMockCtx();
    await extension(pi);
    await handlers.get("before_provider_request")({ payload: { messages: [], tools: [] } }, ctx);

    const command = commands.get("context-engine");
    const cases = [
      ["status", /(DeepSeek|Context) cache/, "info"],
      ["diagnose", /Last provider request/, "info"],
      ["fold", /fold triggered/, "info"],
      ["compact", /Compaction triggered/, "info"],
      ["hold", /hold set for 3 turns/, "info"],
      ["config", /cancelled/, "info"],
      ["reset-stats", /stats reset/, "info"],
      ["enable-capper", /capper enabled/, "warning"],
      ["disable-capper", /capper disabled/, "info"],
      ["init", /Wrote .*context-engine\.json/, "info"],
      ["unknown", /Usage: \/context-engine/, "warning"],
    ];

    for (const [subcommand, pattern, level] of cases) {
      const before = notifications.length;
      const output = await command.handler(subcommand, ctx);
      assert.match(output, pattern, subcommand);
      assert.equal(notifications.length, before + 1, subcommand);
      assert.match(notifications.at(-1)[0], pattern, subcommand);
      assert.equal(notifications.at(-1)[1], level, subcommand);
    }
  });
});

test("manual prune shows start notification and warns when it cannot run", async () => {
  await withTempHome(async () => {
    const { pi, commands } = createMockPi();
    const { ctx, notifications } = createMockCtx();
    await extension(pi);

    const output = await commands.get("prune").handler("", ctx);

    assert.match(notifications.at(-2)[0], /prune started/i);
    assert.equal(notifications.at(-2)[1], "info");
    assert.match(output, /no session manager/i);
    assert.match(notifications.at(-1)[0], /no session manager/i);
    assert.equal(notifications.at(-1)[1], "warning");
  });
});

// Decision engine: three-tier fold thresholds
test("decideAfterUsage: none below fold threshold", async () => {
  const { decideAfterUsage } = await import("../src/cache-engine/decision-engine.ts");
  const cfg = { foldThreshold: 0.75, aggressiveFoldThreshold: 0.78, exitSummaryThreshold: 0.80 };
  assert.equal(decideAfterUsage(700, 1000, false, cfg).kind, "none");
});

test("decideAfterUsage: fold at 75%", async () => {
  const { decideAfterUsage } = await import("../src/cache-engine/decision-engine.ts");
  const cfg = { foldThreshold: 0.75, aggressiveFoldThreshold: 0.78, exitSummaryThreshold: 0.80 };
  const d = decideAfterUsage(760, 1000, false, cfg);
  assert.equal(d.kind, "fold");
  assert.equal(d.aggressive, false);
});

test("decideAfterUsage: aggressive fold at 78%", async () => {
  const { decideAfterUsage } = await import("../src/cache-engine/decision-engine.ts");
  const cfg = { foldThreshold: 0.75, aggressiveFoldThreshold: 0.78, exitSummaryThreshold: 0.80 };
  const d = decideAfterUsage(790, 1000, false, cfg);
  assert.equal(d.kind, "fold");
  assert.equal(d.aggressive, true);
});

test("decideAfterUsage: exit-with-summary at 80%", async () => {
  const { decideAfterUsage } = await import("../src/cache-engine/decision-engine.ts");
  const cfg = { foldThreshold: 0.75, aggressiveFoldThreshold: 0.78, exitSummaryThreshold: 0.80 };
  const d = decideAfterUsage(810, 1000, false, cfg);
  assert.equal(d.kind, "exit-with-summary");
});

test("decideAfterUsage: already folded this turn = none", async () => {
  const { decideAfterUsage } = await import("../src/cache-engine/decision-engine.ts");
  const cfg = { foldThreshold: 0.75, aggressiveFoldThreshold: 0.78, exitSummaryThreshold: 0.80 };
  assert.equal(decideAfterUsage(900, 1000, true, cfg).kind, "none");
});

test("decideAfterUsage: no ctxMax = none", async () => {
  const { decideAfterUsage } = await import("../src/cache-engine/decision-engine.ts");
  const cfg = { foldThreshold: 0.75, aggressiveFoldThreshold: 0.78, exitSummaryThreshold: 0.80 };
  assert.equal(decideAfterUsage(100, undefined, false, cfg).kind, "none");
});

test("estimateTurnStart: pre-flight fold at 90%", async () => {
  const { estimateTurnStart } = await import("../src/cache-engine/decision-engine.ts");
  const cfg = { preflightFoldThreshold: 0.90 };
  const mockCtx = { getContextUsage: () => ({ ratio: 0.92 }) };
  assert.equal(estimateTurnStart(mockCtx, cfg).shouldFold, true);
});

test("estimateTurnStart: no fold below 90%", async () => {
  const { estimateTurnStart } = await import("../src/cache-engine/decision-engine.ts");
  const cfg = { preflightFoldThreshold: 0.90 };
  const mockCtx = { getContextUsage: () => ({ ratio: 0.70 }) };
  assert.equal(estimateTurnStart(mockCtx, cfg).shouldFold, false);
});

test("three-tier decision: fold triggers at exact threshold boundaries", async () => {
  const { decideAfterUsage } = await import("../src/cache-engine/decision-engine.ts");
  const cfg = { foldThreshold: 0.75, aggressiveFoldThreshold: 0.78, exitSummaryThreshold: 0.80 };

  assert.equal(decideAfterUsage(749, 1000, false, cfg).kind, "none");          // just below fold
  assert.equal(decideAfterUsage(750, 1000, false, cfg).kind, "fold");            // exact fold
  assert.equal(decideAfterUsage(759, 1000, false, cfg).kind, "fold");            // still fold
  assert.equal(decideAfterUsage(760, 1000, false, cfg).kind, "fold");            // exact aggressive entry
  assert.equal(decideAfterUsage(779, 1000, false, cfg).kind, "fold");            // still aggressive (but kind=fold)
  assert.equal(decideAfterUsage(799, 1000, false, cfg).kind, "fold");            // just below exit
  assert.equal(decideAfterUsage(800, 1000, false, cfg).kind, "exit-with-summary"); // exact exit
  assert.equal(decideAfterUsage(850, 1000, false, cfg).kind, "exit-with-summary"); // past exit
});

test("pre-flight fold with readContextUsage fallback", async () => {
  const { estimateTurnStart } = await import("../src/cache-engine/decision-engine.ts");
  const cfg = { preflightFoldThreshold: 0.90 };
  // ctx with no getContextUsage
  const mockCtx = {};
  assert.equal(estimateTurnStart(mockCtx, cfg).shouldFold, false);
  assert.equal(estimateTurnStart(mockCtx, cfg).ratio, 0);
});

test("decideAfterUsage ratio is correctly reported", async () => {
  const { decideAfterUsage } = await import("../src/cache-engine/decision-engine.ts");
  const cfg = { foldThreshold: 0.75, aggressiveFoldThreshold: 0.78, exitSummaryThreshold: 0.80 };
  const d = decideAfterUsage(750, 1000, false, cfg);
  assert.equal(d.ratio, 0.75);
  assert.equal(d.promptTokens, 750);
  assert.equal(d.ctxMax, 1000);
});

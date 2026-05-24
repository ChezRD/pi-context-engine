import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import extension from "../src/index.ts";

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
  return {
    status,
    ctx: {
      model: {
        provider: "deepseek",
        id: "deepseek-v4-flash",
        reasoning: true,
        compat: { thinkingFormat: "deepseek", requiresReasoningContentOnAssistantMessages: true },
        thinkingLevelMap: { high: "high", xhigh: "max" },
      },
      ui: {
        setStatus(key, value) {
          status.push([key, value]);
        },
      },
      getContextUsage: async () => ({ usedTokens: 600, contextWindow: 1000 }),
      compact: async () => ({ ok: true }),
    },
  };
}

async function withTempHome(fn) {
  const oldHome = process.env.HOME;
  const home = await mkdtemp(join(tmpdir(), "pi-deepseek-cache-test-"));
  process.env.HOME = home;
  try {
    return await fn(home);
  } finally {
    process.env.HOME = oldHome;
    await rm(home, { recursive: true, force: true });
  }
}

test("extension default registers only command/hooks and does not mutate tools/provider/prompt", async () => {
  await withTempHome(async () => {
    const { pi, calls, commands } = createMockPi();
    const { ctx, status } = createMockCtx();

    await extension(pi, ctx);

    assert.equal(commands.has("deepseek-cache"), true);
    assert.equal(calls.some((call) => call[0] === "setActiveTools"), false);
    assert.equal(calls.some((call) => call[0] === "registerProvider"), false);
    assert.equal(calls.some((call) => call[0] === "registerTool"), false);
    assert.equal(calls.some((call) => call[0] === "on" && call[1] === "before_agent_start"), false);
    assert.equal(status.at(-1)[0], "deepseek-cache");
  });
});

test("status command reports cache stats after message_end usage", async () => {
  await withTempHome(async () => {
    const { pi, handlers, commands } = createMockPi();
    const { ctx } = createMockCtx();

    await extension(pi, ctx);
    await handlers.get("message_end")({ message: { usage: { input: 25, cacheRead: 75, output: 10 } } });

    const output = await commands.get("deepseek-cache").handler("status");
    assert.match(output, /model_kind: native/);
    assert.match(output, /session_hit_ratio: 75%/);
    assert.match(output, /uncached_input_tokens: 25/);
    assert.match(output, /cache_read_tokens: 75/);
    assert.match(output, /context_percent: 60%/);
  });
});

test("diagnose command includes read-only provider payload diagnostics", async () => {
  await withTempHome(async () => {
    const { pi, handlers, commands } = createMockPi();
    const { ctx } = createMockCtx();

    await extension(pi, ctx);
    const body = {
      messages: [{ role: "assistant", content: "x" }],
      tools: [{ type: "function" }],
      thinking: { type: "enabled" },
      reasoning_effort: "high",
      stream_options: { include_usage: true },
    };
    const result = await handlers.get("before_provider_request")({ payload: body });
    assert.equal(result, undefined);

    const output = await commands.get("deepseek-cache").handler("diagnose");
    assert.match(output, /payload_messages: 1/);
    assert.match(output, /payload_tools: 1/);
    assert.match(output, /deepseek_thinking_type: enabled/);
    assert.match(output, /assistant_missing_reasoning_content: 1/);
  });
});

test("reset-stats command clears accumulated telemetry", async () => {
  await withTempHome(async () => {
    const { pi, handlers, commands } = createMockPi();
    const { ctx } = createMockCtx();

    await extension(pi, ctx);
    await handlers.get("message_end")({ message: { usage: { input: 10, cacheRead: 90 } } });
    assert.match(await commands.get("deepseek-cache").handler("status"), /requests: 1/);

    assert.match(await commands.get("deepseek-cache").handler("reset-stats"), /reset/);
    assert.match(await commands.get("deepseek-cache").handler("status"), /requests: 0/);
  });
});

test("enable-capper persists config and registers only namespaced lookup tool", async () => {
  await withTempHome(async (home) => {
    const { pi, calls, commands } = createMockPi();
    const { ctx } = createMockCtx();

    await extension(pi, ctx);
    const output = await commands.get("deepseek-cache").handler("enable-capper");

    assert.match(output, /enabled/);
    assert.equal(calls.some((call) => call[0] === "registerTool" && call[1] === "deepseek_cache_lookup"), true);
    assert.equal(calls.some((call) => call[0] === "registerTool" && call[1] === "context_tree_query"), false);
    const config = JSON.parse(await readFile(join(home, ".pi/agent/deepseek-cache.json"), "utf8"));
    assert.equal(config.hugeResultCapper, true);
  });
});

test("tool_result hook caps huge outputs only after capper enabled", async () => {
  await withTempHome(async () => {
    const { pi, handlers, commands } = createMockPi();
    const { ctx } = createMockCtx();

    await extension(pi, ctx);
    const event = { content: [{ type: "text", text: "x".repeat(70_000) }], toolCallId: "tc1", toolName: "bash" };
    assert.equal(await handlers.get("tool_result")(event), undefined);

    await commands.get("deepseek-cache").handler("enable-capper");
    const capped = await handlers.get("tool_result")(event);
    assert.match(capped.content[0].text, /deepseek-cache: large tool result elided/);
    assert.match(capped.content[0].text, /ref: dsc-1/);
    assert.equal(capped.details.elidedBy, "pi-deepseek-cache");
  });
});

test("recommend-pruner command detects missing and present pruner", async () => {
  await withTempHome(async () => {
    const mock = createMockPi();
    const { ctx } = createMockCtx();
    await extension(mock.pi, ctx);

    const missing = await mock.commands.get("deepseek-cache").handler("recommend-pruner");
    assert.match(missing, /pi_context_prune: not_detected/);
    assert.match(missing, /\/pruner prune-on agent-message/);

    mock.pi.registerCommand("pruner", { handler: async () => "" });
    mock.pi.registerTool({ name: "context_tree_query" });
    const present = await mock.commands.get("deepseek-cache").handler("recommend-pruner");
    assert.match(present, /pi_context_prune: detected/);
    assert.match(present, /lookup_tool_context_tree_query: yes/);
  });
});

import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

let registerCommands, getCacheCompletions, ensureLookupTool, formatPruneCommandText, pruneResultLevel, createRuntimeState;

before(async () => {
  const mod = await import("../../src/commands.ts");
  registerCommands = mod.registerCommands;
  getCacheCompletions = mod.getCacheCompletions;
  ensureLookupTool = mod.ensureLookupTool;
  formatPruneCommandText = mod.formatPruneCommandText;
  pruneResultLevel = mod.pruneResultLevel;
  createRuntimeState = (await import("../../src/runtime-state.ts")).createRuntimeState;
});

function makePi() {
  const commands = [];
  const tools = [];
  return {
    on: () => {},
    sendMessage: () => {},
    getActiveTools: () => tools,
    registerTool: (t) => tools.push(t),
    registerCommand: (name, def) => commands.push({ name, handler: def.handler }),
    compact: (opts) => ({ ok: true, folded: false }),
    appendEntry: () => true,
    setStatus: () => {},
    config: {},
    ui: { setStatus: () => {} },
    _commands: commands,
    _tools: tools,
  };
}

function makeStore() {
  return { get: () => undefined };
}

describe("registerCommands", () => {
  it("registers context-engine and prune commands", () => {
    const pi = makePi();
    const state = createRuntimeState();
    const ctx = {};
    registerCommands(pi, () => ctx, state, () => {});
    
    const cmdNames = pi._commands.map(c => c.name);
    assert.ok(cmdNames.includes("context-engine"), "has context-engine");
    assert.ok(cmdNames.includes("prune"), "has prune");
    assert.ok(cmdNames.length >= 2);
  });

  it("getCacheCompletions handles whitespace, nested args, and no matches", () => {
    assert.ok(getCacheCompletions("  st")?.some((item) => item.value === "status"));
    assert.equal(getCacheCompletions("status now"), null);
    assert.equal(getCacheCompletions("zz"), null);
  });

  it("calls diagnose subcommand handler", async () => {
    const pi = makePi();
    const state = createRuntimeState();
    const ctx = { sessionManager: null };
    registerCommands(pi, () => ctx, state, () => {});
    
    const cmd = pi._commands.find(c => c.name === "context-engine");
    assert.ok(cmd, "context-engine command registered");
    const result = await cmd.handler("diagnose", {});
    assert.ok(typeof result === "string");
  });

  it("runs status, unknown, reset-stats, compact, hold, and fold command branches", async () => {
    const pi = makePi();
    const state = createRuntimeState();
    const notifications = [];
    const ctx = {
      ui: { notify: (text, level) => notifications.push({ text, level }), setStatus: () => {} },
      compact: () => ({ ok: true }),
    };
    registerCommands(pi, () => ctx, state, makeStore(), state.toolIndexer);
    const cmd = pi._commands.find(c => c.name === "context-engine");

    assert.equal(typeof await cmd.handler(undefined, ctx), "string");
    assert.equal(typeof await cmd.handler("unknown", ctx), "string");
    assert.equal(typeof await cmd.handler("reset-stats", ctx), "string");
    assert.equal(typeof await cmd.handler("compact", ctx), "string");
    assert.equal(typeof await cmd.handler("hold", ctx), "string");
    assert.equal(typeof await cmd.handler("fold", ctx), "string");
    assert.ok(notifications.length > 0);
  });

  it("saves config returned by the settings UI", async () => {
    const previousPath = process.env.PI_CONTEXT_ENGINE_CONFIG;
    process.env.PI_CONTEXT_ENGINE_CONFIG = join(mkdtempSync(join(tmpdir(), "pi-context-engine-")), "config.json");
    try {
      const pi = makePi();
      const state = createRuntimeState();
      const ctx = {
        hasUI: true,
        ui: {
          custom: async () => ({ pruneBatchSize: 75 }),
          notify: () => {},
          setStatus: () => {},
        },
      };
      registerCommands(pi, () => ctx, state, {}, {});

      const cmd = pi._commands.find(c => c.name === "context-engine");
      const result = await cmd.handler("config", ctx);

      assert.ok(typeof result === "string");
      assert.equal(state.config.pruneBatchSize, 75);
    } finally {
      if (previousPath === undefined) delete process.env.PI_CONTEXT_ENGINE_CONFIG;
      else process.env.PI_CONTEXT_ENGINE_CONFIG = previousPath;
    }
  });

  it("calls prune command handler", async () => {
    const pi = makePi();
    const state = createRuntimeState();
    registerCommands(pi, () => ({}), state, () => {});
    
    const cmd = pi._commands.find(c => c.name === "prune");
    assert.ok(cmd);
    const result = await cmd.handler("", {});
    // Should return some kind of result object
    assert.ok(result !== undefined);
  });

  it("prune command handler uses getCtx when command ctx is missing", async () => {
    const pi = makePi();
    const state = createRuntimeState();
    const ctx = { ui: { notify: () => {}, setStatus: () => {} } };
    registerCommands(pi, () => ctx, state, makeStore(), state.toolIndexer);
    const cmd = pi._commands.find(c => c.name === "prune");
    const result = await cmd.handler("");
    assert.equal(typeof result, "string");
  });

  it("manual prune rebuilds session context when summaries are accepted", async () => {
    const pi = makePi();
    const state = createRuntimeState();
    state.config.pruneModel = "default";
    const branch = [
      { turnIndex: 1, message: { role: "assistant", tool_calls: [{ id: "tc-prune", function: { name: "read", arguments: "{\"path\":\"src/a.ts\"}" } }] } },
      { turnIndex: 1, message: { role: "tool", tool_call_id: "tc-prune", content: "export const pruned = true;\n".repeat(80) } },
    ];
    const ctx = {
      sessionManager: {
        getBranch: () => branch,
        appendCustomMessageEntry: () => {},
      },
      ui: { notify: () => {}, setStatus: () => {} },
    };
    pi.complete = async () => ({
      content: "{\"summaries\":[{\"batchIndex\":0,\"coverage\":\"complete\",\"summary\":\"Read src/a.ts; pruned export confirmed.\"}]}",
      usage: { input: 100, output: 20, cacheRead: 0 },
    });
    registerCommands(pi, () => ctx, state, {}, state.toolIndexer);

    const cmd = pi._commands.find(c => c.name === "prune");
    const result = await cmd.handler("", ctx);

    assert.equal(typeof result, "string");
    assert.equal(state.engine.prune.impact.lastRebuildReasonKey, "engine.prune.rebuild.reason.manual");
  });

  it("config command reports cancellation", async () => {
    const pi = makePi();
    const state = createRuntimeState();
    const ctx = { hasUI: false, ui: { notify: () => {}, setStatus: () => {} } };
    registerCommands(pi, () => ctx, state, makeStore(), state.toolIndexer);
    const cmd = pi._commands.find(c => c.name === "context-engine");
    const result = await cmd.handler("config", ctx);
    assert.equal(typeof result, "string");
  });
});

describe("getCacheCompletions", () => {
  it("returns suggestions for di prefix", () => {
    const result = getCacheCompletions("di");
    assert.ok(Array.isArray(result) || result === undefined);
  });
});

describe("ensureLookupTool", () => {
  it("registers context_result_lookup tool only once", () => {
    const pi = makePi();
    const store = {};
    const state = { config: { locale: "en" }, engine: {} };
    ensureLookupTool(pi, store, state);
    const count = pi._tools.filter(t => t.name === "context_result_lookup").length;
    // Second call should not register again
    ensureLookupTool(pi, store, state);
    assert.equal(pi._tools.filter(t => t.name === "context_result_lookup").length, count || 0);
  });
});

describe("formatPruneCommandText", () => {
  it("returns text when details have summarization", () => {
    const r = formatPruneCommandText(
      { config: { locale: "en" } },
      { text: "pruned 2", details: { summarized: 2 } }
    );
    assert.equal(r, "pruned 2");
  });
  it("returns text when no details", () => {
    const r = formatPruneCommandText(
      { config: { locale: "en" } },
      { text: "done", details: undefined }
    );
    assert.equal(r, "done");
  });
  it("returns none_found details when reason is none_found", () => {
    const r = formatPruneCommandText(
      { config: { locale: "en" } },
      { text: "skip", details: { reason: "none_found", scan: { seen: 5 } } }
    );
    assert.ok(r.startsWith("skip"));
  });
  it("returns diagnostics for non-none skip reasons with error keys and fallbacks", () => {
    const r = formatPruneCommandText(
      { config: { locale: "en", pruneModel: "fallback-model" } },
      { text: "skip", details: { reason: "other", errorKey: "tool.prune.error.noModel", attempted: 1, batches: 2 } }
    );
    assert.ok(r.startsWith("skip"));
    assert.ok(r.length > "skip".length);
  });
});

describe("pruneResultLevel", () => {
  it("returns warning for undefined details", () => {
    assert.equal(pruneResultLevel(undefined), "warning");
  });
  it("returns info when summarized > 0", () => {
    assert.equal(pruneResultLevel({ summarized: 1 }), "info");
  });
  it("returns warning for none_found", () => {
    assert.equal(pruneResultLevel({ reason: "none_found" }), "warning");
  });
  it("returns warning for other", () => {
    assert.equal(pruneResultLevel({}), "warning");
  });
});

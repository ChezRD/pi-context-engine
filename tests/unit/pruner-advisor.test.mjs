import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";
import { mkdirSync, writeFileSync, rmSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
register("./../__mocks__/loader.mjs", import.meta.url);

const PRUNE_CONFIG_DIR = join(homedir(), ".pi", "agent", "context-prune");
const PRUNE_CONFIG_PATH = join(PRUNE_CONFIG_DIR, "settings.json");

const m = {};
describe("pruner-advisor", () => {
  it("loads module", async () => {
    const mod = await import("../../src/pruner-advisor.ts");
    m.classifyPruner = mod.classifyPruner;
    m.detectPruner = mod.detectPruner;
    assert.equal(typeof m.classifyPruner, "function");
    assert.equal(typeof m.detectPruner, "function");
  });

  describe("classifyPruner", () => {
    it("returns risky when disabled", () => {
      const result = m.classifyPruner({ enabled: false });
      assert.equal(result.cacheProfile, "risky");
      assert.ok(typeof result.cacheProfileReason === "string");
    });

    it("returns bad for every-turn", () => {
      const result = m.classifyPruner({ pruneOn: "every-turn" });
      assert.equal(result.cacheProfile, "bad");
    });

    it("returns good for agent-message with batching", () => {
      const result = m.classifyPruner({ pruneOn: "agent-message", batchingMode: "agent-message" });
      assert.equal(result.cacheProfile, "good");
    });

    it("returns good for checkpoint", () => {
      const result = m.classifyPruner({ pruneOn: "checkpoint" });
      assert.equal(result.cacheProfile, "good");
    });

    it("returns good for on-demand", () => {
      const result = m.classifyPruner({ pruneOn: "on-demand" });
      assert.equal(result.cacheProfile, "good");
    });

    it("returns risky for agentic-auto", () => {
      const result = m.classifyPruner({ pruneOn: "agentic-auto" });
      assert.equal(result.cacheProfile, "risky");
    });

    it("returns risky for unknown profile", () => {
      const result = m.classifyPruner({ pruneOn: "foobar" });
      assert.equal(result.cacheProfile, "risky");
    });

    it("returns risky for empty config", () => {
      const result = m.classifyPruner({});
      assert.equal(result.cacheProfile, "risky");
    });
  });

  describe("detectPruner", () => {
    it("detects no pruner when pi has no tools/commands", () => {
      const pi = {
        getCommands: () => [],
        getAllTools: () => [],
        getActiveTools: () => [],
      };
      const result = m.detectPruner(pi);
      assert.equal(result.installed, false);
      assert.equal(result.commands.length, 0);
    });

    it("detects pruner from context_tree_query tool", () => {
      const pi = {
        getCommands: () => [],
        getAllTools: () => [{ name: "context_tree_query" }],
        getActiveTools: () => [],
      };
      const result = m.detectPruner(pi);
      assert.equal(result.installed, true);
      assert.equal(result.lookupTool, true);
    });

    it("detects pruner from context_prune tool", () => {
      const pi = {
        getCommands: () => [],
        getAllTools: () => [{ name: "context_prune" }],
        getActiveTools: () => [],
      };
      const result = m.detectPruner(pi);
      assert.equal(result.installed, true);
      assert.equal(result.agenticToolRegistered, true);
    });

    it("detects pruner from pruner: commands", () => {
      const pi = {
        getCommands: () => ["pruner:status", "pruner:run"],
        getAllTools: () => [],
        getActiveTools: () => [],
      };
      const result = m.detectPruner(pi);
      assert.equal(result.installed, true);
      assert.ok(result.commands.includes("pruner:status"));
      assert.ok(result.commands.includes("pruner:run"));
    });

    it("handles namesFrom string items", () => {
      const pi = {
        getCommands: () => ["pruner"],
        getAllTools: () => [],
        getActiveTools: () => [],
      };
      const result = m.detectPruner(pi);
      assert.equal(result.installed, true);
      assert.equal(result.commands[0], "pruner");
    });

    it("handles non-array getCommands", () => {
      const pi = {
        getCommands: () => undefined,
        getAllTools: () => [],
        getActiveTools: () => [],
      };
      assert.throws(() => m.detectPruner(pi), /Cannot read properties of undefined/);
    });

    it("handles non-array getAllTools", () => {
      const pi = {
        getCommands: () => [],
        getAllTools: () => undefined,
        getActiveTools: () => [],
      };
      assert.throws(() => m.detectPruner(pi), /Cannot read properties of undefined/);
    });

    it("handles corrupt config file gracefully", () => {
      // Ensure dir and write invalid JSON
      mkdirSync(PRUNE_CONFIG_DIR, { recursive: true });
      const existed = existsSync(PRUNE_CONFIG_PATH);
      const backup = existed ? readFileSync(PRUNE_CONFIG_PATH, "utf8") : null;
      try {
        writeFileSync(PRUNE_CONFIG_PATH, "not valid json", "utf8");
      } catch (error) {
        if (error?.code === "EROFS" || error?.code === "EACCES" || error?.code === "EPERM") return;
        throw error;
      }
      try {
        const pi = { getCommands: () => [], getAllTools: () => [], getActiveTools: () => [] };
        const result = m.detectPruner(pi);
        // Should not throw — catch in readPrunerConfig returns {}
        assert.equal(result.installed, false);
      } finally {
        if (backup !== null) {
          writeFileSync(PRUNE_CONFIG_PATH, backup, "utf8");
        } else {
          rmSync(PRUNE_CONFIG_PATH, { force: true });
        }
      }
    });

    it("falls back when context-prune settings cannot be read as JSON", () => {
      const previousHome = process.env.HOME;
      const tempHome = join(process.cwd(), ".tmp-pruner-advisor-bad-home");
      process.env.HOME = tempHome;
      mkdirSync(join(tempHome, ".pi", "agent", "context-prune"), { recursive: true });
      writeFileSync(join(tempHome, ".pi", "agent", "context-prune", "settings.json"), "{bad json", "utf8");
      try {
        const result = m.detectPruner({ getCommands: () => [], getAllTools: () => [], getActiveTools: () => [] });
        assert.equal(result.installed, false);
      } finally {
        rmSync(tempHome, { recursive: true, force: true });
        if (previousHome === undefined) delete process.env.HOME;
        else process.env.HOME = previousHome;
      }
    });

    it("normalizes non-string names and invalid typed config fields", () => {
      const previousHome = process.env.HOME;
      const tempHome = join(process.cwd(), ".tmp-pruner-advisor-typed-home");
      process.env.HOME = tempHome;
      mkdirSync(join(tempHome, ".pi", "agent", "context-prune"), { recursive: true });
      writeFileSync(join(tempHome, ".pi", "agent", "context-prune", "settings.json"), JSON.stringify({
        enabled: "yes",
        pruneOn: 5,
        batchingMode: false,
        summarizerModel: null,
        summarizerThinking: {},
      }), "utf8");
      try {
        const result = m.detectPruner({
          getCommands: () => [{ name: 42 }, { name: "noop" }],
          getAllTools: () => [{ name: null }],
          getActiveTools: () => [{ name: "context_prune" }],
        });
        assert.equal(result.installed, false);
        assert.equal(result.agenticToolActive, true);
        assert.equal(result.pruneOn, undefined);
      } finally {
        rmSync(tempHome, { recursive: true, force: true });
        if (previousHome === undefined) delete process.env.HOME;
        else process.env.HOME = previousHome;
      }
    });
  });
});

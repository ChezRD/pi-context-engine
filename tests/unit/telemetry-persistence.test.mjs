import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";
register("../__mocks__/loader.mjs", import.meta.url);

const m = {};

describe("telemetry-persistence", () => {
  it("loads module and exports", async () => {
    Object.assign(m, await import("../../src/telemetry-persistence.ts"));
    Object.assign(m, await import("../../src/runtime-state.ts"));
    assert.equal(typeof m.CUSTOM_TYPE_TELEMETRY, "string");
    assert.equal(typeof m.persistTelemetry, "function");
    assert.equal(typeof m.restoreTelemetryFromSession, "function");
  });

  it("restores default prune impact when persisted telemetry lacks it", () => {
    const state = m.createRuntimeState();
    const latest = {
      version: 1,
      stats: state.stats,
      engine: {
        ...state.engine,
        prune: {
          ...state.engine.prune,
          impact: undefined,
        },
      },
    };
    const restored = m.restoreTelemetryFromSession({
      sessionManager: {
        getEntries: () => [{ type: "custom", customType: m.CUSTOM_TYPE_TELEMETRY, data: latest }],
      },
    }, state);

    assert.equal(restored, true);
    assert.equal(typeof state.engine.prune.impact.summarizeRequests, "number");
    assert.deepEqual(state.engine.prune.pendingBatches, []);
  });

  it("persists compact telemetry and prune debug entries", () => {
    const state = m.createRuntimeState();
    state.stats.usages = Array.from({ length: 260 }, (_, index) => ({ input: index }));
    state.stats.compacts = Array.from({ length: 90 }, (_, index) => ({ turn: index }));
    state.engine.prune.summarizedIds = Array.from({ length: 2010 }, (_, index) => `s-${index}`);
    state.engine.prune.skippedOversizedIds = Array.from({ length: 2010 }, (_, index) => `o-${index}`);
    state.engine.prune.skippedMissingResultIds = Array.from({ length: 2010 }, (_, index) => `m-${index}`);
    state.engine.prune.appliedIds = Array.from({ length: 2010 }, (_, index) => `a-${index}`);
    state.engine.prune.summarizedRecords = Array.from({ length: 510 }, (_, index) => ({ id: `r-${index}`, summaryText: "x".repeat(1300) }));
    state.engine.prune.awaitingImpact = { appliedIds: Array.from({ length: 2010 }, (_, index) => `p-${index}`) };
    const entries = [];
    const pi = { appendEntry: (customType, data) => entries.push({ customType, data }) };

    m.persistTelemetry(pi, state);
    m.appendPruneDebugEntry(pi, {
      prompt: "p".repeat(21000),
      response: "r".repeat(21000),
      acceptedSummaries: ["s".repeat(3100), { structured: true }],
    });

    assert.equal(entries[0].customType, m.CUSTOM_TYPE_TELEMETRY);
    assert.equal(entries[0].data.stats.usages.length, 250);
    assert.equal(entries[0].data.stats.compacts.length, 80);
    assert.equal(entries[0].data.engine.prune.summarizedIds.length, 2000);
    assert.ok(entries[0].data.engine.prune.summarizedRecords[0].summaryText.includes("truncated"));
    assert.equal(entries[1].customType, m.CUSTOM_TYPE_PRUNE_DEBUG);
    assert.ok(entries[1].data.prompt.includes("truncated"));
    assert.ok(entries[1].data.acceptedSummaries[0].includes("truncated"));
    assert.deepEqual(entries[1].data.acceptedSummaries[1], { structured: true });
  });

  it("restore falls back to getBranch and merges latest prune debug", () => {
    const state = m.createRuntimeState();
    const latest = {
      version: 1,
      stats: { ...state.stats, requests: 3 },
      engine: { ...state.engine, prune: { ...state.engine.prune, impact: { summarizeRequests: 7 } } },
    };
    const restored = m.restoreTelemetryFromSession({
      sessionManager: {
        getBranch: () => [
          { type: "custom", customType: m.CUSTOM_TYPE_PRUNE_DEBUG, data: { version: 1, prompt: "prompt", response: "response", acceptedSummaries: ["ok"] } },
          { type: "custom", customType: m.CUSTOM_TYPE_TELEMETRY, data: latest },
        ],
      },
    }, state);

    assert.equal(restored, true);
    assert.equal(state.stats.requests, 3);
    assert.equal(state.engine.prune.impact.summarizeRequests, 7);
    assert.equal(state.engine.prune.impact.lastSummarizePrompt, "prompt");
  });

  it("returns false when no telemetry is present and skips append without appendEntry", () => {
    const state = m.createRuntimeState();
    assert.equal(m.restoreTelemetryFromSession({ sessionManager: { getEntries: () => [] } }, state), false);
    assert.doesNotThrow(() => m.persistTelemetry({}, state));
  });

  it("compactDebugData handles non-string prompt, response, and non-array acceptedSummaries", () => {
    const entries = [];
    const pi = { appendEntry: (customType, data) => entries.push({ customType, data }) };

    // Non-string prompt (number)
    m.appendPruneDebugEntry(pi, {
      prompt: 12345,
      response: "valid string",
      acceptedSummaries: ["summary"]
    });
    assert.equal(typeof entries[0].data.prompt, "number");
    assert.equal(entries[0].data.response, "valid string");

    // Non-string response (object)
    m.appendPruneDebugEntry(pi, {
      prompt: "ok",
      response: { custom: "object" },
      acceptedSummaries: ["summary"]
    });
    assert.deepEqual(entries[1].data.response, { custom: "object" });

    // Non-array acceptedSummaries (string)
    m.appendPruneDebugEntry(pi, {
      prompt: "ok",
      response: "ok",
      acceptedSummaries: "single-summary"
    });
    assert.equal(entries[2].data.acceptedSummaries, "single-summary");
  });
});

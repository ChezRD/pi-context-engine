import { describe, it, before } from "node:test";
import assert from "node:assert/strict";

const m = {};
const { createRuntimeState } = await import("../../../src/runtime-state.ts");

function mockIndexer() {
  const summarized = new Set();
  return {
    isSummarized: (id) => summarized.has(id),
    getAllSummarized: () => [],
    markSummarized: (id) => summarized.add(id),
  };
}

describe("rebuild", () => {
  before(async () => {
    const mod = await import("../../../src/projection/rebuild.ts");
    Object.assign(m, mod);
  });

  it("loads module", () => {
    assert.equal(typeof m.messagesFromBranch, "function");
    assert.equal(typeof m.collectPrunableToolResultIds, "function");
    assert.equal(typeof m.rebuildPrunedContext, "function");
    assert.equal(typeof m.rebuildPrunedContextFromSession, "function");
  });

  it("messagesFromBranch returns [] for undefined", () => {
    assert.deepEqual(m.messagesFromBranch(undefined), []);
  });

  it("messagesFromBranch returns [] for non-array", () => {
    assert.deepEqual(m.messagesFromBranch(null), []);
  });

  it("messagesFromBranch extracts message entries", () => {
    const branch = [
      { type: "message", message: { role: "user", content: "hello" } },
      { type: "message", message: { role: "assistant", content: "hi" } },
    ];
    const msgs = m.messagesFromBranch(branch);
    assert.equal(msgs.length, 2);
    assert.equal(msgs[0].role, "user");
    assert.equal(msgs[1].role, "assistant");
  });

  it("messagesFromBranch skips context-engine-prune-summary", () => {
    const branch = [
      { type: "custom_message", customType: "context-engine-prune-summary", content: "x" },
      { type: "message", message: { role: "user", content: "hello" } },
    ];
    const msgs = m.messagesFromBranch(branch);
    assert.equal(msgs.length, 1);
  });

  it("messagesFromBranch converts custom_message entries", () => {
    const branch = [
      { type: "custom_message", customType: "test", content: "data", display: false, timestamp: "2026-01-01T00:00:00.000Z" },
    ];
    const msgs = m.messagesFromBranch(branch);
    assert.equal(msgs.length, 1);
    assert.equal(msgs[0].role, "custom");
    assert.equal(msgs[0].customType, "test");
    assert.equal(msgs[0].display, false);
  });

  it("messagesFromBranch preserves array and typed content without timestamps", () => {
    const branch = [
      { type: "custom_message", customType: "array", content: [{ type: "text", text: "A" }] },
      { type: "custom_message", customType: "typed", content: { type: "text", text: "B" } },
      { type: "branch_summary", summary: { type: "text", text: "C" } },
      { type: "compaction", summary: null },
      { type: "compaction", summary: 123 },
    ];
    const msgs = m.messagesFromBranch(branch);
    assert.equal(msgs.length, 4);
    assert.deepEqual(msgs[0].content, [{ type: "text", text: "A" }]);
    assert.deepEqual(msgs[1].content, [{ type: "text", text: "B" }]);
    assert.deepEqual(msgs[2].content, [{ type: "text", text: "C" }]);
    assert.deepEqual(msgs[3].content, [{ type: "text", text: "123" }]);
  });

  it("messagesFromBranch estimates unusual custom payload values", () => {
    const branch = [
      { type: "custom_message", customType: "test", content: { nested: ["abc", 12, true, Symbol.for("x")] }, display: false },
    ];
    const msgs = m.messagesFromBranch(branch);
    assert.equal(msgs.length, 1);
    assert.equal(msgs[0].role, "custom");
    assert.equal(typeof msgs[0].content, "object");
  });

  it("messagesFromBranch converts branch_summary entries", () => {
    const branch = [
      { type: "branch_summary", summary: "summary text", timestamp: "2026-01-01T00:00:00.000Z" },
    ];
    const msgs = m.messagesFromBranch(branch);
    assert.equal(msgs.length, 1);
    assert.equal(msgs[0].role, "assistant");
  });

  it("messagesFromBranch converts compaction entries", () => {
    const branch = [
      { type: "compaction", summary: "compact", timestamp: "2026-01-01T00:00:00.000Z" },
    ];
    const msgs = m.messagesFromBranch(branch);
    assert.equal(msgs.length, 1);
    assert.equal(msgs[0].role, "assistant");
  });

  it("collectPrunableToolResultIds finds summarized tool results", () => {
    const indexer = mockIndexer();
    indexer.markSummarized("tc-1");
    const state = createRuntimeState();
    state.toolIndexer = indexer;
    const msgs = [
      { role: "tool", toolCallId: "tc-1", content: "big result" },
      { role: "tool", toolCallId: "tc-2", content: "not summarized" },
    ];
    const ids = m.collectPrunableToolResultIds(msgs, state);
    assert.deepEqual(ids, ["tc-1"]);
  });

  it("collectPrunableToolResultIds handles toolResult role", () => {
    const indexer = mockIndexer();
    indexer.markSummarized("tc-3");
    const state = createRuntimeState();
    state.toolIndexer = indexer;
    const msgs = [{ role: "toolResult", tool_call_id: "tc-3", content: "x" }];
    assert.deepEqual(m.collectPrunableToolResultIds(msgs, state), ["tc-3"]);
  });

  it("rebuildPrunedContext returns unchanged when no summarizations exist", () => {
    const state = createRuntimeState();
    state.toolIndexer = mockIndexer();
    state.engine.prune.impact = {};
    state.engine.prune.appliedIds = [];
    const result = m.rebuildPrunedContext(
      [{ role: "user", content: "hi" }, { role: "assistant", content: "there" }],
      state,
    );
    assert.equal(result.changed, false);
    assert.equal(result.messages.length, 2);
  });

  it("rebuildPrunedContext handles non-array messages", () => {
    const state = createRuntimeState();
    state.toolIndexer = mockIndexer();
    state.engine.prune.impact = {};
    state.engine.prune.appliedIds = [];
    const result = m.rebuildPrunedContext(null, state);
    assert.equal(result.changed, false);
    assert.equal(result.messages.length, 0);
  });

  it("messagesFromBranch handles null/undefined content via asAssistantContent", () => {
    const branch = [
      { type: "custom_message", customType: "null-content", content: null },
      { type: "custom_message", customType: "undef-content" },
    ];
    const msgs = m.messagesFromBranch(branch);
    assert.equal(msgs.length, 2);
    assert.deepEqual(msgs[0].content, []);
    assert.deepEqual(msgs[1].content, []);
  });

  it("rebuildPrunedContext estimates symbol-valued message fields", () => {
    const state = createRuntimeState();
    state.toolIndexer = mockIndexer();
    state.engine.prune.impact = {};
    state.engine.prune.appliedIds = [];
    const result = m.rebuildPrunedContext([{ role: "custom", content: Symbol.for("x") }], state);
    assert.equal(result.changed, false);
    assert.equal(result.sourceMessages, 1);
  });
});

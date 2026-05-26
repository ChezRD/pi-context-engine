import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";
register("../../__mocks__/loader.mjs", import.meta.url);

describe("tool-intent", () => {
  let m;
  before(async () => {
    m = await import("../../../src/cache-engine/tool-intent.ts");
  });

  it("exports all expected functions", () => {
    assert.ok(m.extractMessageText);
    assert.ok(m.detectToolIntent);
    assert.ok(m.detectUserIntent);
    assert.ok(m.detectUserIntentMultilingual);
    assert.ok(m.extractUserIntentText);
    assert.ok(m.hasStructuredToolCalls);
    assert.ok(m.loadToolIntentVocabulary);
    assert.ok(m.reconcileToolIntentWithCall);
    assert.ok(m.recordToolIntentDetection);
    assert.ok(m.createToolIntentState);
  });

  describe("createToolIntentState", () => {
    it("returns initial empty state", () => {
      const s = m.createToolIntentState();
      assert.deepEqual(s.pending, []);
      assert.deepEqual(s.recent, []);
      assert.equal(s.stats.detected, 0);
    });
  });

  describe("extractMessageText", () => {
    it("returns string content directly", () => {
      assert.equal(m.extractMessageText({ content: "hello" }), "hello");
    });

    it("joins array of strings", () => {
      assert.equal(m.extractMessageText({ content: ["a", "b", "c"] }), "a b c");
    });

    it("extracts text from content parts with type", () => {
      const msg = { content: [{ type: "text", text: "hello" }, " ", { type: "text", text: "world" }] };
	      assert.equal(m.extractMessageText(msg), "hello   world");
    });

    it("filters empty content", () => {
      assert.equal(m.extractMessageText({ content: ["a", "", "b"] }), "a b");
    });

    it("skips non-text objects", () => {
      const msg = { content: [{ type: "image", source: "..." }, { type: "text", text: "caption" }] };
      assert.equal(m.extractMessageText(msg), "caption");
    });

    it("returns empty for no message", () => {
      assert.equal(m.extractMessageText(null), "");
    });

    it("returns empty for non-array non-string content", () => {
      assert.equal(m.extractMessageText({ content: {} }), "");
    });
  });

  describe("detectUserIntent", () => {
    it("detects save-memory for remember words", () => {
      const r = m.detectUserIntent("please remember this", "en", {});
      assert.equal(r.kind, "save-memory");
    });

    it("detects analyze for diagnose words", () => {
      const r = m.detectUserIntent("can you diagnose this", "en", {});
      assert.equal(r.kind, "analyze");
    });

    it("returns general when no specific intent", () => {
      const r = m.detectUserIntent("hello how are you", "en", {});
      assert.equal(r.kind, "general");
    });

    it("detects prune and diagnose requests without trusting meta labels", () => {
      assert.equal(m.detectUserIntent("please prune old tool outputs", { locale: "en" }).kind, "prune-request");
      assert.equal(m.detectUserIntent("was this pre-existing", { locale: "en" }).kind, "diagnose");
    });

    it("extracts nested prompt objects and ignores inline code for user intent", () => {
      assert.equal(m.extractUserIntentText({ payload: { prompt: { content: [{ text: "please search this package" }] } } }), "please search this package");
      assert.equal(m.detectUserIntent("`diagnose cache`", { locale: "en" }).kind, "general");
    });
  });

  describe("detectToolIntent", () => {
    it("treats inline code-only tool calls as schema examples", () => {
      const r = m.detectToolIntent({ content: "`read({ path: \"src/a.ts\" })`" }, { locale: "en", registeredTools: ["read"] });
      assert.equal(r.kind, "example-or-schema");
      assert.equal(r.reasonCode, "code_block_only");
      assert.equal(r.toolName, "read");
    });

    it("detects tool discussion when a registered tool is mentioned with a tool noun", () => {
      const r = m.detectToolIntent({ content: "The read tool result explains the file." }, { locale: "en", registeredTools: ["read"] });
      assert.equal(r.kind, "tool-discussion");
      assert.equal(r.toolName, "read");
    });
  });

  describe("hasStructuredToolCalls", () => {
    it("returns false for plain text", () => {
      assert.equal(m.hasStructuredToolCalls("just text"), false);
    });

    it("returns false for message without tool_calls", () => {
      assert.equal(m.hasStructuredToolCalls({ role: "user", content: "hi" }), false);
    });

    it("returns true for message with tool_calls array", () => {
      const msg = { role: "assistant", content: "", tool_calls: [{ id: "1" }] };
      assert.equal(m.hasStructuredToolCalls(msg), true);
    });

    it("returns true for message with camelCase toolCalls", () => {
      const msg = { role: "assistant", content: "", toolCalls: [{ id: "1" }] };
      assert.equal(m.hasStructuredToolCalls(msg), true);
    });
  });

  describe("reconcileToolIntentWithCall", () => {
    it("returns true when tool name matches", () => {
      const state = m.createToolIntentState();
      m.recordToolIntentDetection(state, {
	        kind: "imminent-tool-call", confidence: "high", locale: "en",
	        toolName: "read", expectedToolNames: ["read"], reasonCode: "imperative_tool_action",
        evidence: { proseSnippet: "read file" }
      }, 1);
      assert.equal(m.reconcileToolIntentWithCall(state, "read"), true);
    });

    it("returns false when names differ", () => {
      const state = m.createToolIntentState();
      m.recordToolIntentDetection(state, {
	        kind: "imminent-tool-call", confidence: "high", locale: "en",
	        toolName: "bash", expectedToolNames: ["bash"], reasonCode: "imperative_tool_action",
        evidence: { proseSnippet: "run bash" }
      }, 1);
      assert.equal(m.reconcileToolIntentWithCall(state, "read"), false);
    });
  });
});

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";
register("../../__mocks__/loader.mjs", import.meta.url);

const m = {};

describe("harness-content", () => {
  it("loads module and exports", async () => {
    Object.assign(m, await import("../../../src/projection/harness-content.ts"));
    assert.equal(typeof m.CONTEXT_RESULT_LOOKUP_TOOL, "string");
    assert.equal(typeof m.parseContextResultLookupHeader, "function");
  });

  it("extractHarnessResultFacts returns undefined for empty input", () => {
    assert.equal(m.extractHarnessResultFacts(undefined), undefined);
    assert.equal(m.extractHarnessResultFacts(""), undefined);
  });

  it("extractHarnessResultFacts recognizes duplicate skip marker", () => {
    const result = m.extractHarnessResultFacts("[context-engine duplicate tool call skipped]");
    assert.equal(result?.kind, "duplicate-skip");
    assert.equal(result?.duplicateSkip, true);
  });

  it("extractHarnessResultFacts returns unknown preview for model-visible context without lookup header", () => {
    // Model-visible context that has no slice_metadata or lookup payload
    const text = `<!-- pi-context-engine: model-visible context -->\n<model_visible_context>\n<metadata>{}</metadata>\n</model_visible_context>`;
    const result = m.extractHarnessResultFacts(text);
    assert.equal(result?.kind, "preview");
    assert.equal(result?.continuation, "unknown");
  });

  it("firstContextResultLookupHeader returns undefined for non-matching text", () => {
    assert.equal(m.firstContextResultLookupHeader("some random text"), undefined);
    assert.equal(m.firstContextResultLookupHeader(""), undefined);
    assert.equal(m.firstContextResultLookupHeader(undefined), undefined);
  });

  it("firstContextResultLookupHeader extracts header from matching text", () => {
    const text = "[context_result_lookup ref=abc offset=0 kind=full]";
    const result = m.firstContextResultLookupHeader(text);
    assert.ok(result?.includes("context_result_lookup"));
  });

  it("normalizeHarnessFactsForSummary returns undefined for duplicateSkip", () => {
    assert.equal(m.normalizeHarnessFactsForSummary(undefined), undefined);
    assert.equal(m.normalizeHarnessFactsForSummary({ kind: "duplicate-skip", duplicateSkip: true, continuation: "none" }), undefined);
  });

  it("normalizes empty facts and strips legacy continuation hint to undefined body", () => {
    assert.equal(m.normalizeHarnessFactsForSummary({ kind: "unknown", continuation: "none" }), undefined);
    assert.deepEqual(m.stripLegacyUiContinuationHint("\n[Showing lines 1-2]"), {
      body: undefined,
      hasLegacyUiHint: true,
    });
  });
});

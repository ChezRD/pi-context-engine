import { describe, it } from "node:test";
import assert from "node:assert/strict";

const m = await import("../../src/tool-evidence.ts");

describe("tool-evidence", () => {
  it("grep returns evidence", () => {
    const r = m.maybeAnnotateToolEvidence("grep", {}, { content: [{ type: "text", text: "match" }] });
    assert.ok(r);
    assert.equal(r.details.evidenceKind, "search_hits");
  });

  it("find returns complete listing", () => {
    const r = m.maybeAnnotateToolEvidence("find", { path: "." }, { content: [{ type: "text", text: "file1\nfile2" }] });
    assert.ok(r);
    assert.equal(r.details.evidenceKind, "find_listing");
  });

  it("find returns partial listing", () => {
    const r = m.maybeAnnotateToolEvidence("find", { path: "." }, { content: [{ type: "text", text: "file1\nhasMore: true" }] });
    assert.ok(r);
    assert.equal(r.details.evidenceKind, "partial_find_listing");
  });

  it("ls returns complete listing", () => {
    const r = m.maybeAnnotateToolEvidence("ls", { path: "." }, { content: [{ type: "text", text: "file1" }] });
    assert.ok(r);
    assert.equal(r.details.evidenceKind, "ls_listing");
  });

  it("returns undefined for empty content", () => {
    assert.equal(m.maybeAnnotateToolEvidence("bash", [], { content: [] }), undefined);
  });

  it("TOOL_EVIDENCE_KIND is correct", () => {
    assert.equal(m.TOOL_EVIDENCE_KIND, "tool_result_evidence");
  });

  it("annotated result contains evidenceBy", () => {
    const r = m.maybeAnnotateToolEvidence("grep", {}, { content: [{ type: "text", text: "hit" }] });
    assert.equal(r.details.evidenceBy, "pi-context-engine");
  });

  it("returns undefined for bash with unrecognized command", () => {
    const r = m.maybeAnnotateToolEvidence("bash", { command: "echo hello" }, { content: [{ type: "text", text: "hello\nworld" }] });
    assert.equal(r, undefined);
  });

  it("returns undefined for read without truncation markers", () => {
    const r = m.maybeAnnotateToolEvidence("read", { path: "small.txt" }, { content: [{ type: "text", text: "small content" }] });
    assert.equal(r, undefined);
  });
});

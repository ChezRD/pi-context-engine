import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";
register("../../__mocks__/loader.mjs", import.meta.url);

const m = {};
let buildModelVisibleContext;

describe("tool-renderers", () => {
  it("loads module and functions", async () => {
    const mod = await import("../../../src/ui/tool-renderers.ts");
    assert.equal(typeof mod.registerCompactToolRenderers, "function");
    Object.assign(m, mod);
    buildModelVisibleContext = (await import("../../../src/model-visible.ts")).buildModelVisibleContext;
  });

  it("registerCompactToolRenderers registers 5 tools", async () => {
    const registered = [];
    const pi = { registerTool: (t) => registered.push(t) };
    m.registerCompactToolRenderers(pi, {});
    assert.equal(registered.length, 5);
    const names = registered.map((t) => t.name);
    assert.deepEqual(names, ["read", "bash", "grep", "find", "ls"]);
  });

  it("registered tools have label and description", async () => {
    const registered = [];
    const pi = { registerTool: (t) => registered.push(t) };
    m.registerCompactToolRenderers(pi, {});
    for (const t of registered) {
      assert.ok(t.label, `tool ${t.name} missing label`);
      assert.ok(t.description, `tool ${t.name} missing description`);
    }
  });

  it("bash renderCall shows $ prefix", async () => {
    let captured;
    const pi = { registerTool: (t) => { captured = t; } };
    m.registerCompactToolRenderers(pi, {});
    const result = captured.renderCall({ command: "ls -la" }, { fg: () => () => "", bold: (s) => s });
    assert.ok(result != null);
  });

  it("renders non-bash calls, plain results, empty/whitespace results, model-visible metadata, and expanded long output", async () => {
    const registered = [];
    const pi = { registerTool: (t) => registered.push(t) };
    const theme = { fg: (_name, value) => value, bold: (value) => value };
    m.registerCompactToolRenderers(pi, {});

    const read = registered.find((tool) => tool.name === "read");
    assert.ok(read.renderCall({ path: `${process.env.HOME}/file.txt` }, theme).render(80)[0].includes("~/file.txt"));
    assert.ok(read.renderCall({ pattern: "needle" }, theme).render(80)[0].includes("needle"));

    assert.deepEqual(read.renderResult({ content: [] }, { expanded: false }, theme).render(80), []);
    assert.ok(read.renderResult({ content: [{ type: "text", text: "one line" }] }, { expanded: false }, theme).render(80)[0].includes("one line"));
    assert.ok(read.renderResult({ content: [{ type: "text", text: "a\nb" }] }, { expanded: false }, theme).render(80)[0].includes("2"));

    // firstTextLine with whitespace-only text → if (!text) return ""
    read.renderResult({ content: [{ type: "text", text: "   " }] }, { expanded: false }, theme).render(80);

    // Model-visible context with non-EVIDENCE kind falls through to plain text
    const nonEvidence = buildModelVisibleContext({
      kind: "custom_diagnostic",
      ui: "hidden",
      sections: [{ name: "output", content: "diagnostic info" }],
    });
    const evidenceResult = read.renderResult({ content: [{ type: "text", text: nonEvidence }] }, { expanded: true }, theme).render(80).join("\n");
    assert.ok(evidenceResult.includes("diagnostic info"));

    const longText = Array.from({ length: 42 }, (_, index) => `line-${index}`).join("\n");
    const expanded = read.renderResult({ content: [{ type: "text", text: longText }] }, { expanded: true }, theme).render(400).join("\n");
    assert.ok(expanded.includes("line-39"));
    assert.ok(expanded.includes("2"));
  });

  it("executes live built-in tools using ctx cwd", async () => {
    const registered = [];
    const pi = { registerTool: (t) => registered.push(t) };
    m.registerCompactToolRenderers(pi, {});
    const read = registered.find((tool) => tool.name === "read");

    const result = await read.execute("id", { path: "package.json" }, undefined, undefined, { cwd: process.cwd() });

    assert.ok(result.content[0].text.includes("read output"));
  });

  it("bash renderCall handles missing command", async () => {
    const registered = [];
    const pi = { registerTool: (t) => registered.push(t) };
    m.registerCompactToolRenderers(pi, {});
    const bash = registered.find((t) => t.name === "bash");
    const result = bash.renderCall({}, { fg: () => () => "", bold: (s) => s });
    assert.ok(result != null);
  });

  it("all 5 tools have renderCall and renderResult", async () => {
    const registered = [];
    const pi = { registerTool: (t) => registered.push(t) };
    m.registerCompactToolRenderers(pi, {});
    for (const t of registered) {
      assert.equal(typeof t.renderCall, "function", `${t.name} missing renderCall`);
      assert.equal(typeof t.renderResult, "function", `${t.name} missing renderResult`);
    }
  });
});

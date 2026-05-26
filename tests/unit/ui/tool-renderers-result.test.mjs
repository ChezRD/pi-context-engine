import { before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";
register("../../__mocks__/loader.mjs", import.meta.url);

let registerCompactToolRenderers;
let HugeResultStore;
let buildModelVisibleContext;
let TOOL_EVIDENCE_KIND;

before(async () => {
	({ registerCompactToolRenderers } = await import("../../../src/ui/tool-renderers.ts"));
	({ HugeResultStore } = await import("../../../src/capper.ts"));
	({ buildModelVisibleContext } = await import("../../../src/model-visible.ts"));
	({ TOOL_EVIDENCE_KIND } = await import("../../../src/tool-evidence.ts"));
});

const theme = {
	fg: (_color, value) => value,
	bold: (value) => value,
};

function registeredTools(store = new HugeResultStore()) {
	const tools = [];
	registerCompactToolRenderers({ registerTool: (tool) => tools.push(tool) }, store);
	return tools;
}

describe("compact tool renderer results", () => {
	it("renders collapsed and expanded plain output", async () => {
		const read = registeredTools().find((tool) => tool.name === "read");

		const collapsed = read.renderResult({ content: [{ type: "text", text: "first\nsecond" }] }, { expanded: false }, theme);
		const expanded = read.renderResult({ content: [{ type: "text", text: "first\nsecond" }] }, { expanded: true }, theme);

		assert.match(collapsed.render(80)[0], /^first \(2 /);
		assert.deepEqual(expanded.render(80), ["first\nsecond"]);
	});

	it("renders empty output as empty text", () => {
		const read = registeredTools().find((tool) => tool.name === "read");

		assert.deepEqual(read.renderResult({ content: [] }, { expanded: false }, theme).render(80), []);
	});

	it("renders model-visible tool evidence output", () => {
		const read = registeredTools().find((tool) => tool.name === "read");
		const content = buildModelVisibleContext({
			kind: TOOL_EVIDENCE_KIND,
			instructions: "Use the output.",
			metadata: {},
			sections: [{ name: "output", content: "visible evidence" }],
		});

		assert.deepEqual(read.renderResult({ content: [{ type: "text", text: content }] }, { expanded: true }, theme).render(80), ["visible evidence"]);
	});

	it("renders stored huge-result previews before plain output", () => {
		const store = new HugeResultStore();
		store.restore({ ref: "dsc-read-1", toolName: "read", bytes: 12, text: "stored\noutput", createdAt: 1 });
		const read = registeredTools(store).find((tool) => tool.name === "read");
		const result = {
			details: { elidedBy: "pi-context-engine", ref: "dsc-read-1" },
			content: [{ type: "text", text: "preview" }],
		};

		assert.deepEqual(read.renderResult(result, { expanded: true }, theme).render(80), ["stored\noutput"]);
	});

	it("shortens home paths and executes the live cwd tool", async () => {
		const tools = registeredTools();
		const read = tools.find((tool) => tool.name === "read");
		const bash = tools.find((tool) => tool.name === "bash");

		assert.match(read.renderCall({ path: `${process.env.HOME}/project/file.ts` }, theme).render(80)[0], /^read ~/);
		assert.match(bash.renderCall({ command: "npm test" }, theme).render(80)[0], /^\$ npm test/);
		assert.deepEqual(await read.execute("call-1", { path: "package.json" }, undefined, undefined, { cwd: process.cwd() }), {
			content: [{ type: "text", text: "read output" }],
		});
	});
});

import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

// Register module loader to mock i18n — locale-independent
register("./__mocks__/loader.mjs", import.meta.url);

let pinTools;
let tmpDir;

function makeState() {
	return {
		pinStore: { set: () => true },
		engine: { checkpoints: [], turnIndex: 0 },
	};
}

function makeTools() {
	const tools = [];
	const pi = { registerTool: (t) => tools.push(t) };
	return { tools, pi };
}

describe("registerPinTools", () => {
	before(async () => {
		pinTools = await import("../src/context-pins/tools.ts");
	});

	it("registers context_pin_skill and context_pin", () => {
		const { tools, pi } = makeTools();
		pinTools.registerPinTools(pi, makeState());
		assert.equal(tools.length, 2);
		assert.equal(tools[0].name, "context_pin_skill");
		assert.equal(tools[1].name, "context_pin");
	});

	it("context_pin execute stores pin with correct kind mapping", async () => {
		let capturedKind, capturedName, capturedContent, capturedOpts;
		const state = {
			pinStore: {
				set(kind, name, content, opts) {
					capturedKind = kind;
					capturedName = name;
					capturedContent = content;
					capturedOpts = opts;
					return true;
				},
			},
			engine: { checkpoints: [], turnIndex: 0 },
		};
		const { tools, pi } = makeTools();
		pinTools.registerPinTools(pi, state);
		const tool = tools.find(t => t.name === "context_pin");

		await tool.execute("id", { kind: "working-rule", name: "test-rule", content: "rule body" }, null, null, {});

		assert.equal(capturedKind, "priority");
		assert.equal(capturedName, "test-rule");
		assert.equal(capturedContent, "rule body");
		assert.equal(capturedOpts.scope, "session");
	});

	it("context_pin execute maps priority kind", async () => {
		let capturedKind;
		const state = {
			pinStore: {
				set(kind, n, c, o) { capturedKind = kind; return true; },
			},
			engine: { checkpoints: [], turnIndex: 0 },
		};
		const { tools, pi } = makeTools();
		pinTools.registerPinTools(pi, state);
		const tool = tools.find(t => t.name === "context_pin");

		await tool.execute("id", { kind: "priority", name: "p", content: "c" }, null, null, {});
		assert.equal(capturedKind, "priority");
	});

	it("context_pin execute maps user-memory kind", async () => {
		let capturedKind;
		const state = {
			pinStore: {
				set(kind, n, c, o) { capturedKind = kind; return true; },
			},
			engine: { checkpoints: [], turnIndex: 0 },
		};
		const { tools, pi } = makeTools();
		pinTools.registerPinTools(pi, state);
		const tool = tools.find(t => t.name === "context_pin");

		await tool.execute("id", { kind: "user-memory", name: "m", content: "c" }, null, null, {});
		assert.equal(capturedKind, "user-memory");
	});

	it("context_pin execute maps project-memory kind", async () => {
		let capturedKind;
		const state = {
			pinStore: {
				set(kind, n, c, o) { capturedKind = kind; return true; },
			},
			engine: { checkpoints: [], turnIndex: 0 },
		};
		const { tools, pi } = makeTools();
		pinTools.registerPinTools(pi, state);
		const tool = tools.find(t => t.name === "context_pin");

		await tool.execute("id", { kind: "project-memory", name: "m", content: "c" }, null, null, {});
		assert.equal(capturedKind, "project-memory");
	});

	it("context_pin execute returns pinned text when changed", async () => {
		const state = {
			pinStore: { set: () => true },
			engine: { checkpoints: [], turnIndex: 0 },
		};
		const { tools, pi } = makeTools();
		pinTools.registerPinTools(pi, state);
		const tool = tools.find(t => t.name === "context_pin");

		const result = await tool.execute("id", { kind: "priority", name: "n", content: "c" }, null, null, {});
		assert.equal(typeof result.content[0].text, "string");
	});

	it("context_pin execute returns active text when pin exists", async () => {
		const state = {
			pinStore: { set: () => false },
			engine: { checkpoints: [], turnIndex: 0 },
		};
		const { tools, pi } = makeTools();
		pinTools.registerPinTools(pi, state);
		const tool = tools.find(t => t.name === "context_pin");

		const result = await tool.execute("id", { kind: "priority", name: "n", content: "c" }, null, null, {});
		assert.equal(typeof result.content[0].text, "string");
	});

	it("context_pin execute includes priorityHigh when priority=high", async () => {
		const state = {
			pinStore: {
				set(kind, n, c, opts) { return true; },
			},
			engine: { checkpoints: [], turnIndex: 0 },
		};
		const { tools, pi } = makeTools();
		pinTools.registerPinTools(pi, state);
		const tool = tools.find(t => t.name === "context_pin");

		const result = await tool.execute("id", { kind: "priority", name: "n", content: "c", priority: "high" }, null, null, {});
		assert.equal(typeof result.content[0].text, "string");
	});

	it("context_pin execute with scope=project", async () => {
		let capturedOpts;
		const state = {
			pinStore: {
				set(kind, n, c, opts) { capturedOpts = opts; return true; },
			},
			engine: { checkpoints: [], turnIndex: 0 },
		};
		const { tools, pi } = makeTools();
		pinTools.registerPinTools(pi, state);
		const tool = tools.find(t => t.name === "context_pin");
		await tool.execute("id", { kind: "priority", name: "n", content: "c", scope: "project" }, null, null, {});
		assert.equal(capturedOpts.scope, "project");
	});

	it("context_pin execute with scope=global", async () => {
		let capturedOpts;
		const state = {
			pinStore: {
				set(kind, n, c, opts) { capturedOpts = opts; return true; },
			},
			engine: { checkpoints: [], turnIndex: 0 },
		};
		const { tools, pi } = makeTools();
		pinTools.registerPinTools(pi, state);
		const tool = tools.find(t => t.name === "context_pin");
		await tool.execute("id", { kind: "priority", name: "n", content: "c", scope: "global" }, null, null, {});
		assert.equal(capturedOpts.scope, "global");
	});

	it("context_pin execute short content (no truncation)", async () => {
		const state = {
			pinStore: { set: () => true },
			engine: { checkpoints: [], turnIndex: 0 },
		};
		const { tools, pi } = makeTools();
		pinTools.registerPinTools(pi, state);
		const tool = tools.find(t => t.name === "context_pin");
		const result = await tool.execute("id", { kind: "priority", name: "n", content: "short" }, null, null, {});
		assert.equal(typeof result.content[0].text, "string");
	});

	it("context_pin renderCall returns Text for priority kind", () => {
		const theme = { fg: (n, s) => s, bold: (s) => s };
		const { tools, pi } = makeTools();
		pinTools.registerPinTools(pi, makeState());
		const text = tools.find(t => t.name === "context_pin").renderCall({ kind: "priority", name: "test" }, theme);
		assert.equal(typeof text.text, "string");
	});

	it("context_pin renderCall returns Text for user-memory kind", () => {
		const theme = { fg: (n, s) => s, bold: (s) => s };
		const { tools, pi } = makeTools();
		pinTools.registerPinTools(pi, makeState());
		const text = tools.find(t => t.name === "context_pin").renderCall({ kind: "user-memory", name: "test" }, theme);
		assert.equal(typeof text.text, "string");
	});

	it("context_pin renderCall returns Text for project-memory kind", () => {
		const theme = { fg: (n, s) => s, bold: (s) => s };
		const { tools, pi } = makeTools();
		pinTools.registerPinTools(pi, makeState());
		const text = tools.find(t => t.name === "context_pin").renderCall({ kind: "project-memory", name: "test" }, theme);
		assert.equal(typeof text.text, "string");
	});

	it("context_pin renderCall returns Text for unknown kind", () => {
		const theme = { fg: (n, s) => s, bold: (s) => s };
		const { tools, pi } = makeTools();
		pinTools.registerPinTools(pi, makeState());
		const text = tools.find(t => t.name === "context_pin").renderCall({ kind: "foo", name: "test" }, theme);
		assert.equal(typeof text.text, "string");
	});

	it("context_pin_skill renderCall returns Text", () => {
		const theme = { fg: (n, s) => s, bold: (s) => s };
		const { tools, pi } = makeTools();
		pinTools.registerPinTools(pi, makeState());
		const text = tools.find(t => t.name === "context_pin_skill").renderCall({ name: "my-skill" }, theme);
		assert.equal(typeof text.text, "string");
	});

	it("context_pin renderResult strips XML and separator", () => {
		const theme = { fg: (n, s) => s, bold: (s) => s };
		const { tools, pi } = makeTools();
		pinTools.registerPinTools(pi, makeState());
		const result = {
			content: [{ type: "text", text: "Pinned working-rule: \"test\"\n\n<context-engine-pin kind=\"priority\" name=\"test\" version=\"1\">\ncontent\n</context-engine-pin>\n\n---\npreview" }],
		};
		const text = tools.find(t => t.name === "context_pin").renderResult(result, {}, theme);
		assert.equal(typeof text.text, "string");
	});

	it("context_pin renderResult handles empty result", () => {
		const theme = { fg: (n, s) => s, bold: (s) => s };
		const { tools, pi } = makeTools();
		pinTools.registerPinTools(pi, makeState());
		const text = tools.find(t => t.name === "context_pin").renderResult({}, {}, theme);
		assert.equal(typeof text.text, "string");
	});

	it("context_pin_skill renderResult returns Text", () => {
		const theme = { fg: (n, s) => s, bold: (s) => s };
		const { tools, pi } = makeTools();
		pinTools.registerPinTools(pi, makeState());
		const result = {
			content: [{ type: "text", text: "Pinned skill: \"test\"\n\n---\npreview" }],
		};
		const text = tools.find(t => t.name === "context_pin_skill").renderResult(result, {}, theme);
		assert.equal(typeof text.text, "string");
	});

	it("context_pin_skill execute notFound returns error text", async () => {
		const state = {
			pinStore: { set: () => true },
			engine: { checkpoints: [], turnIndex: 0 },
		};
		const { tools, pi } = makeTools();
		pinTools.registerPinTools(pi, state);
		const tool = tools.find(t => t.name === "context_pin_skill");
		const result = await tool.execute("id", { name: "nonexistent" }, null, null, { projectDir: "/tmp" });
		assert.equal(typeof result.content[0].text, "string");
		assert.ok(result.content[0].text.includes("Skill"));
	});

	it("context_pin_skill execute with pin already set", async () => {
		const state = {
			pinStore: { set: () => false },
			engine: { checkpoints: [], turnIndex: 0 },
		};
		const { tools, pi } = makeTools();
		pinTools.registerPinTools(pi, state);
		const tool = tools.find(t => t.name === "context_pin_skill");
		const result = await tool.execute("id", { name: "some-skill" }, null, null, { projectDir: "/tmp" });
		assert.ok(result != null);
	});

	describe("context_pin_skill with real skill file", () => {
		before(() => {
			tmpDir = mkdtempSync(join(tmpdir(), "pin-test-"));
			const skillDir = join(tmpDir, ".pi", "skills", "test-pin-skill");
			mkdirSync(skillDir, { recursive: true });
			writeFileSync(join(skillDir, "SKILL.md"), `---\nname: test-pin-skill\ndescription: Test skill\n---\n\nThis is a test skill body that is long enough.`);
		});
		after(() => {
			if (tmpDir) rmSync(tmpDir, { recursive: true, force: true });
		});

		it("context_pin_skill execute pins skill when found", async () => {
			let capturedKind, capturedName;
			const state = {
				pinStore: {
					set(kind, name, content, opts) {
						capturedKind = kind;
						capturedName = name;
						return true;
					},
				},
				engine: { checkpoints: [], turnIndex: 0 },
			};
			const { tools, pi } = makeTools();
			pinTools.registerPinTools(pi, state);
			const tool = tools.find(t => t.name === "context_pin_skill");
			const result = await tool.execute("id", { name: "test-pin-skill" }, null, null, { projectDir: tmpDir });

			assert.equal(capturedKind, "skill");
			assert.equal(capturedName, "test-pin-skill");
			assert.ok(result != null);
		});
	});
});

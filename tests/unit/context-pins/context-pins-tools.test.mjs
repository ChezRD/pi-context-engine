import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
register("./../../__mocks__/loader.mjs", import.meta.url);

const m = {};

describe("Context Pins Tools", () => {
	it("loads module and functions", async () => {
		m.registerPinTools = (await import("../../../src/context-pins/tools.ts")).registerPinTools;
		m.PinStore = (await import("../../../src/context-pins/store.ts")).PinStore;
		m.discoverSkills = (await import("../../../src/context-pins/skills.ts")).discoverSkills;
		m.findSkill = (await import("../../../src/context-pins/skills.ts")).findSkill;
		m.loadSkillAsPin = (await import("../../../src/context-pins/skills.ts")).loadSkillAsPin;
		m.applyLocale = (await import("../../../src/i18n/index.ts")).applyLocale;
		assert.ok(m.registerPinTools);
	});

	it("registers context_pin_skill and context_pin", () => {
		const tools = [];
		const pi = { registerTool: (t) => tools.push(t) };
		const state = { pinStore: new m.PinStore(), engine: { checkpoints: [] } };
		m.registerPinTools(pi, state);
		assert.equal(tools.length, 2);
		assert.equal(tools[0].name, "context_pin_skill");
		assert.equal(tools[1].name, "context_pin");
	});

	it("registerPinTools accept state with engine.checkpoints", () => {
		const tools = [];
		const pi = { registerTool: (t) => tools.push(t) };
		const state = {
			pinStore: new m.PinStore(),
			engine: { checkpoints: [] },
		};
		m.registerPinTools(pi, state);
		assert.equal(tools.length, 2);
	});

	it("context_pin_skill execute returns notFound for unknown skill", async () => {
		const tools = [];
		const pi = { registerTool: (t) => tools.push(t) };
		const state = { pinStore: new m.PinStore(), engine: { checkpoints: [] } };
		m.registerPinTools(pi, state);
		const result = await tools[0].execute("id", { name: "nonexistent-skill" }, null, null, { projectDir: "/tmp" });
		assert.ok(result.content[0].text);
	});

	it("context_pin_skill execute falls back to process.cwd() when ctx lacks projectDir", async () => {
		const tools = [];
		const pi = { registerTool: (t) => tools.push(t) };
		const state = { pinStore: new m.PinStore(), engine: { checkpoints: [] } };
		m.registerPinTools(pi, state);
		const result = await tools[0].execute("id", { name: "nonexistent-skill" }, null, null, {});
		assert.ok(result.content[0].text);
	});

	it("context_pin_skill pins found skill, truncates preview, and reports active on duplicate", async () => {
		const root = mkdtempSync(join(tmpdir(), "pin-tool-skill-"));
		try {
			mkdirSync(join(root, ".pi", "skills", "long-skill"), { recursive: true });
			writeFileSync(join(root, ".pi", "skills", "long-skill", "SKILL.md"), `---
name: long-skill
description: Long
---
${"x".repeat(650)}`);
			const tools = [];
			const pi = { registerTool: (t) => tools.push(t) };
			const state = { pinStore: new m.PinStore(), engine: { checkpoints: [], segments: [], turnIndex: 0 }, config: { checkpointStartsSegment: false }, detection: {} };
			m.registerPinTools(pi, state);

			const first = await tools[0].execute("id", { name: "long-skill" }, null, null, { projectDir: root });
			const second = await tools[0].execute("id", { name: "long-skill" }, null, null, { projectDir: root });

			assert.ok(first.content[0].text.includes("long-skill"));
			assert.ok(second.content[0].text.includes("long-skill"));
			assert.equal(state.engine.checkpoints.length, 1);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	it("context_pin execute adds pin to store", async () => {
		const tools = [];
		const pi = { registerTool: (t) => tools.push(t) };
		const store = new m.PinStore();
		const state = { pinStore: store, engine: { checkpoints: [] } };
		m.registerPinTools(pi, state);
		const result = await tools[1].execute("id", {
			kind: "priority",
			name: "test-rule",
			content: "always test before commit",
		}, null, null, {});
		assert.ok(result.content[0].text);
		// Pin should be in store now
		const pinned = store.get("priority", "test-rule", "session");
		assert.ok(pinned);
		assert.equal(pinned?.content, "always test before commit");
	});

	it("context_pin execute with duplicate pin returns active", async () => {
		const tools = [];
		const pi = { registerTool: (t) => tools.push(t) };
		const store = new m.PinStore();
		const state = { pinStore: store, engine: { checkpoints: [] } };
		m.registerPinTools(pi, state);
		await tools[1].execute("id", { kind: "priority", name: "test-rule", content: "always test" }, null, null, {});
		// Second call with same name should say "already active"
		const result2 = await tools[1].execute("id", { kind: "priority", name: "test-rule", content: "always test" }, null, null, {});
		assert.ok(result2.content[0].text);
	});

	it("context_pin maps all storage kinds, priority, scope, and long preview", async () => {
		const tools = [];
		const pi = { registerTool: (t) => tools.push(t) };
		const store = new m.PinStore();
		const state = { pinStore: store, engine: { checkpoints: [], segments: [], turnIndex: 0 }, config: { checkpointStartsSegment: false }, detection: {} };
		m.registerPinTools(pi, state);

		for (const [kind, expected] of [
			["user-memory", "user-memory"],
			["project-memory", "project-memory"],
			["working-rule", "priority"],
			["unknown-kind", "priority"],
		]) {
			const result = await tools[1].execute("id", {
				kind,
				name: `${kind}-pin`,
				content: "c".repeat(250),
				priority: "high",
				scope: "project",
			}, null, null, {});
			assert.ok(result.content[0].text.includes(`${kind}-pin`));
			assert.ok(store.get(expected, `${kind}-pin`, "project"));
		}
		assert.equal(state.engine.checkpoints.length, 4);
	});

	it("renderCall handles missing skill name", () => {
		const tools = [];
		const pi = { registerTool: (t) => tools.push(t) };
		const state = { pinStore: new m.PinStore(), engine: { checkpoints: [] } };
		m.registerPinTools(pi, state);
		const theme = { fg: (_c, s) => s, bold: (s) => s };
		const renderedCall = tools[0].renderCall({}, theme);
		assert.ok(renderedCall);
		assert.ok(renderedCall.render(80)[0].includes('""'));
	});

	it("context_pin renderCall handles missing kind and name", () => {
		const tools = [];
		const pi = { registerTool: (t) => tools.push(t) };
		const state = { pinStore: new m.PinStore(), engine: { checkpoints: [] } };
		m.registerPinTools(pi, state);
		const theme = { fg: (_c, s) => s, bold: (s) => s };
		const renderedCall = tools[1].renderCall({}, theme);
		assert.ok(renderedCall);
	});

	it("context_pin_skill has renderCall and renderResult", () => {
		const tools = [];
		const pi = { registerTool: (t) => tools.push(t) };
		const state = { pinStore: new m.PinStore(), engine: { checkpoints: [] } };
		m.registerPinTools(pi, state);
		assert.ok(tools[0].renderCall);
		assert.ok(tools[0].renderResult);
		const theme = { fg: (_c, s) => s, bold: (s) => s };
		const renderedCall = tools[0].renderCall({ name: "my-skill" }, theme);
		assert.ok(renderedCall);
		assert.deepEqual(tools[0].renderResult({ content: [] }, {}, theme).render(80), []);
		assert.ok(tools[0].renderResult({ content: [{ type: "text", text: "first\n---\nbody" }] }, {}, theme).render(80)[0].includes("first"));
	});

	it("context_pin has renderCall and renderResult", () => {
		const tools = [];
		const pi = { registerTool: (t) => tools.push(t) };
		const state = { pinStore: new m.PinStore(), engine: { checkpoints: [] } };
		m.registerPinTools(pi, state);
		const theme = { fg: (_c, s) => s, bold: (s) => s };
		const renderedCall = tools[1].renderCall({ kind: "priority", name: "test" }, theme);
		assert.ok(renderedCall);
		const renderedResult = tools[1].renderResult({ content: [{ type: "text", text: "✅ pinned\n---\nmetadata" }] }, {}, theme);
		assert.ok(renderedResult);
		for (const kind of ["user-memory", "project-memory", "working-rule", "other"]) {
			assert.ok(tools[1].renderCall({ kind, name: "test" }, theme).render(80)[0].includes("test"));
		}
		assert.deepEqual(tools[1].renderResult({ content: [] }, {}, theme).render(80), []);
		const xmlResult = tools[1].renderResult({ content: [{ type: "text", text: "Pinned\n<context-engine-pin kind=\"priority\">x</context-engine-pin>\n---\nmetadata" }] }, {}, theme);
		assert.ok(xmlResult.render(80)[0].includes("Pinned"));
	});
});

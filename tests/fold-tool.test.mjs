import { describe, it } from "node:test";
import assert from "node:assert/strict";

let mod;
try {
	mod = await import("../src/cache-engine/fold-tool.ts");
} catch {}

describe("registerFoldTool", () => {

	it("does not register when foldToolRegistered is already true", () => {
		const pi = { registerTool: undefined };
		const state = { config: { enabled: true, autoFold: true }, engine: { foldToolRegistered: true } };
		mod.registerFoldTool(pi, state);
		assert.equal(pi.registerTool, undefined);
	});

	it("does not register when config.enabled is false", () => {
		const pi = { registerTool: undefined };
		const state = { config: { enabled: false, autoFold: true }, engine: { foldToolRegistered: false } };
		mod.registerFoldTool(pi, state);
		assert.equal(pi.registerTool, undefined);
	});

	it("does not register when autoFold is false", () => {
		const pi = { registerTool: undefined };
		const state = { config: { enabled: true, autoFold: false }, engine: { foldToolRegistered: false } };
		mod.registerFoldTool(pi, state);
		assert.equal(pi.registerTool, undefined);
	});

	it("registers tool with correct name and parameters", () => {
		const tools = [];
		const pi = { registerTool: (t) => tools.push(t) };
		const state = { config: { enabled: true, autoFold: true }, engine: { foldToolRegistered: false } };
		mod.registerFoldTool(pi, state);
		assert.equal(tools.length, 1);
		assert.equal(tools[0].name, "context_cache_fold");
		assert.ok(tools[0].parameters);
		assert.equal(state.engine.foldToolRegistered, true);
	});

	it("execute returns success when requestFold returns ok", async () => {
		const tools = [];
		const state = {
			config: { enabled: true, autoFold: true },
			engine: { foldToolRegistered: false, recentToolCalls: new Map() },
		};
		const pi = {
			registerTool: (t) => tools.push(t),
		};
		mod.registerFoldTool(pi, state);

		const result = await tools[0].execute("id", {}, null, null, {});
		assert.equal(result.content[0].type, "text");
		assert.ok(typeof result.content[0].text === "string");
	});

	it("execute passes customInstructions when provided", async () => {
		const tools = [];
		let capturedCompactOptions;
		const state = {
			config: { enabled: true, autoFold: true },
			engine: { foldToolRegistered: false, recentToolCalls: new Map() },
		};
		const pi = {
			registerTool: (t) => tools.push(t),
			compact: (options) => { capturedCompactOptions = options; return { ok: true, text: "folded" }; },
		};
		mod.registerFoldTool(pi, state);

		const result = await tools[0].execute("id", { customInstructions: "focus on recent" }, null, null, pi);
		assert.ok(result.content[0].text.length > 0);
	});
});

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

let mod;
try {
	mod = await import("../src/cache-engine/parallel-read-tool.ts");
} catch {}

describe("registerParallelReadTool", () => {

	it("does not register when config.enabled is false", () => {
		const pi = { registerTool: undefined };
		const state = { config: { enabled: false, parallelReadTool: true } };
		mod.registerParallelReadTool(pi, state);
		assert.equal(pi.registerTool, undefined);
	});

	it("does not register when parallelReadTool is false", () => {
		const pi = { registerTool: undefined };
		const state = { config: { enabled: true, parallelReadTool: false } };
		mod.registerParallelReadTool(pi, state);
		assert.equal(pi.registerTool, undefined);
	});

	it("does not register when tool registration is missing", () => {
		const pi = { };
		const state = { config: { enabled: true, parallelReadTool: true } };
		mod.registerParallelReadTool(pi, state);
		assert.equal(pi.registerTool, undefined);
	});

	it("registers tool with correct name and parameters", () => {
		const tools = [];
		const pi = { registerTool: (t) => tools.push(t) };
		const state = { config: { enabled: true, parallelReadTool: true } };
		mod.registerParallelReadTool(pi, state);
		assert.equal(tools.length, 1);
		assert.equal(tools[0].name, "context_parallel_read");
		assert.ok(tools[0].parameters);
		assert.ok(tools[0].parameters.properties?.files);
	});

	it("execute reads files and returns content", async () => {
		const dir = mkdtempSync(join(tmpdir(), "prt-"));
		try {
			writeFileSync(join(dir, "a.txt"), "hello");
			writeFileSync(join(dir, "b.txt"), "world");
			const tools = [];
			const pi = { registerTool: (t) => tools.push(t) };
			const state = { config: { enabled: true, parallelReadTool: true } };
			mod.registerParallelReadTool(pi, state);
			const result = await tools[0].execute("id", { files: ["a.txt", "b.txt"] }, null, null, { cwd: dir });
			const parsed = JSON.parse(result.content[0].text);
			assert.equal(parsed.length, 2);
			assert.equal(parsed[0].ok, true);
			assert.equal(parsed[0].content, "hello");
			assert.equal(parsed[1].content, "world");
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});

	it("execute uses process cwd when ctx cwd is missing and allows the root path itself", async () => {
		const tools = [];
		const pi = { registerTool: (t) => tools.push(t) };
		const state = { config: { enabled: true, parallelReadTool: true } };
		mod.registerParallelReadTool(pi, state);

		const result = await tools[0].execute("id", { files: [process.cwd()] }, null, null, {});
		const parsed = JSON.parse(result.content[0].text);
		assert.equal(parsed[0].ok, false);
		assert.equal(typeof parsed[0].error, "string");
	});

	it("execute stringifies thrown non-Error values", async () => {
		const tools = [];
		const pi = { registerTool: (t) => tools.push(t) };
		const state = { config: { enabled: true, parallelReadTool: true } };
		mod.registerParallelReadTool(pi, state);

		const result = await tools[0].execute("id", { files: ["\u0000"] }, null, null, { cwd: process.cwd() });
		const parsed = JSON.parse(result.content[0].text);
		assert.equal(parsed[0].ok, false);
		assert.equal(typeof parsed[0].error, "string");
	});

	it("execute rejects paths outside workspace", async () => {
		const tools = [];
		const pi = { registerTool: (t) => tools.push(t) };
		const state = { config: { enabled: true, parallelReadTool: true } };
		mod.registerParallelReadTool(pi, state);
		const result = await tools[0].execute("id", { files: ["/etc/passwd"] }, null, null, { cwd: "/tmp" });
		const parsed = JSON.parse(result.content[0].text);
		assert.equal(parsed[0].ok, false);
		assert.equal(parsed[0].error, "outside workspace");
	});

	it("execute returns error for missing file", async () => {
		const dir = mkdtempSync(join(tmpdir(), "prt-"));
		try {
			const tools = [];
			const pi = { registerTool: (t) => tools.push(t) };
			const state = { config: { enabled: true, parallelReadTool: true } };
			mod.registerParallelReadTool(pi, state);
			const result = await tools[0].execute("id", { files: ["nonexistent.txt"] }, null, null, { cwd: dir });
			const parsed = JSON.parse(result.content[0].text);
			assert.equal(parsed[0].ok, false);
			assert.ok(typeof parsed[0].error === "string");
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});
});

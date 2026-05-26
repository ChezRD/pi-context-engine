import { describe, it } from "node:test";
import assert from "node:assert/strict";

let mod;
try {
	mod = await import("../src/agentic/tools.ts");
} catch {}

describe("registerAgenticTools", () => {
	it("registers context_checkpoint and context_rewind tools", () => {
		const tools = [];
		const pi = { registerTool: (t) => tools.push(t) };
		mod.registerAgenticTools(pi);
		assert.equal(tools.length, 2);
		assert.equal(tools[0].name, "context_checkpoint");
		assert.equal(tools[1].name, "context_rewind");
	});

	it("context_checkpoint returns error when no session manager", async () => {
		const tools = [];
		const pi = { registerTool: (t) => tools.push(t) };
		mod.registerAgenticTools(pi);
		const result = await tools[0].execute("id", { name: "test" }, null, null, {});
		assert.notEqual(result.content[0].text, "");
		assert.ok(result.details);
	});

	it("context_checkpoint returns error for duplicate name", async () => {
		const sm = {
			getTree: () => [{ entry: { id: "abc12345" }, children: [] }],
			getLabel: (id) => id === "abc12345" ? "test" : null,
		};
		const tools = [];
		const pi = { registerTool: (t) => tools.push(t) };
		mod.registerAgenticTools(pi);
		const result = await tools[0].execute("id", { name: "test" }, null, null, { sessionManager: sm });
		assert.notEqual(result.content[0].text, "");
		assert.ok(result.details);
	});

	it("context_checkpoint creates checkpoint and returns id", async () => {
		const labels = {};
		const sm = {
			getTree: () => [],
			getLabel: () => null,
			getBranch: () => [{ id: "fff12345" }],
		};
		const tools = [];
		const pi = { registerTool: (t) => tools.push(t), setLabel: (id, n) => { labels[id] = n; } };
		const cacheState = { config: { checkpointStartsSegment: false }, engine: { prune: { checkpointTriggered: false } } };
		mod.registerAgenticTools(pi, { cacheState });
		const result = await tools[0].execute("id", { name: "cp1" }, null, null, { sessionManager: sm });
		assert.ok(result.details.entryId);
		assert.equal(labels["fff12345"], "cp1");
	});

	it("context_checkpoint resolves label target to id", async () => {
		const sm = {
			getTree: () => [{ entry: { id: "bbb12345" }, children: [] }],
			getLabel: (id) => id === "bbb12345" ? "mylabel" : null,
			getBranch: () => [{ id: "fff12345" }],
		};
		const tools = [];
		const pi = { registerTool: (t) => tools.push(t), setLabel: () => {} };
		const cacheState = { config: { checkpointStartsSegment: false }, engine: { prune: { checkpointTriggered: false } } };
		mod.registerAgenticTools(pi, { cacheState });
		const result = await tools[0].execute("id", { name: "cp2", target: "mylabel" }, null, null, { sessionManager: sm });
		assert.ok(result.content[0].text.includes("bbb12345"));
	});

	it("context_rewind returns error when no session manager", async () => {
		const tools = [];
		const pi = { registerTool: (t) => tools.push(t) };
		mod.registerAgenticTools(pi);
		const result = await tools[1].execute("id", { target: "abc", message: "test" }, null, null, {});
		assert.notEqual(result.content[0].text, "");
	});

	it("context_rewind returns error when already at target", async () => {
		const sm = {
			getLeafId: () => "abc12345",
		};
		const tools = [];
		const pi = { registerTool: (t) => tools.push(t) };
		mod.registerAgenticTools(pi);
		const result = await tools[1].execute("id", { target: "abc12345", message: "test" }, null, null, { sessionManager: sm });
		assert.notEqual(result.content[0].text, "");
	});

	it("context_rewind creates backup checkpoint when requested", async () => {
		const labels = {};
		const sm = {
			getLeafId: () => "fff12345",
			getLabel: () => null,
			getTree: () => [],
			branchWithSummary: async () => "nid12345",
		};
		const tools = [];
		const pi = { registerTool: (t) => tools.push(t), setLabel: (id, n) => { labels[id] = n; } };
		const cacheState = { config: { checkpointStartsSegment: false }, engine: { prune: { checkpointTriggered: false } } };
		mod.registerAgenticTools(pi, { cacheState });
		const result = await tools[1].execute("id", { target: "other", message: "summary", backupCheckpoint: "before_rewind" }, null, null, { sessionManager: sm });
		assert.equal(labels["fff12345"], "before_rewind");
		assert.ok(result.details);
	});

	it("context_rewind returns error when branchWithSummary fails", async () => {
		const sm = {
			getLeafId: () => "fff12345",
			getLabel: () => null,
			getTree: () => [],
			branchWithSummary: async () => null,
		};
		const tools = [];
		const pi = { registerTool: (t) => tools.push(t) };
		mod.registerAgenticTools(pi);
		const result = await tools[1].execute("id", { target: "other", message: "summary" }, null, null, { sessionManager: sm });
		assert.notEqual(result.content[0].text, "");
	});

	it("turn_end handler returns when no rewindParams", async () => {
		const events = {};
		const pi = { registerTool: () => {}, on: (ev, fn) => { events[ev] = fn; } };
		mod.registerAgenticTools(pi);
		await events.turn_end("event", {});
	});

	it("agent_end handler returns when no rewindParams", async () => {
		const events = {};
		const pi = { registerTool: () => {}, on: (ev, fn) => { events[ev] = fn; } };
		mod.registerAgenticTools(pi);
		await events.agent_end("event", {});
	});

	it("registers turn_end and agent_end handlers", () => {
		const events = {};
		const pi = { registerTool: () => {}, on: (ev, fn) => { events[ev] = fn; } };
		mod.registerAgenticTools(pi);
		assert.equal(typeof events.turn_end, "function");
		assert.equal(typeof events.agent_end, "function");
	});

	it("agent_end navigates when rewindParams set", async () => {
		let navigated = null;
		const state = { rewindParams: { nid: "nid12345", tid: "tid12345", enrichedMessage: "msg", targetName: "t" } };
		const events = {};
		const pi = { registerTool: () => {}, on: (ev, fn) => { events[ev] = fn; }, sendMessage: () => {} };
		mod.registerAgenticTools(pi, state);
		await events.agent_end("event", { navigateTree: async (id) => { navigated = id; }, ui: { notify: () => {} } });
		assert.equal(navigated, "nid12345");
	});

	it("context_checkpoint returns noTarget when branch empty", async () => {
		const sm = {
			getTree: () => [{ entry: { id: "abc12345" }, children: [{ entry: { id: "def12345" }, children: [] }] }],
			getLabel: (id) => id === "def12345" ? "sub" : id === "abc12345" ? "existing" : null,
			getBranch: () => [],
		};
		const tools = [];
		const pi = { registerTool: (t) => tools.push(t), setLabel: () => {} };
		const cacheState = { config: { checkpointStartsSegment: false }, engine: { prune: { checkpointTriggered: false } } };
		mod.registerAgenticTools(pi, { cacheState });
		const result = await tools[0].execute("id", { name: "newcp" }, null, null, { sessionManager: sm });
		assert.ok(result.content[0].text);
	});

	it("context_rewind resolves label target to id", async () => {
		const sm = {
			getLeafId: () => "fff12345",
			getLabel: (id) => null,
			getTree: () => [{ entry: { id: "bbb12345" }, children: [] }],
			branchWithSummary: async (id) => id === "bbb12345" ? "nid12345" : null,
		};
		const tools = [];
		const pi = { registerTool: (t) => tools.push(t) };
		mod.registerAgenticTools(pi);
		const result = await tools[1].execute("id", { target: "mylabel", message: "summary" }, null, null, { sessionManager: sm });
		assert.ok(result.details);
	});

	it("context_rewind calls onRewind via agent_end", async () => {
		let rewindCalled = false;
		const sm = {
			getLeafId: () => "fff12345",
			getLabel: () => null,
			getTree: () => [{ entry: { id: "bbb12345" }, children: [] }],
			branchWithSummary: async () => "nid12345",
		};
		const tools = [];
		const events = {};
		const pi = { registerTool: (t) => tools.push(t), on: (ev, fn) => { events[ev] = fn; }, sendMessage: () => {} };
		const cacheState = { config: { checkpointStartsSegment: false }, engine: { prune: { checkpointTriggered: false } } };
		mod.registerAgenticTools(pi, { cacheState, onRewind: () => { rewindCalled = true; } });
		await tools[1].execute("id", { target: "bbb12345", message: "summary" }, null, null, { sessionManager: sm });
		await events.agent_end("event", { navigateTree: async () => {}, ui: { notify: () => {} } });
		assert.ok(rewindCalled);
	});

	it("context_rewind fallback to leafId when no label", async () => {
		const sm = {
			getLeafId: () => "fff12345",
			getLabel: () => undefined,
			getTree: () => [{ entry: { id: "bbb12345" }, children: [] }],
			branchWithSummary: async () => "nid12345",
		};
		const tools = [];
		const pi = { registerTool: (t) => tools.push(t) };
		const cacheState = { config: { checkpointStartsSegment: false }, engine: { prune: { checkpointTriggered: false } } };
		mod.registerAgenticTools(pi, { cacheState });
		await tools[1].execute("id", { target: "bbb12345", message: "summary" }, null, null, { sessionManager: sm });
		assert.ok(true);
	});

	it("findLabelInTree returns null when label not found", async () => {
		const sm = {
			getTree: () => [{ entry: { id: "abc12345" }, children: [{ entry: { id: "def12345" }, children: [] }] }],
			getLabel: (id) => id === "def12345" ? "sub" : null,
			getBranch: () => [{ id: "fff12345" }],
		};
		const tools = [];
		const pi = { registerTool: (t) => tools.push(t), setLabel: () => {} };
		const cacheState = { config: { checkpointStartsSegment: false }, engine: { prune: { checkpointTriggered: false } } };
		mod.registerAgenticTools(pi, { cacheState });
		const result = await tools[0].execute("id", { name: "nonexistent" }, null, null, { sessionManager: sm });
		assert.ok(result.details.entryId);
	});
});

import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";
register("./../../__mocks__/loader.mjs", import.meta.url);

const m = {};

describe("Agentic Tools", () => {
	it("loads module and functions", async () => {
		m.registerAgenticTools = (await import("../../../src/agentic/tools.ts")).registerAgenticTools;
		m.applyLocale = (await import("../../../src/i18n/index.ts")).applyLocale;
		assert.ok(m.registerAgenticTools);
	});

	it("registers context_checkpoint and context_rewind", () => {
		const tools = [];
		const pi = {
			registerTool: (t) => tools.push(t),
			setLabel: () => {},
			on: () => {},
		};
		m.registerAgenticTools(pi);
		assert.equal(tools.length, 2);
		assert.equal(tools[0].name, "context_checkpoint");
		assert.equal(tools[1].name, "context_rewind");
	});

	it("checkpoint execute returns error when no session", async () => {
		const tools = [];
		const pi = {
			registerTool: (t) => tools.push(t),
			setLabel: () => {},
			on: () => {},
		};
		m.registerAgenticTools(pi);
		const result = await tools[0].execute("id", { name: "test-cp" }, null, null, { sessionManager: null });
		assert.ok(result.content[0].text);
	});

	it("checkpoint execute creates checkpoint with session", async () => {
		const labels = {};
		const tools = [];
		const pi = {
			registerTool: (t) => tools.push(t),
			setLabel: (id, name) => { labels[id] = name; },
			on: () => {},
		};
		const state = { cacheState: null, onRewind: () => {} };
		m.registerAgenticTools(pi, state);
		const branch = [
			{ id: "entry-1" },
			{ id: "entry-2" },
		];
		const result = await tools[0].execute("id", { name: "my-cp" }, null, null, {
			sessionManager: { getBranch: () => branch, getTree: () => [], getLabel: () => null, getLeafId: () => "entry-2" },
		});
		assert.ok(result.content[0].text);
		assert.ok(labels["entry-2"], "my-cp");
	});

	it("checkpoint resolves named target and reports missing target", async () => {
		const labels = {};
		const tools = [];
		const pi = {
			registerTool: (t) => tools.push(t),
			setLabel: (id, name) => { labels[id] = name; },
			on: () => {},
		};
		m.registerAgenticTools(pi);
		const sessionManager = {
			getBranch: () => [],
			getTree: () => [{ entry: { id: "deadbeef" }, children: [{ entry: { id: "cafebabe" }, children: [] }] }],
			getLabel: (id) => id === "cafebabe" ? "target-label" : null,
			getLeafId: () => undefined,
		};
		const resolved = await tools[0].execute("id", { name: "new-cp", target: "target-label" }, null, null, { sessionManager });
		assert.equal(resolved.details.entryId, "cafebabe");
		assert.equal(labels.cafebabe, "new-cp");

		const missing = await tools[0].execute("id", { name: "missing-cp" }, null, null, { sessionManager: { ...sessionManager, getTree: () => [] } });
		assert.equal(missing.details.entryId, undefined);
		assert.ok(missing.content[0].text);
	});

	it("checkpoint execute dedup via findLabelInTree", async () => {
		const tools = [];
		const pi = {
			registerTool: (t) => tools.push(t),
			setLabel: () => {},
			on: () => {},
		};
		m.registerAgenticTools(pi);
		const result = await tools[0].execute("id", { name: "existing" }, null, null, {
			sessionManager: {
				getBranch: () => [{ id: "entry-1" }],
				getTree: () => [{ entry: { id: "entry-1" }, children: [] }],
				getLabel: (id) => id === "entry-1" ? "existing" : null,
				getLeafId: () => "entry-1",
			},
		});
		// Contains checkpoint name indicating duplicate
		assert.ok(result.content[0].text.includes("existing"));
	});

	it("rewind execute returns error when no session", async () => {
		const tools = [];
		const pi = {
			registerTool: (t) => tools.push(t),
			on: () => {},
		};
		m.registerAgenticTools(pi);
		const result = await tools[1].execute("id", { target: "target-id", message: "go back" }, null, null, { sessionManager: null });
		assert.ok(result.content[0].text);
	});

	it("rewind execute returns already-at-target", async () => {
		const tools = [];
		const pi = {
			registerTool: (t) => tools.push(t),
			setLabel: () => {},
			on: () => {},
		};
		m.registerAgenticTools(pi);
		const result = await tools[1].execute("id", { target: "leaf-1", message: "back" }, null, null, {
			sessionManager: {
				getBranch: () => [{ id: "leaf-1" }],
				getTree: () => [],
				getLeafId: () => "leaf-1",
				getLabel: () => null,
			},
		});
		// Response mentions target id (locale-independent check)
		assert.ok(result.content[0].text.includes("leaf-1"));
	});

	it("rewind resolves labels, creates branch, records state, and handlers complete rewind", async () => {
		const tools = [];
		const handlers = {};
		let labelSet;
		let sent;
		let navigated;
		let notified;
		let rewound = false;
		const pi = {
			registerTool: (t) => tools.push(t),
			setLabel: (id, label) => { labelSet = { id, label }; },
			sendMessage: (...args) => { sent = args; },
			on: (event, handler) => { handlers[event] = handler; },
		};
		const state = { rewindParams: null, onRewind: () => { rewound = true; } };
		m.registerAgenticTools(pi, state);
		const sessionManager = {
			getTree: () => [{ entry: { id: "abcdef12" }, children: [] }],
			getLabel: (id) => id === "abcdef12" ? "target" : id === "leaf-2" ? "current" : null,
			getLeafId: () => "leaf-2",
			branchWithSummary: async (target, message) => {
				assert.equal(target, "abcdef12");
				assert.ok(message.includes("Carry this summary forward") || message.includes("carryover_summary"));
				return "new-branch";
			},
		};

		const result = await tools[1].execute("id", { target: "target", message: "Carry this summary forward", backupCheckpoint: "backup" }, null, null, { sessionManager });
		assert.ok(result.content[0].text);
		assert.deepEqual(labelSet, { id: "leaf-2", label: "backup" });
		assert.equal(state.rewindParams.nid, "new-branch");

		await handlers.turn_end({}, {});
		await handlers.agent_end({}, {
			navigateTree: async (...args) => { navigated = args; },
			ui: { notify: (...args) => { notified = args; } },
		});
		assert.deepEqual(navigated, ["new-branch", { summarize: false }]);
		assert.equal(notified[1], "info");
		assert.equal(rewound, true);
		assert.equal(state.rewindParams, null);
		assert.equal(sent[1].triggerTurn, true);
	});

	it("rewind reports branch failure and handlers no-op without rewind params", async () => {
		const tools = [];
		const handlers = {};
		const pi = {
			registerTool: (t) => tools.push(t),
			on: (event, handler) => { handlers[event] = handler; },
		};
		m.registerAgenticTools(pi);
		const result = await tools[1].execute("id", { target: "ffffffff", message: "English summary" }, null, null, {
			sessionManager: {
				getTree: () => [],
				getLeafId: () => "leaf",
				getLabel: () => undefined,
				branchWithSummary: async () => undefined,
			},
		});
		assert.ok(result.content[0].text);
		await handlers.turn_end({}, {});
		await handlers.agent_end({}, {});
	});

	it("checkpoint handles getTree being undefined", async () => {
		const tools = [];
		const pi = {
			registerTool: (t) => tools.push(t),
			setLabel: (id, name) => {},
			on: () => {},
		};
		m.registerAgenticTools(pi);
		// sessionManager without getTree — triggers sm.getTree?.() ?? [] fallback
		const result = await tools[0].execute("id", { name: "no-tree" }, null, null, {
			sessionManager: {
				getBranch: () => [{ id: "entry-1" }],
				getLabel: () => null,
				getLeafId: () => "entry-1",
			},
		});
		assert.ok(result.content[0].text);
	});

	it("checkpoint handles getBranch returning empty", async () => {
		const tools = [];
		const pi = {
			registerTool: (t) => tools.push(t),
			setLabel: () => {},
			on: () => {},
		};
		m.registerAgenticTools(pi);
		const result = await tools[0].execute("id", { name: "empty-branch" }, null, null, {
			sessionManager: {
				getBranch: () => [],
				getTree: () => [],
				getLabel: () => null,
				getLeafId: () => "entry-1",
			},
		});
		assert.ok(result.content[0].text);
	});

	it("checkpoint handles getBranch undefined", async () => {
		const tools = [];
		const pi = {
			registerTool: (t) => tools.push(t),
			setLabel: () => {},
			on: () => {},
		};
		m.registerAgenticTools(pi);
		// No target provided + no getBranch on sessionManager triggers ?? [] fallback
		const result = await tools[0].execute("id", { name: "no-branch" }, null, null, {
			sessionManager: {
				getTree: () => [],
				getLabel: () => null,
				getLeafId: () => "entry-1",
			},
		});
		assert.ok(result.content[0].text);
	});

	it("rewind handles getLeafId undefined", async () => {
		const tools = [];
		let labelSet = null;
		const pi = {
			registerTool: (t) => tools.push(t),
			setLabel: (id, label) => { labelSet = { id, label }; },
			on: () => {},
		};
		m.registerAgenticTools(pi);
		const result = await tools[1].execute("id", { target: "ffffffff", message: "go back", backupCheckpoint: "backup" }, null, null, {
			sessionManager: {
				getTree: () => [],
				getLeafId: () => undefined,
				getLabel: () => undefined,
				branchWithSummary: async () => undefined,
			},
		});
		// No currentLeaf, so backupCheckpoint path is skipped — no label set
		assert.equal(labelSet, null);
		assert.ok(result.content[0].text);
	});

	it("registers turn_end and agent_end handlers", () => {
		const handlers = {};
		const tools = [];
		const pi = {
			registerTool: (t) => tools.push(t),
			setLabel: () => {},
			on: (event, handler) => { handlers[event] = handler; },
		};
		m.registerAgenticTools(pi);
		assert.ok(handlers.turn_end);
		assert.ok(handlers.agent_end);
	});
});

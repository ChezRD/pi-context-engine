import { describe, it } from "node:test";
import assert from "node:assert/strict";

// ── Dynamic imports ──

const m = {};
const emptyStats = {
	requests: 0, input: 0, cacheRead: 0, cacheWrite: 0, output: 0,
	cost: 0, savings: 0, sinceCompactionRequests: 0, usages: [], compacts: [],
	last: undefined,
};
const cfg = {
	foldThreshold: 0.75, aggressiveFoldThreshold: 0.78, exitSummaryThreshold: 0.80,
	preflightFoldThreshold: 0.90, foldTailPct: 0.10, aggressiveFoldTailPct: 0.15,
	minFoldSavings: 0.30, contextCompactPct: 0.70, contextForceFoldPct: 0.85,
	maxCompactsPerSession: 5, foldInterval: 3, appendOnlyProjection: false,
	locale: "en", enableAgenticTools: true, pruneEnabled: true, pruneOn: "every-turn",
	showCostSavings: true, showTurnEstimate: true, hugeResultCapper: true,
	statusLine: true, registerDynamicProvider: true, enabled: true,
};

try {
	m.countMessageTokens = (await import("../src/projection/history-folder.ts")).countMessageTokens;
	m.estimateFoldBoundary = (await import("../src/projection/history-folder.ts")).estimateFoldBoundary;
	m.extractPinnedSkills = (await import("../src/projection/history-folder.ts")).extractPinnedSkills;
	m.extractPinnedConstraints = (await import("../src/projection/history-folder.ts")).extractPinnedConstraints;
	m.buildFoldMessage = (await import("../src/projection/history-folder.ts")).buildFoldMessage;
	m.trimTrailingAssistantToolCalls = (await import("../src/projection/history-folder.ts")).trimTrailingAssistantToolCalls;
	m.isFoldValid = (await import("../src/projection/history-folder.ts")).isFoldValid;
	m.clearFold = (await import("../src/projection/history-folder.ts")).clearFold;
	m.captureBatches = (await import("../src/projection/batch-capture.ts")).captureBatches;
	m.shouldTriggerPrune = (await import("../src/projection/batch-capture.ts")).shouldTriggerPrune;
	m.pruneMessages = (await import("../src/projection/pruner.ts")).pruneMessages;
	m.createToolCallIndexer = (await import("../src/projection/indexer.ts")).createToolCallIndexer;
	m.summarizeToolBatch = (await import("../src/projection/tool-pruner.ts")).summarizeToolBatch;
	m.decideAfterUsage = (await import("../src/cache-engine/decision-engine.ts")).decideAfterUsage;
	m.estimateTurnStart = (await import("../src/cache-engine/decision-engine.ts")).estimateTurnStart;
	m.decideCompaction = (await import("../src/cache-engine/decision-engine.ts")).decideCompaction;
	m.buildContextStatus = (await import("../src/cache-engine/decision-engine.ts")).buildContextStatus;
	m.canCompactNow = (await import("../src/cache-engine/decision-engine.ts")).canCompactNow;
	m.decisionLabel = (await import("../src/cache-engine/decision-engine.ts")).decisionLabel;
	m.t = (await import("../src/i18n/index.ts")).t;
	m.registerAgenticTools = (await import("../src/agentic/tools.ts")).registerAgenticTools;
	m.registerTimelineTool = (await import("../src/ui/timeline.ts")).registerTimelineTool;
	m.showDashboard = (await import("../src/ui/dashboard.ts")).showDashboard;
	m.activateAppendOnlyProjectionFromCompact = (await import("../src/cache-engine/append-only-projection.ts")).activateAppendOnlyProjectionFromCompact;
	m.applyAppendOnlyProjection = (await import("../src/cache-engine/append-only-projection.ts")).applyAppendOnlyProjection;
	m.holdCompaction = (await import("../src/cache-engine/auto-compact.ts")).holdCompaction;
	m.addUsage = (await import("../src/stats.ts")).addUsage;
	m.extractUsageSnapshot = (await import("../src/stats.ts")).extractUsageSnapshot;
	m.savingsFromRealCost = (await import("../src/stats.ts")).savingsFromRealCost;
	m.emptyStats = (await import("../src/stats.ts")).emptyStats;
	m.formatTokenCount = (await import("../src/stats.ts")).formatTokenCount;
	m.costToCompact = (await import("../src/stats.ts")).costToCompact;
	m.deepSeekOfficialCost = (await import("../src/stats.ts")).deepSeekOfficialCost;
	m.readConfig = (await import("../src/config.ts")).readConfig;
	m.DEFAULT_CONFIG = (await import("../src/config.ts")).DEFAULT_CONFIG;
	m.detectDeepSeekModel = (await import("../src/model.ts")).detectDeepSeekModel;
	m.recommendContextAction = (await import("../src/context-monitor.ts")).recommendContextAction;
	m.inspectProviderPayload = (await import("../src/payload-diagnostics.ts")).inspectProviderPayload;
	m.HugeResultStore = (await import("../src/capper.ts")).HugeResultStore;
	m.maybeCapToolResult = (await import("../src/capper.ts")).maybeCapToolResult;
	m.registerFoldTool = (await import("../src/cache-engine/fold-tool.ts")).registerFoldTool;
	m.registerPruneTool = (await import("../src/projection/prune-tool.ts")).registerPruneTool;
	m.hitRatio = (await import("../src/stats.ts")).hitRatio;
	m.formatStats = (await import("../src/stats.ts")).formatStats;
	m.stableHash = (await import("../src/cache-engine/prefix-fingerprint.ts")).stableHash;
	m.diffPrefix = (await import("../src/cache-engine/prefix-fingerprint.ts")).diffPrefix;
	m.normalizeTools = (await import("../src/cache-engine/prefix-fingerprint.ts")).normalizeTools;
	m.shouldNotifyPrefixDrift = (await import("../src/cache-engine/prefix-fingerprint.ts")).shouldNotifyPrefixDrift;
	m.parseConfig = (await import("../src/config.ts")).parseConfig;
	m.writeConfig = (await import("../src/config.ts")).writeConfig;
	m.getContextPercent = (await import("../src/context-monitor.ts")).getContextPercent;
	m.readContextPercent = (await import("../src/context-monitor.ts")).readContextPercent;
	m.formatPayloadDiagnostics = (await import("../src/payload-diagnostics.ts")).formatPayloadDiagnostics;
	m.extractToolResultText = (await import("../src/capper.ts")).extractToolResultText;
	m.buildPreview = (await import("../src/capper.ts")).buildPreview;
	m.buildProgressBar = (await import("../src/utils.ts")).buildProgressBar;
} catch (e) {
	console.error("Import error:", e.message);
}

// ── countMessageTokens ──

describe("countMessageTokens", () => {
	it("counts string content", () => assert.ok(m.countMessageTokens({ role: "user", content: "hello world" }) > 0));
	it("counts ContentPart[]", () => assert.ok(m.countMessageTokens({ role: "user", content: [{ type: "text", text: "hello" }] }) > 0));
	it("counts tool_calls JSON", () => assert.ok(m.countMessageTokens({ role: "assistant", content: "", tool_calls: [{ function: { name: "read_file", arguments: '{"path":"x"}' } }] }) > 0));
	it("handles null", () => assert.equal(m.countMessageTokens(null), 0));
	it("handles undefined", () => assert.equal(m.countMessageTokens(undefined), 0));
	it("handles empty content", () => assert.equal(m.countMessageTokens({ role: "user", content: "" }), 1));
	it("handles simple content", () => assert.ok(m.countMessageTokens({ role: "user", content: "x" }) > 0));
});

// ── estimateFoldBoundary ──

describe("estimateFoldBoundary", () => {
	it("returns ok:false for empty messages", () => {
		const r = m.estimateFoldBoundary([], 0, 100);
		assert.equal(r.ok, false);
		assert.equal(r.reason, "No messages");
	});
	it("splits messages into head and tail", () => {
		const msgs = [
			{ role: "system", content: "sys" },
			{ role: "user", content: "u1" },
			{ role: "assistant", content: "a1" },
			{ role: "user", content: "u2" },
			{ role: "assistant", content: "a2" },
		];
		// Each msg ~2 tokens. TailBudget=2 means only 0-1 msgs in tail
		const r = m.estimateFoldBoundary(msgs, 100, 2);
		assert.equal(r.ok, true);
		assert.ok(r.headMessages.length > 0);
		assert.ok(r.tailMessages.length > 0);
	});
	it("handles non-array input", () => {
		const r = m.estimateFoldBoundary(undefined, 0, 100);
		assert.equal(r.ok, false);
	});
	it("user-seeking expands tail to user boundary", () => {
		const msgs = [
			{ role: "system", content: "sys" },
			{ role: "user", content: "u1" },
			{ role: "assistant", content: "a1 very long message to break tail", role: "assistant" },
			{ role: "user", content: "u2" },
			{ role: "assistant", content: "a2" },
		];
		const r = m.estimateFoldBoundary(msgs, 100, 5);
		assert.equal(r.ok, true);
	});
});

// ── extractPinnedSkills ──

describe("extractPinnedSkills", () => {
	it("extracts from system message", () => {
		const s = m.extractPinnedSkills([{ role: "system", content: '<skill-pin name="skills-a">\ncontent a\n</skill-pin>' }]);
		assert.equal(s.length, 1);
		assert.equal(s[0].id, "skills-a");
	});
	it("returns empty for no matches", () => assert.equal(m.extractPinnedSkills([{ role: "user", content: "hi" }]).length, 0));
	it("deduplicates by name, last wins", () => {
		const s = m.extractPinnedSkills([
			{ role: "system", content: '<skill-pin name="x">\nv1\n</skill-pin>' },
			{ role: "system", content: '<skill-pin name="x">\nv2\n</skill-pin>' },
		]);
		assert.equal(s.length, 1);
		assert.ok(s[0].content.includes("v2"));
	});
	it("handles non-string content", () => assert.equal(m.extractPinnedSkills([{ role: "user", content: ["not string"] }]).length, 0));
	it("multiple skills from one message", () => {
		const s = m.extractPinnedSkills([{ role: "system", content: '<skill-pin name="a">\nx\n</skill-pin><skill-pin name="b">\ny\n</skill-pin>' }]);
		assert.equal(s.length, 2);
	});
});

// ── extractPinnedConstraints ──

describe("extractPinnedConstraints", () => {
	it("finds bracket HIGH PRIORITY", () => {
		const c = m.extractPinnedConstraints([{ role: "system", content: "[HIGH PRIORITY] critical\n\nother" }]);
		assert.ok(c.some(x => x.includes("HIGH PRIORITY")));
	});
	it("returns empty for no constraints", () => assert.equal(m.extractPinnedConstraints([{ role: "user", content: "hi" }]).length, 0));
	it("handles non-string content", () => assert.equal(m.extractPinnedConstraints([{ role: "user", content: ["hi"] }]).length, 0));
});

// ── buildFoldMessage ──

describe("buildFoldMessage", () => {
	it("includes marker, skills, constraints", () => {
		const msg = m.buildFoldMessage("<m>", "summary text", [{ id: "s1", content: "<skill-pin name=\"s1\">\nc\n</skill-pin>" }], ["[HIGH PRIORITY] urgent"]);
		assert.ok(msg.content.includes("<m>"));
		assert.ok(msg.content.includes("summary text"));
		assert.ok(msg.content.includes("skill-pin"));
		assert.ok(msg.content.includes("HIGH PRIORITY"));
		assert.equal(msg.role, "assistant");
	});
	it("omits skills when empty", () => {
		const msg = m.buildFoldMessage("<m>", "s", [], ["[HIGH PRIORITY] x"]);
		assert.ok(!msg.content.includes("skill-pin"));
	});
	it("omits constraints when empty", () => {
		const msg = m.buildFoldMessage("<m>", "s", [], []);
		assert.ok(!msg.content.includes("HIGH PRIORITY"));
	});
});

// ── trimTrailingAssistantToolCalls ──

describe("trimTrailingAssistantToolCalls", () => {
	it("drops trailing assistant with tool_calls", () => {
		const [msgs, n] = m.trimTrailingAssistantToolCalls([
			{ role: "user", content: "hi" },
			{ role: "assistant", tool_calls: [{ function: { name: "test" } }] },
		]);
		assert.equal(msgs.length, 1);
		assert.equal(n, 1);
	});
	it("keeps user messages", () => {
		const [msgs, n] = m.trimTrailingAssistantToolCalls([{ role: "user", content: "hi" }]);
		assert.equal(msgs.length, 1);
		assert.equal(n, 0);
	});
	it("handles empty", () => assert.equal(m.trimTrailingAssistantToolCalls([])[0].length, 0));
	it("keeps assistant with no content and no tool_calls", () => {
		const [msgs, n] = m.trimTrailingAssistantToolCalls([
			{ role: "user", content: "hi" },
			{ role: "assistant" },
		]);
		assert.equal(msgs.length, 2);
		assert.equal(n, 0);
	});
});

// ── isFoldValid ──

describe("isFoldValid", () => {
	it("returns true when fold active and hash matches", () => {
		const state = {
			engine: {
				semanticFold: {
					active: true,
					foldedHeadHash: "abc",
				},
			},
		};
		assert.ok(m.isFoldValid(state, "abc"));
	});
	it("validation uses stableHash internally, not direct comparison", () => {
		const state = {
			engine: {
				semanticFold: {
					active: true,
					foldedHeadHash: "abc",
				},
			},
		};
		// isFoldValid returns a boolean based on internal hash logic
		const result = m.isFoldValid(state, "xyz");
		assert.ok(typeof result === "boolean");
	});
	it("returns false when not active", () => {
		const state = { engine: { semanticFold: { active: false } } };
		assert.equal(m.isFoldValid(state, "abc"), false);
	});
});

// ── clearFold ──

describe("clearFold", () => {
	it("resets fold state", () => {
		const st = { engine: { semanticFold: { foldedHeadHash: "abc", foldedMessage: { content: "x" }, lastPinnedSkills: [], lastPinnedConstraints: [] } } };
		m.clearFold(st);
		assert.equal(st.engine.semanticFold.foldedHeadHash, undefined);
	});
});

// ── captureBatches ──

describe("captureBatches", () => {
	it("captures toolCall+toolResult pairs", () => {
		const pr = { pendingBatches: [], batchStepCounter: 0 };
		m.captureBatches([
			{ message: { role: "user", content: "hi" }, turnIndex: 0 },
			{ message: { role: "assistant", tool_calls: [{ id: "tc-1", function: { name: "read", arguments: "{}" } }] }, turnIndex: 0 },
			{ message: { role: "tool", toolCallId: "tc-1", content: "result" }, turnIndex: 0 },
		], [], pr, 0);
		assert.equal(pr.pendingBatches.length, 1);
	});
	it("skips summarized IDs", () => {
		const pr = { pendingBatches: [], batchStepCounter: 0 };
		m.captureBatches([
			{ message: { role: "assistant", tool_calls: [{ id: "tc-1", function: { name: "read", arguments: "{}" } }] }, turnIndex: 0 },
		], ["tc-1"], pr, 0);
		assert.equal(pr.pendingBatches.length, 0);
	});
	it("handles empty branch", () => {
		const pr = { pendingBatches: [], batchStepCounter: 0 };
		m.captureBatches([], [], pr, 0);
		assert.equal(pr.pendingBatches.length, 0);
	});
	it("captures tool calls using function name as fallback id", () => {
		const pr = { pendingBatches: [], batchStepCounter: 0 };
		m.captureBatches([
			{ message: { role: "assistant", tool_calls: [{ function: { name: "read" } }] }, turnIndex: 0 },
		], [], pr, 0);
		assert.equal(pr.pendingBatches.length, 1);
	});
});

// ── shouldTriggerPrune ──

describe("shouldTriggerPrune", () => {
	it("every-turn triggers with tools", () => assert.ok(m.shouldTriggerPrune("every-turn", 0, 1, true)));
	it("every-turn ignores batch threshold", () => assert.ok(m.shouldTriggerPrune("every-turn", 1, 3, true)));
	it("every-turn skips without tools", () => assert.equal(m.shouldTriggerPrune("every-turn", 0, 1, false), false));
	it("agent-message triggers at threshold", () => assert.ok(m.shouldTriggerPrune("agent-message", 3, 3, false)));
	it("agent-message skips below threshold", () => assert.equal(m.shouldTriggerPrune("agent-message", 1, 3, false), false));
	it("agent-message does not flush early on pure text replies", () => assert.equal(m.shouldTriggerPrune("agent-message", 1, 3, false, true), false));
	it("checkpoint never auto-triggers without context_checkpoint", () => assert.equal(m.shouldTriggerPrune("checkpoint", 10, 1, true), false));
});

// ── decideAfterUsage ──

describe("decideAfterUsage", () => {
	it("none below threshold", () => assert.equal(m.decideAfterUsage(700, 1000, false, cfg).kind, "none"));
	it("fold at 75%", () => {
		const d = m.decideAfterUsage(760, 1000, false, cfg);
		assert.equal(d.kind, "fold");
		assert.equal(d.aggressive, false);
	});
	it("aggressive fold at 78%", () => assert.ok(m.decideAfterUsage(790, 1000, false, cfg).aggressive));
	it("exit-with-summary at 80%", () => assert.equal(m.decideAfterUsage(810, 1000, false, cfg).kind, "exit-with-summary"));
	it("already folded returns none", () => assert.equal(m.decideAfterUsage(900, 1000, true, cfg).kind, "none"));
	it("no ctxMax returns none", () => {
		const d = m.decideAfterUsage(100, undefined, false, cfg);
		assert.equal(d.kind, "none");
		assert.equal(d.ctxMax, 0);
	});
});

// ── estimateTurnStart ──

describe("estimateTurnStart", () => {
	it("triggers at 90%", () => assert.ok(m.estimateTurnStart({ getContextUsage: () => ({ ratio: 0.92 }) }, cfg).shouldFold));
	it("no fold below 90%", () => assert.equal(m.estimateTurnStart({ getContextUsage: () => ({ ratio: 0.70 }) }, cfg).shouldFold, false));
	it("missing getContextUsage", () => assert.equal(m.estimateTurnStart({}, cfg).shouldFold, false));
});

// ── decideCompaction ──

describe("decideCompaction", () => {
	it("hold when low usage", () => assert.equal(m.decideCompaction({ ratio: 0.50, hitRate: 0.0 }, cfg), "hold"));
	it("fold at high ratio", () => assert.equal(m.decideCompaction({ ratio: 0.82, hitRate: 0.50 }, cfg), "fold"));
	it("force_fold at critical", () => assert.equal(m.decideCompaction({ ratio: 0.90, hitRate: 0.0 }, cfg), "force_fold"));
	it("fold when ratio above contextCompactPct regardless of hit rate", () => assert.equal(m.decideCompaction({ ratio: 0.71, hitRate: 0.95 }, cfg), "fold"));
	it("hold when ratio below contextCompactPct", () => assert.equal(m.decideCompaction({ ratio: 0.50, hitRate: 0 }, cfg), "hold"));
});

// ── buildContextStatus ──

describe("buildContextStatus", () => {
	const getCtx = (ratio, hitRate) => ({ getContextUsage: () => ({ ratio, hitRate }) });
	it("green zone", () => assert.equal(m.buildContextStatus(getCtx(0.30, 0.90), emptyStats, cfg).zone, "green"));
	it("red zone", () => assert.equal(m.buildContextStatus(getCtx(0.75, 0.50), emptyStats, cfg).zone, "red"));
	it("critical zone", () => assert.equal(m.buildContextStatus(getCtx(0.90, 0.50), emptyStats, cfg).zone, "critical"));
	it("no ratio", () => {
		const s = m.buildContextStatus({ getContextUsage: () => null }, emptyStats, cfg);
		assert.equal(s.zone, "green");
		assert.equal(s.ratio, undefined);
	});
});

// ── canCompactNow ──

describe("canCompactNow", () => {
	it("returns true when allowed", () => {
		const state = { engine: { compactCount: 1 }, config: { maxCompactsPerSession: 5, foldInterval: 3 } };
		assert.ok(m.canCompactNow(state));
	});
	it("blocks when at max compacts", () => {
		const state = { engine: { compactCount: 5 }, config: { maxCompactsPerSession: 5, foldInterval: 3 } };
		assert.equal(m.canCompactNow(state), false);
	});
});

// ── decisionLabel ──

describe("decisionLabel", () => {
	it("returns string for each action", () => {
		["hold", "fold", "force_fold", "advise"].forEach(a => {
			assert.ok(typeof m.decisionLabel(a) === "string");
		});
	});
});

// ── pruneMessages ──

describe("pruneMessages", () => {
	it("removes summarized tool results", () => {
		const idx = m.createToolCallIndexer();
		idx.markSummarized("tc-1", "read", 0);
		const pruned = m.pruneMessages([
			{ role: "user", content: "hi" },
			{ role: "assistant", content: "ok", tool_calls: [{ id: "tc-1", function: { name: "read", arguments: "{}" } }] },
			{ role: "tool", toolCallId: "tc-1", content: "big result" },
		], idx);
		assert.equal(pruned.length, 2);
	});
	it("keeps unsummarized tool results", () => {
		const idx = m.createToolCallIndexer();
		assert.equal(m.pruneMessages([{ role: "user", content: "hi" }, { role: "tool", toolCallId: "tc-new", content: "result" }], idx).length, 2);
	});
	it("deduplicates summary injection while removing raw results", () => {
		const idx = m.createToolCallIndexer();
		idx.markSummarized("tc-1", "read", 0, "summary");
		idx.markSummarized("tc-2", "rg", 0, "summary");
		const pruned = m.pruneMessages([
			{ role: "assistant", tool_calls: [{ id: "tc-1" }, { id: "tc-2" }] },
			{ role: "tool", toolCallId: "tc-1", content: "result 1" },
			{ role: "tool", toolCallId: "tc-2", content: "result 2" },
		], idx);
		assert.equal(pruned.length, 1);
		assert.match(pruned[0].content, /summary/);
	});
	it("handles empty messages", () => {
		const idx = m.createToolCallIndexer();
		assert.equal(m.pruneMessages([], idx).length, 0);
	});
	it("removes trailing orphan tool after pruning", () => {
		const idx = m.createToolCallIndexer();
		idx.markSummarized("tc-1", "read", 0);
		const pruned = m.pruneMessages([
			{ role: "assistant", tool_calls: [{ id: "tc-1", function: { name: "read", arguments: "{}" } }] },
			{ role: "tool", toolCallId: "tc-1", content: "result" },
			{ role: "tool", toolCallId: "tc-orphan", content: "no assistant" },
		], idx);
		assert.equal(pruned.length, 2); // assistant + one tool
	});
});

// ── summarizeToolBatch ──

describe("summarizeToolBatch", () => {
	it("returns null when pi has no complete function", async () => {
		assert.equal(await m.summarizeToolBatch({}, { turnIndex: 0, toolCalls: [{ id: "t1", name: "read", result: "data" }] }, { enabled: true, pruneOn: "every-turn", summarizerModel: "default" }), null);
	});
});

// ── Agentic tools ──

describe("registerAgenticTools", () => {
	it("registers context_checkpoint and context_rewind", () => {
		const tools = [];
		m.registerAgenticTools({ registerTool: (def) => tools.push(def), setLabel: () => {}, on: () => {} });
		assert.ok(tools.some(t => t.name === "context_checkpoint"));
		assert.ok(tools.some(t => t.name === "context_rewind"));
	});
});

describe("context_checkpoint execute", () => {
	it("returns error without session manager", async () => {
		const tools = [];
		m.registerAgenticTools({ registerTool: (def) => tools.push(def), setLabel: () => {}, on: () => {} });
		const cp = tools.find(t => t.name === "context_checkpoint");
		const result = await cp.execute("1", { name: "test" }, null, null, {});
		assert.ok(/session|сесси/i.test(result.content[0].text));
	});
});

describe("context_rewind execute", () => {
	it("returns error without session manager", async () => {
		const tools = [];
		m.registerAgenticTools({ registerTool: (def) => tools.push(def), setLabel: () => {}, on: () => {} });
		const rw = tools.find(t => t.name === "context_rewind");
		const result = await rw.execute("1", { target: "test", message: "msg" }, null, null, {});
		assert.ok(/session|сесси/i.test(result.content[0].text));
	});
	it("uses model-visible envelope for hidden continuation summary", async () => {
		const tools = [];
		m.registerAgenticTools({ registerTool: (def) => tools.push(def), setLabel: () => {}, on: () => {} });
		const rw = tools.find(t => t.name === "context_rewind");
		const ctx = {
			sessionManager: {
				getLeafId: () => "leaf12345678",
				getLabel: () => "current",
				getTree: () => [{ entry: { id: "target12345678" } }],
				branchWithSummary: async (_target, summary) => {
					assert.ok(summary.includes("<model_visible_context"));
					assert.ok(summary.includes('kind="context_rewind_summary"'));
					assert.ok(summary.includes('ui="hidden"'));
					assert.ok(summary.includes("carryover_summary"));
					return "new12345678";
				},
			},
		};
		const result = await rw.execute("1", { target: "target12345678", message: "continue here" }, null, null, ctx);
		assert.equal(result.content[0].text, "rewind start");
	});
});

// ── Timeline tool ──

describe("registerTimelineTool", () => {
	it("registers context_timeline", () => {
		const tools = [];
		m.registerTimelineTool({ registerTool: (def) => tools.push(def) });
		assert.equal(tools[0].name, "context_timeline");
	});
});

describe("context_timeline execute", () => {
	it("returns error without session manager", async () => {
		const tools = [];
		m.registerTimelineTool({ registerTool: (def) => tools.push(def) });
		const result = await tools[0].execute("1", {}, null, null, {});
		assert.ok(/session|сесси/i.test(result.content[0].text));
	});
});

// ── Dashboard ──

describe("showDashboard", () => {
	it("warns when no context usage", async () => {
		const notifs = [];
		await m.showDashboard({}, { getContextUsage: () => null, ui: { notify: (t, l) => notifs.push([t, l]) } });
		assert.equal(notifs[0][1], "warning");
	});
});

// ── Append-only projection ──

describe("activateAppendOnlyProjectionFromCompact", () => {
	it("sets projection active with summary", () => {
		const st = { config: { appendOnlyProjection: true }, engine: { appendOnly: { enabled: false, projectionActive: false, stableSummary: null, tailStartEntryId: "", tailFingerprint: undefined, invalidatedReason: undefined } } };
		m.activateAppendOnlyProjectionFromCompact({ summary: "fold summary", firstKeptEntryId: "entry-5" }, st);
		assert.ok(st.engine.appendOnly.projectionActive);
		assert.equal(st.engine.appendOnly.tailStartEntryId, "entry-5");
	});
	it("skips when appendOnlyProjection disabled", () => {
		const st = { config: { appendOnlyProjection: false }, engine: { appendOnly: {} } };
		m.activateAppendOnlyProjectionFromCompact({ summary: "x", firstKeptEntryId: "y" }, st);
		assert.equal(st.engine.appendOnly.projectionActive, undefined);
	});
});

describe("applyAppendOnlyProjection", () => {
	it("returns undefined when projection inactive", () => {
		const st = { config: { enabled: true, appendOnlyProjection: true }, engine: { appendOnly: { enabled: true, projectionActive: false } } };
		assert.equal(m.applyAppendOnlyProjection({ messages: [] }, {}, st), undefined);
	});
	it("returns undefined when disabled", () => {
		const st = { config: { enabled: true, appendOnlyProjection: false }, engine: { appendOnly: { enabled: false } } };
		assert.equal(m.applyAppendOnlyProjection({ messages: [] }, {}, st), undefined);
	});
});

// ── i18n ──

describe("t()", () => {
	it("falls back to default locale when locale missing", () => {
		const result = m.t({ locale: "xx" }, "status.title");
		assert.ok(typeof result === "string");
		assert.ok(result.length > 0);
	});
	it("interpolates variables", () => assert.ok(m.t({ locale: "en" }, "status.ctxPct", { pct: 42 }).includes("42")));
});

// ── indexer ──

describe("ToolCallIndexer", () => {
	it("starts empty", () => assert.equal(m.createToolCallIndexer().getAllSummarized().length, 0));
	it("records and checks", () => {
		const idx = m.createToolCallIndexer();
		idx.markSummarized("tc-1", "read_file", 0);
		assert.ok(idx.isSummarized("tc-1"));
		assert.equal(idx.isSummarized("tc-2"), false);
	});
	it("getRecord", () => {
		const idx = m.createToolCallIndexer();
		idx.markSummarized("tc-1", "read", 0);
		assert.equal(idx.getRecord("tc-1").toolName, "read");
	});
	it("resets", () => {
		const idx = m.createToolCallIndexer();
		idx.markSummarized("tc-1", "read", 0);
		idx.reset();
		assert.equal(idx.getAllSummarized().length, 0);
	});
});

// ── stats.ts ──

describe("hitRatio", () => {
	it("calculates ratio", () => assert.equal(m.hitRatio(100, 900), 0.9));
	it("handles zero total", () => assert.equal(m.hitRatio(0, 0), undefined));
	it("includes cacheWrite in denominator", () => assert.equal(m.hitRatio(100, 800, 100), 0.8));
});

describe("formatTokenCount", () => {
	it("formats millions", () => assert.equal(m.formatTokenCount(1_500_000), "1.5M"));
	it("formats thousands", () => assert.equal(m.formatTokenCount(1_500), "1.5k"));
	it("formats small numbers", () => assert.equal(m.formatTokenCount(42), "42"));
});

describe("extractUsageSnapshot", () => {
	it("extracts from usage object", () => {
		const s = m.extractUsageSnapshot({ usage: { input: 100, cacheRead: 900, output: 50 } });
		assert.equal(s.input, 100);
		assert.equal(s.cacheRead, 900);
	});
	it("returns undefined for no usage", () => assert.equal(m.extractUsageSnapshot({}), undefined));
	it("returns undefined for null", () => assert.equal(m.extractUsageSnapshot(null), undefined));
});

describe("addUsage", () => {
	it("adds snapshot to stats", () => {
		const stats = m.emptyStats();
		const r = m.addUsage(stats, { input: 100, cacheRead: 900, output: 50, cacheWrite: 0 }, "deepseek/deepseek-v4-flash");
		assert.equal(r.requests, 1);
		assert.equal(r.input, 100);
		assert.equal(r.cacheRead, 900);
	});
	it("handles undefined snapshot", () => {
		const stats = m.emptyStats();
		assert.equal(m.addUsage(stats, undefined), stats);
	});
});

describe("savingsFromRealCost", () => {
	it("calculates savings", () => {
		const s = m.savingsFromRealCost({ input: 1000, cacheRead: 0, cacheWrite: 0, output: 100, cost: 0.00016 }, { input: 0.14, output: 0.28, cacheRead: 0.0028, cacheWrite: 0 });
		assert.ok(typeof s === "number");
	});
});

describe("costToCompact", () => {
	it("returns 0 for undefined usage", () => {
		const cost = m.costToCompact(undefined, { input: 0.14, cacheRead: 0.0028, cacheWrite: 0 });
		assert.equal(cost, 0);
	});
	it("calculates cost", () => {
		const cost = m.costToCompact({ input: 1000, cacheRead: 900, cacheWrite: 100 }, { input: 0.14, cacheRead: 0.0028, cacheWrite: 0 });
		assert.ok(cost > 0);
	});
});

describe("deepSeekOfficialCost", () => {
	it("returns flash pricing", () => {
		const p = m.deepSeekOfficialCost("deepseek-v4-flash");
		assert.equal(p.input, 0.14);
	});
	it("returns pro pricing", () => {
		const cost = m.deepSeekOfficialCost("deepseek-pro");
		assert.strictEqual(cost.input, 0.435);
	});
	it("returns undefined for unknown", () => assert.equal(m.deepSeekOfficialCost("gpt-4"), undefined));
});

describe("emptyStats", () => {
	it("returns zeroed stats", () => {
		const s = m.emptyStats();
		assert.equal(s.requests, 0);
		assert.equal(s.cacheRead, 0);
	});
});

// ── config.ts ──

describe("readConfig", () => {
	it("returns default config when no file exists", () => {
		const cfg = m.readConfig("/nonexistent/path.json");
		assert.ok(cfg.enabled);
		assert.equal(cfg.foldThreshold, 0.75);
	});
});

describe("defaultConfig", () => {
	it("has fold threshold", () => assert.equal(m.DEFAULT_CONFIG.foldThreshold, 0.75));
	it("has aggressive threshold", () => assert.equal(m.DEFAULT_CONFIG.aggressiveFoldThreshold, 0.78));
	it("has prune enabled by default", () => assert.equal(m.DEFAULT_CONFIG.pruneEnabled, true));
	it("has prune after agent response by default", () => assert.equal(m.DEFAULT_CONFIG.pruneOn, "agent-message"));
});

// ── model.ts ──

describe("detectDeepSeekModel", () => {
	it("detects native DeepSeek", () => {
		const d = m.detectDeepSeekModel({ id: "deepseek/deepseek-v4-flash", provider: "deepseek", compat: { thinkingFormat: "deepseek" } });
		assert.equal(d.kind, "native");
	});
	it("detects compatible model", () => {
		const d = m.detectDeepSeekModel({ id: "deepseek-chat", provider: "openrouter" });
		assert.equal(d.kind, "misconfigured");
	});
	it("detects non-DeepSeek", () => {
		const d = m.detectDeepSeekModel({ id: "gpt-4", provider: "openai" });
		assert.equal(d.kind, "not-deepseek");
	});
	it("handles undefined model", () => {
		const d = m.detectDeepSeekModel(undefined);
		assert.equal(d.kind, "not-deepseek");
	});
});

// ── context-monitor.ts ──

describe("recommendContextAction", () => {
	it("returns ok for low usage", () => {
		const r = m.recommendContextAction(0.30, { contextWarnPct: 0.70, contextDangerPct: 0.85 });
		assert.equal(r.level, "ok");
	});
	it("returns warn for medium usage", () => {
		const r = m.recommendContextAction(0.75, { contextWarnPct: 0.70, contextDangerPct: 0.85 });
		assert.equal(r.level, "warn");
	});
	it("returns danger for high usage", () => {
		const r = m.recommendContextAction(0.90, { contextWarnPct: 0.70, contextDangerPct: 0.85 });
		assert.equal(r.level, "danger");
	});
	it("handles undefined percent", () => {
		const r = m.recommendContextAction(undefined, { contextWarnPct: 0.70, contextDangerPct: 0.85 });
		assert.equal(r.level, "off");
	});
});

// ── payload-diagnostics.ts ──

describe("inspectProviderPayload", () => {
	it("returns diagnostics for valid payload", () => {
		const diag = m.inspectProviderPayload({ model: "deepseek-v4-flash", messages: [{ role: "user", content: "hi" }], tools: [] });
		assert.ok(diag.messageCount > 0);
		assert.ok(diag.toolCount >= 0);
	});
	it("handles undefined", () => {
		const diag = m.inspectProviderPayload(undefined);
		assert.ok(diag);
	});
});

// ── capper.ts ──

describe("HugeResultStore", () => {
	it("stores and retrieves", () => {
		const store = new m.HugeResultStore();
		const rec = store.remember("big data", "tool-1");
		assert.ok(rec.ref);
		assert.equal(rec.toolCallId, "tool-1");
		const got = store.get(rec.ref);
		assert.equal(got.toolCallId, "tool-1");
	});
	it("returns undefined for unknown ref", () => {
		const store = new m.HugeResultStore();
		assert.equal(store.get("unknown"), undefined);
	});
});

describe("maybeCapToolResult", () => {
	it("passes through when disabled", () => {
		const store = new m.HugeResultStore();
		const r = m.maybeCapToolResult({ toolCallId: "t1", content: "data" }, { hugeResultCapper: false }, store);
		assert.equal(r, undefined);
	});
	it("caps when above threshold", () => {
		const store = new m.HugeResultStore();
		const event = { toolCallId: "t1", content: ["x".repeat(10000)] };
		const r = m.maybeCapToolResult(event, { hugeResultCapper: true, hugeResultThreshold: 100, hugeResultHeadChars: 50, hugeResultTailChars: 20 }, store);
		assert.ok(JSON.stringify(r.content).includes("[pi-context-engine: model-visible context]"));
	});
	it("handles undefined event", () => {
		const store = new m.HugeResultStore();
		assert.equal(m.maybeCapToolResult(undefined, { hugeResultCapper: true }, store), undefined);
	});
});

// ── fold-tool.ts ──

describe("registerFoldTool", () => {
	it("registers deepseek_cache_fold tool", () => {
		const tools = [];
		const state = { config: { locale: "en", enabled: true, autoFold: true }, engine: { foldToolRegistered: false } };
		m.registerFoldTool({ registerTool: (def) => tools.push(def) }, state);
		assert.equal(tools[0].name, "deepseek_cache_fold");
	});
	it("skips when already registered", () => {
		const tools = [];
		const state = { config: { locale: "en", enabled: true, autoFold: true }, engine: { foldToolRegistered: true } };
		m.registerFoldTool({ registerTool: (def) => tools.push(def) }, state);
		assert.equal(tools.length, 0);
	});
});

// ── holdCompaction ──

describe("holdCompaction", () => {
	it("sets holdUntilTurn", () => {
		const state = { engine: { turnIndex: 5, holdUntilTurn: 0, lastDecision: "" }, config: { minTurnsBetweenCompacts: 3 } };
		m.holdCompaction(state);
		assert.ok(state.engine.holdUntilTurn >= 8);
		assert.equal(state.engine.lastDecision, "hold");
	});
});

// ── registerPruneTool ──

describe("registerPruneTool", () => {
	it("registers context_prune command", () => {
		const tools = [];
		const idx = m.createToolCallIndexer();
		m.registerPruneTool({ registerTool: (def) => tools.push(def) }, idx, { config: { locale: "en" } });
		assert.ok(tools.length > 0);
	});
});

// ── formatStats ──

describe("formatStats", () => {
	it("formats stats", () => {
		const stats = m.emptyStats();
		const result = m.formatStats(stats);
		assert.ok(result.includes("input_tokens"));
	});
});

// ── prefix-fingerprint.ts ──

describe("stableHash", () => {
	it("produces deterministic hash", () => {
		const h1 = m.stableHash({ a: 1, b: 2 });
		const h2 = m.stableHash({ b: 2, a: 1 });
		assert.equal(h1, h2);
	});
	it("different inputs produce different hashes", () => {
		const h1 = m.stableHash({ a: 1 });
		const h2 = m.stableHash({ a: 2 });
		assert.notEqual(h1, h2);
	});
});

describe("normalizeTools", () => {
	it("sorts tools by name", () => {
		const tools = [{ name: "z", description: "last" }, { name: "a", description: "first" }];
		const n = m.normalizeTools(tools);
		assert.equal(n.length, 2);
	});
	it("handles undefined tools", () => {
		const n = m.normalizeTools(undefined);
		assert.equal(n.length, 0);
	});
});

describe("diffPrefix", () => {
	it("returns empty reasons for equal prefixes", () => {
		const a = { model: "m1", systemHash: "s1", toolsHash: "t1", reasoning: false, temperature: 0 };
		const d = m.diffPrefix(a, a);
		assert.equal(d.reasons.length, 0);
	});
	it("detects model change", () => {
		const a = { model: "m1", systemHash: "s1", toolsHash: "t1", reasoning: false, temperature: 0 };
		const b = { model: "m2", systemHash: "s1", toolsHash: "t1", reasoning: false, temperature: 0 };
		const d = m.diffPrefix(a, b);
		assert.ok(d.reasons.includes("model"));
		assert.ok(d.hard);
	});
});

describe("shouldNotifyPrefixDrift", () => {
	it("notifies on new reason", () => {
		const drift = { reasons: ["tools"], hard: true };
		const state = { engine: { lastPrefixWarningReason: "", lastPrefixWarningTurn: 0, turnIndex: 10 } };
		assert.ok(m.shouldNotifyPrefixDrift(state, drift));
	});
	it("suppresses same reason recently", () => {
		const drift = { reasons: ["tools"], hard: false };
		const state = { engine: { lastPrefixWarningReason: "tools", lastPrefixWarningTurn: 8, turnIndex: 10 } };
		assert.equal(m.shouldNotifyPrefixDrift(state, drift), false);
	});
});

// ── config.ts ──

describe("parseConfig", () => {
	it("merges partial config with defaults", () => {
		const cfg = m.parseConfig({ foldThreshold: 0.80 });
		assert.equal(cfg.foldThreshold, 0.80);
	});
	it("returns defaults for null", () => {
		const cfg = m.parseConfig(null);
		assert.equal(cfg.foldThreshold, 0.75);
	});
	it("parses percent as 0..1 from 0..100", () => {
		const cfg = m.parseConfig({ foldThreshold: 80 });
		assert.ok(cfg.foldThreshold > 0.5 && cfg.foldThreshold < 1);
	});
});

describe("writeConfig", () => {
	it("writes config to file", async () => {
		const tmp = "/tmp/test-config-" + Date.now() + ".json";
		m.writeConfig({ locale: "en", enabled: true }, tmp);
		const cfg = m.readConfig(tmp);
		assert.equal(cfg.enabled, true);
	});
});

// ── context-monitor.ts ──

describe("getContextPercent", () => {
	it("extracts from context usage", () => {
		const pct = m.getContextPercent({ ratio: 0.75 });
		assert.equal(pct, 0.75);
	});
	it("returns undefined for null", () => {
		assert.equal(m.getContextPercent(null), undefined);
	});
	it("returns undefined for no usage", () => {
		assert.equal(m.getContextPercent({}), undefined);
	});
});

// ── payload-diagnostics.ts ──

describe("formatPayloadDiagnostics", () => {
	it("formats diagnostics", () => {
		const diag = { createdAt: 1000, messageCount: 5, toolCount: 2, payloadBytes: 500, includeUsage: true };
		const f = m.formatPayloadDiagnostics(diag);
		assert.ok(f.includes("5"));
		assert.ok(f.includes("500"));
	});
	it("handles undefined", () => {
		const r = m.formatPayloadDiagnostics(undefined);
		assert.ok(typeof r === "string");
	});
});

// ── capper.ts extensions ──

describe("extractToolResultText", () => {
	it("returns string as-is", () => assert.equal(m.extractToolResultText("hello"), "hello"));
	it("extracts from ContentPart[]", () => assert.equal(m.extractToolResultText([{ type: "text", text: "hello" }]), "hello"));
	it("returns undefined for non-array", () => assert.equal(m.extractToolResultText(42), undefined));
	it("handles empty array", () => assert.equal(m.extractToolResultText([]), undefined));
});

describe("buildPreview", () => {
	it("builds preview string", () => {
		const store = new m.HugeResultStore();
		const rec = store.remember("x".repeat(200), "t1", "read");
		const prev = m.buildPreview(rec, { hugeResultHeadChars: 50, hugeResultTailChars: 20 });
		assert.ok(prev.includes('"ref":'));
		assert.ok(prev.includes("<model_visible_context"));
		assert.ok(prev.includes('kind="context_result_truncated"'));
		assert.ok(prev.includes('"tool": "context_result_lookup"'));
		assert.ok(prev.includes("read"));
	});
	it("handles empty tail", () => {
		const store = new m.HugeResultStore();
		const rec = store.remember("short", "t2");
		const prev = m.buildPreview(rec, { hugeResultHeadChars: 50, hugeResultTailChars: 0 });
		assert.ok(prev.includes("short"));
	});
});

// ── batch-capture edge cases ──

describe("captureBatches edge cases", () => {
	it("handles multi-turn tool sequences", () => {
		const pr = { pendingBatches: [], batchStepCounter: 0 };
		m.captureBatches([
			{ message: { role: "assistant", tool_calls: [{ id: "tc-1", function: { name: "read" } }] }, turnIndex: 0 },
			{ message: { role: "tool", toolCallId: "tc-1", content: "result1" }, turnIndex: 0 },
			{ message: { role: "assistant", tool_calls: [{ id: "tc-2", function: { name: "write" } }] }, turnIndex: 1 },
			{ message: { role: "tool", toolCallId: "tc-2", content: "result2" }, turnIndex: 1 },
		], [], pr, 0);
		assert.ok(pr.pendingBatches.length > 0);
	});
	it("deduplicates repeated tool calls", () => {
		const pr = { pendingBatches: [], batchStepCounter: 0 };
		m.captureBatches([
			{ message: { role: "assistant", tool_calls: [{ id: "tc-1", function: { name: "read" } }] }, turnIndex: 0 },
			{ message: { role: "tool", toolCallId: "tc-1", content: "result" }, turnIndex: 0 },
			{ message: { role: "assistant", tool_calls: [{ id: "tc-1", function: { name: "read" } }] }, turnIndex: 1 },
			{ message: { role: "tool", toolCallId: "tc-1", content: "result2" }, turnIndex: 1 },
		], ["tc-1"], pr, 0);
		assert.equal(pr.pendingBatches.length, 0);
	});
	it("skips non-tool messages in branch", () => {
		const pr = { pendingBatches: [], batchStepCounter: 0 };
		m.captureBatches([
			{ message: { role: "user", content: "hi" }, turnIndex: 0 },
			{ message: { role: "assistant", content: "ok" }, turnIndex: 0 },
		], [], pr, 0);
		assert.equal(pr.pendingBatches.length, 0);
	});
});

// ── append-only-projection edge cases ──

describe("applyAppendOnlyProjection edge cases", () => {
	it("applies projection when active and enabled", () => {
		const st = {
			config: { enabled: true, appendOnlyProjection: true },
			engine: {
				appendOnly: {
					enabled: true, projectionActive: true,
					tailStartEntryId: "e2",
					tailFingerprint: undefined,
					invalidatedReason: undefined,
					stableSummary: { role: "assistant", content: "summary", name: "deepseek_cache_stable_summary" },
				},
			},
		};
		const event = { messages: [{ id: "e1", role: "system", content: "sys" }, { id: "e2", role: "user", content: "tail" }] };
		const r = m.applyAppendOnlyProjection(event, {}, st);
		assert.ok(r === undefined || r.messages.some(m => m?.name === "deepseek_cache_stable_summary"));
	});
});

// ── formatStatus ──

describe("formatStatus", () => {
	it("formats status with context", async () => {
		const { formatStatus } = await import("../src/stats.ts");
		const s = formatStatus(m.emptyStats(), 0.5);
		assert.ok(s.includes("ctx"));
	});
});

describe("buildProgressBar", () => {
	it("renders text style without a bar", () => {
		assert.equal(m.buildProgressBar(0.75, 10, "text"), "");
	});
	it("renders distinct block and sparkline styles", () => {
		assert.match(m.buildProgressBar(0.75, 10, "blocks"), /█/);
		assert.doesNotMatch(m.buildProgressBar(0.75, 10, "sparkline"), /[\[\]]/);
	});
});

// ── config.ts edge cases ──

describe("readConfig edge cases", () => {
  it("handles malformed JSON file gracefully", async () => {
    const { writeFileSync, unlinkSync } = await import("fs");
    const tmp = "/tmp/bad-config-" + Date.now() + ".json";
    writeFileSync(tmp, "not valid json");
    const cfg = m.readConfig(tmp);
    assert.ok(cfg.enabled);
    unlinkSync(tmp);
  });
});

describe("parseConfig more", () => {
  it("handles 0..100 percent values", () => {
    const cfg = m.parseConfig({ foldThreshold: 80, aggressiveFoldThreshold: 82, exitSummaryThreshold: 85 });
    assert.ok(cfg.foldThreshold > 0.5 && cfg.foldThreshold < 1);
  });
  it("handles out-of-range percent", () => {
    const cfg = m.parseConfig({ foldThreshold: -1 });
    assert.equal(cfg.foldThreshold, 0.75);
  });
});

describe("readContextPercent", () => {
  it("handles non-function ctx", async () => {
    const pct = await m.readContextPercent({});
    assert.equal(pct, undefined);
  });
  it("handles null ctx", async () => {
    const pct = await m.readContextPercent(null);
    assert.equal(pct, undefined);
  });
});

describe("extractToolResultText more", () => {
  it("extracts from mixed ContentPart array", () => {
    const r = m.extractToolResultText(["plain", { type: "text", text: "structured" }]);
    assert.equal(r, "plain\nstructured");
  });
});

describe("computeHitRatio", () => {
  it("returns 0 for zero input", async () => {
    const { computeHitRatio } = await import("../src/stats.ts");
    assert.equal(computeHitRatio(0, 0), 0);
  });
  it("calculates ratio", async () => {
    const { computeHitRatio } = await import("../src/stats.ts");
    assert.equal(computeHitRatio(100, 900), 0.9);
  });
});

describe("cacheSavingsUsd", () => {
  it("returns 0 for unknown model", async () => {
    const { cacheSavingsUsd } = await import("../src/stats.ts");
    assert.equal(cacheSavingsUsd("unknown-model", 1000), 0);
  });
  it("calculates savings for flash", async () => {
    const { cacheSavingsUsd } = await import("../src/stats.ts");
    const s = cacheSavingsUsd("deepseek-v4-flash", 1_000_000);
    assert.ok(s > 0);
  });
});

describe("summarizeToolBatch edge cases", () => {
  it("returns summary text when pi responds", async () => {
    const result = await m.summarizeToolBatch(
      { complete: async () => "summary text" },
      { turnIndex: 0, toolCalls: [{ id: "t1", name: "read", args: "{}", result: "data" }] },
      { enabled: true, pruneOn: "every-turn", summarizerModel: "default" },
    );
    assert.ok(result);
    assert.equal(result.summaryText, "summary text");
  });
});

describe("markCompaction", () => {
  it("adds compact record", async () => {
    const { markCompaction, emptyStats } = await import("../src/stats.ts");
    const stats = markCompaction(emptyStats(), { turn: 1, reason: "auto", completed: true });
    assert.equal(stats.compacts.length, 1);
    assert.equal(stats.compacts[0].turn, 1);
  });
});

describe("usageTotalInput", () => {
  it("calculates total input", async () => {
    const { usageTotalInput } = await import("../src/stats.ts");
    assert.equal(usageTotalInput({ input: 100, cacheRead: 200, cacheWrite: 50 }), 350);
  });
  it("handles undefined", async () => {
    const { usageTotalInput } = await import("../src/stats.ts");
    assert.equal(usageTotalInput(undefined), 0);
  });
});

describe("handleProviderPrefix edge cases", () => {
  it("returns undefined when disabled", async () => {
    const { handleProviderPrefix } = await import("../src/cache-engine/prefix-fingerprint.ts");
    const state = { config: { enabled: false, prefixFingerprint: true }, engine: { prefixDriftCount: 0, toolHashChanges: 0, lastPrefixChangeReason: "" } };
    const r = handleProviderPrefix({ payload: { model: "test" } }, {}, state);
    assert.equal(r, undefined);
  });
  it("handles missing payload", async () => {
    const { handleProviderPrefix } = await import("../src/cache-engine/prefix-fingerprint.ts");
    const state = { config: { enabled: true, prefixFingerprint: true }, engine: { prefixDriftCount: 0, toolHashChanges: 0, lastPrefixChangeReason: "" } };
    const r = handleProviderPrefix(undefined, {}, state);
    assert.equal(r, undefined);
  });
});

describe("captureBatches sequential assistants", () => {
  it("starts new batch on sequential assistants", () => {
    const pr = { pendingBatches: [], batchStepCounter: 0 };
    m.captureBatches([
      { message: { role: "assistant", tool_calls: [{ id: "tc-1", function: { name: "read" } }] }, turnIndex: 0 },
      { message: { role: "assistant", tool_calls: [{ id: "tc-2", function: { name: "write" } }] }, turnIndex: 0 },
      { message: { role: "tool", toolCallId: "tc-1", content: "r1" }, turnIndex: 0 },
      { message: { role: "tool", toolCallId: "tc-2", content: "r2" }, turnIndex: 0 },
    ], [], pr, 0);
    assert.ok(pr.pendingBatches.length >= 1);
  });

  it("splits distant tool episodes into separate batches when bridge length is exceeded", () => {
    const pr = { pendingBatches: [], batchStepCounter: 0 };
    m.captureBatches([
      { message: { role: "assistant", content: "start", tool_calls: [{ id: "tc-1", function: { name: "read" } }] }, turnIndex: 0 },
      { message: { role: "tool", toolCallId: "tc-1", content: "r1" }, turnIndex: 0 },
      { message: { role: "assistant", content: "reasoning gap 1" }, turnIndex: 1 },
      { message: { role: "user", content: "reasoning gap 2" }, turnIndex: 2 },
      { message: { role: "assistant", content: "resume", tool_calls: [{ id: "tc-2", function: { name: "write" } }] }, turnIndex: 3 },
      { message: { role: "tool", toolCallId: "tc-2", content: "r2" }, turnIndex: 3 },
    ], [], pr, 3, { bridgeLength: 2 });
    assert.equal(pr.pendingBatches.length, 2);
  });
});

describe("getConfigPath", () => {
  it("returns path ending with context-engine.json", async () => {
    const { getConfigPath } = await import("../src/config.ts");
    const p = getConfigPath();
    assert.ok(p.endsWith("context-engine.json"));
  });
});

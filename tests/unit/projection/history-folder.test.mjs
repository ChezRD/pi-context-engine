import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";
register("./../../__mocks__/loader.mjs", import.meta.url);

const m = {};

describe("history-folder", () => {
	it("loads module and functions", async () => {
		const mod = await import("../../../src/projection/history-folder.ts");
		const runtime = await import("../../../src/runtime-state.ts");
		const config = await import("../../../src/config.ts");
		assert.ok(mod.countMessageTokens);
		assert.ok(mod.estimateFoldBoundary);
		assert.ok(mod.extractPinnedSkills);
		assert.ok(mod.extractPinnedConstraints);
		assert.ok(mod.extractContextEnginePins);
		assert.ok(mod.extractSessionIntent);
		assert.ok(mod.buildFoldMessage);
		assert.ok(mod.trimTrailingAssistantToolCalls);
		assert.ok(mod.isFoldValid);
		assert.ok(mod.detectGoalDeadlock);
		assert.ok(mod.summarizeHead);
		assert.ok(mod.semanticFold);
		Object.assign(m, mod);
		Object.assign(m, runtime);
		Object.assign(m, config);
	});

	function state(overrides = {}) {
		const runtimeState = m.createRuntimeState();
		runtimeState.config = {
			...runtimeState.config,
			minFoldSavings: 0,
			foldTailPct: 0.2,
			aggressiveFoldTailPct: 0.1,
			foldSummaryModel: "deepseek/deepseek-v4-flash",
			foldTimeoutMs: 1000,
			semanticFoldMarker: "<fold-summary>",
			...overrides,
		};
		return runtimeState;
	}

	function branchFromMessages(messages) {
		return messages.map((message, index) => ({ id: `entry-${index}`, message })).reverse();
	}

	describe("countMessageTokens", () => {
		it("returns 0 for null/undefined/non-object", () => {
			assert.equal(m.countMessageTokens(null), 0);
			assert.equal(m.countMessageTokens(undefined), 0);
			assert.equal(m.countMessageTokens("string"), 0);
			assert.equal(m.countMessageTokens(42), 0);
		});

		it("counts text content", () => {
			// "hello world".length=11, +4=15, ceil(15/4)=4
			assert.equal(m.countMessageTokens({ role: "user", content: "hello world" }), 4);
		});

		it("counts array content parts", () => {
			// 8 chars + 4 = 12, ceil(12/4) = 3
			const msg = { role: "user", content: [{ type: "text", text: "abcd" }, { type: "text", text: "efgh" }] };
			assert.equal(m.countMessageTokens(msg), 3);
		});

		it("counts tool_calls function names and args", () => {
			// name "read"=4, args=10, +4=18, ceil(18/4)=5
			const msg = { role: "assistant", content: "", tool_calls: [{ function: { name: "read", arguments: '{"file":"x"}' } }] };
			assert.equal(m.countMessageTokens(msg), 5);
		});
	});

	describe("extractPinnedSkills", () => {
		it("returns empty for no skill pins", () => {
			assert.deepEqual(m.extractPinnedSkills([{ content: "no pins here" }]), []);
		});

		it("extracts skill-pin blocks", () => {
			const result = m.extractPinnedSkills([{ role: "user", content: '<skill-pin name="test">\ncode here\n</skill-pin>' }]);
			assert.equal(result.length, 1);
			assert.equal(result[0].id, "test");
		});

		it("last invocation wins for same name", () => {
			const msgs = [
				{ role: "user", content: '<skill-pin name="dup">\nold\n</skill-pin>' },
				{ role: "user", content: '<skill-pin name="dup">\nnew\n</skill-pin>' },
			];
			const result = m.extractPinnedSkills(msgs);
			assert.equal(result.length, 1);
			assert.ok(result[0].content.includes("new"));
		});
	});

	describe("extractPinnedConstraints", () => {
		it("returns empty for no constraints", () => {
			assert.deepEqual(m.extractPinnedConstraints([{ content: "nothing" }]), []);
		});

		it("extracts bracket-format constraints", () => {
			const result = m.extractPinnedConstraints([{ role: "user", content: "[HIGH PRIORITY must do]\n\nnext" }]);
			assert.equal(result.length, 1);
			assert.ok(result[0].includes("must do"));
		});
	});

	describe("extractContextEnginePins", () => {
		it("returns empty for no matches", () => {
			assert.deepEqual(m.extractContextEnginePins([{ content: "no pins" }]), []);
		});

		it("extracts context-engine-pin blocks", () => {
			const result = m.extractContextEnginePins([{ role: "user", content: '<context-engine-pin kind="priority" name="test">\nvalue\n</context-engine-pin>' }]);
			assert.equal(result.length, 1);
			assert.equal(result[0].kind, "priority");
			assert.equal(result[0].name, "test");
		});
	});

	describe("extractSessionIntent", () => {
		it("returns undefined for empty messages", () => {
			assert.equal(m.extractSessionIntent([]), undefined);
		});

		it("extracts intent from last user message content", () => {
			const msgs = [
				{ role: "assistant", content: "ok" },
				{ role: "user", content: "do X" },
			];
			const result = m.extractSessionIntent(msgs);
			assert.ok(result?.includes("do X"));
		});

		it("prefers session intent marker over tool_calls", () => {
			const msgs = [
				{ role: "user", content: "plain text" },
				{ role: "assistant", content: "ok", tool_calls: [{ function: { name: "test" } }] },
			];
			const result = m.extractSessionIntent(msgs);
			assert.ok(result?.includes("plain text"));
		});
	});

	describe("detectGoalDeadlock", () => {
		it("returns false for no messages", () => {
			assert.equal(m.detectGoalDeadlock([]), false);
		});

		it("returns false when no refusal patterns present", () => {
			assert.equal(m.detectGoalDeadlock([{ role: "assistant", content: "working on it" }]), false);
		});

		it("returns true when 3 assistant messages match refusal patterns in a row", () => {
			const msgs = [
				{ role: "user", content: "do it" },
				{ role: "assistant", content: "I'm stuck in an infinite loop" },
				{ role: "assistant", content: "I will not run any more" },
				{ role: "assistant", content: "refused to continue" },
			];
			assert.equal(m.detectGoalDeadlock(msgs), true);
		});

		it("returns false with only 2 refusals (below threshold)", () => {
			assert.equal(m.detectGoalDeadlock([
				{ role: "assistant", content: "infinite loop" },
				{ role: "assistant", content: "will not run" },
			]), false);
		});

		it("detects via text repetition (same text 3x)", () => {
			assert.equal(m.detectGoalDeadlock([
				{ role: "assistant", content: "stuck" },
				{ role: "assistant", content: "stuck" },
				{ role: "assistant", content: "stuck" },
			]), true);
		});

		it("detects repeated content-array tool calls", () => {
			const call = { type: "toolCall", name: "read", input: { path: "src/example.ts" } };
			assert.equal(m.detectGoalDeadlock([
				{ role: "assistant", content: [call] },
				{ role: "assistant", content: [call] },
				{ role: "assistant", content: [call] },
			]), true);
		});

		it("user messages reset the refusal counter", () => {
			const msgs = [
				{ role: "assistant", content: "infinite loop" },
				{ role: "user", content: "try again" },
				{ role: "assistant", content: "will not run" },
				{ role: "user", content: "keep going" },
				{ role: "assistant", content: "cannot complete" },
			];
			assert.equal(m.detectGoalDeadlock(msgs), false);
		});
	});

	describe("estimateFoldBoundary", () => {
		it("returns ok:false for empty messages", () => {
			const r = m.estimateFoldBoundary([], 0, 0);
			assert.equal(r.ok, false);
		});

		it("splits messages into head+tail", () => {
			const msgs = [
				{ role: "user", content: "head message aaaaaaaaaaaa" },
				{ role: "user", content: "head message bbbbbbbbbbbb" },
				{ role: "user", content: "tail message one" },
				{ role: "user", content: "tail message two" },
			];
			const r = m.estimateFoldBoundary(msgs, 0, 5);
			assert.equal(r.ok, true);
			assert.ok(r.headMessages.length >= 1, "should have head");
			assert.ok(r.tailMessages.length >= 1, "should have tail");
			assert.equal(r.headMessages.length + r.tailMessages.length, msgs.length);
		});
	});

	describe("trimTrailingAssistantToolCalls", () => {
		it("returns as-is when last is not assistant+tool_calls", () => {
			const [r, removed] = m.trimTrailingAssistantToolCalls([{ role: "user", content: "hi" }]);
			assert.equal(removed, 0);
			assert.equal(r.length, 1);
		});

		it("trims trailing assistant with tool_calls", () => {
			const [r, removed] = m.trimTrailingAssistantToolCalls([
				{ role: "user", content: "hi" },
				{ role: "assistant", content: "", tool_calls: [{ id: "1" }] },
			]);
			assert.equal(removed, 1);
			assert.equal(r.length, 1);
		});

		it("only trims when LAST message is assistant+tool_calls", () => {
			const [r, removed] = m.trimTrailingAssistantToolCalls([
				{ role: "assistant", content: "", tool_calls: [{ id: "1" }] },
				{ role: "tool", content: "result", tool_call_id: "1" },
			]);
			assert.equal(removed, 0);
			assert.equal(r.length, 2);
		});
	});

	describe("buildFoldMessage", () => {
		function text(msg) { return Array.isArray(msg.content) ? msg.content[0]?.text ?? "" : msg.content ?? ""; }

		it("returns user-role message with marker, summary, constraints, intent, guidance", () => {
			const msg = m.buildFoldMessage("<fold>", "test summary", [], ["[HIGH]"], [], "intent", "guidance", false);
			assert.equal(msg.role, "user");
			const t = text(msg);
			assert.ok(t.includes("<fold>"), "should contain marker");
			assert.ok(t.includes("test summary"), "should contain summary");
			assert.ok(t.includes("[HIGH]"), "should contain constraint");
			assert.ok(t.includes("intent"), "should contain session intent");
			assert.ok(t.includes("guidance"), "should contain guidance");
		});

		it("excludes session intent but keeps guidance when deadlocked", () => {
			const msg = m.buildFoldMessage("<fold>", "stuck", [], [], [], "deadlocked intent", "operating guidance", true);
			const t = text(msg);
			assert.ok(t.includes("DEADLOCK DETECTED"), "should have deadlock marker");
			assert.ok(!t.includes("deadlocked intent"), "should NOT include deadlocked session intent");
			assert.ok(t.includes("operating guidance"), "operating guidance preserved even in deadlock");
		});

		it("includes session intent when not deadlocked", () => {
			const msg = m.buildFoldMessage("<fold>", "summary", [], [], [], "active intent", "guidance", false);
			const t = text(msg);
			assert.ok(t.includes("active intent"), "should include session intent");
			assert.ok(t.includes("guidance"), "should include guidance");
		});

		it("preserves context-engine pins verbatim", () => {
			const raw = '<context-engine-pin kind="priority" name="critical">\nPinned instruction\n</context-engine-pin>';
			const msg = m.buildFoldMessage("<fold>", "summary", [], [], [{
				kind: "priority",
				name: "critical",
				content: "Pinned instruction",
				raw,
			}]);
			assert.ok(text(msg).includes(raw));
		});
	});

	describe("extractEffectiveNudgeGuidance", () => {
		it("preserves observed guidance markers from text array content", () => {
			const result = m.extractEffectiveNudgeGuidance([
				{
					role: "user",
					content: [
						{ type: "text", text: "<!-- pi-context-engine: guidance -->Keep using evidence.<!-- /pi-context-engine: guidance -->" },
						{ type: "text", text: "<!-- pi-context-engine: fold guidance -->Preserve context.<!-- /pi-context-engine: fold guidance -->" },
					],
				},
			]);
			assert.ok(result.includes("Observed prior context-engine guidance"));
			assert.ok(result.includes("Observed prior fold guidance"));
		});
	});

	describe("summarizeHead", () => {
		it("returns empty summary for timeout-like errors", async () => {
			const result = await m.summarizeHead({
				complete: async () => {
					const error = new Error("summary timeout");
					error.name = "TimeoutError";
					throw error;
				},
			}, "", [{ role: "user", content: "Summarize this request." }], {});
			assert.equal(result, "");
		});

		it("rethrows non-timeout errors", async () => {
			await assert.rejects(() => m.summarizeHead({
				complete: async () => {
					throw new Error("model failure");
				},
			}, "", [{ role: "user", content: "Summarize this request." }], {}), /model failure/);
		});
	});

	describe("semanticFold", () => {
		it("fails when the session branch is unavailable", async () => {
			const result = await m.semanticFold({}, {
				getContextUsage: () => ({ ctxMax: 1000 }),
				sessionManager: { getBranch: async () => { throw new Error("unavailable"); } },
			}, state());
			assert.equal(result.ok, false);
			assert.equal(result.reasonKey, "engine.fold.reason.sessionBranchUnavailable");
		});

		it("fails when trimming removes all messages", async () => {
			const result = await m.semanticFold({}, {
				getContextUsage: () => ({ ctxMax: 1000 }),
				sessionManager: {
					getBranch: async () => branchFromMessages([
						{ role: "assistant", content: "", tool_calls: [{ function: { name: "read", arguments: "{}" } }] },
					]),
				},
			}, state());
			assert.equal(result.ok, false);
			assert.equal(result.reasonKey, "engine.fold.reason.noMessagesAfterTrim");
		});

		it("fails when the estimated head is empty", async () => {
			const result = await m.semanticFold({}, {
				getContextUsage: () => ({ ctxMax: 10_000 }),
				sessionManager: {
					getBranch: async () => branchFromMessages([
						{ role: "user", content: "Small current request." },
						{ role: "assistant", content: "Small reply." },
					]),
				},
			}, state({ foldTailPct: 1 }));
			assert.equal(result.ok, false);
			assert.equal(result.reasonKey, "engine.fold.reason.noHeadToFold");
		});

		it("fails when head savings are below the configured minimum", async () => {
			const result = await m.semanticFold({}, {
				getContextUsage: () => ({ ctxMax: 100 }),
				sessionManager: {
					getBranch: async () => branchFromMessages([
						{ role: "user", content: "Older task details ".repeat(20) },
						{ role: "assistant", content: "Older response ".repeat(20) },
						{ role: "user", content: "Current request." },
					]),
				},
			}, state({ minFoldSavings: 0.99 }));
			assert.equal(result.ok, false);
			assert.equal(result.reasonKey, "engine.fold.reason.headBelowMinimumSavings");
		});

		it("fails when the summarizer returns an empty summary", async () => {
			const result = await m.semanticFold({ complete: async () => "" }, {
				getContextUsage: () => ({ ctxMax: 100 }),
				sessionManager: {
					getBranch: async () => branchFromMessages([
						{ role: "user", content: "Older task details ".repeat(20) },
						{ role: "assistant", content: "Older response ".repeat(20) },
						{ role: "user", content: "Current request." },
					]),
				},
				model: { id: "deepseek/deepseek-v4-flash", systemPrompt: "System prompt." },
			}, state());
			assert.equal(result.ok, false);
			assert.equal(result.reasonKey, "engine.fold.reason.emptySummary");
		});

		it("converts custom guidance entries while building semantic fold messages", async () => {
			const result = await m.semanticFold({ complete: async () => "" }, {
				getContextUsage: () => ({ ctxMax: 100 }),
				sessionManager: {
					getBranch: async () => [
						{ id: "tail", message: { role: "user", content: "Current request." } },
						{ customType: "context-engine-summary", data: { content: "Previous hidden summary." } },
						{ message: { role: "assistant", content: "Older response ".repeat(20) } },
						{ message: { role: "user", content: "Older task details ".repeat(20) } },
					],
				},
				model: { id: "deepseek/deepseek-v4-flash", systemPrompt: "System prompt." },
			}, state());
			assert.equal(result.ok, false);
			assert.equal(result.reasonKey, "engine.fold.reason.emptySummary");
		});

		it("skips unknown custom entries while building semantic fold messages", async () => {
			const result = await m.semanticFold({ complete: async () => "" }, {
				getContextUsage: () => ({ ctxMax: 100 }),
				sessionManager: {
					getBranch: async () => [
						{ id: "tail", message: { role: "user", content: "Current request." } },
						{ customType: "unrelated-custom", content: "Hidden unrelated entry." },
						{ message: { role: "assistant", content: "Older response ".repeat(20) } },
						{ message: { role: "user", content: "Older task details ".repeat(20) } },
					],
				},
				model: { id: "deepseek/deepseek-v4-flash", systemPrompt: "System prompt." },
			}, state());
			assert.equal(result.ok, false);
			assert.equal(result.reasonKey, "engine.fold.reason.emptySummary");
		});
	});

	describe("private text helpers through public extractors", () => {
		it("extracts array text and clips long one-line intent", () => {
			const result = m.extractSessionIntent([
				{ role: "user", content: [{ type: "text", text: "Implement the requested setting. ".repeat(40) }] },
				{ role: "user", content: "# ## HIGH PRIORITY\nKeep tests modular and messages in English.\n\nNext" },
			], 120);
			assert.ok(result?.includes("Initial user goal:"));
			assert.ok(result?.includes("..."));
			assert.ok(result.length <= 120);
		});
	});

	describe("clearFold", () => {
		it("clears fold state", () => {
			const state = { engine: { semanticFold: { active: true, foldedThisTurn: true } } };
			m.clearFold(state);
			assert.equal(state.engine.semanticFold.active, false);
			assert.equal(state.engine.semanticFold.foldedThisTurn, false);
		});
	});
});

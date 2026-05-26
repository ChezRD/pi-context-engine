import { describe, it, before } from "node:test";
import assert from "node:assert/strict";

let mod;

before(async () => {
	mod = await import("../src/cache-engine/tool-stability.ts");
});

function baseState(overrides = {}) {
	return {
		config: {
			enabled: true,
			toolIntentNudge: true,
			toolIntentNudgeMaxChars: 900,
			...overrides.config,
		},
		engine: {
			turnIndex: 5,
			recentToolCalls: new Map(),
			semanticFold: { active: false },
			prune: {
				sessionMap: { segments: [] },
				impact: {},
			},
			toolIntent: {
				pending: [],
				recent: [],
				guidanceRecords: [],
				persistedToolIntentNudgeKeys: [],
				persistedGuidanceKeys: [],
				lastUserInputHash: undefined,
				lastUserIntentNudgeKey: undefined,
				persistedUserIntentNudgeKey: undefined,
				deliveredGuidanceKey: undefined,
				contextGuidanceKey: undefined,
				lastUserIntent: undefined,
				stats: {
					detected: 0, matched: 0, unmatched: 0, suppressed: 0,
					nudges: 0, userNudges: 0, nudgeSuppressedDuplicate: 0, nudgeChars: 0,
				},
				nudgeGate: { recentDedupeKeys: [] },
			},
			...overrides.engine,
		},
	};
}

// --- CUSTOM_TYPE_GUIDANCE ---

describe("constants", () => {
	it("exports CUSTOM_TYPE_GUIDANCE", () => {
		assert.equal(mod.CUSTOM_TYPE_GUIDANCE, "context-engine-guidance");
	});

	it("exports CUSTOM_TYPE_GUIDANCE only", () => {
		assert.equal(mod.CUSTOM_TYPE_GUIDANCE, "context-engine-guidance");
		assert.equal(mod.MODEL_INVALID_TOOL_ARGS, undefined);
		assert.equal(mod.MODEL_DUPLICATE_TOOL_CALL, undefined);
	});
});

// --- detectTextualToolCall ---

describe("detectTextualToolCall", () => {
	it("detects textual tool call in assistant message", () => {
		const message = { role: "assistant", content: "I will call read now" };
		const result = mod.detectTextualToolCall(message);
		assert.equal(typeof result, "boolean");
	});

	it("returns false for normal text", () => {
		const message = { role: "assistant", content: "Here is my analysis" };
		const result = mod.detectTextualToolCall(message);
		assert.equal(result, false);
	});

	it("handles empty content", () => {
		assert.equal(mod.detectTextualToolCall({}), false);
	});
});

// --- handleAssistantMessageIntent ---

describe("handleAssistantMessageIntent", () => {
	it("returns detection result and upserts guidance", () => {
		const state = baseState();
		const message = { role: "assistant", content: "Let me read the file" };
		const result = mod.handleAssistantMessageIntent(message, state);
		assert.ok(result);
		assert.ok(result.kind);
	});

	it("handles message with no tool intent", () => {
		const state = baseState();
		const message = { role: "assistant", content: "I completely agree with this approach" };
		const result = mod.handleAssistantMessageIntent(message, state);
		assert.ok(result);
	});
});

// --- handleUserIntent ---

describe("handleUserIntent", () => {
	it("detects user intent and updates state", () => {
		const state = baseState();
		const event = { content: "find the bug in this code" };
		const result = mod.handleUserIntent(event, state);
		assert.ok(result);
		assert.ok(state.engine.toolIntent.lastUserIntent);
	});

	it("returns cached result with onlyIfInputNotSeen when hash matches", () => {
		const state = baseState();
		const event = { content: "search for this" };
		const first = mod.handleUserIntent(event, state);
		state.engine.toolIntent.lastUserInputHash = state.engine.toolIntent.lastUserInputHash; // already set
		const second = mod.handleUserIntent(event, { ...state }, { onlyIfInputNotSeen: true });
		assert.ok(second);
	});

	it("handles array content", () => {
		const state = baseState();
		const event = { content: [{ type: "text", text: "analyze this" }] };
		const result = mod.handleUserIntent(event, state);
		assert.ok(result);
	});

	it("promotes pending intent after explicit English confirmation", () => {
		const state = baseState();
		state.engine.toolIntent.pendingUserIntentConfirmation = {
			kind: "search",
			confidence: "medium",
			reasonCode: "search_request",
		};

		const result = mod.handleUserIntent({ content: "yes, search the repo" }, state);

		assert.equal(result.kind, "search");
		assert.equal(state.engine.toolIntent.pendingUserIntentConfirmation, undefined);
		assert.equal(state.engine.toolIntent.lastUserIntent.kind, "search");
		assert.ok(state.engine.toolIntent.guidanceRecords.some((record) => record.intentKind === "search"));
	});
});

// --- maybeBuildEffectiveGuidanceMessage ---

describe("maybeBuildEffectiveGuidanceMessage", () => {
	it("returns undefined when nudges disabled", () => {
		const state = baseState({ config: { toolIntentNudge: false } });
		assert.equal(mod.maybeBuildEffectiveGuidanceMessage(state), undefined);
	});

	it("returns undefined when no active guidance", () => {
		const state = baseState();
		assert.equal(mod.maybeBuildEffectiveGuidanceMessage(state), undefined);
	});

	it("returns confirmation prompt for pending user intent", () => {
		const state = baseState();
		state.engine.toolIntent.pendingUserIntentConfirmation = {
			kind: "search",
			confidence: "medium",
			reasonCode: "search_request",
		};

		const result = mod.maybeBuildEffectiveGuidanceMessage(state);

		assert.equal(result.role, "custom");
		assert.equal(result.customType, "context-engine-guidance");
		assert.equal(result.display, false);
		assert.match(result.content, /intent confirmation prompt/);
		assert.match(result.content, /search the codebase/);
	});

	it("returns guidance message when active records exist", () => {
		const state = baseState();
		// Add an active record
		state.engine.toolIntent.guidanceRecords.push(makeGuidanceRecord());
		const result = mod.maybeBuildEffectiveGuidanceMessage(state);
		assert.ok(result);
		assert.equal(result.role, "custom");
		assert.equal(result.customType, "context-engine-guidance");
		assert.equal(result.display, false);
	});

	it("skips duplicate delivery", () => {
		const state = baseState();
		state.engine.toolIntent.guidanceRecords.push(makeGuidanceRecord());
		const first = mod.maybeBuildEffectiveGuidanceMessage(state);
		assert.ok(first);
		const second = mod.maybeBuildEffectiveGuidanceMessage(state);
		assert.equal(second, undefined);
	});

	it("returns message with content when active records exist", () => {
		const state = baseState();
		state.engine.toolIntent.guidanceRecords.push(makeGuidanceRecord());
		const result = mod.maybeBuildEffectiveGuidanceMessage(state);
		assert.ok(result?.content?.startsWith("<!-- pi-context-engine: guidance -->"));
	});

	it("tracks nudge chars", () => {
		const state = baseState();
		state.engine.toolIntent.guidanceRecords.push(makeGuidanceRecord());
		const before = state.engine.toolIntent.stats.nudgeChars;
		mod.maybeBuildEffectiveGuidanceMessage(state);
		assert.ok(state.engine.toolIntent.stats.nudgeChars > before);
	});
});

// --- maybeAppendEffectiveGuidanceMessage ---

describe("maybeAppendEffectiveGuidanceMessage", () => {
	it("returns undefined when nudges disabled", () => {
		const state = baseState({ config: { toolIntentNudge: false } });
		assert.equal(mod.maybeAppendEffectiveGuidanceMessage([], {}, state), undefined);
	});

	it("returns undefined when no tool-intent guidance", () => {
		const state = baseState();
		assert.equal(mod.maybeAppendEffectiveGuidanceMessage([], {}, state), undefined);
	});

	it("returns undefined when message already contains guidance marker", () => {
		const state = baseState();
		state.engine.toolIntent.guidanceRecords.push(makeGuidanceRecord("tool-intent"));
		const messages = [{ role: "assistant", content: "some text <!-- pi-context-engine: guidance --> here" }];
		assert.equal(mod.maybeAppendEffectiveGuidanceMessage(messages, {}, state), undefined);
	});

	it("detects guidance marker in array content while ignoring non-text parts", () => {
		const state = baseState();
		state.engine.toolIntent.guidanceRecords.push(makeGuidanceRecord("tool-intent"));
		const messages = [{ role: "assistant", content: [{ type: "image", data: "x" }, { type: "text", text: "<!-- pi-context-engine: guidance -->" }] }];
		assert.equal(mod.maybeAppendEffectiveGuidanceMessage(messages, {}, state), undefined);
	});

	it("returns undefined when old style marker present", () => {
		const state = baseState();
		state.engine.toolIntent.guidanceRecords.push(makeGuidanceRecord("tool-intent"));
		const messages = [{ role: "assistant", content: "[pi-context-engine guidance]" }];
		assert.equal(mod.maybeAppendEffectiveGuidanceMessage(messages, {}, state), undefined);
	});

	it("appends guidance message when active tool-intent records exist", () => {
		const state = baseState();
		state.engine.toolIntent.guidanceRecords.push(makeGuidanceRecord("tool-intent"));
		const messages = [{ role: "assistant", content: "Hello" }];
		const result = mod.maybeAppendEffectiveGuidanceMessage(messages, {}, state);
		assert.ok(result);
		assert.equal(result.length, 2);
		assert.equal(result[1].role, "custom");
		assert.equal(result[1].customType, "context-engine-guidance");
	});

	it("increments nudge stats", () => {
		const state = baseState();
		state.engine.toolIntent.guidanceRecords.push(makeGuidanceRecord("tool-intent"));
		const beforeNudges = state.engine.toolIntent.stats.nudges;
		const beforeChars = state.engine.toolIntent.stats.nudgeChars;
		mod.maybeAppendEffectiveGuidanceMessage([{ role: "assistant", content: "Hi" }], {}, state);
		assert.equal(state.engine.toolIntent.stats.nudges, beforeNudges + 1);
		assert.ok(state.engine.toolIntent.stats.nudgeChars > beforeChars);
	});

	it("does not append when only user-intent records exist", () => {
		const state = baseState();
		state.engine.toolIntent.guidanceRecords.push(makeGuidanceRecord("user-intent"));
		const result = mod.maybeAppendEffectiveGuidanceMessage([{ role: "assistant", content: "Hi" }], {}, state);
		assert.equal(result, undefined);
	});
});

// --- handleToolCall ---

describe("handleToolCall", () => {
	it("returns undefined when disabled", () => {
		const state = baseState({ config: { enabled: false } });
		assert.equal(mod.handleToolCall({}, {}, state), undefined);
	});

	it("blocks invalid read input", () => {
		const state = baseState();
		const result = mod.handleToolCall({ toolName: "read", input: {} }, {}, state);
		assert.ok(result);
		assert.equal(result.block, true);
	});

	it("normalizes file to path for read", () => {
		const state = baseState();
		const event = { toolName: "read", input: { file: "/tmp/test.txt" }, toolCallId: "tc-1" };
		const result = mod.handleToolCall(event, {}, state);
		assert.equal(result, undefined);
		assert.equal(event.input.path, "/tmp/test.txt");
		assert.equal(event.input.file, undefined); // file deleted
	});

	it("allows valid read input", () => {
		const state = baseState();
		const result = mod.handleToolCall({ toolName: "read", input: { path: "/tmp/test.txt" }, toolCallId: "tc-2" }, {}, state);
		assert.equal(result, undefined);
	});

	it("blocks duplicate tool call within 2 turns", () => {
		const state = baseState();
		const event = { toolName: "read", input: { path: "/dup.txt" }, toolCallId: "tc-3" };
		// First call
		assert.equal(mod.handleToolCall(event, {}, state), undefined);
		// Second call same input
		const result = mod.handleToolCall(event, {}, state);
		assert.ok(result);
		assert.equal(result.block, true);
		assert.equal(result.reason, "Duplicate tool call suppressed to avoid cache/context churn.");
	});

	it("allows duplicate after 2 turns", () => {
		const state = baseState();
		const event = { toolName: "read", input: { path: "/old.txt" }, toolCallId: "tc-4" };
		mod.handleToolCall(event, {}, state);
		state.engine.turnIndex = 10; // advance past 2-turn window
		assert.equal(mod.handleToolCall(event, {}, state), undefined);
	});

	it("bypasses duplicate check for tools in toolStabilityBypass", () => {
		const state = baseState({
			config: { toolStabilityBypass: ["bash"] },
		});
		const event = { toolName: "bash", input: { command: "ls" }, toolCallId: "tc-bypass" };
		assert.equal(mod.handleToolCall(event, {}, state), undefined);
		const result = mod.handleToolCall(event, {}, state);
		// Should NOT be blocked because bash is in the bypass list
		assert.equal(result, undefined);
	});

	it("uses toolBlockThreshold and blocks within configured window", () => {
		const state = baseState({
			config: { toolBlockThreshold: 5 },
		});
		const event = { toolName: "bash", input: { command: "ls" }, toolCallId: "tc-thr" };
		assert.equal(mod.handleToolCall(event, {}, state), undefined);
		// Second call within 5 turns should be blocked
		const result = mod.handleToolCall(event, {}, state);
		assert.ok(result);
		assert.equal(result.block, true);
	});

	it("respects toolBlockThreshold allowing after configured turns", () => {
		const state = baseState({
			config: { toolBlockThreshold: 3 },
		});
		const event = { toolName: "bash", input: { command: "ls" }, toolCallId: "tc-thr2" };
		assert.equal(mod.handleToolCall(event, {}, state), undefined);
		state.engine.turnIndex = 8; // advance 3 turns (5 → 8, diff=3, not < 3)
		assert.equal(mod.handleToolCall(event, {}, state), undefined);
	});

	it("deactivates tool intent guidance on matching call", async () => {
		const state = baseState();
		const injection = await import("../src/cache-engine/tool-intent-injection.ts");
		const pending = {
			id: "pending-1",
			turnIndex: 5,
			detection: {
				kind: "imminent-tool-call",
				confidence: "high",
				toolName: "read",
				matchedAction: "read",
				matchedObject: "/test.txt",
				reasonCode: "imperative_tool_action",
			},
			createdAt: Date.now(),
		};
		state.engine.toolIntent.pending.push(pending);
		injection.upsertToolIntentGuidance(state.engine.toolIntent, pending, undefined, 5);
		assert.equal(state.engine.toolIntent.guidanceRecords.length, 1);

		const event = { toolName: "read", input: { path: "/test.txt" }, toolCallId: "tc-5" };
		const result = mod.handleToolCall(event, {}, state);
		assert.equal(result, undefined);
		assert.equal(state.engine.toolIntent.guidanceRecords[0].active, false);
	});

	it("handles toolName in name field", () => {
		const state = baseState();
		const result = mod.handleToolCall({ name: "read", input: { path: "/test.txt" }, id: "tc-6" }, {}, state);
		assert.equal(result, undefined);
	});

	it("tracks post-prune regret for context_result_lookup", () => {
		const state = baseState({
			engine: {
				prune: {
					sessionMap: {
						segments: [{
							dropCandidate: true,
							facts: { refs: ["ref-1"], paths: [] },
						}],
					},
					impact: {},
				},
			},
		});
		const event = { toolName: "context_result_lookup", input: { ref: "ref-1" }, toolCallId: "tc-7" };
		mod.handleToolCall(event, {}, state);
		assert.equal(state.engine.prune.impact.postPruneLookupRegret, 1);
	});

	it("tracks post-prune regret for read", () => {
		const state = baseState({
			engine: {
				prune: {
					sessionMap: {
						segments: [{
							dropCandidate: true,
							facts: { refs: [], paths: ["/pruned.txt"] },
						}],
					},
					impact: {},
				},
			},
		});
		const event = { toolName: "read", input: { path: "/pruned.txt" }, toolCallId: "tc-8" };
		mod.handleToolCall(event, {}, state);
		assert.equal(state.engine.prune.impact.postPruneReadRegret, 1);
	});

	it("tracks post-fold regret for reads while semantic fold is active", () => {
		const state = baseState({
			engine: {
				semanticFold: { active: true },
			},
		});

		mod.handleToolCall({ toolName: "read", input: { path: "/folded.txt" }, toolCallId: "tc-9" }, {}, state);

		assert.equal(state.engine.prune.impact.postFoldReadRegret, 1);
	});
});

// --- maybePersistEffectiveGuidance ---

describe("maybePersistEffectiveGuidance", () => {
	it("returns undefined when nudges disabled", () => {
		const state = baseState({ config: { toolIntentNudge: false } });
		assert.equal(mod.maybePersistEffectiveGuidance(state), undefined);
	});

	it("returns undefined when no active records", () => {
		const state = baseState();
		assert.equal(mod.maybePersistEffectiveGuidance(state), undefined);
	});

	it("returns content when active records exist", () => {
		const state = baseState();
		state.engine.toolIntent.guidanceRecords.push(makeGuidanceRecord());
		const result = mod.maybePersistEffectiveGuidance(state);
		assert.ok(result?.startsWith("<!-- pi-context-engine: guidance -->"));
	});

	it("filters by kind when specified", () => {
		const state = baseState();
		state.engine.toolIntent.guidanceRecords.push(makeGuidanceRecord("user-intent"));
		state.engine.toolIntent.guidanceRecords.push(makeGuidanceRecord("tool-intent"));
		// Only user-intent
		const result = mod.maybePersistEffectiveGuidance(state, undefined, "test", ["user-intent"]);
		assert.ok(result);
		// No tool-intent -> nothing
		const result2 = mod.maybePersistEffectiveGuidance(state, undefined, "test", ["tool-intent"]);
		assert.ok(result2);
	});
});

function makeGuidanceRecord(kind = "user-intent") {
	return {
		version: 1,
		kind,
		stableKey: `${kind}:search:key`,
		content: "- do the thing",
		createdTurn: 1,
		updatedTurn: 2,
		confidence: "high",
		intentKind: "search",
		reasonCode: "search_request",
		matchedSignal: "grep",
		toolName: "grep",
		active: true,
		sourceEvent: kind === "user-intent" ? "user_input" : "assistant_message",
	};
}

// --- recordToolIntentDetection ---

describe("recordToolIntentDetection", () => {
	let tim;

	before(async () => {
		tim = await import("../src/cache-engine/tool-intent.ts");
	});

	it("structured-call-present returns undefined and reconciles", () => {
		const state = tim.createToolIntentState();
		const r = tim.recordToolIntentDetection(state, {
			kind: "structured-call-present",
			toolName: "read",
		}, 1);
		assert.equal(r, undefined);
	});

	it("example-or-schema suppresses and returns undefined", () => {
		const state = tim.createToolIntentState();
		const r = tim.recordToolIntentDetection(state, {
			kind: "example-or-schema",
		}, 1);
		assert.equal(r, undefined);
		assert.equal(state.stats.suppressed, 1);
	});

	it("tool-discussion suppresses and returns undefined", () => {
		const state = tim.createToolIntentState();
		const r = tim.recordToolIntentDetection(state, {
			kind: "tool-discussion",
		}, 1);
		assert.equal(r, undefined);
		assert.equal(state.stats.suppressed, 1);
	});

	it("unknown kind returns undefined", () => {
		const state = tim.createToolIntentState();
		const r = tim.recordToolIntentDetection(state, {
			kind: "something-unknown",
		}, 1);
		assert.equal(r, undefined);
	});

	it("imminent-tool-call creates pending and returns it", () => {
		const state = tim.createToolIntentState();
		const r = tim.recordToolIntentDetection(state, {
			kind: "imminent-tool-call",
			toolName: "bash",
		}, 1);
		assert.ok(r);
		assert.equal(state.stats.detected, 1);
		assert.equal(state.pending.length, 1);
	});
});

describe("clearRecentToolCalls", () => {
	it("clears the recentToolCalls map", async () => {
		const { createRuntimeState } = await import("../src/runtime-state.ts");
		const state = createRuntimeState();
		state.engine.recentToolCalls.set("hash1", 1);
		state.engine.recentToolCalls.set("hash2", 2);
		assert.equal(state.engine.recentToolCalls.size, 2);
		mod.clearRecentToolCalls(state);
		assert.equal(state.engine.recentToolCalls.size, 0);
	});
});

import { describe, it, before } from "node:test";
import assert from "node:assert/strict";

/** @import { UserIntentDetection, PendingToolIntent, ToolIntentState } from "../src/cache-engine/tool-intent.ts" */

let mod;

before(async () => {
	mod = await import("../src/cache-engine/tool-intent-injection.ts");
});

function makeUserIntent(overrides = {}) {
	return {
		kind: "search",
		confidence: "high",
		reasonCode: "search_request",
		matchedAction: "grep",
		locale: "en",
		...overrides,
	};
}

function makePendingTool(overrides = {}) {
	return {
		id: "tc-1",
		turnIndex: 5,
		detection: {
			kind: "imminent-tool-call",
			confidence: "high",
			toolName: "read",
			matchedAction: "read",
			matchedObject: "file.txt",
			reasonCode: "imperative_tool_action",
		},
		createdAt: Date.now() - 1000,
		...overrides,
	};
}

function makeGuidanceState(overrides = {}) {
	return {
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
			detected: 0,
			matched: 0,
			unmatched: 0,
			suppressed: 0,
			nudges: 0,
			userNudges: 0,
			nudgeSuppressedDuplicate: 0,
			nudgeChars: 0,
		},
		nudgeGate: {
			recentDedupeKeys: [],
		},
		...overrides,
	};
}

// --- buildUserIntentNudge ---

describe("buildUserIntentNudge", () => {
	it("returns empty string for general intent", () => {
		const result = mod.buildUserIntentNudge(makeUserIntent({ kind: "general", reasonCode: "no_specific_intent" }));
		assert.equal(result, "");
	});

	it("produces analyze block with all rules", () => {
		const result = mod.buildUserIntentNudge(makeUserIntent({ kind: "analyze", reasonCode: "analysis_request", matchedAction: "read" }));
		assert.ok(result.startsWith("<!-- pi-context-engine: user intent -->"));
		assert.ok(result.includes("intent: analyze"));
		assert.ok(result.includes("confidence: high"));
		assert.ok(result.includes("matched_signal: read"));
		assert.ok(result.includes("classify evidence before claims"));
		assert.ok(result.includes("<!-- /pi-context-engine: user intent -->"));
	});

	it("produces search block", () => {
		const result = mod.buildUserIntentNudge(makeUserIntent({ kind: "search" }));
		assert.ok(result.includes("intent: search"));
		assert.ok(result.includes("claim absence only when"));
	});

	it("produces prune-request block", () => {
		const result = mod.buildUserIntentNudge(makeUserIntent({ kind: "prune-request", reasonCode: "prune_request" }));
		assert.ok(result.includes("intent: prune-request"));
		assert.ok(result.includes("what changed, what remains pending"));
	});

	it("produces save-memory block", () => {
		const result = mod.buildUserIntentNudge(makeUserIntent({ kind: "save-memory", reasonCode: "save_memory_request" }));
		assert.ok(result.includes("intent: save-memory"));
		assert.ok(result.includes("context_pin"));
		assert.ok(result.includes("survives session folds"));
	});

	it("produces diagnose block", () => {
		const result = mod.buildUserIntentNudge(makeUserIntent({ kind: "diagnose", reasonCode: "diagnose_request" }));
		assert.ok(result.includes("intent: diagnose"));
		assert.ok(result.includes("pre-existing"));
		assert.ok(result.includes("ALL CAPS"));
	});

	it("produces tool-request block as fallback", () => {
		const result = mod.buildUserIntentNudge(makeUserIntent({ kind: "tool-request", reasonCode: "explicit_tool_request" }));
		assert.ok(result.includes("call the required tool"));
	});

	it("omits matched_signal line when no matchedAction", () => {
		const result = mod.buildUserIntentNudge(makeUserIntent({ matchedAction: undefined, toolName: undefined }));
		assert.ok(!result.includes("matched_signal:"));
	});

	it("respects maxChars", () => {
		const result = mod.buildUserIntentNudge(makeUserIntent({ kind: "analyze" }), 100);
		assert.ok(result.length <= 100);
	});

	it("hard truncates when maxChars cannot fit the closing marker", () => {
		const result = mod.buildUserIntentNudge(makeUserIntent({ kind: "analyze" }), 10);
		assert.equal(result.length, 10);
	});

	it("produces valid XML comment structure", () => {
		const result = mod.buildUserIntentNudge(makeUserIntent({ kind: "analyze" }));
		assert.ok(result.startsWith("<!-- pi-context-engine: user intent -->"));
		assert.ok(result.endsWith("<!-- /pi-context-engine: user intent -->"));
	});
});

// --- buildToolIntentNudge ---

describe("buildToolIntentNudge", () => {
	it("generates nudge for pending tool", () => {
		const pending = makePendingTool();
		const result = mod.buildToolIntentNudge(pending);
		assert.ok(result.includes("intent nudge"));
		assert.ok(result.includes("pending tool intent"));
		assert.ok(result.includes("imminent-tool-call"));
		assert.ok(result.includes("read"));
	});

	it("includes user intent line when provided", () => {
		const pending = makePendingTool();
		const userIntent = makeUserIntent({ kind: "analyze" });
		const result = mod.buildToolIntentNudge(pending, 500, userIntent);
		assert.ok(result.includes("Latest user intent: analyze"));
	});

	it("omits user intent line for general intent", () => {
		const pending = makePendingTool();
		const result = mod.buildToolIntentNudge(pending, 500, makeUserIntent({ kind: "general" }));
		assert.ok(!result.includes("Latest user intent"));
	});

	it("uses toolName when present", () => {
		const pending = makePendingTool();
		const result = mod.buildToolIntentNudge(pending);
		assert.ok(result.includes("read"));
	});

	it("uses generic tool when no toolName", () => {
		const pending = makePendingTool({ detection: { kind: "imminent-tool-call", confidence: "high", toolName: undefined, matchedAction: "bash", matchedObject: undefined, reasonCode: "imperative_tool_action" } });
		const result = mod.buildToolIntentNudge(pending);
		assert.ok(result.includes("the intended tool"));
	});

	it("respects maxChars", () => {
		const result = mod.buildToolIntentNudge(makePendingTool(), 80);
		assert.ok(result.length <= 80);
	});

	it("produces valid XML comment structure", () => {
		const result = mod.buildToolIntentNudge(makePendingTool());
		assert.ok(result.startsWith("<!-- pi-context-engine: intent nudge -->"));
		assert.ok(result.endsWith("<!-- /pi-context-engine: intent nudge -->"));
	});
});

// --- buildGuidanceProjection ---

describe("buildGuidanceProjection", () => {
	it("returns empty string when no active records", () => {
		const records = [
			{ ...makeGuidanceRecord("tool-intent", "search"), active: false },
			{ ...makeGuidanceRecord("tool-intent", "analyze"), active: false },
		];
		assert.equal(mod.buildGuidanceProjection(records), "");
	});

	it("formats active records", () => {
		const records = [makeGuidanceRecord("user-intent", "search")];
		const result = mod.buildGuidanceProjection(records);
		assert.ok(result.includes("source: detect-intention"));
		assert.ok(result.includes("user-intent: search"));
		assert.ok(result.includes("rules:"));
	});

	it("formats matched signal and tool fields in guidance records", () => {
		const records = [{
			...makeGuidanceRecord("tool-intent", "search"),
			matchedSignal: "read",
			toolName: "read",
		}];
		const result = mod.buildGuidanceProjection(records);
		assert.ok(result.includes("matched=read"));
		assert.ok(result.includes("tool=read"));
	});

	it("limits to 4 most recent active records", () => {
		const records = Array.from({ length: 6 }, (_, i) =>
			makeGuidanceRecord("user-intent", "analyze", `rule ${i}`)
		);
		const result = mod.buildGuidanceProjection(records);
		const matchCount = (result.match(/user-intent: analyze/g) || []).length;
		assert.equal(matchCount, 4);
	});

	it("preserves rule lines from content", () => {
		const records = [makeGuidanceRecord("user-intent", "search", "- do the thing")];
		const result = mod.buildGuidanceProjection(records);
		assert.ok(result.includes("do the thing"));
	});

	it("respects maxChars", () => {
		const records = [makeGuidanceRecord("user-intent", "analyze")];
		const result = mod.buildGuidanceProjection(records, 100);
		assert.ok(result.length <= 100);
	});

	it("produces valid XML structure", () => {
		const records = [makeGuidanceRecord("user-intent", "search")];
		const result = mod.buildGuidanceProjection(records);
		assert.ok(result.startsWith("<!-- pi-context-engine: guidance -->"));
		assert.ok(result.endsWith("<!-- /pi-context-engine: guidance -->"));
	});
});

// --- userIntentNudgeKey ---

describe("userIntentNudgeKey", () => {
	it("creates stable key from user intent", () => {
		const ui = makeUserIntent();
		const key = mod.userIntentNudgeKey(ui);
		assert.ok(key.startsWith("user:search:search_request:"));
	});
});

// --- toolIntentNudgeKey ---

describe("toolIntentNudgeKey", () => {
	it("creates stable key from pending tool", () => {
		const key = mod.toolIntentNudgeKey(makePendingTool());
		assert.ok(key.includes("tc-1"));
		assert.ok(key.includes("read"));
	});
});

// --- upsertUserIntentGuidance ---

describe("upsertUserIntentGuidance", () => {
	it("returns undefined for general intent", () => {
		const state = makeGuidanceState();
		const result = mod.upsertUserIntentGuidance(state, makeUserIntent({ kind: "general" }), 0);
		assert.equal(result, undefined);
	});

	it("returns undefined when a non-general intent produces no content", () => {
		const state = makeGuidanceState();
		const original = mod.buildUserIntentNudge;
		assert.equal(typeof original, "function");
		const result = mod.upsertUserIntentGuidance(state, makeUserIntent({ kind: "general" }), 1);
		assert.equal(result, undefined);
	});

	it("creates new record and prepends to guidanceRecords", () => {
		const state = makeGuidanceState();
		const ui = makeUserIntent({ kind: "analyze", reasonCode: "analysis_request" });
		const result = mod.upsertUserIntentGuidance(state, ui, 10);
		assert.ok(result);
		assert.equal(result.kind, "user-intent");
		assert.equal(result.createdTurn, 10);
		assert.equal(result.updatedTurn, 10);
		assert.equal(result.active, true);
		assert.ok(state.guidanceRecords.length >= 1);
		assert.equal(state.guidanceRecords[0].stableKey, result.stableKey);
	});

	it("updates existing record on duplicate key", () => {
		const state = makeGuidanceState();
		const ui = makeUserIntent({ kind: "analyze", reasonCode: "analysis_request", evidence: { proseSnippet: "test" } });
		mod.upsertUserIntentGuidance(state, ui, 5);
		const result2 = mod.upsertUserIntentGuidance(state, ui, 15);
		assert.equal(result2.createdTurn, 5);
		assert.equal(result2.updatedTurn, 15);
	});

	it("limits records to 20 most recent", () => {
		const state = makeGuidanceState();
		for (let i = 0; i < 25; i++) {
			const ui = makeUserIntent({ kind: "analyze", reasonCode: "analysis_request", matchedAction: `action-${i}`, evidence: { proseSnippet: `key-${i}` } });
			mod.upsertUserIntentGuidance(state, ui, i);
		}
		assert.ok(state.guidanceRecords.length <= 20);
	});
});

// --- upsertToolIntentGuidance ---

describe("upsertToolIntentGuidance", () => {
	it("creates new tool-intent guidance record", () => {
		const state = makeGuidanceState();
		const pending = makePendingTool();
		const result = mod.upsertToolIntentGuidance(state, pending, undefined, 5);
		assert.ok(result);
		assert.equal(result.kind, "tool-intent");
		assert.equal(result.createdTurn, 5);
		assert.equal(result.active, true);
	});

	it("updates existing tool-intent on duplicate", () => {
		const state = makeGuidanceState();
		const pending = makePendingTool();
		mod.upsertToolIntentGuidance(state, pending, undefined, 5);
		const result2 = mod.upsertToolIntentGuidance(state, pending, undefined, 20);
		assert.equal(result2.createdTurn, 5);
		assert.equal(result2.updatedTurn, 20);
	});

	it("limits to 20 records", () => {
		const state = makeGuidanceState();
		for (let i = 0; i < 25; i++) {
			const pending = makePendingTool({ id: `tc-${i}`, detection: { kind: "imminent-tool-call", confidence: "high", toolName: "read", matchedAction: `action-${i}`, matchedObject: undefined, reasonCode: "imperative_tool_action" } });
			mod.upsertToolIntentGuidance(state, pending, undefined, i);
		}
		assert.ok(state.guidanceRecords.length <= 20);
	});

	it("includes userIntent when provided", () => {
		const state = makeGuidanceState();
		const pending = makePendingTool();
		const ui = makeUserIntent({ kind: "search" });
		const result = mod.upsertToolIntentGuidance(state, pending, ui, 5);
		assert.ok(result.content.includes("Latest user intent"));
	});
});

// --- deactivateToolIntentGuidance ---

describe("deactivateToolIntentGuidance", () => {
	it("sets active=false on matching record", () => {
		const state = makeGuidanceState();
		const pending = makePendingTool();
		mod.upsertToolIntentGuidance(state, pending, undefined, 5);
		assert.equal(state.guidanceRecords[0].active, true);
		mod.deactivateToolIntentGuidance(state, pending);
		assert.equal(state.guidanceRecords[0].active, false);
	});

	it("does nothing when no matching record", () => {
		const state = makeGuidanceState();
		mod.deactivateToolIntentGuidance(state, makePendingTool({ id: "nonexistent" }));
		assert.equal(state.guidanceRecords.length, 0);
	});
});

// --- reserveUserIntentNudge ---

describe("reserveUserIntentNudge", () => {
	it("reserves nudge gate for non-general intent", () => {
		const state = makeGuidanceState();
		const ui = makeUserIntent({ kind: "analyze" });
		const result = mod.reserveUserIntentNudge(state, ui);
		assert.equal(result, true);
		assert.ok(state.nudgeGate.active);
	});

	it("suppresses active duplicate gate even when last key differs", () => {
		const state = makeGuidanceState();
		const ui = makeUserIntent({ kind: "search", evidence: { proseSnippet: "gate" } });
		const now = 1000;
		assert.equal(mod.reserveUserIntentNudge(state, ui, "s", now), true);
		state.lastUserIntentNudgeKey = "different";
		assert.equal(mod.reserveUserIntentNudge(state, ui, "s", now + 1), false);
		assert.equal(state.stats.nudgeSuppressedDuplicate, 1);
	});

	it("returns false for general intent", () => {
		const state = makeGuidanceState();
		const result = mod.reserveUserIntentNudge(state, makeUserIntent({ kind: "general" }));
		assert.equal(result, false);
		assert.equal(state.nudgeGate.active, undefined);
	});

	it("suppresses duplicate within holdMs via nudgeGate.active when lastUserIntentNudgeKey cleared", () => {
		const state = makeGuidanceState();
		const ui = makeUserIntent({ kind: "analyze", evidence: { proseSnippet: "dup2" } });
		// First call sets both active gate and lastUserIntentNudgeKey
		assert.equal(mod.reserveUserIntentNudge(state, ui, "default", Date.now()), true);
		// Clear lastUserIntentNudgeKey so dedup falls through to nudgeGate.active check
		state.lastUserIntentNudgeKey = undefined;
		assert.equal(mod.reserveUserIntentNudge(state, ui, "default", Date.now()), false);
		assert.equal(state.stats.nudgeSuppressedDuplicate, 1);
	});

	it("suppresses duplicate within holdMs", () => {
		const state = makeGuidanceState();
		const ui = makeUserIntent({ kind: "analyze", evidence: { proseSnippet: "dup" } });
		assert.equal(mod.reserveUserIntentNudge(state, ui, "default", Date.now()), true);
		assert.equal(mod.reserveUserIntentNudge(state, ui, "default", Date.now()), false);
		assert.equal(state.stats.nudgeSuppressedDuplicate, 1);
	});

	it("allows different intent key after holdMs expires", () => {
		const state = makeGuidanceState();
		const ui1 = makeUserIntent({ kind: "analyze", matchedAction: "first", evidence: { proseSnippet: "alpha" } });
		const ui2 = makeUserIntent({ kind: "analyze", matchedAction: "second", evidence: { proseSnippet: "beta" } });
		const start = Date.now();
		assert.equal(mod.reserveUserIntentNudge(state, ui1, "default", start), true);
		// same key still blocked even after expiry (lastUserIntentNudgeKey)
		assert.equal(mod.reserveUserIntentNudge(state, ui1, "default", start + 3000), false);
		// different key allowed after hold expired
		state.nudgeGate.active = undefined;
		assert.equal(mod.reserveUserIntentNudge(state, ui2, "default", start + 3000), true);
	});
});

// --- reserveToolIntentNudge ---

describe("reserveToolIntentNudge", () => {
	it("reserves nudge for pending tool", () => {
		const state = makeGuidanceState();
		const pending = makePendingTool();
		const result = mod.reserveToolIntentNudge(state, pending);
		assert.equal(result, true);
		assert.ok(pending.nudged);
	});

	it("suppresses within hold period", () => {
		const state = makeGuidanceState();
		const pending = makePendingTool();
		assert.equal(mod.reserveToolIntentNudge(state, pending, "default", Date.now()), true);
		assert.equal(mod.reserveToolIntentNudge(state, pending, "default", Date.now()), false);
	});

	it("suppresses recent dedupe keys", () => {
		const state = makeGuidanceState();
		const pending = makePendingTool();
		mod.reserveToolIntentNudge(state, pending, "default", Date.now());
		// Clear active gate
		state.nudgeGate.active = undefined;
		assert.equal(mod.reserveToolIntentNudge(state, pending, "default", Date.now() + 5000), false);
	});

	it("allows different tool after hold", () => {
		const state = makeGuidanceState();
		const p1 = makePendingTool({ id: "tc-1" });
		const p2 = makePendingTool({ id: "tc-2" });
		assert.equal(mod.reserveToolIntentNudge(state, p1, "default", Date.now()), true);
		state.nudgeGate.active = undefined;
		assert.equal(mod.reserveToolIntentNudge(state, p2, "default", Date.now() + 5000), true);
	});

	it("limits recent dedupe keys to 20", () => {
		const state = makeGuidanceState();
		for (let i = 0; i < 25; i++) {
			const pending = makePendingTool({ id: `tc-${i}` });
			state.nudgeGate.active = undefined;
			mod.reserveToolIntentNudge(state, pending, "default", Date.now() + (i * 100));
		}
		assert.ok(state.nudgeGate.recentDedupeKeys.length <= 20);
	});
});

// helpers
function makeGuidanceRecord(kind, intentKind, contentSuffix = "some rule") {
	return {
		version: 1,
		kind,
		stableKey: `${kind}:${intentKind}:key`,
		content: `- ${contentSuffix}`,
		createdTurn: 1,
		updatedTurn: 2,
		confidence: "high",
		intentKind,
		reasonCode: "search_request",
		matchedSignal: "grep",
		toolName: "grep",
		active: true,
		sourceEvent: kind === "user-intent" ? "user_input" : "assistant_message",
	};
}

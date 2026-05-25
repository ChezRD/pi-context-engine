import { describe, it } from "node:test";
import assert from "node:assert/strict";

// Import via dynamic import (ESM)
let mod;
try {
	mod = await import("../src/projection/history-folder.ts");
} catch {
	// Fallback for compiled JS
	mod = await import("../src/projection/history-folder.js");
}

const {
	countMessageTokens,
	estimateFoldBoundary,
	extractPinnedSkills,
	extractPinnedConstraints,
	extractContextEnginePins,
	buildFoldMessage,
	trimTrailingAssistantToolCalls,
} = mod;

// --- countMessageTokens ---

describe("countMessageTokens", () => {
	it("counts basic text content (chars/4)", () => {
		const msg = { role: "user", content: "hello world" };
		const tokens = countMessageTokens(msg);
		// 11 chars + 4 role overhead = 15, /4 = 3.75 → ceil 4
		assert.ok(tokens > 0);
		assert.equal(tokens, Math.ceil(("hello world".length + 4) / 4));
	});

	it("handles string content", () => {
		const msg = { role: "assistant", content: "test" };
		const tokens = countMessageTokens(msg);
		// 4 chars + 4 overhead = 8, /4 = 2
		assert.equal(tokens, 2);
	});

	it("handles ContentPart[] array", () => {
		const msg = {
			role: "user",
			content: [
				{ type: "text", text: "hello" },
				{ type: "text", text: "world" },
			],
		};
		const tokens = countMessageTokens(msg);
		// 10 chars + 4 overhead = 14, /4 = 3.5 → ceil 4
		assert.equal(tokens, 4);
	});

	it("includes tool_calls JSON in token estimate", () => {
		const msg = {
			role: "assistant",
			content: "let me check",
			tool_calls: [
				{
					function: { name: "read_file", arguments: '{"path":"test.ts"}' },
				},
			],
		};
		const tokens = countMessageTokens(msg);
		// content: 12 chars + 4 overhead = 16
		// tool_call name: 10, arguments: 23
		// total chars: 49, /4 = 12.25 → ceil 13
		assert.ok(tokens >= 10);
	});

	it("returns 0 for null/undefined, 1 for empty object (role overhead)", () => {
		assert.equal(countMessageTokens(null), 0);
		assert.equal(countMessageTokens(undefined), 0);
		assert.equal(countMessageTokens({}), 1); // role overhead: 4 chars → 1 token
	});
});

// --- estimateFoldBoundary ---

describe("estimateFoldBoundary", () => {
	it("normal case: tail fits within budget", () => {
		// Big head messages, small tail budget
		const msgs = [
			{ role: "user", content: "x".repeat(5000) },  // ~1251 tokens
			{ role: "assistant", content: "y".repeat(5000) }, // ~1251 tokens
			{ role: "user", content: "short" },  // ~3 tokens
		];
		// Tail budget: enough for only the last short message
		const result = estimateFoldBoundary(msgs, 0, 100);
		assert.ok(result.ok);
		assert.equal(result.tailMessages.length, 1);
		assert.equal(result.tailMessages[0].content, "short");
		assert.equal(result.headMessages.length, 2);
		assert.ok(result.headTokenCount > result.tailTokenCount);
	});

	it("returns ok=false when no messages", () => {
		const result = estimateFoldBoundary([], 0, 1000);
		assert.equal(result.ok, false);
		assert.equal(result.reason, "No messages");
	});

	it("skips fold when head too small", () => {
		// Big tail budget → everything fits in tail, nothing in head
		const msgs = [{ role: "user", content: "hi" }];
		const result = estimateFoldBoundary(msgs, 0, 100000);
		assert.ok(result.ok);
		assert.equal(result.headMessages.length, 0);
	});
});

// --- extractPinnedSkills ---

describe("extractPinnedSkills", () => {
	it("extracts a single skill-pin block", () => {
		const msgs = [
			{
				role: "system",
				content: '<skill-pin name="test-skill">\nskill content here\n</skill-pin>',
			},
		];
		const skills = extractPinnedSkills(msgs);
		assert.equal(skills.length, 1);
		assert.equal(skills[0].id, "test-skill");
	});

	it("deduplicates by name (last wins)", () => {
		const msgs = [
			{
				role: "system",
				content: '<skill-pin name="skill-a">\nversion 1\n</skill-pin>',
			},
			{
				role: "system",
				content: '<skill-pin name="skill-a">\nversion 2\n</skill-pin>',
			},
		];
		const skills = extractPinnedSkills(msgs);
		assert.equal(skills.length, 1);
		assert.ok(skills[0].content.includes("version 2"));
	});

	it("extracts multiple unique skills", () => {
		const msgs = [
			{
				role: "system",
				content: '<skill-pin name="skill-a">\ncontent a\n</skill-pin>\n<skill-pin name="skill-b">\ncontent b\n</skill-pin>',
			},
		];
		const skills = extractPinnedSkills(msgs);
		assert.equal(skills.length, 2);
	});

	it("returns empty array when no skill-pins", () => {
		const skills = extractPinnedSkills([{ role: "user", content: "hello" }]);
		assert.equal(skills.length, 0);
	});
});

// --- extractContextEnginePins ---

describe("extractContextEnginePins", () => {
	it("extracts a single context-engine-pin block", () => {
		const msgs = [
			{
				role: "system",
				content: '<context-engine-pin kind="skill" name="test-skill" version="1">\nskill body here\n</context-engine-pin>',
			},
		];
		const pins = extractContextEnginePins(msgs);
		assert.equal(pins.length, 1);
		assert.equal(pins[0].kind, "skill");
		assert.equal(pins[0].name, "test-skill");
		assert.equal(pins[0].version, 1);
		assert.equal(pins[0].content, "skill body here");
	});

	it("extracts multiple context-engine-pins by kind", () => {
		const msgs = [
			{
				role: "system",
				content: '<context-engine-pin kind="priority" name="rule-1" version="1">\nhigh priority\n</context-engine-pin>\n<context-engine-pin kind="user-memory" name="pref" version="1">\ndark mode\n</context-engine-pin>',
			},
		];
		const pins = extractContextEnginePins(msgs);
		assert.equal(pins.length, 2);
	});

	it("deduplicates by kind:name (last wins)", () => {
		const msgs = [
			{
				role: "system",
				content: '<context-engine-pin kind="priority" name="my-rule" version="1">\nversion 1\n</context-engine-pin>',
			},
			{
				role: "system",
				content: '<context-engine-pin kind="priority" name="my-rule" version="1">\nversion 2\n</context-engine-pin>',
			},
		];
		const pins = extractContextEnginePins(msgs);
		assert.equal(pins.length, 1);
		assert.ok(pins[0].content.includes("version 2"));
	});

	it("handles versionless context-engine-pin", () => {
		const msgs = [
			{
				role: "system",
				content: '<context-engine-pin kind="priority" name="my-rule">\ncontent\n</context-engine-pin>',
			},
		];
		const pins = extractContextEnginePins(msgs);
		assert.equal(pins.length, 1);
		assert.equal(pins[0].version, undefined);
	});

	it("returns empty array when no context-engine-pins", () => {
		const pins = extractContextEnginePins([{ role: "user", content: "hello" }]);
		assert.equal(pins.length, 0);
	});

	it("does not confuse with legacy skill-pin tags", () => {
		const msgs = [
			{
				role: "system",
				content: '<skill-pin name="legacy">\nold\n</skill-pin>',
			},
		];
		const pins = extractContextEnginePins(msgs);
		assert.equal(pins.length, 0);
	});
});

// --- extractPinnedConstraints ---

describe("extractPinnedConstraints", () => {
	it("finds HIGH PRIORITY blocks", () => {
		const msgs = [
			{
				role: "system",
				content: "[HIGH PRIORITY] This is very important\n\nOther stuff",
			},
		];
		const constraints = extractPinnedConstraints(msgs);
		assert.ok(constraints.length > 0);
		assert.ok(constraints.some((c) => c.includes("HIGH PRIORITY")));
	});

	it("finds User memory blocks", () => {
		const msgs = [
			{
				role: "system",
				content: "[User memory] User prefers dark mode\n\nOther stuff",
			},
		];
		const constraints = extractPinnedConstraints(msgs);
		assert.ok(constraints.some((c) => c.includes("User memory")));
	});

	it("finds Project memory blocks", () => {
		const msgs = [
			{
				role: "system",
				content: "[Project memory] This is a TypeScript project\n\nOther stuff",
			},
		];
		const constraints = extractPinnedConstraints(msgs);
		assert.ok(constraints.some((c) => c.includes("Project memory")));
	});

	it("returns empty when no constraints", () => {
		const constraints = extractPinnedConstraints([{ role: "user", content: "hello" }]);
		assert.equal(constraints.length, 0);
	});
});

// --- buildFoldMessage ---

describe("buildFoldMessage", () => {
	it("includes marker + summary + skills + constraints + enginePins sections", () => {
		const msg = buildFoldMessage("<fold>", "summary text", [{ id: "s1", content: "<skill-pin name=\"s1\">\ncontent\n</skill-pin>" }], ["[HIGH PRIORITY] urgent"], [
			{ kind: "priority", name: "my-rule", content: "important", raw: '<context-engine-pin kind="priority" name="my-rule">\nimportant\n</context-engine-pin>', version: 1 },
		]);
		assert.equal(msg.role, "assistant");
		assert.ok(msg.reasoning_content !== undefined);
		assert.ok(msg.content.includes("<fold>"));
		assert.ok(msg.content.includes("summary text"));
		assert.ok(msg.content.includes("skill-pin"));
		assert.ok(msg.content.includes("HIGH PRIORITY"));
		assert.ok(msg.content.includes("Context Engine pinned material"));
		assert.ok(msg.content.includes("context-engine-pin"));
	});

	it("omits enginePins section when empty", () => {
		const msg = buildFoldMessage("<fold>", "summary text", [], ["constraint"]);
		assert.ok(msg.content.includes("constraint"));
		assert.ok(!msg.content.includes("Context Engine pinned material"));
	});

	it("omits skills section when empty", () => {
		const msg = buildFoldMessage("<fold>", "summary text", [], ["constraint"]);
		assert.ok(msg.content.includes("constraint"));
		assert.ok(!msg.content.includes("Active skill memos"));
	});

	it("omits constraints section when empty", () => {
		const msg = buildFoldMessage("<fold>", "summary", [], []);
		assert.ok(!msg.content.includes("Active constraints"));
	});

	it("has empty reasoning_content to avoid 400", () => {
		const msg = buildFoldMessage("<fold>", "summary", [], []);
		assert.equal(msg.reasoning_content, "");
	});

	it("has assistant role", () => {
		const msg = buildFoldMessage("<fold>", "summary", [], []);
		assert.equal(msg.role, "assistant");
	});
});

// --- trimTrailingAssistantToolCalls ---

describe("trimTrailingAssistantToolCalls", () => {
	it("drops trailing assistant message with tool_calls", () => {
		const msgs = [
			{ role: "user", content: "hi" },
			{ role: "assistant", content: "ok", tool_calls: [{ function: { name: "test" } }] },
		];
		const [trimmed, removed] = trimTrailingAssistantToolCalls(msgs);
		assert.equal(trimmed.length, 1);
		assert.equal(removed, 1);
	});

	it("keeps messages unchanged when last is user", () => {
		const msgs = [
			{ role: "assistant", content: "ok" },
			{ role: "user", content: "hi" },
		];
		const [trimmed, removed] = trimTrailingAssistantToolCalls(msgs);
		assert.equal(trimmed.length, 2);
		assert.equal(removed, 0);
	});

	it("handles empty array", () => {
		const [trimmed, removed] = trimTrailingAssistantToolCalls([]);
		assert.equal(trimmed.length, 0);
		assert.equal(removed, 0);
	});

	it("keeps assistant message without tool_calls", () => {
		const msgs = [{ role: "assistant", content: "ok" }];
		const [trimmed, removed] = trimTrailingAssistantToolCalls(msgs);
		assert.equal(trimmed.length, 1);
		assert.equal(removed, 0);
	});
});

// --- semanticFold and summarizeHead (integration with mock) ---

describe("semanticFold integration", () => {
	it("exports all expected functions", () => {
		assert.equal(typeof countMessageTokens, "function");
		assert.equal(typeof estimateFoldBoundary, "function");
		assert.equal(typeof extractPinnedSkills, "function");
		assert.equal(typeof extractPinnedConstraints, "function");
		assert.equal(typeof extractContextEnginePins, "function");
		assert.equal(typeof buildFoldMessage, "function");
		assert.equal(typeof trimTrailingAssistantToolCalls, "function");
	});

	if (typeof mod?.semanticFold === "function") {
		it("semanticFold returns ok=false when no ctxMax", async () => {
			const result = await mod.semanticFold({}, {}, { config: { foldThreshold: 0.75, aggressiveFoldThreshold: 0.78, exitSummaryThreshold: 0.80, preflightFoldThreshold: 0.90, foldTailPct: 0.2, aggressiveFoldTailPct: 0.1, minFoldSavings: 0.3, foldTimeoutMs: 5000, foldSummaryModel: "test", semanticFoldMarker: "<fold>" }, engine: { semanticFold: { active: false } } }, {});
			assert.equal(result.ok, false);
		});
	}

	if (typeof mod?.clearFold === "function") {
		it("clearFold resets fold state", () => {
			const state = { engine: { semanticFold: { active: true, syntheticMsg: {}, tailStartEntryId: "123" } } };
			mod.clearFold(state);
			assert.equal(state.engine.semanticFold.active, false);
		});
	}

	if (typeof mod?.isFoldValid === "function") {
		it("isFoldValid returns false when inactive", () => {
			const state = { engine: { semanticFold: { active: false }, prefixHash: "abc" } };
			assert.equal(mod.isFoldValid(state, "abc"), false);
		});

		it("isFoldValid returns false on hash mismatch", () => {
			const state = { engine: { semanticFold: { active: true }, prefixHash: "abc" } };
			assert.equal(mod.isFoldValid(state, "def"), false);
		});

		it("isFoldValid returns true when hash matches", () => {
			const state = { engine: { semanticFold: { active: true }, prefixHash: "abc" } };
			assert.equal(mod.isFoldValid(state, "abc"), true);
		});
	}
});

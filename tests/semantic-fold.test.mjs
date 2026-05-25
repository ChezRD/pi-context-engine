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
	extractSessionIntent,
	buildFoldMessage,
	trimTrailingAssistantToolCalls,
	summarizeHead,
	semanticFold,
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

	it("returns 1 token when only role is present", () => {
		assert.equal(countMessageTokens({ role: "assistant" }), 1);
	});

	it("ignores non-text multimodal and tool-use content parts", () => {
		const tokens = countMessageTokens({
			role: "user",
			content: [
				{ type: "text", text: "hello" },
				{ type: "thinking", thinking: "hidden thinking should not count" },
				{ type: "reasoning", reasoning: "hidden reasoning should not count" },
				{ type: "tool_use", name: "read", input: { path: "x" } },
				{ type: "image_url", image_url: { url: "data:image/png;base64,abc" } },
			],
		});
		assert.equal(tokens, Math.ceil(("hello".length + 4) / 4));
	});

	it("handles very long content predictably", () => {
		const content = "x".repeat(100_000);
		assert.equal(countMessageTokens({ role: "user", content }), Math.ceil((content.length + 4) / 4));
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
		assert.equal(result.reasonKey, "engine.fold.reason.noMessages");
	});

	it("skips fold when head too small", () => {
		// Big tail budget → everything fits in tail, nothing in head
		const msgs = [{ role: "user", content: "hi" }];
		const result = estimateFoldBoundary(msgs, 0, 100000);
		assert.ok(result.ok);
		assert.equal(result.headMessages.length, 0);
	});

	it("keeps original tail boundary when preceding user would exceed 2x budget", () => {
		const msgs = [
			{ role: "user", content: "x".repeat(200) },
			{ role: "assistant", content: "y".repeat(200) },
			{ role: "assistant", content: "tail" },
		];
		const result = estimateFoldBoundary(msgs, 0, 10);
		assert.ok(result.ok);
		assert.equal(result.tailMessages.length, 1);
		assert.equal(result.tailMessages[0].content, "tail");
	});

	it("keeps original tail boundary when no preceding user exists", () => {
		const msgs = [
			{ role: "assistant", content: "a".repeat(200) },
			{ role: "assistant", content: "tail" },
		];
		const result = estimateFoldBoundary(msgs, 0, 10);
		assert.ok(result.ok);
		assert.equal(result.tailMessages.length, 1);
		assert.equal(result.tailMessages[0].content, "tail");
	});

	it("puts all messages in tail when budget is very large", () => {
		const msgs = [
			{ role: "user", content: "hi" },
			{ role: "assistant", content: "there" },
		];
		const result = estimateFoldBoundary(msgs, 0, 100000);
		assert.ok(result.ok);
		assert.equal(result.headMessages.length, 0);
		assert.equal(result.tailMessages.length, 2);
		assert.equal(result.tailStartIndex, 0);
		assert.ok(result.totalTokenCount > 0);
	});

	it("keeps only zero-token tail when tail budget is zero", () => {
		const msgs = [
			{ role: "user", content: "first" },
			{ role: "assistant", content: "last" },
		];
		const result = estimateFoldBoundary(msgs, 0, 0);
		assert.equal(result.ok, true);
		assert.equal(result.tailMessages.length, 0);
		assert.equal(result.tailStartIndex, msgs.length);
		assert.equal(result.tailTokenCount, 0);
	});

	it("works without user roles and reports exact boundary totals", () => {
		const msgs = [
			{ role: "assistant", content: "a".repeat(20) },
			{ role: "tool", content: "b".repeat(20) },
			{ role: "assistant", content: "tail" },
		];
		const expectedTotal = msgs.reduce((sum, msg) => sum + countMessageTokens(msg), 0);
		const result = estimateFoldBoundary(msgs, 0, 3);
		assert.equal(result.ok, true);
		assert.equal(result.tailStartIndex, 2);
		assert.deepEqual(result.tailMessages, [msgs[2]]);
		assert.equal(result.totalTokenCount, expectedTotal);
		assert.equal(result.headTokenCount + result.tailTokenCount, expectedTotal);
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

	it("skips non-string content and tags with unsupported whitespace", () => {
		assert.deepEqual(extractPinnedSkills([{ role: "system", content: [{ type: "text", text: "<skill-pin name=\"x\">x</skill-pin>" }] }]), []);
		assert.deepEqual(extractPinnedSkills([{ role: "system", content: '<skill-pin   name="x">\nx\n</skill-pin>' }]), []);
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

	it("handles empty, non-ASCII, and nested XML-like pin content", () => {
		const pins = extractContextEnginePins([
			{
				role: "system",
				content: '<context-engine-pin kind="priority" name="empty"></context-engine-pin>\n<context-engine-pin kind="project-memory" name="i18n" version="2">\nРусский текст 和中文 <inner>ok</inner>\n</context-engine-pin>',
			},
		]);
		assert.equal(pins.length, 2);
		assert.equal(pins.find((pin) => pin.name === "empty").content, "");
		const i18n = pins.find((pin) => pin.name === "i18n");
		assert.equal(i18n.version, 2);
		assert.match(i18n.content, /Русский текст 和中文/);
		assert.match(i18n.content, /<inner>ok<\/inner>/);
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

	it("collects multiple bracket and markdown constraints", () => {
		const constraints = extractPinnedConstraints([
			{
				role: "system",
				content: "[HIGH PRIORITY] Do A\nline 2\n\n[User memory] Likes terse answers\n\n# ## HIGH PRIORITY\nMarkdown rule\n# next",
			},
		]);
		assert.equal(constraints.length, 3);
		assert.ok(constraints.some((c) => c.includes("line 2")));
		assert.ok(constraints.some((c) => c.includes("Markdown rule")));
	});
});

// --- buildFoldMessage ---

describe("buildFoldMessage", () => {
	it("includes marker + summary + skills + constraints + enginePins sections", () => {
		const msg = buildFoldMessage("<fold>", "summary text", [{ id: "s1", content: "<skill-pin name=\"s1\">\ncontent\n</skill-pin>" }], ["[HIGH PRIORITY] urgent"], [
			{ kind: "priority", name: "my-rule", content: "important", raw: '<context-engine-pin kind="priority" name="my-rule">\nimportant\n</context-engine-pin>', version: 1 },
		], "Initial user goal: keep cache hit high");
		assert.equal(msg.role, "assistant");
		assert.ok(msg.reasoning_content !== undefined);
		assert.ok(msg.content.includes("<fold>"));
		assert.ok(msg.content.includes("summary text"));
		assert.ok(msg.content.includes("Session intent"));
		assert.ok(msg.content.includes("keep cache hit high"));
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

	it("keeps engine pins before legacy skill pins", () => {
		const msg = buildFoldMessage("<fold>", "", [{ id: "s1", content: '<skill-pin name="s1">\nskill\n</skill-pin>' }], [], [
			{ kind: "priority", name: "p1", content: "pin", raw: '<context-engine-pin kind="priority" name="p1">\npin\n</context-engine-pin>' },
		]);
		assert.equal(msg.reasoning_content, "");
		assert.ok(msg.content.indexOf("Context Engine pinned material") < msg.content.indexOf("Active skill memos"));
	});
});

describe("extractSessionIntent", () => {
	it("keeps first user goal and later explicit constraints within budget", () => {
		const intent = extractSessionIntent([
			{ role: "system", content: "system" },
			{ role: "user", content: [{ type: "text", text: "Optimize pruning so cache hit stays high." }] },
			{ role: "assistant", content: "ok" },
			{ role: "user", content: "[HIGH PRIORITY] Do not lose tool refs.\n\nother" },
		], 180);
		assert.match(intent, /Initial user goal: Optimize pruning/);
		assert.match(intent, /Constraint: \[HIGH PRIORITY\] Do not lose tool refs/);
		assert.ok((intent?.length ?? 0) <= 180);
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

	it("keeps assistant with an empty tool_calls array", () => {
		const msgs = [{ role: "assistant", content: "ok", tool_calls: [] }];
		const [trimmed, removed] = trimTrailingAssistantToolCalls(msgs);
		assert.equal(trimmed, msgs);
		assert.equal(removed, 0);
	});
});

// --- semanticFold and summarizeHead (integration with mock) ---

describe("summarizeHead", () => {
	it("returns trimmed string responses", async () => {
		const text = await summarizeHead(
			{ complete: async () => "  short summary  " },
			"",
			[{ role: "user", content: "hello" }],
			{ model: "m", timeoutMs: 1000 },
		);
		assert.equal(text, "short summary");
	});

	it("returns trimmed object content responses", async () => {
		const text = await summarizeHead(
			{ complete: async () => ({ content: "  short summary  " }) },
			"",
			[{ role: "user", content: "hello" }],
			{ model: "m", timeoutMs: 1000 },
		);
		assert.equal(text, "short summary");
	});

	it("returns empty string when complete returns null", async () => {
		const text = await summarizeHead(
			{ complete: async () => null },
			"",
			[{ role: "user", content: "hello" }],
			{ model: "m", timeoutMs: 1000 },
		);
		assert.equal(text, "");
	});

	it("returns empty string on AbortError", async () => {
		const text = await summarizeHead(
			{ complete: async () => { const error = new Error("aborted"); error.name = "AbortError"; throw error; } },
			"",
			[{ role: "user", content: "hello" }],
			{ model: "m", timeoutMs: 1000 },
		);
		assert.equal(text, "");
	});

	it("returns empty string on TimeoutError", async () => {
		const text = await summarizeHead(
			{ complete: async () => { const error = new Error("timed out"); error.name = "TimeoutError"; throw error; } },
			"",
			[{ role: "user", content: "hello" }],
			{ model: "m", timeoutMs: 1000 },
		);
		assert.equal(text, "");
	});

	it("returns trimmed nested message content responses and passes the provided signal", async () => {
		const controller = new AbortController();
		let seenSignal;
		const text = await summarizeHead(
			{ complete: async (_model, _messages, options) => { seenSignal = options.signal; return { message: { content: " nested summary " } }; } },
			"",
			[{ role: "user", content: "hello" }],
			{ model: "m", timeoutMs: 1000, signal: controller.signal },
		);
		assert.equal(text, "nested summary");
		assert.ok(seenSignal instanceof AbortSignal);
	});

	it("rethrows non-timeout errors", async () => {
		await assert.rejects(
			() => summarizeHead(
				{ complete: async () => { throw new Error("boom"); } },
				"",
				[{ role: "user", content: "hello" }],
				{ model: "m", timeoutMs: 1000 },
			),
			/boom/,
		);
	});

	it("truncates long message content to 2000 chars in the prompt", async () => {
		const seen = [];
		await summarizeHead(
			{ complete: async (_model, messages) => { seen.push(messages); return "ok"; } },
			"",
			[{ role: "user", content: "x".repeat(2500) }],
			{ model: "m", timeoutMs: 1000 },
		);
		const userPrompt = seen[0][1].content;
		assert.ok(userPrompt.includes("x".repeat(2000)));
		assert.ok(!userPrompt.includes("x".repeat(2200)));
	});
});

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

	if (typeof semanticFold === "function") {
		it("semanticFold returns ok=false when no ctxMax", async () => {
			const result = await semanticFold({}, {}, { config: { foldThreshold: 0.75, aggressiveFoldThreshold: 0.78, exitSummaryThreshold: 0.80, preflightFoldThreshold: 0.90, foldTailPct: 0.2, aggressiveFoldTailPct: 0.1, minFoldSavings: 0.3, foldTimeoutMs: 5000, foldSummaryModel: "test", semanticFoldMarker: "<fold>" }, engine: { semanticFold: { active: false } } }, {});
			assert.equal(result.ok, false);
		});

		it("semanticFold returns ok=false when session branch cannot be read", async () => {
			const result = await semanticFold(
				{},
				{ getContextUsage: () => ({ ctxMax: 100 }), sessionManager: { getBranch: async () => { throw new Error("no branch"); } } },
				{ config: { foldThreshold: 0.75, aggressiveFoldThreshold: 0.78, exitSummaryThreshold: 0.80, preflightFoldThreshold: 0.90, foldTailPct: 0.2, aggressiveFoldTailPct: 0.1, minFoldSavings: 0.3, foldTimeoutMs: 5000, foldSummaryModel: "test", semanticFoldMarker: "<fold>" }, engine: { semanticFold: { active: false } } },
				{},
			);
			assert.deepEqual(result, { ok: false, reasonKey: "engine.fold.reason.sessionBranchUnavailable" });
		});

		it("semanticFold returns ok=false for an empty branch", async () => {
			const result = await semanticFold(
				{},
				{ getContextUsage: () => ({ ctxMax: 100 }), sessionManager: { getBranch: async () => [] } },
				{ config: { foldTailPct: 0.2, aggressiveFoldTailPct: 0.1, minFoldSavings: 0, foldTimeoutMs: 5000, foldSummaryModel: "test", semanticFoldMarker: "<fold>" }, engine: { semanticFold: { active: false } } },
				{},
			);
			assert.deepEqual(result, { ok: false, reasonKey: "engine.fold.reason.noSessionEntries" });
		});

		it("semanticFold returns ok=false when trimming trailing tool calls leaves no messages", async () => {
			const result = await semanticFold(
				{},
				{
					getContextUsage: () => ({ ctxMax: 100 }),
					sessionManager: { getBranch: async () => [
						{ id: "e1", message: { role: "assistant", content: "tool", tool_calls: [{ function: { name: "read" } }] } },
					] },
				},
				{ config: { foldTailPct: 0.2, aggressiveFoldTailPct: 0.1, minFoldSavings: 0, foldTimeoutMs: 5000, foldSummaryModel: "test", semanticFoldMarker: "<fold>" }, engine: { semanticFold: { active: false } } },
				{},
			);
			assert.deepEqual(result, { ok: false, reasonKey: "engine.fold.reason.noMessagesAfterTrim" });
		});

		it("semanticFold returns ok=false when the fold head is below min savings", async () => {
			const result = await semanticFold(
				{ complete: async () => "should not be called" },
				{
					getContextUsage: () => ({ ctxMax: 100 }),
					sessionManager: { getBranch: async () => [
						{ id: "e2", message: { role: "assistant", content: "tail" } },
						{ id: "e1", message: { role: "assistant", content: "head" } },
					] },
				},
				{ config: { foldTailPct: 0.03, aggressiveFoldTailPct: 0.03, minFoldSavings: 0.75, foldTimeoutMs: 5000, foldSummaryModel: "test", semanticFoldMarker: "<fold>" }, engine: { semanticFold: { active: false } } },
				{},
			);
			assert.deepEqual(result, { ok: false, reasonKey: "engine.fold.reason.headBelowMinimumSavings" });
		});

		it("semanticFold returns ok=false when summarizer returns empty", async () => {
			const result = await semanticFold(
				{ complete: async () => "" },
				{
					getContextUsage: () => ({ ctxMax: 100 }),
					sessionManager: { getBranch: async () => [
						{ id: "e3", message: { role: "assistant", content: "final" } },
						{ id: "e2", message: { role: "user", content: "x".repeat(300) } },
						{ id: "e1", message: { role: "system", content: "y".repeat(300) } },
					] },
					model: { id: "deepseek-v4-flash" },
				},
				{ config: { foldThreshold: 0.75, aggressiveFoldThreshold: 0.78, exitSummaryThreshold: 0.80, preflightFoldThreshold: 0.90, foldTailPct: 0.1, aggressiveFoldTailPct: 0.05, minFoldSavings: 0, foldTimeoutMs: 5000, foldSummaryModel: "default", semanticFoldMarker: "<fold>" }, engine: { semanticFold: { active: false, foldedThisTurn: false } } },
				{},
			);
			assert.deepEqual(result, { ok: false, reasonKey: "engine.fold.reason.emptySummary" });
		});

		it("semanticFold propagates non-timeout summarizer errors", async () => {
			await assert.rejects(
				() => semanticFold(
					{ complete: async () => { throw new Error("summarizer failed"); } },
					{
						getContextUsage: () => ({ ctxMax: 100 }),
						sessionManager: { getBranch: async () => [
							{ id: "e3", message: { role: "assistant", content: "tail" } },
							{ id: "e2", message: { role: "user", content: "x".repeat(300) } },
							{ id: "e1", message: { role: "system", content: "y".repeat(300) } },
						] },
					},
					{ config: { foldTailPct: 0.1, aggressiveFoldTailPct: 0.05, minFoldSavings: 0, foldTimeoutMs: 5000, foldSummaryModel: "explicit-model", semanticFoldMarker: "<fold>" }, engine: { semanticFold: { active: false } } },
					{},
				),
				/summarizer failed/,
			);
		});

		it("semanticFold succeeds and persists fold state", async () => {
			const state = {
				config: { foldThreshold: 0.75, aggressiveFoldThreshold: 0.78, exitSummaryThreshold: 0.80, preflightFoldThreshold: 0.90, foldTailPct: 0.1, aggressiveFoldTailPct: 0.05, minFoldSavings: 0, foldTimeoutMs: 5000, foldSummaryModel: "default", semanticFoldMarker: "<fold>" },
				engine: { semanticFold: { active: false, foldedThisTurn: false } },
			};
			const result = await semanticFold(
				{
					complete: async (model, messages, options) => {
						assert.equal(model, "deepseek-v4-flash");
						assert.equal(typeof options.signal, "object");
						assert.equal(messages[0].role, "system");
						return "fold summary";
					},
				},
				{
					getContextUsage: () => ({ ctxMax: 100 }),
					sessionManager: { getBranch: async () => [
						{ id: "e3", message: { role: "assistant", content: "tail" } },
						{ id: "e2", message: { role: "user", content: "x".repeat(300) } },
						{ id: "e1", message: { role: "system", content: "y".repeat(300) } },
					] },
					model: { id: "deepseek-v4-flash", systemPrompt: "system prompt" },
				},
				state,
				{ aggressive: true, signal: AbortSignal.timeout(1000) },
			);
			assert.equal(result.ok, true);
			assert.equal(result.tailMessages, 1);
			assert.equal(state.engine.semanticFold.active, true);
			assert.equal(state.engine.semanticFold.foldedThisTurn, true);
			assert.equal(state.engine.semanticFold.tailStartEntryId, "e3");
			assert.match(state.engine.semanticFold.syntheticMsg.content, /fold summary/);
		});

		it("semanticFold uses explicit summary model and computes ctxAfterPct", async () => {
			let seenModel;
			const state = {
				config: { foldTailPct: 0.1, aggressiveFoldTailPct: 0.05, minFoldSavings: 0, foldTimeoutMs: 5000, foldSummaryModel: "explicit-model", semanticFoldMarker: "<fold>" },
				engine: { semanticFold: { active: false, foldedThisTurn: false } },
			};
			const result = await semanticFold(
				{ complete: async (model) => { seenModel = model; return "explicit summary"; } },
				{
					getContextUsage: () => ({ ctxMax: 100 }),
					sessionManager: { getBranch: async () => [
						{ id: "e3", message: { role: "assistant", content: "tail" } },
						{ id: "e2", message: { role: "user", content: "x".repeat(300) } },
						{ id: "e1", message: { role: "system", content: "y".repeat(300) } },
					] },
					model: { id: "ctx-model" },
				},
				state,
				{},
			);
			assert.equal(result.ok, true);
			assert.equal(seenModel, "explicit-model");
			assert.equal(result.ctxAfterPct, countMessageTokens({ role: "assistant", content: "tail" }) / 100);
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

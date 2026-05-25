import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";

let mod;
try {
	mod = await import("../src/context-pins/detector.ts");
} catch {
	mod = await import("../src/context-pins/detector.js");
}

const {
	detectSlashSkillInvocations,
	recordSkillUse,
	checkForPinSuggestions,
	resetSkillCounts,
	formatPinSuggestions,
} = mod;

describe("detectSlashSkillInvocations", () => {
	it("detects /skill:name in text", () => {
		const names = detectSlashSkillInvocations("run /skill:test-skill");
		assert.deepEqual(names, ["test-skill"]);
	});

	it("detects multiple skill invocations", () => {
		const names = detectSlashSkillInvocations("/skill:a and /skill:b");
		assert.deepEqual(names, ["a", "b"]);
	});

	it("returns empty for text without skills", () => {
		assert.equal(detectSlashSkillInvocations("hello world").length, 0);
	});

	it("handles hyphens in skill names", () => {
		const names = detectSlashSkillInvocations("/skill:my-cool-skill");
		assert.deepEqual(names, ["my-cool-skill"]);
	});
});

describe("recordSkillUse", () => {
	beforeEach(() => resetSkillCounts());

	it("returns null on first use", () => {
		assert.equal(recordSkillUse("test"), null);
	});

	it("returns suggestion on second use (threshold)", () => {
		recordSkillUse("test");
		const suggestion = recordSkillUse("test");
		assert.ok(suggestion);
		assert.equal(suggestion.kind, "skill");
		assert.equal(suggestion.name, "test");
		assert.ok(suggestion.confidence > 0);
	});

	it("tracks separate counts per skill", () => {
		// Each skill used once → none hits threshold
		assert.equal(recordSkillUse("a"), null);
		assert.equal(recordSkillUse("b"), null);
		assert.equal(recordSkillUse("c"), null);

		// Second use of 'a' hits threshold
		const suggestion = recordSkillUse("a");
		assert.ok(suggestion);
		assert.equal(suggestion.name, "a");

		// But 'b' at 1 use still returns null
		assert.equal(recordSkillUse("d"), null);
	});
});

describe("checkForPinSuggestions", () => {
	beforeEach(() => resetSkillCounts());

	it("returns no suggestions on first /skill use", () => {
		const suggestions = checkForPinSuggestions("run /skill:test");
		assert.equal(suggestions.length, 0);
	});

	it("returns suggestion on second /skill use", () => {
		checkForPinSuggestions("run /skill:test");
		const suggestions = checkForPinSuggestions("run /skill:test again");
		assert.equal(suggestions.length, 1);
		assert.equal(suggestions[0].kind, "skill");
		assert.equal(suggestions[0].name, "test");
	});
});

describe("formatPinSuggestions", () => {
	it("returns empty string for empty list", () => {
		assert.equal(formatPinSuggestions([]), "");
	});

	it("formats a single suggestion", () => {
		const text = formatPinSuggestions([{ kind: "skill", name: "test", reason: "repeated 2×", confidence: 0.5 }]);
		assert.ok(text.includes("suggested pin"));
		assert.ok(text.includes("skill=test"));
		assert.ok(text.includes("context_pin_skill"));
	});

	it("formats multiple suggestions on separate lines", () => {
		const text = formatPinSuggestions([
			{ kind: "skill", name: "a", reason: "repeated 2×", confidence: 0.3 },
			{ kind: "skill", name: "b", reason: "repeated 3×", confidence: 0.5 },
		]);
		assert.ok(text.includes("\n"));
	});
});

describe("resetSkillCounts", () => {
	it("clears usage counts", () => {
		recordSkillUse("test");
		recordSkillUse("test");
		resetSkillCounts();
		assert.equal(recordSkillUse("test"), null); // back to first use
	});
});

import { describe, it } from "node:test";
import assert from "node:assert/strict";

const m = {};

describe("detectGoalDeadlock", () => {
	it("loads detectGoalDeadlock function", async () => {
		m.detectGoalDeadlock = (await import("../src/projection/history-folder.ts")).detectGoalDeadlock;
		assert.ok(m.detectGoalDeadlock);
	});

	it("detects tool signature deadlock (3 repeated identical tool calls)", () => {
		const head = [
			{ role: "assistant", tool_calls: [{ function: { name: "read", arguments: JSON.stringify({ path: "foo.ts" }) } }] },
			{ role: "tool", content: "file content" },
			{ role: "assistant", tool_calls: [{ function: { name: "read", arguments: JSON.stringify({ path: "foo.ts" }) } }] },
			{ role: "tool", content: "file content" },
			{ role: "assistant", tool_calls: [{ function: { name: "read", arguments: JSON.stringify({ path: "foo.ts" }) } }] }
		];
		assert.equal(m.detectGoalDeadlock(head), true);
	});

	it("does not detect tool signature deadlock if user intervenes", () => {
		const head = [
			{ role: "assistant", tool_calls: [{ function: { name: "read", arguments: JSON.stringify({ path: "foo.ts" }) } }] },
			{ role: "tool", content: "file content" },
			{ role: "assistant", tool_calls: [{ function: { name: "read", arguments: JSON.stringify({ path: "foo.ts" }) } }] },
			{ role: "user", content: "go ahead" },
			{ role: "assistant", tool_calls: [{ function: { name: "read", arguments: JSON.stringify({ path: "foo.ts" }) } }] }
		];
		assert.equal(m.detectGoalDeadlock(head), false);
	});

	it("detects assistant text repetition deadlock (3 repeated assistant texts)", () => {
		const head = [
			{ role: "assistant", content: "I am checking the status." },
			{ role: "assistant", content: "I am checking the status." },
			{ role: "assistant", content: "I am checking the status." }
		];
		assert.equal(m.detectGoalDeadlock(head), true);
	});

	it("does not detect assistant text repetition if user intervenes", () => {
		const head = [
			{ role: "assistant", content: "I am checking the status." },
			{ role: "assistant", content: "I am checking the status." },
			{ role: "user", content: "Okay, and?" },
			{ role: "assistant", content: "I am checking the status." }
		];
		assert.equal(m.detectGoalDeadlock(head), false);
	});

	it("detects explicit refusal pattern deadlock", () => {
		const head = [
			{ role: "assistant", content: "I am permanently stuck here." },
			{ role: "assistant", content: "It seems we are in an infinite loop." },
			{ role: "assistant", content: "I cannot make progress anymore." }
		];
		assert.equal(m.detectGoalDeadlock(head, "en"), true);
	});

	it("does not detect refusal patterns if user message resets it", () => {
		const head = [
			{ role: "assistant", content: "I am permanently stuck here." },
			{ role: "assistant", content: "It seems we are in an infinite loop." },
			{ role: "user", content: "try another way" },
			{ role: "assistant", content: "I cannot make progress anymore." }
		];
		assert.equal(m.detectGoalDeadlock(head, "en"), false);
	});
});

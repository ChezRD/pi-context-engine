import { describe, it, before } from "node:test";
import assert from "node:assert/strict";

let mod;

before(async () => {
	mod = await import("../src/cache-engine/prefix-stability.ts");
});

function baseState(overrides = {}) {
	const { config: configOverrides, engine: engineOverrides, ...rest } = overrides;
	return {
		config: {
			enabled: true,
			prefixStabilityCheck: true,
			strictPrefixWarnings: false,
			...configOverrides,
		},
		engine: {
			lastWarning: undefined,
			historyRewriteCount: 0,
			...engineOverrides,
		},
		...rest,
	};
}

// --- checkPrefixStability ---

describe("checkPrefixStability", () => {
	it("does nothing when disabled", () => {
		const state = baseState({ config: { enabled: false } });
		mod.checkPrefixStability({}, {}, state);
		assert.equal(state.engine.lastWarning, undefined);
	});

	it("does nothing when prefixStabilityCheck off", () => {
		const state = baseState({ config: { prefixStabilityCheck: false } });
		mod.checkPrefixStability({ messages: [{ role: "system", content: "prompt" }, { role: "user", content: "hi" }] }, {}, state);
		assert.equal(state.engine.lastWarning, undefined);
	});

	it("initializes contextPrefixFingerprint on first call", () => {
		const state = baseState();
		const event = { messages: [{ role: "system", content: "You are helpful" }, { role: "user", content: "hello" }] };
		mod.checkPrefixStability(event, {}, state);
		assert.ok(state.engine.contextPrefixFingerprint);
	});

	it("sets lastWarning=prefix when prefix changes", () => {
		const state = baseState();
		const event1 = { messages: [{ role: "system", content: "Original prompt" }, { role: "user", content: "do it" }] };
		mod.checkPrefixStability(event1, {}, state);
		const firstHash = state.engine.contextPrefixFingerprint;

		const event2 = { messages: [{ role: "system", content: "Changed prompt" }, { role: "user", content: "do it" }] };
		mod.checkPrefixStability(event2, {}, state);
		assert.notEqual(state.engine.contextPrefixFingerprint, firstHash);
		assert.equal(state.engine.lastWarning, "prefix");
	});

	it("does not warn on stable prefix", () => {
		const state = baseState();
		const event = { messages: [{ role: "system", content: "Stable" }, { role: "user", content: "hi" }] };
		mod.checkPrefixStability(event, {}, state);
		state.engine.lastWarning = undefined;
		mod.checkPrefixStability(event, {}, state);
		assert.equal(state.engine.lastWarning, undefined);
	});

	it("calls ctx.ui.notify when strictPrefixWarnings enabled and prefix changes", () => {
		const state = baseState({ config: { strictPrefixWarnings: true } });
		let notified = false;
		const ctx = { ui: { notify: (msg, level) => { notified = true; } } };
		mod.checkPrefixStability({ messages: [{ role: "system", content: "P1" }, { role: "user", content: "hi" }] }, ctx, state);
		mod.checkPrefixStability({ messages: [{ role: "system", content: "P2" }, { role: "user", content: "hi" }] }, ctx, state);
		assert.ok(notified);
	});

	it("sets lastWarning=history when history preceding prefix changes", () => {
		const state = baseState();
		const event1 = { messages: [
			{ role: "system", content: "prompt" },
			{ role: "assistant", content: "previous response" },
			{ role: "user", content: "first" },
		]};
		mod.checkPrefixStability(event1, {}, state);

		const event2 = { messages: [
			{ role: "system", content: "prompt" },
			{ role: "assistant", content: "DIFFERENT response" },
			{ role: "user", content: "second" },
		]};
		mod.checkPrefixStability(event2, {}, state);
		assert.equal(state.engine.lastWarning, "history");
		assert.equal(state.engine.historyRewriteCount, 1);
	});

	it("does not set history warning when history unchanged", () => {
		const state = baseState();
		const event = { messages: [
			{ role: "system", content: "prompt" },
			{ role: "user", content: "same" },
		]};
		mod.checkPrefixStability(event, {}, state);
		state.engine.lastWarning = undefined;
		mod.checkPrefixStability(event, {}, state);
		assert.equal(state.engine.lastWarning, undefined);
		assert.equal(state.engine.historyRewriteCount, 0);
	});

	it("notifies on history rewrite when strictPrefixWarnings enabled", () => {
		const state = baseState({ config: { strictPrefixWarnings: true } });
		let lastMsg = "";
		const ctx = { ui: { notify: (msg, level) => { lastMsg = msg; } } };
		mod.checkPrefixStability({ messages: [
			{ role: "system", content: "p" },
			{ role: "user", content: "q1" },
		]}, ctx, state);

		mod.checkPrefixStability({ messages: [
			{ role: "system", content: "p" },
			{ role: "user", content: "q2" },
		]}, ctx, state);
		assert.ok(lastMsg.length > 0);
	});

	it("increments historyRewriteCount on each rewrite", () => {
		const state = baseState();
		const event1 = { messages: [{ role: "system", content: "prompt" }, { role: "user", content: "v1" }] };
		mod.checkPrefixStability(event1, {}, state);

		const event2 = { messages: [{ role: "system", content: "prompt" }, { role: "user", content: "v2" }] };
		mod.checkPrefixStability(event2, {}, state);
		assert.equal(state.engine.historyRewriteCount, 1);

		const event3 = { messages: [{ role: "system", content: "prompt" }, { role: "user", content: "v3" }] };
		mod.checkPrefixStability(event3, {}, state);
		assert.equal(state.engine.historyRewriteCount, 2);
	});

	it("handles empty messages array", () => {
		const state = baseState();
		mod.checkPrefixStability({ messages: [] }, {}, state);
		// Should not crash
		assert.ok(true);
	});

	it("handles missing messages field", () => {
		const state = baseState();
		mod.checkPrefixStability({}, {}, state);
		// Should not crash
		assert.ok(true);
	});

	it("ignores system messages in history fingerprint", () => {
		const state = baseState();
		const event = { messages: [
			{ role: "system", content: "system prompt" },
			{ role: "assistant", content: "resp" },
			{ role: "user", content: "msg" },
		]};
		const event2 = { messages: [
			{ role: "system", content: "different system prompt" },
			{ role: "assistant", content: "resp" },
			{ role: "user", content: "msg" },
		]};
		// system prompt change should trigger prefix change, not history change
		mod.checkPrefixStability(event, {}, state);
		mod.checkPrefixStability(event2, {}, state);
		assert.equal(state.engine.lastWarning, "prefix");
	});

	it("stops prefix at first user message", () => {
		const state = baseState();
		const event = { messages: [
			{ role: "system", content: "system" },
			{ role: "assistant", content: "assistant1" },
			{ role: "user", content: "stop here" },
			{ role: "assistant", content: "more" },
		]};
		mod.checkPrefixStability(event, {}, state);
		// Changing assistant message after first user should NOT change prefix
		const event2 = { messages: [
			{ role: "system", content: "system" },
			{ role: "assistant", content: "assistant1" },
			{ role: "user", content: "stop here" },
			{ role: "assistant", content: "DIFFERENT" },
		]};
		const prevHash = state.engine.contextPrefixFingerprint;
		mod.checkPrefixStability(event2, {}, state);
		assert.equal(state.engine.contextPrefixFingerprint, prevHash);
	});

	it("skips tool messages in prefix", () => {
		const state = baseState();
		const event = { messages: [
			{ role: "system", content: "system" },
			{ role: "user", content: "hi" },
			{ role: "assistant", content: "let me check", toolCalls: [{ id: "1" }] },
			{ role: "tool", content: "result" },
		]};
		mod.checkPrefixStability(event, {}, state);
		const hash1 = state.engine.contextPrefixFingerprint;

		const event2 = { messages: [
			{ role: "system", content: "system" },
			{ role: "user", content: "hi" },
			{ role: "assistant", content: "let me check", toolCalls: [{ id: "1" }] },
			{ role: "tool", content: "DIFFERENT result" },
		]};
		mod.checkPrefixStability(event2, {}, state);
		assert.equal(state.engine.contextPrefixFingerprint, hash1);
	});

	it("stops prefix before a tool message without a prior user message", () => {
		const state = baseState();
		const event = { messages: [
			{ role: "system", content: "system" },
			{ role: "tool", content: "result" },
			{ role: "assistant", content: "after tool" },
		]};
		mod.checkPrefixStability(event, {}, state);
		const hash1 = state.engine.contextPrefixFingerprint;

		const event2 = { messages: [
			{ role: "system", content: "system" },
			{ role: "tool", content: "different result" },
			{ role: "assistant", content: "changed" },
		]};
		mod.checkPrefixStability(event2, {}, state);
		assert.equal(state.engine.contextPrefixFingerprint, hash1);
	});

	it("stops prefix at first user message when parts exist", () => {
		const state = baseState();
		const event = { messages: [
			{ role: "system", content: "you are a bot" },
			{ role: "user", content: "first", name: "user1" },
			{ role: "assistant", content: "ok" },
			{ role: "user", content: "second" },
		]};
		mod.checkPrefixStability(event, {}, state);
		const hash1 = state.engine.contextPrefixFingerprint;

		// second user message after first should be excluded from prefix
		const event2 = { messages: [
			{ role: "system", content: "you are a bot" },
			{ role: "user", content: "first", name: "user1" },
			{ role: "assistant", content: "ok" },
			{ role: "user", content: "DIFFERENT second" },
		]};
		mod.checkPrefixStability(event2, {}, state);
		assert.equal(state.engine.contextPrefixFingerprint, hash1);
	});
});

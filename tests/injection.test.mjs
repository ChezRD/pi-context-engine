import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";

let mod;
try {
	mod = await import("../src/context-pins/injection.ts");
} catch {
	mod = await import("../src/context-pins/injection.js");
}

const { buildPinInjectionBlock, computeInjectionHash, applyPinInjection } = mod;

// Minimal mock state factory
function createMockState(pins = [], overrides = {}) {
	return {
		config: {
			cachePromptInjection: true,
			skillPinning: true,
			memoryInjection: false,
			priorityInjection: true,
			...overrides,
		},
		pinStore: {
			getByKind(kind) {
				return pins.filter(p => p.kind === kind);
			},
			getAll() {
				return pins;
			},
		},
	};
}

describe("buildPinInjectionBlock", () => {
	it("returns empty string when all injection disabled", () => {
		const state = createMockState([], { skillPinning: false, priorityInjection: false, memoryInjection: false });
		assert.equal(buildPinInjectionBlock(state.config, state), "");
	});

	it("includes instructions block when skillPinning or priorityInjection enabled", () => {
		const state = createMockState([]);
		const block = buildPinInjectionBlock(state.config, state);
		assert.ok(block.includes("Context Engine Pins"));
		assert.ok(block.includes("context_pin_skill"));
	});

	it("includes high-priority pins when priorityInjection enabled", () => {
		const state = createMockState([
			{ kind: "priority", name: "rule1", content: "use checkpoint", priority: "high" },
		]);
		const block = buildPinInjectionBlock(state.config, state);
		assert.ok(block.includes("HIGH"));
		assert.ok(block.includes("use checkpoint"));
	});

	it("includes user-memory pins when memoryInjection enabled", () => {
		const state = createMockState([
			{ kind: "user-memory", name: "pref", content: "dark mode" },
		], { memoryInjection: true });
		const block = buildPinInjectionBlock(state.config, state);
		assert.ok(block.includes("User memory"));
		assert.ok(block.includes("dark mode"));
	});

	it("includes project-memory pins when memoryInjection enabled", () => {
		const state = createMockState([
			{ kind: "project-memory", name: "arch", content: "TypeScript" },
		], { memoryInjection: true });
		const block = buildPinInjectionBlock(state.config, state);
		assert.ok(block.includes("Project memory"));
		assert.ok(block.includes("TypeScript"));
	});
});

describe("computeInjectionHash", () => {
	it("returns deterministic hash", () => {
		const state = createMockState([]);
		const h1 = computeInjectionHash(state.config, state);
		const h2 = computeInjectionHash(state.config, state);
		assert.equal(h1, h2);
	});

	it("changes when pins change", () => {
		const state1 = createMockState([]);
		const state2 = createMockState([
			{ kind: "priority", name: "r", content: "rule" },
		]);
		assert.notEqual(computeInjectionHash(state1.config, state1), computeInjectionHash(state2.config, state2));
	});
});

describe("applyPinInjection", () => {
	it("returns undefined when no injection", () => {
		const state = createMockState([], { skillPinning: false, priorityInjection: false });
		assert.equal(applyPinInjection({}, state), undefined);
	});

	it("returns systemPrompt with injection block", () => {
		const state = createMockState([]);
		const result = applyPinInjection({}, state);
		assert.ok(result);
		assert.ok(result.systemPrompt.includes("Context Engine Pins"));
	});

	it("appends to existing systemPrompt", () => {
		const state = createMockState([]);
		const result = applyPinInjection({ systemPrompt: "Original prompt." }, state);
		assert.ok(result);
		assert.ok(result.systemPrompt.startsWith("Original prompt."));
		assert.ok(result.systemPrompt.includes("Context Engine Pins"));
	});
});

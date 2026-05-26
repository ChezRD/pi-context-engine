// Module import smoke tests
import { describe, it } from "node:test";
import assert from "node:assert/strict";

describe("module smoke tests", () => {
	it("history-folder loads", async () => {
		const m = await import("../../src/projection/history-folder.ts");
		assert.ok(m.countMessageTokens);
	});
	it("stats loads", async () => {
		const m = await import("../../src/stats.ts");
		assert.ok(m.emptyStats);
	});
	it("batch-capture loads", async () => {
		const m = await import("../../src/projection/batch-capture.ts");
		assert.ok(m.shouldTriggerPrune);
	});
	it("decision-engine loads", async () => {
		const m = await import("../../src/cache-engine/decision-engine.ts");
		assert.ok(m.decisionLabel);
	});
	it("pruner loads", async () => {
		const m = await import("../../src/projection/pruner.ts");
		assert.ok(m.pruneMessages);
	});
	it("prefix-reasons loads", async () => {
		const m = await import("../../src/prefix-reasons.ts");
		assert.ok(m.formatPrefixReason);
	});
});

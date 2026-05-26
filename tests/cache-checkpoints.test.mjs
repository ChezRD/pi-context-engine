import { describe, it, before } from "node:test";
import assert from "node:assert/strict";

let mod;
let createRuntimeState;
before(async () => {
	mod = await import("../src/cache-engine/cache-checkpoints.ts");
	({ createRuntimeState } = await import("../src/runtime-state.ts"));
});

describe("handlePrefixCheckpoint", () => {
	it("opens checkpoint segments for default segment-starting reasons and closes prior segment", () => {
		const state = createRuntimeState();
		state.engine.turnIndex = 3;
		for (const reason of ["provider_model_drift", "model_select", "system_drift", "tools_drift", "semantic_fold", "compact", "prune", "manual_reset", "rewind"]) {
			const before = state.engine.segments.length;
			mod.openCacheCheckpoint(state, reason, { modelId: `model-${reason}` });
			assert.equal(state.engine.segments.length, before + 1);
		}
		assert.equal(state.engine.segments.at(-2).endTurn, 3);
	});

	it("honors explicit startSegment and checkpointStartsSegment config", () => {
		const state = createRuntimeState();
		state.config.checkpointStartsSegment = false;
		const baseline = state.engine.segments.length;
		mod.openCacheCheckpoint(state, "user_checkpoint");
		assert.equal(state.engine.segments.length, baseline);
		mod.openCacheCheckpoint(state, "agent_checkpoint", { startSegment: true });
		assert.equal(state.engine.segments.length, baseline + 1);

		const state2 = createRuntimeState();
		state2.config.checkpointStartsSegment = true;
		const baseline2 = state2.engine.segments.length;
		mod.openCacheCheckpoint(state2, "agent_checkpoint");
		assert.equal(state2.engine.segments.length, baseline2 + 1);
	});

	it("creates current segment from existing or implicit checkpoint and annotates usage fallbacks", () => {
		const state = createRuntimeState();
		state.engine.currentSegmentId = undefined;
		state.engine.lastProviderModelId = "provider-model";
		state.detection.provider = "provider";
		const first = mod.currentCacheSegment(state);
		const second = mod.currentCacheSegment(state);
		assert.equal(first.id, second.id);

		const usage1 = mod.annotateUsageForCurrentSegment(state, { input: 1, cacheRead: 0, cacheWrite: 0, output: 0, hitRate: 0 });
		const usage2 = mod.annotateUsageForCurrentSegment(state, { input: 1, cacheRead: 0, cacheWrite: 0, output: 0, hitRate: 0, warmup: false, modelId: "explicit", provider: "explicit-provider", checkpointReason: "manual" });
		assert.equal(usage1.warmup, true);
		assert.equal(usage1.modelId, "provider-model");
		assert.equal(usage1.provider, "provider");
		assert.equal(usage2.warmup, false);
		assert.equal(usage2.modelId, "explicit");
		assert.equal(usage2.checkpointReason, "manual");
	});

	it("handles prefix drift checkpoint priorities", () => {
		for (const [reason, expected] of [
			["model", "provider_model_drift"],
			["system", "system_drift"],
			["tools", "tools_drift"],
			["reasoning", "reasoning_drift"],
		]) {
			const state = createRuntimeState();
			state.engine.prefixHash = "prefix";
			state.engine.toolHash = "old-tool";
			state.engine.lastProviderModelId = "old-model";
			mod.handlePrefixCheckpoint(state, { reasons: [reason], hard: reason !== "reasoning" }, { model: "new-model", toolsHash: "new-tool", reasoning: "" });
			assert.equal(state.engine.checkpoints.at(-1).reason, expected);
		}
	});

	it("returns early when drift reason is unknown", () => {
		const state = {
			engine: {
				checkpoints: [],
				currentCheckpointId: undefined,
				segments: [{ checkpoints: [], startReason: "initial" }],
				currentSegmentId: 0,
			},
			config: { checkpointStartsSegment: false },
		};
		const drift = { reasons: ["unknown"] };
		const nextPrefix = {};
		mod.handlePrefixCheckpoint(state, drift, nextPrefix);
		assert.equal(state.engine.currentCheckpointId, undefined);
	});
});

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
	DEFAULT_TOOL_PRUNE_CONFIG,
	createToolCallIndexer,
} from "../../../src/projection/types.ts";

describe("projection/types runtime helpers", () => {
	it("creates an indexer that tracks summarized tool calls", () => {
		const indexer = createToolCallIndexer();

		assert.equal(indexer.isSummarized("call-1"), false);
		assert.equal(indexer.getRecord("call-1"), undefined);
		assert.deepEqual(indexer.getAllSummarized(), []);

		indexer.markSummarized("call-1", "read", 2, "summary");

		assert.equal(indexer.isSummarized("call-1"), true);
		assert.deepEqual(indexer.getRecord("call-1"), {
			toolCallId: "call-1",
			toolName: "read",
			turnIndex: 2,
			summarized: true,
			summaryText: "summary",
		});
		assert.deepEqual(indexer.getAllSummarized(), [indexer.getRecord("call-1")]);

		indexer.reset();

		assert.equal(indexer.isSummarized("call-1"), false);
		assert.deepEqual(indexer.getAllSummarized(), []);
	});

	it("keeps the default pruning config stable", () => {
		assert.deepEqual(DEFAULT_TOOL_PRUNE_CONFIG, {
			enabled: true,
			pruneOn: "agent-message",
			summarizerModel: "default",
		});
	});
});

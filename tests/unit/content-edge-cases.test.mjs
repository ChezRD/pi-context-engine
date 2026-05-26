import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";
register("../__mocks__/loader.mjs", import.meta.url);

describe("content edge cases", () => {
  // session-map.ts fullText: content array with non-text parts (line 37)
  it("session-map fullText handles non-text content parts", async () => {
    const { buildSessionContentMap } = await import("../../src/projection/session-map.ts");
    const map = buildSessionContentMap(
      [{ type: "message", message: { role: "user", content: [{ type: "image", source: "img.png" }, { type: "text", text: "actual text" }] }, turnIndex: 1 }],
      { toolIndexer: { isSummarized: () => false } },
    );
    const node = map.nodes.find((n) => n.kind === "message");
    assert.ok(node);
    assert.match(node.textPreview ?? "", /actual text/);
  });

  // tool-pruner.ts: buildPoolPrompt with non-overlapping content (line 204)
  it("trimRepeatedLookupContent non-overlapping content", async () => {
    const { buildPoolPrompt } = await import("../../src/projection/tool-pruner.ts");
    const prompt = buildPoolPrompt([{
      turnIndex: 1,
      toolCalls: [
        { id: "a", name: "context_result_lookup", args: "{\"ref\":\"dsc-nonoverlap\"}", result: "[context_result_lookup ref=dsc-nonoverlap returned=3 bytes=6]\nabc" },
        { id: "b", name: "context_result_lookup", args: "{\"ref\":\"dsc-nonoverlap\"}", result: "[context_result_lookup ref=dsc-nonoverlap returned=3 bytes=6]\ndef" },
      ],
    }], false);
    assert.ok(prompt.includes("abc"));
    assert.ok(prompt.includes("def"));
  });

  // tool-pruner.ts: evidence metadata with claim_strength (lines 383-384)
  it("evidence metadata claim_strength adds flag", async () => {
    const { summarizeToolBatch } = await import("../../src/projection/tool-pruner.ts");
    let capturedPrompt = "";
    await summarizeToolBatch({
      complete: async (_model, messages) => {
        const content = messages[0]?.content;
        capturedPrompt = typeof content === "string" ? content : (content?.[0]?.text ?? "");
        return { content: "{\"summaries\":[{\"batchIndex\":0,\"coverage\":\"complete\",\"summary\":\"Read with claim_strength.\"}]}", usage: { input: 10, output: 10 } };
      },
    }, {
      turnIndex: 0,
      toolCalls: [{
        id: "t1",
        name: "read",
        args: "{\"path\":\"src/test.ts\"}",
        result: "Evidence metadata: {\"claim_strength\":\"strong\"}\ncontent",
      }],
    }, { enabled: true, pruneOn: "every-turn", summarizerModel: "default" });
    assert.ok(capturedPrompt.includes("claim_strength_strong"));
  });

  // tool-pruner.ts: normalizeToolResultForSummary fallthrough to stripLookupHeader
  it("normalizeToolResultForSummary passes through plain text", async () => {
    const { normalizeToolResultForSummary } = await import("../../src/projection/tool-pruner.ts");
    const result = normalizeToolResultForSummary("plain text result");
    assert.equal(result, "plain text result");
  });

  // tool-pruner.ts: normalizeLookupMetadata fallback regex
  it("normalizeLookupMetadata fallback regex transforms legacy format", async () => {
    const { normalizeToolResultForSummary } = await import("../../src/projection/tool-pruner.ts");
    const result = normalizeToolResultForSummary("[context_result_lookup ref=dsc-xyz returned=10 bytes=20]\nbody");
    assert.ok(result.startsWith("Result metadata:"));
    assert.ok(result.includes("returned_chars=10"));
    assert.ok(result.includes("total_bytes=20"));
    assert.ok(result.includes("body"));
  });

  // tool-pruner.ts: model resolution when ctx.model is null
  it("resolves model when ctx.model.provider is missing", async () => {
    const { summarizeToolBatchPool } = await import("../../src/projection/tool-pruner.ts");
    const pool = await summarizeToolBatchPool({}, [{
      turnIndex: 0,
      toolCalls: [{ id: "noprovider", name: "read", args: "{\"path\":\"src/nop.ts\"}", result: "no provider" }],
    }], { enabled: true, pruneOn: "every-turn", summarizerModel: "no-slash-model" }, {
      ctx: { model: null },
    });
    assert.ok(pool);
  });

  // tool-stability.ts: messageText with content array text parts (line 138)
  it("tool-stability messageText handles text part objects", async () => {
    const { maybeAppendEffectiveGuidanceMessage } = await import("../../src/cache-engine/tool-stability.ts");
    const result = maybeAppendEffectiveGuidanceMessage(
      [{ content: [{ type: "text", text: "[pi-context-engine guidance]" }] }],
      {},
      { config: { toolIntentNudge: true } },
    );
    assert.equal(result, undefined);
  });

  // prune-tool.ts: efficient mask replacement (line 185)
  it("prune-tool replaces inefficient result with efficient mask", async () => {
    const { buildObservationMaskSummary, isReplacementSummaryEfficient } = await import("../../src/projection/tool-pruner.ts");
    const batch = {
      turnIndex: 0,
      context: "A".repeat(200),
      toolCalls: [
        { id: "big", name: "read", args: "{\"path\":\"src/big.ts\"}", result: "B".repeat(500) },
      ],
    };
    const mask = buildObservationMaskSummary(batch, "test");
    assert.ok(isReplacementSummaryEfficient(batch, mask));
  });

  // i18n: locale short code fallback (lines 141-142 in findLocaleMap)
  it("i18n findLocaleMap short code fallback matches regional variant", async () => {
    const mod = await import("../../src/i18n/index.ts");
    mod.registerStrings(mod.I18N_NAMESPACE, { "xy-ZZ": { hello: "Hello from XY" } });
    mod.applyLocale("xy");
    const result = mod.t("hello");
    assert.equal(result, "Hello from XY");
    mod.applyLocale("en");
  });

  // i18n locale fallback chain utility
  it("i18n localeFallbackChain returns correct order", async () => {
    const { localeFallbackChain } = await import("../../src/i18n/index.ts");
    const chain = localeFallbackChain("en-US");
    assert.equal(chain[0], "en-US");
    assert.equal(chain[1], "en");
  });

  // tool-pruner.ts: hasUnsupportedReadCompleteness inner loop fallthrough (line 825)
  it("hasUnsupportedReadCompleteness inner loop fallthrough with unmatched paths", async () => {
    const { hasUnsupportedReadCompleteness } = await import("../../src/projection/tool-pruner.ts");
    // Bounded read creates boundedHints, but summary doesn't mention the path
    const batch = {
      turnIndex: 0,
      toolCalls: [{
        id: "t1",
        name: "read",
        args: "{\"path\":\"src/test.ts\",\"limit\":3}",
        result: "Result metadata: offset=0 returned_chars=3\nfoo",
      }],
    };
    // Summary claims "full" but doesn't mention "test.ts" - inner loop won't match
    const result = hasUnsupportedReadCompleteness(batch, "Full content was read completely.");
    assert.equal(result, false);
  });
});

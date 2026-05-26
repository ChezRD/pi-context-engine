import { describe, it } from "node:test";
import assert from "node:assert/strict";

let mod;
try {
	mod = await import("../src/projection/harness-content.ts");
} catch {
	mod = await import("../src/projection/harness-content.js");
}

const {
	CONTEXT_RESULT_LOOKUP_TOOL,
	DUPLICATE_SKIP_INTERNAL_MARKER,
	buildContextResultLookupHeader,
	parseContextResultLookupHeader,
	firstContextResultLookupHeader,
	extractHarnessResultFacts,
	normalizeHarnessFactsForSummary,
	parseLegacyDuplicateSkipMarker,
	isDuplicateSkipResult,
	stripLegacyUiContinuationHint,
} = mod;

// ---------------------------------------------------------------------------
// buildContextResultLookupHeader
// ---------------------------------------------------------------------------
describe("buildContextResultLookupHeader", () => {
	it("builds full kind header when offset=0 and no limit", () => {
		const h = buildContextResultLookupHeader({ ref: "test.txt" });
		assert.ok(h.startsWith(`[${CONTEXT_RESULT_LOOKUP_TOOL} `));
		assert.ok(h.endsWith("]"));
		assert.match(h, /kind=full/);
		assert.match(h, /ref=test\.txt/);
	});

	it("builds slice kind header when offset=0 and limit set", () => {
		const h = buildContextResultLookupHeader({ ref: "file.ts", offset: 0, limit: 100, returnedChars: 50, totalChars: 500 });
		assert.match(h, /kind=slice/);
		assert.match(h, /offset=0/);
		assert.match(h, /limit=100/);
		assert.match(h, /range=0:50/);
		assert.match(h, /returned_chars=50/);
		assert.match(h, /total_chars=500/);
	});

	it("builds slice kind header when offset>0 even without limit", () => {
		const h = buildContextResultLookupHeader({ ref: "main.log", offset: 10, limit: 20 });
		assert.match(h, /kind=slice/);
		assert.match(h, /offset=10/);
		assert.match(h, /limit=20/);
	});

	it("includes bytes when only bytes is provided", () => {
		const h = buildContextResultLookupHeader({ ref: "a.bin", bytes: 4096 });
		assert.match(h, /bytes=4096/);
	});

	it("prefers totalBytes over bytes", () => {
		const h = buildContextResultLookupHeader({ ref: "x.bin", bytes: 100, totalBytes: 200 });
		assert.match(h, /bytes=200/);
		assert.doesNotMatch(h, /bytes=100/);
	});

	it("includes has_more and nextOffset", () => {
		const h = buildContextResultLookupHeader({ ref: "zzz", hasMore: true, nextOffset: 50 });
		assert.match(h, /has_more=true/);
		assert.match(h, /next_offset=50/);
	});

	it("includes has_more=false", () => {
		const h = buildContextResultLookupHeader({ ref: "done.txt", hasMore: false });
		assert.match(h, /has_more=false/);
	});

	it("omits range when returnedChars is undefined", () => {
		const h = buildContextResultLookupHeader({ ref: "no-range", offset: 0, limit: 50 });
		assert.doesNotMatch(h, /range=/);
	});

	it("produces deterministic output for same input", () => {
		const a = buildContextResultLookupHeader({ ref: "r.ts", offset: 5, limit: 10, totalChars: 200 });
		const b = buildContextResultLookupHeader({ ref: "r.ts", offset: 5, limit: 10, totalChars: 200 });
		assert.equal(a, b);
	});
});

// ---------------------------------------------------------------------------
// parseContextResultLookupHeader
// ---------------------------------------------------------------------------
describe("parseContextResultLookupHeader", () => {
	it("returns undefined for empty input", () => {
		assert.equal(parseContextResultLookupHeader(undefined), undefined);
		assert.equal(parseContextResultLookupHeader(""), undefined);
		assert.equal(parseContextResultLookupHeader("  "), undefined);
	});

	it("returns undefined for non-marker text", () => {
		assert.equal(parseContextResultLookupHeader("hello"), undefined);
		assert.equal(parseContextResultLookupHeader("[wrong]"), undefined);
	});

	it("parses full kind with ref", () => {
		const f = parseContextResultLookupHeader("[context_result_lookup kind=full ref=readme.md has_more=false]");
		assert.ok(f);
		assert.equal(f.kind, "full");
		assert.equal(f.ref, "readme.md");
		assert.equal(f.continuation, "none");
	});

	it("parses slice with all fields", () => {
		const f = parseContextResultLookupHeader("[context_result_lookup kind=slice ref=src/main.ts offset=10 limit=50 range=10:30 returned_chars=20 total_chars=1000 bytes=4096 has_more=true next_offset=60]");
		assert.ok(f);
		assert.equal(f.kind, "slice");
		assert.equal(f.ref, "src/main.ts");
		assert.equal(f.offset, 10);
		assert.equal(f.limit, 50);
		assert.equal(f.range, "10:30");
		assert.equal(f.returnedChars, 20);
		assert.equal(f.totalChars, 1000);
		assert.equal(f.totalBytes, 4096);
		assert.equal(f.hasMore, true);
		assert.equal(f.nextOffset, 60);
		assert.equal(f.continuation, "has-more");
	});

	it("parses has_more=false", () => {
		const f = parseContextResultLookupHeader("[context_result_lookup kind=full ref=t.txt has_more=false]");
		assert.ok(f);
		assert.equal(f.hasMore, false);
		assert.equal(f.continuation, "none");
	});

	it("parses kind=preview", () => {
		const f = parseContextResultLookupHeader("[context_result_lookup kind=preview ref=big.log offset=0 limit=200]");
		assert.ok(f);
		assert.equal(f.kind, "preview");
	});

	it("parses 'returned' alias for returned", () => {
		const f = parseContextResultLookupHeader("[context_result_lookup kind=slice ref=x.md returned=30]");
		assert.ok(f);
		assert.equal(f.returnedChars, 30);
	});

	it("handles whitespace tolerance", () => {
		const f = parseContextResultLookupHeader("  [context_result_lookup kind=full ref=spaced.txt]  ");
		assert.ok(f);
		assert.equal(f.kind, "full");
		assert.equal(f.ref, "spaced.txt");
	});

	it("handles 'bytes' key (alias for total_bytes)", () => {
		const f = parseContextResultLookupHeader("[context_result_lookup kind=full ref=bin.dat bytes=777]");
		assert.ok(f);
		assert.equal(f.totalBytes, 777);
	});

	it("returns undefined when ref missing", () => {
		assert.equal(parseContextResultLookupHeader("[context_result_lookup kind=full]"), undefined);
		assert.equal(parseContextResultLookupHeader("[context_result_lookup offset=10]"), undefined);
	});

	it("derives kind from offset/limit when explicit kind absent", () => {
		const full = parseContextResultLookupHeader("[context_result_lookup ref=auto.txt]");
		assert.ok(full);
		assert.equal(full.kind, "full");

		const slice = parseContextResultLookupHeader("[context_result_lookup ref=auto.txt offset=5 limit=20]");
		assert.ok(slice);
		assert.equal(slice.kind, "slice");
	});

	it("re-derives kind when explicit kind is unknown but ref and offset present", () => {
		// When ref is present, re-derivation kicks in: existing ref → compute kind from offset/limit
		const f = parseContextResultLookupHeader("[context_result_lookup kind=nonexistent ref=aaa offset=10]");
		assert.ok(f);
		assert.equal(f.kind, "slice"); // re-derived from offset>0

		const full = parseContextResultLookupHeader("[context_result_lookup kind=nonexistent ref=bbb]");
		assert.ok(full);
		assert.equal(full.kind, "full"); // re-derived, no offset/limit
	});

	it("skips malformed tokens gracefully", () => {
		const f = parseContextResultLookupHeader("[context_result_lookup kind=full ref=ok ref=dup extra]");
		assert.ok(f);
		assert.equal(f.ref, "dup"); // last wins
	});

	it("sets continuation unknown when hasMore missing", () => {
		const f = parseContextResultLookupHeader("[context_result_lookup kind=full ref=no-more.txt]");
		assert.ok(f);
		// hasMore undefined — ternary: hasMore===true? no; hasMore===false? no; → "unknown"
		assert.equal(f.continuation, "unknown");
	});
});

// ---------------------------------------------------------------------------
// firstContextResultLookupHeader
// ---------------------------------------------------------------------------
describe("firstContextResultLookupHeader", () => {
	it("extracts header from first line", () => {
		const h = firstContextResultLookupHeader("[context_result_lookup kind=full ref=a.txt]\nsome content");
		assert.equal(h, "[context_result_lookup kind=full ref=a.txt]");
	});

	it("returns undefined for non-header text", () => {
		assert.equal(firstContextResultLookupHeader("plain text"), undefined);
	});

	it("trims leading whitespace", () => {
		const h = firstContextResultLookupHeader("  [context_result_lookup kind=full ref=indent.txt]\nnext");
		assert.equal(h, "[context_result_lookup kind=full ref=indent.txt]");
	});

	it("returns undefined for undefined input", () => {
		assert.equal(firstContextResultLookupHeader(undefined), undefined);
	});

	it("returns header even if second line also has header", () => {
		const h = firstContextResultLookupHeader("[context_result_lookup kind=full ref=a.txt]\n[context_result_lookup kind=slice ref=b.txt]");
		assert.equal(h, "[context_result_lookup kind=full ref=a.txt]");
	});
});

// ---------------------------------------------------------------------------
// extractHarnessResultFacts
// ---------------------------------------------------------------------------
describe("extractHarnessResultFacts", () => {
	it("returns undefined for undefined/empty", () => {
		assert.equal(extractHarnessResultFacts(undefined), undefined);
		assert.equal(extractHarnessResultFacts(""), undefined);
	});

	it("detects duplicate-skip markers", () => {
		const f = extractHarnessResultFacts(DUPLICATE_SKIP_INTERNAL_MARKER);
		assert.ok(f);
		assert.equal(f.kind, "duplicate-skip");
		assert.equal(f.duplicateSkip, true);
		assert.equal(f.continuation, "none");
	});

	it("detects legacy duplicate-skip patterns (en)", () => {
		const f = extractHarnessResultFacts("duplicate tool call suppressed to avoid cache/context churn");
		assert.ok(f);
		assert.equal(f.kind, "duplicate-skip");
	});

	it("detects legacy duplicate-skip patterns (ru)", () => {
		const f = extractHarnessResultFacts("дублирующийся вызов инструмента пропущен во избежание кэш-инвалидации/шума в контексте");
		assert.ok(f);
		assert.equal(f.kind, "duplicate-skip");
	});

	it("core: parses header from raw text", () => {
		const f = extractHarnessResultFacts("[context_result_lookup kind=slice ref=main.go offset=10 limit=50 total_chars=500]");
		assert.ok(f);
		assert.equal(f.kind, "slice");
		assert.equal(f.ref, "main.go");
	});

	it("parses header from first line with trailing content", () => {
		// firstContextResultLookupHeader only reads the first line
		const f = extractHarnessResultFacts("[context_result_lookup kind=slice ref=x.txt offset=10 limit=20]\nmore text");
		assert.ok(f);
		assert.equal(f.kind, "slice");
		assert.equal(f.ref, "x.txt");
	});

	it("returns undefined when header not found in non-model-visible text", () => {
		const f = extractHarnessResultFacts("just some random content\nno header here");
		assert.equal(f, undefined);
	});
});

// ---------------------------------------------------------------------------
// normalizeHarnessFactsForSummary
// ---------------------------------------------------------------------------
describe("normalizeHarnessFactsForSummary", () => {
	it("returns undefined for undefined input", () => {
		assert.equal(normalizeHarnessFactsForSummary(undefined), undefined);
	});

	it("returns undefined for duplicate-skip", () => {
		assert.equal(normalizeHarnessFactsForSummary({ kind: "duplicate-skip", duplicateSkip: true, continuation: "none" }), undefined);
	});

	it("formats full kind fact", () => {
		const s = normalizeHarnessFactsForSummary({ kind: "full", ref: "readme.md", continuation: "none" });
		assert.ok(s);
		assert.match(s, /kind=full/);
		assert.match(s, /ref=readme\.md/);
	});

	it("formats slice with numeric fields", () => {
		const s = normalizeHarnessFactsForSummary({
			kind: "slice", ref: "src/lib.ts", offset: 10, limit: 30, returnedChars: 30,
			totalChars: 500, hasMore: true, nextOffset: 40, continuation: "has-more",
		});
		assert.ok(s);
		assert.match(s, /kind=slice/);
		assert.match(s, /offset=10/);
		assert.match(s, /returned_chars=30/);
		assert.match(s, /has_more=true/);
		assert.match(s, /next_offset=40/);
	});

	it("omits unknown kind from output", () => {
		const s = normalizeHarnessFactsForSummary({ kind: "unknown", ref: "x.ts", continuation: "unknown" });
		assert.ok(s);
		assert.doesNotMatch(s, /kind=/);
	});

	it("omits undefined fields", () => {
		const s = normalizeHarnessFactsForSummary({ kind: "full", ref: "min.ts", continuation: "none" });
		assert.ok(s);
		assert.doesNotMatch(s, /offset=/);
		assert.doesNotMatch(s, /limit=/);
	});
});

// ---------------------------------------------------------------------------
// parseLegacyDuplicateSkipMarker
// ---------------------------------------------------------------------------
describe("parseLegacyDuplicateSkipMarker", () => {
	it("matches English pattern", () => {
		assert.equal(parseLegacyDuplicateSkipMarker("duplicate tool call suppressed to avoid cache/context churn"), true);
	});

	it("is case-insensitive for English", () => {
		assert.equal(parseLegacyDuplicateSkipMarker("DUPLICATE Tool Call SUPPRESSED to avoid CACHE/CONTEXT churn"), true);
	});

	it("matches Russian pattern", () => {
		assert.equal(parseLegacyDuplicateSkipMarker("дублирующийся вызов инструмента пропущен во избежание кэш-инвалидации/шума в контексте"), true);
	});

	it("returns false for unrelated text", () => {
		assert.equal(parseLegacyDuplicateSkipMarker("some random message"), false);
	});

	it("trims whitespace before matching", () => {
		assert.equal(parseLegacyDuplicateSkipMarker("  duplicate tool call suppressed to avoid cache/context churn  "), true);
	});
});

// ---------------------------------------------------------------------------
// isDuplicateSkipResult
// ---------------------------------------------------------------------------
describe("isDuplicateSkipResult", () => {
	it("detects internal marker", () => {
		assert.equal(isDuplicateSkipResult(DUPLICATE_SKIP_INTERNAL_MARKER), true);
	});

	it("detects legacy English pattern", () => {
		assert.equal(isDuplicateSkipResult("duplicate tool call suppressed to avoid cache/context churn"), true);
	});

	it("returns false for unrelated text", () => {
		assert.equal(isDuplicateSkipResult("normal text here"), false);
	});

	it("trims input", () => {
		assert.equal(isDuplicateSkipResult(`  ${DUPLICATE_SKIP_INTERNAL_MARKER}  `), true);
	});
});

// ---------------------------------------------------------------------------
// stripLegacyUiContinuationHint
// ---------------------------------------------------------------------------
describe("stripLegacyUiContinuationHint", () => {
	it("returns empty for undefined", () => {
		assert.deepEqual(stripLegacyUiContinuationHint(undefined), {});
	});

	it("returns unchanged body when no hint", () => {
		const r = stripLegacyUiContinuationHint("some content\nmore");
		assert.equal(r.body, "some content\nmore");
		assert.equal(r.hasLegacyUiHint, undefined);
	});

	it("strips [Showing lines …] hint from end", () => {
		const r = stripLegacyUiContinuationHint("line1\nline2\n[Showing lines 10 to 20]");
		assert.equal(r.body, "line1\nline2");
		assert.equal(r.hasLegacyUiHint, true);
	});

	it("returns body unchanged when only hint line without leading newline", () => {
		// Regex requires \n before [Showing lines ...] — standalone line won't match
		const r = stripLegacyUiContinuationHint("[Showing lines 1 to 5]");
		assert.equal(r.body, "[Showing lines 1 to 5]");
		assert.equal(r.hasLegacyUiHint, undefined);
	});

	it("does not strip inline [Showing …]", () => {
		const r = stripLegacyUiContinuationHint("line with [Showing lines 1 to 2] inside");
		assert.equal(r.body, "line with [Showing lines 1 to 2] inside");
		assert.equal(r.hasLegacyUiHint, undefined);
	});
});

import { describe, it, before } from "node:test";
import assert from "node:assert/strict";

let mod;

describe("tool-evidence", () => {
	before(async () => {
		mod = await import("../src/tool-evidence.ts");
	});

	it("exports TOOL_EVIDENCE_KIND constant", () => {
		assert.equal(mod.TOOL_EVIDENCE_KIND, "tool_result_evidence");
	});

	it("returns undefined for null result", () => {
		assert.equal(mod.maybeAnnotateToolEvidence("bash", {}, null), undefined);
	});

	it("returns undefined for model-visible context", () => {
		const r = mod.maybeAnnotateToolEvidence("bash", {}, {
			content: [{ type: "text", text: "<context-engine ui=\"custom-rendered\">\ntest\n</context-engine>" }],
		});
		assert.equal(r, undefined);
	});

	it("returns undefined for unknown tool", () => {
		const r = mod.maybeAnnotateToolEvidence("unknown_tool", {}, {
			content: [{ type: "text", text: "some output" }],
		});
		assert.equal(r, undefined);
	});

	it("returns undefined for plain bash command with no evidence pattern", () => {
		const r = mod.maybeAnnotateToolEvidence("bash", { command: "ls" }, {
			content: [{ type: "text", text: "file1.txt" }],
		});
		assert.equal(r, undefined);
	});

	it("annotates filtered bash output via pipe", () => {
		const r = mod.maybeAnnotateToolEvidence("bash", { command: "ls | grep test" }, {
			content: [{ type: "text", text: "test.txt" }],
			details: { exitCode: 0 },
		});
		assert.ok(r);
		assert.equal(r.details.evidenceKind, "filtered_command_output");
		assert.equal(r.details.claimStrength, "weak");
	});

	it("annotates test runner output", () => {
		const r = mod.maybeAnnotateToolEvidence("bash", { command: "npx vitest run" }, {
			content: [{ type: "text", text: "PASS tests/foo.test.ts" }],
			details: { exitCode: 0 },
		});
		assert.ok(r);
		assert.equal(r.details.evidenceKind, "filtered_test_output");
	});

	it("annotates grep tool always", () => {
		const r = mod.maybeAnnotateToolEvidence("grep", { command: "grep -r something" }, {
			content: [{ type: "text", text: "src/file.ts: match" }],
			details: { exitCode: 0 },
		});
		assert.ok(r);
		assert.equal(r.details.evidenceKind, "search_hits");
	});

	it("annotates find tool with partial listing", () => {
		const r = mod.maybeAnnotateToolEvidence("find", { command: "find . -name" }, {
			content: [{ type: "text", text: "file1\nfile2\n... more matches available ..." }],
			details: { exitCode: 0 },
		});
		assert.ok(r);
		assert.equal(r.details.evidenceKind, "partial_find_listing");
	});

	it("annotates find tool with complete listing", () => {
		const r = mod.maybeAnnotateToolEvidence("find", { command: "find . -name" }, {
			content: [{ type: "text", text: "file1\nfile2" }],
			details: { exitCode: 0 },
		});
		assert.ok(r);
		assert.equal(r.details.evidenceKind, "find_listing");
	});

	it("annotates ls tool always", () => {
		const r = mod.maybeAnnotateToolEvidence("ls", { command: "ls" }, {
			content: [{ type: "text", text: "file1\nfile2" }],
			details: { exitCode: 0 },
		});
		assert.ok(r);
		assert.equal(r.details.evidenceKind, "ls_listing");
	});

	it("annotates read tool with partial file excerpt", () => {
		const r = mod.maybeAnnotateToolEvidence("read", { command: "read src/file.ts" }, {
			content: [{ type: "text", text: "line1\n[20 more lines]" }],
			details: { exitCode: 0 },
		});
		assert.ok(r);
		assert.equal(r.details.evidenceKind, "partial_file_excerpt");
	});

	it("grep -c triggers filtered output due to grep in command", () => {
		const r = mod.maybeAnnotateToolEvidence("bash", { command: "grep -c pattern src/file.ts" }, {
			content: [{ type: "text", text: "5" }],
			details: { exitCode: 0 },
		});
		assert.ok(r);
		assert.equal(r.details.evidenceKind, "filtered_command_output");
	});

	it("annotates find with xargs wc -l as inventory count", () => {
		const r = mod.maybeAnnotateToolEvidence("bash", {
			command: "find src -name '*.ts' | xargs wc -l",
		}, {
			content: [{ type: "text", text: "100 src/a.ts\n200 src/b.ts" }],
			details: { exitCode: 0 },
		});
		assert.ok(r);
		assert.equal(r.details.evidenceKind, "inventory_count_output");
	});

	it("uses exitCode fallback when details.exitCode is undefined", () => {
		// result has exitCode at top level, not in details — tests ?? fallback
		const r = mod.maybeAnnotateToolEvidence("bash", { command: "ls | grep test" }, {
			content: [{ type: "text", text: "test.txt" }],
			exitCode: 0,
		});
		assert.ok(r);
		// exit_code is embedded in buildModelVisibleContext text metadata
		assert.ok(r.content[0].text.includes('exit_status'));
	});

	it("accepts raw string for args (not {command: ...})", () => {
		// grep always returns assessment; args as string exercises
		// typeof args?.command === "string" false-branch in return block
		const r = mod.maybeAnnotateToolEvidence("grep", "raw-string-args", {
			content: [{ type: "text", text: "match" }],
		});
		assert.ok(r);
		assert.equal(r.details.evidenceKind, "search_hits");
	});

	it("annotates name-based reference scan", () => {
		// nameReferenceScan checked before filtered, so grep at word boundary is fine
		const r = mod.maybeAnnotateToolEvidence("bash", { command: "grep pattern $(find src -name '*.ts') tests --basename" }, {
			content: [{ type: "text", text: "src/foo.ts" }],
			details: { exitCode: 0 },
		});
		assert.ok(r);
		assert.equal(r.details.evidenceKind, "name_based_reference_scan");
	});

	it("returns count_command_output for grep -c at non-start position", () => {
		// grep -c where grep is preceded by $(( not whitespace/start)
		// so filtered=false; inventoryCount=false; explicitCount=true
		const r = mod.maybeAnnotateToolEvidence("bash", { command: "COUNT=$(grep -c pattern src/file.ts)" }, {
			content: [{ type: "text", text: "5 matches" }],
			details: { exitCode: 0 },
		});
		assert.ok(r);
		assert.equal(r.details.evidenceKind, "count_command_output");
	});

	it("annotates command error output", () => {
		const r = mod.maybeAnnotateToolEvidence("bash", { command: "ls /nonexistent" }, {
			content: [{ type: "text", text: "ls: /nonexistent: No such file or directory" }],
			details: { exitCode: 1 },
		});
		assert.ok(r);
		assert.equal(r.details.evidenceKind, "command_error_output");
	});

	it("annotates read tool without partial excerpt as undefined", () => {
		const r = mod.maybeAnnotateToolEvidence("read", { command: "read src/file.ts" }, {
			content: [{ type: "text", text: "full file content\nline2\nline3" }],
			details: { exitCode: 0 },
		});
		assert.equal(r, undefined);
	});
});

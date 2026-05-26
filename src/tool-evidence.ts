import { extractToolResultText } from "./capper.ts";
import { buildModelVisibleContext, isModelVisibleContext } from "./model-visible.ts";

export const TOOL_EVIDENCE_KIND = "tool_result_evidence";

interface EvidenceAssessment {
	evidenceKind: string;
	claimStrength: "weak" | "medium" | "strong";
	instructions: string[];
	invalidClaims: string[];
}

export function maybeAnnotateToolEvidence(toolName: string, args: any, result: any): any | undefined {
	const text = extractToolResultText(result?.content);
	if (!text || isModelVisibleContext(text)) return undefined;
	const assessment = assessToolEvidence(toolName, args, text);
	if (!assessment) return undefined;
	return {
		...result,
		content: [{
			type: "text",
			text: buildModelVisibleContext({
				kind: TOOL_EVIDENCE_KIND,
				ui: "custom-rendered",
				instructions: assessment.instructions.join(" "),
				metadata: {
					source_tool: toolName,
					evidence_kind: assessment.evidenceKind,
					claim_strength: assessment.claimStrength,
					command: typeof args?.command === "string" ? args.command : undefined,
					exit_status: result?.details?.exitCode ?? result?.exitCode,
					valid_claims: ["facts directly visible in this output", "the command and scope shown in metadata"],
					invalid_claims: assessment.invalidClaims,
				},
				sections: [{ name: "output", content: text }],
			}),
		}],
		details: {
			...(result?.details ?? {}),
			evidenceBy: "pi-context-engine",
			evidenceKind: assessment.evidenceKind,
			claimStrength: assessment.claimStrength,
		},
	};
}

function assessToolEvidence(toolName: string, args: any, text: string): EvidenceAssessment | undefined {
	const name = toolName.toLowerCase();
	const command = String(args?.command ?? "");
	if (name === "bash") return assessBash(command, text);
	if (name === "grep") {
		return {
			evidenceKind: "search_hits",
			claimStrength: "weak",
			instructions: [
				"This grep result is search evidence. Hits prove presence only.",
				"Do not claim no references, no tests, complete coverage, or full audit unless the searched scope and clean exit status prove an exhaustive search.",
			],
			invalidClaims: ["no matches outside searched scope", "complete coverage", "all files checked"],
		};
	}
	if (name === "find") {
		const partial = /more matches available|cursor=|hasMore/i.test(text);
		return partial
			? partialListing("find")
			: completeListing("find");
	}
	if (name === "ls") return completeListing("ls");
	if (name === "read" && /\[(?:\d+ more lines|Showing lines|[.\s]*\d+ lines omitted)/i.test(text)) {
		return {
			evidenceKind: "partial_file_excerpt",
			claimStrength: "weak",
			instructions: [
				"This read output is a bounded excerpt, not a full file.",
				"Do not claim the full file was read or that absent code/tests do not exist unless the remaining ranges are fetched or a separate exhaustive search proves it.",
			],
			invalidClaims: ["full file read", "no references", "no tests", "all cases covered"],
		};
	}
	return undefined;
}

function assessBash(command: string, text: string): EvidenceAssessment | undefined {
	const filtered = /[|]|(?:^|\s)(grep|head|tail|sed|awk|cut)(?:\s|$)/.test(command);
	const testRun = isLikelyTestCommand(command);
	const inventoryCount = isInventoryCountCommand(command);
	const nameReferenceScan = isNameBasedReferenceScan(command);
	const explicitCount = /\b(wc\s+-l|grep\s+-c)\b/.test(command) || inventoryCount;
	if (nameReferenceScan) {
		return {
			evidenceKind: "name_based_reference_scan",
			claimStrength: "weak",
			instructions: [
				"This bash result is a name-based reference scan, not coverage evidence.",
				"Hits or misses only describe literal name matches in the searched files.",
				"Do not label modules as untested or covered from this result without reading tests or using coverage instrumentation.",
			],
			invalidClaims: ["untested module", "covered module", "coverage gap", "no tests", "complete coverage"],
		};
	}
	if (inventoryCount) {
		return {
			evidenceKind: "inventory_count_output",
			claimStrength: "medium",
			instructions: [
				"This bash result supports inventory/count claims for the exact find/wc scope shown in the command.",
				"Do not turn inventory counts into coverage percentages or test completeness claims.",
			],
			invalidClaims: ["coverage percentage", "covered module", "untested module", "complete coverage"],
		};
	}
	if (filtered || testRun) {
		return {
			evidenceKind: testRun ? "filtered_test_output" : "filtered_command_output",
			claimStrength: "weak",
			instructions: [
				"This bash result is filtered or sliced command output, not the full command log.",
				"Do not infer total pass/fail counts, absence of failures, no matches, complete coverage, or exhaustive audit from this output alone.",
				"Use an unfiltered command with exit status or an explicit counting command when making totals.",
			],
			invalidClaims: ["full test result", "unique failing test count", "no failures", "no matches", "complete coverage"],
		};
	}
	if (explicitCount) {
		return {
			evidenceKind: "count_command_output",
			claimStrength: "medium",
			instructions: [
				"This bash result can support counts for the exact command scope only.",
				"Do not generalize counts beyond the files and glob patterns shown in the command.",
			],
			invalidClaims: ["counts outside command scope", "coverage percentage without instrumentation"],
		};
	}
	if (/No such file|command not found|bad option|terminated by signal|Command exited with code [1-9]/i.test(text)) {
		return {
			evidenceKind: "command_error_output",
			claimStrength: "weak",
			instructions: ["This command produced an error or non-clean result. Treat any output as diagnostic only."],
			invalidClaims: ["complete result", "successful audit", "no further action needed"],
		};
	}
	return undefined;
}

function isInventoryCountCommand(command: string): boolean {
	return /\bfind\s+\S+[^|;&]*\s-name\s+['"]?\*?\.[\w-]+['"]?[^|;&]*\s-exec\s+wc\s+-l\b/.test(command)
		|| /\bgit\s+ls-files\b[^|;&]*\|\s*xargs\s+wc\s+-l\b/.test(command)
		|| /\bwc\s+-l\b[^|;&]*(?:\|\s*sort\b)?/.test(command) && !/\bgrep\b/.test(command);
}

function isNameBasedReferenceScan(command: string): boolean {
	return /\bgrep\b/.test(command)
		&& /\bfind\s+src\b|\bsrc\/\*\*\/\*\.ts\b|\bsrc\s+-name\s+['"]?\*\.ts/.test(command)
		&& /\btests\b/.test(command)
		&& /\bbasename\b|\bNO TEST\b|\bno direct\b/i.test(command);
}

function isLikelyTestCommand(command: string): boolean {
	return [
		/\bnode\s+--test\b/,
		/\b(?:npm|pnpm|yarn|bun)\s+(?:run\s+)?(?:test|tests|check|ci:test|test:[\w:-]+)\b/,
		/\b(?:npx|pnpm\s+exec|yarn\s+exec|bunx)\s+(?:vitest|jest|mocha|ava|tap|tsx|playwright|cypress)\b/,
		/\b(?:vitest|jest|mocha|ava|tap|playwright\s+test|cypress\s+run)\b/,
		/\b(?:pytest|python\s+-m\s+pytest|python3\s+-m\s+pytest|go\s+test|cargo\s+test|cargo\s+nextest|mvn\s+test|gradle\s+test|gradlew\s+test|dotnet\s+test|vendor\/bin\/pest|vendor\/bin\/phpunit)\b/,
	].some((pattern) => pattern.test(command));
}

function completeListing(toolName: string): EvidenceAssessment {
	return {
		evidenceKind: `${toolName}_listing`,
		claimStrength: "medium",
		instructions: [
			`This ${toolName} result supports claims about the listed scope only.`,
			"Do not infer project-wide absence unless this scope is the full intended tree.",
		],
		invalidClaims: ["project-wide absence without full scope", "coverage percentage"],
	};
}

function partialListing(toolName: string): EvidenceAssessment {
	return {
		evidenceKind: `partial_${toolName}_listing`,
		claimStrength: "weak",
		instructions: [
			`This ${toolName} result is partial and has more results available.`,
			"Do not claim exhaustive search, complete file inventory, or absence of further matches.",
		],
		invalidClaims: ["complete inventory", "no more matches", "all files checked"],
	};
}

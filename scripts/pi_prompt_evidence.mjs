#!/usr/bin/env node
import { spawn } from "node:child_process";
import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const DEFAULT_MODEL = "deepseek/deepseek-v4-flash";
const DEFAULT_THINKING = "low";
const DEFAULT_EXTENSION = resolve(process.cwd());

function parseArgs(argv) {
	const args = {
		model: DEFAULT_MODEL,
		thinking: DEFAULT_THINKING,
		extension: DEFAULT_EXTENSION,
		tools: undefined,
		discoverExtensions: false,
		sessionDir: undefined,
		prompt: undefined,
		analyzeOnly: false,
		keep: false,
		evidence: undefined,
		label: undefined,
		printPiOutput: false,
		config: undefined,
		retry: 3,
	};
	for (let i = 0; i < argv.length; i++) {
		const arg = argv[i];
		if (arg === "--prompt") args.prompt = argv[++i];
		else if (arg === "--session-dir") args.sessionDir = argv[++i];
		else if (arg === "--model") args.model = argv[++i];
		else if (arg === "--thinking") args.thinking = argv[++i];
		else if (arg === "--extension") args.extension = argv[++i];
		else if (arg === "--tools") args.tools = argv[++i];
		else if (arg === "--with-discovered-extensions") args.discoverExtensions = true;
		else if (arg === "--evidence") args.evidence = argv[++i];
		else if (arg === "--label") args.label = argv[++i];
		else if (arg === "--retry") args.retry = parseInt(argv[++i], 10);
	else if (arg === "--config") args.config = argv[++i];
		else if (arg === "--continue" || arg === "-c" || arg === "--max-continuations" || arg === "--max-continuation") {
			throw new Error(`${arg} is forbidden in evidence:pi; run exactly one pi -p cycle and analyze its JSONL.`);
		}
		else if (arg === "--analyze-only") args.analyzeOnly = true;
		else if (arg === "--keep") args.keep = true;
		else if (arg === "--print-pi-output") args.printPiOutput = true;
		else if (!args.prompt) args.prompt = arg;
		else args.prompt += ` ${arg}`;
	}
	return args;
}

function usage() {
	console.error("Usage: node scripts/pi_prompt_evidence.mjs "
		+ "[--prompt <prompt>] [--session-dir /tmp/name] [--config /path/to/context-engine.json] "
		+ "[--tools read,grep,find,ls,bash] [--analyze-only] [--evidence evidence.md]");
	process.exit(2);
}

function latestJsonl(sessionDir) {
	const files = readdirSync(sessionDir)
		.filter((file) => file.endsWith(".jsonl"))
		.map((file) => {
			const path = join(sessionDir, file);
			return { file, path, mtimeMs: statSync(path).mtimeMs };
		})
		.sort((left, right) => right.mtimeMs - left.mtimeMs || right.file.localeCompare(left.file));
	return files[0]?.path;
}

function textOfContent(content) {
	if (typeof content === "string") return content;
	if (!Array.isArray(content)) return "";
	return content.map((part) => {
		if (typeof part === "string") return part;
		if (part && typeof part.text === "string") return part.text;
		if (part && typeof part.thinking === "string") return part.thinking;
		return "";
	}).filter(Boolean).join("\n");
}

function toolCallsOf(message) {
	const content = Array.isArray(message?.content) ? message.content : [];
	return content.filter((part) => part?.type === "toolCall").map((part) => ({
		id: part.id,
		name: part.name,
		arguments: part.arguments,
	}));
}

function hasFoldSignal(entry, lineText) {
	if (entry?.type === "message") {
		const msg = entry.message;
		const text = textOfContent(msg?.content);
		return msg?.role === "compactionSummary"
			|| msg?.role === "branchSummary"
			|| /<fold-summary>|conversation history before this point was compacted|summary of a branch/i.test(text);
	}
	if (entry?.type === "custom" && entry.customType === "context-engine-telemetry") {
		const engine = entry.data?.engine;
		const lastUsage = entry.data?.stats?.last;
		return Boolean(engine?.semanticFold?.active)
			|| engine?.compactCount > 0
			|| lastUsage?.checkpointReason === "semantic_fold"
			|| lastUsage?.checkpointReason === "compact";
	}
	return /semantic_fold|compactionSummary|fold-summary|session_compact/i.test(lineText);
}

function analyzeSession(jsonlPath, prompt, run = undefined) {
	const rawText = readFileSync(jsonlPath, "utf8");
	const rawLines = rawText.trim().split(/\n/).filter(Boolean);
	const entries = [];
	const markerHits = [];
	const assistants = [];
	const toolResults = [];
	const toolCalls = [];
	const customCounts = {};
	const payloadDiagnostics = [];
	const foldLines = [];
	const compactionLines = [];
	const guidanceKinds = {};
	const guidanceDelivery = {
		firstLine: undefined,
		firstToolIntentLine: undefined,
		firstUserIntentLine: undefined,
	};
	let guidanceSummaryEntry;
	let hasCustomGuidanceMessage = false;
	let latestTelemetry;
	let parseErrors = 0;

	for (const [index, line] of rawLines.entries()) {
		const lineNo = index + 1;
		if (/pi-context-engine guidance|context-engine-guidance|pi-context-engine user intent|context-engine-user-intent|user-intent: analyze|user-intent: search|intent: analyze|intent: search|intent: prune-request/.test(line)) markerHits.push(lineNo);
		let entry;
		try {
			entry = JSON.parse(line);
		} catch {
			parseErrors++;
			continue;
		}
		entries.push(entry);
		if (entry.type === "custom") {
			customCounts[entry.customType ?? "unknown"] = (customCounts[entry.customType ?? "unknown"] ?? 0) + 1;
			if (entry.customType === "context-engine.payload") {
				payloadDiagnostics.push({ line: lineNo, ...(entry.data ?? {}) });
			}
			if (entry.customType === "context-engine-guidance") {
				hasCustomGuidanceMessage = true;
				guidanceSummaryEntry = guidanceSummaryEntry || entry;
				if (entry?.data?.stableKey && !guidanceDelivery.firstLine) guidanceDelivery.firstLine = lineNo;
				const text = String(entry.content || "");
				if (text.includes("tool-intent:")) {
					guidanceKinds.toolIntent = (guidanceKinds.toolIntent ?? 0) + 1;
					if (!guidanceDelivery.firstToolIntentLine) guidanceDelivery.firstToolIntentLine = lineNo;
				}
				if (text.includes("user-intent:")) {
					guidanceKinds.userIntent = (guidanceKinds.userIntent ?? 0) + 1;
					if (!guidanceDelivery.firstUserIntentLine) guidanceDelivery.firstUserIntentLine = lineNo;
				}
				for (const record of entry?.data?.records ?? []) {
					if (!record || typeof record !== "object") continue;
					guidanceKinds[record.kind] = (guidanceKinds[record.kind] ?? 0) + 1;
				}
			}
			if (entry.customType === "context-engine-telemetry") latestTelemetry = entry.data;
			if (entry.customType === "context-engine-telemetry" && entry.data?.lastPayload) {
				payloadDiagnostics.push({ line: lineNo, source: "telemetry", ...entry.data.lastPayload });
			}
		}
		if (entry.type === "compaction") compactionLines.push(lineNo);
		if (hasFoldSignal(entry, line)) foldLines.push(lineNo);
		if (entry.type === "message") {
			const msg = entry.message;
			if (msg?.role === "assistant") {
				const calls = toolCallsOf(msg);
			assistants.push({
				line: lineNo,
				usage: msg.usage,
				stopReason: msg.stopReason,
				errorMessage: msg.errorMessage,
				text: textOfContent(msg.content),
				toolCalls: calls,
			});
				for (const call of calls) toolCalls.push({ ...call, line: lineNo });
			}
			if (msg?.role === "toolResult") {
				toolResults.push({
					line: lineNo,
					toolName: msg.toolName,
					toolCallId: msg.toolCallId,
					isError: Boolean(msg.isError),
					text: textOfContent(msg.content),
				});
			}
		}
	}

	const firstAssistant = assistants[0];
	const finalAssistant = assistants[assistants.length - 1];

// --- Automatic coverage verification ---
let coverageVerified = null;
try {
	const covPath = join(resolve("."), "coverage/coverage-final.json");
	if (existsSync(covPath)) {
		const cov = JSON.parse(readFileSync(covPath, "utf8"));
		const srcFiles = new Set();
		let totalExecStmts = 0, totalStmts = 0, totalCovStmts = 0;
		let totalBranches = 0, totalCovBranches = 0;
		for (const [f, d] of Object.entries(cov)) {
			if (!f.includes("src/")) continue;
			srcFiles.add(f);
			const s = d.s || {}; const b = d.b || {};
			const sKeys = Object.keys(s); totalStmts += sKeys.length;
			totalCovStmts += sKeys.filter(k => s[k] > 0).length;
			totalExecStmts += Object.values(s).filter(v => v > 0).reduce((a, v) => a + v, 0);
			for (const v of Object.values(b)) {
				if (Array.isArray(v)) { totalBranches += v.length; totalCovBranches += v.filter(x => x > 0).length; }
			}
		}
		const srcDir = join(resolve("."), "src");
		let srcTsCount = 0;
		try {
			const walkDir = (dir) => { for (const f of readdirSync(dir, { withFileTypes: true })) { if (f.isDirectory() && !f.name.startsWith(".")) walkDir(join(dir, f.name)); else if (f.name.endsWith(".ts")) srcTsCount++; } };
			walkDir(srcDir);
		} catch { srcTsCount = 0; }
		const filesInCov = srcFiles.size;
		const filesNotInCov = Math.max(0, srcTsCount - filesInCov);
		coverageVerified = {
			srcTsCount,
			filesInCov,
			filesNotInCov,
			stmtsPct: totalStmts > 0 ? (totalCovStmts / totalStmts * 100).toFixed(1) : "n/a",
			stmtsStr: totalStmts > 0 ? `${totalCovStmts}/${totalStmts}` : "n/a",
			branchesPct: totalBranches > 0 ? (totalCovBranches / totalBranches * 100).toFixed(1) : "n/a",
			branchesStr: totalBranches > 0 ? `${totalCovBranches}/${totalBranches}` : "n/a",
		};
	}
} catch {}

// --- Model intent declaration check (first assistant should state intent) ---
const firstAssistantText = firstAssistant?.text ?? "";
const declaredIntent = /intent\s*(:|is|detected|understand)|анализ|analyze/i.test(firstAssistantText);

// --- Evidence entries count in final answer ---
const finalAnswerText = finalAssistant?.text ?? "";
const evidenceEntries = (finalAnswerText.match(/^\d+\.\s/gm) || finalAnswerText.match(/^-\s/gm) || []).length;
	const firstFoldLine = foldLines[0];
	const postFoldToolResults = firstFoldLine
		? toolResults.filter((result) => result.line > firstFoldLine)
		: [];
	const postFoldReads = postFoldToolResults.filter((result) => result.toolName === "read").length;
	const postFoldLookups = postFoldToolResults.filter((result) => result.toolName === "context_result_lookup").length;
	const finalText = finalAssistant?.text ?? "";
	const promptWords = String(prompt ?? "").toLowerCase().match(/[\p{L}\p{N}_-]{4,}/gu) ?? [];
	const retainedPromptWords = promptWords.filter((word) => finalText.toLowerCase().includes(word));
	const weakEvidenceWarnings = toolResults.filter((result) => /claim_strength|filtered_or_sliced|filtered_test_output|partial_file_excerpt|bounded excerpt|Do not infer|Do not claim/i.test(result.text)).length;
	const overclaimSignals = [
		/полная картина/i,
		/full picture|comprehensive picture/i,
		/все тесты|all tests/i,
		/line coverage|branch coverage|function coverage/i,
		/без тестов|no tests/i,
	].filter((pattern) => pattern.test(finalText)).map((pattern) => String(pattern));
	const scriptRows = Array.from(finalText.matchAll(/^\|\s*`[^`]+`\s*\|/gm)).length;
	const claimedScriptCount = /(?:npm\s+scripts?|scripts?)\D{0,16}(\d+)|(\d+)\s*(?:шт\.?|scripts?|скрипт(?:а|ов)?)/iu.exec(finalText);
	const claimedScripts = claimedScriptCount ? Number(claimedScriptCount[1] ?? claimedScriptCount[2]) : undefined;
	const listCountMismatch = Number.isFinite(claimedScripts) && scriptRows > 0 && claimedScripts !== scriptRows
		? { kind: "script_table_count", claimed: claimedScripts, observedRows: scriptRows }
		: undefined;
	const finalization = (() => {
		if (!finalAssistant) {
			return { status: "no-assistant" };
		}
		if (finalAssistant.stopReason === "error") {
			return { status: "error", reason: finalAssistant.toolCalls?.length ? "assistant_error_after_tools" : "assistant_error" };
		}
		if (finalAssistant.stopReason === "toolUse") {
			const noToolResults = toolCalls.some((call) => !toolResults.some((result) => result.toolCallId === call.id));
			return {
				status: "tool-loop",
				reason: noToolResults ? "awaiting_tool_results" : "tool_use_loop",
			};
		}
		if (finalAssistant.stopReason) {
			return { status: "terminal", reason: "model_completion", stopReason: finalAssistant.stopReason };
		}
		return { status: "terminal", reason: "unknown-stop" };
	})();
	const connectionErrors = assistants.filter((entry) => /connection error|ECONN|socket|timeout|TLS|certificate/i.test(String(entry.errorMessage ?? ""))).map((entry) => ({
		line: entry.line,
		stopReason: entry.stopReason,
		errorMessage: String(entry.errorMessage ?? ""),
	}));
	const resultEventPresent = /"type":"result"/i.test(rawText);
	const stderrText = String(run?.stderrPreview ?? "");
	const processAbortAfterToolBatch = Boolean(
		run?.exitCode !== undefined
		&& run.exitCode !== 0
		&& /Request was aborted/i.test(stderrText)
		&& finalization.status === "tool-loop"
		&& toolCalls.length > 0
		&& toolCalls.every((call) => toolResults.some((result) => result.toolCallId === call.id)),
	);

	return {
		run,
		sessionFile: jsonlPath,
		lineCount: rawLines.length,
		parseErrors,
		customCounts,
		markerHits,
		guidanceKinds,
		guidance: {
			kinds: guidanceKinds,
			delivery: guidanceDelivery,
			recordCount: guidanceSummaryEntry ? (guidanceSummaryEntry?.data?.records?.length ?? 0) : 0,
			hasContextMessage: hasCustomGuidanceMessage,
		},
		finalization,
		connectionErrors,
		resultEventPresent,
		processAbortAfterToolBatch,
		payloadDiagnostics,
		lastPayloadDiagnostic: payloadDiagnostics[payloadDiagnostics.length - 1],
		telemetryProviderRequestCount: latestTelemetry?.engine?.providerRequestCount,
		firstAssistant: firstAssistant ? {
			line: firstAssistant.line,
			input: firstAssistant.usage?.input,
			cacheRead: firstAssistant.usage?.cacheRead,
			output: firstAssistant.usage?.output,
			stopReason: firstAssistant.stopReason,
			toolCalls: firstAssistant.toolCalls.map((call) => call.name),
		} : undefined,
		assistantCount: assistants.length,
		toolCallCount: toolCalls.length,
		toolCalls: toolCalls.map((call) => ({ line: call.line, name: call.name, arguments: call.arguments })),
			toolResultCount: toolResults.length,
		toolUse: {
			toolCallCount: toolCalls.length,
			toolResultCount: toolResults.length,
			toolCallCoverage: toolCalls.length ? toolCalls.length === toolResults.length : true,
		},
		weakEvidenceWarnings,
		compaction: {
			count: compactionLines.length,
			lines: compactionLines,
		},
		foldDegradation: {
			foldDetected: foldLines.length > 0,
			foldLines,
			postFoldReads,
			postFoldLookups,
			postFoldToolResults: postFoldToolResults.length,
			postFoldReadRegret: latestTelemetry?.engine?.prune?.impact?.postFoldReadRegret ?? 0,
			taskRetention: {
				promptWordCount: promptWords.length,
				retainedPromptWords: Array.from(new Set(retainedPromptWords)),
			},
		},
		finalAssistant: finalAssistant ? {
			line: finalAssistant.line,
			input: finalAssistant.usage?.input,
			cacheRead: finalAssistant.usage?.cacheRead,
			output: finalAssistant.usage?.output,
			stopReason: finalAssistant.stopReason,
			errorMessage: finalAssistant.errorMessage,
			overclaimSignals,
			qualityFlags: [
				...(processAbortAfterToolBatch ? [{ kind: "process_abort_after_completed_tool_batch" }] : []),
				...(listCountMismatch ? [listCountMismatch] : []),
			],
			textPreview: finalText.slice(0, 1200),
		} : undefined,
	};
}

function readStdinIfAvailable() {
	if (process.stdin.isTTY) return undefined;
	try {
		const input = readFileSync(0, "utf8").trim();
		return input || undefined;
	} catch {
		return undefined;
	}
}

function markdownEvidence(analysis, args) {
	const label = args.label ?? "Pi Prompt Evidence";
	const final = analysis.finalAssistant;
	const connectionErrorLines = analysis.connectionErrors.map((entry) => `${entry.line}:${entry.stopReason}`);
	const finalState = analysis.finalization;
	const guidanceKinds = Object.entries(analysis.guidance.kinds).map(([kind, count]) => `${kind}=${count}`).join(", ");
	const qualityFlags = analysis.finalAssistant?.qualityFlags ?? [];
	const lastPayload = analysis.lastPayloadDiagnostic;
	const lines = [
		"",
		`## ${new Date().toISOString()} ${label}`,
		"",
		`Prompt:`,
		`- \`${String(args.prompt ?? "").replace(/`/g, "\\`")}\``,
		"",
		`Session:`,
		`- \`${analysis.sessionFile}\``,
		...(analysis.run ? [
			`- pi cycles: ${analysis.runs.length}; total exit codes: ${analysis.runs.map((run) => run.exitCode).join(", ")}.`,
			`- pi exit: ${analysis.run.exitCode}; stderr: ${analysis.run.stderrPreview || "none"}.`,
		] : []),
		"",
		`Observed:`,
		`- JSONL lines: ${analysis.lineCount}; parse errors: ${analysis.parseErrors}.`,
		`- First assistant: input=${analysis.firstAssistant?.input ?? "n/a"}, cacheRead=${analysis.firstAssistant?.cacheRead ?? "n/a"}, stop=${analysis.firstAssistant?.stopReason ?? "n/a"}, tools=${(analysis.firstAssistant?.toolCalls ?? []).join(", ") || "none"}.`,
		`- Tool calls: ${analysis.toolCallCount}; tool results: ${analysis.toolResultCount}; weak evidence warnings: ${analysis.weakEvidenceWarnings}.`,
		`- Finalization: status=${finalState.status}; finalStop=${final?.stopReason ?? "n/a"}; outputChars=${final?.output ?? 0}; cache=${final?.cacheRead ?? 0}/${final?.input ?? 0} (read/input).`,
		`- Connection errors: ${analysis.connectionErrors.length} line(s) [${connectionErrorLines.join(", ") || "none"}].`,
		`- Guidance markers: ${analysis.markerHits.length}; active kinds=${guidanceKinds || "none"}.`,
		`- Guidance stability: firstLine=${analysis.guidance.delivery.firstLine ?? "n/a"}; firstToolIntent=${analysis.guidance.delivery.firstToolIntentLine ?? "n/a"}; firstUserIntent=${analysis.guidance.delivery.firstUserIntentLine ?? "n/a"}.`,
		`- Tool-use coverage: calls=${analysis.toolUse.toolCallCount}; results=${analysis.toolUse.toolResultCount}; coverage=${analysis.toolUse.toolCallCoverage}.`,
		`- Result event present: ${analysis.resultEventPresent ? "yes" : "no"}.`,
		`- Process abort after completed tool batch: ${analysis.processAbortAfterToolBatch ? "yes" : "no"}.`,
		`- Provider payload diagnostics: count=${analysis.payloadDiagnostics.length}; telemetryRequests=${analysis.telemetryProviderRequestCount ?? "n/a"}; last=request#${lastPayload?.requestIndex ?? "n/a"} messages=${lastPayload?.messageCount ?? "n/a"} tail=${Array.isArray(lastPayload?.tailRoles) ? lastPayload.tailRoles.join(">") : "n/a"} last=${lastPayload?.lastMessageRole ?? "n/a"}.`,
		`- Host compactions: ${analysis.compaction.count}; lines=${analysis.compaction.lines.join(", ") || "none"}.`,
		`- Fold detected: ${analysis.foldDegradation.foldDetected}; post-fold reads=${analysis.foldDegradation.postFoldReads}; post-fold lookups=${analysis.foldDegradation.postFoldLookups}; post-fold read regret=${analysis.foldDegradation.postFoldReadRegret}.`,
		`- Task retention: promptWords=${analysis.foldDegradation.taskRetention.promptWordCount}; retained=${analysis.foldDegradation.taskRetention.retainedPromptWords.join(", ") || "none"}.`,
		`- Overclaim signals: ${(analysis.finalAssistant?.overclaimSignals ?? []).join(", ") || "none"}.`,
		`- Quality flags: ${qualityFlags.length ? qualityFlags.map((flag) => flag.claimed === undefined ? flag.kind : `${flag.kind} claimed=${flag.claimed} observed=${flag.observedRows}`).join(", ") : "none"}.`,
		"",
		`Final preview:`,
		"> " + String(analysis.finalAssistant?.textPreview ?? "").replace(/\n/g, "\n> ").slice(0, 1600),
		"",
	];
	return `${lines.join("\n")}\n`;
}

async function runPiOnce(args, retryIndex) {
	if (!args.prompt) throw new Error("Prompt required");
	const env = { ...process.env };
	if (args.config) {
		const configPath = resolve(args.config);
		if (!existsSync(configPath)) {
			throw new Error(`Config file not found: ${configPath}`);
		}
		const evidenceConfigPath = join(args.sessionDir, "context-engine.evidence.json");
		const config = JSON.parse(readFileSync(configPath, "utf8"));
		config.diagnostics = true;
		config.persistDiagnostics = true;
		writeFileSync(evidenceConfigPath, JSON.stringify(config, null, 2), "utf8");
		env.PI_CONTEXT_ENGINE_CONFIG = evidenceConfigPath;
	}
	const command = [
		"--session-dir", args.sessionDir,
		...(args.discoverExtensions ? [] : ["--no-extensions"]),
		"--extension", resolve(args.extension),
		"--model", args.model,
		"--thinking", args.thinking,
	];
	if (args.tools) command.push("--tools", args.tools);
	command.push("-p", args.prompt);

	return await new Promise((resolvePromise, reject) => {
		const child = spawn("pi", command, { cwd: process.cwd(), env, stdio: ["ignore", "pipe", "pipe"] });
		let stdout = "";
		let stderr = "";
		child.stdout.on("data", (chunk) => { stdout += chunk.toString(); });
		child.stderr.on("data", (chunk) => { stderr += chunk.toString(); });
		child.on("error", reject);
		child.on("close", (code) => {
			resolvePromise({
				code,
				stdout,
				stderr,
				source: "initial",
			});
		});
	});
}

async function runPi(args) {
	if (!args.prompt && !args.analyzeOnly) args.prompt = readStdinIfAvailable();
	if (!args.prompt && !args.analyzeOnly) usage();
	if (args.analyzeOnly && !args.sessionDir) usage();
	const sessionDir = resolve(args.sessionDir ?? join("/tmp", `pi-evidence-${Date.now()}`));
	args.sessionDir = sessionDir;
	if (!args.analyzeOnly) {
		if (existsSync(sessionDir) && !args.keep) rmSync(sessionDir, { recursive: true, force: true });
		mkdirSync(sessionDir, { recursive: true });
	}
	if (args.analyzeOnly) {
		const jsonlPath = latestJsonl(sessionDir);
		if (!jsonlPath) {
			throw new Error(`No JSONL session found in ${sessionDir}`);
		}
		const stderrPath = join(sessionDir, "pi.stderr.txt");
		const stdoutPath = join(sessionDir, "pi.stdout.txt");
		const stderr = existsSync(stderrPath) ? readFileSync(stderrPath, "utf8") : "";
		const stdout = existsSync(stdoutPath) ? readFileSync(stdoutPath, "utf8") : "";
		const run = (stderr || stdout)
			? {
				exitCode: stderr ? 1 : 0,
				source: "analyze-only",
				stdoutBytes: Buffer.byteLength(stdout, "utf8"),
				stderrBytes: Buffer.byteLength(stderr, "utf8"),
				stderrPreview: stderr.trim().slice(0, 1000),
			}
			: undefined;
		const analysis = analyzeSession(jsonlPath, args.prompt ?? "analyze-only", run);
		if (run) analysis.runs = [run];
		if (args.evidence) appendFileSync(resolve(args.evidence), markdownEvidence(analysis, args), "utf8");
		return analysis;
	}
	const maxRetries = args.retry ?? 3;
	let lastError = null;
	let runOutput = null;
	for (let attempt = 0; attempt < maxRetries; attempt++) {
		if (attempt > 0) {
			// Retry: re-create session dir, wait briefly
			if (!args.keep) rmSync(sessionDir, { recursive: true, force: true });
			mkdirSync(sessionDir, { recursive: true });
			await new Promise((r) => setTimeout(r, 2000));
		}
		runOutput = await runPiOnce(args, attempt);
		if (runOutput.code === 0) break;
		// Check if session was aborted/tool-loop by reading stderr
		const stderr = runOutput.stderr ?? "";
		if (stderr.includes("Request was aborted") || stderr.includes("tool_use_loop")) {
			console.error("[retry] attempt " + (attempt + 1) + " aborted/tool-loop, retrying...");
			lastError = runOutput;
			continue;
		}
		// Non-retriable error
		break;
	}
	// Merge stderr from retried attempts
	const mergedStderr = runOutput.stderr ?? "";
	let retriesUsed = 0;
	if (lastError) {
		// Count how many retries happened by looking at attempt IDs
		const runIdx = runOutput.stdout?.match(/--- Evidence:pi run (\\d+) ---/);
		retriesUsed = runIdx ? parseInt(runIdx[1], 10) : maxRetries - 1;
	}
	const run = {
		exitCode: runOutput.code,
		source: runOutput.source + (lastError ? " (retried)" : ""),
		stdoutBytes: Buffer.byteLength(runOutput.stdout ?? "", "utf8"),
		stderrBytes: Buffer.byteLength(String(runOutput.stderr ?? "") + (lastError?.stderr ?? ""), "utf8"),
		stderrPreview: String(lastError ? (lastError.stderr + "\n--- retry succeeded ---\n" + mergedStderr) : mergedStderr).trim().slice(0, 1000),
	};
	if (args.printPiOutput && runOutput?.stdout) process.stdout.write(runOutput.stdout);
	if (args.printPiOutput && runOutput?.stderr) process.stderr.write(runOutput.stderr);
	writeFileSync(join(sessionDir, "pi.stdout.txt"), runOutput.stdout, "utf8");
	writeFileSync(join(sessionDir, "pi.stderr.txt"), runOutput.stderr, "utf8");
	const jsonlPath = latestJsonl(sessionDir);
	if (!jsonlPath) {
		const stderr = runOutput?.stderr ?? "";
		const stdout = runOutput?.stdout ?? "";
		const hint = stderr || stdout
			? ""
			: "\nNo stdout/stderr was captured. In restricted sandboxes this usually means Pi/model access was blocked before the session file was created.";
		throw new Error(`No JSONL session found in ${sessionDir}. Last pi exit code: ${runOutput?.code}. ${hint}\nstdout: ${stdout.slice(0, 4000)}\nstderr: ${stderr.slice(0, 4000)}`);
	}
	const analysis = analyzeSession(jsonlPath, args.prompt, run);
	analysis.runs = [run];
	if (args.evidence) appendFileSync(resolve(args.evidence), markdownEvidence(analysis, args), "utf8");
	return analysis;
}

try {
	const args = parseArgs(process.argv.slice(2));
	runPi(args).then((analysis) => {
		console.log(JSON.stringify(analysis, null, 2));
	}).catch((error) => {
		console.error(error instanceof Error ? error.message : String(error));
		process.exit(1);
	});
} catch (error) {
	console.error(error instanceof Error ? error.message : String(error));
	process.exit(1);
}

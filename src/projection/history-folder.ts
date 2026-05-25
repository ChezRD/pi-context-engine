import type { ExtensionConfig } from "../config.ts";
import type { RuntimeState } from "../runtime-state.ts";
import type { ContextEnginePin, FoldBoundary, PinnedSkill, FoldResult } from "../types.ts";

/**
 * Rough token count: chars/4.
 * Handles string, ContentPart[], and tool_calls JSON.
 */
export function countMessageTokens(msg: any): number {
	if (typeof msg !== "object" || msg === null) return 0;
	let chars = 0;

	// Content: string or ContentPart[]
	if (typeof msg.content === "string") {
		chars += msg.content.length;
	} else if (Array.isArray(msg.content)) {
		for (const part of msg.content) {
			if (typeof part?.text === "string") chars += part.text.length;
		}
	}

	// tool_calls JSON
	if (Array.isArray(msg.tool_calls)) {
		for (const tc of msg.tool_calls) {
			if (tc?.function?.name) chars += tc.function.name.length;
			if (tc?.function?.arguments) chars += tc.function.arguments.length;
		}
	}

	// role adds small overhead
	chars += 4;

	return Math.ceil(chars / 4);
}

/**
 * Walk messages from end backwards, accumulating tokens.
 * Returns the split point where tail fits within tailBudget tokens.
 * Tail = most recent messages that fit within budget.
 * Head = everything older.
 */
export function estimateFoldBoundary(
	messages: any[],
	totalTokens: number,
	tailBudget: number,
): FoldBoundary {
	if (!Array.isArray(messages) || messages.length === 0) {
		return { ok: false, headMessages: [], tailMessages: [], headTokenCount: 0, tailTokenCount: 0, totalTokenCount: 0, tailStartIndex: 0, reason: "No messages" };
	}

	// Count tokens per message (lazy, from end)
	const msgTokens = messages.map(m => countMessageTokens(m));
	const computedTotal = msgTokens.reduce((a, b) => a + b, 0);

	// Walk backwards to find tail boundary
	let tailTokens = 0;
	let tailStartIdx = messages.length; // index of first tail message

	for (let i = messages.length - 1; i >= 0; i--) {
		const next = tailTokens + msgTokens[i];
		if (next > tailBudget) break;
		tailTokens = next;
		tailStartIdx = i;
	}

	// Seek nearest preceding USER message as the true tail start
	// This prevents cutting mid-conversation at an assistant or tool boundary.
	// Only expand if the additional messages still fit within budget (up to 2x).
	let userSeekIdx = tailStartIdx;
	let seekTokens = tailTokens;
	for (let i = tailStartIdx - 1; i >= 0; i--) {
		if (messages[i]?.role === "user") {
			const next = seekTokens + msgTokens[i];
			if (next <= tailBudget * 2) {
				userSeekIdx = i;
				seekTokens = next;
			} else {
				// Would blow budget; keep original boundary
				userSeekIdx = tailStartIdx;
			}
			break;
		}
	}
	if (userSeekIdx < tailStartIdx) {
		tailStartIdx = userSeekIdx;
		tailTokens = seekTokens;
	}

	const headMessages = messages.slice(0, tailStartIdx);
	const tailMessages = messages.slice(tailStartIdx);
	const headTokens = msgTokens.slice(0, tailStartIdx).reduce((a, b) => a + b, 0);

	return {
		ok: true,
		headMessages,
		tailMessages,
		headTokenCount: headTokens,
		tailTokenCount: tailTokens,
		totalTokenCount: computedTotal,
		tailStartIndex: tailStartIdx,
	};
}

/**
 * Find <skill-pin> blocks in messages, deduplicate by name.
 * Returns last occurrence of each skill name.
 */
export function extractPinnedSkills(messages: any[]): PinnedSkill[] {
	const seen = new Map<string, string>();
	const re = /<skill-pin name="([^"]+)">\n?([\s\S]*?)\n?<\/skill-pin>/g;

	for (const msg of messages) {
		if (typeof msg?.content !== "string") continue;
		let match: RegExpExecArray | null;
		// Reset lastIndex for each message
		re.lastIndex = 0;
		while ((match = re.exec(msg.content)) !== null) {
			seen.set(match[1], match[0]); // last invocation wins
		}
	}

	const result: PinnedSkill[] = [];
	for (const [id, content] of seen) {
		result.push({ id, content });
	}
	return result;
}

/**
 * Extract pinned constraint blocks: HIGH PRIORITY, User memory, Project memory.
 */
export function extractPinnedConstraints(messages: any[]): string[] {
	const blocks: string[] = [];
	const patterns = [
		// Bracket format: [HIGH PRIORITY ...]
		/\[HIGH PRIORITY[\s\S]*?(?=\n\n|$)/g,
		/\[User memory[\s\S]*?(?=\n\n|$)/g,
		/\[Project memory[\s\S]*?(?=\n\n|$)/g,
		// Markdown format: # ## HIGH PRIORITY ...
		/# \#\# (?:## )?HIGH PRIORITY[\s\S]*?(?=\n#|\n---|$)/g,
		/# \#\# (?:## )?User memory[\s\S]*?(?=\n#|\n---|$)/g,
		/# \#\# (?:## )?Project memory[\s\S]*?(?=\n#|\n---|$)/g,
	];

	for (const msg of messages) {
		if (typeof msg?.content !== "string") continue;
		for (const pattern of patterns) {
			pattern.lastIndex = 0;
			const matches = msg.content.matchAll(pattern);
			for (const m of matches) {
				blocks.push(m[0]);
			}
		}
	}

	return blocks;
}

/**
 * Extract <context-engine-pin> blocks from messages.
 * Namespaced syntax owned by pi-context-engine, not Pi.
 */
export function extractContextEnginePins(messages: any[]): ContextEnginePin[] {
	const result: ContextEnginePin[] = [];
	const seen = new Map<string, ContextEnginePin>();
	//                      kind="..."       name="..."         version="..."?
	const re = /<context-engine-pin\s+kind="([^"]+)"\s+name="([^"]+)"(?:\s+version="(\d+)")?\s*>\n?([\s\S]*?)\n?<\/context-engine-pin>/g;

	for (const msg of messages) {
		if (typeof msg?.content !== "string") continue;
		re.lastIndex = 0;
		let match: RegExpExecArray | null;
		while ((match = re.exec(msg.content)) !== null) {
			const key = `${match[1]}:${match[2]}`; // kind:name
			seen.set(key, {
				kind: match[1] as ContextEnginePin["kind"],
				name: match[2],
				version: match[3] ? parseInt(match[3], 10) : undefined,
				content: match[4].trim(),
				raw: match[0],
			});
		}
	}

	for (const pin of seen.values()) {
		result.push(pin);
	}
	return result;
}

/**
 * Build synthetic assistant message with fold marker + summary + preserved pins + constraints.
 */
export function buildFoldMessage(
	marker: string,
	summary: string,
	skills: PinnedSkill[],
	constraints: string[],
	enginePins?: ContextEnginePin[],
): any {
	const parts: string[] = [];
	parts.push(`${marker}\n${summary}`);

	// Engine-owned pins first (higher authority)
	if (enginePins && enginePins.length > 0) {
		parts.push("\n\n[Context Engine pinned material — preserved verbatim across fold:]");
		for (const pin of enginePins) {
			parts.push(`\n${pin.raw}`);
		}
	}

	// Legacy Reasonix-compatible skill pins
	if (skills.length > 0) {
		parts.push("\n\n[Active skill memos — preserved verbatim across the fold:]");
		for (const skill of skills) {
			parts.push(`\n${skill.content}`);
		}
	}

	if (constraints.length > 0) {
		parts.push("\n\n[Active constraints — preserved across the fold:]");
		for (const c of constraints) {
			parts.push(`\n${c}`);
		}
	}

	return {
		role: "assistant",
		content: parts.join(""),
		reasoning_content: "",
	};
}

/**
 * Remove trailing assistant+tool_call message pairs.
 * Returns [trimmed, removed].
 */
export function trimTrailingAssistantToolCalls(messages: any[]): [any[], number] {
	if (messages.length === 0) return [[], 0];

	const last = messages[messages.length - 1];
	if (last?.role === "assistant" && Array.isArray(last.tool_calls) && last.tool_calls.length > 0) {
		// Drop just this assistant message
		return [messages.slice(0, -1), 1];
	}
	return [messages, 0];
}

/**
 * Call LLM summarizer via pi-ai.
 */
export async function summarizeHead(
	pi: any,
	_systemPrompt: string,
	headMessages: any[],
	opts: { model?: string; timeoutMs?: number; signal?: AbortSignal },
): Promise<string> {
	const model = opts.model ?? "deepseek/deepseek-v4-flash";
	const timeoutMs = opts.timeoutMs ?? 15_000;
	const abortSignal = opts.signal;

	// Build summarizer prompt
	const summarizerMessages = [
		{ role: "system", content: "You are a conversation summarizer. Condense the following conversation history into a brief summary. Preserve key decisions, code discussed, user preferences, and any unresolved tasks. Be concise — 3-5 sentences." },
		{ role: "user", content: headMessages.map(m =>
			`[${m.role ?? "unknown"}]: ${typeof m.content === "string" ? m.content.slice(0, 2000) : JSON.stringify(m.content).slice(0, 2000)}`
		).join("\n\n") },
	];

	// Build timeout signal
	const timeoutSignal = AbortSignal.timeout(timeoutMs);
	const combinedSignal = abortSignal
		? AbortSignal.any?.([abortSignal, timeoutSignal]) ?? timeoutSignal
		: timeoutSignal;

	try {
		// Use pi's completion method
		const result = await pi.complete?.(model, summarizerMessages, {
			maxTokens: 1024,
			signal: combinedSignal,
		});

		if (!result) return "";
		const text = typeof result === "string" ? result : (result?.content ?? result?.message?.content ?? "");
		if (!text || text.trim().length === 0) return "";
		return text.trim();
	} catch (error: any) {
		if (error?.name === "AbortError" || error?.name === "TimeoutError") {
			return "";
		}
		throw error;
	}
}

/**
 * Main semantic fold orchestrator.
 * 1. Trim trailing tool calls
 * 2. Estimate fold boundary
 * 3. Extract pinned skills + constraints from head
 * 4. Summarize head
 * 5. Build synthetic message
 * 6. Persist state
 */
export async function semanticFold(
	pi: any,
	ctx: any,
	state: RuntimeState,
	opts?: { reason?: string; aggressive?: boolean; signal?: AbortSignal },
): Promise<FoldResult> {
	const config = state.config;
	const reason = opts?.reason ?? "auto";
	const aggressive = opts?.aggressive ?? false;

	// Get current context usage
	const ctxUsage = ctx?.getContextUsage?.();
	const ctxMax = ctxUsage?.ctxMax ?? ctxUsage?.maxTokens ?? ctxUsage?.limit ?? 0;
	if (!ctxMax || ctxMax <= 0) {
		return { ok: false, reason: "No ctxMax available" };
	}

	const tailBudget = (aggressive ? config.aggressiveFoldTailPct : config.foldTailPct) * ctxMax;

	// Get messages via session manager
	let entries: any[] = [];
	try {
		const branch = await ctx?.sessionManager?.getBranch?.();
		if (branch) {
			entries = [...branch].reverse(); // root → leaf
		}
	} catch {
		return { ok: false, reason: "Cannot access session branch" };
	}

	if (entries.length === 0) {
		return { ok: false, reason: "No session entries" };
	}

	const messages = entries.map((e: any) => e.message).filter(Boolean);

	// 1. Trim trailing tool calls
	const [trimmedMessages, removed] = trimTrailingAssistantToolCalls(messages);
	const _removed = removed; // unused but documented

	if (trimmedMessages.length === 0) {
		return { ok: false, reason: "No messages after trim" };
	}

	// 2. Estimate fold boundary
	const boundary = estimateFoldBoundary(trimmedMessages, 0, tailBudget);
	if (!boundary.ok || boundary.headMessages.length === 0) {
		return { ok: false, reason: boundary.reason ?? "No head to fold" };
	}

	// Check min savings
	const totalTokens = boundary.totalTokenCount || countMessageTokens(trimmedMessages[0]) * trimmedMessages.length;
	if (totalTokens > 0 && boundary.headTokenCount < totalTokens * config.minFoldSavings) {
		return { ok: false, reason: "Head too small for meaningful savings" };
	}

	// 3. Extract pinned skills + constraints + engine pins from HEAD messages only
	// Tail pins are still active messages — no need to duplicate in synthetic summary
	const skills = extractPinnedSkills(boundary.headMessages);
	const constraints = extractPinnedConstraints(boundary.headMessages);
	const enginePins = extractContextEnginePins(boundary.headMessages);

	// 4. Summarize head
	const systemPrompt = ctx?.model?.systemPrompt ?? ctx?.config?.systemPrompt ?? "";
	const summary = await summarizeHead(pi, systemPrompt, boundary.headMessages, {
		model: config.foldSummaryModel === "auto" || config.foldSummaryModel === "default" ? ctx?.model?.id : config.foldSummaryModel,
		timeoutMs: config.foldTimeoutMs,
		signal: opts?.signal,
	});

	if (!summary || summary.trim().length === 0) {
		return { ok: false, reason: "Summarizer returned empty" };
	}

	// 5. Build synthetic message
	const syntheticMsg = buildFoldMessage(
		config.semanticFoldMarker,
		summary,
		skills,
		constraints,
		enginePins,
	);

	// 6. Persist fold state
	state.engine.semanticFold = {
		active: true,
		foldedThisTurn: true,
		syntheticMsg,
		tailStartEntryId: entries[boundary.tailStartIndex]?.id ?? null,
	};

	const ctxAfterRatio = ctxMax > 0 ? (boundary.tailTokenCount / ctxMax) : 0;

	return {
		ok: true,
		savedContext: boundary.headTokenCount,
		totalTokens: totalTokens,
		headMessages: boundary.headMessages.length,
		tailMessages: boundary.tailMessages.length,
		ctxAfterPct: ctxAfterRatio,
	};
}

/**
 * Clear active fold state (e.g., on invalidation).
 */
export function clearFold(state: RuntimeState): void {
	state.engine.semanticFold = { active: false, foldedThisTurn: false };
}

/**
 * Check if fold is still valid (system prompt unchanged).
 */
export function isFoldValid(state: RuntimeState, systemPromptHash?: string): boolean {
	if (!state.engine.semanticFold.active) return false;
	if (!state.engine.prefixHash) return true;
	if (systemPromptHash && systemPromptHash !== state.engine.prefixHash) return false;
	return true;
}

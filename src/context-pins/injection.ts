/**
 * Prompt injection for pin/memory blocks via before_agent_start.
 * Injects deterministic pin blocks as a stable system-prompt suffix.
 */

import type { RuntimeState } from "../runtime-state.ts";
import type { ExtensionConfig } from "../config.ts";

/**
 * Build the pin/memory injection block for the system prompt.
 * Returns empty string if no injection is enabled.
 */
export function buildPinInjectionBlock(config: ExtensionConfig, state: RuntimeState): string {
	const parts: string[] = [];

	if (!config.skillPinning && !config.memoryInjection && !config.priorityInjection) {
		return "";
	}

	if (config.skillPinning || config.priorityInjection) {
		parts.push("# Context Engine Pins\n\nPins survive context folds and add tokens to every subsequent model call.\n\nPrefer `context_pin_skill` for loaded skills — full skill text preserved across folds.\n\nUse `context_pin` **only** when all three apply:\n1. User explicitly asked to remember or persist something\n2. Forgetting the pin would produce a demonstrably incorrect answer or repeat an irreversible action\n3. The pinned information cannot be derived from code, docs, git, or filesystem\n\nOtherwise don\u0027t pin.");
		parts.push("# System blocks — internal only\n\n`<context-engine-summary>` blocks are internal metadata. Never output them to the user. They are fold artifacts the engine inserts into history — you must not reproduce, echo, or reference their format in responses.");
	}

	// Priority/high-priority blocks
	if (config.priorityInjection) {
		const highPins = state.pinStore.getByKind("priority");
		if (highPins.length > 0) {
			const highContent = highPins
				.map(p => p.priority === "high" ? `- [HIGH] ${p.content}` : `- ${p.content}`)
				.join("\n");
			parts.push(`# HIGH PRIORITY constraints (context-engine)\n${highContent}`);
		}
	}

	// Memory blocks
	if (config.memoryInjection) {
		const userMemory = state.pinStore.getByKind("user-memory");
		const projectMemory = state.pinStore.getByKind("project-memory");
		if (userMemory.length > 0) {
			parts.push(`# User memory — context-engine\n${userMemory.map(p => `- ${p.content}`).join("\n")}`);
		}
		if (projectMemory.length > 0) {
			parts.push(`# Project memory — context-engine\n${projectMemory.map(p => `- ${p.content}`).join("\n")}`);
		}
	}

	return parts.join("\n\n");
}

/**
 * Compute a deterministic hash of the injection block for cache checkpoint comparison.
 */
export function computeInjectionHash(config: ExtensionConfig, state: RuntimeState): string {
	const block = buildPinInjectionBlock(config, state);
	let hash = 0;
	for (let i = 0; i < block.length; i++) {
		hash = ((hash << 5) - hash) + block.charCodeAt(i);
		hash |= 0;
	}
	return Math.abs(hash).toString(16).padStart(8, "0");
}

/**
 * Called from before_agent_start hook.
 * Returns { systemPrompt: ... } if injection block is non-empty, or undefined.
 */
export function applyPinInjection(event: any, state: RuntimeState): { systemPrompt?: string } | undefined {
	const config = state.config;
	// Respect master cachePromptInjection flag
	if (!config.cachePromptInjection) return undefined;
	const block = buildPinInjectionBlock(config, state);
	if (!block) return undefined;

	// Append to existing systemPrompt if available
	const existingPrompt = event?.systemPrompt ?? "";
	const separator = existingPrompt ? "\n\n" : "";
	return { systemPrompt: existingPrompt + separator + block };
}

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
		parts.push("# Context Engine Pins\n\nActive pinned blocks are authoritative and must survive summarization.\nWhen using a loaded skill, prefer `context_pin_skill` so the full skill body can be preserved across semantic folds.\nUse `context_pin` for compact high-priority rules, user decisions, and project invariants that must survive fold.");
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

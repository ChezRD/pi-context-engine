/**
 * Contextual skill-pin suggestion detector.
 * Watches for repeated skill usage patterns and produces suggestions.
 */

import type { RuntimeState } from "../runtime-state.ts";

export interface PinSuggestion {
	kind: "skill" | "priority";
	name: string;
	reason: string;
	confidence: number; // 0-1
}

const SKILL_SLASH_RE = /\/skill:([\w-]+)/g;

/**
 * Detect /skill:name usage in a message content.
 * Returns matched skill names.
 */
export function detectSlashSkillInvocations(content: string): string[] {
	const names: string[] = [];
	let match: RegExpExecArray | null;
	SKILL_SLASH_RE.lastIndex = 0;
	while ((match = SKILL_SLASH_RE.exec(content)) !== null) {
		names.push(match[1]);
	}
	return names;
}

/**
 * Track skill usage frequency for suggestion detection.
 * Simple in-memory counter, keyed by skill name.
 */
const skillUseCounts = new Map<string, number>();

const CONFIRM_THRESHOLD = 2;
const AUTO_PIN_THRESHOLD = 4;

/**
 * Record a skill usage and return suggestion if threshold crossed.
 */
export function recordSkillUse(name: string): PinSuggestion | null {
	const count = (skillUseCounts.get(name) ?? 0) + 1;
	skillUseCounts.set(name, count);

	if (count >= CONFIRM_THRESHOLD && count < AUTO_PIN_THRESHOLD) {
		return {
			kind: "skill",
			name,
			reason: `repeated ${count}×`,
			confidence: Math.min(0.3 + count * 0.2, 0.8),
		};
	}

	return null;
}

/**
 * Check messages for skill invocations and produce suggestions.
 */
export function checkForPinSuggestions(content: string): PinSuggestion[] {
	const suggestions: PinSuggestion[] = [];
	const names = detectSlashSkillInvocations(content);

	for (const name of names) {
		const suggestion = recordSkillUse(name);
		if (suggestion) suggestions.push(suggestion);
	}

	return suggestions;
}

/**
 * Format suggestions as notification text.
 */
export function formatPinSuggestions(suggestions: PinSuggestion[]): string {
	if (suggestions.length === 0) return "";
	return suggestions.map(s =>
		`suggested pin: ${s.kind}=${s.name} · ${s.reason} · confirm with context_pin_skill`
	).join("\n");
}

/**
 * Reset skill use counters (e.g. on session start).
 */
export function resetSkillCounts(): void {
	skillUseCounts.clear();
}

import { createHash } from "node:crypto";
import type { RuntimeState } from "../runtime-state.ts";
import { t } from "../i18n/index.ts";

function stable(value: unknown): string {
	if (value === null || typeof value !== "object") return JSON.stringify(value);
	if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
	return `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${JSON.stringify(k)}:${stable(v)}`).join(",")}}`;
}

function hash(value: unknown): string {
	return createHash("sha256").update(stable(value)).digest("hex");
}

function messageHash(message: any): string {
	return hash({ role: message?.role, content: message?.content, toolCalls: message?.toolCalls, name: message?.name, customType: message?.customType });
}

function prefixParts(messages: any[]): unknown[] {
	const parts: unknown[] = [];
	for (const message of messages) {
		if (message?.role === "user" && parts.length > 0) break;
		if (message?.role === "tool") break;
		parts.push({ role: message?.role, content: message?.content, name: message?.name, customType: message?.customType });
	}
	return parts;
}

export function checkPrefixStability(event: any, ctx: any, state: RuntimeState): void {
	if (!state.config.enabled || !state.config.prefixStabilityCheck) return;
	const messages = Array.isArray(event?.messages) ? event.messages : [];
	const engine = state.engine as any;

	// This context-level heuristic is intentionally separate from provider prefix
	// fingerprinting. Provider prefix is the cache source of truth; context events
	// can contain summaries/projections/reloaded history and must not poison 99%
	// eligibility or spam UI during normal work.
	const prefixFingerprint = hash(prefixParts(messages));
	if (!engine.contextPrefixFingerprint) engine.contextPrefixFingerprint = prefixFingerprint;
	else if (engine.contextPrefixFingerprint !== prefixFingerprint) {
		state.engine.lastWarning = "prefix";
		engine.contextPrefixFingerprint = prefixFingerprint;
		if (state.config.strictPrefixWarnings) ctx?.ui?.notify?.(t("engine.prefixChanged"), "warning");
	}

	const history = messages.filter((message: any) => message?.role !== "system").map(messageHash).join("|");
	const previous = engine.contextHistoryFingerprint;
	if (previous && history && !history.startsWith(previous)) {
		state.engine.historyRewriteCount++;
		state.engine.lastWarning = "history";
		if (state.config.strictPrefixWarnings) ctx?.ui?.notify?.(t("engine.historyRewritten"), "warning");
	}
	if (history) engine.contextHistoryFingerprint = history;
}

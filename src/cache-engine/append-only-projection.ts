import type { RuntimeState } from "../runtime-state.ts";
import { stableHash } from "./prefix-fingerprint.ts";
import { t } from "../i18n/index.ts";

function entryId(message: any): string | undefined {
	return typeof message?.entryId === "string" ? message.entryId : typeof message?.id === "string" ? message.id : undefined;
}

function tailFrom(messages: any[], startId?: string): any[] {
	if (!startId) return messages.filter((message) => message?.role !== "system");
	const index = messages.findIndex((message) => entryId(message) === startId);
	return index >= 0 ? messages.slice(index) : messages.filter((message) => message?.role !== "system");
}

function isAppendOnly(previousHash: string | undefined, previousTail: string | undefined, tail: any[]): boolean {
	if (!previousHash || !previousTail) return true;
	const next = JSON.stringify(tail);
	return next.startsWith(previousTail) || stableHash(tail) === previousHash;
}

export function activateAppendOnlyProjectionFromCompact(result: any, state: RuntimeState): void {
	if (!state.config.appendOnlyProjection) return;
	const summary = typeof result?.summary === "string" ? result.summary : undefined;
	const firstKeptEntryId = typeof result?.firstKeptEntryId === "string" ? result.firstKeptEntryId : undefined;
	if (!summary || !firstKeptEntryId) return;
	state.engine.appendOnly.enabled = true;
	state.engine.appendOnly.projectionActive = true;
	state.engine.appendOnly.stableSummary = { role: "custom", customType: "context-engine-summary", content: [{ type: "text", text: summary }], name: "context_cache_stable_summary" };
	state.engine.appendOnly.tailStartEntryId = firstKeptEntryId;
	state.engine.appendOnly.tailFingerprint = undefined;
	state.engine.appendOnly.invalidatedReasonKey = undefined;
}

export function applyAppendOnlyProjection(event: any, ctx: any, state: RuntimeState): any | undefined {
	const st = state.engine.appendOnly;
	st.enabled = state.config.appendOnlyProjection;
	if (!state.config.enabled || !state.config.appendOnlyProjection || !st.projectionActive) return undefined;
	const messages = Array.isArray(event?.messages) ? event.messages : [];
	const system = messages.find((message: any) => message?.role === "system");
	const tail = tailFrom(messages, st.tailStartEntryId);
	const previousTail = (st as any).__tailString as string | undefined;
	const nextHash = stableHash(tail);
	if (!isAppendOnly(st.tailFingerprint, previousTail, tail)) {
		st.projectionActive = false;
		st.invalidatedReasonKey = "engine.appendOnly.invalidated.tailChanged";
		ctx?.ui?.notify?.(t("engine.appendOnly.invalidated"), "warning");
		return undefined;
	}
	st.tailFingerprint = nextHash;
	(st as any).__tailString = JSON.stringify(tail);
	return { messages: [...(system ? [system] : []), ...(st.stableSummary ? [st.stableSummary] : []), ...tail] };
}

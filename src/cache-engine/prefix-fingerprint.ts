import { createHash } from "node:crypto";
import type { RuntimeState } from "../runtime-state.ts";
import { t } from "../i18n/index.ts";
import { formatPrefixReason } from "../prefix-reasons.ts";
import { currentCacheSegment, handlePrefixCheckpoint } from "./cache-checkpoints.ts";

export interface CanonicalPrefix {
	model?: string;
	systemHash?: string;
	toolsHash: string;
	reasoning: string;
	temperature?: number;
}

export interface PrefixDrift {
	hard: boolean;
	reasons: Array<"model" | "system" | "tools" | "reasoning">;
}

export function stableHash(value: unknown): string {
	return createHash("sha256").update(stableStringify(value)).digest("hex");
}

function stableStringify(value: unknown): string {
	if (value === null || typeof value !== "object") return JSON.stringify(value);
	if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
	return `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`).join(",")}}`;
}

function payloadFrom(event: any): any {
	return event?.payload ?? event?.body ?? event?.request?.body ?? event ?? {};
}

export function normalizeTools(tools: any[] | undefined): Array<{ name: unknown; description: unknown; parameters: unknown }> {
	if (!Array.isArray(tools)) return [];
	return tools
		.map((tool) => ({
			name: tool?.function?.name ?? tool?.name,
			description: tool?.function?.description ?? tool?.description,
			parameters: tool?.function?.parameters ?? tool?.input_schema ?? tool?.parameters,
		}))
		.filter((tool) => tool.name)
		.sort((a, b) => String(a.name).localeCompare(String(b.name)));
}

function modelId(payload: any, ctx: any): string | undefined {
	return typeof payload?.model === "string" ? payload.model : typeof ctx?.model?.id === "string" ? ctx.model.id : typeof ctx?.model?.name === "string" ? ctx.model.name : undefined;
}

export function extractCachePrefix(event: any, ctx: any): CanonicalPrefix {
	const p = payloadFrom(event);
	const messages = Array.isArray(p.messages) ? p.messages : [];
	const system = messages.filter((m: any) => m?.role === "system");
	return {
		model: modelId(p, ctx),
		systemHash: stableHash(system),
		toolsHash: stableHash(normalizeTools(p.tools)),
		reasoning: String(p.reasoning ?? p.reasoning_effort ?? p.thinking ?? ""),
		temperature: typeof p.temperature === "number" ? p.temperature : undefined,
	};
}

export function diffPrefix(previous: CanonicalPrefix, next: CanonicalPrefix): PrefixDrift {
	const reasons: PrefixDrift["reasons"] = [];
	if (previous.model !== next.model) reasons.push("model");
	if (previous.systemHash !== next.systemHash) reasons.push("system");
	if (previous.toolsHash !== next.toolsHash) reasons.push("tools");
	if (previous.reasoning !== next.reasoning) reasons.push("reasoning");
	return { reasons, hard: reasons.some((reason) => reason === "model" || reason === "system" || reason === "tools") };
}

export function shouldNotifyPrefixDrift(state: RuntimeState, drift: PrefixDrift): boolean {
	if (drift.reasons.length === 0) return false;
	const reasonKey = drift.reasons.join(",");
	const sameReason = state.engine.lastPrefixWarningReason === reasonKey;
	const cooldownTurns = state.engine.turnIndex - (state.engine.lastPrefixWarningTurn ?? -999);
	if (!sameReason) return true;
	if (drift.hard && cooldownTurns >= 10) return true;
	return false;
}

export function handleProviderPrefix(event: any, ctx: any, state: RuntimeState): void {
	if (!state.config.enabled || !state.config.prefixFingerprint) return;
	const prefix = extractCachePrefix(event, ctx);
	const prefixHash = stableHash(prefix);
	const previousPrefix = (state as any).__lastCachePrefix as CanonicalPrefix | undefined;
	if (!previousPrefix) {
		state.engine.prefixHash = prefixHash;
		state.engine.prefixFingerprint = prefixHash;
		state.engine.toolHash = prefix.toolsHash;
		state.engine.lastProviderModelId = prefix.model;
		state.engine.lastProviderPrefixHash = prefixHash;
		const segment = currentCacheSegment(state);
		segment.modelId = prefix.model;
		segment.provider = state.detection?.provider;
		segment.prefixHash = prefixHash;
		segment.toolHash = prefix.toolsHash;
		state.engine.lastPrefixNotificationSuppressed = false;
		(state as any).__lastCachePrefix = prefix;
		return;
	}
	const drift = diffPrefix(previousPrefix, prefix);
	state.engine.prefixHash = prefixHash;
	state.engine.prefixFingerprint = prefixHash;
	state.engine.toolHash = prefix.toolsHash;
	(state as any).__lastCachePrefix = prefix;
	if (drift.reasons.length === 0) {
		state.engine.lastProviderModelId = prefix.model;
		state.engine.lastProviderPrefixHash = prefixHash;
		state.engine.lastPrefixNotificationSuppressed = false;
		return;
	}
	handlePrefixCheckpoint(state, drift, prefix);
	state.engine.lastProviderModelId = prefix.model;
	state.engine.lastProviderPrefixHash = prefixHash;
	state.engine.prefixDriftCount++;
	if (state.config.toolFingerprint && drift.reasons.includes("tools")) state.engine.toolHashChanges++;
	state.engine.lastPrefixChangeTurn = state.engine.turnIndex;
	state.engine.lastPrefixChangeReason = drift.reasons.join(", ");
	state.engine.lastWarning = "prefix";
	const canWarn = state.config.strictPrefixWarnings;
	if (canWarn && shouldNotifyPrefixDrift(state, drift)) {
		state.engine.lastPrefixWarningReason = drift.reasons.join(",");
		state.engine.lastPrefixWarningTurn = state.engine.turnIndex;
		state.engine.lastPrefixNotificationSuppressed = false;
		ctx?.ui?.notify?.(t(state.config, "engine.prefixChangedReason", { reason: formatPrefixReason(state.config, state.engine.lastPrefixChangeReason, "detail") }), "warning");
	} else {
		state.engine.lastPrefixNotificationSuppressed = true;
	}
}

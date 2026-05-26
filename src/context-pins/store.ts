import type { ContextEnginePin, PinnedContextKind } from "../types.ts";
import { safeAppendEntry } from "../stale-context.ts";

const CUSTOM_TYPE = "context-engine-pin";
const MAX_CONTENT_CHARS = 4096;

export type PinSource =
	| "explicit-tool"
	| "explicit-skill-tool"
	| "slash-skill"
	| "context-inferred"
	| "frequency-inferred"
	| "imported-memory";

export interface PinnedContextRecord {
	id: string;
	kind: PinnedContextKind;
	name: string;
	content: string;
	scope: "session" | "project" | "global";
	createdAt: number;
	updatedAt: number;
	priority?: "normal" | "high";
	source: PinSource;
	confidence?: number;
	sourcePath?: string;
	stableHash: string;
}

/**
 * Deterministic stable hash for a record, used for cache checkpoint comparison.
 */
export function computeStableHash(kind: string, name: string, content: string, scope: string): string {
	let hash = 0;
	const input = `${kind}|${scope}|${name}|${content}`;
	for (let i = 0; i < input.length; i++) {
		const chr = input.charCodeAt(i);
		hash = ((hash << 5) - hash) + chr;
		hash |= 0; // Convert to 32bit integer
	}
	return Math.abs(hash).toString(16).padStart(8, "0");
}

/**
 * Compute combined hash for all active pins — used for checkpoint drift detection.
 */
export function computePinSetHash(records: PinnedContextRecord[]): string {
	if (records.length === 0) return "0";
	const combined = records
		.map(r => r.stableHash)
		.sort()
		.join("|");
	return computeStableHash("pinset", "all", combined, "global");
}

/**
 * In-memory store of pinned context records.
 * Persisted as custom session entries so state survives /reload.
 */
export class PinStore {
	private records = new Map<string, PinnedContextRecord>();
	private persistFn: ((record: PinnedContextRecord) => void) | null = null;

	/** Register a persistence callback (called on every add/remove/update). */
	setPersist(fn: (record: PinnedContextRecord) => void): void {
		this.persistFn = fn;
	}

	/** Restore a single record from persisted entry (e.g. on session restore). */
	restore(record: PinnedContextRecord): void {
		const key = this.makeKey(record.kind, record.scope, record.name);
		this.records.set(key, record);
	}

	/** Add or update a pin. Returns true if new/modified, false if unchanged. */
	set(
		kind: PinnedContextKind,
		name: string,
		content: string,
		opts?: {
			scope?: "session" | "project" | "global";
			priority?: "normal" | "high";
			source?: PinSource;
			confidence?: number;
			sourcePath?: string;
		},
	): boolean {
		const scope = opts?.scope ?? "session";
		const key = this.makeKey(kind, scope, name);
		const existing = this.records.get(key);
		const now = Date.now();

		// Clamp content size
		const clamped = content.length > MAX_CONTENT_CHARS
			? content.slice(0, MAX_CONTENT_CHARS)
			: content;

		const stableHash = computeStableHash(kind, name, clamped, scope);

		// Skip if unchanged
		if (existing && existing.stableHash === stableHash) {
			return false;
		}

		const record: PinnedContextRecord = {
			id: key,
			kind,
			name,
			content: clamped,
			scope,
			createdAt: existing?.createdAt ?? now,
			updatedAt: now,
			priority: opts?.priority ?? existing?.priority,
			source: opts?.source ?? existing?.source ?? "explicit-tool",
			confidence: opts?.confidence ?? existing?.confidence,
			sourcePath: opts?.sourcePath ?? existing?.sourcePath,
			stableHash,
		};

		this.records.set(key, record);
		this.persistFn?.(record);
		return true;
	}

	/** Remove a pin by kind + name. Returns true if removed. */
	remove(kind: PinnedContextKind, name: string, scope?: string): boolean {
		const key = this.makeKey(kind, scope ?? "session", name);
		return this.records.delete(key);
	}

	/** Get all active pins, ordered deterministically. */
	getAll(): PinnedContextRecord[] {
		return [...this.records.values()]
			.sort((a, b) => `${a.kind}:${a.scope}:${a.name}`.localeCompare(`${b.kind}:${b.scope}:${b.name}`));
	}

	/** Get pins matching a kind. */
	getByKind(kind: PinnedContextKind): PinnedContextRecord[] {
		return this.getAll().filter(r => r.kind === kind);
	}

	/** Get a single pin by kind + name. */
	get(kind: PinnedContextKind, name: string, scope?: string): PinnedContextRecord | undefined {
		return this.records.get(this.makeKey(kind, scope ?? "session", name));
	}

	/** Clear all pins. */
	clear(): void {
		this.records.clear();
	}

	/** Count of active pins. */
	get count(): number {
		return this.records.size;
	}

	/** Combined hash of all pins. */
	get combinedHash(): string {
		return computePinSetHash(this.getAll());
	}

	/** Convert all records to ContextEnginePin[] for fold preservation. */
	toEnginePins(): ContextEnginePin[] {
		return this.getAll().map(r => ({
			kind: r.kind,
			name: r.name,
			content: r.content,
			priority: r.priority,
			raw: `<context-engine-pin kind="${r.kind}" name="${r.name}" version="1">\n${r.content}\n</context-engine-pin>`,
		}));
	}

	private makeKey(kind: string, scope: string, name: string): string {
		return `${kind}:${scope}:${name}`;
	}
}

/**
 * Persist a pin record via pi.appendEntry.
 */
export function persistPinEntry(pi: any, record: PinnedContextRecord): void {
	safeAppendEntry(pi, CUSTOM_TYPE, {
		version: 1,
		record,
	});
}

/**
 * Restore all pin entries from session data.
 * Returns number of restored pins.
 */
export function restorePinsFromSession(ctx: any, store: PinStore): number {
	const entries = ctx?.sessionManager?.getEntries?.() ?? ctx?.sessionManager?.getBranch?.() ?? [];
	let count = 0;
	for (const entry of entries) {
		if (entry?.type === "custom" && entry?.customType === CUSTOM_TYPE && entry?.data?.version === 1 && entry?.data?.record) {
			store.restore(entry.data.record);
			count += 1;
		}
	}
	return count;
}

/** Max content chars for diagnostics display. */
export { MAX_CONTENT_CHARS };

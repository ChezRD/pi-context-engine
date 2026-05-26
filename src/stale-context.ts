const STALE_CONTEXT_PATTERNS = [
	"This extension ctx is stale",
	"ctx is stale after session replacement",
	"stale after session replacement or reload",
	"Do not use a captured pi or command ctx",
];

export function isStaleContextError(error: unknown): boolean {
	const message = error instanceof Error ? error.message : String(error ?? "");
	return STALE_CONTEXT_PATTERNS.some((pattern) => message.includes(pattern));
}

export function safeAppendEntry(pi: any, customType: string, data?: unknown): boolean {
	if (typeof pi?.appendEntry !== "function") return false;
	try {
		pi.appendEntry(customType, data);
		return true;
	} catch (error) {
		if (isStaleContextError(error)) return false;
		throw error;
	}
}

export function safeCall<T>(fn: () => T, fallback: T): T {
	try {
		return fn();
	} catch (error) {
		if (isStaleContextError(error)) return fallback;
		throw error;
	}
}

export async function safeCallAsync<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
	try {
		return await fn();
	} catch (error) {
		if (isStaleContextError(error)) return fallback;
		throw error;
	}
}

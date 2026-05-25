/**
 * Shared utility functions.
 */
export function formatTokens(n: number): string {
	if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
	if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
	return String(n);
}

export function buildProgressBar(percent: number, width = 10, style: "blocks" | "sparkline" | "text" = "blocks"): string {
	const p = Math.max(0, Math.min(1, percent));
	if (style === "text") return "";
	if (style === "sparkline") {
		const slots = Math.max(3, width);
		const marker = Math.min(slots - 1, Math.round(p * (slots - 1)));
		return `${"·".repeat(marker)}◆${"·".repeat(slots - marker - 1)}`;
	}
	const filled = Math.round(p * width);
	const empty = width - filled;
	return `[${"█".repeat(filled)}${"░".repeat(empty)}]`;
}

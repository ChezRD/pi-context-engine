import { t } from "./i18n/index.ts";

type PrefixReason = "model" | "system" | "tools" | "reasoning";

const KNOWN_REASONS: PrefixReason[] = ["model", "system", "tools", "reasoning"];

export function parsePrefixReasons(reason: string | undefined): PrefixReason[] {
	if (!reason) return [];
	const parts = reason.split(",").map((part) => part.trim()).filter(Boolean);
	return parts.filter((part): part is PrefixReason => KNOWN_REASONS.includes(part as PrefixReason));
}

export function formatPrefixReason(config: unknown, reason: string | undefined, mode: "compact" | "detail" = "compact"): string {
	const reasons = parsePrefixReasons(reason);
	if (reasons.length === 0) return t(config, "prefix.reason.unknown");

	if (mode === "compact") {
		if (reasons.length === 1) return t(config, `prefix.reasonCompact.${reasons[0]}`);
		if (reasons.includes("model") && reasons.includes("system") && reasons.includes("tools")) return t(config, "prefix.reasonCompact.requestShape");
		return t(config, "prefix.reasonCompact.multiple", { count: reasons.length });
	}

	return reasons.map((item) => t(config, `prefix.reason.${item}`)).join(", ");
}

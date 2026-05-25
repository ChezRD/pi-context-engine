import type { DeepSeekDetection } from "./types.ts";
import { t } from "./i18n/index.ts";

function lower(value: unknown): string {
	return typeof value === "string" ? value.toLowerCase() : "";
}

function getCompat(model: any): Record<string, unknown> {
	return model && typeof model === "object" && model.compat && typeof model.compat === "object" ? model.compat : {};
}

export function detectDeepSeekModel(model: any): DeepSeekDetection {
	const provider = lower(model?.provider);
	const id = lower(model?.id ?? model?.name);
	const name = lower(model?.name);
	const compat = getCompat(model);
	const thinkingFormat = lower(compat.thinkingFormat);
	const requiresReasoning = compat.requiresReasoningContentOnAssistantMessages === true;
	const mentionsDeepSeek = provider.includes("deepseek") || id.includes("deepseek") || name.includes("deepseek");
	const warnings: string[] = [];

	if (thinkingFormat === "deepseek") {
		if (!requiresReasoning && (model?.reasoning === true || id.includes("v4") || id.includes("reasoner"))) {
			warnings.push(t("model.warning.requiresReasoningContent"));
		}
		const map = model?.thinkingLevelMap ?? {};
		if ((id.includes("v4") || id.includes("reasoner")) && (map.high !== "high" || map.xhigh !== "max")) {
			warnings.push(t("model.warning.thinkingLevelMap"));
		}
		return { kind: provider === "deepseek" ? "native" : "compatible", ok: warnings.length === 0, warnings, modelId: model?.id, provider: model?.provider };
	}

	if (mentionsDeepSeek) {
		warnings.push(t("model.warning.missingThinkingFormat"));
		if (model?.reasoning === true && !requiresReasoning) warnings.push(t("model.warning.reasoningContent"));
		return { kind: "misconfigured", ok: false, warnings, modelId: model?.id, provider: model?.provider };
	}

	return { kind: "not-deepseek", ok: true, warnings, modelId: model?.id, provider: model?.provider };
}

export function isDeepSeekDetectionActive(detection: DeepSeekDetection): boolean {
	return detection.kind === "native" || detection.kind === "compatible" || detection.kind === "misconfigured";
}

import type { DeepSeekDetection } from "./types.ts";

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
			warnings.push("DeepSeek thinking model should set compat.requiresReasoningContentOnAssistantMessages=true.");
		}
		const map = model?.thinkingLevelMap ?? {};
		if ((id.includes("v4") || id.includes("reasoner")) && (map.high !== "high" || map.xhigh !== "max")) {
			warnings.push("DeepSeek thinkingLevelMap should map high->high and xhigh->max.");
		}
		return { kind: provider === "deepseek" ? "native" : "compatible", ok: warnings.length === 0, warnings, modelId: model?.id, provider: model?.provider };
	}

	if (mentionsDeepSeek) {
		warnings.push("Model looks like DeepSeek but lacks compat.thinkingFormat='deepseek'.");
		if (model?.reasoning === true && !requiresReasoning) warnings.push("Reasoning DeepSeek model should preserve assistant reasoning_content.");
		return { kind: "misconfigured", ok: false, warnings, modelId: model?.id, provider: model?.provider };
	}

	return { kind: "not-deepseek", ok: true, warnings, modelId: model?.id, provider: model?.provider };
}

export function isDeepSeekDetectionActive(detection: DeepSeekDetection): boolean {
	return detection.kind === "native" || detection.kind === "compatible" || detection.kind === "misconfigured";
}

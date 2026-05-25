import type { ExtensionConfig } from "./config.ts";

const FALLBACK_IDS = ["deepseek-v4-flash", "deepseek-v4-pro"];

function baseUrl(config: ExtensionConfig): string {
	let url = config.deepseekBaseUrl.trim() || "https://api.deepseek.com";
	while (url.endsWith("/")) url = url.slice(0, -1);
	return url;
}

export async function fetchDeepSeekModelIds(config: ExtensionConfig): Promise<string[] | undefined> {
	const key = process.env[config.deepseekApiKeyEnv];
	if (!key) return undefined;
	try {
		const response = await fetch(`${baseUrl(config)}/models`, { headers: { Authorization: `Bearer ${key}` } });
		if (!response.ok) return undefined;
		const body = (await response.json()) as any;
		const ids: string[] = Array.isArray(body?.data) ? body.data.map((model: any) => model?.id).filter((id: any): id is string => typeof id === "string" && id.length > 0) : [];
		return ids.length ? Array.from(new Set(ids)) : undefined;
	} catch {
		return undefined;
	}
}

export function buildDynamicModels(ids: string[]): any[] {
	return ids.map((id) => ({
		id,
		name: id.split(/[\/_:-]+/g).filter(Boolean).map((part) => (part.toLowerCase() === "v4" ? "V4" : part.charAt(0).toUpperCase() + part.slice(1))).join(" "),
		reasoning: id.includes("v4") || id.includes("reason"),
		input: ["text"],
		contextWindow: id.includes("v4") ? 1_000_000 : 128_000,
		maxTokens: id.includes("v4") ? 131_072 : 8_192,
		cost: id.includes("pro") ? { input: 0.435, output: 0.87, cacheRead: 0.003625, cacheWrite: 0 } : { input: 0.14, output: 0.28, cacheRead: 0.0028, cacheWrite: 0 },
		compat: { requiresReasoningContentOnAssistantMessages: true, thinkingFormat: "deepseek", maxTokensField: "max_tokens" },
		thinkingLevelMap: { minimal: null, low: null, medium: null, high: "high", xhigh: "max" },
	}));
}

export const COMMAND_RESERVED_PROVIDER_NAMES = new Set(["context-engine", "ctxengine", "context_engine"]);

export function effectiveDynamicProviderName(config: ExtensionConfig): string {
	if (config.allowOverrideBuiltInDeepSeek) return "deepseek";
	return COMMAND_RESERVED_PROVIDER_NAMES.has(config.dynamicProviderName) ? "context-engine-provider" : config.dynamicProviderName;
}

export async function maybeRegisterDynamicProvider(pi: any, config: ExtensionConfig): Promise<string[]> {
	if (!config.registerDynamicProvider) return [];
	const providerName = effectiveDynamicProviderName(config);
	const fetched = await fetchDeepSeekModelIds(config);
	const ids = fetched ?? FALLBACK_IDS;
	pi.registerProvider?.(providerName, {
		name: providerName === "deepseek" ? "DeepSeek" : "DeepSeek Cache",
		baseUrl: baseUrl(config),
		apiKey: config.deepseekApiKeyEnv,
		api: "openai-completions",
		models: buildDynamicModels(ids),
	});
	return ids;
}

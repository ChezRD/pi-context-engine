import type { RuntimeState } from "../runtime-state.ts";

const CACHE_PROMPT = `[DeepSeek Cache Optimization]\nThis session uses DeepSeek V4 prompt caching.\n- Keep system prompt and tool definitions stable across turns.\n- Avoid rewriting conversation history — it invalidates the prefix cache.\n- Use tool results efficiently — large results invalidate prefix cache.\n- /deepseek-cache shows real-time cache hit ratio and cost savings.`;

export function maybeInjectCachePrompt(event: any, ctx: any, state: RuntimeState): any | undefined {
	if (!state.config.enabled || !state.config.cachePromptInjection) return undefined;
	const current = event?.systemPrompt ?? ctx?.getSystemPrompt?.() ?? "";
	if (current.includes("[DeepSeek Cache Optimization]")) return undefined;
	return { systemPrompt: `${current}\n\n${CACHE_PROMPT}` };
}

import { Type } from "typebox";
import type { RuntimeState } from "../runtime-state.ts";
import { requestFold } from "./auto-compact.ts";
import { t } from "../i18n/index.ts";

export function registerFoldTool(pi: any, state: RuntimeState): void {
	if (state.engine.foldToolRegistered) return;
	if (!state.config.enabled || !state.config.autoFold) return;
	pi.registerTool?.({
		name: "context_cache_fold",
		label: t("tool.fold.label"),
		description: t("tool.fold.description"),
		promptSnippet: t("tool.fold.promptSnippet"),
		parameters: Type.Object({ customInstructions: Type.Optional(Type.String({ description: t("tool.fold.customInstructions") })) }),
		async execute(_toolCallId: string, params: { customInstructions?: string }, _signal: AbortSignal, _onUpdate: unknown, ctx: any) {
			const previous = state.config.autoFold;
			state.config = { ...state.config, autoFold: true };
			const result = await requestFold(pi, params.customInstructions ? { ...ctx, compact: (options: any) => ctx.compact({ ...options, customInstructions: params.customInstructions }) } : ctx, state);
			state.config = { ...state.config, autoFold: previous };
			return { content: [{ type: "text", text: result.ok ? t("tool.fold.triggered") : t("tool.fold.failed", { error: result.error }) }], details: { ok: result.ok } };
		},
	});
	state.engine.foldToolRegistered = true;
}

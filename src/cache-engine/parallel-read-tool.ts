import { readFile } from "node:fs/promises";
import { resolve, relative, isAbsolute } from "node:path";
import { Type } from "typebox";
import type { RuntimeState } from "../runtime-state.ts";
import { t } from "../i18n/index.ts";

const PARALLEL_READ_PROMPT_SNIPPET = "Prefer this over repeated read calls when inspecting several independent read-only files.";

function isSafePath(root: string, file: string): boolean {
	const abs = isAbsolute(file) ? file : resolve(root, file);
	const rel = relative(root, abs);
	return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
}

export function registerParallelReadTool(pi: any, state: RuntimeState): void {
	if (!state.config.enabled || !state.config.parallelReadTool) return;
	pi.registerTool?.({
		name: "context_parallel_read",
		label: t("tool.parallelRead.label"),
		description: t("tool.parallelRead.description"),
		promptSnippet: PARALLEL_READ_PROMPT_SNIPPET,
		parameters: Type.Object({ files: Type.Array(Type.String({ description: t("tool.parallelRead.file") }), { minItems: 1, maxItems: 20 }) }),
		async execute(_toolCallId: string, params: { files: string[] }, _signal: AbortSignal, _onUpdate: unknown, ctx: any) {
			const root = ctx?.cwd ?? process.cwd();
			const results = await Promise.all(params.files.map(async (file, index) => {
				if (!isSafePath(root, file)) return { index, file, ok: false, error: "outside workspace" };
				try {
					const content = await readFile(resolve(root, file), "utf8");
					return { index, file, ok: true, content };
				} catch (error) {
					return { index, file, ok: false, error: (error as Error).message };
				}
			}));
			return { content: [{ type: "text", text: JSON.stringify(results, null, 2) }], details: { results } };
		},
	});
}

export const MODEL_VISIBLE_CONTEXT_MARKER = "[pi-context-engine: model-visible context]";
export const MODEL_VISIBLE_CONTEXT_SCHEMA = "pi.model_visible_context.v1";

export interface ModelVisibleSection {
	name: string;
	content: string;
}

export interface ModelVisibleBlockOptions {
	kind: string;
	ui: "custom-rendered" | "hidden";
	metadata?: Record<string, unknown>;
	sections?: ModelVisibleSection[];
}

export function buildModelVisibleContext(options: ModelVisibleBlockOptions): string {
	const lines = [
		MODEL_VISIBLE_CONTEXT_MARKER,
		`<model_visible_context schema="${MODEL_VISIBLE_CONTEXT_SCHEMA}" kind="${options.kind}" ui="${options.ui}">`,
		"<metadata>",
		JSON.stringify({
			schema: MODEL_VISIBLE_CONTEXT_SCHEMA,
			kind: options.kind,
			ui: options.ui,
			...(options.metadata ?? {}),
		}, null, 2),
		"</metadata>",
	];
	for (const section of options.sections ?? []) {
		lines.push(`<payload name="${section.name}">`, section.content, "</payload>");
	}
	lines.push("</model_visible_context>");
	return lines.join("\n");
}

export function isModelVisibleContext(text: string | undefined): boolean {
	return Boolean(text?.startsWith(MODEL_VISIBLE_CONTEXT_MARKER));
}

export function extractModelVisibleMetadata(text: string): Record<string, unknown> | undefined {
	const match = text.match(/<metadata>\n([\s\S]*?)\n<\/metadata>/);
	if (!match?.[1]) return undefined;
	try {
		const parsed = JSON.parse(match[1]);
		return parsed && typeof parsed === "object" ? parsed : undefined;
	} catch {
		return undefined;
	}
}

export function extractModelVisibleSection(text: string, name: string): string | undefined {
	const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
	const match = text.match(new RegExp(`<payload name="${escaped}">\\n([\\s\\S]*?)\\n<\\/payload>`));
	return match?.[1]?.trim();
}

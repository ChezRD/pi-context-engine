import { Type } from "typebox";
import type { Static } from "typebox";
import { Text } from "@earendil-works/pi-tui";
import type { RuntimeState } from "../runtime-state.ts";
import { openCacheCheckpoint } from "../cache-engine/cache-checkpoints.ts";
import { t } from "../i18n/index.ts";
import { extractToolResultText } from "../capper.ts";
import { discoverSkills, findSkill, loadSkillAsPin, MAX_SKILL_DISPLAY_CHARS } from "./skills.ts";

const ContextPinSkillParams = Type.Object({
	name: Type.String({ description: t("tool.pinSkill.param.name") }),
	arguments: Type.Optional(Type.String({ description: t("tool.pinSkill.param.arguments") })),
});

const ContextPinParams = Type.Object({
	kind: Type.String({ description: t("tool.pin.param.kind") }),
	name: Type.String({ description: t("tool.pin.param.name") }),
	content: Type.String({ description: t("tool.pin.param.content") }),
	priority: Type.Optional(Type.String({ description: t("tool.pin.param.priority") })),
	scope: Type.Optional(Type.String({ description: t("tool.pin.param.scope") })),
});

/**
 * Register context pinning tools.
 */
export function registerPinTools(pi: any, state: RuntimeState): void {
	// ── context_pin_skill ──
	pi.registerTool?.({
		name: "context_pin_skill",
		label: t("tool.pinSkill.label"),
		description: t("tool.pinSkill.description"),
		parameters: ContextPinSkillParams,
		execute: async (_id: string, params: Static<typeof ContextPinSkillParams>, _signal: any, _onUpdate: any, ctx: any) => {
			const projectDir = ctx?.projectDir ?? process.cwd();
			const loaded = loadSkillAsPin(params.name, projectDir);

			if (!loaded) {
				const all = discoverSkills(projectDir);
				const names = all.map(s => s.name).join(", ");
				return {
					content: [{
						type: "text",
						text: t("tool.pinSkill.notFound", { name: params.name, skills: names }),
					}],
				};
			}

			// Store in pin store
			const changed = state.pinStore.set("skill", loaded.name, loaded.body, {
				scope: "session",
				source: "explicit-skill-tool",
			});

			// Open cache checkpoint if pin set changed
			if (changed) {
				openCacheCheckpoint(state, "pin_drift", { note: `pinned skill: ${loaded.name}`, startSegment: false });
			}

			// Compact transcript display — show only summary, full body stays model-visible
			const preview = loaded.body.length > MAX_SKILL_DISPLAY_CHARS
				? loaded.body.slice(0, MAX_SKILL_DISPLAY_CHARS) + `\n${t("tool.pinSkill.previewTruncated")}`
				: loaded.body;

			return {
				content: [{
					type: "text",
					text: t(changed ? "tool.pinSkill.result.pinned" : "tool.pinSkill.result.active", { name: loaded.name, content: loaded.content, preview }),
				}],
			};
		},
		renderCall(args: any, theme: any): Text {
			const name = String(args.name ?? "");
			return new Text(theme.fg("toolTitle", theme.bold("📌 skill: ")) + theme.fg("accent", `"${name}"`), 0, 0);
		},
		renderResult(result: any, _opts: any, theme: any): Text {
			const text = extractToolResultText(result?.content);
			if (!text) return new Text("", 0, 0);
			const clean = text.replace(/---[\s\S]*$/, "").trim();
			const firstLine = clean.split(/\r?\n/)[0];
			return new Text(theme.fg("toolOutput", firstLine), 0, 0);
		},
	});

	// ── context_pin ──
	pi.registerTool?.({
		name: "context_pin",
		label: t("tool.pin.label"),
		description: t("tool.pin.description"),
		parameters: ContextPinParams,
		execute: async (_id: string, params: Static<typeof ContextPinParams>, _signal: any, _onUpdate: any, _ctx: any) => {
			// Storage kind — mapped to pinStore-compatible value
			const storageKind = params.kind === "priority" ? "priority"
				: params.kind === "user-memory" ? "user-memory"
				: params.kind === "project-memory" ? "project-memory"
				: params.kind === "working-rule" ? "priority"
				: "priority";

			// Display kind — localized user-facing label
			const displayKind = t("tool.pin.kind." + params.kind, { defaultValue: params.kind });

			const priority = params.priority === "high" ? "high" as const : undefined;

			const changed = state.pinStore.set(storageKind, params.name, params.content, {
				scope: (params.scope as "session" | "project" | "global") ?? "session",
				priority,
				source: "explicit-tool",
			});

			if (changed) {
				openCacheCheckpoint(state, "pin_drift", { note: `${storageKind}: ${params.name}`, startSegment: false });
			}

			const preview = params.content.length > 200
				? params.content.slice(0, 200) + "..." : params.content;

			// Use original kind in XML — model understands these values
			const xml = `<context-engine-pin kind="${params.kind}" name="${params.name}" version="1">\n${params.content}\n</context-engine-pin>`;

			return {
				content: [{
					type: "text",
					text: t(changed ? "tool.pin.result.pinned" : "tool.pin.result.active", { kind: displayKind, name: params.name, priority: priority === "high" ? t("tool.pin.priorityHigh") : "", xml, preview }),
				}],
			};
		},
		renderCall(args: any, theme: any): Text {
			const rawKind = String(args.kind ?? "");
			const name = String(args.name ?? "");
			const emoji = rawKind === "priority" ? "🔴"
				: rawKind === "user-memory" ? "🧠"
				: rawKind === "project-memory" ? "📋"
				: "📌";
			const displayKind = t("tool.pin.kind." + rawKind, { defaultValue: rawKind });
			return new Text(theme.fg("toolTitle", theme.bold(`${emoji} ${displayKind}: `)) + theme.fg("accent", `"${name}"`), 0, 0);
		},
		renderResult(result: any, _opts: any, theme: any): Text {
			const text = extractToolResultText(result?.content);
			if (!text) return new Text("", 0, 0);
			// Strip XML block and --- separator section, keep only confirmation line
			const clean = text
				.replace(/<context-engine-pin[\s\S]*?<\/context-engine-pin>/g, "")
				.replace(/---[\s\S]*$/, "")
				.trim();
			const firstLine = clean.split(/\r?\n/)[0];
			return new Text(theme.fg("toolOutput", firstLine), 0, 0);
		},
	});
}

import { Type } from "typebox";
import type { Static } from "typebox";
import type { RuntimeState } from "../runtime-state.ts";
import { openCacheCheckpoint } from "../cache-engine/cache-checkpoints.ts";
import { discoverSkills, findSkill, loadSkillAsPin, MAX_SKILL_DISPLAY_CHARS } from "./skills.ts";

const ContextPinSkillParams = Type.Object({
	name: Type.String({ description: "Skill name to load and pin." }),
	arguments: Type.Optional(Type.String({ description: "Optional task-specific arguments for the skill." })),
});

const ContextPinParams = Type.Object({
	kind: Type.String({ description: "Pin kind: priority, user-memory, project-memory, working-rule." }),
	name: Type.String({ description: "Short stable name for this pin (e.g. 'no-legacy-context-tag')." }),
	content: Type.String({ description: "The exact rule, fact, or decision to preserve." }),
	priority: Type.Optional(Type.String({ description: "'high' for critical constraints." })),
	scope: Type.Optional(Type.String({ description: "'session' (default), 'project', or 'global'." })),
});

/**
 * Register context pinning tools.
 */
export function registerPinTools(pi: any, state: RuntimeState): void {
	// ── context_pin_skill ──
	pi.registerTool?.({
		name: "context_pin_skill",
		label: "Pin Skill",
		description: "Load a skill body as an active pinned block. The full skill instructions will be preserved across semantic folds.",
		parameters: ContextPinSkillParams,
		execute: async (_id: string, params: Static<typeof ContextPinSkillParams>, _signal: any, _onUpdate: any, ctx: any) => {
			const projectDir = ctx?.projectDir ?? process.cwd();
			const loaded = loadSkillAsPin(params.name, projectDir);

			if (!loaded) {
				const all = discoverSkills(projectDir);
				const names = all.length > 0 ? all.map(s => s.name).join(", ") : "none found";
				return {
					content: [{
						type: "text",
						text: `Skill "${params.name}" not found. Available skills: ${names}`,
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
				? loaded.body.slice(0, MAX_SKILL_DISPLAY_CHARS) + "\n... (truncated)"
				: loaded.body;

			return {
				content: [{
					type: "text",
					text: `${changed ? "Pinned" : "Already active"} skill: "${loaded.name}"\n\n${loaded.content}\n\n---\nPreview:\n${preview}`,
				}],
			};
		},
	});

	// ── context_pin ──
	pi.registerTool?.({
		name: "context_pin",
		label: "Context Pin",
		description: "Pin a priority fact, user decision, project invariant, or working rule that must survive context pruning/folding.",
		parameters: ContextPinParams,
		execute: async (_id: string, params: Static<typeof ContextPinParams>, _signal: any, _onUpdate: any, _ctx: any) => {
			const kind = params.kind === "priority" ? "priority"
				: params.kind === "user-memory" ? "user-memory"
				: params.kind === "project-memory" ? "project-memory"
				: params.kind === "working-rule" ? "priority" // map to priority kind
				: "priority";

			const priority = params.priority === "high" ? "high" as const : undefined;

			const changed = state.pinStore.set(kind, params.name, params.content, {
				scope: (params.scope as "session" | "project" | "global") ?? "session",
				priority,
				source: "explicit-tool",
			});

			if (changed) {
				openCacheCheckpoint(state, "pin_drift", { note: `${kind}: ${params.name}`, startSegment: false });
			}

			const preview = params.content.length > 200
				? params.content.slice(0, 200) + "..." : params.content;

			const xml = `<context-engine-pin kind="${kind}" name="${params.name}" version="1">\n${params.content}\n</context-engine-pin>`;

			return {
				content: [{
					type: "text",
					text: `${changed ? "Pinned" : "Already active"} ${kind}: "${params.name}"${priority === "high" ? " (HIGH)" : ""}\n\n${xml}\n\n---\n${preview}`,
				}],
			};
		},
	});
}

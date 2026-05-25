import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, basename } from "node:path";
import { homedir } from "node:os";

/**
 * Pi-native skill discovery (from @earendil-works/pi-coding-agent/dist/core/skills.js).
 *
 * Default roots (includeDefaults=true):
 *   1. <agentDir>/skills/   = ~/.pi/agent/skills/
 *   2. <cwd>/.pi/skills/    = <projectDir>/.pi/skills/
 *
 * Structure: <root>/<skill-name>/SKILL.md
 *   Name from frontmatter `name:` or fallback to directory name.
 *   Description from frontmatter `description:`.
 */

const AGENT_DIR = join(homedir(), ".pi", "agent");

const DEFAULT_ROOTS = [
	join(AGENT_DIR, "skills"),       // user/global
];

const PROJECT_RELATIVE_ROOTS = [
	".pi/skills",                     // project-local
];

export interface SkillInfo {
	name: string;
	description: string;
	filePath: string;
	body: string;
	frontmatter: Record<string, string>;
}

export function parseFrontmatter(content: string): { frontmatter: Record<string, string>; body: string } {
	const frontmatter: Record<string, string> = {};
	const lines = content.split("\n");

	if (lines[0]?.trim() === "---") {
		let endIdx = -1;
		for (let i = 1; i < lines.length; i++) {
			if (lines[i].trim() === "---") {
				endIdx = i;
				break;
			}
			const colonIdx = lines[i].indexOf(":");
			if (colonIdx > 0) {
				const key = lines[i].slice(0, colonIdx).trim().toLowerCase();
				const value = lines[i].slice(colonIdx + 1).trim();
				frontmatter[key] = value;
			}
		}
		if (endIdx > 0) {
			return { frontmatter, body: lines.slice(endIdx + 1).join("\n").trim() };
		}
	}

	return { frontmatter, body: content.trim() };
}

function scanSkillRoot(root: string): SkillInfo[] {
	if (!existsSync(root)) return [];
	let entries: string[];
	try {
		entries = readdirSync(root);
	} catch {
		return [];
	}
	const skills: SkillInfo[] = [];
	for (const entry of entries) {
		if (entry.startsWith(".")) continue;
		if (entry === "node_modules") continue;
		const skillDir = join(root, entry);
		try {
			if (!statSync(skillDir).isDirectory()) continue;
		} catch {
			continue;
		}
		const skillFile = join(skillDir, "SKILL.md");
		if (!existsSync(skillFile)) continue;
		let content: string;
		try {
			content = readFileSync(skillFile, "utf-8");
		} catch {
			continue;
		}
		const { frontmatter, body } = parseFrontmatter(content);
		skills.push({
			name: frontmatter.name ?? entry,
			description: frontmatter.description ?? "",
			filePath: skillFile,
			body,
			frontmatter,
		});
	}
	return skills;
}

/** Discover skills from Pi default roots only. Project beats global on name collision. */
export function discoverSkills(projectDir?: string): SkillInfo[] {
	const seen = new Map<string, SkillInfo>();
	const roots: string[] = [];

	// Project first (higher priority)
	if (projectDir) {
		for (const rel of PROJECT_RELATIVE_ROOTS) {
			roots.push(join(projectDir, rel));
		}
	}

	// Then global
	roots.push(...DEFAULT_ROOTS);

	for (const root of roots) {
		if (!existsSync(root)) continue;
		for (const skill of scanSkillRoot(root)) {
			if (!seen.has(skill.name)) {
				seen.set(skill.name, skill);
			}
		}
	}
	return [...seen.values()];
}

export function findSkill(name: string, projectDir?: string): SkillInfo | undefined {
	return discoverSkills(projectDir).find(s => s.name === name);
}

export function loadSkillAsPin(name: string, projectDir?: string): { name: string; content: string; body: string } | null {
	const skill = findSkill(name, projectDir);
	if (!skill) return null;
	const content = `<context-engine-pin kind="skill" name="${skill.name}" version="1">\n${skill.body}\n</context-engine-pin>`;
	return { name: skill.name, content, body: skill.body };
}

export const MAX_SKILL_DISPLAY_CHARS = 500;

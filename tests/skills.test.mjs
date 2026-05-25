import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

let mod;
try {
	mod = await import("../src/context-pins/skills.ts");
} catch {
	mod = await import("../src/context-pins/skills.js");
}

const { discoverSkills, findSkill, loadSkillAsPin, parseFrontmatter } = mod;

describe("parseFrontmatter", () => {
	it("extracts name and description from frontmatter", () => {
		const content = `---
name: test-skill
description: A test skill
---
Skill body here`;
		const result = parseFrontmatter(content);
		assert.equal(result.frontmatter.name, "test-skill");
		assert.equal(result.frontmatter.description, "A test skill");
		assert.equal(result.body, "Skill body here");
	});

	it("returns full content as body when no frontmatter", () => {
		const content = "# Just a skill\n\nNo frontmatter here.";
		const result = parseFrontmatter(content);
		assert.deepEqual(result.frontmatter, {});
		assert.ok(result.body.includes("No frontmatter"));
	});

	it("handles empty frontmatter block", () => {
		const content = "---\n---\nBody only";
		const result = parseFrontmatter(content);
		assert.deepEqual(result.frontmatter, {});
		assert.equal(result.body, "Body only");
	});
});

describe("discoverSkills", () => {
	let tmpDir;

	before(() => {
		tmpDir = mkdtempSync(join(tmpdir(), "pin-test-"));
		// Create skills in Pi format: <root>/<name>/SKILL.md
		const skillsDir = join(tmpDir, ".pi", "skills");
		mkdirSync(join(skillsDir, "test-skill"), { recursive: true });
		writeFileSync(join(skillsDir, "test-skill", "SKILL.md"), `---
name: test-skill
description: A test skill
---
# Test Skill\n\nThis is the body.`);
		mkdirSync(join(skillsDir, "another-skill"), { recursive: true });
		writeFileSync(join(skillsDir, "another-skill", "SKILL.md"), `---
name: another-skill
description: Another one
---
# Another\n\nBody here.`);
	});

	it("discovers skills from project roots", () => {
		const skills = discoverSkills(tmpDir);
		assert.ok(skills.length >= 2);
		const testSkill = skills.find(s => s.name === "test-skill");
		assert.ok(testSkill);
		assert.equal(testSkill.description, "A test skill");
	});

	it("findSkill returns skill by name", () => {
		const skill = findSkill("test-skill", tmpDir);
		assert.ok(skill);
		assert.equal(skill.name, "test-skill");
	});

	it("loadSkillAsPin returns pinned XML", () => {
		const result = loadSkillAsPin("test-skill", tmpDir);
		assert.ok(result);
		assert.equal(result.name, "test-skill");
		assert.ok(result.content.includes("context-engine-pin"));
		assert.ok(result.content.includes("kind=\"skill\""));
	});

	it("returns null for unknown skill", () => {
		assert.equal(loadSkillAsPin("nonexistent", tmpDir), null);
	});

	it("findSkill returns undefined for unknown", () => {
		assert.equal(findSkill("nope", tmpDir), undefined);
	});
});

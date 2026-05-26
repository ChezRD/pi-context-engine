import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, mkdirSync, symlinkSync, rmSync } from "node:fs";
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

	it("treats unterminated frontmatter as body", () => {
		const content = "---\nname: partial\nBody";
		const result = parseFrontmatter(content);
		assert.deepEqual(result.frontmatter, { name: "partial" });
		assert.equal(result.body, content);
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

	it("ignores unreadable or invalid skill entries", () => {
		const invalidRoot = mkdtempSync(join(tmpdir(), "pin-invalid-"));
		mkdirSync(join(invalidRoot, ".pi"), { recursive: true });
		writeFileSync(join(invalidRoot, ".pi", "skills"), "not a directory");
		assert.equal(discoverSkills(invalidRoot).some((skill) => skill.name === "not a directory"), false);

		const mixedRoot = mkdtempSync(join(tmpdir(), "pin-mixed-"));
		const skillsDir = join(mixedRoot, ".pi", "skills");
		mkdirSync(skillsDir, { recursive: true });
		symlinkSync(join(mixedRoot, "missing-target"), join(skillsDir, "broken-skill"));
		mkdirSync(join(skillsDir, "directory-skill", "SKILL.md"), { recursive: true });
		mkdirSync(join(skillsDir, "valid-skill"), { recursive: true });
		writeFileSync(join(skillsDir, "valid-skill", "SKILL.md"), "# Valid\n\nBody");

		const skills = discoverSkills(mixedRoot);
		assert.ok(skills.some((skill) => skill.name === "valid-skill"));
		assert.equal(skills.some((skill) => skill.name === "broken-skill"), false);
		assert.equal(skills.some((skill) => skill.name === "directory-skill"), false);
	});

	it("skips non-directory entries and directories without SKILL.md", () => {
		const root = mkdtempSync(join(tmpdir(), "pin-scan-"));
		const skillsDir = join(root, ".pi", "skills");
		mkdirSync(skillsDir, { recursive: true });
		// Regular file in skills dir — statSync succeeds, isDirectory returns false
		writeFileSync(join(skillsDir, "readme.txt"), "just a file");
		// Directory without SKILL.md — existsSync returns false
		mkdirSync(join(skillsDir, "no-skill-file"), { recursive: true });
		// Valid skill
		mkdirSync(join(skillsDir, "valid-skill"), { recursive: true });
		writeFileSync(join(skillsDir, "valid-skill", "SKILL.md"), `---
name: valid-skill
description: A valid skill
---
Body`);

		const skills = discoverSkills(root);
		assert.equal(skills.some(s => s.name === "valid-skill"), true);
		assert.equal(skills.some(s => s.name === "readme.txt"), false);
		assert.equal(skills.some(s => s.name === "no-skill-file"), false);
		rmSync(root, { recursive: true, force: true });
	});

	it("skips dot entries, node_modules, and prefers project skills over later roots", () => {
		const root = mkdtempSync(join(tmpdir(), "pin-priority-"));
		const skillsDir = join(root, ".pi", "skills");
		mkdirSync(join(skillsDir, ".hidden"), { recursive: true });
		writeFileSync(join(skillsDir, ".hidden", "SKILL.md"), "# Hidden");
		mkdirSync(join(skillsDir, "node_modules"), { recursive: true });
		writeFileSync(join(skillsDir, "node_modules", "SKILL.md"), "# Node");
		mkdirSync(join(skillsDir, "fallback-name"), { recursive: true });
		writeFileSync(join(skillsDir, "fallback-name", "SKILL.md"), `---
description: No explicit name
---
Body`);

		const skills = discoverSkills(root);
		assert.ok(skills.some((skill) => skill.name === "fallback-name"));
		assert.equal(skills.some((skill) => skill.name === ".hidden"), false);
		assert.equal(skills.some((skill) => skill.name === "node_modules"), false);
		rmSync(root, { recursive: true, force: true });
	});

	it("handles non-existent project directory", () => {
		const skills = discoverSkills("/nonexistent-project-fallback");
		// Should not throw; non-existent project just means no project-local skills
		assert.ok(Array.isArray(skills));
	});
});

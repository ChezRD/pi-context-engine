/**
 * Reusable Node.js fs mock using node:test mock.module.
 *
 * Usage:
 *   import "./fs-mock.mjs"; // at top level before any imports
 *
 * This replaces node:fs with a mock that throws on read/write
 * and returns reasonable defaults for existsSync/readdirSync.
 *
 * Call before importing any source module that uses node:fs.
 */
import { mock } from "node:test";

mock.module("node:fs", {
	readFileSync() {
		throw new Error("mock: readFileSync not expected in this test");
	},
	writeFileSync() {
		throw new Error("mock: writeFileSync not expected in this test");
	},
	mkdirSync() {},
	existsSync() {
		return false;
	},
	readdirSync() {
		return [];
	},
	default: {
		readFileSync() {
			throw new Error("mock: readFileSync not expected in this test");
		},
		writeFileSync() {
			throw new Error("mock: writeFileSync not expected in this test");
		},
		mkdirSync() {},
		existsSync() {
			return false;
		},
		readdirSync() {
			return [];
		},
	},
});

/* To customize for a specific test file, re-mock before imports:
 *
 *   mock.module("node:fs", {
 *     existsSync: () => true,
 *     readdirSync: () => [{ name: "my-skill", isDirectory: () => true }],
 *   });
 */

import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";

let mod;
try {
	mod = await import("../src/context-pins/store.ts");
} catch {
	mod = await import("../src/context-pins/store.js");
}

const { PinStore, computeStableHash, computePinSetHash, MAX_CONTENT_CHARS } = mod;

describe("PinStore", () => {
	let store;

	beforeEach(() => {
		store = new PinStore();
	});

	it("starts empty", () => {
		assert.equal(store.count, 0);
		assert.equal(store.getAll().length, 0);
		assert.equal(store.combinedHash, "0");
	});

	it("adds a pin", () => {
		const changed = store.set("skill", "test-skill", "body content");
		assert.ok(changed);
		assert.equal(store.count, 1);
	});

	it("returns false when adding unchanged pin", () => {
		store.set("priority", "rule-1", "important rule");
		const changed = store.set("priority", "rule-1", "important rule");
		assert.equal(changed, false);
	});

	it("returns true when pin content changes", () => {
		store.set("priority", "rule-1", "version 1");
		const changed = store.set("priority", "rule-1", "version 2");
		assert.ok(changed);
	});

	it("deduplicates by kind:scope:name", () => {
		store.set("priority", "the-rule", "v1", { scope: "session" });
		store.set("priority", "the-rule", "v2", { scope: "project" });
		// Different scopes → two distinct records
		assert.equal(store.count, 2);
	});

	it("get returns undefined for unknown pin", () => {
		assert.equal(store.get("skill", "nope"), undefined);
	});

	it("get returns pin by kind+name", () => {
		store.set("skill", "my-skill", "content");
		const pin = store.get("skill", "my-skill");
		assert.ok(pin);
		assert.equal(pin.kind, "skill");
		assert.equal(pin.name, "my-skill");
	});

	it("getByKind returns matching pins", () => {
		store.set("skill", "s1", "c1");
		store.set("skill", "s2", "c2");
		store.set("priority", "p1", "c3");
		const skills = store.getByKind("skill");
		assert.equal(skills.length, 2);
		const priorities = store.getByKind("priority");
		assert.equal(priorities.length, 1);
	});

	it("remove returns true when removed, false when absent", () => {
		store.set("priority", "p1", "c1");
		assert.ok(store.remove("priority", "p1"));
		assert.equal(store.remove("priority", "p1"), false);
		assert.equal(store.count, 0);
	});

	it("clear removes all pins", () => {
		store.set("skill", "s1", "c1");
		store.set("priority", "p1", "c2");
		store.clear();
		assert.equal(store.count, 0);
	});

	it("getAll returns deterministic order", () => {
		store.set("priority", "z-rule", "c1");
		store.set("skill", "a-skill", "c2");
		store.set("priority", "a-rule", "c3");
		const all = store.getAll();
		assert.equal(all.length, 3);
		// Sorted: kind:scope:name
		assert.ok(all[0].name <= all[1].name || all[0].kind !== all[1].kind);
	});

	it("clamps content to MAX_CONTENT_CHARS", () => {
		const longContent = "x".repeat(MAX_CONTENT_CHARS + 100);
		store.set("skill", "big", longContent);
		const pin = store.get("skill", "big");
		assert.equal(pin.content.length, MAX_CONTENT_CHARS);
	});

	it("records createdAt and updatedAt", () => {
		store.set("skill", "s1", "c1");
		const pin = store.get("skill", "s1");
		assert.ok(pin.createdAt > 0);
		assert.equal(pin.updatedAt, pin.createdAt);
	});

	it("updates updatedAt on change", () => {
		store.set("skill", "s1", "c1");
		const first = store.get("skill", "s1");
		store.set("skill", "s1", "c2");
		const second = store.get("skill", "s1");
		assert.ok(second.updatedAt >= first.updatedAt);
		assert.equal(second.createdAt, first.createdAt); // unchanged
	});

	it("supports restore from persisted entry", () => {
		const record = {
			id: "skill:session:test",
			kind: "skill",
			name: "test",
			content: "body",
			scope: "session",
			createdAt: 1000,
			updatedAt: 1000,
			source: "explicit-skill-tool",
			stableHash: "abc123",
		};
		store.restore(record);
		assert.equal(store.count, 1);
		const pin = store.get("skill", "test");
		assert.ok(pin);
		assert.equal(pin.source, "explicit-skill-tool");
	});

	it("preserves priority field", () => {
		store.set("priority", "important", "value", { priority: "high" });
		const pin = store.get("priority", "important");
		assert.equal(pin.priority, "high");
	});

	it("preserves source field", () => {
		store.set("priority", "r1", "v1", { source: "explicit-tool" });
		const pin = store.get("priority", "r1");
		assert.equal(pin.source, "explicit-tool");
	});

	it("toEnginePins returns ContextEnginePin[] with raw XML", () => {
		store.set("priority", "my-rule", "content here");
		const pins = store.toEnginePins();
		assert.equal(pins.length, 1);
		assert.equal(pins[0].kind, "priority");
		assert.equal(pins[0].name, "my-rule");
		assert.ok(pins[0].raw.includes("context-engine-pin"));
		assert.ok(pins[0].raw.includes("priority"));
	});

	it("toEnginePins includes priority field when set", () => {
		store.set("priority", "my-rule", "content", { priority: "high" });
		const pins = store.toEnginePins();
		assert.equal(pins[0].priority, "high");
	});

	it("combinedHash changes when pins change", () => {
		const hash1 = store.combinedHash;
		store.set("skill", "s1", "c1");
		const hash2 = store.combinedHash;
		assert.notEqual(hash1, hash2);
	});

	it("persist callback fires on set", () => {
		const persisted = [];
		store.setPersist((record) => persisted.push(record));
		store.set("skill", "s1", "c1");
		assert.equal(persisted.length, 1);
		assert.equal(persisted[0].name, "s1");
	});

	it("persist callback fires on update", () => {
		const persisted = [];
		store.setPersist((record) => persisted.push(record));
		store.set("skill", "s1", "c1");
		store.set("skill", "s1", "c2");
		// Fires on every change, not on no-op
		assert.equal(persisted.length, 2);
	});

	it("persist callback does not fire on no-op", () => {
		const persisted = [];
		store.set("skill", "s1", "c1");
		store.setPersist((record) => persisted.push(record));
		store.set("skill", "s1", "c1"); // unchanged
		assert.equal(persisted.length, 0);
	});
});

describe("computeStableHash", () => {
	it("produces deterministic 8-char hex string", () => {
		const h1 = computeStableHash("skill", "test", "content", "session");
		const h2 = computeStableHash("skill", "test", "content", "session");
		assert.equal(h1, h2);
		assert.ok(/^[0-9a-f]{8}$/.test(h1));
	});

	it("differs when kind changes", () => {
		const h1 = computeStableHash("skill", "test", "content", "session");
		const h2 = computeStableHash("priority", "test", "content", "session");
		assert.notEqual(h1, h2);
	});

	it("differs when content changes", () => {
		const h1 = computeStableHash("skill", "test", "v1", "session");
		const h2 = computeStableHash("skill", "test", "v2", "session");
		assert.notEqual(h1, h2);
	});
});

describe("computePinSetHash", () => {
	it("returns '0' for empty array", () => {
		assert.equal(computePinSetHash([]), "0");
	});

	it("differs when records differ", () => {
		const r1 = { stableHash: "aaaa1111" };
		const r2 = { stableHash: "bbbb2222" };
		assert.notEqual(computePinSetHash([r1]), computePinSetHash([r2]));
	});
});

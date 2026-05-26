import { describe, it, before } from "node:test";
import assert from "node:assert/strict";

let mod;
before(async () => {
	mod = await import("../src/capper.ts");
});

describe("HugeResultStore", () => {
	it("setPersist stores callback", () => {
		const store = new mod.HugeResultStore();
		let called = false;
		store.setPersist(() => { called = true; });
		assert.ok(typeof store.persist === "function");
	});

	it("restore ignores record without ref", () => {
		const store = new mod.HugeResultStore();
		store.restore({ text: "hello" });
		assert.equal(store.counter, 0);
	});

	it("restore ignores record without text", () => {
		const store = new mod.HugeResultStore();
		store.restore({ ref: "x-1" });
		assert.equal(store.counter, 0);
	});

	it("restore parses counter from ref", () => {
		const store = new mod.HugeResultStore();
		store.restore({ ref: "dsc-test-2i", text: "hi" });
		assert.ok(store.counter > 0);
	});
});

describe("persistHugeResult", () => {
	it("calls safeAppendEntry", () => {
		const calls = [];
		const pi = { appendEntry: (...args) => calls.push(args) };
		mod.persistHugeResult(pi, { ref: "x-1", text: "hi" });
		assert.equal(calls.length, 1);
	});
});

describe("restoreHugeResultsFromSession", () => {
	it("returns 0 when ctx has no entries", () => {
		const store = new mod.HugeResultStore();
		const count = mod.restoreHugeResultsFromSession({}, store);
		assert.equal(count, 0);
	});

	it("restores matching entries", () => {
		const store = new mod.HugeResultStore();
		const ctx = {
			sessionManager: {
				getEntries: () => [
					{ type: "custom", customType: mod.CUSTOM_TYPE_HUGE_RESULT, data: { version: 1, record: { ref: "x-1", text: "hello" } } },
					{ type: "custom", customType: "other-type", data: {} },
					{ type: "system", data: {} },
				],
			},
		};
		const count = mod.restoreHugeResultsFromSession(ctx, store);
		assert.equal(count, 1);
	});
});

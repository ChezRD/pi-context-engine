import { describe, it } from "node:test";
import assert from "node:assert/strict";

let mod;

describe("stale-context", () => {
	it("loads module", async () => {
		mod = await import("../src/stale-context.ts");
		assert.ok(mod.safeAppendEntry);
	});

	it("safeAppendEntry returns false when sessionManager undefined", async () => {
		const result = mod.safeAppendEntry(undefined, "test", {});
		assert.equal(result, false);
	});

	it("safeAppendEntry returns false on stale context error", async () => {
		const sessionManager = {
			appendEntry() {
				const err = new Error("stale context");
				err.message = "This extension ctx is stale";
				throw err;
			}
		};
		const result = mod.safeAppendEntry(sessionManager, "test", {});
		assert.equal(result, false);
	});

	it("safeCall returns fallback on stale context error", () => {
		const result = mod.safeCall(() => {
			const err = new Error("stale");
			err.message = "This extension ctx is stale";
			throw err;
		}, "fallback");
		assert.equal(result, "fallback");
	});

	it("safeCall returns value on success", () => {
		const result = mod.safeCall(() => "ok", "fallback");
		assert.equal(result, "ok");
	});

	it("safeCall rethrows non-stale errors", () => {
		assert.throws(() => {
			mod.safeCall(() => { throw new Error("real error"); }, null);
		}, /real error/);
	});

	it("safeCallAsync returns fallback on stale context error", async () => {
		const result = await mod.safeCallAsync(async () => {
			const err = new Error("stale");
			err.message = "This extension ctx is stale";
			throw err;
		}, "fallback");
		assert.equal(result, "fallback");
	});

	it("safeCallAsync returns value on success", async () => {
		const result = await mod.safeCallAsync(async () => "ok", "fallback");
		assert.equal(result, "ok");
	});
});

it("safeCallAsync rethrows non-stale errors", async () => {
	await assert.rejects(
		mod.safeCallAsync(async () => { throw new Error("real error"); }, null),
		/real error/
	);
});

it("safeAppendEntry rethrows non-stale errors", () => {
	assert.throws(() => {
		mod.safeAppendEntry({
			appendEntry() { throw new Error("real error"); }
		}, "test", {});
	}, /real error/);
});

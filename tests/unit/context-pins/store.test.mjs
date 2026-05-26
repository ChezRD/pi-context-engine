import { describe, it } from "node:test";
import assert from "node:assert/strict";

const m = {};
m.computeStableHash = (await import("../../../src/context-pins/store.ts")).computeStableHash;
m.persistPinEntry = (await import("../../../src/context-pins/store.ts")).persistPinEntry;
m.restorePinsFromSession = (await import("../../../src/context-pins/store.ts")).restorePinsFromSession;
m.PinStore = (await import("../../../src/context-pins/store.ts")).PinStore;

describe("store", () => {
  it("computeStableHash produces deterministic output", () => {
    const h1 = m.computeStableHash("test", "name", "content", "session");
    const h2 = m.computeStableHash("test", "name", "content", "session");
    assert.equal(h1, h2);
  });

  it("persistPinEntry accepts pi and record", () => {
    m.persistPinEntry({ appendEntry: () => {} }, { kind: "constraint", name: "test", text: "hello" });
  });

  it("restorePinsFromSession returns 0 for empty session", () => {
    const ctx = { sessionManager: null };
    const store = new m.PinStore();
    assert.equal(m.restorePinsFromSession(ctx, store), 0);
  });
});

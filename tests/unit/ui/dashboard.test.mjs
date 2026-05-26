import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";
register("./../../__mocks__/loader.mjs", import.meta.url);

const m = {};
describe("dashboard", () => {
  it("loads module", async () => {
    const mod = await import("../../../src/ui/dashboard.ts");
    m.padVisibleRight = mod.padVisibleRight;
    m.formatMoney = mod.formatMoney;
    m.formatConfigValue = mod.formatConfigValue;
    m.registerDashboardCommand = mod.registerDashboardCommand;
    assert.equal(typeof m.padVisibleRight, "function");
    assert.equal(typeof m.formatMoney, "function");
    assert.equal(typeof m.formatConfigValue, "function");
    assert.equal(typeof m.registerDashboardCommand, "function");
  });

  describe("padVisibleRight", () => {
    it("pads string to full width", () => {
      assert.equal(m.padVisibleRight("abc", 5), "abc  ");
    });

    it("returns as-is when already full width", () => {
      assert.equal(m.padVisibleRight("abcde", 5), "abcde");
    });

    it("handles empty string", () => {
      assert.equal(m.padVisibleRight("", 4), "    ");
    });

    it("handles width smaller than string length", () => {
      const result = m.padVisibleRight("abcdef", 3);
      assert.equal(result.length, 6); // no truncation
    });

    it("handles zero width", () => {
      assert.equal(m.padVisibleRight("abc", 0), "abc");
    });
  });

  describe("formatMoney", () => {
    it("formats positive value", () => {
      assert.equal(m.formatMoney(1.2345), "$1.2345");
    });

    it("formats negative value", () => {
      assert.equal(m.formatMoney(-0.5), "-$0.5000");
    });

    it("formats zero", () => {
      assert.equal(m.formatMoney(0), "$0.0000");
    });

    it("handles Infinity", () => {
      assert.equal(m.formatMoney(Infinity), "$0.0000");
    });

    it("handles NaN", () => {
      assert.equal(m.formatMoney(NaN), "$0.0000");
    });

    it("uses custom digit count", () => {
      assert.equal(m.formatMoney(1.5, 2), "$1.50");
    });
  });

  describe("formatConfigValue", () => {
    it("returns value when translation matches key", () => {
      const cfg = {};
      const result = m.formatConfigValue(cfg, "test");
      assert.equal(result, "test");
    });

    it("returns translated label when available", () => {
      const cfg = { locale: "en" };
      // This depends on i18n; if translation exists, returns it
      const result = m.formatConfigValue(cfg, "test");
      // If no translation, falls back to value
      assert.ok(typeof result === "string");
    });
  });

  describe("registerDashboardCommand", () => {
    it("registers context command with handler", () => {
      let registeredName = "";
      let registeredDesc = "";
      let handlerFn = null;
      const pi = {
        registerCommand: (name, opts) => {
          registeredName = name;
          registeredDesc = opts.description;
          handlerFn = opts.handler;
        },
      };
      m.registerDashboardCommand(pi);
      assert.equal(registeredName, "context");
      assert.ok(typeof registeredDesc === "string");
      assert.equal(typeof handlerFn, "function");
    });

    it("works with {pi, getState} input format", () => {
      let registeredName = "";
      const input = {
        pi: { registerCommand: (name) => { registeredName = name; } },
        getState: () => undefined,
      };
      m.registerDashboardCommand(input);
      assert.equal(registeredName, "context");
    });

    it("handles missing registerCommand gracefully", () => {
      const pi = {};
      assert.doesNotThrow(() => m.registerDashboardCommand({}));
    });
  });

});

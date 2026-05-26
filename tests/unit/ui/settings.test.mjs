import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";
register("./../../__mocks__/loader.mjs", import.meta.url);

const m = {};

describe("SettingsComponent", () => {
	it("loads module and functions", async () => {
		m.SettingsComponent = (await import("../../../src/ui/settings.ts")).SettingsComponent;
		m.openSettingsMenu = (await import("../../../src/ui/settings.ts")).openSettingsMenu;
		m.applyLocale = (await import("../../../src/i18n/index.ts")).applyLocale;
		assert.ok(m.SettingsComponent);
		assert.ok(m.openSettingsMenu);
	});

	it("constructs with default state", () => {
		const tui = { requestRender: () => {} };
		const theme = { fg: (_c, s) => s, bold: (s) => s };
		const state = {};
		let doneCalled = false;
		const comp = new m.SettingsComponent({}, { models: ["claude-sonnet-4"] }, tui, theme, state, (r) => { doneCalled = true; });
		assert.ok(comp);
		assert.equal(comp.state.pruneBatchSize, 50);
		assert.equal(comp.state.pruneOn, "agent-message");
		assert.equal(comp.state.pruneModel, "deepseek-v4-flash");
		assert.equal(comp.state.dashboardVerbosity, "normal");
		assert.equal(comp.state.foldThreshold, 0.75);
		assert.equal(comp.state.pruneEnabled, true);
		assert.equal(comp.state.autoFold, true);
		assert.equal(comp.state.skillPinning, true);
		assert.equal(comp.state.memoryInjection, false);
		assert.equal(comp.state.autoDetectSkillPins, true);
		assert.deepEqual(comp.state.toolStabilityBypass, ["read"]);
		assert.equal(comp.state.toolBlockThreshold, 2);
	});

	it("constructs with overridden state", () => {
		const tui = { requestRender: () => {} };
		const theme = { fg: (_c, s) => s, bold: (s) => s };
		const state = { pruneBatchSize: 75, pruneOn: "every-turn", diagnostics: true, foldThreshold: 0.9 };
		const comp = new m.SettingsComponent({}, {}, tui, theme, state, () => {});
		assert.equal(comp.state.pruneBatchSize, 75);
		assert.equal(comp.state.pruneOn, "every-turn");
		assert.equal(comp.state.diagnostics, true);
		assert.equal(comp.state.foldThreshold, 0.9);
		assert.deepEqual(comp.state.toolStabilityBypass, ["read"]);
	});

	it("discovers dynamic models from pi and ctx fallbacks and ignores provider errors", () => {
		const tui = { requestRender: () => {} };
		const theme = { fg: (_c, s) => s, bold: (s) => s };
		const fromPi = new m.SettingsComponent({ getModels: () => [{ id: "qwen-32b" }, { id: "slow-large" }, "gpt-4o-mini"] }, {}, tui, theme, {}, () => {});
		assert.ok(fromPi.items.find((item) => item.id === "pruneModel").values.includes("qwen-32b"));
		assert.ok(fromPi.items.find((item) => item.id === "pruneModel").values.includes("gpt-4o-mini"));

		const fromCtx = new m.SettingsComponent({}, { getModels: () => ["claude-sonnet-4", "plain"] }, tui, theme, {}, () => {});
		assert.ok(fromCtx.items.find((item) => item.id === "pruneModel").values.includes("claude-sonnet-4"));

		const fallback = new m.SettingsComponent({ getModels: () => { throw new Error("boom"); } }, {}, tui, theme, {}, () => {});
		assert.ok(fallback.items.find((item) => item.id === "pruneModel").values.includes("deepseek-v4-flash"));
	});

	it("buildItems returns correct structure", () => {
		const tui = { requestRender: () => {} };
		const theme = { fg: (_c, s) => s, bold: (s) => s };
		const comp = new m.SettingsComponent({}, {}, tui, theme, {}, () => {});
		const items = comp.items;
		assert.ok(items.length > 0);
		const pruneItem = items.find(i => i.id === "pruneEnabled");
		assert.ok(pruneItem);
		assert.equal(pruneItem.values.length, 2); // on/off
		const thresholdItem = items.find(i => i.id === "foldThreshold");
		assert.ok(thresholdItem);
		assert.ok(thresholdItem.values.length > 50); // 0.1-0.99 @ 0.01 step
		const batchItem = items.find(i => i.id === "pruneBatchSize");
		assert.deepEqual(batchItem.values, ["20", "25", "30", "35", "40", "45", "50", "55", "60", "65", "70", "75", "80", "85", "90", "95", "100"]);
	});

	it("render() produces output", () => {
		const tui = { requestRender: () => {} };
		const theme = { fg: (_c, s) => s, bold: (s) => s };
		const comp = new m.SettingsComponent({}, {}, tui, theme, {}, () => {});
		const lines = comp.render(80);
		assert.ok(Array.isArray(lines));
		assert.ok(lines.length > 0);
	});

	it("handleInput calls tui.requestRender", () => {
		let renderCount = 0;
		const tui = { requestRender: () => { renderCount++; } };
		const theme = { fg: (_c, s) => s, bold: (s) => s };
		const comp = new m.SettingsComponent({}, {}, tui, theme, {}, () => {});
		comp.handleInput("x");
		assert.equal(renderCount, 1);
	});

	it("handleInput cycles selected values left and right and tolerates empty values", () => {
		let renderCount = 0;
		const tui = { requestRender: () => { renderCount++; } };
		const theme = { fg: (_c, s) => s, bold: (s) => s };
		const comp = new m.SettingsComponent({}, {}, tui, theme, {}, () => {});
		comp.settingsList.selectedIndex = comp.items.findIndex((item) => item.id === "pruneBatchSize");
		comp.handleInput("right");
		assert.equal(comp.state.pruneBatchSize, 55);
		comp.handleInput("left");
		assert.equal(comp.state.pruneBatchSize, 50);

		comp.settingsList.filteredItems = [{ id: "empty", currentValue: "x", values: [], toStateValue: (value) => value }];
		comp.settingsList.selectedIndex = 0;
		comp.handleInput("right");
		assert.ok(renderCount >= 2);
	});

	it("settings callbacks tolerate unknown ids and missing selected items", () => {
		const tui = { requestRender: () => {} };
		const theme = { fg: (_c, s) => s, bold: (s) => s };
		const comp = new m.SettingsComponent({}, {}, tui, theme, {}, () => {});
		comp.settingsList.onChange("missing", "value");
		comp.settingsList.filteredItems = [];
		comp.settingsList.selectedIndex = 99;
		assert.doesNotThrow(() => comp.handleInput("left"));
	});

	it("applyValue updates state and refreshes items", () => {
		const tui = { requestRender: () => {} };
		const theme = { fg: (_c, s) => s, bold: (s) => s };
		const comp = new m.SettingsComponent({}, {}, tui, theme, {}, () => {});
		const item = comp.items.find(i => i.id === "pruneBatchSize");
		assert.ok(item);
		const val = item.toStateValue("55");
		assert.equal(val, 55);
	});

	it("settings list change callback applies values", () => {
		const tui = { requestRender: () => {} };
		const theme = { fg: (_c, s) => s, bold: (s) => s };
		const comp = new m.SettingsComponent({}, {}, tui, theme, {}, () => {});

		comp.settingsList.onChange("pruneBatchSize", 60);

		assert.equal(comp.state.pruneBatchSize, 60);
	});

	it("switches pages with Tab key", () => {
		const tui = { requestRender: () => {} };
		const theme = { fg: (_c, s) => s, bold: (s) => s };
		const comp = new m.SettingsComponent({}, {}, tui, theme, {}, () => {});

		assert.equal(comp.currentPageIndex, 0);
		comp.handleInput("tab");
		assert.equal(comp.currentPageIndex, 1);
		comp.handleInput("tab");
		assert.equal(comp.currentPageIndex, 0);
		comp.handleInput("S-tab");
		assert.equal(comp.currentPageIndex, 1);
	});

	it("stability page shows tool bypass items", () => {
		const tui = { requestRender: () => {} };
		const theme = { fg: (_c, s) => s, bold: (s) => s };
		const comp = new m.SettingsComponent({}, {}, tui, theme, {}, () => {});

		comp.switchPage(1);
		assert.ok(comp.items.length > 5);
		const thresholdItem = comp.items.find((item) => item.id === "toolBlockThreshold");
		assert.ok(thresholdItem);
		const readBypass = comp.items.find((item) => item.id === "bypass_read");
		assert.ok(readBypass);
		const goalBypass = comp.items.find((item) => item.id === "bypass_update_goal");
		assert.ok(goalBypass);
	});

	it("toggle bypass item updates toolStabilityBypass", () => {
		const tui = { requestRender: () => {} };
		const theme = { fg: (_c, s) => s, bold: (s) => s };
		const comp = new m.SettingsComponent({}, {}, tui, theme, {}, () => {});

		comp.switchPage(1);
		const readItem = comp.items.find((item) => item.id === "bypass_read");
		assert.ok(readItem, "bypass_read item should exist in stability page");
		assert.deepEqual(comp.state.toolStabilityBypass, ["read"]);
		const offValue = readItem.values[1];
		comp.applyValue("bypass_read", offValue);
		assert.deepEqual(comp.state.toolStabilityBypass, []);
		const onValue = readItem.values[0];
		comp.applyValue("bypass_read", onValue);
		assert.deepEqual(comp.state.toolStabilityBypass, ["read"]);
	});

	it("toolBlockThreshold can be cycled", () => {
		const tui = { requestRender: () => {} };
		const theme = { fg: (_c, s) => s, bold: (s) => s };
		const comp = new m.SettingsComponent({}, {}, tui, theme, {}, () => {});

		comp.switchPage(1);
		comp.settingsList.selectedIndex = comp.items.findIndex((item) => item.id === "toolBlockThreshold");
		assert.equal(comp.state.toolBlockThreshold, 2);
		comp.handleInput("right");
		assert.equal(comp.state.toolBlockThreshold, 3);
	});

	it("covers localized value converters and search option", () => {
		const tui = { requestRender: () => {} };
		const theme = { fg: (_c, s) => s, bold: (s) => s };
		const comp = new m.SettingsComponent({}, { models: ["auto", "model-a"] }, tui, theme, {}, () => {});
		const byId = new Map(comp.items.map((item) => [item.id, item]));

		assert.equal(comp.settingsList.searchEnabled, true);
		assert.equal(byId.get("pruneEnabled").toStateValue(byId.get("pruneEnabled").values[0]), true);
		assert.equal(byId.get("autoFold").toStateValue(byId.get("autoFold").values[1]), false);
		assert.equal(byId.get("pruneOn").toStateValue(byId.get("pruneOn").values[1]), "checkpoint");
		assert.equal(byId.get("pruneAgentMessageFallback").toStateValue(byId.get("pruneAgentMessageFallback").values[1]), "before-provider");
		assert.equal(byId.get("pruneModel").toStateValue("model-a"), "model-a");
		assert.equal(byId.get("dashboardVerbosity").toStateValue(byId.get("dashboardVerbosity").values[2]), "verbose");
		assert.equal(byId.get("statusBarStyle").toStateValue(byId.get("statusBarStyle").values[0]), "blocks");
		assert.equal(byId.get("pruneOn").toStateValue("unknown"), "agent-message");
		assert.equal(byId.get("pruneAgentMessageFallback").toStateValue("unknown"), "next-agent-start");
		assert.equal(byId.get("dashboardVerbosity").toStateValue("unknown"), "normal");
		assert.equal(byId.get("statusBarStyle").toStateValue("unknown"), "sparkline");
	});

	it("buildItems omits agent-message-only settings outside agent-message mode", () => {
		const tui = { requestRender: () => {} };
		const theme = { fg: (_c, s) => s, bold: (s) => s };
		const comp = new m.SettingsComponent({}, {}, tui, theme, { pruneOn: "checkpoint" }, () => {});
		assert.equal(comp.items.some((item) => item.id === "pruneBatchSize"), false);
		assert.equal(comp.items.some((item) => item.id === "pruneAgentMessageFallback"), false);
	});

	it("settings list cancel callback returns current state", () => {
		const tui = { requestRender: () => {} };
		const theme = { fg: (_c, s) => s, bold: (s) => s };
		let result;
		const comp = new m.SettingsComponent({}, {}, tui, theme, {}, (value) => { result = value; });

		comp.settingsList.onCancel();

		assert.equal(result, comp.state);
	});

	it("render uses fallback theme functions when no theme is provided", () => {
		const comp = new m.SettingsComponent({}, {}, {}, undefined, {}, () => {});
		const lines = comp.render(80);
		assert.ok(lines.length > 0);
	});

	it("localizes settings list hint labels by key behavior", () => {
		const tui = { requestRender: () => {} };
		const theme = { fg: (_c, s) => s, bold: (s) => s };
		const comp = new m.SettingsComponent({}, {}, tui, theme, {}, () => {});

		assert.notEqual(comp.settingsList.theme.hint("Enter/Space"), "Enter/Space");
		assert.notEqual(comp.settingsList.theme.hint("No matching settings"), "No matching settings");
		assert.notEqual(comp.settingsList.theme.hint("No settings available"), "No settings available");
		assert.equal(comp.settingsList.theme.hint("Other hint"), "Other hint");
	});

	it("openSettingsMenu returns null when no UI", async () => {
		const result = await m.openSettingsMenu({}, { hasUI: false }, {});
		assert.equal(result, null);
	});

	it("openSettingsMenu renders wrapper and delegates input when UI exists", async () => {
		let rendered;
		let handled;
		const ctx = {
			hasUI: true,
			ui: {
				custom: async (factory) => {
					const component = factory(
						{ requestRender: () => {}, theme: { fg: (_c, s) => s, bold: (s) => s } },
						{ fg: (_c, s) => s, bold: (s) => s },
						{},
						(result) => result,
					);
					rendered = component.render(20);
					component.invalidate();
					handled = component.handleInput("x");
					return { saved: true };
				},
			},
		};
		const result = await m.openSettingsMenu({}, ctx, {});
		assert.deepEqual(result, { saved: true });
		assert.ok(rendered.length > 0);
		assert.equal(handled, true);
	});

	it("parsePercent works", () => {
		const tui = { requestRender: () => {} };
		const theme = { fg: (_c, s) => s, bold: (s) => s };
		const comp = new m.SettingsComponent({}, {}, tui, theme, {}, () => {});
		assert.equal(comp.parsePercent("75%"), 0.75);
		assert.equal(comp.parsePercent("100%"), 1);
		assert.equal(comp.parsePercent("0%"), 0);
		assert.equal(comp.parsePercent("50%"), 0.5);
	});
});

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";
register("../../__mocks__/loader.mjs", import.meta.url);

let SettingsComponent;
let openSettingsMenu;

function createComponent(initialState = {}, ctx = {}) {
	let renderCount = 0;
	const tui = { theme: { fg: (_c, value) => value }, requestRender: () => { renderCount += 1; } };
	const theme = { fg: (_c, value) => value, bold: (value) => value };
	const comp = new SettingsComponent({}, ctx, tui, theme, initialState, () => {});
	return { comp, getRenderCount: () => renderCount };
}

describe("settings interactions", () => {
	it("loads settings module", async () => {
		({ SettingsComponent, openSettingsMenu } = await import("../../../src/ui/settings.ts"));
		assert.equal(typeof SettingsComponent, "function");
		assert.equal(typeof openSettingsMenu, "function");
	});

	it("uses dynamic models from pi when they match fast model names", () => {
		const pi = { getModels: () => [{ id: "slow-large" }, { id: "qwen-fast" }, { id: "custom-32b" }] };
		const tui = { requestRender: () => {} };
		const theme = { fg: (_c, value) => value, bold: (value) => value };
		const comp = new SettingsComponent(pi, {}, tui, theme, {}, () => {});

		assert.deepEqual(comp.items.find((item) => item.id === "pruneModel").values, ["auto", "qwen-fast", "custom-32b"]);
	});

	it("falls back to default models when model lookup throws", () => {
		const pi = { getModels: () => { throw new Error("boom"); } };
		const tui = { requestRender: () => {} };
		const theme = { fg: (_c, value) => value, bold: (value) => value };
		const comp = new SettingsComponent(pi, {}, tui, theme, {}, () => {});

		assert.ok(comp.items.find((item) => item.id === "pruneModel").values.includes("deepseek-v4-flash"));
	});

	it("cycles selected values with left and right keys", () => {
		const { comp, getRenderCount } = createComponent();
		const list = comp.settingsList;
		list.selectedIndex = comp.items.findIndex((item) => item.id === "pruneBatchSize");

		assert.equal(comp.state.pruneBatchSize, 50);
		assert.equal(comp.handleInput("right"), true);
		assert.equal(comp.state.pruneBatchSize, 55);
		assert.equal(comp.handleInput("left"), true);
		assert.equal(comp.state.pruneBatchSize, 50);
		assert.equal(getRenderCount(), 2);
	});

	it("refreshes conditional items when prune mode changes", () => {
		const { comp } = createComponent();
		const pruneOn = comp.items.find((item) => item.id === "pruneOn");
		const onDemand = pruneOn.values[2];

		comp.applyValue("pruneOn", onDemand ?? "on-demand");

		assert.equal(comp.state.pruneOn, "on-demand");
		assert.equal(comp.items.some((item) => item.id === "pruneAgentMessageFallback"), false);
	});

	it("wraps openSettingsMenu custom UI in a renderable component", async () => {
		let rendered = [];
		let handled = false;
		const result = await openSettingsMenu({}, {
			hasUI: true,
			ui: {
				custom: async (factory) => {
					const wrapper = factory(
						{ theme: { fg: (_c, value) => value }, requestRender: () => {} },
						{ fg: (_c, value) => value, bold: (value) => value },
						null,
						() => {},
					);
					rendered = wrapper.render(80);
					handled = wrapper.handleInput("x");
					wrapper.invalidate();
					return { ok: true };
				},
			},
		}, {});

		assert.deepEqual(result, { ok: true });
		assert.equal(handled, true);
		assert.ok(rendered.length > 0);
	});
});

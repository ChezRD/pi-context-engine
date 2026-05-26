import { getSettingsListTheme } from "@earendil-works/pi-coding-agent";
import type { Component } from "@earendil-works/pi-tui";
import { Container, Key, matchesKey, type SettingItem, SettingsList, Text, truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";
import { t } from "../i18n/index.ts";

class BorderedContainer implements Component {
	private child: Component;
	private color: (str: string) => string;

	constructor(child: Component, color: (str: string) => string) {
		this.child = child;
		this.color = color;
	}

	invalidate(): void {
		this.child.invalidate?.();
	}

	render(width: number): string[] {
		const frameWidth = Math.max(8, width);
		const contentWidth = Math.max(1, frameWidth - 4);
		const lines = this.child.render(contentWidth);
		const result = [this.color("┌" + "─".repeat(frameWidth - 2) + "┐")];
		for (const line of lines) {
			const fittedLine = visibleWidth(line) > contentWidth ? truncateToWidth(line, contentWidth, "...") : line;
			const padding = Math.max(0, contentWidth - visibleWidth(fittedLine));
			result.push(this.color("│ ") + fittedLine + " ".repeat(padding) + this.color(" │"));
		}
		result.push(this.color("└" + "─".repeat(frameWidth - 2) + "┘"));
		return result;
	}
}

interface SettingsState {
	// General
	pruneBatchSize: number;
	pruneOn: string;
	pruneAgentMessageFallback: "off" | "next-agent-start" | "before-provider";
	pruneModel: string;
	dashboardVerbosity: "compact" | "normal" | "verbose" | "debug";
	statusBarStyle: "blocks" | "sparkline" | "text";
	foldThreshold: number;
	aggressiveFoldThreshold: number;
	contextForceFoldPct: number;
	diagnostics: boolean;
	pruneEnabled: boolean;
	autoFold: boolean;
	skillPinning: boolean;
	memoryInjection: boolean;
	priorityInjection: boolean;
	autoDetectSkillPins: boolean;
	// Tool Stability
	toolStabilityBypass: string[];
	toolBlockThreshold: number;
}

interface EngineSettingItem extends SettingItem {
	toStateValue: (value: string) => unknown;
}

interface PageDefinition {
	id: string;
	label: string;
	buildItems: (helpers: PageHelpers) => EngineSettingItem[];
}

interface PageHelpers {
	boolValues: string[];
	percentValues: (min: number, max: number, step: number) => string[];
	intValues: (min: number, max: number) => string[];
	localizedOption: (value: string) => string;
	boolItem: (id: keyof SettingsState, labelKey: string, descriptionKey: string) => EngineSettingItem;
	parsePercent: (value: string) => number;
	displayValue: (id: string, value: unknown) => string;
	state: SettingsState;
	dynamicModels: string[];
}

export class SettingsComponent implements Component {
	private pi: any;
	private ctx: any;
	private tui: any;
	private theme: any;
	state: SettingsState;
	private done: (result?: any) => void;
	private settingsList: SettingsList;
	private items: EngineSettingItem[];
	private pages: PageDefinition[];
	private toolDescriptions: Record<string, string> = {};
	currentPageIndex: number;

	constructor(pi: any, ctx: any, tui: any, theme: any, initialState: any, done: (result?: any) => void) {
		this.pi = pi;
		this.ctx = ctx;
		this.tui = tui;
		this.theme = theme;
		if (typeof pi?.getAllTools === "function") {
			try {
				const allTools = pi.getAllTools();
				if (Array.isArray(allTools)) {
					for (const tool of allTools) {
						if (tool?.name && tool?.description) {
							this.toolDescriptions[tool.name] = tool.description;
						}
					}
				}
			} catch {}
		}
		this.currentPageIndex = 0;
		this.done = done;

		const models = this.discoverModels(pi, ctx);
		const bypass = Array.isArray(initialState.toolStabilityBypass) ? initialState.toolStabilityBypass : ["read"];

		this.state = {
			pruneBatchSize: initialState.pruneBatchSize ?? 50,
			pruneOn: initialState.pruneOn ?? "agent-message",
			pruneAgentMessageFallback: initialState.pruneAgentMessageFallback ?? "next-agent-start",
			pruneModel: initialState.pruneModel ?? "deepseek-v4-flash",
			dashboardVerbosity: initialState.dashboardVerbosity ?? "normal",
			statusBarStyle: initialState.statusBarStyle ?? "sparkline",
			foldThreshold: initialState.foldThreshold ?? 0.75,
			aggressiveFoldThreshold: initialState.aggressiveFoldThreshold ?? 0.78,
			contextForceFoldPct: initialState.contextForceFoldPct ?? 0.95,
			diagnostics: initialState.diagnostics ?? false,
			pruneEnabled: initialState.pruneEnabled ?? true,
			autoFold: initialState.autoFold ?? true,
			skillPinning: initialState.skillPinning ?? true,
			memoryInjection: initialState.memoryInjection ?? false,
			priorityInjection: initialState.priorityInjection ?? true,
			autoDetectSkillPins: initialState.autoDetectSkillPins ?? true,
			toolStabilityBypass: [...bypass],
			toolBlockThreshold: initialState.toolBlockThreshold ?? 2,
		};

		this.pages = this.buildPages(models);
		this.items = this.pages[0].buildItems(this.pageHelpers());
		const listTheme = this.localizedSettingsTheme();
		this.settingsList = new SettingsList(
			this.items,
			Math.min(this.items.length + 2, 15),
			listTheme,
			(id, newValue) => {
				this.applyValue(id, newValue);
			},
			() => this.done(this.state),
			{ enableSearch: true },
		);
	}

	private discoverModels(pi: any, ctx: any): string[] {
		let dynamicModels = ["auto", "deepseek-v4-flash", "deepseek-v4-pro", "gemini-3-flash", "gemini-2.5-flash", "gpt-4.2-mini", "gpt-4o-mini", "claude-3-5-haiku", "llama-4-8b"];
		try {
			let rawModels: any[] = [];
			if (Array.isArray(ctx?.models)) rawModels = ctx.models;
			else if (typeof pi?.getModels === "function") rawModels = pi.getModels();
			else if (typeof ctx?.getModels === "function") rawModels = ctx.getModels();

			if (rawModels.length > 0) {
				const ids = rawModels.map(m => m?.id ?? m).filter((id: any) => typeof id === "string");
				const fastModels = ids.filter((id: string) => {
					const l = id.toLowerCase();
					return l.includes("flash") ||
						l.includes("mini") ||
						l.includes("haiku") ||
						l.includes("sonnet") ||
						l.includes("chat") ||
						l.includes("nano") ||
						l.includes("lite") ||
						l.includes("qwen") ||
						l.includes("command") ||
						l.match(/[1-9][0-9]{0,2}b/i);
				});
				if (fastModels.length > 0) {
					dynamicModels = ["auto", ...Array.from(new Set(fastModels))];
				}
			}
		} catch (e) {
			// ignore
		}
		return dynamicModels;
	}

	invalidate(): void {}

	handleInput(data: string): boolean | void {
		// Tab / Shift+Tab — switch pages
		if (matchesKey(data, Key.tab) || data === Key.tab) {
			this.switchPage((this.currentPageIndex + 1) % this.pages.length);
			this.tui.requestRender();
			return true;
		}
		if (matchesKey(data, Key.shift("tab")) || data === "S-tab") {
			this.switchPage((this.currentPageIndex - 1 + this.pages.length) % this.pages.length);
			this.tui.requestRender();
			return true;
		}
		// Left/right cycle current item value
		if (matchesKey(data, Key.left)) {
			this.cycleSelected(-1);
			this.tui.requestRender();
			return true;
		}
		if (matchesKey(data, Key.right)) {
			this.cycleSelected(1);
			this.tui.requestRender();
			return true;
		}
		this.settingsList.handleInput(data);
		this.tui.requestRender();
		return true;
	}

	private switchPage(index: number): void {
		this.currentPageIndex = index;
		this.rebuildItems();
	}

	private rebuildItems(): void {
		const helpers = this.pageHelpers();
		const page = this.pages[this.currentPageIndex];
		this.items = page.buildItems(helpers);
		const list = this.settingsList as any;
		list.items = this.items;
		list.filteredItems = this.items;
		list.selectedIndex = Math.min(list.selectedIndex ?? 0, Math.max(0, this.items.length - 1));
	}

	private applyValue(id: string, newValue: string): void {
		const item = this.items.find((entry) => entry.id === id);
		if (!item) return;
		const raw = item.toStateValue(newValue);
		// Special case: bypass_ prefixed items update the toolStabilityBypass array
		if (id.startsWith("bypass_")) {
			this.state.toolStabilityBypass = raw as string[];
			this.rebuildItems();
			return;
		}
		(this.state as any)[id] = raw;
		// Rebuild items for current page to reflect state changes
		this.rebuildItems();
		this.settingsList.updateValue(id, this.displayValue(id, (this.state as any)[id]));
	}

	private pageHelpers(): PageHelpers {
		const boolValues = [t("ui.settings.value.on"), t("ui.settings.value.off")];
		const percentValues = (min: number, max: number, step: number) => {
			const result: string[] = [];
			for (let value = min; value <= max + 0.0001; value += step) {
				result.push(`${Math.round(value * 100)}%`);
			}
			return result;
		};
		const intValues = (min: number, max: number) => Array.from({ length: max - min + 1 }, (_, index) => `${min + index}`);
		const localizedOption = (value: string) => t(`ui.settings.value.${value}`);
		const boolItem = (id: keyof SettingsState, labelKey: string, descriptionKey: string): EngineSettingItem => ({
			id,
			label: t(labelKey),
			description: t(descriptionKey),
			currentValue: this.displayValue(id, this.state[id]),
			values: boolValues,
			toStateValue: (value) => value === t("ui.settings.value.on"),
		});
		return {
			boolValues,
			percentValues,
			intValues,
			localizedOption,
			boolItem,
			parsePercent: this.parsePercent.bind(this),
			displayValue: this.displayValue.bind(this),
			state: this.state,
			dynamicModels: this.discoverModels(this.pi, this.ctx),
		};
	}

	private buildPages(dynamicModels: string[]): PageDefinition[] {
		return [
			{
				id: "general",
				label: t("ui.settings.page.general"),
				buildItems: (h) => this.buildGeneralPage(h),
			},
			{
				id: "stability",
				label: t("ui.settings.page.stability"),
				buildItems: (h) => this.buildStabilityPage(h),
			},
		];
	}

	private buildGeneralPage(h: PageHelpers): EngineSettingItem[] {
		const pruneModes = ["agent-message", "checkpoint", "on-demand", "agentic-auto", "every-turn"];
		const agentMessageFallbackModes = ["next-agent-start", "before-provider", "off"];
		const verbosityModes = ["compact", "normal", "verbose", "debug"];
		const statusStyles = ["blocks", "text", "sparkline"];

		return [
			{
				id: "pruneEnabled",
				label: t("ui.settings.pruneEnabled"),
				description: t("ui.settings.pruneEnabled.help"),
				currentValue: h.displayValue("pruneEnabled", h.state.pruneEnabled),
				values: h.boolValues,
				toStateValue: (value) => value === t("ui.settings.value.on"),
			},
			{
				id: "pruneOn",
				label: t("ui.settings.pruneOn"),
				description: t("ui.settings.pruneOn.help"),
				currentValue: h.displayValue("pruneOn", h.state.pruneOn),
				values: pruneModes.map(h.localizedOption),
				toStateValue: (value) => pruneModes.find((mode) => h.localizedOption(mode) === value) ?? h.state.pruneOn,
			},
			...(h.state.pruneOn === "agent-message" ? [{
				id: "pruneBatchSize",
				label: t("ui.settings.pruneBatchSize"),
				description: t("ui.settings.pruneBatchSize.help"),
				currentValue: h.displayValue("pruneBatchSize", h.state.pruneBatchSize),
				values: h.intValues(20, 100).filter((value) => Number(value) % 5 === 0),
				toStateValue: (value: string) => Number(value),
			}, {
				id: "pruneAgentMessageFallback",
				label: t("ui.settings.pruneAgentMessageFallback"),
				description: t("ui.settings.pruneAgentMessageFallback.help"),
				currentValue: h.displayValue("pruneAgentMessageFallback", h.state.pruneAgentMessageFallback),
				values: agentMessageFallbackModes.map(h.localizedOption),
				toStateValue: (value: string) => agentMessageFallbackModes.find((mode) => h.localizedOption(mode) === value) ?? h.state.pruneAgentMessageFallback,
			}] satisfies EngineSettingItem[] : []),
			{
				id: "pruneModel",
				label: t("ui.settings.pruneModel"),
				description: t("ui.settings.pruneModel.help"),
				currentValue: h.displayValue("pruneModel", h.state.pruneModel),
				values: h.dynamicModels,
				toStateValue: (value) => value,
			},
			{
				id: "dashboardVerbosity",
				label: t("ui.settings.dashboardVerbosity"),
				description: t("ui.settings.dashboardVerbosity.help"),
				currentValue: h.displayValue("dashboardVerbosity", h.state.dashboardVerbosity),
				values: verbosityModes.map(h.localizedOption),
				toStateValue: (value) => verbosityModes.find((mode) => h.localizedOption(mode) === value) ?? h.state.dashboardVerbosity,
			},
			{
				id: "statusBarStyle",
				label: t("ui.settings.statusBarStyle"),
				description: t("ui.settings.statusBarStyle.help"),
				currentValue: h.displayValue("statusBarStyle", h.state.statusBarStyle),
				values: statusStyles.map(h.localizedOption),
				toStateValue: (value) => statusStyles.find((style) => h.localizedOption(style) === value) ?? h.state.statusBarStyle,
			},
			{
				id: "foldThreshold",
				label: t("ui.settings.foldThreshold"),
				description: t("ui.settings.foldThreshold.help"),
				currentValue: h.displayValue("foldThreshold", h.state.foldThreshold),
				values: h.percentValues(0.1, 0.99, 0.01),
				toStateValue: h.parsePercent,
			},
			{
				id: "aggressiveFoldThreshold",
				label: t("ui.settings.aggressiveFoldThreshold"),
				description: t("ui.settings.aggressiveFoldThreshold.help"),
				currentValue: h.displayValue("aggressiveFoldThreshold", h.state.aggressiveFoldThreshold),
				values: h.percentValues(0.1, 0.99, 0.01),
				toStateValue: h.parsePercent,
			},
			{
				id: "contextForceFoldPct",
				label: t("ui.settings.contextForceFoldPct"),
				description: t("ui.settings.contextForceFoldPct.help"),
				currentValue: h.displayValue("contextForceFoldPct", h.state.contextForceFoldPct),
				values: h.percentValues(0.1, 1, 0.05),
				toStateValue: h.parsePercent,
			},
			h.boolItem("autoFold", "ui.settings.autoFold", "ui.settings.autoFold.help"),
			h.boolItem("diagnostics", "ui.settings.diagnostics", "ui.settings.diagnostics.help"),
			h.boolItem("skillPinning", "ui.settings.skillPinning", "ui.settings.skillPinning.help"),
			h.boolItem("priorityInjection", "ui.settings.priorityInjection", "ui.settings.priorityInjection.help"),
			h.boolItem("memoryInjection", "ui.settings.memoryInjection", "ui.settings.memoryInjection.help"),
			h.boolItem("autoDetectSkillPins", "ui.settings.autoDetectSkillPins", "ui.settings.autoDetectSkillPins.help"),
		];
	}

	private buildStabilityPage(h: PageHelpers): EngineSettingItem[] {
		const thresholdValues = h.intValues(1, 10);
		const allStabilityTools = ["read", "bash", "edit", "write", "grep", "ffgrep", "fffind", "todo", "web_search", "web_fetch",
			"get_goal", "create_goal", "update_goal", "agent_browser", "intercom", "subagent",
			"context_cache_fold", "context_checkpoint", "context_parallel_read", "context_rewind",
			"context_prune", "context_timeline", "context_pin_skill", "context_pin",
		];

		return [
			{
				id: "toolBlockThreshold",
				label: t("ui.settings.toolBlockThreshold"),
				description: t("ui.settings.toolBlockThreshold.help"),
				currentValue: String(h.state.toolBlockThreshold),
				values: thresholdValues,
				toStateValue: (value: string) => Number(value),
			},
			...allStabilityTools.map((toolName) => ({
				id: `bypass_${toolName}`,
				label: toolName,
				description: this.toolDescriptions[toolName] ?? t("ui.settings.bypass.description"),
				currentValue: h.state.toolStabilityBypass.includes(toolName) ? t("ui.settings.value.on") : t("ui.settings.value.off"),
				values: h.boolValues,
				toStateValue: (value: string) => {
					const enabled = value === t("ui.settings.value.on");
					const current = [...h.state.toolStabilityBypass];
					if (enabled && !current.includes(toolName)) {
						current.push(toolName);
					} else if (!enabled) {
						const idx = current.indexOf(toolName);
						if (idx !== -1) current.splice(idx, 1);
					}
					return current;
				},
			}) satisfies EngineSettingItem),
		];
	}

	private cycleSelected(direction: -1 | 1): void {
		const list = this.settingsList as any;
		const displayItems = list.searchEnabled ? list.filteredItems : list.items;
		const item = displayItems?.[list.selectedIndex] as EngineSettingItem | undefined;
		if (!item?.values || item.values.length === 0) return;
		const currentIndex = Math.max(0, item.values.indexOf(item.currentValue));
		const nextIndex = (currentIndex + direction + item.values.length) % item.values.length;
		const nextValue = item.values[nextIndex];
		item.currentValue = nextValue;
		this.applyValue(item.id, nextValue);
	}

	private parsePercent(value: string): number {
		return Math.round((Number(value.replace("%", "")) / 100) * 100) / 100;
	}

	private displayValue(id: string, value: unknown): string {
		if (typeof value === "boolean") return value ? t("ui.settings.value.on") : t("ui.settings.value.off");
		if (id === "statusBarStyle" || id === "pruneOn" || id === "dashboardVerbosity" || id === "pruneAgentMessageFallback") return t(`ui.settings.value.${String(value)}`);
		if (id === "foldThreshold" || id === "aggressiveFoldThreshold" || id === "contextForceFoldPct") return `${Math.round(Number(value) * 100)}%`;
		return String(value);
	}

	private localizedSettingsTheme() {
		const base = getSettingsListTheme();
		return {
			...base,
			hint: (text: string) => {
				if (text.includes("Enter/Space")) return base.hint(`  ${t("ui.settings.hint")}`);
				if (text.includes("No matching settings")) return base.hint(`  ${t("ui.settings.noMatches")}`);
				if (text.includes("No settings available")) return base.hint(`  ${t("ui.settings.noItems")}`);
				return base.hint(text);
			},
		};
	}

	render(width: number): string[] {
		const theme = this.theme || this.tui?.theme || { fg: (_c: string, s: string) => s, bold: (s: string) => s };
		const container = new Container();

		// Title
		container.addChild(new Text(theme.fg("accent", theme.bold(t("ui.settings.title"))), 1, 0));

		// Tab bar: ←  General  /  Stability  /  Commands  →
		const tabParts = this.pages.map((page, index) => {
			const label = page.label;
			if (index === this.currentPageIndex) {
				return theme.bold(theme.fg("accent", ` ${label} `));
			}
			return theme.fg("dim", ` ${label} `);
		});
		const tabBar = ` ${theme.fg("dim", "←")} ${tabParts.join(theme.fg("dim", " / "))} ${theme.fg("dim", "→")}`;

		container.addChild(new Text(""));
		container.addChild(new Text(tabBar));
		container.addChild(new Text(theme.fg("dim", "  " + t("ui.settings.pageHint"))));
		container.addChild(new Text(""));

		// Current page
		container.addChild(this.settingsList);
		return container.render(width);
	}

	getState(): SettingsState {
		return { ...this.state };
	}
}

export async function openSettingsMenu(pi: any, ctx: any, currentState: any): Promise<any> {
	if (!ctx.hasUI) return null;
	const result = await ctx.ui.custom((tui: any, theme: any, _kb: any, done: (res?: any) => void) => {
		const comp = new SettingsComponent(pi, ctx, tui, theme, currentState, done);
		const wrapper = new BorderedContainer(comp, (s) => (theme ?? tui.theme).fg("accent", s));
		return {
			render: (w: number) => wrapper.render(w),
			invalidate: () => wrapper.invalidate(),
			handleInput: (data: string) => comp.handleInput(data),
		};
	});
	return result;
}

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
	pruneBatchSize: number;
	pruneOn: string;
	pruneAgentMessageFallback: "off" | "before-provider";
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
}

interface EngineSettingItem extends SettingItem {
	toStateValue: (value: string) => unknown;
}

export class SettingsComponent implements Component {
	private tui: any;
	private theme: any;
	private state: SettingsState;
	private done: (result?: any) => void;
	private settingsList: SettingsList;
	private items: EngineSettingItem[];
	constructor(pi: any, ctx: any, tui: any, theme: any, initialState: any, done: (result?: any) => void) {
		this.tui = tui;
		this.theme = theme;
		this.done = done;

		let dynamicModels = ["auto", "deepseek-v4-flash", "deepseek-v4-pro", "gemini-3-flash", "gemini-2.5-flash", "gpt-4.2-mini", "gpt-4o-mini", "claude-3-5-haiku", "llama-4-8b"];
		try {
			let rawModels: any[] = [];
			if (Array.isArray(ctx?.models)) rawModels = ctx.models;
			else if (typeof pi?.getModels === "function") rawModels = pi.getModels();
			else if (typeof ctx?.getModels === "function") rawModels = ctx.getModels();
			
			if (rawModels.length > 0) {
				const ids = rawModels.map(m => m?.id ?? m).filter(id => typeof id === "string");
				const fastModels = ids.filter(id => {
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

		this.state = {
			pruneBatchSize: initialState.pruneBatchSize ?? 5,
			pruneOn: initialState.pruneOn ?? "agent-message",
			pruneAgentMessageFallback: initialState.pruneAgentMessageFallback ?? "before-provider",
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
		};
		this.items = this.buildItems(dynamicModels);
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

	invalidate(): void {}

	handleInput(data: string): boolean | void {
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

	private applyValue(id: string, newValue: string): void {
		const item = this.items.find((entry) => entry.id === id);
		if (!item) return;
		(this.state as any)[id] = item.toStateValue(newValue);
		this.refreshItems();
		this.settingsList.updateValue(id, this.displayValue(id, (this.state as any)[id]));
	}

	private refreshItems(): void {
		const list = this.settingsList as any;
		const dynamicModels = this.items.find((item) => item.id === "pruneModel")?.values ?? ["auto"];
		this.items = this.buildItems(dynamicModels);
		list.items = this.items;
		list.filteredItems = this.items;
		list.selectedIndex = Math.min(list.selectedIndex ?? 0, Math.max(0, this.items.length - 1));
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

	private buildItems(dynamicModels: string[]): EngineSettingItem[] {
		const boolValues = [t("ui.settings.value.on"), t("ui.settings.value.off")];
		const percentValues = (min: number, max: number, step: number) => {
			const result: string[] = [];
			for (let value = min; value <= max + 0.0001; value += step) {
				result.push(`${Math.round(value * 100)}%`);
			}
			return result;
		};
		const intValues = (min: number, max: number) => Array.from({ length: max - min + 1 }, (_, index) => `${min + index}`);
		const pruneModes = ["agent-message", "checkpoint", "on-demand", "agentic-auto", "every-turn"];
		const agentMessageFallbackModes = ["before-provider", "off"];
		const verbosityModes = ["compact", "normal", "verbose", "debug"];
		const statusStyles = ["blocks", "text", "sparkline"];
		const localizedOption = (value: string) => t(`ui.settings.value.${value}`);
		const boolItem = (id: keyof SettingsState, labelKey: string, descriptionKey: string): EngineSettingItem => ({
			id,
			label: t(labelKey),
			description: t(descriptionKey),
			currentValue: this.displayValue(id, this.state[id]),
			values: boolValues,
			toStateValue: (value) => value === t("ui.settings.value.on"),
		});

		return [
			{
				id: "pruneEnabled",
				label: t("ui.settings.pruneEnabled"),
				description: t("ui.settings.pruneEnabled.help"),
				currentValue: this.displayValue("pruneEnabled", this.state.pruneEnabled),
				values: boolValues,
				toStateValue: (value) => value === t("ui.settings.value.on"),
			},
			{
				id: "pruneOn",
				label: t("ui.settings.pruneOn"),
				description: t("ui.settings.pruneOn.help"),
				currentValue: this.displayValue("pruneOn", this.state.pruneOn),
				values: pruneModes.map(localizedOption),
				toStateValue: (value) => pruneModes.find((mode) => localizedOption(mode) === value) ?? this.state.pruneOn,
			},
			...(this.state.pruneOn === "agent-message" ? [{
				id: "pruneBatchSize",
				label: t("ui.settings.pruneBatchSize"),
				description: t("ui.settings.pruneBatchSize.help"),
				currentValue: this.displayValue("pruneBatchSize", this.state.pruneBatchSize),
				values: intValues(1, 20),
				toStateValue: (value: string) => Number(value),
			}, {
				id: "pruneAgentMessageFallback",
				label: t("ui.settings.pruneAgentMessageFallback"),
				description: t("ui.settings.pruneAgentMessageFallback.help"),
				currentValue: this.displayValue("pruneAgentMessageFallback", this.state.pruneAgentMessageFallback),
				values: agentMessageFallbackModes.map(localizedOption),
				toStateValue: (value: string) => agentMessageFallbackModes.find((mode) => localizedOption(mode) === value) ?? this.state.pruneAgentMessageFallback,
			}] satisfies EngineSettingItem[] : []),
			{
				id: "pruneModel",
				label: t("ui.settings.pruneModel"),
				description: t("ui.settings.pruneModel.help"),
				currentValue: this.displayValue("pruneModel", this.state.pruneModel),
				values: dynamicModels,
				toStateValue: (value) => value,
			},
			{
				id: "dashboardVerbosity",
				label: t("ui.settings.dashboardVerbosity"),
				description: t("ui.settings.dashboardVerbosity.help"),
				currentValue: this.displayValue("dashboardVerbosity", this.state.dashboardVerbosity),
				values: verbosityModes.map(localizedOption),
				toStateValue: (value) => verbosityModes.find((mode) => localizedOption(mode) === value) ?? this.state.dashboardVerbosity,
			},
			{
				id: "statusBarStyle",
				label: t("ui.settings.statusBarStyle"),
				description: t("ui.settings.statusBarStyle.help"),
				currentValue: this.displayValue("statusBarStyle", this.state.statusBarStyle),
				values: statusStyles.map(localizedOption),
				toStateValue: (value) => statusStyles.find((style) => localizedOption(style) === value) ?? this.state.statusBarStyle,
			},
			{
				id: "foldThreshold",
				label: t("ui.settings.foldThreshold"),
				description: t("ui.settings.foldThreshold.help"),
				currentValue: this.displayValue("foldThreshold", this.state.foldThreshold),
				values: percentValues(0.1, 0.99, 0.01),
				toStateValue: this.parsePercent,
			},
			{
				id: "aggressiveFoldThreshold",
				label: t("ui.settings.aggressiveFoldThreshold"),
				description: t("ui.settings.aggressiveFoldThreshold.help"),
				currentValue: this.displayValue("aggressiveFoldThreshold", this.state.aggressiveFoldThreshold),
				values: percentValues(0.1, 0.99, 0.01),
				toStateValue: this.parsePercent,
			},
			{
				id: "contextForceFoldPct",
				label: t("ui.settings.contextForceFoldPct"),
				description: t("ui.settings.contextForceFoldPct.help"),
				currentValue: this.displayValue("contextForceFoldPct", this.state.contextForceFoldPct),
				values: percentValues(0.1, 1, 0.05),
				toStateValue: this.parsePercent,
			},
			boolItem("autoFold", "ui.settings.autoFold", "ui.settings.autoFold.help"),
			boolItem("diagnostics", "ui.settings.diagnostics", "ui.settings.diagnostics.help"),
			boolItem("skillPinning", "ui.settings.skillPinning", "ui.settings.skillPinning.help"),
			boolItem("priorityInjection", "ui.settings.priorityInjection", "ui.settings.priorityInjection.help"),
			boolItem("memoryInjection", "ui.settings.memoryInjection", "ui.settings.memoryInjection.help"),
			boolItem("autoDetectSkillPins", "ui.settings.autoDetectSkillPins", "ui.settings.autoDetectSkillPins.help"),
		];
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

	render(width: number): string[] {
		const theme = this.theme || this.tui?.theme || { fg: (_c: string, s: string) => s, bold: (s: string) => s };
		const container = new Container();

		container.addChild(new Text(theme.fg("accent", theme.bold(t("ui.settings.title"))), 1, 0));
		container.addChild(new Text(""));
		container.addChild(this.settingsList);
		return container.render(width);
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

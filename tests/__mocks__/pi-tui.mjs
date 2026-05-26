// Mock for @earendil-works/pi-tui, built from pi/packages/tui/src/ source.
// All exports used by pi-context-engine source files are mocked here

export class Component {
	render(width) { return []; }
}

export class Container {
	constructor() { this.children = []; this.parent = null; }
	addChild(c) { this.children.push(c); c.parent = this; return this; }
	removeAllChildren() { this.children = []; }
	render(width) {
		return this.children.flatMap(c => {
			if (typeof c === 'string') return [c];
			if (c.render) return c.render(width);
			return [''];
		});
	}
}

export class Text {
	constructor(text = "", paddingX = 1, paddingY = 1, customBgFn) {
		this.text = text;
		this.paddingX = paddingX;
		this.paddingY = paddingY;
		this.customBgFn = customBgFn;
		this._cachedLines = undefined;
	}
	setText(text) { this.text = text; this._cachedLines = undefined; }
	setCustomBgFn(fn) { this.customBgFn = fn; this._cachedLines = undefined; }
	invalidate() { this._cachedLines = undefined; }
	render(width) {
		if (!this.text || this.text.trim() === "") return [];
		const lines = [];
		// simple word-wrap by width
		const contentWidth = Math.max(1, width - this.paddingX * 2);
		let remaining = this.text;
		while (remaining.length > 0) {
			let chunk = remaining.slice(0, contentWidth);
			remaining = remaining.slice(contentWidth);
			lines.push(" ".repeat(this.paddingX) + chunk + " ".repeat(this.paddingX));
		}
		this._cachedLines = lines;
		return lines;
	}
}

export class Spacer {
	constructor(lines = 1) { this.lines = lines; }
	setLines(n) { this.lines = n; }
	invalidate() {}
	render(_width) { return Array.from({ length: this.lines }, () => ""); }
}

export class SettingsList {
	constructor(items, maxVisible, theme, onChange, onCancel, options = {}) {
		this.items = items || [];
		this.filteredItems = this.items;
		this.selectedIndex = 0;
		this.maxVisible = maxVisible ?? 10;
		this.theme = theme ?? { label: (t) => t, value: (t) => t, description: (t) => t, cursor: ">", hint: (t) => t };
		this.onChange = onChange || (() => {});
		this.onCancel = onCancel || (() => {});
		this.searchEnabled = options.enableSearch ?? false;
		this.submenuComponent = null;
	}
	handleInput(data) {
		const kb = { matches: () => false };
		return; // no-op mock
	}
	updateValue(id, newValue) {
		const item = this.items.find(i => i.id === id);
		if (item) item.currentValue = newValue;
	}
	invalidate() {}
	render(width) {
		return this.items.map(item => `  ${item.label}: ${item.currentValue}`);
	}
}

export const Key = {
	ESC: "escape",
	ENTER: "enter",
	UP: "up",
	DOWN: "down",
	TAB: "tab",
	escape: "escape",
	enter: "enter",
	up: "up",
	down: "down",
	left: "left",
	right: "right",
	tab: "tab",
	shift: (k) => `shift+${k}`,
	pageUp: "pageUp",
	pageDown: "pageDown",
};
export function matchesKey(data, keyId) {
	if (keyId === "shift+tab") return data === "S-tab" || data === "\x1b[Z";
	return data === keyId;
}

// Utility functions
export function truncateToWidth(s, w) { return s; }
export function visibleWidth(s) { return s?.length ?? 0; }
export function wrapTextWithAnsi(text, width) {
	// simple wrap: split by width
	const result = [];
	for (let i = 0; i < text.length; i += width) {
		result.push(text.slice(i, i + width));
	}
	return result;
}

export class TerminalImage {
	constructor() {}
	async render() { return ""; }
	async renderToString() { return ""; }
}

// Re-export all for convenience
export default { Component, Container, Text, Spacer, SettingsList, Key, matchesKey, truncateToWidth, visibleWidth, wrapTextWithAnsi, TerminalImage };

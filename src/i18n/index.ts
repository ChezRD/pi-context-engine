import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { I18N_NAMESPACE, type LocaleMessages, type Messages } from "./types.ts";

export { I18N_LOCALES, I18N_NAMESPACE, type Locale, type Messages } from "./types.ts";

const LOCALE_FILES = {
	de: "de.json",
	en: "en.json",
	es: "es.json",
	fr: "fr.json",
	pt: "pt.json",
	"pt-BR": "pt-br.json",
	ru: "ru.json",
	uk: "uk.json",
	"zh-CN": "zh-cn.json",
} as const;

function sortMessages(messages: Messages): Messages {
	return Object.freeze(Object.fromEntries(Object.entries(messages).sort(([left], [right]) => left.localeCompare(right))));
}

function loadLocale(file: string): Messages {
	const url = new URL(`./locales/${file}`, import.meta.url);
	return sortMessages(JSON.parse(readFileSync(url, "utf8")) as Record<string, string>);
}

export const messages: LocaleMessages = Object.freeze({
	de: loadLocale(LOCALE_FILES.de),
	en: loadLocale(LOCALE_FILES.en),
	es: loadLocale(LOCALE_FILES.es),
	fr: loadLocale(LOCALE_FILES.fr),
	pt: loadLocale(LOCALE_FILES.pt),
	"pt-BR": loadLocale(LOCALE_FILES["pt-BR"]),
	ru: loadLocale(LOCALE_FILES.ru),
	uk: loadLocale(LOCALE_FILES.uk),
	"zh-CN": loadLocale(LOCALE_FILES["zh-CN"]),
});

export const de = messages.de;
export const en = messages.en;
export const es = messages.es;
export const fr = messages.fr;
export const pt = messages.pt;
export const ptBR = messages["pt-BR"];
export const ru = messages.ru;
export const uk = messages.uk;
export const zhCN = messages["zh-CN"];

type Runtime = {
	registry: Map<string, Map<string, Messages>>;
	activeLocale?: string;
	forcedLocale?: string;
	activeStrings: Map<string, Messages>;
};

type RpivRuntime = { activeLocale?: string };
type RpivSnapshot = { locale?: string };

const RUNTIME_KEY = Symbol.for("pi-context-engine.i18n.runtime");
const RPIV_RUNTIME_KEY = Symbol.for("rpiv-i18n.runtime");
const RPIV_SNAPSHOT_KEY = Symbol.for("rpiv-i18n");

function getRuntime(): Runtime {
	const global = globalThis as unknown as { [RUNTIME_KEY]?: Runtime };
	let runtime = global[RUNTIME_KEY];
	if (!runtime) {
		runtime = { registry: new Map(), activeStrings: new Map() };
		global[RUNTIME_KEY] = runtime;
	}
	return runtime;
}

export function parseLangEnv(value: string | undefined): string | undefined {
	if (!value) return undefined;
	const raw = value.split(".")[0]?.replace(/_/g, "-");
	if (!raw || raw === "C" || raw === "POSIX") return undefined;
	const lower = raw.toLowerCase();
	if (lower === "zh" || lower === "zn" || lower === "zh-cn" || lower === "zh-hans" || lower === "zh-hans-cn") return "zh-CN";
	if (lower === "pt-br") return "pt-BR";
	const [language, region] = raw.split("-");
	if (!language) return undefined;
	return region ? `${language.toLowerCase()}-${region.toUpperCase()}` : language.toLowerCase();
}

function normalizeLocale(value: string | undefined): string | undefined {
	return parseLangEnv(value);
}

function localeFromArgs(): string | undefined {
	const args = process.argv ?? [];
	const index = args.indexOf("--locale");
	if (index >= 0) return normalizeLocale(args[index + 1]);
	const inline = args.find((arg) => arg.startsWith("--locale="));
	return normalizeLocale(inline?.slice("--locale=".length));
}

function localeFromConfig(): string | undefined {
	try {
		const home = process.env.HOME;
		if (!home) return undefined;
		const path = join(home, ".config", "rpiv-i18n", "locale.json");
		if (!existsSync(path)) return undefined;
		const parsed = JSON.parse(readFileSync(path, "utf8")) as { locale?: string };
		return normalizeLocale(parsed.locale);
	} catch {
		return undefined;
	}
}

function localeFromEnv(): string | undefined {
	return normalizeLocale(process.env.LANG) ?? normalizeLocale(process.env.LC_ALL) ?? normalizeLocale(process.env.LC_MESSAGES) ?? normalizeLocale(process.env.LANGUAGE);
}

function localeFromRpiv(): string | undefined {
	const global = globalThis as unknown as { [RPIV_RUNTIME_KEY]?: RpivRuntime; [RPIV_SNAPSHOT_KEY]?: RpivSnapshot };
	return normalizeLocale(global[RPIV_RUNTIME_KEY]?.activeLocale) ?? normalizeLocale(global[RPIV_SNAPSHOT_KEY]?.locale);
}

export function detectLocale(): string {
	const runtime = getRuntime();
	return runtime.forcedLocale ?? localeFromRpiv() ?? localeFromArgs() ?? localeFromConfig() ?? localeFromEnv() ?? "en";
}

function registerStrings(namespace: string, byLocale: LocaleMessages): void {
	const runtime = getRuntime();
	const map = new Map<string, Messages>();
	for (const [locale, strings] of Object.entries(byLocale)) map.set(locale, Object.freeze({ ...strings }));
	runtime.registry.set(namespace, map);
	rebuildActive(namespace);
}

function findLocaleMap(byLocale: Map<string, Messages>, locale: string): Messages | undefined {
	const direct = byLocale.get(locale);
	if (direct) return direct;
	const short = locale.split("-")[0] ?? locale;
	const shortMatch = byLocale.get(short);
	if (shortMatch) return shortMatch;
	if (short.length === 2) {
		for (const [candidate, strings] of byLocale) if (candidate.toLowerCase().startsWith(`${short}-`)) return strings;
	}
	return undefined;
}

function pickStringsForLocale(byLocale: Map<string, Messages>, locale: string): Messages {
	const base = byLocale.get("en") ?? en;
	if (locale === "en") return base;
	return Object.freeze({ ...base, ...(findLocaleMap(byLocale, locale) ?? {}) });
}

function rebuildActive(namespace?: string): void {
	const runtime = getRuntime();
	runtime.activeLocale = detectLocale();
	const entries = namespace ? [[namespace, runtime.registry.get(namespace)] as const] : [...runtime.registry.entries()];
	for (const [ns, byLocale] of entries) {
		if (!byLocale) continue;
		runtime.activeStrings.set(ns, pickStringsForLocale(byLocale, runtime.activeLocale));
	}
}

export function applyLocale(locale: string | undefined): void {
	getRuntime().forcedLocale = normalizeLocale(locale);
	rebuildActive();
}

export function getActiveLocale(): string {
	rebuildActive();
	return getRuntime().activeLocale ?? "en";
}

function interpolate(template: string, vars: Record<string, string | number | undefined> = {}): string {
	return template.replace(/\{(\w+)\}/g, (_match, name) => String(vars[name] ?? ""));
}

function lookup(namespace: string, key: string, vars?: Record<string, string | number | undefined>): string {
	rebuildActive(namespace);
	const runtime = getRuntime();
	const active = runtime.activeStrings.get(namespace) ?? en;
	return interpolate(active[key] ?? en[key] ?? key, vars);
}

export function t(configOrKey: unknown, keyOrVars?: string | Record<string, string | number | undefined>, maybeVars?: Record<string, string | number | undefined>): string {
	const key = typeof configOrKey === "string" ? configOrKey : typeof keyOrVars === "string" ? keyOrVars : "";
	const vars = typeof configOrKey === "string"
		? (keyOrVars && typeof keyOrVars === "object" ? keyOrVars as Record<string, string | number | undefined> : maybeVars)
		: maybeVars;
	return lookup(I18N_NAMESPACE, key, vars);
}

registerStrings(I18N_NAMESPACE, messages);

try {
	const sdk = await import("@juicesharp/rpiv-i18n") as { registerStrings: (namespace: string, byLocale: LocaleMessages) => void };
	sdk.registerStrings(I18N_NAMESPACE, messages);
} catch {
	// Optional peer absent. Local runtime still handles --locale/config/LANG and English fallback.
}

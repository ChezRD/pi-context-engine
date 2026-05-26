// Mock i18n module for testing — returns defaultValue or key, locale-independent
export const I18N_NAMESPACE = "context-engine";
export const I18N_LOCALES = ["de", "en", "es", "fr", "pt", "pt-BR", "ru", "uk", "zh-CN"];
export const de = {};
export const en = {};
export const es = {};
export const fr = {};
export const pt = {};
export const ptBR = {};
export const uk = {};
export const ru = {};
export const zhCN = {};

export function getActiveLocale() { return "en"; }
export function detectLocale() { return "en"; }
export function parseLangEnv(v) { return v ?? "en"; }
export function applyLocale() {}
export function setLocale() {}

export function t(key, opts, values) {
	// t(namespace, key, options) or t(key, options) or t(namespace, key)
	const actualKey = typeof key === "string" ? key : typeof opts === "string" ? opts : key;
	const actualOpts = typeof key === "string" ? opts : typeof opts === "object" && opts !== null ? opts : values;
	if (actualOpts?.defaultValue) return actualOpts.defaultValue;
	if (actualKey === "tool.pinSkill.notFound") {
		return `Skill "${actualOpts?.name}" not found. Available skills: ${actualOpts?.skills}`;
	}
	// If we have value/status/count in options, return it
	if (actualOpts?.value !== undefined) return String(actualOpts.value);
	if (actualOpts?.status !== undefined) return String(actualOpts.status);
	if (actualOpts?.count !== undefined) return String(actualOpts.count);
	return actualKey;
}

export function tArray(key) { return []; }
export function tArrayMerged(key) { return []; }
export const localeFallbackChain = ["en"];

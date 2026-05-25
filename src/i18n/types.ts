export const I18N_NAMESPACE = "pi-context-engine";

export const I18N_LOCALES = ["de", "en", "es", "fr", "pt", "pt-BR", "ru", "uk", "zh-CN"] as const;
export type Locale = typeof I18N_LOCALES[number];
export type MessageValue = string | readonly string[];
export type Messages = Readonly<Record<string, MessageValue>>;
export type LocaleMessages = Readonly<Record<Locale, Messages>>;

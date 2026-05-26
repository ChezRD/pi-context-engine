// Mock for @juicesharp/rpiv-i18n, shaped from rpiv-mono/packages/rpiv-i18n/i18n.ts.
export const registeredStrings = [];

export function registerStrings(namespace, byLocale) {
	registeredStrings.push({ namespace, byLocale });
}

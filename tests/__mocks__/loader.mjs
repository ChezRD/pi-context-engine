// Module resolve hook: redirect external deps to mocks
const tuiMockUrl = new URL("./pi-tui.mjs", import.meta.url).href;
const agentMockUrl = new URL("./pi-coding-agent.mjs", import.meta.url).href;
const aiMockUrl = new URL("./pi-ai.mjs", import.meta.url).href;
const rpivI18nMockUrl = new URL("./rpiv-i18n.mjs", import.meta.url).href;
export async function resolve(specifier, context, nextResolve) {
	if (specifier === "@earendil-works/pi-tui") {
		return { url: tuiMockUrl, shortCircuit: true };
	}
	if (specifier === "@earendil-works/pi-coding-agent") {
		return { url: agentMockUrl, shortCircuit: true };
	}
	if (specifier === "@earendil-works/pi-ai") {
		return { url: aiMockUrl, shortCircuit: true };
	}
	if (specifier === "@juicesharp/rpiv-i18n") {
		return { url: rpivI18nMockUrl, shortCircuit: true };
	}
	return nextResolve(specifier, context);
}

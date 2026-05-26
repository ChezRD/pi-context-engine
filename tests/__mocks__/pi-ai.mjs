// Mock for @earendil-works/pi-ai, shaped from pi/packages/ai public exports.
// Tests may set globalThis.__piAiComplete to customize completion behavior.

export function getModel(provider, id) {
	return { provider, id };
}

export async function complete(model, payload, options) {
	const hook = globalThis.__piAiComplete;
	if (typeof hook === "function") return hook(model, payload, options);
	return {
		content: "{\"summaries\":[{\"batchIndex\":0,\"coverage\":\"partial\",\"summary\":\"Pi AI mock summary.\"}]}",
		usage: { input: 10, output: 5, cacheRead: 0 },
	};
}

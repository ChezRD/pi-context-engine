// Mock @earendil-works/pi-coding-agent for tests
// Provides ExtensionRunner with a functional mock pi object

class ExtensionRunner {
  constructor(pi, config, ctx, sessionManager, state) {
    const listeners = {};
    const registeredTools = [];
    const registeredCommands = [];
    const sentMessages = [];
    let _model = { id: "gpt-4o", provider: "openai" };
    let _getContextUsage = () => ({ ratio: 0, tokens: 0, ctxMax: 64000, maxTokens: 64000 });

    this.runtime = {
      model: _model,
      on(event, handler) {
        if (!listeners[event]) listeners[event] = [];
        listeners[event].push(handler);
      },
      sendMessage(msg) { sentMessages.push(msg); },
      getActiveTools() { return registeredTools; },
      registerTool(tool) { registeredTools.push(tool); },
      registerCommand(name, opts) { registeredCommands.push({ name, ...opts }); },
      compact(opts) { return { ok: true, folded: false }; },
      appendEntry(entry) { return true; },
      setStatus(key, value) { this._status = { key, value }; },
      getContextUsage(fn) { return fn ? fn(_getContextUsage()) : _getContextUsage(); },
      status: {},
      listeners,
      registeredTools,
      registeredCommands,
      sentMessages,
      _model,
      _getContextUsage,
    };

    this.extensions = [];
    this.cwd = process.cwd();
    this.sessionManager = sessionManager || null;
    this.modelRegistry = null;
  }
}

function createAgentSession() {
  return { id: "mock-session", entries: [] };
}

function createExtensionRuntime() {
  const runner = new ExtensionRunner(null, null, null, null, null);
  return runner.runtime;
}

// re-export from settings theme module (same package)
function getSettingsListTheme() {
  return {
    label: (text) => text,
    value: (text) => text,
    description: (text) => text,
    cursor: "→ ",
    hint: (text) => text,
  };
}

function mockTool(name) {
  return {
    name,
    label: name.charAt(0).toUpperCase() + name.slice(1),
    description: `Run ${name} commands`,
    promptSnippet: name,
    promptGuidelines: "",
    parameters: [],
    prepareArguments: (a) => a,
    executionMode: "normal",
    execute: async () => ({ content: [{ type: "text", text: `${name} output` }] }),
    renderCall: () => ({ type: "text", text: `$ ${name}` }),
    renderResult: () => ({ type: "text", text: `${name}: ok` }),
  };
}

export const createBashTool = (cwd) => mockTool("bash");
export const createFindTool = (cwd) => mockTool("find");
export const createGrepTool = (cwd) => mockTool("grep");
export const createReadTool = (cwd) => mockTool("read");
export const createLsTool = (cwd) => mockTool("ls");

export { ExtensionRunner, createAgentSession, createExtensionRuntime, getSettingsListTheme };
export default { ExtensionRunner, createAgentSession, createExtensionRuntime, getSettingsListTheme };

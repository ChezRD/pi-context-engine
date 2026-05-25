# Third-party notices

`pi-context-engine` is implemented as original source code plus adapted/ported patterns from the following MIT-licensed projects.

No third-party source tree is vendored in this repository.

## Reasonix CLI/TUI

- Project: DeepSeek-Reasonix / reasonix
- Repository: https://github.com/esengine/DeepSeek-Reasonix
- npm: https://www.npmjs.com/package/reasonix
- License: MIT
- Used for: design research around cache-first agent loops, cache-hit accounting, thinking/reasoning-mode handling, and context folding behavior.

## pi-context-prune

- Project: pi-context-prune
- Repository: https://github.com/championswimmer/pi-context-prune
- npm: https://www.npmjs.com/package/pi-context-prune
- License: MIT
- Used for: tool-result batch capture, pruning/summarization workflow, `context_prune`-style agentic pruning, recovery-oriented context hygiene, pruning mode recommendations, command/tool detection behavior, and long-session context hygiene design.

## pi-context

- Project: Pi Context: Agentic Context Management for Pi
- Repository: https://github.com/ttttmr/pi-context
- npm/package name: pi-context
- License: MIT
- Used for: conversation checkpoint/rewind model, timeline concepts, `/context` visualization approach, Pi session-tree interaction patterns, and checkpoint-oriented context management naming.

## Pi coding agent

- Project: Pi
- Repository: https://github.com/earendil-works/pi
- Documentation: https://pi.dev/docs/latest/extensions
- npm: https://www.npmjs.com/package/@earendil-works/pi-coding-agent
- License: MIT
- Used for: extension API types, event hooks, command/tool/provider registration APIs, package dependency model, and `@earendil-works/pi-tui` UI components.

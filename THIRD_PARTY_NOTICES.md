# Third-party notices

`pi-deepseek-cache` is implemented as original source code, with behavior and compatibility decisions informed by the following MIT-licensed projects.

No third-party source tree is vendored in this repository.

## Reasonix CLI/TUI

- Project: DeepSeek-Reasonix / reasonix
- Repository: https://github.com/esengine/DeepSeek-Reasonix
- npm: https://www.npmjs.com/package/reasonix
- License: MIT
- Used for: design research around DeepSeek cache-first agent loops, cache-hit accounting, thinking-mode handling, and context folding behavior.

## pi-context-prune

- Project: pi-context-prune
- Repository: https://github.com/championswimmer/pi-context-prune
- npm: https://www.npmjs.com/package/pi-context-prune
- License: MIT
- Used for: runtime companion integration strategy, pruning mode recommendations, command/tool detection behavior, and long-session context hygiene design.

## Pi coding agent

- Project: Pi
- Documentation: https://pi.dev/docs/latest/extensions
- npm: https://www.npmjs.com/package/@earendil-works/pi-coding-agent
- License: MIT
- Used for: extension API types, event hooks, command/tool/provider registration APIs, and package dependency model.

# pi-context-engine

Unified context management for the [Pi coding agent](https://github.com/earendil-works/pi): prompt-cache visibility, semantic folding, result pruning, checkpoints, and session visualization.

> **Provider compatibility:** Currently tested and reliable with the DeepSeek provider family. A universal provider-agnostic mechanism is under active development.

## What problem it solves

Long Pi sessions fill the context window with tool output noise. Without management, you hit context limits, lose cache reuse, and watch the model forget earlier work.

This extension gives you:

- **Visibility** — real-time cache hit rate, context pressure, and turn estimates in the Pi status bar
- **Control** — semantic folding, checkpoint/rewind, and manual compaction
- **Automation** — configurable auto-pruning of verbose tool results, huge-output capping

## Installation

```bash
pi install npm:pi-context-engine
```

Try without installing:

```bash
pi -e npm:pi-context-engine
```

## Quick start

After install, the extension runs automatically. Check status:

```text
/context-engine status
```

Output:

```
Context Cache: claude-sonnet-4-20250514
  Cache: 99% session / 99% last · cached 342 · uncached 4
  Context: 55% · green · ~8 turns
  Engine: prefix changes 0 · history rewrites 0 · hold
  Prefix hash: a1b2c3d4e5f6 · tool hash: 9a8b7c6d5e4f
  cache possible: prefix/tool invariants stable; observed warm hit 99%
```

Open the full dashboard:

```text
/context
```

Change settings interactively:

```text
/context-engine config
```

## Key features

| Feature | What it does |
|---|---|
| **Cache monitoring** | Tracks `cacheRead`/`cacheWrite`/`input`/`output` from provider usage; shows hit rate and savings in status bar |
| **Semantic folding** | When context runs high, summarizes old conversation into a compact summary; preserves pinned rules and skill markers |
| **Tool-result pruning** | Captures verbose tool batches, summarizes them, removes raw output from future context |
| **Checkpoints & rewind** | `context_checkpoint` saves a named point; `context_rewind` branches back with a carryover summary |
| **Timeline** | `context_timeline` shows conversation history as a tree with checkpoint markers |
| **Huge-output capper** | Replaces oversized tool results with bounded previews before they grow future context |
| **Cost dashboard** | Per-model token count, cache savings, and cost breakdown in `/context` |
| **Skill pinning** | `context_pin_skill` wraps skill bodies so they survive semantic folds |
| **Priority pins** | `context_pin` marks facts, decisions, or rules that must survive pruning |
| **Prefix stability** | Warns when model switch, tool schema change, or system prompt drift breaks cache reuse |

## Essential configuration

Config lives at `~/.pi/agent/context-engine.json`. Defaults work for most users. Key knobs:

| Key | Default | What to change |
|---|---|---|
| `pruneOn` | `agent-message` | `on-demand` for manual control, `agentic-auto` for autonomous loops |
| `pruneModel` | `deepseek-v4-flash` | Model used for summarization (set to `auto` for current chat model) |
| `pruneBatchSize` | `50` | Valid range 20–100 (steps of 5). Lower values prune earlier; higher values batch more |
| `autoFold` | `true` | Disable if you prefer manual `/context-engine fold` |
| `contextWarnPct` | `0.6` | Trigger earlier warnings at lower context fill |

[Full configuration reference →](docs/configuration.md)

## Commands

| Command | Action |
|---|---|
| `/context-engine status` | Show cache stats, context usage, and eligibility |
| `/context-engine diagnose` | Status + last provider payload diagnostics |
| `/context-engine fold` | Trigger semantic fold |
| `/context-engine compact` | Trigger host default compaction |
| `/context-engine hold` | Suppress auto-folding for cooldown period |
| `/context-engine config` | Open interactive settings menu |
| `/context-engine enable-capper` | Enable huge-result preview mode |
| `/context-engine disable-capper` | Disable huge-result preview mode |
| `/context-engine init` | Write default config to disk |
| `/context-engine reset-stats` | Reset in-memory cache counters |
| `/context` | Full TUI dashboard with cost and segment breakdown |

## Agentic tools

These tools are registered for use by the model during sessions:

| Tool | Purpose |
|---|---|
| `context_checkpoint` | Create a named conversation checkpoint |
| `context_rewind` | Branch back to a checkpoint with a summary |
| `context_timeline` | Show conversation history tree |
| `context_prune` | Summarize pending tool results |
| `context_pin_skill` | Load and pin a skill so it survives folds |
| `context_pin` | Pin a fact, decision, or rule across context resets |
| `context_parallel_read` | Read multiple files in parallel (optional) |
| `context_cache_fold` | Trigger semantic fold from model |

## Architecture

```
src/
├── index.ts                  Extension entrypoint and event wiring
├── cache-engine/             Decision engine, prefix/tool stability, fold logic
├── projection/               Tool-result pruning and context rebuild
├── context-pins/             Skill pinning and priority injection
├── agentic/                  Checkpoint/rewind/timeline tools
├── ui/                       Dashboard, settings menu, timeline renderer
├── i18n/                     Locale strings (en, de, es, fr, pt, pt-BR, ru, uk, zh-CN)
├── config.ts                 Config load/save/parse
├── model.ts                  Provider/model compatibility checks
├── stats.ts                  Cache hit/savings aggregation
├── capper.ts                 Huge-output preview capper
├── commands.ts               Slash command dispatch
├── status.ts                 Status-line formatting
└── types.ts                  Shared types
```

[Detailed architecture →](docs/architecture.md)

## Development

```bash
npm install
npm run typecheck:project
npm test
```

Run the extension locally in Pi:

```bash
pi --no-extensions --no-skills -e .
```

## Related projects

- [Pi coding agent](https://github.com/earendil-works/pi) — the host agent
- [pi-context-prune](https://github.com/championswimmer/pi-context-prune) — original context pruning companion
- [pi-context](https://github.com/ttttmr/pi-context) — original checkpoint/rewind implementation

## License

MIT. See [LICENSE](LICENSE).

Third-party attributions in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

## Documentation index

- [Configuration reference](docs/configuration.md)
- [Architecture and internals](docs/architecture.md)
- [Troubleshooting](docs/troubleshooting.md)

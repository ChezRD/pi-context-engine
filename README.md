# pi-deepseek-cache

A [Pi coding-agent](https://github.com/badlogic/pi-mono) extension for DeepSeek prompt-cache visibility and long-session context hygiene.

It tracks real DeepSeek cache usage from Pi model usage data, checks DeepSeek request compatibility, watches context pressure, and recommends a `pi-context-prune` setup that keeps long coding sessions cheaper and more stable.

The design is informed by cache-first behavior in the [Reasonix CLI/TUI](https://github.com/esengine/DeepSeek-Reasonix) and implemented with Pi extension APIs.

## What it does

- Detects whether the active model is DeepSeek-compatible
- Measures prompt-cache hit ratio from Pi usage fields:
  - `usage.cacheRead`
  - `usage.input`
  - `usage.cacheWrite`
  - `usage.output`
- Shows cache/context status in Pi UI
- Captures read-only provider-payload diagnostics
- Reports context usage thresholds and next actions
- Detects `pi-context-prune` and prints recommended long-session config
- Optionally caps extreme single tool outputs before they grow future context
- Optionally registers a separate dynamic DeepSeek provider from `/models`

Core cache goal:

```text
stable prompt/tool prefix + bounded work history + controlled batch pruning
```

## Install

```bash
pi install npm:pi-deepseek-cache
```

Project-local install:

```bash
pi install -l npm:pi-deepseek-cache
```

Try without installing:

```bash
pi -e npm:pi-deepseek-cache
```

From source:

```bash
git clone <repo-url> pi-deepseek-cache
cd pi-deepseek-cache
pi -e .
```

## Companion package

Install `pi-context-prune` for long sessions:

```bash
pi install npm:pi-context-prune
```

`pi-context-prune` is detected at runtime through Pi commands/tools. Install it with `pi install`; `pi-deepseek-cache` does not import it as an npm library.

## Quick start

Select Pi's built-in DeepSeek model:

```text
/model deepseek/deepseek-v4-flash
```

Enable cache-friendly pruning for long coding sessions:

```text
/pruner on
/pruner prune-on agent-message
/pruner batching agent-message
/pruner model deepseek/deepseek-v4-flash
/pruner thinking off
```

Check status:

```text
/deepseek-cache status
```

Example status line:

```text
DS cache 92% · uncached 14k · read 161k · ctx 54%
```

## Commands

The extension registers one command root: `/deepseek-cache`.

| Command | Effect |
|---|---|
| `/deepseek-cache status` | Show model compatibility, cache stats, context usage, capper/provider state, and pruner detection |
| `/deepseek-cache diagnose` | Show status plus last provider-payload diagnostics and pruner recommendations |
| `/deepseek-cache recommend-pruner` | Print copy-paste `pi-context-prune` setup for long DeepSeek sessions |
| `/deepseek-cache reset-stats` | Reset in-memory cache telemetry counters |
| `/deepseek-cache enable-capper` | Enable optional huge-result capper and register lookup tool |
| `/deepseek-cache disable-capper` | Disable capper in config; lookup tool remains until session reload |
| `/deepseek-cache init` | Write default config to disk |

## Runtime behavior

Default mode is observational and advisory:

- registers `/deepseek-cache` commands
- adds a DeepSeek cache status entry
- observes provider payloads without changing them
- observes usage/context events
- recommends `pi-context-prune` settings

Default mode does not change:

- selected provider
- active tools
- system prompt
- context messages
- DeepSeek thinking configuration

Optional features are explicit config/command choices:

- huge-result capper
- dynamic provider registration
- automatic high-watermark compaction

## Long-session pruning

Use `pi-context-prune` as the primary fold layer for long coding sessions.

Recommended default:

```text
/pruner on
/pruner prune-on agent-message
/pruner batching agent-message
/pruner model deepseek/deepseek-v4-flash
/pruner thinking off
```

Why `agent-message`:

- batches a stretch of tool work
- summarizes once when the agent sends a final text response
- prunes raw `toolResult` messages from future context
- keeps `context_tree_query` recovery available
- causes one intentional cache miss per meaningful pruned batch, then returns to a shorter stable context

Mode guidance:

| Session type | Recommended mode | Why |
|---|---|---|
| Short interactive session | `on-demand` or off | Avoid unnecessary context rewrites |
| Normal long coding | `agent-message` + `batching agent-message` | Best cache/cost tradeoff |
| Tool-heavy research | `agent-message`, plus manual `/pruner now` at checkpoints | Avoid repeated cache churn |
| Autonomous multi-hour loop | `agentic-auto`, enabled before work starts | Lets model prune before overflow, with extra tool/prompt surface |
| Debugging pruning behavior | `on-demand` | User controls exact prune points |

Avoid `every-turn` for normal work. It keeps raw context smallest, but rewrites future prompt context too often and can reduce provider cache reuse.

### `agentic-auto` implications

`agentic-auto` gives the model a pruning tool and prompt guidance so it can decide when to prune during autonomous work.

According to `pi-context-prune` source:

- it registers `context_tree_query` for recovery
- it registers `context_prune`, but only activates it in active tools when `pruneOn === "agentic-auto"`
- it adds system-prompt guidance in `before_agent_start`
- it still summarizes batches and prunes raw `toolResult` messages from future context

Implications:

1. **Tool list changes.** `context_prune` becomes model-visible. For DeepSeek, tool specs are cache-relevant prefix bytes, so enabling this mid-session can cause a cache-miss turn.
2. **System prompt changes.** Added pruning instructions also change prefix bytes. Enable before long work starts.
3. **More autonomy.** Useful for multi-hour runs where final text-only assistant messages are rare.
4. **Possible over-pruning.** Frequent `context_prune` calls rewrite context often and can reduce cache hit rate.
5. **More tool surface.** One extra tool can affect tool selection and prompt size.
6. **Recovery remains available.** Pruned outputs can be retrieved through `context_tree_query`.

Recommendation:

- Use `agent-message` for normal long coding.
- Use `agentic-auto` for autonomous long-running goals only when enabled before the main work starts.
- Watch `/deepseek-cache status`; repeated cache drops after pruning mean `agentic-auto` may be too aggressive for that session.

## Optional huge-result capper

The capper handles rare single tool outputs that are too large before `turn_end` pruning can run.

Enable:

```text
/deepseek-cache enable-capper
```

When enabled, huge text tool results are replaced with a stable preview and a ref like `dsc-1`. The full output is recoverable through:

```text
deepseek_cache_lookup
```

Warning: enabling the capper registers a new model-visible tool. Enable it before long work starts to avoid a mid-session tool-list cache miss.

## Optional dynamic provider

Off by default.

Pi already ships DeepSeek V4 models. Enable dynamic provider registration only when your Pi release lacks a needed DeepSeek model or when using a custom endpoint.

Dynamic provider behavior:

- fetches `GET /models` from DeepSeek
- registers provider `deepseek-cache` by default
- uses Pi DeepSeek compatibility metadata:
  - `thinkingFormat: "deepseek"`
  - `reasoning_content` replay
  - `high -> high`
  - `xhigh -> max`
- overrides built-in `deepseek` only when explicitly configured

## Configuration

Config path:

```text
~/.pi/agent/deepseek-cache.json
```

Default config:

```json
{
  "enabled": true,
  "diagnostics": true,
  "mutateSystemPrompt": false,
  "mutateProviderPayload": false,
  "registerDynamicProvider": false,
  "dynamicProviderName": "deepseek-cache",
  "deepseekBaseUrl": "https://api.deepseek.com",
  "deepseekApiKeyEnv": "DEEPSEEK_API_KEY",
  "allowOverrideBuiltInDeepSeek": false,
  "hugeResultCapper": false,
  "hugeResultChars": 65536,
  "hugeResultHeadChars": 6000,
  "hugeResultTailChars": 6000,
  "autoCompactAtHighWatermark": false,
  "contextWarnPct": 0.6,
  "contextDangerPct": 0.72,
  "contextCompactPct": 0.82,
  "statusLine": true,
  "persistDiagnostics": false
}
```

| Key | Default | Effect |
|---|---:|---|
| `enabled` | `true` | Master switch |
| `diagnostics` | `true` | Capture read-only payload diagnostics |
| `mutateSystemPrompt` | `false` | Reserved; no prompt mutation by default |
| `mutateProviderPayload` | `false` | Reserved; no payload patching by default |
| `registerDynamicProvider` | `false` | Register optional `deepseek-cache` provider |
| `hugeResultCapper` | `false` | Enable huge-output elision + lookup tool |
| `autoCompactAtHighWatermark` | `false` | Call `ctx.compact()` at high context usage |
| `contextWarnPct` | `0.6` | Status warning threshold |
| `contextDangerPct` | `0.72` | Strong warning threshold |
| `contextCompactPct` | `0.82` | Compact recommendation threshold |
| `statusLine` | `true` | Show cache status entry |
| `persistDiagnostics` | `false` | Persist payload diagnostics as session custom entries |

## Architecture

```text
src/index.ts                 — extension entrypoint, hooks, commands
src/config.ts                — config load/save/parse
src/deepseek-detector.ts     — DeepSeek provider/model compatibility checks
src/telemetry.ts             — cacheRead/input/output aggregation
src/payload-diagnostics.ts   — read-only provider payload inspection
src/context-monitor.ts       — context usage thresholds and recommendations
src/pruner-advisor.ts        — pi-context-prune detection and setup advice
src/capper.ts                — optional huge-result capper + lookup tool
src/dynamic-provider.ts      — optional DeepSeek /models provider registration
```

Runtime hooks:

| Hook | Use |
|---|---|
| `before_provider_request` | Read-only payload diagnostics |
| `message_end` / `agent_end` | Cache usage aggregation |
| `turn_end` | Context usage/status refresh |
| `session_compact` | Mark compaction boundary in stats |
| `tool_result` | Optional huge-output capper |
| `model_select` / `session_start` | Refresh model detection/status |

## Troubleshooting cache misses

If cache hit ratio drops:

1. Check whether model switched.
2. Check whether active tools changed.
3. Check whether another extension changed system prompt.
4. If `pi-context-prune` just ran, one cache miss is expected.
5. If context is large, run `/pruner now` or `/compact`.
6. If using `agentic-auto`, check whether it is pruning too often.
7. Run `/deepseek-cache diagnose`.

## Development

```bash
npm install
npm run typecheck
npm test
```

Run current checkout in Pi:

```bash
pi --no-extensions --no-skills -e /path/to/pi-deepseek-cache
```

## Notes

Source references used during development:

- [Reasonix CLI/TUI](https://github.com/esengine/DeepSeek-Reasonix) — cache-first DeepSeek agent loop
- [`pi-context-prune`](https://github.com/championswimmer/pi-context-prune) — Pi context pruning companion package
- [Pi packages documentation](https://pi.dev/docs/latest/packages) — package dependency and install model
- [Pi extensions documentation](https://pi.dev/docs/latest/extensions) — extension hooks and APIs

## License

MIT. See [`LICENSE`](LICENSE).

Third-party project attributions are listed in [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md).

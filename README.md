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

## Cache prefix invariant

DeepSeek prompt cache reuses tokens only when the beginning of the provider prompt stays byte-stable. This extension fingerprints only cache-relevant prefix inputs:

- model id
- system messages / stable injected cache guidance
- normalized and sorted tool schemas
- reasoning / thinking params
- temperature

It intentionally does **not** fingerprint appended user/assistant/tool tail messages, request ids, timestamps, debug fields, or tool order noise. Normal chat append should not count as prefix drift. Real drift means one of the stable prefix components changed: model, system prompt, tool schema, reasoning, or temperature.

99% cache hit is possible only when:

```text
cacheRead / (input + cacheRead + cacheWrite) >= 0.99
```

After warmup, `/deepseek-cache status` reports `99% possible` only when prefix changes are zero, tool changes are zero, pruner profile is not bad, compact storm guard is quiet, and warm hit is at least 95% in local telemetry.

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
```

Check status:

```text
/deepseek-cache status
```

Example status output:

```text
DeepSeek Cache: native deepseek-v4-flash
  Cache: 96% session / 97% last · cached 97 · uncached 3
  Context: 55% · green · ~8 turns
  Engine: prefix changes 0 · history rewrites 0 · hold
  Prefix hash: a1b2c3d4e5f6 · tool hash: 9a8b7c6d5e4f · tool changes 0 · last reason: not reported
  99% possible: prefix stable, tools stable, pruner acceptable, warm hit 96%
```

Example blocker output:

```text
99% blocked: tools changed 1×; pruner profile bad — every-turn rewrites prompt-cache prefix too often; warm hit below 95% (83%)
```

## Commands

The extension registers one command root: `/deepseek-cache`.

| Command | Effect |
|---|---|
| `/deepseek-cache status` | Show model compatibility, cache stats, context usage, capper/provider state, and 99% eligibility |
| `/deepseek-cache diagnose` | Show status plus last provider-payload diagnostics |
| `/deepseek-cache fold` | Trigger cache-aware fold via host compaction |
| `/deepseek-cache compact` | Trigger host default compaction |
| `/deepseek-cache hold` | Hold compaction advice for configured turn cooldown |
| `/deepseek-cache config` | Show config and thresholds |
| `/deepseek-cache reset-stats` | Reset in-memory cache telemetry counters |
| `/deepseek-cache enable-capper` | Enable optional huge-result capper and register lookup tool |
| `/deepseek-cache disable-capper` | Disable capper in config; lookup tool remains until session reload |
| `/deepseek-cache init` | Write default config to disk |

## Runtime behavior

The extension always runs in balanced cache-monitor mode:

- registers `/deepseek-cache` commands
- adds DeepSeek cache status entry
- reads Pi's existing cache-aware `message.usage.cost` on `message_end` without overriding it
- fingerprints real provider payload prefix in `before_provider_request`
- monitors prefix/tool stability, hit rate, context ratio, turns-to-overflow, and savings
- shows fold/compact/hold options when context reaches orange/red zones
- keeps pruner evaluation internal to 99% eligibility checks

Default behavior does not change:

- selected provider
- active tools, unless `foldTool` or `parallelReadTool` is explicitly enabled
- system prompt, unless `cachePromptInjection` is enabled
- context messages
- DeepSeek thinking configuration

Cache prompt guidance is injected when `cachePromptInjection` is enabled. The extension never programmatically invokes `/pruner`; Pi exposes no `executeCommand()` API for slash commands.

Compaction guardrails:

- default cooldown: `minTurnsBetweenCompacts = 3`
- default session cap: `maxCompactsPerSession = 6`
- `hold` suppresses fold/compact advice until cooldown expires, except critical `force_fold`
- manual `/deepseek-cache fold` and `/deepseek-cache compact` require explicit user action

## Long-session pruning

Use [`pi-context-prune`](https://github.com/championswimmer/pi-context-prune) as the primary fold layer for long coding sessions.

**How pruning affects cache:** When pruner runs, raw `toolResult` messages (file contents from `read`, output from `bash`) are removed from future context and replaced with structured summaries + `context_tree_query` refs. The model can still query exact content through `context_tree_query`, but verbatim text is no longer in the prompt — this keeps context under control at the cost of inline file visibility.

This extension detects pruning events and tracks cache impact:

1. Tool results accumulate in the prompt across multiple assistant turns.
2. When the agent sends a final text response, `pi-context-prune` batches all tool outputs since the last user message.
3. The pruner summarizes these outputs into compact entries and writes a `context-prune-frontier` marker.
4. Next load of context drops the raw tool messages and loads only the summary + index.
5. The provider sees a different prompt prefix (summaries instead of raw content), which causes one cache miss.
6. After that miss, hit rate recovers if model/system/tool prefix stays stable.

Recommended default:

```text
/pruner on
/pruner prune-on agent-message
/pruner batching agent-message
```

Why `agent-message`:

- batches a stretch of tool work
- summarizes once when the agent sends a final text response
- prunes raw `toolResult` messages from future context
- keeps `context_tree_query` recovery available
- causes one intentional cache miss per meaningful pruned batch, then returns to a shorter stable context

Pruner profile guidance:

| Session type | Recommended pruner profile | Why |
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

## Manual DeepSeek 99% run checklist

Repo tests prove stable-prefix behavior and `>=95%` warm hit with mocks. Real `>=99%` must be checked against DeepSeek provider usage in an actual Pi session.

Before starting:

1. Select a DeepSeek model before warmup:
   ```text
   /model deepseek/deepseek-v4-flash
   ```
2. Enable desired pruner profile before main work:
   ```text
   /pruner on
   /pruner prune-on agent-message
   /pruner batching agent-message
   /pruner model deepseek/deepseek-v4-flash
   /pruner thinking off
   ```
3. Avoid changing model, enabled extensions, system-prompt-affecting settings, or model-visible tools mid-run.
4. Optional: run `/deepseek-cache reset-stats` immediately before warmup.

During validation:

1. Treat first provider request as warmup and exclude it.
2. Run at least 3 stable-prefix turns without switching model/tools/system prompt.
3. Check `/deepseek-cache diagnose`.
4. Confirm:
   - warmup excluded from assessment
   - `cacheRead / (input + cacheRead + cacheWrite) >= 0.99` on post-warmup provider usage
   - `prefix changes 0`
   - `tool changes 0`
   - `Cache profile: good` or `risky`, not `bad`
   - no compact storm guard warning

If `99% blocked` appears, fix blocker first. Common blockers: changed tools, system prompt drift, `every-turn` pruner, low warm hit, compact storm.

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
  "prefixStabilityCheck": true,
  "prefixFingerprint": true,
  "toolFingerprint": true,
  "appendOnlyProjection": false,
  "autoCompactAtHighWatermark": false,
  "autoFold": false,
  "foldTailPct": 0.2,
  "foldSummaryModel": "deepseek-v4-flash",
  "foldTool": false,
  "cachePromptInjection": true,
  "showCostSavings": true,
  "showCostBreakdown": true,
  "showSavings": true,
  "contextWarnPct": 0.6,
  "contextDangerPct": 0.72,
  "contextCompactPct": 0.82,
  "contextForceFoldPct": 0.95,
  "foldHitRateThreshold": 0.85,
  "adviseCompactHitRateThreshold": 0.8,
  "showTurnEstimate": true,
  "minTurnsBetweenCompacts": 3,
  "maxCompactsPerSession": 6,
  "statusLine": true,
  "persistDiagnostics": false
}
```

| Key | Default | Effect |
|---|---:|---|
| `enabled` | `true` | Master switch |
| `diagnostics` | `true` | Capture read-only payload diagnostics |
| `prefixStabilityCheck` | `true` | Secondary context-prefix drift check |
| `prefixFingerprint` | `true` | Fingerprint real provider payload prefix |
| `toolFingerprint` | `true` | Track tool schema hash drift |
| `appendOnlyProjection` | `false` | Experimental provider-facing `[system, stable summary, append-only tail]` projection after controlled compact |
| `autoFold` | `false` | Reserved; manual fold remains explicit by default |
| `foldTailPct` | `0.2` | Reserved for fold prompt strategy; host owns compaction boundary by default |
| `cachePromptInjection` | `true` | Add stable cache guidance via `before_agent_start` |
| `showCostSavings` | `true` | Show cache savings in status/advice |
| `showCostBreakdown` | `true` | Show cost breakdown where available |
| `showSavings` | `true` | Show savings estimate |
| `showTurnEstimate` | `true` | Show estimated turns to overflow |
| `minTurnsBetweenCompacts` | `3` | Fold/compact advice cooldown |
| `maxCompactsPerSession` | `6` | Compact storm guard |
| `contextWarnPct` | `0.6` | GREEN→YELLOW threshold |
| `contextDangerPct` | `0.72` | YELLOW→ORANGE threshold |
| `contextCompactPct` | `0.82` | ORANGE→RED threshold |
| `contextForceFoldPct` | `0.95` | CRITICAL force-fold threshold |
| `foldHitRateThreshold` | `0.85` | Auto fold in orange zone when hit rate drops below this |
| `adviseCompactHitRateThreshold` | `0.8` | Recommend compact when hit rate is already low |
| `mutateSystemPrompt` | `false` | Reserved compatibility flag; cache prompt injection is controlled separately |
| `mutateProviderPayload` | `false` | Reserved; no payload patching by default |
| `registerDynamicProvider` | `false` | Register optional `deepseek-cache` provider |
| `hugeResultCapper` | `false` | Enable huge-output elision + lookup tool |
| `autoCompactAtHighWatermark` | `false` | Legacy compatibility flag; explicit fold/compact remains preferred |
| `statusLine` | `true` | Show cache status entry |
| `persistDiagnostics` | `false` | Persist payload diagnostics as session custom entries |

## Localization

UI strings integrate with `@juicesharp/rpiv-i18n`, Pi's shared i18n dial for extensions. The package is optional: without it, this extension still uses its local runtime and falls back to English.
Install it once to get `/languages` and `--locale`:

```bash
pi install npm:@juicesharp/rpiv-i18n
```

Supported locale codes: `de`, `en`, `es`, `fr`, `pt`, `pt-BR`, `ru`, `uk`, `zh-CN`.
Selection priority: active `rpiv-i18n` locale, `--locale`, `~/.config/rpiv-i18n/locale.json`, `LANG`/`LC_*`, then English fallback. Chinese aliases `zh`, `zn`, `zh_CN.UTF-8`, and `zh-Hans` map to `zh-CN` locally, without mutating `rpiv-i18n` global state.

## Architecture

```text
src/index.ts                 — extension entrypoint and event wiring
src/config.ts                — config load/save/parse
src/model.ts                 — DeepSeek provider/model compatibility checks
src/stats.ts                 — Pi usage hit/savings aggregation; no cost override
src/payload-diagnostics.ts   — read-only provider payload inspection
src/dynamic-provider.ts      — optional DeepSeek /models provider registration
src/context-monitor.ts       — legacy context threshold helper
src/cache-engine/*           — decision engine, prefix/tool stability, fold tool, append-only projection, custom compaction
src/pruner-advisor.ts        — pi-context-prune detection and setup advice
src/capper.ts                — optional huge-result capper + lookup tool
src/commands.ts              — command metadata, completions, dispatcher, output
src/status.ts                — status-line and human-readable status formatting
src/runtime-state.ts         — shared runtime state
src/types.ts                 — shared types
```

Runtime hooks:

| Hook | Use |
|---|---|
| `before_agent_start` | Cache prompt injection when enabled |
| `context` | AppendOnly projection when enabled + prefix/history stability fingerprinting |
| `session_before_compact` | Observes hook; does not return placeholder summaries |
| `before_provider_request` | Real provider prefix/tool fingerprint + read-only payload diagnostics |
| `message_end` | Read Pi cache-aware `usage.cost`; update hit/savings stats |
| `tool_call` | Normalize known args and suppress duplicate-call storms |
| `agent_end` | Fallback usage aggregation when `message_end` was absent |
| `turn_end` | Decision engine: advice, pruner warning, auto fold/force fold |
| `session_compact` | Mark compaction boundary in stats |
| `tool_result` | Optional huge-output capper |
| `model_select` / `session_start` | Refresh model detection/status |

## Host limitations

Some Reasonix-like controls cannot be fully implemented from a Pi extension without host changes:

- enforce immutable system prompt at host level
- freeze tool schemas globally
- own canonical append-only history
- change the built-in tool scheduler globally
- silently execute a tool call that the provider never emitted in `tool_calls`

This extension handles what the API allows: prefix fingerprinting, warnings, conservative arg repair, duplicate storm blocking, optional wrapper/meta-tools, optional provider-facing AppendOnly projection, and host `ctx.compact()` timing. Canonical Pi session history remains host-owned.

## Troubleshooting cache misses

If cache hit ratio drops:

1. Run `/deepseek-cache diagnose`.
2. Prefix changed: check model, system prompt, reasoning/thinking params, temperature, and other extensions that mutate prompts.
3. Tools changed: enable capper/pruner/dynamic provider before long work starts; avoid mid-session tool registration changes.
4. Pruner every-turn: switch to the cache-safe profile:
   ```text
   /pruner prune-on agent-message
   /pruner batching agent-message
   ```
5. Compact storm: wait for cooldown, reduce manual compacts, or raise `minTurnsBetweenCompacts` / lower auto use.
6. Low `cacheRead`: confirm hit rate formula uses `cacheRead / (input + cacheRead + cacheWrite)`, exclude warmup, and verify DeepSeek-compatible model metadata.
7. Recent prune/compact: one miss after an intentional context rewrite is expected; hit rate should recover after 2-3 stable turns.
8. Huge tool result: enable `/deepseek-cache enable-capper` before work starts or use `pi-context-prune` recovery through `context_tree_query`.

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

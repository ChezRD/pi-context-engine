# pi-context-engine

A [Pi coding-agent](https://github.com/earendil-works/pi) extension for prompt-cache visibility, long-session context hygiene, semantic folding, pruning, checkpoints, and `/context` visualization.

It tracks cache usage from Pi model usage data, watches context pressure, caps huge tool results, summarizes old tool outputs, tracks cache checkpoints/segments, and exposes agentic `context_checkpoint` / `context_rewind` tools. Provider-specific compatibility and pricing are integrations, not the project boundary.

The implementation combines original code with ideas and ported patterns from several MIT-licensed Pi context-management projects. See [Third-party notices](#third-party-notices) and [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md) for attribution.

## What it does

- Shows active model/provider status and provider compatibility details when applicable
- Measures prompt-cache hit ratio and per-model cost from Pi usage fields:
  - `usage.cacheRead`
  - `usage.input`
  - `usage.cacheWrite`
  - `usage.output`
- Shows cache/context status in Pi UI and in `/context`
- Captures read-only provider-payload diagnostics
- Reports context usage thresholds and next actions
- Runs built-in batch pruning for verbose tool results
- Provides `context_checkpoint`, `context_rewind`, and `context_timeline`
- Optionally caps extreme single tool outputs before they grow future context
- Optionally registers a separate compatible dynamic provider from `/models`

Core cache goal:

```text
stable prompt/tool prefix + bounded work history + controlled batch pruning + semantic folding
```

## Semantic fold mechanism

When context grows too large, `pi-context-engine` runs a semantic fold. It asks an LLM to summarize the oldest conversation span, inserts that summary as a synthetic assistant message, and removes the verbose source messages from future model context.

Semantic fold behavior:

- Preserves explicit pin markers when present. The fold engine keeps matching Reasonix-style `<skill-pin>` blocks, future context-engine pin blocks, and high-priority/memory markers found in the conversation. These markers are context-engine/Reasonix compatibility heuristics, not a Pi platform contract.
- Keeps provider cache prefixes stable where possible. The fold path avoids changing stable prefix inputs, so provider prompt caches can recover after the fold warmup request.
- Warns before overflow. When context gets within a few turns of the critical threshold, the status bar shows a warning, for example `~3 turns (auto-fold ⚠)`.
- Uses configurable summarization models. If `pruneModel` or `foldSummaryModel` is `"auto"` or `"default"`, the engine uses the currently selected chat model for summarization.

## Cache prefix invariant

Provider prompt caches reuse tokens only when the beginning of the provider prompt stays byte-stable. This extension fingerprints only cache-relevant prefix inputs:

- model id
- system messages / stable injected cache guidance
- normalized and sorted tool schemas
- reasoning / thinking params
- temperature

It intentionally does **not** fingerprint appended user/assistant/tool tail messages, request ids, timestamps, debug fields, or tool order noise. Normal chat append should not count as prefix drift. Real drift means one of the stable prefix components changed: model, system prompt, tool schema, reasoning, or temperature.

The warm-cache target metric is:

```text
cacheRead / (input + cacheRead + cacheWrite) >= 0.99
```

`/context-engine status` reports when cache-first invariants are intact: prefix changes are zero, tool changes are zero, pruner profile is not bad, and compact storm guard is quiet. Warm hit is shown as observed telemetry, not as a hard eligibility threshold.

## Install

```bash
pi install npm:pi-context-engine
```

Project-local install:

```bash
pi install -l npm:pi-context-engine
```

Try without installing:

```bash
pi -e npm:pi-context-engine
```

From source:

```bash
git clone <repo-url> pi-context-engine
cd pi-context-engine
pi -e .
```

## Companion packages

No companion package is required for the current implementation. The pruning, checkpoint, rewind, timeline, `/context` dashboard, huge-result capper, and fold tool are registered by `pi-context-engine` itself.

The code still detects external `pi-context-prune`-style tools when present for diagnostics and compatibility reporting, but it does not require or import `pi-context-prune`.

## Quick start

Pruning is enabled by default with the cache-friendlier `agent-message` mode:

```text
/context-engine config
```

Check status:

```text
/context-engine status
```

Example status output:

```text
Context Cache: compatible provider/model-id
  Cache: 99% session / 99% last · cached 99 · uncached 1
  Context: 55% · green · ~8 turns
  Engine: prefix changes 0 · history rewrites 0 · hold
  Prefix hash: a1b2c3d4e5f6 · tool hash: 9a8b7c6d5e4f · tool changes 0 · last reason: not reported
  cache possible: prefix/tool invariants stable; observed warm hit 99%
```

Example blocker output:

```text
cache blocked: tools changed 1×; pruner profile bad — every-turn rewrites prompt-cache prefix too often
```

## Commands

The extension registers one command root: `/context-engine`.

| Command | Effect |
|---|---|
| `/context-engine status` | Show model compatibility, cache stats, context usage, capper/provider state, and cache eligibility |
| `/context-engine diagnose` | Show status plus last provider-payload diagnostics |
| `/context-engine fold` | Trigger cache-aware fold via host compaction |
| `/context-engine compact` | Trigger host default compaction |
| `/context-engine hold` | Hold compaction advice for configured turn cooldown |
| `/context-engine config` | Show config and thresholds |
| `/context-engine reset-stats` | Reset in-memory cache telemetry counters |
| `/context-engine enable-capper` | Enable optional huge-result capper and register lookup tool |
| `/context-engine disable-capper` | Disable capper in config; lookup tool remains until session reload |
| `/context-engine init` | Write default config to disk |

It also registers:

| Command/tool | Effect |
|---|---|
| `/context` | TUI overlay with context usage, cache hit/miss, per-model cost, checkpoint/segment stats |
| `context_checkpoint` | Create a named conversation checkpoint and linked cache checkpoint |
| `context_rewind` | Branch back to a checkpoint with a carryover summary |
| `context_timeline` | Show conversation history with checkpoint/cache markers |
| `context_prune` | Summarize pending tool results; model-visible only when `pruneOn === "agentic-auto"` |
| `context_result_lookup` | Retrieve full text stored by the huge-result capper; supports `ref`, `offset`, and `limit` |
| `context_pin_skill` | Load a skill body as a pinned block that survives semantic folds. Uses Pi-native skill discovery (`~/.pi/agent/skills/`, `<cwd>/.pi/skills/`) |
| `context_pin` | Pin a priority fact, user decision, project invariant, or working rule that must survive context pruning/folding |
| `deepseek_cache_fold` | Trigger semantic fold; registered when `autoFold` is enabled. The name is legacy; the tool is not DeepSeek-only |
| `deepseek_cache_parallel_read` | Optional parallel file read helper; registered only when `parallelReadTool` is enabled. The name is legacy; the tool is not DeepSeek-only |
| `context_pin_skill` / `context_pin` | Skill/priority pinning tools; registered when `skillPinning` is enabled |

## Runtime behavior

The extension always runs in balanced cache-monitor mode:

- registers `/context-engine` commands
- registers `/context`, agentic context tools, fold/prune tools, and optional lookup/read helpers
- adds context cache status entry
- reads Pi's existing cache-aware `message.usage.cost` on `message_end` without overriding it
- fingerprints real provider payload prefix in `before_provider_request`
- monitors prefix/tool stability, hit rate, context ratio, turns-to-overflow, and savings
- auto-folds through host compaction when context pressure + weak hit rate cross fold thresholds; otherwise shows fold/compact/hold options
- captures tool batches and auto-prunes according to `pruneOn`

Default behavior does not change:

- selected provider
- active tools, except legacy-named `deepseek_cache_fold` when `autoFold` is enabled, `context_prune` when `pruneOn === "agentic-auto"`, `context_result_lookup` when capper is enabled, and optional legacy-named `deepseek_cache_parallel_read`
- system prompt, unless `cachePromptInjection` is enabled
- context messages
- provider thinking/reasoning configuration

Cache prompt guidance is injected when `cachePromptInjection` is enabled.

Compaction guardrails:

- default cooldown: `minTurnsBetweenCompacts = 3`
- default session cap: `maxCompactsPerSession = 6`
- `hold` suppresses fold/compact advice and auto-fold until cooldown expires, except critical `force_fold`
- `/context-engine fold` and `/context-engine compact` remain available for explicit user action

## Built-in long-session pruning

`pi-context-engine` includes a built-in tool-result pruner adapted from `pi-context-prune` concepts.

Cache effect: pruning summarizes verbose tool results, then future model context receives the summaries instead of repeated raw output. Pi still owns the original session history. The engine tracks summarized tool call ids and injects summaries through its context projection path.

The built-in modes are:

| Mode | Behavior |
|---|---|
| `agent-message` | Default. Batch tool work and prune after an assistant text response or after `pruneBatchSize` tool turns |
| `checkpoint` | Prune only after `context_checkpoint` sets a checkpoint trigger |
| `on-demand` | Do not auto-prune; `context_prune` can still be called manually if active |
| `agentic-auto` | Adds `context_prune` to active model-visible tools so the model can decide when to prune |
| `every-turn` | Prune after any tool turn; available but cache-unfriendly |

Why `agent-message`:

- batches a stretch of tool work
- summarizes once when the agent sends a final text response
- prunes raw `toolResult` messages from future context
- causes one intentional cache miss per pruned tool-output batch, then returns to a shorter stable context

Pruner profile guidance:

| Session type | Recommended pruner profile | Why |
|---|---|---|
| Short interactive session | `on-demand` or off | Avoid unnecessary context rewrites |
| Normal long coding | `agent-message` | Recommended cache/cost tradeoff |
| Tool-heavy research | `agent-message`, or `checkpoint` at task boundaries | Avoid repeated cache churn |
| Autonomous multi-hour loop | `agentic-auto`, enabled before work starts | Lets model prune before overflow, with extra tool/prompt surface |
| Debugging pruning behavior | `on-demand` | User controls exact prune points |

Avoid `every-turn` for normal work. It keeps raw context smallest, but rewrites future prompt context too often and can reduce provider cache reuse.

### `agentic-auto` tradeoffs

`agentic-auto` gives the model a pruning tool and prompt guidance so it can decide when to prune during autonomous work.

In this implementation:

- `context_prune` is always registered as an extension tool
- it is added to active model-visible tools only when `pruneOn === "agentic-auto"`
- summaries use `pruneModel`, or the current chat model when `pruneModel` is `auto` / `default`

Implications:

1. Tool list changes. `context_prune` becomes model-visible. Tool specs are cache-relevant prefix bytes for providers with prompt caching, so enabling this mid-session can cause a cache-miss turn.
2. System prompt changes. Added pruning instructions also change prefix bytes. Enable before long work starts.
3. Autonomous pruning. Useful for multi-hour runs where final text-only assistant messages are rare.
4. Over-pruning risk. Frequent `context_prune` calls rewrite context often and can reduce cache hit rate.
5. Larger tool surface. One extra tool can affect tool selection and prompt size.
6. Different recovery path. This engine does not provide `context_tree_query`; huge single outputs use `context_result_lookup` instead.

Recommendation:

- Use `agent-message` for normal long coding.
- Use `agentic-auto` for autonomous long-running goals only when enabled before the main work starts.
- Watch `/context-engine status`; repeated cache drops after pruning mean `agentic-auto` may be too aggressive for that session.

## Manual cache-stability checklist

Repo tests prove stable-prefix behavior with mocks. Real warm-hit behavior must be checked against provider usage in an actual Pi session.

Before starting:

1. Select the model you intend to use before warmup.
2. Enable desired pruner profile before main work:
   ```text
   /context-engine config
   ```
3. Avoid changing model, enabled extensions, system-prompt-affecting settings, or model-visible tools mid-run.
4. Optional: run `/context-engine reset-stats` immediately before warmup.

During validation:

1. Treat first provider request as warmup and exclude it.
2. Run at least 3 stable-prefix turns without switching model/tools/system prompt.
3. Check `/context-engine diagnose`.
4. Confirm:
   - warmup excluded from assessment
   - `cacheRead / (input + cacheRead + cacheWrite)` is high on post-warmup provider usage
   - `prefix changes 0`
   - `tool changes 0`
   - `Cache profile: good` or `risky`, not `bad`
   - no compact storm guard warning

If cache is blocked, fix blocker first. Common blockers: changed tools, system prompt drift, `every-turn` pruner, compact storm. Low warm hit without blockers means provider/session telemetry is saying the invariants are not actually holding; inspect payload drift.

## Optional huge-result capper

The capper handles rare single tool outputs that are too large before `turn_end` pruning can run.

Enable:

```text
/context-engine enable-capper
```

When enabled, huge text tool results are replaced with a stable preview and a contextual ref like `dsc-read-1` or `dsc-bash-2`. The preview header shows the ref separately for quick visual scanning in the transcript. The full output is recoverable through:

```text
context_result_lookup [ref=dsc-read-1]
context_result_lookup [ref=dsc-read-1 offset=0 limit=20000]
```

Lookup results include a model-visible slice header before the payload, for example `[context_result_lookup kind=slice ref=dsc-read-1 offset=0 limit=20000 range=0:20000 returned_chars=20000 total_chars=73122 bytes=78044 has_more=true next_offset=20000]`, so the agent can tell whether it loaded the whole result or a bounded slice and where the next slice starts.

Warning: enabling the capper registers a new model-visible tool. Enable it before long work starts to avoid a mid-session tool-list cache miss.

## Optional compatible dynamic provider

Off by default.

This provider-specific integration is off by default. Enable dynamic provider registration only when your Pi release lacks a needed compatible model or when using a custom endpoint.

Dynamic provider behavior:

- fetches `GET /models` from `deepseekBaseUrl`
- registers provider `context-engine-provider` by default
- uses Pi compatibility metadata for provider-specific reasoning:
  - `thinkingFormat: "deepseek"`
  - `reasoning_content` replay
  - `high -> high`
  - `xhigh -> max`
- overrides built-in `deepseek` only when explicitly configured

## Configuration

Config path:

```text
~/.pi/agent/context-engine.json
```

Default config:

```json
{
  "enabled": true,
  "diagnostics": true,
  "mutateSystemPrompt": false,
  "mutateProviderPayload": false,
  "registerDynamicProvider": false,
  "dynamicProviderName": "context-engine-provider",
  "deepseekBaseUrl": "https://api.deepseek.com",
  "deepseekApiKeyEnv": "DEEPSEEK_API_KEY",
  "allowOverrideBuiltInDeepSeek": false,
  "hugeResultCapper": true,
  "hugeResultChars": 12000,
  "hugeResultHeadChars": 1200,
  "hugeResultTailChars": 400,
  "prefixStabilityCheck": true,
  "prefixFingerprint": true,
  "toolFingerprint": true,
  "appendOnlyProjection": true,
  "autoCompactAtHighWatermark": false,
  "autoFold": true,
  "foldTailPct": 0.2,
  "foldSummaryModel": "deepseek-v4-flash",
  "foldTool": false,
  "cachePromptInjection": true,
  "showCostSavings": true,
  "showCostBreakdown": true,
  "showSavings": true,
  "strictPrefixWarnings": false,
  "parallelReadTool": false,
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
  "persistDiagnostics": false,
  "enableAgenticTools": true,
  "pruneEnabled": true,
  "pruneOn": "agent-message",
  "pruneModel": "deepseek-v4-flash",
  "pruneBatchSize": 5,
  "statusBarStyle": "sparkline",
  "foldThreshold": 0.75,
  "aggressiveFoldThreshold": 0.78,
  "exitSummaryThreshold": 0.8,
  "preflightFoldThreshold": 0.9,
  "aggressiveFoldTailPct": 0.1,
  "minFoldSavings": 0.3,
  "foldTimeoutMs": 15000,
  "semanticFoldMarker": "<fold-summary>",
  "checkpointStartsSegment": false
}
```

| Key | Default | Effect |
|---|---:|---|
| `enabled` | `true` | Master switch |
| `diagnostics` | `true` | Capture read-only payload diagnostics |
| `prefixStabilityCheck` | `true` | Secondary context-prefix drift check |
| `prefixFingerprint` | `true` | Fingerprint real provider payload prefix |
| `toolFingerprint` | `true` | Track tool schema hash drift |
| `appendOnlyProjection` | `true` | provider-facing `[system, stable summary, append-only tail]` projection after controlled compact |
| `autoFold` | `true` | Enable cache-fold tooling/instructions under context pressure |
| `foldTailPct` | `0.2` | Tail preservation target for fold prompt strategy; host owns compaction boundary |
| `cachePromptInjection` | `true` | Add stable cache guidance via `before_agent_start` |
| `showCostSavings` | `true` | Show cache savings in status/advice |
| `showCostBreakdown` | `true` | Show cost breakdown where available |
| `showSavings` | `true` | Show savings estimate |
| `strictPrefixWarnings` | `false` | Reserve stricter prefix warning behavior |
| `parallelReadTool` | `false` | Register optional `deepseek_cache_parallel_read` |
| `showTurnEstimate` | `true` | Show estimated turns to overflow |
| `minTurnsBetweenCompacts` | `3` | Fold/compact advice cooldown |
| `maxCompactsPerSession` | `6` | Compact storm guard |
| `contextWarnPct` | `0.6` | GREEN→YELLOW threshold |
| `contextDangerPct` | `0.72` | YELLOW→ORANGE threshold |
| `contextCompactPct` | `0.82` | ORANGE→RED threshold |
| `contextForceFoldPct` | `0.95` | CRITICAL force-fold threshold |
| `foldHitRateThreshold` | `0.85` | Fold recommendation threshold under context pressure |
| `adviseCompactHitRateThreshold` | `0.8` | Reserved compatibility threshold for weak-hit recommendations |
| `mutateSystemPrompt` | `false` | Reserved compatibility flag; cache prompt injection is controlled separately |
| `mutateProviderPayload` | `false` | Reserved; no payload patching by default |
| `registerDynamicProvider` | `false` | Register optional `context-engine` provider |
| `hugeResultCapper` | `true` | Enable huge-output elision + lookup tool |
| `autoCompactAtHighWatermark` | `false` | Legacy compatibility flag; auto behavior is controlled by `autoFold` + thresholds |
| `statusLine` | `true` | Show cache status entry |
| `persistDiagnostics` | `false` | Persist payload diagnostics as session custom entries |
| `enableAgenticTools` | `true` | Register `context_checkpoint` / `context_rewind` tools |
| `pruneEnabled` | `true` | Enable built-in batch pruning |
| `pruneOn` | `agent-message` | Built-in pruning trigger mode |
| `pruneModel` | `deepseek-v4-flash` | Summarization model for pruning |
| `pruneBatchSize` | `5` | Tool-turn threshold for batched pruning |
| `statusBarStyle` | `sparkline` | Footer/status style: `sparkline`, `blocks`, or `text` |
| `foldThreshold` | `0.75` | Semantic fold recommendation threshold |
| `aggressiveFoldThreshold` | `0.78` | Stronger semantic fold threshold |
| `exitSummaryThreshold` | `0.8` | Exit-with-summary threshold after usage |
| `preflightFoldThreshold` | `0.9` | Fold-before-agent-start threshold |
| `aggressiveFoldTailPct` | `0.1` | Tail preservation target for aggressive fold |
| `minFoldSavings` | `0.3` | Minimum expected fold savings ratio |
| `foldTimeoutMs` | `15000` | Semantic fold timeout |
| `semanticFoldMarker` | `<fold-summary>` | Marker used for semantic fold messages |
| `checkpointStartsSegment` | `false` | Whether `context_checkpoint` starts a new cache segment |
| `skillPinning` | `true` | Wrap loaded skill bodies in `<context-engine-pin>` markers so they survive folds |
| `priorityInjection` | `true` | Inject high-priority pinned rules as a stable system-prompt section |
| `memoryInjection` | `false` | Inject user/project memory blocks as a stable system-prompt section |
| `autoDetectSkillPins` | `true` | Detect repeated `/skill:name` usage and suggest pinning |
| `skillPinConfirmThreshold` | `2` | How many `/skill:name` uses before suggesting a pin |

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
src/model.ts                 — provider/model compatibility checks
src/stats.ts                 — Pi usage hit/savings aggregation; no cost override
src/payload-diagnostics.ts   — read-only provider payload inspection
src/dynamic-provider.ts      — optional /models provider registration
src/context-monitor.ts       — legacy context threshold helper
src/cache-engine/*           — decision engine, prefix/tool stability, fold tool, append-only projection, custom compaction
src/projection/*             — built-in tool-result pruning and semantic fold helpers
src/pruner-advisor.ts        — pruner profile classification and compatibility diagnostics
src/capper.ts                — optional huge-result capper + lookup tool
src/commands.ts              — command metadata, completions, dispatcher, output
src/status.ts                — status-line and human-readable status formatting
src/runtime-state.ts         — shared runtime state
src/types.ts                 — shared types
```

### Source lineage

`pi-context-engine` was built as a unified extension over code and design work from these projects:

| Source project | Used for |
|---|---|
| [`DeepSeek-Reasonix`](https://github.com/esengine/DeepSeek-Reasonix) | Cache-first agent loop design, prompt-cache accounting model, prefix-stability goals, and long-session folding strategy |
| [`pi-context-prune`](https://github.com/championswimmer/pi-context-prune) | Tool-result batch capture, pruning/summarization concepts, `context_prune`-style workflow, and recovery-oriented context hygiene |
| [`pi-context`](https://github.com/ttttmr/pi-context) | Conversation checkpoint/rewind model, timeline concepts, `/context` visualization approach, and Pi session-tree interaction patterns |
| [Pi coding agent](https://github.com/earendil-works/pi) | Extension API, event hooks, command/tool registration, TUI integration, and package model |

The repository does not vendor those source trees. Relevant pieces were reimplemented, adapted, or ported into this package under the attribution in [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md).

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

Some cache-management controls cannot be fully implemented from a Pi extension without host changes:

- enforce immutable system prompt at host level
- freeze tool schemas globally
- own canonical append-only history
- change the built-in tool scheduler globally
- silently execute a tool call that the provider never emitted in `tool_calls`

This extension handles what the API allows: prefix fingerprinting, warnings, conservative arg repair, duplicate storm blocking, optional wrapper/meta-tools, optional provider-facing AppendOnly projection, and host `ctx.compact()` timing. Canonical Pi session history remains host-owned.

## Troubleshooting cache misses

If cache hit ratio drops:

1. Run `/context-engine diagnose`.
2. Prefix changed: check model, system prompt, reasoning/thinking params, temperature, and other extensions that mutate prompts.
3. Tools changed: enable capper/pruner/dynamic provider before long work starts; avoid mid-session tool registration changes.
4. Pruner every-turn: switch to the cache-safe profile in `/context-engine config`:
   ```text
   pruneOn = agent-message
   ```
5. Compact storm: wait for cooldown, reduce manual compacts, or raise `minTurnsBetweenCompacts` / lower auto use.
6. Low `cacheRead`: confirm hit rate formula uses `cacheRead / (input + cacheRead + cacheWrite)`, exclude warmup, and verify provider/model metadata.
7. Recent prune/compact: one miss after an intentional context rewrite is expected; hit rate should recover after 2-3 stable turns.
8. Huge tool result: keep the default capper enabled before work starts and recover exact text with `context_result_lookup`.

## Cache Checkpoints and Per-Model Cost Dashboard

The extension tracks **cache checkpoints** and **cache segments** to provide accurate per-model cost/savings breakdown and segment-aware hit rates.

### Cache checkpoints

A cache checkpoint marks a known boundary where provider cache continuity changes. Checkpoints are created automatically for:

- Model drift: model id changes between provider requests
- System/tool drift: system prompt or tool schemas change
- Model select: user explicitly switches model
- Session compact: host compaction rewrites history
- Semantic fold: fold summary is injected into context
- Prune/compact: summarized tool results or custom compaction rewrites prefix
- Conversation rewind: `context_rewind` creates new branch
- Conversation checkpoint: `context_checkpoint` creates named label

Manual conversation checkpoints (`context_checkpoint`) do not close the current cache segment by default (configurable via `checkpointStartsSegment: true`). Rewind always starts a new segment.

### Cache segments

A cache segment is the telemetry range between two checkpoints. Each segment tracks:

- Model and provider active during the segment
- Request count and warmup requests
- Hit rate (segment-only, excludes other segments)
- Warm hit rate (excludes first request after checkpoint)

### Per-model cost accounting

Each provider request stores immutable cost data:

- Model id and cost table active at request time
- Actual cost computed from provider usage or Pi-reported cost
- No-cache cost (what it would cost without prompt caching)
- Savings (no-cache minus actual)

Session totals are sums of immutable per-request snapshots. Switching models mid-session does not recalculate historical costs with the current model price.

### Dashboard (`/context`)

The `/context` dashboard shows:

- Current segment number, reason, and request count
- Current segment hit rate and warm hit rate
- Session-wide hit rate
- Per-model token, cost, and savings breakdown
- Mixed-session warning when multiple models participated
- Engine prefix/tool stability status
- Context usage recommendation

Example models block:

```
Models in session:
  provider/model-a           in 1.7M · cache 138.5M · hit 98.8% · $0.7252 · Δ +$19.00
  gpt-5.5                    in 11.2k · cache 0      · hit n/a   · $0.0573 · Δ n/a
```

### Status line

The Pi status line now shows prefix drift reason when applicable:

```
Hit: ████████░░ 98.8% | … · префикс изменён 1× (model)
```

### Diagnose (`/context-engine diagnose`)

Includes cache checkpoint history:

```
Cache checkpoints:
  #1 session_start @0 provider/model-a
  #2 provider_model_drift @23 provider/model-a → provider/model-b
  #3 semantic_fold @31
  #4 tools_drift @44
```

### Timeline (`context_timeline`)

The timeline tool shows cache checkpoint markers aligned to conversation entries and a cache checkpoint summary in the HUD.

### Known limitations

- Without known model pricing, savings are marked as `unknown`; actual cost is still shown when Pi reports it.
- Segment hit rate resets after model/system/tool drift by design — first request in new segment is warmup.
- Per-model cost accuracy depends on `model_cost` availability from provider context.

```json
// ~/.pi/agent/context-engine.json
{
  "checkpointStartsSegment": false
}
```

## Development

```bash
npm install
npm run typecheck:project
npm test
```

Run current checkout in Pi:

```bash
pi --no-extensions --no-skills -e /path/to/pi-context-engine
```

## Third-party notices

Source references used during development:

- [Reasonix CLI/TUI](https://github.com/esengine/DeepSeek-Reasonix) — cache-first agent loop
- [`pi-context-prune`](https://github.com/championswimmer/pi-context-prune) — Pi context pruning companion package
- [`pi-context`](https://github.com/ttttmr/pi-context) — checkpoint, timeline, rewind, and context visualization patterns
- [Pi packages documentation](https://pi.dev/docs/latest/packages) — package dependency and install model
- [Pi extensions documentation](https://pi.dev/docs/latest/extensions) — extension hooks and APIs

Full attribution details are maintained in [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md).

## License

MIT. See [`LICENSE`](LICENSE).

Third-party project attributions are listed in [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md).

# Configuration reference

Config file: `~/.pi/agent/context-engine.json`

## Full defaults

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
  "parallelReadTool": true,
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
  "pruneIncludeContext": false,
  "pruneBatchSize": 50,
  "pruneBridgeLength": 2,
  "pruneAgentMessageFallback": "next-agent-start",
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

## Key reference

| Key | Default | Effect |
|---|---:|---|
| `enabled` | `true` | Master switch |
| `diagnostics` | `true` | Capture read-only payload diagnostics |
| `prefixStabilityCheck` | `true` | Secondary context-prefix drift check |
| `prefixFingerprint` | `true` | Fingerprint real provider payload prefix |
| `toolFingerprint` | `true` | Track tool schema hash drift |
| `appendOnlyProjection` | `true` | Provider-facing `[system, stable summary, append-only tail]` projection after controlled compact |
| `autoFold` | `true` | Enable cache-fold tooling/instructions under context pressure |
| `foldTailPct` | `0.2` | Tail preservation target for fold prompt strategy; host owns compaction boundary |
| `cachePromptInjection` | `true` | Add stable cache guidance via `before_agent_start` |
| `showCostSavings` | `true` | Show cache savings in status/advice |
| `showCostBreakdown` | `true` | Show cost breakdown where available |
| `showSavings` | `true` | Show savings estimate |
| `strictPrefixWarnings` | `false` | Reserve stricter prefix warning behavior |
| `parallelReadTool` | `true` | Register optional `context_parallel_read` |
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
| `hugeResultCapper` | `true` | Replace huge tool outputs with bounded previews |
| `autoCompactAtHighWatermark` | `false` | Legacy compatibility flag; auto behavior is controlled by `autoFold` + thresholds |
| `statusLine` | `true` | Show cache status entry |
| `persistDiagnostics` | `false` | Persist payload diagnostics as session custom entries |
| `enableAgenticTools` | `true` | Register `context_checkpoint` / `context_rewind` tools |
| `pruneEnabled` | `true` | Enable built-in batch pruning |
| `pruneOn` | `agent-message` | Built-in pruning trigger mode |
| `pruneModel` | `deepseek-v4-flash` | Summarization model for pruning |
| `pruneIncludeContext` | `false` | Include assistant context in pruning summarizer prompts; useful for audits, noisier for cache |
| `pruneBatchSize` | `50` | Tool-turn threshold for batched pruning; configurable from 20 to 100 in steps of 5 |
| `pruneBridgeLength` | `2` | Assistant-message gap tolerated while grouping nearby tool batches |
| `pruneAgentMessageFallback` | `next-agent-start` | Safe fallback boundary for agent-message pruning; `before-provider` is opt-in and can prune mid-loop |
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

## Pruner profiles

The `pruneOn` key controls when tool-result pruning runs:

| Mode | Behavior |
|---|---|
| `agent-message` | Default. Batch tool work and prune after an assistant text response or after `pruneBatchSize` tool turns |
| `checkpoint` | Prune only after `context_checkpoint` sets a checkpoint trigger |
| `on-demand` | Do not auto-prune; `context_prune` can still be called manually if active |
| `agentic-auto` | Adds `context_prune` to active model-visible tools so the model can decide when to prune |
| `every-turn` | Prune after any tool turn; available but cache-unfriendly |

### Profile guidance

| Session type | Recommended pruner profile | Why |
|---|---|---|
| Short interactive session | `on-demand` or off | Avoid unnecessary context rewrites |
| Normal long coding | `agent-message` | Recommended cache/cost tradeoff |
| Tool-heavy research | `agent-message`, or `checkpoint` at task boundaries | Avoid repeated cache churn |
| Autonomous multi-hour loop | `agentic-auto`, enabled before work starts | Lets model prune before overflow, with extra tool/prompt surface |
| Debugging pruning behavior | `on-demand` | User controls exact prune points |

Avoid `every-turn` for normal work. It keeps raw context smallest, but rewrites future prompt context too often and can reduce provider cache reuse.

### `agentic-auto` tradeoffs

- **Tool list changes.** `context_prune` becomes model-visible. Tool specs are cache-relevant prefix bytes, so enabling mid-session causes a cache-miss turn.
- **System prompt changes.** Added pruning instructions also change prefix bytes. Enable before long work starts.
- **Autonomous pruning.** Useful for multi-hour runs where final text-only assistant messages are rare.
- **Over-pruning risk.** Frequent calls rewrite context often and reduce cache hit rate.
- **Larger tool surface.** One extra tool can affect tool selection and prompt size.

## Cache prefix invariant

Provider prompt caches reuse tokens only when the start of the provider prompt stays byte-stable. The extension fingerprints these cache-relevant prefix inputs:

- Model id
- System messages / stable injected cache guidance
- Normalized and sorted tool schemas
- Reasoning / thinking params
- Temperature

It intentionally does **not** fingerprint appended user/assistant/tool tail messages, request ids, timestamps, debug fields, or tool order noise.

Target metric:

```
cacheRead / (input + cacheRead + cacheWrite) >= 0.99
```

`/context-engine status` reports when cache-first invariants are intact: prefix changes are zero, tool changes are zero, pruner profile is not bad, and compact storm guard is quiet.

## Dynamic provider (optional)

This provider-specific integration is off by default. Enable only when your Pi release lacks a needed compatible model or when using a custom endpoint.

- Fetches `GET /models` from `deepseekBaseUrl`
- Registers provider `context-engine-provider` by default
- Uses Pi compatibility metadata for provider-specific reasoning:
  - `thinkingFormat: "deepseek"`
  - `reasoning_content` replay
  - `high → high`
  - `xhigh → max`
- Overrides built-in `deepseek` only when explicitly configured

## Localization

UI strings integrate with `@juicesharp/rpiv-i18n`, Pi's shared i18n dial for extensions. The package is optional: without it, the extension falls back to English.

Install for `/languages` and `--locale`:

```bash
pi install npm:@juicesharp/rpiv-i18n
```

Supported locales: `de`, `en`, `es`, `fr`, `pt`, `pt-BR`, `ru`, `uk`, `zh-CN`.

## Cache-first runtime profile

Recommended for normal long coding sessions:

```json
{
  "pruneOn": "agent-message",
  "pruneAgentMessageFallback": "next-agent-start",
  "pruneIncludeContext": false,
  "pruneBatchSize": 12,
  "parallelReadTool": true,
  "hugeResultCapper": true,
  "hugeResultHeadChars": 1200,
  "hugeResultTailChars": 400,
  "persistDiagnostics": false
}
```

Keep `pruneAgentMessageFallback` at `next-agent-start`. The `before-provider` fallback can reduce context earlier, but may rewrite history inside an active tool loop and cause a large cache miss.

Use `persistDiagnostics: true` or `pruneIncludeContext: true` only while debugging. They add evidence to the session, but increase prompt size and cache churn.

# Architecture and internals

## Source layout

```
src/index.ts                  Extension entrypoint and event wiring
src/config.ts                 Config load/save/parse
src/model.ts                  Provider/model compatibility checks
src/stats.ts                  Pi usage hit/savings aggregation; no cost override
src/payload-diagnostics.ts    Read-only provider payload inspection
src/dynamic-provider.ts       Optional /models provider registration
src/context-monitor.ts        Context threshold helper
src/cache-engine/             Decision engine, prefix/tool stability, fold logic, append-only projection, custom compaction
src/projection/               Built-in tool-result pruning and semantic fold helpers
src/pruner-advisor.ts         Pruner profile classification and compatibility diagnostics
src/capper.ts                 Huge-result preview capper
src/commands.ts               Command metadata, completions, dispatcher, output
src/status.ts                 Status-line and human-readable status formatting
src/runtime-state.ts          Shared runtime state
src/types.ts                  Shared types
src/context-pins/             Skill pinning, priority injection, pin tools
src/agentic/                  Checkpoint/rewind/timeline agentic tools
src/ui/                       Dashboard, settings menu, timeline renderer
src/i18n/                     Locale strings
src/telemetry-persistence.ts  Session entry persistence
```

## Runtime hooks

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

## Semantic fold mechanism

When context grows too large, the extension runs a semantic fold. It asks an LLM to summarize the oldest conversation span, inserts that summary as a synthetic assistant message, and removes the verbose source messages from future model context.

Fold behavior:

- Preserves explicit pin markers. The fold engine keeps `<context-engine-pin>` blocks and high-priority/memory markers in the conversation.
- Keeps provider cache prefixes stable where possible. The fold path avoids changing stable prefix inputs, so provider prompt caches can recover after the fold warmup request.
- Warns before overflow. The status bar shows a warning (e.g., `~3 turns (auto-fold ⚠)`) when context nears critical threshold.
- Uses configurable summarization models. When `foldSummaryModel` is `auto` or `default`, uses the currently selected chat model.

## Tool-result pruning

The built-in pruner (adapted from `pi-context-prune` concepts) summarizes verbose tool results and removes raw output from future model context. Pi still owns the original session history. The engine tracks summarized tool call ids and injects summaries through its context projection path.

Why `agent-message` mode is the default:

- Batches a stretch of tool work
- Summarizes once when the agent sends a final text response
- Prunes raw `toolResult` messages from future context
- Causes one intentional cache miss per pruned tool-output batch, then returns to a shorter stable context

## Cache checkpoints and segments

A cache checkpoint marks a known boundary where provider cache continuity changes. Created automatically for:

- Model drift: model id changes between provider requests
- System/tool drift: system prompt or tool schemas change
- Model select: user explicitly switches model
- Session compact: host compaction rewrites history
- Semantic fold: fold summary is injected into context
- Prune/compact: summarized tool results or custom compaction rewrites prefix
- Conversation rewind: `context_rewind` creates new branch
- Conversation checkpoint: `context_checkpoint` creates named label

A cache segment is the telemetry range between two checkpoints. Each segment tracks:

- Model and provider active during the segment
- Request count and warmup requests
- Hit rate (segment-only, excludes other segments)
- Warm hit rate (excludes first request after checkpoint)

Per-model cost accounting stores immutable snapshots per request. Switching models mid-session does not recalculate historical costs.

## Source lineage

The extension combines original code with ideas from several MIT-licensed Pi context-management projects:

| Source project | Used for |
|---|---|
| [`DeepSeek-Reasonix`](https://github.com/esengine/DeepSeek-Reasonix) | Cache-first agent loop design, prompt-cache accounting model, prefix-stability goals, long-session folding strategy |
| [`pi-context-prune`](https://github.com/championswimmer/pi-context-prune) | Tool-result batch capture, pruning/summarization concepts, `context_prune`-style workflow, recovery-oriented context hygiene |
| [`pi-context`](https://github.com/ttttmr/pi-context) | Conversation checkpoint/rewind model, timeline concepts, `/context` visualization approach, Pi session-tree interaction patterns |
| [Pi coding agent](https://github.com/earendil-works/pi) | Extension API, event hooks, command/tool registration, TUI integration, package model |

The repository does not vendor those source trees. Relevant pieces were reimplemented under the attribution in [`THIRD_PARTY_NOTICES.md`](../THIRD_PARTY_NOTICES.md).

## Host limitations

Some cache-management controls cannot be fully implemented from a Pi extension without host changes:

- Enforce immutable system prompt at host level
- Freeze tool schemas globally
- Own canonical append-only history
- Change the built-in tool scheduler globally
- Silently execute a tool call that the provider never emitted in `tool_calls`

This extension handles what the API allows: prefix fingerprinting, warnings, conservative arg repair, duplicate storm blocking, optional wrapper/meta-tools, optional provider-facing AppendOnly projection, and host `ctx.compact()` timing. Canonical Pi session history remains host-owned.

## Default behavior guarantees

Default behavior does not change:

- Selected provider
- Active tools, except `context_cache_fold` when `autoFold` is enabled, `context_prune` when `pruneOn === "agentic-auto"`, and optional `context_parallel_read`
- System prompt, unless `cachePromptInjection` is enabled
- Context messages
- Provider thinking/reasoning configuration

Compaction guardrails:

- Default cooldown: `minTurnsBetweenCompacts = 3`
- Default session cap: `maxCompactsPerSession = 6`
- `hold` suppresses fold/compact advice and auto-fold until cooldown expires, except critical `force_fold`
- `/context-engine fold` and `/context-engine compact` remain available for explicit user action

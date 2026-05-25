# Skill/Memory/Priority Integration Plan

## Summary

Pi already has a native skill system, but it is not the same thing as Reasonix `<skill-pin>`.

Pi skills are progressive-disclosure resources: Pi scans skill directories, injects an XML index of names/descriptions into the system prompt, and the model loads full `SKILL.md` bodies through `read` or `/skill:name` when needed. Reasonix adds a second mechanism: when a skill body is actually loaded into the conversation, it wraps that body in a `<skill-pin ...>` sentinel so semantic fold preserves the active skill verbatim instead of summarizing it away.

For `pi-context-engine`, the right integration is not “pretend Pi has `<skill-pin>`”. The right integration is:

1. read Pi-visible skills and context files through the Pi API layer,
2. optionally add a stable, compact memory/priority section to the system prompt,
3. wrap only loaded active skill bodies in engine-owned sentinel blocks,
4. teach semantic fold to preserve those engine-owned blocks,
5. keep all of this cache-aware and checkpoint-aware.

## What Pi Provides

Observed from local Pi docs and examples:

- Skills: Pi scans skill locations and includes available skills in XML format in the system prompt.
- Skill bodies: full `SKILL.md` content is loaded on demand, usually by `read` or `/skill:name`.
- Context files: Pi loads project/global context files such as `AGENTS.md`, `CLAUDE.md`, `.pi/SYSTEM.md`, and append system prompt files.
- Extension prompt injection: extensions can return `{ systemPrompt: ... }` from `before_agent_start`.
- Session state: extensions can persist custom entries through `pi.appendEntry(...)` and inspect `ctx.sessionManager.getEntries()` / `getBranch()`.
- Context filtering/projection: extensions can modify model-visible context in the `context` hook.

What Pi does not appear to provide as a platform contract:

- no native `<skill-pin>` syntax contract,
- no native `[HIGH PRIORITY]` contract for context-engine,
- no native Reasonix memory store under `.reasonix/memory`,
- no promise that a loaded skill body is automatically preserved verbatim across compaction/fold.

## What Reasonix Provides

Reasonix has several useful patterns we can port without making `pi-context-engine` DeepSeek-specific:

- `SkillStore`: stable ordered scan of project/custom/global skill roots.
- Skills index: only skill names/descriptions enter the stable prefix; bodies load lazily.
- `run_skill`: returns full inline skill content wrapped as:

  ```xml
  <skill-pin name="skill-name">
  ...full loaded skill body...
  </skill-pin>
  ```

- High-priority memory block:

  ```markdown
  # HIGH PRIORITY constraints (must observe)
  ...
  ```

- User/project memory blocks:

  ```markdown
  # User memory — global (...)
  # User memory — this project
  # Project memory (...)
  ```

- Semantic fold preservation: fold extracts `<skill-pin>` and high-priority/memory blocks before summarization and appends them verbatim to the folded synthetic message.

## Current Context-Engine State

Already present:

- `src/projection/history-folder.ts`
  - `extractPinnedSkills(...)` parses `<skill-pin name="...">...</skill-pin>`.
  - `extractPinnedConstraints(...)` parses `[HIGH PRIORITY]`, `[User memory]`, `[Project memory]`, and markdown variants.
  - fold keeps extracted pinned material in the synthetic fold message.
- `before_agent_start` can inject prompt text.
- `context` hook can project/modify model-visible messages.
- checkpoint logic already opens a segment on model changes and semantic fold/prune/compact events.

Missing:

- no engine-owned way to create pinned skill blocks from Pi-loaded skills,
- no memory/priority store or commands,
- no stable prompt section that explains engine memory/priority semantics,
- README currently overstates `<skill-pin>` as if it were a Pi-native mechanism,
- no UI/config for memory/priority,
- no tests that prove active skill pins survive fold because the engine created them, not because test fixtures happened to contain them.

## Design Decision

Implement `pi-context-engine` pinning as an opt-in engine layer:

- Do not replace Pi skills.
- Do not parse or mutate Pi internals beyond documented extension hooks.
- Do not require Reasonix folders by default.
- Support importing/reading Reasonix-compatible memory/skill roots as a compatibility source.
- Use engine-owned custom entries and prompt injection so state survives `/reload` and session restore.

Recommended default:

```json
{
  "skillPinning": true,
  "memoryInjection": false,
  "priorityInjection": true,
  "reasonixCompatibilityRoots": false
}
```

Rationale:

- skill pinning is low risk because it only affects content the model explicitly loads,
- priority preservation is useful for compact/fold correctness,
- memory injection changes the stable prefix and can introduce stale authority, so it should be explicit.

## Architecture

### 0. Pinning modes

The engine should support three complementary pinning modes. They must be visible in diagnostics because each mode has a different trust level.

#### A. Explicit priority pin tool

Tool:

```text
context_pin
```

Input:

```json
{
  "kind": "priority | memory | skill-note | working-rule",
  "name": "short-stable-name",
  "content": "the exact thing to preserve",
  "scope": "session | project | global",
  "priority": "normal | high",
  "ttl": "session | until-unpin"
}
```

Use this for hard user constraints, project invariants, and compact decisions that must survive pruning/folding. This is the safest path for “priority things” because it is explicit and auditable.

#### B. Explicit skill body pin tool

Tool:

```text
context_pin_skill
```

Use this when the model is about to follow a large skill body for multiple turns and the full skill instructions need to survive semantic fold.

#### C. Contextual/frequency skill inference

The engine can infer that a skill should be pinned when one of these happens:

- the user invokes `/skill:name`,
- a Pi skill body appears in the recent branch,
- a model-readable skill marker appears in the prompt,
- repeated messages strongly match one skill description,
- the same skill-like workflow is used across N turns.

This should not silently pin high-priority content. First implementation should produce a suggestion:

```text
suggested pin: skill=foo · reason=repeated-use · confirm with context_pin_skill
```

Config:

```json
{
  "autoDetectSkillPins": true,
  "autoPinFrequentSkills": false,
  "skillPinConfirmThreshold": 2,
  "skillAutoPinThreshold": 4
}
```

Recommended default:

- detect and show suggestions: on,
- automatically pin frequent skills: off,
- explicit `context_pin` / `context_pin_skill`: on.

Reason: automatic pinning changes prompt/cache state. It should not happen silently until telemetry and UI explain the cache checkpoint it creates.

### 1. New module: `src/context-pins/types.ts`

Define:

- `PinnedContextKind = "skill" | "priority" | "user-memory" | "project-memory" | "context-file"`
- `PinnedContextRecord`
  - `id`
  - `kind`
  - `name`
  - `scope`
  - `content`
  - `sourcePath?`
  - `createdAt`
  - `updatedAt`
  - `priority?: "normal" | "high"`
  - `stableHash`

### 2. New module: `src/context-pins/store.ts`

Responsibilities:

- restore records from Pi custom entries,
- persist changes through `pi.appendEntry("context-engine.pin", ...)`,
- deduplicate by `(kind, scope, name)`,
- expose deterministic order for prefix injection and fold preservation,
- cap content sizes to avoid blowing the stable prefix.
- track `source`: `explicit-tool`, `explicit-skill-tool`, `slash-skill`, `context-inferred`, `frequency-inferred`, or `imported-memory`,
- track `confidence` for inferred pins.

This store must not read arbitrary Reasonix memory by default. It should only read configured roots.

### 3. New module: `src/context-pins/skills.ts`

Responsibilities:

- discover Pi-compatible skill files from configured and conventional roots:
  - project `.agents/skills`
  - project `.claude/skills`
  - optional project `.reasonix/skills`
  - global `~/.agents/skills`
  - global `~/.claude/skills`
  - optional global `~/.reasonix/skills`
- parse frontmatter fields:
  - `name`
  - `description`
  - `allowed-tools`
  - `runAs`
  - `context`
  - `agent`
  - `model`
- build a stable skill index only if Pi does not already expose enough skill index data to the prompt.

Important: avoid duplicating Pi's own skill index by default. The first implementation should focus on loaded skill pinning, not a second global skill list.

### 4. New tool: `context_pin_skill`

Purpose:

- model-visible tool to load a skill body as an active pinned block when using context-engine pinning.

Input:

```json
{
  "name": "skill-name",
  "arguments": "optional task-specific arguments"
}
```

Output:

```xml
<context-engine-pin kind="skill" name="skill-name" version="1">
...
</context-engine-pin>
```

Why not keep Reasonix `<skill-pin>` as the primary syntax:

- `<skill-pin>` is Reasonix-specific and currently undocumented in Pi.
- A namespaced tag avoids implying Pi owns it.
- For migration, fold should preserve both `<skill-pin>` and `<context-engine-pin kind="skill">`.

### 4.1 New tool: `context_pin`

Purpose:

- pin priority facts, rules, decisions, and compact working memory that do not come from a full skill file.

The model should use this when the user states an explicit persistent constraint or when the agent wants to preserve a discovered invariant before pruning/folding.

This tool should not be used for large raw files or full tool outputs. Those belong to huge-result lookup or pruning summaries.

Example output:

```xml
<context-engine-pin kind="priority" name="no-legacy-context-tag" priority="high" version="1">
Use context_checkpoint terminology. Do not reintroduce deprecated on-context-tag naming.
</context-engine-pin>
```

### 5. New commands

- `/context-engine pins`
  - list active pins: kind, name, source, chars, hash
- `/context-engine pin <name>`
  - manually load/pin a known skill or memory record
- `/context-engine unpin <kind/name>`
  - deactivate pin for future turns
- `/context-engine memory add`
  - later phase; do not block skill pinning
- `/context-engine memory list`
  - later phase

### 6. Prompt injection

Use `before_agent_start` to append a small stable section only when enabled:

```markdown
# Context Engine Pins

Active pinned blocks are authoritative and must survive summarization.
When using a loaded skill, prefer `context_pin_skill` so the full skill body can be preserved across semantic folds.
Use `context_pin` for compact high-priority rules, user decisions, and project invariants that must survive fold.
```

If memory/priority injection is enabled:

```markdown
# HIGH PRIORITY constraints (context-engine)
...

# User memory — context-engine
...

# Project memory — context-engine
...
```

Cache rule:

- inject deterministic ordering,
- include content hashes in diagnostics,
- any change opens a cache checkpoint with reason `system_drift` or a new future reason `pin_drift`,
- surface the drift in `/context` so users know why hit rate fell.

### 7. Fold preservation

Update `history-folder.ts`:

- keep existing `<skill-pin>` compatibility parser,
- add parser for:

  ```xml
  <context-engine-pin kind="..." name="..." version="1">
  ...
  </context-engine-pin>
  ```

- preserve high-priority/memory markdown blocks from both system prompt and folded head messages,
- mark preserved blocks with a neutral header:

  ```markdown
  [Context Engine pinned material — preserved verbatim across fold:]
  ```

### 8. Context projection

The `context` hook should avoid repeated full pin bodies if the same pin was already preserved in the synthetic fold message.

Desired behavior:

- first load of a skill is visible in conversation and model context,
- after fold, one canonical preserved copy remains,
- later duplicate loads are suppressed or replaced with a short “already active” note,
- user-visible transcript should not explode with repeated skill bodies.

### 9. Checkpoints

Open cache checkpoints when:

- pin set changes,
- high-priority memory changes,
- project/global memory file hash changes,
- model changes,
- tool schema changes,
- semantic fold consumes pinned content.

The segment model should record:

- `pinHash`,
- `memoryHash`,
- affected request count,
- per-model usage/cost inside that segment.

This connects the pin/memory mechanism to the existing cache hit/miss accounting.

### 10. UI

Dashboard:

- add compact “Pins” row:
  - `pins 2 · high 1 · mem 0 · hash ab12`
- add “Suggestions” only when inference found a likely skill pin:
  - `suggested skill pin: gsd-debug · repeated 3×`
- add details under cache statistics:
  - active pins by name,
  - source and confidence for inferred pins,
  - whether pins changed this segment,
  - whether next request is expected to warm cache again.

Settings:

- add toggles:
  - `Skill pinning`
  - `Skill pin suggestions`
  - `Auto-pin frequent skills`
  - `Priority block injection`
  - `Memory injection`
  - `Reasonix compatibility roots`
- add explanations in i18n, not English-only strings.

## Migration From Current README Claim

Replace documentation wording:

Bad:

> Pinned skills (`<skill-pin>`) and constraints (`[HIGH PRIORITY]`, `[User memory]`) are preserved.

Correct:

> The fold engine preserves explicit pin/memory markers when they are present. Pi's native skills do not use `<skill-pin>`; context-engine can optionally create its own pin markers for loaded skill bodies.

## Implementation Phases

### Phase 1: Documentation and naming cleanup

- Fix README claim about Pi-native pins.
- Explain Reasonix origin precisely.
- Explain remaining DeepSeek-specific code as optional provider compatibility/fallback pricing/legacy names.
- Add this plan to `.ralph/`.

Verification:

- `npm run typecheck:project`
- README grep for misleading “Pi has `<skill-pin>`” phrasing.

### Phase 2: Engine-owned pin parser

- Add `context-engine-pin` parser.
- Keep `<skill-pin>` parser as compatibility only.
- Add unit tests for:
  - multiple pins,
  - duplicate name last-wins,
  - fold preserves pin verbatim,
  - no false claim that Pi emits the marker.

Verification:

- `npm test`
- targeted semantic fold tests.

### Phase 3: Pin store and persistence

- Add `context-pins/store.ts`.
- Persist active pin records as custom session entries.
- Restore on session start and `/reload`.
- Add diagnostics to `/context-engine status`.

Verification:

- tests for restore from `ctx.sessionManager.getEntries()`,
- tests for dedupe and stable hash.

### Phase 4: Skill pin tool

- Add `context_pin_skill` or extend existing command path.
- Read skill body from known configured roots.
- Return namespaced pin block.
- Add tool renderer so user sees a compact row, not a giant body.
- Add contextual detector that produces suggestions, not automatic prompt mutations.

Verification:

- tool schema test,
- renderer test,
- huge skill body is capped in user display but full body remains model-visible when intended.
- inference test for `/skill:name` and repeated skill usage.

### Phase 5: Priority pin tool

- Add `context_pin`.
- Persist priority/session pins.
- Preserve them through fold.
- Open checkpoint when active pin hash changes.
- Render compactly in transcript and `/context`.

Verification:

- explicit high-priority pin appears in next prompt injection,
- fold preserves it verbatim,
- unpin removes it and creates a cache checkpoint,
- UI never prints huge pin bodies by default.

### Phase 6: Priority/memory injection

- Add optional memory store.
- Import Reasonix-compatible memory only when config enables it.
- Inject deterministic high-priority/project/user blocks.
- Add checkpoint on hash change.

Verification:

- prefix hash changes exactly when memory changes,
- model change and memory change produce separate checkpoint reasons,
- `/context` shows pin/memory hash drift.

### Phase 7: UI/settings/i18n

- Add settings controls.
- Add dashboard rows.
- Translate all new labels.

Verification:

- settings navigation still works,
- `/context` remains compact,
- i18n completeness test passes.

## Risks

- Duplicating Pi's own skill index can increase prefix size and reduce cache hit rate. Default should avoid doing that.
- Persisting user memory can accidentally make stale facts authoritative. Memory injection should be explicit.
- Skill body pinning can bloat context if every skill body is pinned forever. Need unpin and duplicate suppression.
- Changing prompt injection mid-session is a real cache checkpoint and should be visible as such.
- Subagent skills from Reasonix cannot be directly ported unless Pi exposes or we implement an isolated subagent runner; do not fake it.

## Recommendation

Yes, implement it, but in this order:

1. Fix documentation and semantics now.
2. Add engine-owned pin syntax and parser.
3. Add pin persistence/checkpoint accounting.
4. Add explicit `context_pin` for priority facts.
5. Add skill body pinning.
6. Add contextual/frequency detection as suggestions first.
7. Add memory injection only after the pin path is stable.

This gives us the main benefit from Reasonix, preserving active operational context across fold, without pretending that Pi natively understands Reasonix markers or forcing Reasonix's DeepSeek-specific runtime model into `pi-context-engine`.

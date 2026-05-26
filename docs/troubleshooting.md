# Troubleshooting

## Cache miss diagnosis

If cache hit ratio drops:

1. Run `/context-engine diagnose`.
2. **Prefix changed:** check model, system prompt, reasoning/thinking params, temperature, and other extensions that mutate prompts.
3. **Tools changed:** enable pruner/dynamic provider before long work starts; avoid mid-session tool registration changes.
4. **Pruner every-turn:** switch to the cache-safe profile in `/context-engine config`:
   ```
   pruneOn = agent-message
   ```
5. **Compact storm:** wait for cooldown, reduce manual compacts, or raise `minTurnsBetweenCompacts` / lower auto use.
6. **Low `cacheRead`:** confirm hit rate formula uses `cacheRead / (input + cacheRead + cacheWrite)`, exclude warmup, and verify provider/model metadata.
7. **Recent prune/compact:** one miss after an intentional context rewrite is expected; hit rate should recover after 2-3 stable turns.
8. **Huge tool result:** keep the default capper enabled and re-check hidden content with scoped ordinary tools (`read offset/limit`, `grep/find`, or narrower `bash`).

## Blocked cache examples

```
cache blocked: tools changed 1×; pruner profile bad — every-turn rewrites prompt-cache prefix too often
```

## Manual cache-stability validation

Repo tests prove stable-prefix behavior with mocks. Real warm-hit behavior must be checked against provider usage in an actual Pi session.

**Before starting:**

1. Select the model you intend to use before warmup.
2. Enable desired pruner profile before main work:
   ```
   /context-engine config
   ```
3. Avoid changing model, enabled extensions, system-prompt-affecting settings, or model-visible tools mid-run.
4. Optional: run `/context-engine reset-stats` immediately before warmup.

**During validation:**

1. Treat first provider request as warmup and exclude it.
2. Run at least 3 stable-prefix turns without switching model/tools/system prompt.
3. Check `/context-engine diagnose`.
4. Confirm:
   - Warmup excluded from assessment
   - `cacheRead / (input + cacheRead + cacheWrite)` is high on post-warmup provider usage
   - `prefix changes 0`
   - `tool changes 0`
   - `Cache profile: good` or `risky`, not `bad`
   - No compact storm guard warning

If cache is blocked, fix blocker first. Common blockers: changed tools, system prompt drift, `every-turn` pruner, compact storm. Low warm hit without blockers means provider/session telemetry is saying the invariants are not actually holding; inspect payload drift.

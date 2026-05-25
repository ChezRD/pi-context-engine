# i18n Workflow

This project keeps locale files as the source of truth, but agents must treat them as managed data, not prose files to rewrite freely.

## Rules for Agents

1. Change only the keys required by the product change.
2. Add the key to `src/i18n/locales/en.json` first, then add the same key to every locale file.
3. Do not reorder locale files by hand. Run `npm run i18n:sort`.
4. Do not bulk-retranslate existing locales unless the task explicitly asks for a translation pass.
5. Preserve placeholders exactly: `{name}`, `{count}`, `${cost}`, XML-like tags, command names, and protocol identifiers must not be translated or renamed.
6. Prefer compact UI wording. Russian and other non-English locales may keep short technical words such as `prune`, `fold`, `tools`, `cache`, or `hit` when that makes dashboard/status text clearer and shorter.
7. Long explanatory strings belong in help text, diagnostics, or docs. Dashboard/status strings should stay scan-friendly.
8. If a locale is uncertain, copy the English value only as a temporary fallback and leave a focused audit finding; do not invent a long translation to satisfy completeness.

## Russian Terminology

Russian UI may use compact technical Russian mixed with accepted developer terms. Keep the style consistent inside one string.

Prefer these terms:

| Concept | Short UI term | Long/help term | Notes |
| --- | --- | --- | --- |
| cache | `кэш` | `кэш`, `кэширование` | Use `кэш`, not `кеш`, for consistency in this project. |
| prompt | `промпт` | `системный промпт`, `промпт модели` | Common in LLM documentation. |
| prompt cache | `prompt-cache` | `кэш промпта` | Use `prompt-cache` in dense dashboard lines, Russian form in help text. |
| prefix cache | `prefix-cache` | `кэш префикса` | Same rule as prompt cache. |
| hit / miss | `hit`, `miss` | `попадание`, `промах` | Use English only in dense metric rows. |
| tool / tools | `tools` | `инструменты` | Use `tools` for model/API payload concepts, `инструменты` for user-facing commands. |
| tool call | `tool call` | `вызов инструмента` | Use English only when referring to raw provider/API shape. |
| tool result | `tool-result` / `tool-results` | `результат инструмента` | Use English in compact telemetry labels. |
| prune | `prune` | `prune результатов инструментов` | Do not replace with generic `очистка` when the mode/operation matters. |
| fold | `fold` | `свёртка`, `свёртывание истории` | Use `fold` in compact metrics and mode names. |
| checkpoint | `checkpoint` | `контрольная точка` | Use Russian in normal prose; English in mode names and short labels. |
| fallback | `fallback` | `fallback-путь`, `fallback-запуск` | Do not replace with generic `запасной`, because it loses the engineering meaning. |
| no-op | `no-op` | `без изменений` | `no-op` is acceptable in compact counters. |
| input/output | `input`, `output` | `ввод`, `вывод` | Prefer Russian unless matching provider usage fields. |

Avoid these in Russian UI unless they are raw identifiers:

- `чекпоинт`, `батч`, `резюме для очистки`, `импакт`, `definitions tools`
- mixed half-translations like `предупреждение prune` when `prune: {error}` is shorter
- long explanatory accounting lines in the dashboard; move explanations to help/diagnostics

## Required Checks

Run these after any i18n change:

```sh
npm run i18n:sort
npm run i18n:audit
```

Run `npm run typecheck:project` if keys are added, removed, or renamed.

## PR Shape

An i18n PR should make review easy:

- Keep source-code key usage and locale updates in the same PR.
- Keep mechanical sorting separate from semantic translation edits when practical.
- Mention new, removed, and renamed keys in the PR summary.
- Include the output of `npm run i18n:audit`.

## Audit Contract

`npm run i18n:audit` fails the build on structural problems:

- missing or extra keys compared with `en`
- value type drift, such as string vs array
- placeholder drift, such as dropping `{turns}` or `${cost}`
- exact English copies in normal localized strings
- unexpected ASCII words in non-Latin locales
- discouraged Russian fragments listed in this document

The audit reports dense UI length as warnings. Long status/dashboard strings are not broken translations, but they should be reviewed because they make `/context` hard to scan.

`intent.*` arrays are treated as locale vocabulary, not UI copy. They may have different lengths per language and may include English fallback terms when that improves intent detection.

For semantic review, run:

```sh
npm run i18n:audit -- --llm-review=ru --llm-findings-limit=20
```

The review pack is ready to pass to an LLM: each item includes the English source, target locale string, placeholders, source usage, and review instructions. Spawned review agents are consultants only: they return advisory JSON with `verdict`, `confidence`, `recommendations`, and optional `variants`. They must not call interactive user-input tools or decide edits by themselves. The agent running the script reads the advisory output, checks it against the glossary and code context, and then decides whether to edit locale files.

For terminology-sensitive work, add the web-research instruction:

```sh
npm run i18n:audit -- --llm-review=ru --llm-web --llm-findings-limit=20
```

This still keeps CI offline. The script only prints research-ready prompts; the agent performs web search when the user asks for deep translation review, when terminology is disputed, or when a model review returns `verdict:"uncertain"` or only low-confidence variants. Prefer official vendor docs, language/style guides, localization portals, and established developer documentation. Web evidence may refine wording, but project glossary rules remain the default unless the evidence clearly shows a better accepted term.

For package-level model review, generate a structured prompt:

```sh
npm run i18n:audit -- --llm-review=ru --llm-pack-file=/tmp/ru-i18n-review.txt
```

This writes one structured package-context prompt containing the English base locale, the target locale or locales, related locale slices, and selected audit findings. The audit script does not call a model. The agent running the script may pass that file to Pi, another model, or a manual review workflow.

Recommended Pi command for local review:

```sh
pi --model deepseek/deepseek-v4-flash --thinking high --no-session --no-tools -p < /tmp/ru-i18n-review.txt
```

Run Pi without tools for the review pass. If Pi returns `verdict:"uncertain"` or low-confidence recommendations, the outer agent performs web search separately, records the evidence used for the decision, and then decides whether to edit. If web evidence is still ambiguous, ask the user before changing locale files. Pi is a consultant, not the decision maker.

### Pi-Agent Runtime Notes

Model review is intentionally separate from normal audit:

- Normal `npm run i18n:audit` must stay offline and must work in CI and third-party agent sandboxes.
- `--llm-review` and `--llm-web` only print review prompts; they do not require Pi auth or network.
- `--llm-findings-limit=<n>` limits how many audit findings per locale are included in the printed review pack and package prompt. It is not a model token limit.
- `--llm-pack` prints package-level structured prompts; `--llm-pack-file=<path>` writes them to a file.
- The package prompt is one structured request with JSON input under `packages[]`: full `en`, full target locale, related `en`/target locale slices, and selected findings. For `--llm-review=all`, keep one prompt and require one response object with `locales[]`; do not split it into several markdown-separated prompts or accept multiple top-level JSON blocks.
- Do not regress this to isolated one-string prompts or free-form markdown-only context because terminology and compactness decisions depend on surrounding keys.
- The model review command should use `--no-tools`. It must not call interactive user-input tools. It is a consultant, not the decision maker.
- Low-confidence or uncertain model output is not an automatic skip. The outer agent must resolve it with web evidence where possible, then either apply a justified edit or ask the user.
- In sandboxed environments, Pi may fail if it cannot access `~/.pi/agent` or create runtime lock files. Symptoms include `EROFS` lock errors or missing provider auth.
- If running inside Codex or another sandbox, the outer agent may need an escalated command run for the `pi ... -p < file` command so Pi can read its auth/config and write runtime locks.
- If running from inside an already-live Pi environment, prefer the same Pi runtime/config/auth that the user session uses. Do not assume a bare Node subprocess has identical permissions.

Minimal smoke test for Pi runtime availability:

```sh
printf 'Return JSON only: {"ok":true}\n' | pi --model deepseek/deepseek-v4-flash --thinking off --no-session -p
```

Expected output:

```json
{"ok":true}
```

If this fails, do not run model review; use the printed review pack or rerun with the correct Pi environment/permissions.

## Why

Localization workflows work best when keys are stable, missing keys are caught automatically, and translation files are synchronized by tooling. External localization systems follow the same pattern: extract or add source keys, sync locale files, review changed strings, and block incomplete or malformed placeholder changes in CI.

For agentic development, the important constraint is diff size: agents should update only touched keys, then let scripts sort and audit. This keeps pull requests reviewable and prevents accidental retranslation of stable language packs.

# Evidence Log (compressed)

This file is manually compacted. Script summaries are useful raw material, but final verdicts here are manual.

## Current Goal

- Run `npm run "evidence:pi"` with DeepSeek via `/home/chez/.pi/agent/context-engine.json`.
- Inspect the generated JSONL, not stdout alone.
- Judge: cache hit/miss, intent guidance delivery, tool correctness, final answer correctness, fold/compact preservation.
- Target: terminal audit answer, correct tool use, no lost files/overclaims, warm cache hit near 95-99%.

## Key Findings So Far

### 2026-05-26T03:06Z - retry-dbg-1 (dbg.ts, retry logic)
- Session: /tmp/pi-evidence-iter-dbg/2026-05-26T03-06-07-704Z_019e623f-2bd8-702d-a937-7de7005678f5.jsonl
- Finalization: terminal/stop/exit 0, 25 assistants, 42 tools, 52 telemetry, 22 payloads
- Cache: 7552/116 (98.5%) → 40960/786 (98.1%). No fold/compaction.
- 1 guidance (user-intent) preserved. 0 weak evidence warnings.
- dbg.ts: file-based debug, zero stderr pollution.
- Model: intent declared ✅, 89% stmts ✅, weak spots correct ✅, test count overcount by 9 ⚠️.
- Bug: pi CLI Rust panic `Broken pipe` on early stdout close.

### Superseded history (compressed)
- 01:25-01:32Z: Infra failures (DNS). Not valid model evidence.
- 01:27-01:40Z: Single-run baseline. tool-loop, cache 99.2%, partial.
- 01:41Z: No-bash allowlist. tool-loop.
- 01:45Z: No-fold abort control. terminal, 52 tools, cache 99.6%. Proved fold/exit-summary caused aborts.
- 01:51Z: Exit-summary fold fix. ctx.abort removed. terminal, 32 assistants, cache 99.2→99.0%.
- 01:56-01:58Z: Short prompt regression. All 3 aborted. Control old prompt succeeded.
- 02:02-02:12Z: persistDiag fix. Moved safeAppendEntry to message_end.
- 02:17-02:25Z: Signal abort inside handleTurnEnd. Intermittent ~50%.
- 02:42-02:55Z: Retry iterations with retry logic + nudge tuning.

## Open Evidence Gaps

- Fold/compact preservation in live run: not verified.
- Intermittent signal abort: cause unclear, ~50% runs abort inside handleTurnEnd.
- Model test-count overcount (29 vs 20 actual).
- Pi CLI Rust broken pipe on retry.

## 2026-05-26T03:15:27.962Z Iter 2 - keep session dir

Prompt:
- `пожалуйста првоеди глубокий аудит покрытия тестами pi-context-engine`

Session:
- `/tmp/pi-evidence-iter2/2026-05-26T03-12-56-180Z_019e6245-6774-7a09-9f93-a575717b463e.jsonl`
- pi cycles: 1; total exit codes: 0.
- pi exit: 0; stderr: none.

Observed:
- JSONL lines: 111; parse errors: 0.
- First assistant: input=116, cacheRead=7552, stop=toolUse, tools=bash, bash, bash.
- Tool calls: 40; tool results: 40; weak evidence warnings: 6.
- Finalization: status=terminal; finalStop=stop; outputChars=3331; cache=44800/519 (read/input).
- Connection errors: 0 line(s) [none].
- Guidance markers: 3; active kinds=user-intent=1.
- Guidance stability: firstLine=4; firstToolIntent=n/a; firstUserIntent=n/a.
- Tool-use coverage: calls=40; results=40; coverage=true.
- Result event present: no.
- Process abort after completed tool batch: no.
- Provider payload diagnostics: count=42; telemetryRequests=20; last=request#20 messages=62 tail=assistant>tool>tool>tool>assistant>tool>assistant>tool last=tool.
- Host compactions: 0; lines=none.
- Fold detected: false; post-fold reads=0; post-fold lookups=0; post-fold read regret=0.
- Task retention: promptWords=7; retained=аудит, покрытия, pi-context-engine.
- Overclaim signals: /line coverage|branch coverage|function coverage/i.
- Quality flags: script_table_count claimed=10 observed=41.

Final preview:
> Теперь у меня есть все данные. Вот полный аудит.
> 
> ---
> 
> # Аудит тестового покрытия pi-context-engine
> 
> ## 1. Общая статистика
> 
> | Метрика | Значение |
> |---|---|
> | Версия | 0.2.3 |
> | Исходные файлы (.ts) | 60 файлов (+ 3 файла `types.ts`) |
> | Строк TypeScript | ~10 836 |
> | Файлов тестов | 11 (все `.mjs`) |
> | Строк тестов | ~9 283 |
> | **Всего тестов** | **330** |
> | **Пройдено** | **282 (85.5%)** |
> | **Упало** | **48 (14.5%)** |
> 
> ## 2. Coverage (c8, все 11 тестов)
> 
> | Тип | Покрытие |
> |---|---|
> | **Statements** | **89.28%** (9 177 / 10 278) |
> | **Branches** | **77.95%** (3 274 / 4 200) |
> | **Functions** | **92.13%** (539 / 585) |
> | **Lines** | **89.28%** |
> 
> ## 3. Детальное покрытие по модулям
> 
> ### 3.1 Отличное покрытие (≥95%)
> 
> | Модуль | Stmts | Branch | Funcs | Lines |
> |---|---|---|---|---|
> | `runtime-state.ts` | 100% | 100% | 100% | 100% |
> | `model.ts` | 100% | 91.9% | 100% | 100% |
> | `model-visible.ts` | 100% | 83.3% | 100% | 100% |
> | `stats.ts` | 100% | 86.2% | 100% | 100% |
> | `utils.ts` | 100% | 90% | 100% | 100% |
> | `dbg.ts` | 100% | 60% | 100% | 100% |
> | `payload-diagnostics.ts` | 100% | 83.6% | 100% | 100% |
> | `config.ts` | 99.7% | 94.8% | 100% | 99.7% |
> | `telemetry-persistence.t


### 2026-05-26T03:13Z - iter 2 (keep, no retry needed) ← LATEST
- Session: /tmp/pi-evidence-iter2/
- Finalization: terminal/stop/exit 0, 20 assistants, 40 tools, 42 telemetry, 3 payloads
- Cache: 7552/116 (98.5%) → 44800/519 (98.9%). No fold/compaction.
- 1 guidance (user-intent) preserved. 0 retries needed.
- dbg.ts: clean, no stderr pollution.
- Model: intent declared ✅, coverage 89.3% stmts ✅, fail count 48 (actual 20, overcount by 28) ⚠️.
- Model tool usage: find, node --test, coverage-final.json ✅

## 2026-05-26T03:17:13.949Z Iter 3 - tail/grep nudge for test count

Prompt:
- `пожалуйста првоеди глубокий аудит покрытия тестами pi-context-engine`

Session:
- `/tmp/pi-evidence-iter3/2026-05-26T03-17-08-614Z_019e6249-4186-70b7-b7ca-c9f40f3f3d96.jsonl`
- pi cycles: 1; total exit codes: 1.
- pi exit: 1; stderr: Request was aborted.

--- retry succeeded ---
Request was aborted..

Observed:
- JSONL lines: 13; parse errors: 0.
- First assistant: input=116, cacheRead=7552, stop=toolUse, tools=bash, bash, bash.
- Tool calls: 3; tool results: 3; weak evidence warnings: 0.
- Finalization: status=tool-loop; finalStop=toolUse; outputChars=378; cache=7552/116 (read/input).
- Connection errors: 0 line(s) [none].
- Guidance markers: 2; active kinds=user-intent=1.
- Guidance stability: firstLine=4; firstToolIntent=n/a; firstUserIntent=n/a.
- Tool-use coverage: calls=3; results=3; coverage=true.
- Result event present: no.
- Process abort after completed tool batch: yes.
- Provider payload diagnostics: count=2; telemetryRequests=1; last=request#1 messages=3 tail=system>user>user last=user.
- Host compactions: 0; lines=none.
- Fold detected: false; post-fold reads=0; post-fold lookups=0; post-fold read regret=0.
- Task retention: promptWords=7; retained=аудит, покрытия, тестами, pi-context-engine.
- Overclaim signals: none.
- Quality flags: process_abort_after_completed_tool_batch.

Final preview:
> The user wants a deep audit of test coverage for the pi-context-engine project. Let me start by understanding the project structure, what tests exist, and then analyze coverage thoroughly.
> 
> Let me first explore the project structure, then look at tests, source code, and coverage tools.
> Detected intent: **analyze** (аудит покрытия тестами). Plan:
> 
> 1. Исследовать структуру проекта — исходники, тесты, конфиги
> 2. Проверить инструменты coverage (jest, vitest, nyc, etc.)
> 3. Запустить coverage-отчёт
> 4. Пофайлово разобрать пробелы в покрытии
> 5. Свести итоговую таблицу с рекомендациями
> 
> Начинаю.


## 2026-05-26T03:20:01.618Z Iter 4 - retry x4

Prompt:
- `пожалуйста првоеди глубокий аудит покрытия тестами pi-context-engine`

Session:
- `/tmp/pi-evidence-iter4/2026-05-26T03-17-50-737Z_019e6249-e611-71a0-93d8-caeede88bbbc.jsonl`
- pi cycles: 1; total exit codes: 0.
- pi exit: 0; stderr: Request was aborted.

--- retry succeeded ---.

Observed:
- JSONL lines: 141; parse errors: 0.
- First assistant: input=116, cacheRead=7552, stop=toolUse, tools=bash, bash.
- Tool calls: 44; tool results: 44; weak evidence warnings: 6.
- Finalization: status=terminal; finalStop=stop; outputChars=3137; cache=45440/81 (read/input).
- Connection errors: 0 line(s) [none].
- Guidance markers: 2; active kinds=user-intent=1.
- Guidance stability: firstLine=4; firstToolIntent=n/a; firstUserIntent=n/a.
- Tool-use coverage: calls=44; results=44; coverage=true.
- Result event present: no.
- Process abort after completed tool batch: no.
- Provider payload diagnostics: count=48; telemetryRequests=23; last=request#23 messages=69 tail=tool>tool>assistant>tool>assistant>tool>assistant>tool last=tool.
- Host compactions: 0; lines=none.
- Fold detected: false; post-fold reads=0; post-fold lookups=0; post-fold read regret=0.
- Task retention: promptWords=7; retained=аудит, покрытия, pi-context-engine.
- Overclaim signals: none.
- Quality flags: none.

Final preview:
> Now I have all the data I need. Let me compile a comprehensive audit report.
> Теперь у меня есть все данные. Собираю полный аудит.
> 
> ---
> 
> # Аудит тестового покрытия pi-context-engine
> 
> ## 1. Общая статистика
> 
> | Метрика | Значение |
> |---|---|
> | Всего тестов (`it`) | **511** |
> | Тестовых файлов | **11** |
> | Общий объём тестов | **9 283 строк** |
> | Покрытие строк | **89%** (8 897/9 993) |
> | Покрытие ветвлений | **78%** (3 166/4 040) |
> | Покрытие функций | **93%** (529/571) |
> | Запуск тестов | **687 тестов / 123 suites** |
> | **Pass / Fail** | **658 / 29** |
> 
> ---
> 
> ## 2. Покрытие по модулям
> 
> ### Отличное покрытие (≥95%)
> 
> | Файл | Stmts | Branch | Funcs |
> |---|---|---|---|
> | `append-only-projection.ts` | 100% | 93% | 100% |
> | `cache-prompt-inject.ts` | 100% | 75% | 100% |
> | `custom-compaction.ts` | 100% | 100% | 100% |
> | `decision-engine.ts` | 100% | 100% | 100% |
> | `prefix-fingerprint.ts` | 100% | 95% | 100% |
> | `prefix-stability.ts` | 100% | 85% | 100% |
> | `detector.ts` | 100% | 100% | 100% |
> | `injection.ts` | 100% | 93% | 100% |
> | `store.ts` | 100% | 100% | 100% |
> | `config.ts` | 99.7% | 95% | 100% |
> | `runtime-state.ts` | 100% | 100% | 100% |
> | `stats.ts` | 100% | 86% | 100% |
> | `utils.


### 2026-05-26T03:19Z - iter 4 (retry x4, succeeded with retry) ← LATEST
- Session: /tmp/pi-evidence-iter4/ — 23 assistants, 44 tools, terminal/stop
- Cache: 7552/116 (98.5%) → 45440/81 (99.8%). No fold.
- Retry needed: da (аборт на первой попытке, вторая успешна)
- Model: intent ✅. Still overcounts failures (29 vs 20). Nudge adjustment needed.

## 2026-05-26T03:23:22.554Z Iter 5 - compact nudge + retry x4

Prompt:
- `пожалуйста првоеди глубокий аудит покрытия тестами pi-context-engine`

Session:
- `/tmp/pi-evidence-iter5/2026-05-26T03-21-19-935Z_019e624d-173f-78f8-880b-17853978d552.jsonl`
- pi cycles: 1; total exit codes: 0.
- pi exit: 0; stderr: Request was aborted.

--- retry succeeded ---.

Observed:
- JSONL lines: 128; parse errors: 0.
- First assistant: input=116, cacheRead=7552, stop=toolUse, tools=bash, bash.
- Tool calls: 47; tool results: 47; weak evidence warnings: 2.
- Finalization: status=terminal; finalStop=stop; outputChars=3331; cache=59264/92 (read/input).
- Connection errors: 0 line(s) [none].
- Guidance markers: 4; active kinds=user-intent=1.
- Guidance stability: firstLine=4; firstToolIntent=n/a; firstUserIntent=n/a.
- Tool-use coverage: calls=47; results=47; coverage=true.
- Result event present: no.
- Process abort after completed tool batch: no.
- Provider payload diagnostics: count=40; telemetryRequests=19; last=request#19 messages=68 tail=tool>assistant>tool>tool>assistant>tool>assistant>tool last=tool.
- Host compactions: 0; lines=none.
- Fold detected: false; post-fold reads=0; post-fold lookups=0; post-fold read regret=0.
- Task retention: promptWords=7; retained=аудит, покрытия, тестами, pi-context-engine.
- Overclaim signals: /line coverage|branch coverage|function coverage/i, /без тестов|no tests/i.
- Quality flags: none.

Final preview:
> Now I have all the data needed for a comprehensive audit. Let me compile the full report.
> 
> Summary:
> - Total tests: 687 tests across 11 test files
> - Passing: 658, Failing: 29
> - Line coverage: 89.28% (9177/10278 lines)
> - Function coverage: 92.13% (539/585 functions)  
> - Branch coverage: 77.95% (3274/4200 branches)
> 
> Key uncovered areas:
> 1. ui/settings.ts - 20.1% line coverage (TUI component, hard to test without full TUI framework)
> 2. ui/timeline.ts - 34.3% (same reason)
> 3. context-pins/tools.ts - 40.4% (registerPinTools execution paths untested)
> 4. cache-engine/parallel-read-tool.ts - 56.8%
> 5. tool-evidence.ts - 62.8% (bash evidence assessment)
> 6. agentic/tools.ts - 65.7% (context_checkpoint/context_rewind execute paths)
> 7. projection/prune-impact.ts - 78.5%
> 8. cache-engine/fold-tool.ts - 80.8%
> 9. tool-intent-injection.ts - 84.8%
> 10. index.ts - 84.9% (71.4% functions)
> 
> Now let me produce a well-structured report.
> Теперь у меня достаточно данных. Вот полный аудит.
> 
> ---
> 
> ## Аудит покрытия тестами — pi-context-engine v0.2.3
> 
> ### 1. Общая статистика
> 
> | Метрика | Значение |
> |---------|----------|
> | **Всего тестов** | 687 (658 pass / 29 fail) |
> | **Тестовых файлов** | 11 |
> | **Исходных стр


### 2026-05-26T03:21Z — iter 5 (compact nudge + retry x4)
- **Session:** /tmp/pi-evidence-iter5/ → terminal/stop/exit 0, 19 assistants, 47 tools, 40 payloads
- **Cache:** 7552/116 → 715136/47158 (cumulative, $0.098 savings)
- **Retries:** 1 (initial retried → succeeded)
- **Intent declared:** ✅ — model stated intent in first response
- **Coverage:** 89.3% lines, 77.95% branches — correct from coverage-final.json ✅
- **Test count: ❌ claimed 11 fail/29 pass — actual 20 fail/667 pass**
  - Model still not running `node --test` and parsing final line
- **Fold/compact:** none triggered (session too short, 19 requests)
- **Open:** test count accuracy still broken; fold/compact not verified

## 2026-05-26T03:26:46.307Z Iter 6 - conflict resolution nudge

Prompt:
- `пожалуйста првоеди глубокий аудит покрытия тестами pi-context-engine`

Session:
- `/tmp/pi-evidence-iter6/2026-05-26T03-24-53-117Z_019e6250-57fd-7891-aaa0-85950938a4c2.jsonl`
- pi cycles: 1; total exit codes: 0.
- pi exit: 0; stderr: Request was aborted.

--- retry succeeded ---.

Observed:
- JSONL lines: 94; parse errors: 0.
- First assistant: input=116, cacheRead=7552, stop=toolUse, tools=bash, bash, bash.
- Tool calls: 39; tool results: 39; weak evidence warnings: 2.
- Finalization: status=terminal; finalStop=stop; outputChars=2910; cache=46592/5287 (read/input).
- Connection errors: 0 line(s) [none].
- Guidance markers: 2; active kinds=user-intent=1.
- Guidance stability: firstLine=4; firstToolIntent=n/a; firstUserIntent=n/a.
- Tool-use coverage: calls=39; results=39; coverage=true.
- Result event present: no.
- Process abort after completed tool batch: no.
- Provider payload diagnostics: count=30; telemetryRequests=14; last=request#14 messages=55 tail=tool>assistant>tool>tool>assistant>tool>tool>tool last=tool.
- Host compactions: 0; lines=none.
- Fold detected: false; post-fold reads=0; post-fold lookups=0; post-fold read regret=0.
- Task retention: promptWords=7; retained=глубокий, аудит, покрытия, тестами, pi-context-engine.
- Overclaim signals: /line coverage|branch coverage|function coverage/i.
- Quality flags: none.

Final preview:
> Now I have a comprehensive understanding of the codebase and its test coverage. Let me compile the full audit report. I have all the data I need:
> 
> 1. Test structure and results
> 2. Coverage by directory and file
> 3. Files with uncovered functions
> 4. Files with low coverage
> 5. Test failures
> 
> Let me now write a thorough audit report.
> Теперь у меня есть все данные для полного отчёта. Вот результаты глубокого аудита покрытия тестами **pi-context-engine v0.2.3**.
> 
> ---
> 
> # Глубокий аудит покрытия тестами — pi-context-engine
> 
> ## 1. Общая статистика
> 
> | Метрика | Покрытие |
> |---|---|
> | **Statements** | **89.28%** (9177/10278) |
> | **Lines** | **89.28%** (9177/10278) |
> | **Functions** | **92.13%** (539/585) |
> | **Branches** | **77.95%** (3274/4200) |
> 
> **Тесты:** 687 тестов, 123 suites  
> **Пройдено:** 282 ✔  
> **Упало:** 48 ✖  
> 
> ---
> 
> ## 2. Тестовая инфраструктура
> 
> 11 файлов тестов в `tests/`, все — ESM `.mjs` с `node:test`:
> 
> | Файл | Строк | Что покрывает |
> |---|---|---|
> | `coverage.test.mjs` | 3810 | Интеграционное тестирование projection, folding, pruning, decision engine (самый большой) |
> | `core.test.mjs` | 1790 | stats, config, capper, cache-engine, model, telemetry, context-monitor, i18n |
> |


## 2026-05-26T03:29:53.758Z Iter 7 - exact counts nudge

Prompt:
- `пожалуйста првоеди глубокий аудит покрытия тестами pi-context-engine`

Session:
- `/tmp/pi-evidence-iter7/2026-05-26T03-27-28-891Z_019e6252-b87b-70f9-adad-1d3ef6dc3f8d.jsonl`
- pi cycles: 1; total exit codes: 0.
- pi exit: 0; stderr: none.

Observed:
- JSONL lines: 130; parse errors: 0.
- First assistant: input=116, cacheRead=7552, stop=toolUse, tools=bash, bash.
- Tool calls: 36; tool results: 36; weak evidence warnings: 6.
- Finalization: status=terminal; finalStop=stop; outputChars=2436; cache=47616/724 (read/input).
- Connection errors: 0 line(s) [none].
- Guidance markers: 3; active kinds=user-intent=1.
- Guidance stability: firstLine=4; firstToolIntent=n/a; firstUserIntent=n/a.
- Tool-use coverage: calls=36; results=36; coverage=true.
- Result event present: no.
- Process abort after completed tool batch: no.
- Provider payload diagnostics: count=50; telemetryRequests=24; last=request#24 messages=62 tail=assistant>tool>assistant>tool>assistant>tool>assistant>tool last=tool.
- Host compactions: 0; lines=none.
- Fold detected: false; post-fold reads=0; post-fold lookups=0; post-fold read regret=0.
- Task retention: promptWords=7; retained=аудит, покрытия, тестами, pi-context-engine.
- Overclaim signals: /full picture|comprehensive picture/i, /line coverage|branch coverage|function coverage/i, /без тестов|no tests/i.
- Quality flags: none.

Final preview:
> Now I have a very comprehensive picture. Let me assemble the full audit report as a structured document.
> Отлично, у меня есть вся необходимая аудиторская информация. Вот полный отчёт.
> 
> ---
> 
> # Аудит покрытия тестами pi-context-engine
> 
> ## 1. Сводка
> 
> | Метрика | Всего | Покрыто | % |
> |---|---|---|---|
> | **Lines** | 10 278 | 9 177 | **89.28%** |
> | **Functions** | 585 | 539 | **92.13%** |
> | **Branches** | 4 200 | 3 274 | **77.95%** |
> | **Тесты** | 687 | 658 pass | **29 fail** |
> 
> | Источники | 54 .ts файла |
> |---|---|
> | Тестовые файлы | 11 `.test.mjs` |
> 
> ---
> 
> ## 2. Покрытие по директориям
> 
> | Директория | Файлы | Lines | Funcs | Branches |
> |---|---|---|---|---|
> | **ui/** | 4 | **64.9%** 🔴 | **62.5%** 🔴 | **49.7%** 🔴 |
> | **agentic/** | 1 | **65.7%** 🔴 | 100.0% | **46.7%** 🔴 |
> | **context-pins/** | 5 | 88.5% 🟡 | 93.9% | 90.2% |
> | **projection/** | 10 | 95.1% ✅ | 98.6% | 78.1% 🟡 |
> | **cache-engine/** | 14 | 92.7% ✅ | 95.7% | 84.5% |
> | **i18n/** | 2 | 93.9% ✅ | 95.7% | 81.2% |
> | **root (index, config, capper…)** | 19 | 92.9% ✅ | 93.9% | 79.3% 🟡 |
> | **ИТОГО** | **54** | **89.3% 🟡** | **92.1% ✅** | **78.0% 🟡** |
> 
> ---
> 
> ## 3. Красная зона — файлы с наихудшим покрытием
> 
> ### 3.1. `ui/sett


## 2026-05-26T03:44:39.173Z Iter 6 - prompt leak fix + exact count nudge

Prompt:
- `пожалуйста првоеди глубокий аудит покрытия тестами pi-context-engine`

Session:
- `/tmp/pi-evidence-iter6/2026-05-26T03-40-42-756Z_019e625e-d584-7f46-b858-d0b893f3c17c.jsonl`
- pi cycles: 1; total exit codes: 0.
- pi exit: 0; stderr: none.

Observed:
- JSONL lines: 122; parse errors: 0.
- First assistant: input=245, cacheRead=7424, stop=toolUse, tools=context_parallel_read, bash, bash.
- Tool calls: 49; tool results: 49; weak evidence warnings: 4.
- Finalization: status=terminal; finalStop=stop; outputChars=2511; cache=36480/213 (read/input).
- Connection errors: 0 line(s) [none].
- Guidance markers: 2; active kinds=user-intent=1.
- Guidance stability: firstLine=4; firstToolIntent=n/a; firstUserIntent=n/a.
- Tool-use coverage: calls=49; results=49; coverage=true.
- Result event present: no.
- Process abort after completed tool batch: no.
- Provider payload diagnostics: count=44; telemetryRequests=21; last=request#21 messages=72 tail=assistant>tool>tool>tool>assistant>tool>assistant>tool last=tool.
- Host compactions: 0; lines=none.
- Fold detected: false; post-fold reads=0; post-fold lookups=0; post-fold read regret=0.
- Task retention: promptWords=7; retained=аудит, покрытия, тестами, pi-context-engine.
- Overclaim signals: /line coverage|branch coverage|function coverage/i.
- Quality flags: none.

Final preview:
> Now I have the complete picture. Let me also quickly check what the failing tests in coverage.test.mjs are about to understand if they're real code issues or just test expectations that need updating.
> 
> Let me also look at what specific lines in `extension-behavior.test.mjs` and `coverage.test.mjs` are failing.
> Теперь вся картина ясна. Вот полный аудит покрытия тестами.
> 
> ---
> 
> ## Аудит покрытия тестами: pi-context-engine v0.2.3
> 
> ### 1. Общая статистика
> 
> | Метрика | Значение |
> |---|---|
> | **Source-файлов** | 59 `.ts` файлов (10 840 строк) |
> | **Тестовых файлов** | 11 `.mjs` |
> | **Пассов** | 775 |
> | **Фейлов** | 63 |
> | **Statement coverage** | **89.32%** |
> | **Branch coverage** | **77.97%** |
> | **Function coverage** | **92.13%** |
> | **Line coverage** | **89.32%** |
> 
> Инструмент: `node:test` runner + `c8` для instrumented coverage.
> 
> ---
> 
> ### 2. Результаты по тестовым файлам
> 
> | Файл | Pass | Fail | Что тестирует |
> |---|---|---|---|
> | `core.test.mjs` | 97 | 0 | Stats, config, pruner-advisor, model, capper, context-monitor, telemetry, model-visible |
> | `coverage.test.mjs` | 398 | **47** | Почти все модули через dynamic imports (см. ниже) |
> | `extension-behavior.test.mjs` | 55 | **17** | E2E


### 2026-05-26T03:33Z — iter 6 (prompt leak fix)
- **Session:** /tmp/pi-evidence-iter6/ → terminal/stop, 21 asst, 49 tools, exit 0, 0 retries
- **Cache:** 7552/116 → 536448/24218 (steady growth)
- **Leak check:** `[context-engine` → false ✅, `[pi-context-engine` → false ✅
- **Intent declared:** ✅
- **Test count:** claimed 97 from partial test file output, not full suite ❌
- **Model still skips `node --test`**

## 2026-05-26T03:48:08.836Z Iter 7 - auth command nudge

Prompt:
- `пожалуйста првоеди глубокий аудит покрытия тестами pi-context-engine`

Session:
- `/tmp/pi-evidence-iter7/2026-05-26T03-45-50-804Z_019e6263-88d4-7ee4-8523-99a0a084c781.jsonl`
- pi cycles: 1; total exit codes: 0.
- pi exit: 0; stderr: Request was aborted.

--- retry succeeded ---.

Observed:
- JSONL lines: 121; parse errors: 0.
- First assistant: input=117, cacheRead=7552, stop=toolUse, tools=bash, bash, bash.
- Tool calls: 51; tool results: 51; weak evidence warnings: 1.
- Finalization: status=terminal; finalStop=stop; outputChars=2841; cache=39680/678 (read/input).
- Connection errors: 0 line(s) [none].
- Guidance markers: 2; active kinds=user-intent=1.
- Guidance stability: firstLine=4; firstToolIntent=n/a; firstUserIntent=n/a.
- Tool-use coverage: calls=51; results=51; coverage=true.
- Result event present: no.
- Process abort after completed tool batch: no.
- Provider payload diagnostics: count=38; telemetryRequests=18; last=request#18 messages=71 tail=tool>tool>assistant>tool>assistant>tool>tool>tool last=tool.
- Host compactions: 0; lines=none.
- Fold detected: false; post-fold reads=0; post-fold lookups=0; post-fold read regret=0.
- Task retention: promptWords=7; retained=аудит, покрытия, тестами, pi-context-engine.
- Overclaim signals: /line coverage|branch coverage|function coverage/i, /без тестов|no tests/i.
- Quality flags: none.

Final preview:
> Now I have everything I need for a comprehensive audit report. Let me compile it.
> Вот полный аудит покрытия тестами **pi-context-engine**:
> 
> ---
> 
> ## Аудит покрытия тестами: pi-context-engine
> 
> ### 1. Инфраструктура
> 
> | Мета | Значение |
> |---|---|
> | Фреймворк тестов | `node:test` (built-in, ESM) |
> | Механизм покрытия | `node --experimental-coverage` (built-in V8) |
> | Команда запуска | `node --test tests/**/*.test.mjs` |
> | Команда покрытия | (отдельный скрипт: `scripts/pi_prompt_evidence.mjs`) |
> | Тестовых файлов | 11 |
> | Исходных файлов (src) | 63 (49 executable + 7 re-exports + 7 pure-types) |
> | Source LOC | 10 840 |
> | Test LOC | 9 285 |
> | Отношение | ~0.86 строк теста на строку кода |
> 
> ### 2. Общие метрики покрытия
> 
> | Метрика | % покрытия |
> |---|---|
> | **Lines** | **89.28%** |
> | **Statements** | **89.28%** |
> | **Functions** | **92.13%** |
> | **Branches** | **77.95%** |
> 
> ### 3. Результаты прогона
> 
> - **660 passed**
> - **27 failed** (4.1% падают)
> - Время: ~4s
> 
> Основные причины падений:
> - Файловые ENOENT при тестах конфига (`context-engine.json`)
> - Несоответствие ожидаемого текста в выводе (`Wrote ...context-engine.json` vs `...context-engine.evidence.json`)
> - Таймауты в `requestFold` (500


## 2026-05-26T03:49:18.599Z Iter 8

Prompt:
- `пожалуйста првоеди глубокий аудит покрытия тестами pi-context-engine`

Session:
- `/tmp/pi-evidence-iter8/2026-05-26T03-49-14-682Z_019e6266-a53a-7dac-af4c-f01c3f3d3630.jsonl`
- pi cycles: 1; total exit codes: 1.
- pi exit: 1; stderr: Request was aborted.

--- retry succeeded ---
Request was aborted..

Observed:
- JSONL lines: 12; parse errors: 0.
- First assistant: input=117, cacheRead=7552, stop=toolUse, tools=bash, bash.
- Tool calls: 2; tool results: 2; weak evidence warnings: 1.
- Finalization: status=tool-loop; finalStop=toolUse; outputChars=289; cache=7552/117 (read/input).
- Connection errors: 0 line(s) [none].
- Guidance markers: 2; active kinds=user-intent=1.
- Guidance stability: firstLine=4; firstToolIntent=n/a; firstUserIntent=n/a.
- Tool-use coverage: calls=2; results=2; coverage=true.
- Result event present: no.
- Process abort after completed tool batch: yes.
- Provider payload diagnostics: count=2; telemetryRequests=1; last=request#1 messages=3 tail=system>user>user last=user.
- Host compactions: 0; lines=none.
- Fold detected: false; post-fold reads=0; post-fold lookups=0; post-fold read regret=0.
- Task retention: promptWords=7; retained=покрытия, pi-context-engine.
- Overclaim signals: none.
- Quality flags: process_abort_after_completed_tool_batch.

Final preview:
> The user wants me to conduct a deep audit of test coverage for the pi-context-engine project. Let me start by exploring the project structure, understanding the codebase, and then analyzing test coverage.
> 
> Let me plan the approach:
> 
> 1. First, explore the project structure
> 2. Find all source files and test files
> 3. Look at existing test configuration (jest, vitest, etc.)
> 4. Run the test coverage report
> 5. Analyze the results deeply
> 
> Let me start.
> Detected intent: **analyze** (test coverage audit). Подход: исследую структуру проекта, найду все исходники и тесты, изучу конфигурацию тест-раннера, запущу замер покрытия, затем детально проанализирую результаты.
> 
> Начну с общего обзора проекта и тестовой конфигурации.


## 2026-05-26T03:51:45.947Z Iter 9 - fold pressure

Prompt:
- `пожалуйста првоеди глубокий аудит покрытия тестами pi-context-engine`

Session:
- `/tmp/pi-evidence-iter9/2026-05-26T03-49-41-975Z_019e6267-0fd7-75ac-9ae4-aa2848ade2eb.jsonl`
- pi cycles: 1; total exit codes: 0.
- pi exit: 0; stderr: none.

Observed:
- JSONL lines: 132; parse errors: 0.
- First assistant: input=117, cacheRead=7552, stop=toolUse, tools=bash, bash.
- Tool calls: 51; tool results: 51; weak evidence warnings: 7.
- Finalization: status=terminal; finalStop=stop; outputChars=2269; cache=63360/2746 (read/input).
- Connection errors: 0 line(s) [none].
- Guidance markers: 2; active kinds=user-intent=1.
- Guidance stability: firstLine=4; firstToolIntent=n/a; firstUserIntent=n/a.
- Tool-use coverage: calls=51; results=51; coverage=true.
- Result event present: no.
- Process abort after completed tool batch: no.
- Provider payload diagnostics: count=48; telemetryRequests=23; last=request#23 messages=76 tail=tool>assistant>tool>assistant>tool>tool>assistant>tool last=tool.
- Host compactions: 0; lines=none.
- Fold detected: false; post-fold reads=0; post-fold lookups=0; post-fold read regret=0.
- Task retention: promptWords=7; retained=аудит, покрытия, тестами, pi-context-engine.
- Overclaim signals: /полная картина/i, /line coverage|branch coverage|function coverage/i.
- Quality flags: script_table_count claimed=9 observed=18.

Final preview:
> Now I have all the data I need for a comprehensive audit report. Let me compile it.
> 
> Summary:
> - **687 total tests**, 660 pass, 27 fail (96.1% pass rate)
> - **10,278 lines of TypeScript** in src/
> - **9,285 lines of tests** (ratio ~0.90:1)
> - Overall line coverage: 89.28%
> - Function coverage: 92.13%
> - Branch coverage: 77.95% — notably weaker
> 
> Key findings:
> 
> 1. **Coverage gaps (red zones < 50%)**:
>    - `ui/settings.ts`: 20.12% — practically untested (UI settings menu with TUI framework)
>    - `ui/timeline.ts`: 34.34% — timeline rendering untested
>    - `context-pins/tools.ts`: 40.37% — pin/registerPinTools untested
> 
> 2. **Coverage gaps (yellow zones 50-80%)**:
>    - `cache-engine/parallel-read-tool.ts`: 56.76%
>    - `tool-evidence.ts`: 62.83%
>    - `agentic/tools.ts`: 65.70%
>    - `commands.ts`: 86.81% (but branches only 66.1%)
>    - `projection/prune-impact.ts`: 78.51%
> 
> 3. **27 failing tests** — mostly integration tests in extension-behavior.test.mjs and some edge cases in coverage.test.mjs
> 
> 4. **Quality observations:
>    - Unit tests are thorough for core logic (cache-engine, stats, store, i18n, history-folder) 
>    - UI layer is severely undertested
>    - Integration tests with mock pi API are 


## 2026-05-26T03:54:36.730Z Iter 10 - fold pressure

Prompt:
- `пожалуйста првоеди глубокий аудит покрытия тестами pi-context-engine. прочитай src/ каталоги, tests/ файлы, coverage-final.json, package.json scripts, запусти ✔ detects built-in DeepSeek model as native (1.962607ms)
✔ warns for DeepSeek-looking model without compat (0.321193ms)
✔ computes cache stats from Pi usage (0.301363ms)
✔ usage snapshot extraction handles sparse, invalid, and nested shapes (0.140707ms)
✔ no-cache savings display is UX-only and non-negative (0.146967ms)
✔ stats helpers cover pricing, ratios, formatting, grouping, compaction, and compact cost edge cases (0.867561ms)
✔ addUsage handles missing snapshots, explicit costs, and missing compacts (0.193646ms)
✔ inspects DeepSeek provider payload (0.351942ms)
✔ config parser accepts percent in 0..100 form (0.477289ms)
✔ config parser falls back and clamps invalid edge values (0.701055ms)
✔ config parser preserves all boolean fields (0.708804ms)
✔ classifies pruner cache profiles (0.625117ms)
✔ detects pi-context-prune commands/tools (0.896101ms)
✔ context percent and recommendations (0.242915ms)
✔ decision engine reads context usage shapes and boundary zones (0.453611ms)
✔ post-usage and preflight decisions cover invalid and exact threshold inputs (0.227655ms)
✔ model selection drift opens checkpoint segment with previous model (0.695654ms)
✔ syncModelSelection leaves checkpoints unchanged for same model and for first requestless selection (0.315083ms)
✔ telemetry restore rebuilds prune indexer for provider-context pruning after reload (0.687435ms)
✔ telemetry persistence omits live prune buffers and bulky diagnostics (0.4382ms)
✔ prune debug persistence truncates captured prompt and response (0.327283ms)
✔ context handler returns pruned messages so Pi standard context usage sees the rebuilt context (1.259573ms)
✔ context handler projects semantic fold synthetic message plus live tail from branch (0.44462ms)
✔ context handler returns undefined when nothing changed and no projection applies (0.242515ms)
✔ context handler returns only system plus synthetic message when semantic fold tail start is missing (0.354192ms)
✔ context handler falls through safely when semantic fold branch lookup throws (0.319583ms)
✔ context handler returns append-only projection when active (0.435161ms)
✔ manual prune rebuild opens prune checkpoint exactly once for newly applied ids (0.418531ms)
✔ executePrune falls back to observation mask when summary model returns no usable output (4.166619ms)
✔ executePrune returns no_session without session manager (0.392611ms)
✔ executePrune marks tool calls with missing replayable results and persists skipped ids (0.45618ms)
✔ executePrune interactive mode lists replayable tool calls without summarizing (0.409411ms)
✔ executePrune uses ctx model for default summarizer, deduplicates emitted summaries, and works without runtime engine (2.30475ms)
✔ executePrune uses explicit summarizer override and skips inefficient replacement summaries (1.013608ms)
✔ executePrune masks empty or malformed summarizer responses for large tool results (2.27921ms)
✔ agent-message prune collects on turn_end and flushes on final assistant message_end (16.899382ms)
✔ agent-message prune counts parallel batches captured from branch when turn_end toolResults are empty (0.47002ms)
✔ handleTurnEnd uses event turnIndex when provided and increments otherwise (0.197626ms)
✔ handleMessageEnd delegates safely for non-assistant events (10.11554ms)
✔ captureTurnEndBatch preserves lookup details when restored session result body is empty (0.176857ms)
✔ captureTurnEndBatch deduplicates skip ids and already pending tool ids (0.150547ms)
✔ registerPruneTool wires tool execution through executePrune (0.440761ms)
✔ syncPruneToolActivation adds and removes context_prune only for agentic-auto (0.139057ms)
✔ syncPruneToolActivation ignores runtime-not-initialized errors and rethrows other failures (0.316543ms)
✔ handleSessionBeforeCompact stays inert when extension is disabled (0.194835ms)
✔ handleSessionBeforeCompact cancels empty host compaction when extension is enabled (0.137157ms)
✔ telemetry restore preserves prune impact trace fields after reload (0.227284ms)
✔ telemetry restore hydrates latest prune debug trace when telemetry lacks it (0.184736ms)
✔ telemetry restore clears legacy pendingSummaries state (0.178206ms)
✔ savingsFromRealCost uses Pi cache-aware usage.cost as source of truth (0.086218ms)
✔ costToCompact estimates additional miss cost versus cached current cost (0.107368ms)
✔ DeepSeek fallback pricing matches official pricing page (0.099138ms)
✔ hit ratio uses provider formula cacheRead / (input + cacheRead + cacheWrite) (0.074688ms)
✔ cache fold helpers estimate tokens, hash deterministically, and avoid placeholder boundary overrides (0.191686ms)
✔ prefix extraction canonicalizes tools and ignores order noise (0.348012ms)
✔ prefix extraction ignores append-only chat tail and volatile request fields (0.198996ms)
✔ provider prefix handler treats chat append and tool order as stable (0.49276ms)
✔ provider prefix handler emits no warnings for normal chat append (0.246635ms)
✔ provider prefix handler records hard drift reason and suppresses repeat warnings (0.705545ms)
✔ prefix diff reports exact cache-relevant change reasons (0.114618ms)
✔ prefix diff and warning policy suppress repeated same reason (0.098328ms)
✔ stableHash is deterministic and detects tool schema drift (0.113728ms)
✔ stableHash covers nested, long-key, special-key, and cyclic inputs (2.421577ms)
✔ decision engine matches cache-first thresholds (0.099148ms)
✔ canCompactNow enforces cooldown and max session compacts (0.095678ms)
✔ parallel read wrapper registers only when extension and wrapper are enabled (0.365152ms)
✔ tool call repair is read-specific and duplicate suppression window is bounded (0.415881ms)
✔ tool call regret monitoring counts rereads of summarized refs and paths (0.272044ms)
✔ detectTextualToolCall flags explicit prose tool calls and avoids provider/definition false positives (29.249892ms)
✔ detectToolIntent returns reason codes and uses locale vocabulary (3.514334ms)
✔ detectUserIntent uses i18n vocabulary for user prompts (223.641207ms)
✔ detectUserIntentMultilingual detects non-active user language before falling back to general (352.173736ms)
✔ huge result capper elides only above threshold and preserves recovery details (1.675464ms)
✔ huge result capper uses configured char threshold instead of preview or byte length (0.158106ms)
✔ huge result model instruction avoids cutout wording when preview contains the full result (0.154156ms)
✔ huge result capper bounds inline preview by configured segment size (0.216495ms)
✔ huge result refs stay in memory and do not persist during tool-result handling (0.267214ms)
✔ huge result store uses fallback slug, truncates long tool slugs, and ignores invalid restored records (0.125427ms)
✔ huge result capper recognizes lookup result shapes without toolName (0.083248ms)
✔ huge result capper ignores empty and non-text result shapes (0.140317ms)
✔ huge result preview renderer shows first output and expands from local store (0.124257ms)
✔ lookup tool handles offset past end, negative offset, limit zero, and missing stored record in renderer (0.546037ms)
✔ token counting: empty string content (0.205466ms)
✔ token counting: very long content (0.095258ms)
✔ token counting: ContentPart with empty parts (0.085708ms)
✔ token counting: tool_calls with empty args (0.080258ms)
✔ token counting: whitespace-only and multimodal content ignore non-text parts (0.090328ms)
✔ openCacheCheckpoint creates checkpoint and segment boundary (0.140166ms)
✔ context_checkpoint does not start segment by default (0.101318ms)
✔ rewind creates checkpoint and starts new segment (0.093438ms)
✔ model drift creates hard segment boundary (0.114558ms)
✔ first usage after checkpoint is warmup (0.149937ms)
✔ warmHitRate excludes warmup requests (0.091098ms)
✔ aggregateByModel sums tokens and costs correctly (0.142237ms)
✔ mixed pricing does not fabricate savings (4.081661ms)
✔ aggregateBySegment groups usages by segment (0.178487ms)
✔ currentSegmentStats returns filtered stats (0.149917ms)
▶ countMessageTokens
  ✔ counts string content (0.643526ms)
  ✔ counts ContentPart[] (0.127317ms)
  ✔ counts tool_calls JSON (0.105747ms)
  ✔ handles null (0.154806ms)
  ✔ handles undefined (0.111228ms)
  ✔ handles empty content (0.077478ms)
  ✔ handles simple content (0.076579ms)
✔ countMessageTokens (2.162593ms)
▶ estimateFoldBoundary
  ✔ returns ok:false for empty messages (0.220195ms)
  ✔ splits messages into head and tail (0.160876ms)
  ✔ handles non-array input (0.102098ms)
  ✔ user-seeking expands tail to user boundary (0.113538ms)
  ✔ returns the whole conversation as tail when it fits the budget (0.508409ms)
  ✔ keeps the original boundary when user-seeking would exceed the expanded budget (0.088238ms)
✔ estimateFoldBoundary (1.413089ms)
▶ extractPinnedSkills
  ✔ extracts from system message (0.253495ms)
  ✔ returns empty for no matches (0.072968ms)
  ✔ deduplicates by name, last wins (0.071159ms)
  ✔ handles non-string content (0.053319ms)
  ✔ multiple skills from one message (0.067208ms)
✔ extractPinnedSkills (0.658316ms)
▶ extractPinnedConstraints
  ✔ finds bracket HIGH PRIORITY (0.303203ms)
  ✔ returns empty for no constraints (0.235595ms)
  ✔ handles non-string content (0.091928ms)
✔ extractPinnedConstraints (0.731114ms)
▶ buildFoldMessage
  ✔ includes marker, skills, constraints (0.191936ms)
  ✔ omits skills when empty (0.061858ms)
  ✔ omits constraints when empty (0.053369ms)
✔ buildFoldMessage (0.392521ms)
▶ buildEffectiveFoldGuidance
  ✔ preserves intent and tool/evidence rules outside model-generated summaries (0.271074ms)
  ✔ extracts prior intent nudges from folded messages (0.559038ms)
✔ buildEffectiveFoldGuidance (0.90576ms)
▶ extractSessionIntent
  ✔ extracts first user goal and explicit constraints deterministically (0.280504ms)
✔ extractSessionIntent (0.338733ms)
▶ trimTrailingAssistantToolCalls
  ✔ drops trailing assistant with tool_calls (0.160306ms)
  ✔ keeps user messages (0.067359ms)
  ✔ handles empty (0.047689ms)
  ✔ keeps assistant with no content and no tool_calls (0.064418ms)
✔ trimTrailingAssistantToolCalls (0.443091ms)
▶ isFoldValid
  ✔ returns false when not active (0.101428ms)
  ✔ returns true when fold active and prefix hash matches (0.048289ms)
  ✔ returns false when prefix hash mismatches (0.036489ms)
  ✔ returns true when fold is active and no prefix hash has been recorded (0.03162ms)
  ✔ returns true when fold is active and no system hash is supplied (0.036579ms)
✔ isFoldValid (0.334543ms)
▶ clearFold
  ✔ resets fold state (0.074988ms)
✔ clearFold (0.116137ms)
▶ captureBatches
  ✔ captures toolCall+toolResult pairs (0.606547ms)
  ✔ skips summarized IDs (0.100107ms)
  ✔ handles empty branch (0.095658ms)
  ✔ captures tool calls using function name as fallback id (0.146397ms)
  ✔ keeps delayed parallel tool results across intermediate assistant text (0.277034ms)
  ✔ splits multi-turn tool episodes when the dialogue gap reaches bridge length (0.212505ms)
  ✔ merges multi-turn tool episodes when the dialogue gap is inside bridge length (0.115887ms)
✔ captureBatches (1.733002ms)
▶ batch-capture helpers
  ✔ extractMessageContext collects reasoning, thinking, and text parts (0.166426ms)
  ✔ extractMessageContext truncates long content to the context cap (0.094558ms)
  ✔ extractMessageContext returns undefined for empty and null messages (0.078778ms)
  ✔ extractAssistantToolCalls supports camelCase and content-part formats (0.296184ms)
  ✔ extractAssistantToolCalls handles fallback ids, structured arguments, and numeric ids (0.123317ms)
  ✔ extractAssistantToolCalls returns an empty array when no tool calls exist (0.064179ms)
✔ batch-capture helpers (0.959169ms)
▶ captureTurnEndBatch
  ✔ returns zero when there are no assistant tool calls or no results (0.189296ms)
  ✔ captures matching results, call context, and skips mismatched or skipped ids (0.137757ms)
  ✔ formats result, lookup details, missing ids, and JSON fallback through captured results (0.174976ms)
  ✔ captures turn_end arrays and single toolResult events with alternate ids (0.117177ms)
  ✔ deduplicates against existing pending batches and skips empty results (0.129157ms)
✔ captureTurnEndBatch (0.859421ms)
▶ shouldTriggerPrune
  ✔ every-turn triggers with tools (0.151447ms)
  ✔ every-turn ignores batch threshold (0.058539ms)
  ✔ every-turn skips without tools (0.044019ms)
  ✔ agent-message triggers at threshold (0.04039ms)
  ✔ agent-message skips below threshold (0.039759ms)
  ✔ agent-message does not flush early on pure text replies (0.037829ms)
  ✔ checkpoint never auto-triggers without context_checkpoint (0.040039ms)
  ✔ on-demand never auto-triggers (0.062559ms)
  ✔ agentic-auto requires tools and threshold (0.054358ms)
  ✔ unknown modes default to hasTools (0.044889ms)
✔ shouldTriggerPrune (0.790643ms)
▶ decideAfterUsage
  ✔ none below threshold (0.146097ms)
  ✔ fold at 75% (0.075618ms)
  ✔ aggressive fold at 78% (0.052928ms)
  ✔ exit-with-summary at 80% (0.048109ms)
  ✔ already folded returns none (0.057468ms)
  ✔ no ctxMax returns none (0.042449ms)
✔ decideAfterUsage (0.615827ms)
▶ estimateTurnStart
  ✔ triggers at 90% (0.161926ms)
  ✔ no fold below 90% (0.070318ms)
  ✔ missing getContextUsage (0.038089ms)
  ✔ returns false when ratio is undefined (0.039319ms)
✔ estimateTurnStart (0.384662ms)
▶ decideCompaction
  ✔ holds when ratio is undefined (0.118138ms)
  ✔ hold when low usage (0.038789ms)
  ✔ fold at high ratio (0.029259ms)
  ✔ force_fold at critical (0.028919ms)
  ✔ fold when ratio above contextCompactPct regardless of hit rate (0.028269ms)
  ✔ hold when ratio below contextCompactPct (0.02704ms)
  ✔ folds at the exact 0.75 fallback threshold when hit rate is low (0.02697ms)
  ✔ still folds below the 0.75 fallback threshold once contextCompactPct is already exceeded (0.03945ms)
✔ decideCompaction (0.42893ms)
▶ readContextUsage
  ✔ reads promptTokens and maxTokens (0.085558ms)
  ✔ reads percent values above one as percentages (0.056139ms)
  ✔ reads pct values already in ratio form (0.050849ms)
  ✔ reads usedTokens and limit (0.047389ms)
  ✔ returns an empty object when getContextUsage throws (0.122397ms)
✔ readContextUsage (0.45129ms)
▶ zoneForRatio
  ✔ maps exact thresholds to the expected zones (0.125218ms)
  ✔ defaults undefined ratio to green (0.063249ms)
✔ zoneForRatio (0.256994ms)
▶ buildContextStatus
  ✔ green zone (0.221485ms)
  ✔ red zone (0.079168ms)
  ✔ critical zone (0.068559ms)
  ✔ no ratio (0.088288ms)
✔ buildContextStatus (0.560178ms)
▶ canCompactNow
  ✔ returns true when allowed (0.134117ms)
  ✔ blocks when at max compacts (0.071018ms)
  ✔ blocks when compact count exceeds the configured maximum (0.064878ms)
  ✔ allows compaction when no previous compact turn was recorded (0.091598ms)
✔ canCompactNow (0.46432ms)
▶ decisionLabel
  ✔ returns string for each action (0.438541ms)
✔ decisionLabel (0.489089ms)
▶ pruneMessages
  ✔ removes summarized tool results (0.339833ms)
  ✔ keeps unsummarized tool results (0.066499ms)
  ✔ deduplicates summary injection while removing raw results (0.193016ms)
  ✔ handles empty messages (0.069059ms)
  ✔ removes trailing orphan tool after pruning (0.104768ms)
✔ pruneMessages (0.879031ms)
▶ summarizeToolBatch
  ✔ returns an observation mask when pi has no complete function (2.170683ms)
  ✔ forces partial coverage when structured evidence is weak (1.936768ms)
  ✔ keeps complete coverage when metadata proves full read slice (0.570108ms)
✔ summarizeToolBatch (4.776166ms)
▶ registerAgenticTools
  ✔ registers context_checkpoint and context_rewind (0.752274ms)
✔ registerAgenticTools (0.804062ms)
▶ context_checkpoint execute
  ✔ returns error without session manager (0.527489ms)
✔ context_checkpoint execute (0.578497ms)
▶ context_rewind execute
  ✔ returns error without session manager (5.677206ms)
  ✖ uses model-visible envelope for hidden continuation summary (1.298991ms)
✖ context_rewind execute (7.102755ms)
▶ registerTimelineTool
  ✔ registers context_timeline (0.489089ms)
✔ registerTimelineTool (0.547468ms)
▶ context_timeline execute
  ✔ returns error without session manager (0.625407ms)
✔ context_timeline execute (0.670875ms)
▶ showDashboard
  ✔ warns when no context usage (0.320403ms)
  ✖ renders overlay dashboard with projected prune data, cache stats, model totals, risk, and pins (14.028145ms)
  ✖ falls back to flat notification when custom overlay is unavailable (0.811293ms)
  ✔ warns when usage shape lacks token and context window fields (0.343183ms)
  ✖ registerDashboardCommand registers /context and passes current state to showDashboard (0.864021ms)
✖ showDashboard (16.493941ms)
▶ commands
  ✔ getCacheCompletions filters subcommands and stops after whitespace (0.275184ms)
  ✖ registerCommands registers /context-engine and /prune handlers (2.653852ms)
  ✖ reset-stats command clears usage and opens a manual reset checkpoint (1.046647ms)
✖ commands (4.059941ms)
▶ compact tool renderers
  ✔ registers wrapped built-in renderers for read, bash, grep, find, and ls (0.428431ms)
  ✔ renders calls with command, path, pattern, home shortening, and defaults (0.200405ms)
  ✖ renders plain results collapsed, expanded, empty, and capped to forty lines (0.480599ms)
  ✔ hides model-visible evidence envelopes from UI while preserving output (0.997478ms)
  ✔ classifies non-npm test runners as test evidence (0.741544ms)
  ✔ distinguishes inventory counts and name-based reference scans from coverage proof (0.188616ms)
  ✔ delegates large-result rendering to HugeResultStore preview renderer (0.424101ms)
✖ compact tool renderers (3.595101ms)
▶ activateAppendOnlyProjectionFromCompact
  ✔ sets projection active with summary (0.106437ms)
  ✔ re-activates with new summary and clears stale invalidation (0.048159ms)
  ✔ skips activation when summary or tail start id is missing (0.040009ms)
  ✔ skips when appendOnlyProjection disabled (0.031179ms)
✔ activateAppendOnlyProjectionFromCompact (0.278374ms)
▶ applyAppendOnlyProjection
  ✔ returns undefined when projection inactive (0.097258ms)
  ✔ returns undefined when disabled (0.040449ms)
✔ applyAppendOnlyProjection (0.169326ms)
▶ t()
  ✔ falls back to default locale when locale missing (0.109108ms)
  ✔ interpolates variables (0.097968ms)
✔ t() (0.248534ms)
▶ ToolCallIndexer
  ✔ starts empty (0.055178ms)
  ✔ records and checks (0.042559ms)
  ✔ getRecord (0.104628ms)
  ✔ resets (0.085168ms)
✔ ToolCallIndexer (0.364512ms)
▶ hitRatio
  ✔ calculates ratio (0.052259ms)
  ✔ handles zero total (0.026509ms)
  ✔ includes cacheWrite in denominator (0.02426ms)
✔ hitRatio (0.146887ms)
▶ formatTokenCount
  ✔ formats zero (0.049309ms)
  ✔ formats hundreds without suffix (0.024179ms)
  ✔ formats millions (0.053309ms)
  ✔ formats thousands (0.045529ms)
  ✔ formats small numbers (0.025179ms)
✔ formatTokenCount (0.257805ms)
▶ formatRatio
  ✔ formats undefined as n/a (0.037369ms)
  ✔ formats zero as 0.0% (0.02361ms)
  ✔ formats fractional ratios with one decimal place (0.02332ms)
✔ formatRatio (0.119898ms)
▶ extractUsageSnapshot
  ✔ extracts from usage object (0.117978ms)
  ✔ accepts cache-only usage and returns hitRate 1 (0.065419ms)
  ✔ prefers top-level usage over nested message.usage and reads cost.total plus request id (0.049099ms)
  ✔ preserves finite negative numbers as-is and ignores usage arrays (0.036069ms)
  ✔ returns undefined for no usage (0.023719ms)
  ✔ returns undefined for null (0.021909ms)
✔ extractUsageSnapshot (0.375122ms)
▶ addUsage
  ✔ adds snapshot to stats (0.079308ms)
  ✔ handles undefined snapshot (0.029379ms)
  ✔ uses snapshot modelCost and explicit snapshot cost when present (0.058779ms)
  ✔ handles stats without compacts array (0.061808ms)
✔ addUsage (0.273604ms)
▶ savingsFromRealCost
  ✔ calculates savings (0.055808ms)
✔ savingsFromRealCost (0.076548ms)
▶ costToCompact
  ✔ returns 0 for undefined usage (0.073038ms)
  ✔ calculates cost (0.041579ms)
  ✔ returns zero without pricing and computes positive delta even for fully cached input (0.032789ms)
✔ costToCompact (0.182576ms)
▶ deepSeekOfficialCost
  ✔ returns flash pricing (0.04272ms)
  ✔ returns pro pricing (0.02501ms)
  ✔ treats chat, reasoner, and case-insensitive deepseek ids as flash pricing (0.030169ms)
  ✔ returns undefined for unknown (0.024429ms)
✔ deepSeekOfficialCost (0.160806ms)
▶ emptyStats
  ✔ returns zeroed stats (0.028569ms)
✔ emptyStats (0.046099ms)
▶ readConfig
  ✔ returns default config when no file exists (0.220315ms)
✔ readConfig (0.254374ms)
▶ defaultConfig
  ✔ has fold threshold (0.082358ms)
  ✔ has aggressive threshold (0.040949ms)
  ✔ has prune enabled by default (0.024919ms)
  ✔ has prune after agent response by default (0.02229ms)
  ✔ defers agent-message prune fallback until next user turn by default (0.02133ms)
✔ defaultConfig (0.248645ms)
▶ detectDeepSeekModel
  ✔ detects native DeepSeek (0.157627ms)
  ✔ detects compatible model (0.109327ms)
  ✔ detects non-DeepSeek (0.041339ms)
  ✔ handles undefined model (0.02985ms)
✔ detectDeepSeekModel (0.384251ms)
▶ recommendContextAction
  ✔ returns ok for low usage (0.109757ms)
  ✔ returns warn for medium usage (0.083898ms)
  ✔ returns danger for high usage (0.061229ms)
  ✔ handles undefined percent (0.070958ms)
✔ recommendContextAction (0.369992ms)
▶ inspectProviderPayload
  ✔ returns diagnostics for valid payload (0.200255ms)
  ✔ handles undefined (0.104858ms)
✔ inspectProviderPayload (0.339632ms)
▶ model-visible
  ✔ builds a model-visible block with metadata and named payload sections (0.160946ms)
  ✔ returns undefined when metadata JSON is invalid (0.057819ms)
  ✔ extracts payload names safely when the section name contains regex characters (0.060478ms)
✔ model-visible (0.319353ms)
▶ HugeResultStore
  ✔ stores and retrieves (0.092028ms)
  ✔ returns undefined for unknown ref (0.060089ms)
  ✔ records empty text and non-string tool metadata without losing byte/ref accounting (0.077239ms)
✔ HugeResultStore (0.346362ms)
▶ maybeCapToolResult
  ✔ passes through when disabled (0.081188ms)
  ✔ caps when above threshold (0.164366ms)
  ✔ handles undefined event (0.045319ms)
✔ maybeCapToolResult (0.343793ms)
▶ registerFoldTool
  ✔ registers context_cache_fold tool (0.256525ms)
  ✔ skips when already registered (0.043279ms)
✔ registerFoldTool (0.341543ms)
▶ holdCompaction
  ✔ sets holdUntilTurn (0.068649ms)
  ✔ uses the explicit turn override when provided (0.031519ms)
  ✔ holds for at least one turn even when zero is requested (0.025769ms)
✔ holdCompaction (0.169286ms)
▶ custom-compaction helpers
  ✔ estimateTokens handles nullish, strings, and structured values (0.080509ms)
  ✔ compactOptions injects fold instructions only when autoFold is enabled (0.096447ms)
  ✔ foldInstructions preserve current task state guidance and configured summary model (0.044429ms)
  ✔ maybeAdjustCutForCache leaves host boundary unchanged and empty compact is cancelled (0.101288ms)
✔ custom-compaction helpers (0.378521ms)
▶ auto-compact
  ✔ requestFold prefers semantic fold before ctx.compact (1.007298ms)
  ✔ requestFold falls back to native compact when semantic fold cannot run (0.408311ms)
  ✖ requestFold returns an error when semantic fold fails and native compact is unavailable (0.378491ms)
  ✔ requestFold handles native compact onError and still records the attempted compact (0.247195ms)
  ✔ requestFold handles native compact promise return (0.248655ms)
  ✔ requestFold handles native compact promise rejection (0.251194ms)
  ✔ requestFold catches native compact synchronous throws and records the attempt (0.189806ms)
  ✖ requestFold times out when native compact never completes (500.072312ms)
  ✔ requestCompact invokes native compact and records the compaction (0.618657ms)
  ✔ requestCompact records compact errors reported through onError and notifies (0.313664ms)
  ✔ requestCompact returns an error when native compact is unavailable (0.162967ms)
  ✔ requestCompact returns an error when native compact throws (0.120648ms)
  ✔ holdCompaction sets a hold window with default, custom, and zero turns (0.090288ms)
  ✔ handleTurnEnd flushes every-turn prune batches and rebuilds summarized context (2.204842ms)
  ✔ handleTurnEnd captures prune work but waits for final agent message in agent-message mode (0.412831ms)
  ✔ handleTurnEnd records auto-prune errors without breaking the context decision flow (0.304883ms)
  ✔ handleTurnEnd honors active hold window except for force-fold decisions (0.187345ms)
  ✔ handleTurnEnd shows choice notification for orange zones without auto-folding (0.360132ms)
  ✔ handleTurnEnd leaves green hold decisions quiet (0.163937ms)
  ✔ handleTurnEnd warns and keeps pending work when prune summary request cannot run (152.151005ms)
  ✔ handleAgentMessagePrune waits for threshold and final assistant reply (0.414511ms)
  ✔ handleAgentMessagePrune ignores disabled, wrong mode, non-assistant, and missing pending work (0.246915ms)
  ✔ handleAgentMessagePrune flushes pending batches on the final assistant message (0.797172ms)
[pi-context-engine] failed to read config: Unexpected token 'o', "not valid json" is not valid JSON
  ✔ handleAgentMessagePrune ignores concurrent flush attempts while one summary request is running (21.213808ms)
  ✔ handleAgentMessagePrune keeps batches appended while a flush is already in flight (1.025647ms)
  ✔ handleAgentMessagePrune snapshots flushing batches and removes only flushed tool call ids (0.634316ms)
  ✔ handleTurnEnd returns early when the extension is disabled (0.118768ms)
  ✔ handleTurnEnd triggers exit-with-summary fold without aborting the print run (0.475049ms)
  ✖ lifecycle handleBeforeAgentStart triggers preflight fold and still injects cache prompt (4.180329ms)
  ✔ lifecycle handleBeforeAgentStart skips preflight on first turn and avoids duplicate cache prompt (0.640746ms)
  ✖ lifecycle context projects active tool guidance without provider-payload nudge (11.109178ms)
  ✖ input detects analyze intent and before_agent_start returns persistent custom guidance (79.481428ms)
  ✖ input captures raw user intent before context injection (29.718052ms)
  ✖ before_agent_start detects user intent from prompt when input hooks did not capture it (12.327642ms)
  ✔ before_provider_request injects provider-safe system guidance, not custom role (1.231724ms)
  ✔ before_provider_request preserves tool-result adjacency by not appending system after tool (0.779203ms)
  ✔ before_provider_request fallback flushes agent-message prune and rewrites current payload (0.960789ms)
  ✔ before_provider_request does not prune agent-message batches by default (0.204415ms)
  ✔ before_agent_start flushes pending agent-message prune at a user-turn boundary (220.116184ms)
  ✔ lifecycle handleMessageEnd flushes agent-message prune when event is the assistant message itself (4.603919ms)
✖ auto-compact (1051.077337ms)
▶ registerPruneTool
  ✔ registers context_prune command (0.247475ms)
✔ registerPruneTool (0.333702ms)
▶ formatStats
  ✔ formats stats (0.203965ms)
✔ formatStats (0.248345ms)
▶ stableHash
  ✔ produces deterministic hash (0.125997ms)
  ✔ different inputs produce different hashes (0.094887ms)
✔ stableHash (0.272554ms)
▶ normalizeTools
  ✔ sorts tools by name (0.111138ms)
  ✔ handles undefined tools (0.045239ms)
✔ normalizeTools (0.203835ms)
▶ diffPrefix
  ✔ returns empty reasons for equal prefixes (0.101957ms)
  ✔ detects model change (0.058749ms)
✔ diffPrefix (0.202705ms)
▶ shouldNotifyPrefixDrift
  ✔ notifies on new reason (0.075698ms)
  ✔ suppresses same reason recently (0.034469ms)
✔ shouldNotifyPrefixDrift (0.146847ms)
▶ parseConfig
  ✔ merges partial config with defaults (0.119998ms)
  ✔ returns defaults for null (0.056668ms)
  ✔ parses percent as 0..1 from 0..100 (0.073789ms)
  ✔ returns defaults for non-object input (0.036639ms)
  ✔ keeps defaults for an empty object (0.069889ms)
  ✔ falls back and clamps invalid config values (0.083369ms)
✔ parseConfig (0.527218ms)
▶ writeConfig
  ✔ writes config to file (0.227935ms)
✔ writeConfig (0.265494ms)
▶ getContextPercent
  ✔ extracts from context usage (0.065078ms)
  ✔ returns undefined for null (0.039129ms)
  ✔ returns undefined for no usage (0.041339ms)
✔ getContextPercent (0.197675ms)
▶ formatPayloadDiagnostics
  ✔ formats diagnostics (0.594037ms)
  ✔ handles undefined (0.401041ms)
✔ formatPayloadDiagnostics (1.050667ms)
▶ extractToolResultText
  ✔ returns string as-is (0.104298ms)
  ✔ extracts from ContentPart[] (0.054439ms)
  ✔ returns undefined for non-array (0.061498ms)
  ✔ handles empty array (0.055788ms)
✔ extractToolResultText (0.420301ms)
▶ buildPreview
  ✔ builds preview string (0.581107ms)
  ✔ handles empty tail (0.143076ms)
✔ buildPreview (0.801393ms)
▶ captureBatches edge cases
  ✔ handles multi-turn tool sequences (0.275534ms)
  ✔ deduplicates repeated tool calls (0.150157ms)
  ✔ skips non-tool messages in branch (0.164197ms)
  ✔ ignores entries without messages and orphan tool results (0.101278ms)
  ✔ does not push batches when all calls are already skipped (0.120178ms)
  ✔ requires a non-empty matching result before pushing at branch end (0.117758ms)
  ✔ keeps only the latest bridge context window and caps bridge text (0.163097ms)
✔ captureBatches edge cases (1.305481ms)
▶ projection/rebuild
  ✔ messagesFromBranch skips prune-summary custom entries and normalizes non-array content (0.248695ms)
  ✔ collectPrunableToolResultIds returns only summarized tool result ids (0.254785ms)
  ✖ rebuildPrunedContext removes summarized tool results and opens one prune checkpoint (0.45406ms)
  ✔ rebuildPrunedContext is idempotent once summarized ids were already applied (0.252365ms)
  ✔ rebuildPrunedContextFromSession uses session branch entries as its source (0.232135ms)
✖ projection/rebuild (1.566936ms)
▶ projection/session-map
  ✔ returns an empty map for missing or irrelevant branch entries (1.677354ms)
  ✔ maps dialogue, tool batches, summaries, parent links, and lookup metadata (1.116496ms)
  ✔ keeps malformed lookup args unparsed and keeps mixed summarized batches non-droppable (0.431061ms)
  ✔ validates advisory model-directed prune suggestions without allowing unsafe drops (0.697695ms)
✔ projection/session-map (4.025252ms)
▶ context pin store persistence helpers
  ✔ computePinSetHash is stable across record ordering and changes with content hash (0.093408ms)
  ✔ PinStore preserves metadata across set, restore, and engine pin conversion (0.129577ms)
  ✔ persistPinEntry writes session custom entries and restorePinsFromSession accepts getEntries or getBranch (0.170146ms)
✔ context pin store persistence helpers (0.45858ms)
▶ applyAppendOnlyProjection edge cases
  ✔ applies projection when active and enabled (0.179906ms)
  ✔ returns tail only when stable summary is missing (0.094748ms)
  ✔ omits system message when there is no system entry (0.088008ms)
  ✔ handles empty messages while active (0.056619ms)
  ✔ tracks config changes by disabling projection when extension is disabled (0.04073ms)
✔ applyAppendOnlyProjection edge cases (0.554418ms)
▶ formatStatus
  ✔ formats status with context (0.139307ms)
✔ formatStatus (0.170906ms)
▶ status output
  ✖ buildStatus includes cache, prune progress, hashes, and 99 eligibility (1.382989ms)
  ✖ buildDetailedStatus includes config, cache details, checkpoint history, and compaction history (2.029406ms)
  ✖ formatPruneSummarizerTrace stays quiet until captured diagnostics exist (0.44483ms)
✖ status output (3.926245ms)
▶ buildProgressBar
  ✔ renders text style without a bar (0.076778ms)
  ✔ renders distinct block and sparkline styles (0.077659ms)
✔ buildProgressBar (0.198995ms)
▶ readConfig edge cases
  ✔ handles malformed JSON file gracefully (0.338442ms)
✔ readConfig edge cases (0.374172ms)
▶ parseConfig more
  ✔ handles 0..100 percent values (0.085888ms)
  ✔ handles out-of-range percent (0.053109ms)
✔ parseConfig more (0.180436ms)
▶ readContextPercent
  ✔ handles non-function ctx (0.057918ms)
  ✔ handles null ctx (0.035779ms)
✔ readContextPercent (0.134547ms)
▶ extractToolResultText more
  ✔ extracts from mixed ContentPart array (0.043469ms)
✔ extractToolResultText more (0.072148ms)
▶ computeHitRatio
  ✔ returns 0 for zero input (0.111707ms)
  ✔ calculates ratio (0.070889ms)
✔ computeHitRatio (0.219905ms)
▶ cacheSavingsUsd
  ✔ returns 0 for unknown model (0.132747ms)
  ✔ calculates savings for flash (0.067389ms)
✔ cacheSavingsUsd (0.253235ms)
▶ summarizeToolBatch edge cases
  ✔ summarizeToolBatchPool returns empty metrics for empty batches (0.119307ms)
  ✔ buildPoolPrompt omits context when includeContext is false and includes carry-forward inventory (0.165516ms)
  ✔ normalizes plain, empty, duplicate, lookup, and model-visible result shapes (0.206196ms)
  ✔ returns summary text when pi responds (0.400362ms)
  ✔ summarizeToolBatchPool parses JSON embedded in fences and response variants (0.357223ms)
  ✔ summarizeToolBatchPool reports empty and missing summary responses (0.344883ms)
  ✔ summarizeToolBatchPool handles abort and timeout errors as non-throwing failures (0.331043ms)
  ✔ summarizeToolBatchPool recovers malformed single-batch JSON summaries (0.42627ms)
  ✔ summarizeToolBatchPool does not use structured-looking malformed JSON as raw summary (0.233855ms)
  ✔ summarizeToolBatches preserves empty and single-batch wrapper behavior (0.210876ms)
✔ summarizeToolBatch edge cases (2.975096ms)
▶ markCompaction
  ✔ adds compact record (0.128287ms)
  ✔ resets sinceCompactionRequests without record and initializes missing compacts array (0.083138ms)
✔ markCompaction (0.259194ms)
▶ aggregateByModel
  ✔ uses unknown bucket and keeps first provider when later usages omit it (0.130357ms)
  ✔ retains pricing metrics when pricingKnown is true (0.127877ms)
✔ aggregateByModel (0.302693ms)
▶ aggregateBySegment
  ✔ uses unknown bucket and computes warmup-aware warmHitRate (0.225765ms)
✔ aggregateBySegment (0.259864ms)
▶ usageTotalInput
  ✔ calculates total input (0.105878ms)
  ✔ handles undefined (0.070268ms)
✔ usageTotalInput (0.233805ms)
▶ handleProviderPrefix edge cases
  ✔ returns undefined when disabled (0.092758ms)
  ✔ handles missing payload (0.182326ms)
✔ handleProviderPrefix edge cases (0.324033ms)
▶ captureBatches sequential assistants
  ✔ starts new batch on sequential assistants (0.155356ms)
  ✔ splits distant tool episodes into separate batches when bridge length is exceeded (0.132357ms)
✔ captureBatches sequential assistants (0.349972ms)
▶ getConfigPath
  ✔ returns path ending with context-engine.json (0.102008ms)
✔ getConfigPath (0.131837ms)
▶ detectSlashSkillInvocations
  ✔ detects /skill:name in text (3.088282ms)
  ✔ detects multiple skill invocations (0.179256ms)
  ✔ returns empty for text without skills (0.128358ms)
  ✔ handles hyphens in skill names (0.101528ms)
✔ detectSlashSkillInvocations (5.50429ms)
▶ recordSkillUse
  ✔ returns null on first use (0.337532ms)
  ✔ returns suggestion on second use (threshold) (0.235085ms)
  ✔ tracks separate counts per skill (2.662342ms)
✔ recordSkillUse (3.447825ms)
▶ checkForPinSuggestions
  ✔ returns no suggestions on first /skill use (0.247825ms)
  ✔ returns suggestion on second /skill use (0.176926ms)
✔ checkForPinSuggestions (0.608797ms)
▶ formatPinSuggestions
  ✔ returns empty string for empty list (0.174216ms)
  ✔ formats a single suggestion (0.112787ms)
  ✔ formats multiple suggestions on separate lines (0.075708ms)
✔ formatPinSuggestions (0.45932ms)
▶ resetSkillCounts
  ✔ clears usage counts (0.081318ms)
✔ resetSkillCounts (0.132987ms)
✔ buildDynamicModels assigns DeepSeek compat and thinking map (1.718182ms)
✔ fetchDeepSeekModelIds returns undefined without api key (0.294314ms)
✔ fetchDeepSeekModelIds reads /models with bearer key (1.046067ms)
✔ maybeRegisterDynamicProvider is off by default (0.524878ms)
✔ maybeRegisterDynamicProvider registers safe provider name by default (0.314663ms)
✔ maybeRegisterDynamicProvider only overrides deepseek when explicit (0.185666ms)
✔ command argument completions match Pi registerCommand docs (25.393637ms)
✔ extension factory follows Pi contract: accepts only pi and waits for event/command ctx (2.596313ms)
✔ extension ignores stale session ctx during restore/status refresh (1.37091ms)
✔ extension ignores stale pi appendEntry during async lifecycle (3.156061ms)
✔ extension skips lookup registration when hugeResultCapper is disabled (1.974967ms)
✔ extension registers dynamic provider with fallback model ids when enabled (2.30942ms)
✔ status command reports cache stats after message_end usage and notifies UI (3.728469ms)
✔ message_end reads Pi cache-aware cost without overriding message (5.211627ms)
✔ status and diagnose hit rates include cacheWrite in denominator (3.942964ms)
✔ before_agent_start injects cache prompt when enabled (4.13051ms)
✔ before_agent_start skips when cachePromptInjection is disabled (1.534536ms)
✔ before_agent_start skips duplicate cache prompt injection when marker already exists (1.237383ms)
✔ before_agent_start triggers preflight fold and warning when context is above threshold (2.577784ms)
✔ session_before_compact never returns placeholder compaction (1.125156ms)
✔ session_before_compact cancels empty host compaction (0.853161ms)
✔ red zone auto-folds by default (1.228373ms)
✔ green zone produces status only and no compact or warning (1.289323ms)
✔ yellow zone status shows turns estimate without compaction (1.945157ms)
✔ orange zone shows choice UI and does not compact (2.259171ms)
✔ critical zone auto-folds by default (2.893357ms)
✔ context prefix heuristic is quiet by default and warns only in strict mode (3.332598ms)
✔ provider prefix fingerprint is not polluted by context history heuristic (247.033497ms)
✔ fold tool registers by default (0.987488ms)
✔ end-to-end session auto-folds under pressure when hit rate is weak (2.571784ms)
✔ before_provider_request hashes real payload prefix, ignores tool order, and suppresses repeated drift spam (109.765608ms)
✔ tool_call blocks invalid args, normalizes read input, and suppresses duplicate storm (1.465248ms)
✔ manual fold and compact carry context-engine instructions (0.965879ms)
✔ compact request failure returns error without marking accepted request (1.068237ms)
✔ appendOnly projection activates after compact completion and invalidates on tail rewrite (1.908669ms)
✔ appendOnly projection stays inactive for invalid compact result and compact errors (1.695553ms)
✔ appendOnly projection disabled leaves context event untouched (1.382189ms)
✔ hold command suppresses warnings for configured turns (1.592125ms)
✔ message_end detects textual tool call without provider tool_calls (10.843224ms)
✔ usage is attributed to actual provider request model after model switch (2.156103ms)
✔ stable prefix session reaches 99% warm hit eligibility (4.538491ms)
✔ system drift warns once in strict mode and blocks 99 eligibility (1.693324ms)
✔ compact recovery records compact then later hit recovers (2.411957ms)
✔ e2e lifecycle covers session, prompt, context, provider, stats, turn, and host compact (2.180152ms)
✔ session_start restores usage stats from branch when telemetry is absent (1.279402ms)
✔ session_start refresh stays graceful when session branch lookup fails (1.213034ms)
✔ message_end ignores non-assistant messages while session_compact records host compaction (0.995309ms)
✔ e2e command flow covers init, status, diagnose, hold, fold, and reset-stats (2.645492ms)
✔ diagnose command includes read-only provider payload diagnostics (1.245282ms)
✔ reset-stats command clears accumulated telemetry (1.308611ms)
✔ enable-capper persists config without changing the model-visible tool list (1.227404ms)
✔ tool_result hook caps huge outputs by default (1.251043ms)
✔ tool_result hook does not cap context_result_lookup output again (0.719835ms)
✔ pruner advisor reads source settings for 99% eligibility (2.088784ms)
✔ every-turn pruner profile blocks 99 eligibility with prompt-cache churn reason (1.486997ms)
✔ good pruner profile keeps 99 eligibility possible when no other blockers exist (2.219781ms)
✔ all context-engine subcommands execute and notify (1.963108ms)
✔ manual prune shows start notification and warns when it cannot run (1.185184ms)
✔ decideAfterUsage: none below fold threshold (0.215195ms)
✔ decideAfterUsage: fold at 75% (0.106677ms)
✔ decideAfterUsage: aggressive fold at 78% (0.102068ms)
✔ decideAfterUsage: exit-with-summary at 80% (0.115328ms)
✔ decideAfterUsage: already folded this turn = none (0.085099ms)
✔ decideAfterUsage: no ctxMax = none (0.079089ms)
✔ estimateTurnStart: pre-flight fold at 90% (0.117418ms)
✔ estimateTurnStart: no fold below 90% (0.092738ms)
✔ three-tier decision: fold triggers at exact threshold boundaries (0.087188ms)
✔ pre-flight fold with readContextUsage fallback (0.089038ms)
✔ decideAfterUsage ratio is correctly reported (0.081408ms)
✔ all registered locales have full key coverage and no empty strings (4.203649ms)
✔ locale files do not contain model-facing promptSnippet copy (1.136425ms)
✔ locale json files stay normalized and key-sorted (3.298009ms)
✔ local runtime supports English, Russian, and Chinese without required SDK (0.736954ms)
✔ language env parsing preserves region and fixes Chinese (0.174046ms)
✔ intent vocabulary arrays resolve through locale parent and English fallback (0.319133ms)
✔ detectLocale reads rpiv config file before LANG (8.625602ms)
✔ detectLocale falls back to en when no locale source exists (0.344193ms)
✔ detectLocale reads LANG when no forced locale (0.345513ms)
✔ interpolation works and unknown keys fall back to key name (0.44581ms)
✔ Chinese locale aliases map to zh-CN (0.526769ms)
▶ buildPinInjectionBlock
  ✔ returns empty string when all injection disabled (0.695495ms)
  ✔ includes instructions block when skillPinning or priorityInjection enabled (0.238135ms)
  ✔ includes high-priority pins when priorityInjection enabled (0.175847ms)
  ✔ includes user-memory pins when memoryInjection enabled (0.164666ms)
  ✔ includes project-memory pins when memoryInjection enabled (0.147607ms)
✔ buildPinInjectionBlock (2.29444ms)
▶ computeInjectionHash
  ✔ returns deterministic hash (0.229945ms)
  ✔ changes when pins change (0.434931ms)
✔ computeInjectionHash (1.428129ms)
▶ applyPinInjection
  ✔ returns undefined when no injection (1.050627ms)
  ✔ returns systemPrompt with injection block (1.474848ms)
  ✔ appends to existing systemPrompt (1.534916ms)
✔ applyPinInjection (15.12774ms)
▶ ToolCallIndexer
  ✔ starts empty (0.744544ms)
  ✔ records tool calls (0.222515ms)
  ✔ returns records (0.104018ms)
  ✔ lists summarized (0.088938ms)
  ✔ resets (0.079738ms)
✔ ToolCallIndexer (2.150973ms)
▶ pruneMessages
  ✔ removes summarized tool results (0.373531ms)
  ✔ keeps unsummarized tool results (0.121417ms)
  ✔ keeps assistant tool-call blocks and removes repeated summarized raw results (0.197166ms)
  ✔ keeps contiguous assistant call sites while dropping summarized tool results (0.218575ms)
  ✔ keeps non-contiguous assistant call sites even when summarized tool results arrive later (0.141857ms)
  ✔ handles empty messages (0.083288ms)
✔ pruneMessages (1.38999ms)
▶ messagesFromBranch
  ✔ normalizes custom and summary entries to assistant-style content parts (0.662376ms)
✔ messagesFromBranch (0.728084ms)
▶ summarizeToolBatch
  ✔ normalizes capped model-visible tool results before sending them to the summarizer (0.88496ms)
  ✔ falls back to preview text when model-visible lookup payload contains only the lookup header (0.390491ms)
  ✔ drops duplicate-skip boilerplate from summarize input (0.084548ms)
  ✔ returns an observation mask when pi has no complete function (1.85839ms)
  ✔ accepts common structured summary field variants (1.41016ms)
  ✔ preserves coverage and evidence fields in accepted summaries (0.680225ms)
  ✔ does not duplicate coverage line when model already includes it in the summary body (0.371702ms)
  ✔ downgrades contradictory complete coverage labels when the summary itself describes skipped ranges (0.46376ms)
  ✔ recovers unstructured multi-batch response via per-batch retry instead of duplicating one response across all batches (1.082746ms)
  ✔ retries per-batch when multi-batch structured response is unusable (0.731504ms)
  ✔ sends reconstructed local context to the summarizer for each batch (0.779923ms)
  ✔ omits model-visible wrapper noise but keeps lookup metadata and recovered slice (0.90992ms)
  ✔ keeps context_result_lookup slice metadata for coverage checks (0.592877ms)
  ✔ does not leak call_context when includeContext=false and strips UI continuation banner text (0.527138ms)
  ✔ does not mark unfetched tail when metadata proves full slice despite UI continuation hint (0.407341ms)
  ✔ neutralizes numbered slice content for char-slice tool results (0.348973ms)
  ✔ keeps both head and tail samples for long read results instead of head-only truncation (0.522979ms)
  ✔ normalizes legacy lookup headers to explicit returned_chars and total_bytes names (0.128438ms)
  ✔ compacts oversized bash heredoc args while preserving target path hints (0.47101ms)
  ✔ deduplicates repeated identical tool results inside one summarize request (0.311123ms)
  ✔ glues repeated context_result_lookup slices by ref without duplicating already-seen content (0.642176ms)
  ✔ includes carry-forward inventory when later summarize requests continue after earlier ref batches (0.221246ms)
  ✔ serializes structured toolCall arguments from live content parts (0.180646ms)
✔ summarizeToolBatch (14.766098ms)
▶ captureBatches context
  ✔ extracts reasoning from live thinking content parts (0.175137ms)
  ✔ adds bridge context only after dialogue gaps between tool episodes (0.441581ms)
  ✔ keeps consecutive tool episodes in one local batch flow without dragging old bridge context (0.183176ms)
  ✔ caps distant bridge context to the most recent local window for broken-up tool batches (0.182956ms)
  ✔ splits batches when the dialogue bridge exceeds the configured bridge length (0.158417ms)
  ✔ preserves text payload from live toolResult arrays so the summarizer can normalize capped slices (0.152627ms)
✔ captureBatches context (1.436059ms)
▶ session map
  ✔ captures the whole session with tool batches and lookup metadata (0.959789ms)
✔ session map (1.007878ms)
▶ agentic tools registration
  ✔ registerAgenticTools registers context_checkpoint and context_rewind (0.374042ms)
  ✔ tools have descriptions (0.220695ms)
✔ agentic tools registration (0.670255ms)
▶ timeline tool registration
  ✔ registerTimelineTool registers context_timeline (0.412321ms)
✔ timeline tool registration (0.476429ms)
▶ dashboard command registration
  ✔ registerDashboardCommand registers /context (0.153217ms)
✔ dashboard command registration (0.201145ms)
▶ PinStore
  ✔ starts empty (7.158134ms)
  ✔ adds a pin (0.494229ms)
  ✔ returns false when adding unchanged pin (2.193642ms)
  ✔ returns true when pin content changes (0.338383ms)
  ✔ deduplicates by kind:scope:name (0.315024ms)
  ✔ get returns undefined for unknown pin (0.248744ms)
  ✔ get returns pin by kind+name (0.183626ms)
  ✔ getByKind returns matching pins (9.570811ms)
  ✔ remove returns true when removed, false when absent (0.689535ms)
  ✔ clear removes all pins (2.119554ms)
  ✔ getAll returns deterministic order (0.303473ms)
  ✔ clamps content to MAX_CONTENT_CHARS (0.512699ms)
  ✔ records createdAt and updatedAt (0.155147ms)
  ✔ updates updatedAt on change (0.112848ms)
  ✔ supports restore from persisted entry (0.158426ms)
  ✔ preserves priority field (0.115377ms)
  ✔ preserves source field (0.096977ms)
  ✔ toEnginePins returns ContextEnginePin[] with raw XML (0.138047ms)
  ✔ toEnginePins includes priority field when set (0.090488ms)
  ✔ combinedHash changes when pins change (0.116638ms)
  ✔ persist callback fires on set (0.122967ms)
  ✔ persist callback fires on update (0.135237ms)
  ✔ persist callback does not fire on no-op (0.115268ms)
✔ PinStore (27.124159ms)
▶ computeStableHash
  ✔ produces deterministic 8-char hex string (0.146016ms)
  ✔ differs when kind changes (0.066318ms)
  ✔ differs when content changes (0.186946ms)
✔ computeStableHash (0.523659ms)
▶ computePinSetHash
  ✔ returns '0' for empty array (0.085228ms)
  ✔ differs when records differ (0.068428ms)
✔ computePinSetHash (0.252994ms)
▶ countMessageTokens
  ✔ counts basic text content (chars/4) (0.676195ms)
  ✔ handles string content (0.161337ms)
  ✔ handles ContentPart[] array (0.111637ms)
  ✔ includes tool_calls JSON in token estimate (0.291993ms)
  ✔ returns 0 for null/undefined, 1 for empty object (role overhead) (0.136477ms)
  ✔ returns 1 token when only role is present (0.103198ms)
  ✔ ignores non-text multimodal and tool-use content parts (0.156387ms)
  ✔ handles very long content predictably (0.140997ms)
✔ countMessageTokens (2.770459ms)
▶ estimateFoldBoundary
  ✔ normal case: tail fits within budget (0.331483ms)
  ✔ returns ok=false when no messages (0.149836ms)
  ✔ skips fold when head too small (0.136117ms)
  ✔ keeps original tail boundary when preceding user would exceed 2x budget (0.085448ms)
  ✔ keeps original tail boundary when no preceding user exists (0.074049ms)
  ✔ puts all messages in tail when budget is very large (0.070939ms)
  ✔ keeps only zero-token tail when tail budget is zero (0.117998ms)
  ✔ works without user roles and reports exact boundary totals (0.623096ms)
✔ estimateFoldBoundary (2.165053ms)
▶ extractPinnedSkills
  ✔ extracts a single skill-pin block (0.314973ms)
  ✔ deduplicates by name (last wins) (0.099128ms)
  ✔ extracts multiple unique skills (0.085608ms)
  ✔ returns empty array when no skill-pins (0.072309ms)
  ✔ skips non-string content and tags with unsupported whitespace (0.097038ms)
✔ extractPinnedSkills (0.813133ms)
▶ extractContextEnginePins
  ✔ extracts a single context-engine-pin block (0.361862ms)
  ✔ extracts multiple context-engine-pins by kind (0.099768ms)
  ✔ deduplicates by kind:name (last wins) (0.153487ms)
  ✔ handles versionless context-engine-pin (0.081669ms)
  ✔ returns empty array when no context-engine-pins (0.084898ms)
  ✔ does not confuse with legacy skill-pin tags (0.103228ms)
  ✔ handles empty, non-ASCII, and nested XML-like pin content (0.330753ms)
✔ extractContextEnginePins (1.413599ms)
▶ extractPinnedConstraints
  ✔ finds HIGH PRIORITY blocks (0.357142ms)
  ✔ finds User memory blocks (0.198186ms)
  ✔ finds Project memory blocks (0.125157ms)
  ✔ returns empty when no constraints (0.354022ms)
  ✔ collects multiple bracket and markdown constraints (0.114018ms)
✔ extractPinnedConstraints (1.335081ms)
▶ buildFoldMessage
  ✔ includes marker + summary + skills + constraints + enginePins sections (0.283174ms)
  ✔ omits enginePins section when empty (0.071568ms)
  ✔ omits skills section when empty (0.113928ms)
  ✔ omits constraints section when empty (0.071999ms)
  ✔ has empty reasoning_content to avoid 400 (0.075469ms)
  ✔ has assistant role (0.088948ms)
  ✔ keeps engine pins before legacy skill pins (0.480839ms)
✔ buildFoldMessage (1.856989ms)
▶ extractSessionIntent
  ✔ keeps first user goal and later explicit constraints within budget (0.390571ms)
✔ extractSessionIntent (0.46421ms)
▶ trimTrailingAssistantToolCalls
  ✔ drops trailing assistant message with tool_calls (0.374532ms)
  ✔ keeps messages unchanged when last is user (0.097598ms)
  ✔ handles empty array (0.082688ms)
  ✔ keeps assistant message without tool_calls (0.139027ms)
  ✔ keeps assistant with an empty tool_calls array (0.082798ms)
✔ trimTrailingAssistantToolCalls (0.935519ms)
▶ summarizeHead
  ✔ returns trimmed string responses (0.49379ms)
  ✔ returns trimmed object content responses (0.139717ms)
  ✔ returns empty string when complete returns null (0.126778ms)
  ✔ returns empty string on AbortError (0.280344ms)
  ✔ returns empty string on TimeoutError (0.188916ms)
  ✔ returns trimmed nested message content responses and passes the provided signal (0.257974ms)
  ✔ rethrows non-timeout errors (0.381901ms)
  ✔ truncates long message content to 2000 chars in the prompt (1.136265ms)
✔ summarizeHead (3.244309ms)
▶ semanticFold integration
  ✔ exports all expected functions (0.169206ms)
  ✔ semanticFold returns ok=false when no ctxMax (0.213965ms)
  ✔ semanticFold returns ok=false when session branch cannot be read (0.157666ms)
  ✔ semanticFold returns ok=false for an empty branch (0.106197ms)
  ✔ semanticFold returns ok=false when trimming trailing tool calls leaves no messages (0.180916ms)
  ✔ semanticFold returns ok=false when the fold head is below min savings (0.127647ms)
  ✔ semanticFold returns ok=false when summarizer returns empty (0.611067ms)
  ✔ semanticFold propagates non-timeout summarizer errors (0.374532ms)
  ✔ semanticFold succeeds and persists fold state (0.331463ms)
  ✔ semanticFold preserves prior intent nudges in synthetic guidance (0.879791ms)
  ✔ semanticFold reads persisted user-intent custom entries (0.400042ms)
  ✔ semanticFold reads persisted tool-intent custom entries (0.339132ms)
  ✔ semanticFold uses explicit summary model and computes ctxAfterPct (0.263134ms)
  ✔ clearFold resets fold state (0.084958ms)
  ✔ isFoldValid returns false when inactive (0.075399ms)
  ✔ isFoldValid returns false on hash mismatch (0.059519ms)
  ✔ isFoldValid returns true when hash matches (0.059888ms)
✔ semanticFold integration (4.911263ms)
▶ parseFrontmatter
  ✔ extracts name and description from frontmatter (0.765173ms)
  ✔ returns full content as body when no frontmatter (0.627136ms)
  ✔ handles empty frontmatter block (0.152437ms)
✔ parseFrontmatter (2.327699ms)
▶ discoverSkills
  ✔ discovers skills from project roots (3.785437ms)
  ✔ findSkill returns skill by name (1.577166ms)
  ✔ loadSkillAsPin returns pinned XML (0.474379ms)
  ✔ returns null for unknown skill (0.366962ms)
  ✔ findSkill returns undefined for unknown (0.325873ms)
✔ discoverSkills (7.431208ms)
ℹ tests 687
ℹ suites 123
ℹ pass 669
ℹ fail 18
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 2329.872679

✖ failing tests:

test at tests/coverage.test.mjs:884:2
✖ uses model-visible envelope for hidden continuation summary (1.298991ms)
  AssertionError [ERR_ASSERTION]: Expected values to be strictly equal:
  + actual - expected
  
  + 'откат запущен'
  - 'rewind start'
  
      at TestContext.<anonymous> (file:///home/chez/projects/pi-extensions/pi-context-engine/tests/coverage.test.mjs:903:10)
      at async Test.run (node:internal/test_runner/test:1208:7)
      at async Suite.processPendingSubtests (node:internal/test_runner/test:831:7) {
    generatedMessage: true,
    code: 'ERR_ASSERTION',
    actual: 'откат запущен',
    expected: 'rewind start',
    operator: 'strictEqual',
    diff: 'simple'
  }

test at tests/coverage.test.mjs:1011:2
✖ renders overlay dashboard with projected prune data, cache stats, model totals, risk, and pins (14.028145ms)
  AssertionError [ERR_ASSERTION]: The input did not match the regular expression /Context Usage/. Input:
  
  '┌──────────────────────────────────────────────────────────────────────────────────────────────────┐\n' +
    '│   Использование контекста                                                                        │\n' +
    '│                                                                                                  │\n' +
    '│      Модель:  deepseek/deepseek-v4-flash                                                         │\n' +
    '│                                                                                                  │\n' +
    '│      0% │━━━·············································│ 100%                                  │\n' +
    '│      142 занято • 19.9K свободно                                                                 │\n' +
    '│                                                                                                  │\n' +
    '│        Всего использовано     142      (  0.7%)                                                  │\n' +
    '│      ▌ Системный промпт       4        (  0.0%)                                                  │\n' +
    '│      ▌ Инструменты            19       (  0.1%)                                                  │\n' +
    '│      ▌ Вызовы/Результаты      0        (  0.0%)                                                  │\n' +
    '│      ▌ Сообщения              119      (  0.6%)                                                  │\n' +
    '│      · Доступно               19.9K    ( 99.3%)                                                  │\n' +
    '│                                                                                                  │\n' +
    '│   ────────────────────────────────────────                                                       │\n' +
    '│  Статистика кэша                                                                                 │\n' +
    '│   Попадания:  █████████████░ попаданий 90.0% · промахов 10.0% · последний 90.0%                  │\n' +
    '│   Токены:  из кэша 900 · без кэша 100 · вывод 20                                                 │\n' +
    '│   Стоимость:  факт $0.0005 · ходы $0.0000 · prune $0.0005 · промах после prune $0.0000 · без     │\n' +
    '│ кэша $0.0001 · экономия -$0.0004                                                                 │\n' +
    '│     miss после prune уже входит в ходы; экономия вычитает сводки и miss-impact                   │\n' +
    '│     сводки prune: 1 зап. · ввод 100 · кэш 0 · вывод 20 · попаданий 0.0% · $0.0005                │\n' +
    '│     Экономия = без кэша − факт − расходы очистки. · 1 запросов                                   │\n' +
    '│   Текущий сегмент:  #1 · session_start · 1 запросов · попаданий 90.0% · прогрев 90.0%            │\n' +
    '│   Очистка:  режим после пачки ответов · копит пачку · очередь 1/1 · следующий запуск через 1     │\n' +
    '│ шагов                                                                                            │\n' +
    '│     применено 1/1, ждёт 0                                                                        │\n' +
    '│     tool-results 2k->200 · минус 1.8k · 1 зап. · $0.0005                                         │\n' +
    '│     пересборка 5->3 сообщ. · убрать 1 · новых 1 · минус ~1.8k · checkpoint да                    │\n' +
    '│     после prune: 1 зап. · промах 10 · кэш 50 · $0.0000 · посл. $0.0000 · попаданий 90.0%         │\n' +
    '│ ↑/↓ 1-30/41                                                                                      │\n' +
    '└──────────────────────────────────────────────────────────────────────────────────────────────────┘'
  
      at TestContext.<anonymous> (file:///home/chez/projects/pi-extensions/pi-context-engine/tests/coverage.test.mjs:1033:10)
      at async Test.run (node:internal/test_runner/test:1208:7)
      at async Suite.processPendingSubtests (node:internal/test_runner/test:831:7) {
    generatedMessage: true,
    code: 'ERR_ASSERTION',
    actual: '┌──────────────────────────────────────────────────────────────────────────────────────────────────┐\n│   Использование контекста                                                                        │\n│                                                                                                  │\n│      Модель:  deepseek/deepseek-v4-flash                                                         │\n│                                                                                                  │\n│      0% │━━━·············································│ 100%                                  │\n│      142 занято • 19.9K свободно                                                                 │\n│                                                                                                  │\n│        Всего использовано     142      (  0.7%)                                                  │\n│      ▌ Системный промпт       4        (  0.0%)                                                  │\n│      ▌ Инструменты            19       (  0.1%)                                                  │\n│      ▌ Вызовы/Результаты      0        (  0.0%)                                                  │\n│      ▌ Сообщения              119      (  0.6%)                                                  │\n│      · Доступно               19.9K    ( 99.3%)                                                  │\n│                                                                                                  │\n│   ────────────────────────────────────────                                                       │\n│  Статистика кэша                                                                                 │\n│   Попадания:  █████████████░ попаданий 90.0% · промахов 10.0% · последний 90.0%                  │\n│   Токены:  из кэша 900 · без кэша 100 · вывод 20                                                 │\n│   Стоимость:  факт $0.0005 · ходы $0.0000 · prune $0.0005 · промах после prune $0.0000 · без     │\n│ кэша $0.0001 · экономия -$0.0004                                                                 │\n│     miss после prune уже входит в ходы; экономия вычитает сводки и miss-impact                   │\n│     сводки prune: 1 зап. · ввод 100 · кэш 0 · вывод 20 · попаданий 0.0% · $0.0005                │\n│     Экономия = без кэша − факт − расходы очистки. · 1 запросов                                   │\n│   Текущий сегмент:  #1 · session_start · 1 запросов · попаданий 90.0% · прогрев 90.0%            │\n│   Очистка:  режим после пачки ответов · копит пачку · очередь 1/1 · следующий запуск через 1     │\n│ шагов                                                                                            │\n│     применено 1/1, ждёт 0                                                                        │\n│     tool-results 2k->200 · минус 1.8k · 1 зап. · $0.0005                                         │\n│     пересборка 5->3 сообщ. · убрать 1 · новых 1 · минус ~1.8k · checkpoint да                    │\n│     после prune: 1 зап. · промах 10 · кэш 50 · $0.0000 · посл. $0.0000 · попаданий 90.0%         │\n│ ↑/↓ 1-30/41                                                                                      │\n└──────────────────────────────────────────────────────────────────────────────────────────────────┘',
    expected: /Context Usage/,
    operator: 'match',
    diff: 'simple'
  }

test at tests/coverage.test.mjs:1043:2
✖ falls back to flat notification when custom overlay is unavailable (0.811293ms)
  AssertionError [ERR_ASSERTION]: The input did not match the regular expression /Context Usage/. Input:
  
  '── Использование контекста ──\n' +
    '  Всего использовано: 138 (0.7%)\n' +
    '  Системный промпт       4 (0.0%)\n' +
    '  Инструменты         15 (0.1%)\n' +
    '  Вызовы/Результаты       0 (0.0%)\n' +
    '  Сообщения          119 (0.6%)\n' +
    '  Доступно         19.9K (99.3%)\n' +
    '\n' +
    '  Попадания:: 90.0% · Экономия:: $0.0001'
  
      at TestContext.<anonymous> (file:///home/chez/projects/pi-extensions/pi-context-engine/tests/coverage.test.mjs:1052:10)
      at async Test.run (node:internal/test_runner/test:1208:7)
      at async Suite.processPendingSubtests (node:internal/test_runner/test:831:7) {
    generatedMessage: true,
    code: 'ERR_ASSERTION',
    actual: '── Использование контекста ──\n  Всего использовано: 138 (0.7%)\n  Системный промпт       4 (0.0%)\n  Инструменты         15 (0.1%)\n  Вызовы/Результаты       0 (0.0%)\n  Сообщения          119 (0.6%)\n  Доступно         19.9K (99.3%)\n\n  Попадания:: 90.0% · Экономия:: $0.0001',
    expected: /Context Usage/,
    operator: 'match',
    diff: 'simple'
  }

test at tests/coverage.test.mjs:1067:2
✖ registerDashboardCommand registers /context and passes current state to showDashboard (0.864021ms)
  AssertionError [ERR_ASSERTION]: The input did not match the regular expression /Context Usage/. Input:
  
  '── Использование контекста ──\n' +
    '  Всего использовано: 124 (0.6%)\n' +
    '  Системный промпт       4 (0.0%)\n' +
    '  Инструменты          1 (0.0%)\n' +
    '  Вызовы/Результаты       0 (0.0%)\n' +
    '  Сообщения          119 (0.6%)\n' +
    '  Доступно         19.9K (99.4%)\n' +
    '\n' +
    '  Попадания:: 90.0% · Экономия:: $0.0001'
  
      at TestContext.<anonymous> (file:///home/chez/projects/pi-extensions/pi-context-engine/tests/coverage.test.mjs:1079:10)
      at async Test.run (node:internal/test_runner/test:1208:7)
      at async Suite.processPendingSubtests (node:internal/test_runner/test:831:7) {
    generatedMessage: true,
    code: 'ERR_ASSERTION',
    actual: '── Использование контекста ──\n  Всего использовано: 124 (0.6%)\n  Системный промпт       4 (0.0%)\n  Инструменты          1 (0.0%)\n  Вызовы/Результаты       0 (0.0%)\n  Сообщения          119 (0.6%)\n  Доступно         19.9K (99.4%)\n\n  Попадания:: 90.0% · Экономия:: $0.0001',
    expected: /Context Usage/,
    operator: 'match',
    diff: 'simple'
  }

test at tests/coverage.test.mjs:1092:2
✖ registerCommands registers /context-engine and /prune handlers (2.653852ms)
  AssertionError [ERR_ASSERTION]: The input did not match the regular expression /Context cache/. Input:
  
  'Кэш контекста\n' +
    '  Модель: deepseek/deepseek-v4-flash ⚠\n' +
    '  Кэш: данных об использовании ещё нет\n' +
    '  Контекст: 12% ✓\n' +
    '  prune после пачки ответов: 0 раз · сводок 0 · прим. 0 · ждёт 0 · очередь 0/0 · след. через 5 ответ. · 0/5\n' +
    '  Сводки prune: 0 зап. · 0 ток. · $0.0000 · посл. $0.0000\n' +
    '  Срез tool-results: 0->0 · минус до 0 · посл. 0->0\n' +
    '  После prune: 0 зап. · промах 0 · кэш 0 · $0.0000 · посл. $0.0000 · попаданий n/a\n' +
    '  Повторные чтения после сжатия: поиск 0 · чтение 0 · чтение после свёртки 0\n' +
    '  Сохранено при prune: 0 групп · 0 tools · последний 0/0\n' +
    '  No-op: 0 выз. · последний 0\n' +
    '  Контр. точки: 1 · сегменты 1\n' +
    '  Пины: 0 · хеш 0\n' +
    '  Движок: изменений префикса 0 · перезаписей истории 0\n' +
    '  Хэш префикса: неизвестно · хэш инструментов: неизвестно · изменений инструментов: 0 · последняя причина: не указано\n' +
    '  Последнее предупреждение о префиксе на ходе не указано · подавлено: нет\n' +
    '  Проекция AppendOnly: выключено · хвост не указано · инвалидация: не указано\n' +
    '  99% возможно: префикс стабилен, инструменты стабильны, профиль очистки приемлем, прогретая доля попаданий не указано'
  
      at TestContext.<anonymous> (file:///home/chez/projects/pi-extensions/pi-context-engine/tests/coverage.test.mjs:1117:10)
      at async Test.run (node:internal/test_runner/test:1208:7)
      at async Suite.processPendingSubtests (node:internal/test_runner/test:831:7) {
    generatedMessage: true,
    code: 'ERR_ASSERTION',
    actual: 'Кэш контекста\n  Модель: deepseek/deepseek-v4-flash ⚠\n  Кэш: данных об использовании ещё нет\n  Контекст: 12% ✓\n  prune после пачки ответов: 0 раз · сводок 0 · прим. 0 · ждёт 0 · очередь 0/0 · след. через 5 ответ. · 0/5\n  Сводки prune: 0 зап. · 0 ток. · $0.0000 · посл. $0.0000\n  Срез tool-results: 0->0 · минус до 0 · посл. 0->0\n  После prune: 0 зап. · промах 0 · кэш 0 · $0.0000 · посл. $0.0000 · попаданий n/a\n  Повторные чтения после сжатия: поиск 0 · чтение 0 · чтение после свёртки 0\n  Сохранено при prune: 0 групп · 0 tools · последний 0/0\n  No-op: 0 выз. · последний 0\n  Контр. точки: 1 · сегменты 1\n  Пины: 0 · хеш 0\n  Движок: изменений префикса 0 · перезаписей истории 0\n  Хэш префикса: неизвестно · хэш инструментов: неизвестно · изменений инструментов: 0 · последняя причина: не указано\n  Последнее предупреждение о префиксе на ходе не указано · подавлено: нет\n  Проекция AppendOnly: выключено · хвост не указано · инвалидация: не указано\n  99% возможно: префикс стабилен, инструменты стабильны, профиль очистки приемлем, прогретая доля попаданий не указано',
    expected: /Context cache/,
    operator: 'match',
    diff: 'simple'
  }

test at tests/coverage.test.mjs:1125:2
✖ reset-stats command clears usage and opens a manual reset checkpoint (1.046647ms)
  AssertionError [ERR_ASSERTION]: The input did not match the regular expression /reset/i. Input:
  
  'Статистика кэша контекста сброшена.'
  
      at TestContext.<anonymous> (file:///home/chez/projects/pi-extensions/pi-context-engine/tests/coverage.test.mjs:1149:10)
      at async Test.run (node:internal/test_runner/test:1208:7)
      at async Suite.processPendingSubtests (node:internal/test_runner/test:831:7) {
    generatedMessage: true,
    code: 'ERR_ASSERTION',
    actual: 'Статистика кэша контекста сброшена.',
    expected: /reset/i,
    operator: 'match',
    diff: 'simple'
  }

test at tests/coverage.test.mjs:1187:2
✖ renders plain results collapsed, expanded, empty, and capped to forty lines (0.480599ms)
  AssertionError [ERR_ASSERTION]: The input did not match the regular expression /first \(3 lines\)/. Input:
  
  'first (3 строк)'
  
      at TestContext.<anonymous> (file:///home/chez/projects/pi-extensions/pi-context-engine/tests/coverage.test.mjs:1192:10)
      at Test.runInAsyncScope (node:async_hooks:226:14)
      at Test.run (node:internal/test_runner/test:1201:25)
      at Suite.processPendingSubtests (node:internal/test_runner/test:831:18)
      at Test.postRun (node:internal/test_runner/test:1330:19)
      at Test.run (node:internal/test_runner/test:1258:12)
      at async Suite.processPendingSubtests (node:internal/test_runner/test:831:7) {
    generatedMessage: true,
    code: 'ERR_ASSERTION',
    actual: 'first (3 строк)',
    expected: /first \(3 lines\)/,
    operator: 'match',
    diff: 'simple'
  }

test at tests/coverage.test.mjs:1825:2
✖ requestFold returns an error when semantic fold fails and native compact is unavailable (0.378491ms)
  AssertionError [ERR_ASSERTION]: The input did not match the regular expression /context limit/i. Input:
  
  'Лимит контекста недоступен'
  
      at TestContext.<anonymous> (file:///home/chez/projects/pi-extensions/pi-context-engine/tests/coverage.test.mjs:1830:10)
      at async Test.run (node:internal/test_runner/test:1208:7)
      at async Suite.processPendingSubtests (node:internal/test_runner/test:831:7) {
    generatedMessage: true,
    code: 'ERR_ASSERTION',
    actual: 'Лимит контекста недоступен',
    expected: /context limit/i,
    operator: 'match',
    diff: 'simple'
  }

test at tests/coverage.test.mjs:1901:2
✖ requestFold times out when native compact never completes (500.072312ms)
  AssertionError [ERR_ASSERTION]: Expected values to be strictly equal:
  + actual - expected
  
  + 'таймаут сжатия'
  - 'compact timeout'
  
      at TestContext.<anonymous> (file:///home/chez/projects/pi-extensions/pi-context-engine/tests/coverage.test.mjs:1914:10)
      at async Test.run (node:internal/test_runner/test:1208:7)
      at async Suite.processPendingSubtests (node:internal/test_runner/test:831:7) {
    generatedMessage: true,
    code: 'ERR_ASSERTION',
    actual: 'таймаут сжатия',
    expected: 'compact timeout',
    operator: 'strictEqual',
    diff: 'simple'
  }

test at tests/coverage.test.mjs:2378:2
✖ lifecycle handleBeforeAgentStart triggers preflight fold and still injects cache prompt (4.180329ms)
  AssertionError [ERR_ASSERTION]: The expression evaluated to a falsy value:
  
    assert.ok(notices.some((notice) => notice.level === "warning" && /pre-flight fold triggered/i.test(notice.text)))
  
      at TestContext.<anonymous> (file:///home/chez/projects/pi-extensions/pi-context-engine/tests/coverage.test.mjs:2406:10)
      at async Test.run (node:internal/test_runner/test:1208:7)
      at async Suite.processPendingSubtests (node:internal/test_runner/test:831:7) {
    generatedMessage: true,
    code: 'ERR_ASSERTION',
    actual: false,
    expected: true,
    operator: '==',
    diff: 'simple'
  }

test at tests/coverage.test.mjs:2432:2
✖ lifecycle context projects active tool guidance without provider-payload nudge (11.109178ms)
  AssertionError [ERR_ASSERTION]: Expected values to be strictly equal:
  
  'system' !== 'custom'
  
      at TestContext.<anonymous> (file:///home/chez/projects/pi-extensions/pi-context-engine/tests/coverage.test.mjs:2456:10)
      at async Test.run (node:internal/test_runner/test:1208:7)
      at async Suite.processPendingSubtests (node:internal/test_runner/test:831:7) {
    generatedMessage: true,
    code: 'ERR_ASSERTION',
    actual: 'system',
    expected: 'custom',
    operator: 'strictEqual',
    diff: 'simple'
  }

test at tests/coverage.test.mjs:2473:2
✖ input detects analyze intent and before_agent_start returns persistent custom guidance (79.481428ms)
  AssertionError [ERR_ASSERTION]: Expected values to be strictly equal:
  + actual - expected
  
  + undefined
  - 'context-engine-guidance'
  
      at TestContext.<anonymous> (file:///home/chez/projects/pi-extensions/pi-context-engine/tests/coverage.test.mjs:2493:11)
      at async Test.run (node:internal/test_runner/test:1208:7)
      at async Suite.processPendingSubtests (node:internal/test_runner/test:831:7) {
    generatedMessage: true,
    code: 'ERR_ASSERTION',
    actual: undefined,
    expected: 'context-engine-guidance',
    operator: 'strictEqual',
    diff: 'simple'
  }

test at tests/coverage.test.mjs:2517:2
✖ input captures raw user intent before context injection (29.718052ms)
  AssertionError [ERR_ASSERTION]: Expected values to be strictly equal:
  + actual - expected
  
  + undefined
  - 'context-engine-guidance'
  
      at TestContext.<anonymous> (file:///home/chez/projects/pi-extensions/pi-context-engine/tests/coverage.test.mjs:2535:11)
      at async Test.run (node:internal/test_runner/test:1208:7)
      at async Suite.processPendingSubtests (node:internal/test_runner/test:831:7) {
    generatedMessage: true,
    code: 'ERR_ASSERTION',
    actual: undefined,
    expected: 'context-engine-guidance',
    operator: 'strictEqual',
    diff: 'simple'
  }

test at tests/coverage.test.mjs:2542:2
✖ before_agent_start detects user intent from prompt when input hooks did not capture it (12.327642ms)
  AssertionError [ERR_ASSERTION]: Expected values to be strictly equal:
  + actual - expected
  
  + undefined
  - 'context-engine-guidance'
  
      at TestContext.<anonymous> (file:///home/chez/projects/pi-extensions/pi-context-engine/tests/coverage.test.mjs:2558:11)
      at async Test.run (node:internal/test_runner/test:1208:7)
      at async Suite.processPendingSubtests (node:internal/test_runner/test:831:7) {
    generatedMessage: true,
    code: 'ERR_ASSERTION',
    actual: undefined,
    expected: 'context-engine-guidance',
    operator: 'strictEqual',
    diff: 'simple'
  }

test at tests/coverage.test.mjs:3069:2
✖ rebuildPrunedContext removes summarized tool results and opens one prune checkpoint (0.45406ms)
  AssertionError [ERR_ASSERTION]: The input did not match the regular expression /compressed tool context/. Input:
  
  '<context-engine-summary>\n' +
    'This is an advisory summary replacing old tool calls/results. It is not proof of current workspace state.\n' +
    'If the body contains "Coverage: complete", it only describes the summarizer input batch.\n' +
    'Before making exhaustive claims, re-check current files.\n' +
    'Use this only as factual background.\n' +
    'INSTRUCTION: This is an internal metadata block. Do not output this format, tag, or style in your response.\n' +
    'summary text'
  
      at TestContext.<anonymous> (file:///home/chez/projects/pi-extensions/pi-context-engine/tests/coverage.test.mjs:3087:10)
      at Test.runInAsyncScope (node:async_hooks:226:14)
      at Test.run (node:internal/test_runner/test:1201:25)
      at Suite.processPendingSubtests (node:internal/test_runner/test:831:18)
      at Test.postRun (node:internal/test_runner/test:1330:19)
      at Test.run (node:internal/test_runner/test:1258:12)
      at async Suite.processPendingSubtests (node:internal/test_runner/test:831:7) {
    generatedMessage: true,
    code: 'ERR_ASSERTION',
    actual: '<context-engine-summary>\nThis is an advisory summary replacing old tool calls/results. It is not proof of current workspace state.\nIf the body contains "Coverage: complete", it only describes the summarizer input batch.\nBefore making exhaustive claims, re-check current files.\nUse this only as factual background.\nINSTRUCTION: This is an internal metadata block. Do not output this format, tag, or style in your response.\nsummary text',
    expected: /compressed tool context/,
    operator: 'match',
    diff: 'simple'
  }

test at tests/coverage.test.mjs:3426:2
✖ buildStatus includes cache, prune progress, hashes, and 99 eligibility (1.382989ms)
  AssertionError [ERR_ASSERTION]: The input did not match the regular expression /Context cache/. Input:
  
  'Кэш контекста\n' +
    '  Модель: deepseek/deepseek-v4-flash ✓\n' +
    '  Кэш: 90.0% сессия / 90.0% последний · из кэша 900 · без кэша 100 · $0.000024\n' +
    '  Контекст: 42% ✓\n' +
    '  prune после пачки ответов: 1 раз · сводок 2 · прим. 1 · ждёт 1 · очередь 1/1 · след. через 1 ответ. · 1/2\n' +
    '  Сводки prune: 2 зап. · 1.2k ток. · $0.0034 · посл. $0.0012\n' +
    '  Срез tool-results: 10k->400 · минус до 9.6k · посл. 10k->400\n' +
    '  Пересборка: 5->3 сообщ. · убрать 2 · новых 1 · минус ~1.8k · checkpoint да · автоматическая очистка\n' +
    '  После prune: 1 зап. · промах 50 · кэш 500 · $0.0004 · посл. $0.0004 · попаданий 95.0%\n' +
    '  Повторные чтения после сжатия: поиск 0 · чтение 0 · чтение после свёртки 0\n' +
    '  Сохранено при prune: 0 групп · 0 tools · последний 0/0\n' +
    '  No-op: 3 выз. · последний 1\n' +
    '  Ошибка очистки: запрос сводки не удался\n' +
    '  Контр. точки: 1 · сегменты 1\n' +
    '  Пины: 0 · хеш 0\n' +
    '  Движок: изменений префикса 0 · перезаписей истории 0\n' +
    '  Хэш префикса: abcdef123456 · хэш инструментов: fedcba098765 · изменений инструментов: 0 · последняя причина: не указано\n' +
    '  Последнее предупреждение о префиксе на ходе не указано · подавлено: нет\n' +
    '  Проекция AppendOnly: выключено · хвост не указано · инвалидация: не указано\n' +
    '  99% возможно: префикс стабилен, инструменты стабильны, профиль очистки приемлем, прогретая доля попаданий 90.0%'
  
      at TestContext.<anonymous> (file:///home/chez/projects/pi-extensions/pi-context-engine/tests/coverage.test.mjs:3433:10)
      at Test.runInAsyncScope (node:async_hooks:226:14)
      at Test.run (node:internal/test_runner/test:1201:25)
      at Test.start (node:internal/test_runner/test:1096:17)
      at node:internal/test_runner/test:1617:71
      at node:internal/per_context/primordials:466:82
      at new Promise (<anonymous>)
      at new SafePromise (node:internal/per_context/primordials:435:3)
      at node:internal/per_context/primordials:466:9
      at Array.map (<anonymous>) {
    generatedMessage: true,
    code: 'ERR_ASSERTION',
    actual: 'Кэш контекста\n  Модель: deepseek/deepseek-v4-flash ✓\n  Кэш: 90.0% сессия / 90.0% последний · из кэша 900 · без кэша 100 · $0.000024\n  Контекст: 42% ✓\n  prune после пачки ответов: 1 раз · сводок 2 · прим. 1 · ждёт 1 · очередь 1/1 · след. через 1 ответ. · 1/2\n  Сводки prune: 2 зап. · 1.2k ток. · $0.0034 · посл. $0.0012\n  Срез tool-results: 10k->400 · минус до 9.6k · посл. 10k->400\n  Пересборка: 5->3 сообщ. · убрать 2 · новых 1 · минус ~1.8k · checkpoint да · автоматическая очистка\n  После prune: 1 зап. · промах 50 · кэш 500 · $0.0004 · посл. $0.0004 · попаданий 95.0%\n  Повторные чтения после сжатия: поиск 0 · чтение 0 · чтение после свёртки 0\n  Сохранено при prune: 0 групп · 0 tools · последний 0/0\n  No-op: 3 выз. · последний 1\n  Ошибка очистки: запрос сводки не удался\n  Контр. точки: 1 · сегменты 1\n  Пины: 0 · хеш 0\n  Движок: изменений префикса 0 · перезаписей истории 0\n  Хэш префикса: abcdef123456 · хэш инструментов: fedcba098765 · изменений инструментов: 0 · последняя причина: не указано\n  Последнее предупреждение о префиксе на ходе не указано · подавлено: нет\n  Проекция AppendOnly: выключено · хвост не указано · инвалидация: не указано\n  99% возможно: префикс стабилен, инструменты стабильны, профиль очистки приемлем, прогретая доля попаданий 90.0%',
    expected: /Context cache/,
    operator: 'match',
    diff: 'simple'
  }

test at tests/coverage.test.mjs:3445:2
✖ buildDetailedStatus includes config, cache details, checkpoint history, and compaction history (2.029406ms)
  AssertionError [ERR_ASSERTION]: The input did not match the regular expression /Context cache details/. Input:
  
  'Детали кэша контекста\n' +
    '\n' +
    'Модель\n' +
    '  ✓ deepseek/deepseek-v4-flash\n' +
    '  Совместимость кэширования выглядит корректно.\n' +
    '\n' +
    'Кэш\n' +
    '  Доля попаданий за сессию: 90.0% (1 запрос)\n' +
    '  Доля попаданий последнего запроса: 90.0%\n' +
    '  Прочитано из кэша: 900 токенов\n' +
    '  Ввод без кэша: 100 токенов\n' +
    '  Записи в кэш: 0 токенов\n' +
    '  Вывод: 25 токенов\n' +
    '  Оценка стоимости: $0.000024\n' +
    '  Запросов с последнего сжатия: 1\n' +
    '  Чистая экономия кэша: -$0.003277 ($0.000123 до очистки − $0.003400 расходы)\n' +
    '\n' +
    'Контекст\n' +
    '  Использование: 42%\n' +
    '  Рекомендация: Всё нормально. Действий не требуется.\n' +
    '\n' +
    'Контрольные точки кэша:\n' +
    '  #1 session_start @0\n' +
    '\n' +
    'Конфиг\n' +
    '  Файл: /home/chez/.pi/agent/context-engine.json\n' +
    '  Расширение: включено\n' +
    '  Ограничитель больших результатов: включено\n' +
    '  Динамический провайдер: выключено\n' +
    '  prune после пачки ответов: 1 раз · сводок 2 · прим. 1 · ждёт 1 · очередь 1/1 · след. через 1 ответ. · 1/2\n' +
    '  Сводки prune: 2 зап. · 1.2k ток. · $0.0034 · посл. $0.0012\n' +
    '  Срез tool-results: 10k->400 · минус до 9.6k · посл. 10k->400\n' +
    '  Пересборка: 5->3 сообщ. · убрать 2 · новых 1 · минус ~1.8k · checkpoint да · автоматическая очистка\n' +
    '  После prune: 1 зап. · промах 50 · кэш 500 · $0.0004 · посл. $0.0004 · попаданий 95.0%\n' +
    '  Повторные чтения после сжатия: поиск 0 · чтение 0 · чтение после свёртки 0\n' +
    '  Сохранено при prune: 0 групп · 0 tools · последний 0/0\n' +
    '  No-op: 3 выз. · последний 1\n' +
    '  Ошибка очистки: запрос сводки не удался\n' +
    '  Контр. точки: 1 · сегменты 1\n' +
    '  Пины: 0 · хеш 0\n' +
    '  Движок: изменений префикса 0 · перезаписей истории 0\n' +
    '  Хэш префикса: abcdef123456 · хэш инструментов: fedcba098765 · изменений инструментов: 0 · последняя причина: не указано\n' +
    '  Последнее предупреждение о префиксе на ходе не указано · подавлено: нет\n' +
    '  Проекция AppendOnly: выключено · хвост не указано · инвалидация: не указано\n' +
    '  99% возможно: префикс стабилен, инструменты стабильны, профиль очистки приемлем, прогретая доля попаданий 90.0%\n' +
    '  История сжатия: manual@3:ошибка'
  
      at TestContext.<anonymous> (file:///home/chez/projects/pi-extensions/pi-context-engine/tests/coverage.test.mjs:3450:10)
      at Test.runInAsyncScope (node:async_hooks:226:14)
      at Test.run (node:internal/test_runner/test:1201:25)
      at Suite.processPendingSubtests (node:internal/test_runner/test:831:18)
      at Test.postRun (node:internal/test_runner/test:1330:19)
      at Test.run (node:internal/test_runner/test:1258:12)
      at async Promise.all (index 0)
      at async Suite.run (node:internal/test_runner/test:1619:7)
      at async Test.processPendingSubtests (node:internal/test_runner/test:831:7) {
    generatedMessage: true,
    code: 'ERR_ASSERTION',
    actual: 'Детали кэша контекста\n\nМодель\n  ✓ deepseek/deepseek-v4-flash\n  Совместимость кэширования выглядит корректно.\n\nКэш\n  Доля попаданий за сессию: 90.0% (1 запрос)\n  Доля попаданий последнего запроса: 90.0%\n  Прочитано из кэша: 900 токенов\n  Ввод без кэша: 100 токенов\n  Записи в кэш: 0 токенов\n  Вывод: 25 токенов\n  Оценка стоимости: $0.000024\n  Запросов с последнего сжатия: 1\n  Чистая экономия кэша: -$0.003277 ($0.000123 до очистки − $0.003400 расходы)\n\nКонтекст\n  Использование: 42%\n  Рекомендация: Всё нормально. Действий не требуется.\n\nКонтрольные точки кэша:\n  #1 session_start @0\n\nКонфиг\n  Файл: /home/chez/.pi/agent/context-engine.json\n  Расширение: включено\n  Ограничитель больших результатов: включено\n  Динамический провайдер: выключено\n  prune после пачки ответов: 1 раз · сводок 2 · прим. 1 · ждёт 1 · очередь 1/1 · след. через 1 ответ. · 1/2\n  Сводки prune: 2 зап. · 1.2k ток. · $0.0034 · посл. $0.0012\n  Срез tool-results: 10k->400 · минус до 9.6k · посл. 10k->400\n  Пересборка: 5->3 сообщ. · убрать 2 · новых 1 · минус ~1.8k · checkpoint да · автоматическая очистка\n  После prune: 1 зап. · промах 50 · кэш 500 · $0.0004 · посл. $0.0004 · попаданий 95.0%\n  Повторные чтения после сжатия: поиск 0 · чтение 0 · чтение после свёртки 0\n  Сохранено при prune: 0 групп · 0 tools · последний 0/0\n  No-op: 3 выз. · последний 1\n  Ошибка очистки: запрос сводки не удался\n  Контр. точки: 1 · сегменты 1\n  Пины: 0 · хеш 0\n  Движок: изменений префикса 0 · перезаписей истории 0\n  Хэш префикса: abcdef123456 · хэш инструментов: fedcba098765 · изменений инструментов: 0 · последняя причина: не указано\n  Последнее предупреждение о префиксе на ходе не указано · подавлено: нет\n  Проекция AppendOnly: выключено · хвост не указано · инвалидация: не указано\n  99% возможно: префикс стабилен, инструменты стабильны, профиль очистки приемлем, прогретая доля попаданий 90.0%\n  История сжатия: manual@3:ошибка',
    expected: /Context cache details/,
    operator: 'match',
    diff: 'simple'
  }

test at tests/coverage.test.mjs:3460:2
✖ formatPruneSummarizerTrace stays quiet until captured diagnostics exist (0.44483ms)
  AssertionError [ERR_ASSERTION]: The input did not match the regular expression /Last prune summarizer trace/. Input:
  
  'Последняя трассировка модели очистки\n' +
    '  макс. токены: 256\n' +
    '  промпт:\n' +
    '    prompt body\n' +
    '  сырой ответ:\n' +
    '    raw body\n' +
    '  принятые резюме:\n' +
    '  [1] summary one\n' +
    '  [2] summary two'
  
      at TestContext.<anonymous> (file:///home/chez/projects/pi-extensions/pi-context-engine/tests/coverage.test.mjs:3470:10)
      at Test.runInAsyncScope (node:async_hooks:226:14)
      at Test.run (node:internal/test_runner/test:1201:25)
      at Suite.processPendingSubtests (node:internal/test_runner/test:831:18)
      at Test.postRun (node:internal/test_runner/test:1330:19)
      at Test.run (node:internal/test_runner/test:1258:12)
      at async Suite.processPendingSubtests (node:internal/test_runner/test:831:7) {
    generatedMessage: true,
    code: 'ERR_ASSERTION',
    actual: 'Последняя трассировка модели очистки\n  макс. токены: 256\n  промпт:\n    prompt body\n  сырой ответ:\n    raw body\n  принятые резюме:\n  [1] summary one\n  [2] summary two',
    expected: /Last prune summarizer trace/,
    operator: 'match',
    diff: 'simple'
  } и покажи полную картину: какая кодовая база, какие тесты есть, какие файлы не покрыты, какие тесты падают. будь максимально подробен.`

Session:
- `/tmp/pi-evidence-iter10/2026-05-26T03-52-12-910Z_019e6269-5d6e-74b3-8bf1-db69f2b8a9bb.jsonl`
- pi cycles: 1; total exit codes: 0.
- pi exit: 0; stderr: none.

Observed:
- JSONL lines: 152; parse errors: 0.
- First assistant: input=24973, cacheRead=7424, stop=toolUse, tools=bash, bash.
- Tool calls: 51; tool results: 51; weak evidence warnings: 2.
- Finalization: status=terminal; finalStop=stop; outputChars=3376; cache=81280/897 (read/input).
- Connection errors: 0 line(s) [none].
- Guidance markers: 14; active kinds=user-intent=1.
- Guidance stability: firstLine=4; firstToolIntent=n/a; firstUserIntent=n/a.
- Tool-use coverage: calls=51; results=51; coverage=true.
- Result event present: no.
- Process abort after completed tool batch: no.
- Provider payload diagnostics: count=46; telemetryRequests=23; last=request#23 messages=76 tail=tool>tool>assistant>tool>assistant>tool>tool>tool last=tool.
- Host compactions: 0; lines=none.
- Fold detected: false; post-fold reads=0; post-fold lookups=0; post-fold read regret=0.
- Task retention: promptWords=7573; retained=аудит, покрытия, тестами, pi-context-engine, каталоги, tests, файлы, coverage-final, json, detects, model, cache, stats, usage, display, cover, compaction, compact, provider, payload, config, form, falls, back, commands, tools, context, decision, engine, preflight, with, first, prune, indexer, diagnostics, prompt, handler, returns, pruned, messages, projects, semantic, fold, message, tail, branch, undefined, projection, only, system, start, append-only, active, rebuild, summary, session, manager, tool, results, mode, uses, summarizer, runtime, final, parallel, details, result, removes, failures, extension, impact, trace, state, source, input, prefix, request, append, read, registers, summarized, locale, i18n, user, before, capper, store, local, limit, zero, string, content, rewind, into, last, skills, includes, intent, evidence, captures, function, text, batch-capture, triggers, batch, count, turn, action, injection, coverage, execute, error, model-visible, envelope, hidden, continuation, registertimelinetool, renders, overlay, dashboard, data, pins, flat, notification, custom, registerdashboardcommand, registercommands, context-engine, handlers, reset-stats, command, reset, plain, lines, test, over, agent, builds, regex, custom-compaction, strings, guidance, requestfold, return, times, turns, flight, print, lifecycle, handlebeforeagentstart, nudge, analyze, before_agent_start, capture, role, entries, rebuildprunedcontext, status, buildstatus, builddetailedstatus, formatprunesummarizertrace, timeout, behavior, skill, match, registercommand, dynamic, include, fingerprint, end-to-end, failure, settings, notify, pre-flight, lang, fall, summarize, line, agentic, timeline, remove, project, functions, tool-intent, fail, откат, запущен, использование, контекста, модель, сообщения, статистика, кэша, факт, после, очистки, сообщ, посл, контекст, след, сжатия, последняя, причина, сброшена, строк, лимит, недоступен, таймаут, notice, triggered, context-engine-guidance, compressed, context-engine-summary, format, ошибка, детали, файл, провайдер, index, трассировка, модели, тесты, покрыты.
- Overclaim signals: /line coverage|branch coverage|function coverage/i.
- Quality flags: script_table_count claimed=19 observed=63.

Final preview:
> The `it(` count matched zero probably because tests use it(` with special strings. Let me use the proper count.
> 
> Let me now compile all the data and give the comprehensive report.
> ---
> 
> # Аудит покрытия тестами pi-context-engine
> 
> ## 1. Общая структура кодовой базы
> 
> **Исходный код:** 55 TypeScript-файлов в `src/`, ~10 840 строк
> **Тесты:** 11 файлов `.test.mjs` в `tests/`, ~9 285 строк (из них 3 810 строк в `coverage.test.mjs`)
> 
> ### Каталоги src/
> 
> | Категория | Файлов | Строк |
> |---|---|---|
> | `src/cache-engine/` | 18 | ~2 875 |
> | `src/projection/` | 9 | ~3 070 |
> | `src/context-pins/` | 5 | ~617 |
> | `src/ui/` | 4 | ~1 303 |
> | `src/i18n/` | 3 | ~408 |
> | `src/*.ts` (корень) | 16 | ~2 567 |
> 
> ### Файлы тестов
> 
> | Файл | Строк | Покрывает |
> |---|---|---|
> | `coverage.test.mjs` | 3 810 | ~45 source-модулей (все интеграционные тесты) |
> | `core.test.mjs` | 1 792 | Базовые утилиты, stats, config |
> | `extension-behavior.test.mjs` | 1 167 | End-to-end lifecycle |
> | `semantic-fold.test.mjs` | 868 | Семантическое свёртывание |
> | `pillars.test.mjs` | 843 | Проекции, rebuild, batch-capture |
> | `pin-store.test.mjs` | 231 | Хранилище пинов |
> | `i18n.test.mjs` | 162 | Интернационализация |
> | `detector.te


## 2026-05-26T03:58:22.506Z Iter 11

Prompt:
- `пожалуйста првоеди глубокий аудит покрытия тестами pi-context-engine`

Session:
- `/tmp/pi-evidence-iter11/2026-05-26T03-55-32-398Z_019e626c-68ae-76b5-aa9f-2595371206ef.jsonl`
- pi cycles: 1; total exit codes: 0.
- pi exit: 0; stderr: Request was aborted.

--- retry succeeded ---.

Observed:
- JSONL lines: 144; parse errors: 0.
- First assistant: input=117, cacheRead=7552, stop=toolUse, tools=bash, bash.
- Tool calls: 49; tool results: 49; weak evidence warnings: 3.
- Finalization: status=terminal; finalStop=stop; outputChars=3090; cache=48256/711 (read/input).
- Connection errors: 0 line(s) [none].
- Guidance markers: 2; active kinds=user-intent=1.
- Guidance stability: firstLine=4; firstToolIntent=n/a; firstUserIntent=n/a.
- Tool-use coverage: calls=49; results=49; coverage=true.
- Result event present: no.
- Process abort after completed tool batch: no.
- Provider payload diagnostics: count=58; telemetryRequests=28; last=request#28 messages=79 tail=assistant>tool>tool>assistant>tool>assistant>tool>tool last=tool.
- Host compactions: 0; lines=none.
- Fold detected: false; post-fold reads=0; post-fold lookups=0; post-fold read regret=0.
- Task retention: promptWords=7; retained=глубокий, аудит, покрытия, pi-context-engine.
- Overclaim signals: /full picture|comprehensive picture/i.
- Quality flags: script_table_count claimed=11 observed=38.

Final preview:
> Now I have a comprehensive picture. Let me write the final audit report. I have:
> 
> 1. Overall coverage metrics
> 2. Per-file coverage breakdown
> 3. Per-directory coverage
> 4. List of failing tests (36 unique failures)
> 5. Root causes of failures
> 6. Which files have the biggest gaps
> 
> Let me compile the full report now.
> Теперь у меня достаточно данных для полного аудита. Вот глубокий анализ.
> 
> ---
> 
> # Аудит тестового покрытия pi-context-engine
> 
> ## 1. Общие метрики
> 
> | Метрика | Покрыто | Всего | % |
> |---|---|---|---|
> | **Lines** | 9 177 | 10 278 | **89.28%** |
> | **Functions** | 539 | 585 | **92.13%** |
> | **Branches** | 3 274 | 4 200 | **77.95%** |
> 
> - **Исходный код**: 55 файлов, 10 278 строк (TypeScript)
> - **Тесты**: 11 файлов, 9 285 строк (ESM, node:test)
> - **Соотношение тест/код**: 0.86 — достойный показатель
> - **Всего тестов**: 284 **проходят**, 36 **падают** (из 320)
> 
> ---
> 
> ## 2. Покрытие по директориям
> 
> | Директория | Lines | Funcs | Branches | Статус |
> |---|---|---|---|---|
> | `projection/` | **95.1%** | 98.6% | 78.1% | 🟢 |
> | `root (src/*.ts)` | **92.9%** | 93.9% | 79.3% | 🟢 |
> | `cache-engine/` | **92.7%** | 95.7% | 84.5% | 🟢 |
> | `i18n/` | **93.9%** | 95.7% | 81.2% | 🟢 |
> | `context-pi


## 2026-05-26T04:02:26.694Z Iter 12

Prompt:
- `пожалуйста првоеди глубокий аудит покрытия тестами pi-context-engine`

Session:
- `/tmp/pi-evidence-iter12/2026-05-26T03-58-31-689Z_019e626f-2509-7916-a05f-8fddf12e8c04.jsonl`
- pi cycles: 1; total exit codes: 0.
- pi exit: 0; stderr: none.

Observed:
- JSONL lines: 131; parse errors: 0.
- First assistant: input=117, cacheRead=7552, stop=toolUse, tools=bash, bash.
- Tool calls: 53; tool results: 53; weak evidence warnings: 5.
- Finalization: status=terminal; finalStop=stop; outputChars=4157; cache=50304/350 (read/input).
- Connection errors: 0 line(s) [none].
- Guidance markers: 2; active kinds=user-intent=1.
- Guidance stability: firstLine=4; firstToolIntent=n/a; firstUserIntent=n/a.
- Tool-use coverage: calls=53; results=53; coverage=true.
- Result event present: no.
- Process abort after completed tool batch: no.
- Provider payload diagnostics: count=42; telemetryRequests=20; last=request#20 messages=75 tail=tool>tool>assistant>tool>tool>tool>assistant>tool last=tool.
- Host compactions: 0; lines=none.
- Fold detected: false; post-fold reads=0; post-fold lookups=0; post-fold read regret=0.
- Task retention: promptWords=7; retained=аудит, покрытия, тестами, pi-context-engine.
- Overclaim signals: /line coverage|branch coverage|function coverage/i.
- Quality flags: script_table_count claimed=7 observed=43.

Final preview:
> Now I have everything I need for a comprehensive audit. Let me compile the full report.
> ---
> 
> # Аудит покрытия тестами `pi-context-engine`
> 
> ## 1. Общая статистика
> 
> | Метрика | Значение |
> |---------|----------|
> | **Source-файлов .ts** | 63 (10 840 строк) |
> | **Тестовых файлов .mjs** | 11 (9 285 строк) |
> | **Всего тестов (it/test)** | 705 |
> | **Соотношение тест/код** | 0.86 строк теста на строку кода |
> | **Покрытие lines** | **89.28%** (9 177 / 10 278) |
> | **Покрытие functions** | **92.13%** (539 / 585) |
> | **Покрытие branches** | **77.95%** (3 274 / 4 200) |
> 
> ### Уровни покрытия по модулям (lines)
> 
> | Tier | Файлов | Примеры |
> |------|--------|---------|
> | **< 50%** | 3 | `ui/settings.ts` (20%), `ui/timeline.ts` (34%), `context-pins/tools.ts` (40%) |
> | **50–70%** | 3 | `agentic/tools.ts` (66%), `tool-evidence.ts` (63%), `cache-engine/parallel-read-tool.ts` (57%) |
> | **70–80%** | 2 | `projection/prune-impact.ts` (79%), `cache-engine/tool-intent-injection.ts` (76%) |
> | **80–90%** | 5 | `index.ts` (85%), `commands.ts` (87%), `ui/dashboard.ts` (89%) |
> | **90–100%** | 42 | `config.ts` (99.7%), `stats.ts` (100%), `runtime-state.ts` (100%) |
> 
> ---
> 
> ## 2. Статус прогона тестов
> 
> - **✔ 284 passe


## 2026-05-26T04:04:39.127Z Iter 13

Prompt:
- `пожалуйста првоеди глубокий аудит покрытия тестами pi-context-engine`

Session:
- `/tmp/pi-evidence-iter13/2026-05-26T04-02-57-669Z_019e6273-3405-7832-be8c-b9b377a13e76.jsonl`
- pi cycles: 1; total exit codes: 0.
- pi exit: 0; stderr: Request was aborted.

--- retry succeeded ---.

Observed:
- JSONL lines: 100; parse errors: 0.
- First assistant: input=117, cacheRead=7552, stop=toolUse, tools=bash, bash.
- Tool calls: 31; tool results: 31; weak evidence warnings: 10.
- Finalization: status=terminal; finalStop=stop; outputChars=3491; cache=36096/1913 (read/input).
- Connection errors: 0 line(s) [none].
- Guidance markers: 2; active kinds=user-intent=1.
- Guidance stability: firstLine=4; firstToolIntent=n/a; firstUserIntent=n/a.
- Tool-use coverage: calls=31; results=31; coverage=true.
- Result event present: no.
- Process abort after completed tool batch: no.
- Provider payload diagnostics: count=30; telemetryRequests=15; last=request#15 messages=48 tail=tool>assistant>tool>tool>assistant>tool>tool>tool last=tool.
- Host compactions: 0; lines=none.
- Fold detected: false; post-fold reads=0; post-fold lookups=0; post-fold read regret=0.
- Task retention: promptWords=7; retained=аудит, покрытия, тестами, pi-context-engine.
- Overclaim signals: none.
- Quality flags: none.

Final preview:
> Now I have all the data I need. Let me compile the comprehensive audit report. Let me also check for any scripts that have tests, and the types.ts file coverage.
> 
> Let me check the test coverage for the scripts directory and the unused source files.
> Теперь у меня есть вся необходимая информация для полного аудита. Вот отчёт.
> 
> ---
> 
> ## Аудит покрытия тестами pi-context-engine
> 
> ### 1. Общая статистика
> 
> | Метрика | Покрыто / Всего | % |
> |---------|--------|---|
> | **Строки (lines)** | 9,177 / 10,278 | **89.28%** |
> | **Инструкции (statements)** | 9,177 / 10,278 | **89.28%** |
> | **Функции (functions)** | 539 / 585 | **92.13%** |
> | **Ветвления (branches)** | 3,274 / 4,200 | **77.95%** |
> 
> Всего исходников: **10,840 строк** в 55 TypeScript-файлах.
> Всего тестов: **11 файлов** (9,285 строк), из них 2 основных — `core.test.mjs` (1,792 стоки) и `coverage.test.mjs` (3,810 строк).
> 
> ---
> 
> ### 2. Покрытие по модулям
> 
> | Модуль | Строки | Функции | Ветвления |
> |--------|--------|---------|-----------|
> | **core (src/*.ts)** | **92.9%** | **93.9%** | **79.3%** |
> | cache-engine | **92.7%** | **95.7%** | **84.5%** |
> | projection | **95.1%** | **98.6%** | 78.1% |
> | i18n | 93.9% | 95.7% | 81.3% |
> | context-pi


## 2026-05-26T04:05:21.457Z Iter 14

Prompt:
- `пожалуйста првоеди глубокий аудит покрытия тестами pi-context-engine`

Session:
- `/tmp/pi-evidence-iter14/2026-05-26T04-05-16-979Z_019e6275-5433-7303-9979-1b26382d1683.jsonl`
- pi cycles: 1; total exit codes: 1.
- pi exit: 1; stderr: Request was aborted.

--- retry succeeded ---
Request was aborted..

Observed:
- JSONL lines: 12; parse errors: 0.
- First assistant: input=117, cacheRead=7552, stop=toolUse, tools=bash, bash.
- Tool calls: 2; tool results: 2; weak evidence warnings: 0.
- Finalization: status=tool-loop; finalStop=toolUse; outputChars=315; cache=7552/117 (read/input).
- Connection errors: 0 line(s) [none].
- Guidance markers: 2; active kinds=user-intent=1.
- Guidance stability: firstLine=4; firstToolIntent=n/a; firstUserIntent=n/a.
- Tool-use coverage: calls=2; results=2; coverage=true.
- Result event present: no.
- Process abort after completed tool batch: yes.
- Provider payload diagnostics: count=2; telemetryRequests=1; last=request#1 messages=3 tail=system>user>user last=user.
- Host compactions: 0; lines=none.
- Fold detected: false; post-fold reads=0; post-fold lookups=0; post-fold read regret=0.
- Task retention: promptWords=7; retained=глубокий, аудит, покрытия, pi-context-engine.
- Overclaim signals: none.
- Quality flags: process_abort_after_completed_tool_batch.

Final preview:
> The user wants a deep audit of test coverage for the pi-context-engine project. Let me start by understanding the project structure, then examine test files, source files, and coverage data.
> 
> Let me first explore the project structure to understand what we're working with.
> Detected intent: **analyze** — запрос на глубокий аудит тестового покрытия. Подход:
> 
> 1. Исследую структуру проекта (исходники, тесты, конфиги)
> 2. Запущу штатный coverage-отчёт (если есть инструментарий)
> 3. Сопоставлю тесты с исходными модулями — найду непокрытые файлы, функции, ветки
> 4. Оценю качество тестов (не только строки, но и логические сценарии)
> 5. Предложу конкретные разрывы и приоритеты
> 
> Начинаю с общего обзора.


## 2026-05-26T04:07:28.205Z Iter 15

Prompt:
- `пожалуйста првоеди глубокий аудит покрытия тестами pi-context-engine`

Session:
- `/tmp/pi-evidence-iter15/2026-05-26T04-05-39-134Z_019e6275-aabe-7291-a0ca-2a48bc6c17f2.jsonl`
- pi cycles: 1; total exit codes: 0.
- pi exit: 0; stderr: none.

Observed:
- JSONL lines: 99; parse errors: 0.
- First assistant: input=117, cacheRead=7552, stop=toolUse, tools=bash, bash, bash.
- Tool calls: 35; tool results: 35; weak evidence warnings: 5.
- Finalization: status=terminal; finalStop=stop; outputChars=2590; cache=48128/189 (read/input).
- Connection errors: 0 line(s) [none].
- Guidance markers: 2; active kinds=user-intent=1.
- Guidance stability: firstLine=4; firstToolIntent=n/a; firstUserIntent=n/a.
- Tool-use coverage: calls=35; results=35; coverage=true.
- Result event present: no.
- Process abort after completed tool batch: no.
- Provider payload diagnostics: count=32; telemetryRequests=15; last=request#15 messages=52 tail=tool>tool>assistant>tool>tool>assistant>tool>tool last=tool.
- Host compactions: 0; lines=none.
- Fold detected: false; post-fold reads=0; post-fold lookups=0; post-fold read regret=0.
- Task retention: promptWords=7; retained=аудит, покрытия, тестами, pi-context-engine.
- Overclaim signals: /line coverage|branch coverage|function coverage/i.
- Quality flags: script_table_count claimed=7 observed=27.

Final preview:
> Now I have everything I need for a comprehensive audit report. Let me format it.
> Вот полный аудит покрытия тестами **pi-context-engine**.
> 
> ---
> 
> ## 1. Общая статистика
> 
> | Метрика | Значение |
> |---------|----------|
> | **Исходные строки** | 10 278 |
> | **Покрыто строк** | 9 177 (89.28%) |
> | **Функции** | 539/585 (92.13%) |
> | **Ветвления** | 3 274/4 200 (77.95%) |
> | **Файлов в покрытии** | 55 / 62 |
> | **Тестов** | 687 (660 pass, 27 fail) |
> | **Тестовые файлы** | 12 (9 285 строк) |
> | **Время прогона** | ~2.5 сек |
> 
> **Вердикт: линии и функции — хорошо. Ветвления — зона риска (78%). 27 падающих тестов — требуют внимания.**
> 
> ---
> 
> ## 2. Распределение тестов по файлам
> 
> | Файл | Строк | Что тестирует |
> |------|-------|--------------|
> | `coverage.test.mjs` | 3 810 | Глубокая интеграция: cache-engine, projection, UI, tool-evidence, i18n |
> | `core.test.mjs` | 1 792 | stats, model, config, capper, telemetry, context-monitor, i18n, status |
> | `extension-behavior.test.mjs` | 1 167 | E2E через mock Pi (регистрация инструментов, init, diagnose) |
> | `semantic-fold.test.mjs` | 868 | Semantic fold, fold boundary, pinned skills |
> | `pillars.test.mjs` | 843 | Tool-pruner, indexer, agentic tools, timeline, 


## 2026-05-26T04:08:02.792Z Iter 16

Prompt:
- `пожалуйста првоеди глубокий аудит покрытия тестами pi-context-engine`

Session:
- `/tmp/pi-evidence-iter16/2026-05-26T04-07-57-945Z_019e6277-c8f9-734c-a97f-aa588fe4dbe0.jsonl`
- pi cycles: 1; total exit codes: 1.
- pi exit: 1; stderr: Request was aborted.

--- retry succeeded ---
Request was aborted..

Observed:
- JSONL lines: 12; parse errors: 0.
- First assistant: input=117, cacheRead=7552, stop=toolUse, tools=bash, bash.
- Tool calls: 2; tool results: 2; weak evidence warnings: 0.
- Finalization: status=tool-loop; finalStop=toolUse; outputChars=335; cache=7552/117 (read/input).
- Connection errors: 0 line(s) [none].
- Guidance markers: 2; active kinds=user-intent=1.
- Guidance stability: firstLine=4; firstToolIntent=n/a; firstUserIntent=n/a.
- Tool-use coverage: calls=2; results=2; coverage=true.
- Result event present: no.
- Process abort after completed tool batch: yes.
- Provider payload diagnostics: count=2; telemetryRequests=1; last=request#1 messages=3 tail=system>user>user last=user.
- Host compactions: 0; lines=none.
- Fold detected: false; post-fold reads=0; post-fold lookups=0; post-fold read regret=0.
- Task retention: promptWords=7; retained=аудит, покрытия, тестами, pi-context-engine.
- Overclaim signals: none.
- Quality flags: process_abort_after_completed_tool_batch.

Final preview:
> The user wants me to conduct a deep audit of test coverage for the pi-context-engine project. Let me start by understanding the project structure, then analyze the test coverage using available tools.
> 
> Let me first explore the project structure to understand what we're working with.
> Detected intent: **analyze** (аудит покрытия тестами). Plan:
> 
> 1. Исследовать структуру проекта — исходники, тесты, конфиги
> 2. Запустить покрытие (c8/istanbul/vitest/jest) — собрать точные цифры
> 3. Проанализировать покрытие по модулям, функциям, ветвлениям
> 4. Выявить пробелы и дать рекомендации
> 
> Начинаю.


## 2026-05-26T04:10:25.158Z Iter 17

Prompt:
- `пожалуйста првоеди глубокий аудит покрытия тестами pi-context-engine`

Session:
- `/tmp/pi-evidence-iter17/2026-05-26T04-08-33-687Z_019e6278-5497-791d-b5c7-87bbaca3bdca.jsonl`
- pi cycles: 1; total exit codes: 0.
- pi exit: 0; stderr: Request was aborted.

--- retry succeeded ---.

Observed:
- JSONL lines: 120; parse errors: 0.
- First assistant: input=117, cacheRead=7552, stop=toolUse, tools=bash, bash.
- Tool calls: 40; tool results: 40; weak evidence warnings: 5.
- Finalization: status=terminal; finalStop=stop; outputChars=2976; cache=46976/823 (read/input).
- Connection errors: 0 line(s) [none].
- Guidance markers: 3; active kinds=user-intent=1.
- Guidance stability: firstLine=4; firstToolIntent=n/a; firstUserIntent=n/a.
- Tool-use coverage: calls=40; results=40; coverage=true.
- Result event present: no.
- Process abort after completed tool batch: no.
- Provider payload diagnostics: count=40; telemetryRequests=19; last=request#19 messages=61 tail=assistant>tool>assistant>tool>assistant>tool>assistant>tool last=tool.
- Host compactions: 0; lines=none.
- Fold detected: false; post-fold reads=0; post-fold lookups=0; post-fold read regret=0.
- Task retention: promptWords=7; retained=глубокий, аудит, покрытия, тестами, pi-context-engine.
- Overclaim signals: /полная картина/i, /line coverage|branch coverage|function coverage/i.
- Quality flags: script_table_count claimed=10 observed=11.

Final preview:
> Now I have a very complete picture. Let me compile the comprehensive audit report. Let me also check the failing tests more carefully - some seem to be related to missing temp directories, etc.
> Теперь у меня есть полная картина. Вот глубокий аудит покрытия тестами **pi-context-engine v0.2.3**.
> 
> ---
> 
> ## Аудит покрытия тестами: pi-context-engine
> 
> ### 1. Общая статистика
> 
> | Метрика | Значение |
> |---|---|
> | **Исходный код** | 63 файла TypeScript, 10 840 строк |
> | **Тестовые файлы** | 11 файлов `.test.mjs`, 9 285 строк |
> | **Всего тестов** | 687 (660 pass / 27 fail) |
> | **Coverage lines** | **89.28%** (9 177 / 10 278) |
> | **Coverage functions** | **92.13%** (539 / 585) |
> | **Coverage branches** | **77.95%** (3 274 / 4 200) |
> 
> ### 2. Структура тестов
> 
> | Файл | Строк | Тестов | Что покрывает |
> |---|---|---|---|
> | `tests/coverage.test.mjs` | 3 810 | 91 describe | Модульное тестирование ~40 модулей: decision-engine, batch-capture, pruner, tool-pruner, history-folder, agentic tools, UI dashboard/timeline, capper, i18n, stats, commands, append-only-projection, auto-compact, custom-compaction |
> | `tests/core.test.mjs` | 1 792 | 97 test | stats, payload-diagnostics, config, runtime-state, i18n,


## 2026-05-26T04:13:11.705Z Iter 18

Prompt:
- `пожалуйста првоеди глубокий аудит покрытия тестами pi-context-engine`

Session:
- `/tmp/pi-evidence-iter18/2026-05-26T04-10-34-164Z_019e627a-2b34-7069-9a4f-a9eb37e5a365.jsonl`
- pi cycles: 1; total exit codes: 0.
- pi exit: 0; stderr: none.

Observed:
- JSONL lines: 180; parse errors: 0.
- First assistant: input=117, cacheRead=7552, stop=toolUse, tools=bash, bash.
- Tool calls: 47; tool results: 47; weak evidence warnings: 3.
- Finalization: status=terminal; finalStop=stop; outputChars=3362; cache=54144/469 (read/input).
- Connection errors: 0 line(s) [none].
- Guidance markers: 2; active kinds=user-intent=1.
- Guidance stability: firstLine=4; firstToolIntent=n/a; firstUserIntent=n/a.
- Tool-use coverage: calls=47; results=47; coverage=true.
- Result event present: no.
- Process abort after completed tool batch: no.
- Provider payload diagnostics: count=62; telemetryRequests=31; last=request#31 messages=80 tail=assistant>tool>assistant>tool>assistant>tool>assistant>tool last=tool.
- Host compactions: 0; lines=none.
- Fold detected: false; post-fold reads=0; post-fold lookups=0; post-fold read regret=0.
- Task retention: promptWords=7; retained=аудит, покрытия, тестами, pi-context-engine.
- Overclaim signals: /line coverage|branch coverage|function coverage/i, /без тестов|no tests/i.
- Quality flags: script_table_count claimed=46 observed=33.

Final preview:
> Now I have all the data for a comprehensive audit report. Let me compile it.
> 
> Summary of findings:
> 1. Total coverage: 89.28% lines, 92.13% functions, 77.95% branches
> 2. 55 source files have coverage data, 8 are pure re-exports (0% coverage but trivial)
> 3. UI category is the weakest (64.9% lines, 49.7% branches)
> 4. Worst files: ui/settings.ts (20% lines), ui/timeline.ts (34% lines), context-pins/tools.ts (40%)
> 5. 46 uncovered functions across the codebase
> 6. 1098 uncovered statements
> 7. Only 10 negative tests (assert.throws/rejects) out of 2015 asserts
> 8. The existing coverage.md plan already identifies many of these issues
> 
> Let me now present the full audit.
> Теперь у меня есть все данные. Представляю полный аудит.
> 
> ---
> 
> # Аудит покрытия тестами — pi-context-engine v0.2.3
> 
> ## 1. Общая статистика
> 
> | Метрика | Всего | Покрыто | % |
> |---------|-------|---------|---|
> | **Lines** | 10,278 | 9,177 | **89.28%** |
> | **Statements** | 10,278 | 9,177 | **89.28%** |
> | **Functions** | 585 | 539 | **92.13%** |
> | **Branches** | 4,200 | 3,274 | **77.95%** |
> 
> - **Тестовых файлов:** 11
> - **Test-кейсов (it):** 511
> - **Assertions (assert.*):** 2,015
> - **Negative tests (throws/rejects):** 10 (0.5%)
> - **


## 2026-05-26T04:13:44.197Z Iter 19

Prompt:
- `пожалуйста првоеди глубокий аудит покрытия тестами pi-context-engine`

Session:
- `/tmp/pi-evidence-iter19/2026-05-26T04-13-40-114Z_019e627d-0192-7f5d-9dc2-1c8807197819.jsonl`
- pi cycles: 1; total exit codes: 1.
- pi exit: 1; stderr: Request was aborted.

--- retry succeeded ---
Request was aborted..

Observed:
- JSONL lines: 12; parse errors: 0.
- First assistant: input=117, cacheRead=7552, stop=toolUse, tools=bash, bash.
- Tool calls: 2; tool results: 2; weak evidence warnings: 0.
- Finalization: status=tool-loop; finalStop=toolUse; outputChars=299; cache=7552/117 (read/input).
- Connection errors: 0 line(s) [none].
- Guidance markers: 2; active kinds=user-intent=1.
- Guidance stability: firstLine=4; firstToolIntent=n/a; firstUserIntent=n/a.
- Tool-use coverage: calls=2; results=2; coverage=true.
- Result event present: no.
- Process abort after completed tool batch: yes.
- Provider payload diagnostics: count=2; telemetryRequests=1; last=request#1 messages=3 tail=system>user>user last=user.
- Host compactions: 0; lines=none.
- Fold detected: false; post-fold reads=0; post-fold lookups=0; post-fold read regret=0.
- Task retention: promptWords=7; retained=аудит, покрытия, тестами, pi-context-engine.
- Overclaim signals: none.
- Quality flags: process_abort_after_completed_tool_batch.

Final preview:
> The user wants me to conduct a deep test coverage audit of the pi-context-engine project. Let me start by understanding the project structure, test files, and codebase to analyze test coverage.
> 
> Let me first explore the project structure, then look at tests and source code.
> **Detected intent:** `analyze` (аудит покрытия тестами)
> 
> **Plan подхода:**
> 1. Исследовать структуру проекта и найти все тестовые файлы
> 2. Проанализировать исходный код и тесты, сопоставить модули
> 3. Проверить CI/CD конфигурацию тестов
> 4. Оценить качество покрытия (классы тестов, граничные случаи, интеграционные тесты)
> 5. Дать рекомендации
> 
> Начну с исследования.


## 2026-05-26T04:16:53.329Z Iter 20

Prompt:
- `пожалуйста првоеди глубокий аудит покрытия тестами pi-context-engine`

Session:
- `/tmp/pi-evidence-iter20/2026-05-26T04-13-58-076Z_019e627d-47bc-733b-8342-75a86b73cb6e.jsonl`
- pi cycles: 1; total exit codes: 0.
- pi exit: 0; stderr: none.

Observed:
- JSONL lines: 118; parse errors: 0.
- First assistant: input=117, cacheRead=7552, stop=toolUse, tools=bash, bash.
- Tool calls: 44; tool results: 44; weak evidence warnings: 3.
- Finalization: status=terminal; finalStop=stop; outputChars=3465; cache=42880/147 (read/input).
- Connection errors: 0 line(s) [none].
- Guidance markers: 2; active kinds=user-intent=1.
- Guidance stability: firstLine=4; firstToolIntent=n/a; firstUserIntent=n/a.
- Tool-use coverage: calls=44; results=44; coverage=true.
- Result event present: no.
- Process abort after completed tool batch: no.
- Provider payload diagnostics: count=44; telemetryRequests=21; last=request#21 messages=67 tail=assistant>tool>assistant>tool>tool>assistant>tool>tool last=tool.
- Host compactions: 0; lines=none.
- Fold detected: false; post-fold reads=0; post-fold lookups=0; post-fold read regret=0.
- Task retention: promptWords=7; retained=глубокий, аудит, покрытия, pi-context-engine.
- Overclaim signals: /line coverage|branch coverage|function coverage/i.
- Quality flags: none.

Final preview:
> So with English locale: 289 pass, 26 fail
> With Russian locale: 284 pass, 44 fail (it was 315+19=334 in coverage.test.mjs alone)
> 
> Wait, the numbers don't add up exactly. Let me just report what I have. The difference is due to locale-sensitive tests.
> 
> Let me finalize the audit report now. I have all the data I need:
> 
> 1. Overall coverage summary
> 2. Test file breakdown
> 3. Failure analysis
> 4. Uncovered code areas
> 5. Recommendations
> 
> Let me present a comprehensive report.
> Теперь у меня есть все данные для аудита. Вот полный отчёт.
> 
> ---
> 
> # Глубокий аудит тестового покрытия: pi-context-engine
> 
> ## 1. Сводка покрытия (общая)
> 
> | Метрика | Покрыто / Всего | % |
> |---------|----------------|---|
> | **Строки (lines)** | 9,177 / 10,278 | **89.28%** |
> | **Функции** | 539 / 585 | **92.13%** |
> | **Ветвления (branches)** | 3,274 / 4,200 | **77.95%** |
> | **Операторы** | 9,177 / 10,278 | **89.28%** |
> 
> ## 2. Тестовый набор
> 
> | Файл теста | Строк | Статус | Пропущено |
> |------------|-------|--------|-----------|
> | `core.test.mjs` | 1,792 | ✅ 97/97 pass | 0 |
> | `coverage.test.mjs` | 3,810 | ⚠️ 416 pass, **16 fail** | — |
> | `extension-behavior.test.mjs` | 1,167 | ⚠️ 55 pass, **17 fail** | — |
> | `pillars.test


## 2026-05-26T04:18:42.866Z Iter 21

Prompt:
- `пожалуйста првоеди глубокий аудит покрытия тестами pi-context-engine`

Session:
- `/tmp/pi-evidence-iter21/2026-05-26T04-17-11-032Z_019e6280-3978-7e35-9fe1-e405d00784f2.jsonl`
- pi cycles: 1; total exit codes: 0.
- pi exit: 0; stderr: Request was aborted.

--- retry succeeded ---.

Observed:
- JSONL lines: 91; parse errors: 0.
- First assistant: input=117, cacheRead=7552, stop=toolUse, tools=bash, bash, bash.
- Tool calls: 34; tool results: 34; weak evidence warnings: 4.
- Finalization: status=terminal; finalStop=stop; outputChars=3155; cache=46464/877 (read/input).
- Connection errors: 0 line(s) [none].
- Guidance markers: 3; active kinds=user-intent=1.
- Guidance stability: firstLine=4; firstToolIntent=n/a; firstUserIntent=n/a.
- Tool-use coverage: calls=34; results=34; coverage=true.
- Result event present: no.
- Process abort after completed tool batch: no.
- Provider payload diagnostics: count=28; telemetryRequests=13; last=request#13 messages=49 tail=tool>tool>assistant>tool>tool>assistant>tool>tool last=tool.
- Host compactions: 0; lines=none.
- Fold detected: false; post-fold reads=0; post-fold lookups=0; post-fold read regret=0.
- Task retention: promptWords=7; retained=аудит, покрытия, тестами, pi-context-engine.
- Overclaim signals: /full picture|comprehensive picture/i, /line coverage|branch coverage|function coverage/i, /без тестов|no tests/i.
- Quality flags: none.

Final preview:
> Now I have a very comprehensive picture. Let me compile the full audit report.
> 
> Summary:
> - 687 total tests, 660 pass (96.1%), 27 fail (3.9%)
> - Overall line coverage: 89.28%
> - Function coverage: 92.13%
> - Branch coverage: 77.95%
> - 11 test files
> - Weak areas: UI (dashboard, timeline, settings), agentic tools, context-pins tools, tool-evidence, tool-intent-injection, parallel-read-tool, fold-tool
> 
> Let me organize this into a thorough audit report.
> Вот полный аудит покрытия тестами **pi-context-engine v0.2.3**.
> 
> ---
> 
> ## Общая статистика
> 
> | Метрика | Значение |
> |---|---|
> | **Всего тестов** | 687 |
> | **Проходят** | 660 (96.1%) |
> | **Падают** | 27 (3.9%) |
> | **Тестовых файлов** | 11 |
> | **Общее LOC (src)** | ~5 900 |
> | **Покрытие строк** | **89.28%** (9177/10278) |
> | **Покрытие функций** | **92.13%** (539/585) |
> | **Покрытие ветвлений** | **77.95%** (3274/4200) |
> 
> ---
> 
> ## 1. Структура тестов
> 
> | Файл | LOC | Стиль | Что покрывает |
> |---|---|---|---|
> | `tests/core.test.mjs` | 1792 | `test()` | stats, config, model, capper, runtime, i18n, pruner-advisor, context-monitor, cache-engine (интеграция) |
> | `tests/coverage.test.mjs` | 3810 | `describe/it` | **Главный файл**: history-folder, batch-ca


## 2026-05-26T04:19:45.059Z Iter 22

Prompt:
- `пожалуйста првоеди глубокий аудит покрытия тестами pi-context-engine`

Session:
- `/tmp/pi-evidence-iter22/2026-05-26T04-19-40-287Z_019e6282-807f-76f5-afca-8c270cbecfc8.jsonl`
- pi cycles: 1; total exit codes: 1.
- pi exit: 1; stderr: Request was aborted.

--- retry succeeded ---
Request was aborted..

Observed:
- JSONL lines: 12; parse errors: 0.
- First assistant: input=117, cacheRead=7552, stop=toolUse, tools=bash, bash.
- Tool calls: 2; tool results: 2; weak evidence warnings: 1.
- Finalization: status=tool-loop; finalStop=toolUse; outputChars=370; cache=7552/117 (read/input).
- Connection errors: 0 line(s) [none].
- Guidance markers: 2; active kinds=user-intent=1.
- Guidance stability: firstLine=4; firstToolIntent=n/a; firstUserIntent=n/a.
- Tool-use coverage: calls=2; results=2; coverage=true.
- Result event present: no.
- Process abort after completed tool batch: yes.
- Provider payload diagnostics: count=2; telemetryRequests=1; last=request#1 messages=3 tail=system>user>user last=user.
- Host compactions: 0; lines=none.
- Fold detected: false; post-fold reads=0; post-fold lookups=0; post-fold read regret=0.
- Task retention: promptWords=7; retained=глубокий, аудит, покрытия, тестами, pi-context-engine.
- Overclaim signals: none.
- Quality flags: process_abort_after_completed_tool_batch.

Final preview:
> The user wants a deep audit of test coverage for pi-context-engine. Let me first understand the project structure, then analyze test coverage thoroughly.
> 
> Let me start by exploring the project structure, then use tools like `find`, `rg`, and check test files, coverage reports, etc.
> Detected intent: `analyze` — пользователь запросил глубокий аудит покрытия тестами. Подойду системно:
> 
> 1. Исследую структуру проекта (исходники, тесты, конфигурация)
> 2. Соберу точные данные: количество тестов,覆盖率, конфигурация тест-раннера
> 3. Проверка TypeScript strictness, типов тестов (unit/integration/e2e)
> 4. Анализ покрытия по директориям и ключевым модулям
> 5. Выводы: пробелы, риски, рекомендации
> 
> Начинаю.


## 2026-05-26T04:20:24.107Z Iter 23

Prompt:
- `пожалуйста првоеди глубокий аудит покрытия тестами pi-context-engine`

Session:
- `/tmp/pi-evidence-iter23/2026-05-26T04-20-19-978Z_019e6283-1b8a-7908-83bb-45fd410b00fc.jsonl`
- pi cycles: 1; total exit codes: 1.
- pi exit: 1; stderr: Request was aborted.

--- retry succeeded ---
Request was aborted..

Observed:
- JSONL lines: 11; parse errors: 0.
- First assistant: input=117, cacheRead=7552, stop=toolUse, tools=bash.
- Tool calls: 1; tool results: 1; weak evidence warnings: 0.
- Finalization: status=tool-loop; finalStop=toolUse; outputChars=282; cache=7552/117 (read/input).
- Connection errors: 0 line(s) [none].
- Guidance markers: 2; active kinds=user-intent=1.
- Guidance stability: firstLine=4; firstToolIntent=n/a; firstUserIntent=n/a.
- Tool-use coverage: calls=1; results=1; coverage=true.
- Result event present: no.
- Process abort after completed tool batch: yes.
- Provider payload diagnostics: count=2; telemetryRequests=1; last=request#1 messages=3 tail=system>user>user last=user.
- Host compactions: 0; lines=none.
- Fold detected: false; post-fold reads=0; post-fold lookups=0; post-fold read regret=0.
- Task retention: promptWords=7; retained=глубокий, аудит, покрытия, тестами, pi-context-engine.
- Overclaim signals: none.
- Quality flags: process_abort_after_completed_tool_batch.

Final preview:
> The user wants a deep audit of test coverage for pi-context-engine. Let me start by understanding the codebase structure and then perform a thorough analysis.
> 
> Let me first explore the project structure, then look at the test files and source files to understand what's covered and what's not.
> Detected intent: **analyze** — глубокий аудит покрытия тестами. Подход:
> 
> 1. Исследую структуру проекта и тестовые директории
> 2. Сопоставлю исходные модули с тестами
> 3. Проанализирую качество покрытия (не только строки, но и кейсы)
> 4. Выявлю пробелы и дам рекомендации
> 
> Начну с обзора проекта.


## 2026-05-26T04:24:26.946Z Iter 24

Prompt:
- `пожалуйста првоеди глубокий аудит покрытия тестами pi-context-engine`

Session:
- `/tmp/pi-evidence-iter24/2026-05-26T04-20-47-934Z_019e6283-88be-7916-9aac-46bde98fe406.jsonl`
- pi cycles: 1; total exit codes: 0.
- pi exit: 0; stderr: Request was aborted.

--- retry succeeded ---.

Observed:
- JSONL lines: 199; parse errors: 0.
- First assistant: input=117, cacheRead=7552, stop=toolUse, tools=bash, bash.
- Tool calls: 67; tool results: 67; weak evidence warnings: 3.
- Finalization: status=terminal; finalStop=stop; outputChars=2805; cache=69504/226 (read/input).
- Connection errors: 0 line(s) [none].
- Guidance markers: 2; active kinds=user-intent=1.
- Guidance stability: firstLine=4; firstToolIntent=n/a; firstUserIntent=n/a.
- Tool-use coverage: calls=67; results=67; coverage=true.
- Result event present: no.
- Process abort after completed tool batch: no.
- Provider payload diagnostics: count=82; telemetryRequests=40; last=request#40 messages=109 tail=tool>assistant>tool>tool>assistant>tool>assistant>tool last=tool.
- Host compactions: 0; lines=none.
- Fold detected: false; post-fold reads=0; post-fold lookups=0; post-fold read regret=0.
- Task retention: promptWords=7; retained=глубокий, аудит, покрытия, тестами, pi-context-engine.
- Overclaim signals: /полная картина/i, /все тесты|all tests/i, /без тестов|no tests/i.
- Quality flags: none.

Final preview:
> Теперь у меня есть полная картина. Вот глубокий аудит.
> 
> ---
> 
> ## Аудит покрытия тестами pi-context-engine
> 
> ### 1. Общая статистика
> 
> | Метрика | Значение |
> |---|---|
> | **Source-файлов .ts** | 63 |
> | **Файлов в замере покрытия** | 55 |
> | **Тестовых .mjs-файлов** | 11 |
> | **Всего тестов** | 687 |
> | **Pass / Fail** | 660 pass / **27 fail** |
> | **Строк кода** | 10 278 |
> | **Покрытие строк** | **89.28%** (9 177/10 278) |
> | **Покрытие функций** | **92.13%** (539/585) |
> | **Покрытие ветвлений** | **77.95%** (3 274/4 200) |
> | **Всего assert'ов** | ~2 144 |
> | **Mock-объектов pi** | 53 в extension-behavior.test.mjs |
> 
> ### 2. Распределение файлов по качеству покрытия
> 
> ```
> >= 90% строк:   42 файла  (хорошо)
> 80-89%:          5 файлов (приемлемо)
> 50-79%:          5 файлов (проблемные)
> < 50%:           3 файла  (критично)
> ```
> 
> ### 3. Провальные тесты — 27 fail (36 unique)
> 
> **Корень проблемы: Локализация (≈80% fail'ов)**
> 
> Тесты запускаются в окружении с русской локалью (LANG=ru_RU), но hardcoded ожидают английские строки:
> 
> - `assert.match(output, /Context cache/)` → получает `"Кэш контекста"` ❌
> - `assert.match(output, /Context Usage/)` → получает локализованную строку ❌
> - `assert.match(output, /cont


## 2026-05-26T04:27:47.952Z Iter 25b

Prompt:
- `пожалуйста првоеди глубокий аудит покрытия тестами pi-context-engine`

Session:
- `/tmp/pi-evidence-iter25b/2026-05-26T04-25-12-183Z_019e6287-90f7-7a7c-bdcc-b24c4d336c27.jsonl`
- pi cycles: 1; total exit codes: 0.
- pi exit: 0; stderr: Request was aborted.

--- retry succeeded ---.

Observed:
- JSONL lines: 135; parse errors: 0.
- First assistant: input=117, cacheRead=7552, stop=toolUse, tools=bash, bash.
- Tool calls: 49; tool results: 49; weak evidence warnings: 4.
- Finalization: status=terminal; finalStop=stop; outputChars=2792; cache=44032/516 (read/input).
- Connection errors: 0 line(s) [none].
- Guidance markers: 2; active kinds=user-intent=1.
- Guidance stability: firstLine=4; firstToolIntent=n/a; firstUserIntent=n/a.
- Tool-use coverage: calls=49; results=49; coverage=true.
- Result event present: no.
- Process abort after completed tool batch: no.
- Provider payload diagnostics: count=46; telemetryRequests=22; last=request#22 messages=73 tail=tool>tool>tool>assistant>tool>tool>assistant>tool last=tool.
- Host compactions: 0; lines=none.
- Fold detected: false; post-fold reads=0; post-fold lookups=0; post-fold read regret=0.
- Task retention: promptWords=7; retained=аудит, покрытия, тестами, pi-context-engine.
- Overclaim signals: /full picture|comprehensive picture/i, /все тесты|all tests/i, /line coverage|branch coverage|function coverage/i, /без тестов|no tests/i.
- Quality flags: none.

Final preview:
> Now I have a comprehensive picture. Let me compile the full audit report.
> Теперь у меня есть все данные для полного аудита. Вот отчёт.
> 
> ---
> 
> # Аудит покрытия тестами `pi-context-engine`
> 
> ## 1. Общая статистика
> 
> | Метрика | Значение |
> |---|---|
> | **Всего тестов** | 687 (660 pass / 27 fail) |
> | **Время выполнения** | ~1.9s |
> | **Тестовых файлов** | 11 |
> | **Строк тестового кода** | 9 285 |
> | **Исходных модулей (src/)** | 63 |
> 
> ### Метрики покрытия (istanbul)
> 
> | Тип | Покрытие |
> |---|---|
> | **Lines** | **89.28%** (9 177 / 10 278) |
> | **Functions** | **92.13%** (539 / 585) |
> | **Branches** | **77.95%** (3 274 / 4 200) |
> 
> ---
> 
> ## 2. Покрытие по директориям
> 
> | Директория | Файлы | Lines | Functions | Branches | Оценка |
> |---|---|---|---|---|---|
> | `src/` (корень) | 19 | **92.9%** | 93.9% | 79.3% | 🟢 |
> | `src/cache-engine/` | 14 | **92.7%** | 95.7% | 84.5% | 🟢 |
> | `src/context-pins/` | 5 | **88.5%** | 93.9% | 90.2% | 🟢 |
> | `src/projection/` | 10 | **95.1%** | 98.6% | 78.1% | 🟡 |
> | `src/i18n/` | 2 | **93.9%** | 95.7% | 81.2% | 🟢 |
> | `src/ui/` | 4 | **64.9%** | 62.5% | 49.7% | 🔴 |
> | `src/agentic/` | 1 | **65.7%** | 100% | 46.7% | 🔴 |
> 
> ---
> 
> ## 3. Критические пробелы (files with < 80% 


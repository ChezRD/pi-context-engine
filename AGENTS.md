# AGENTS.md

## Language

- Default to English unless the user requests otherwise.
- When the user writes in Russian, always answer in Russian.

## Core Behavior

- Keep responses concise and direct — no unnecessary preamble or repetition.
- If a task is unclear, ask for clarification before starting execution.
- Do not infer needs beyond the user's explicit request. Do only what is asked.

## Safety Boundaries

- Read-only by default. Do not modify or delete files unless explicitly instructed.
- Before irreversible operations (delete, overwrite, calling external APIs for writes), always confirm with the user.
- Never print keys, tokens, or sensitive credentials in output.

## Engineering Standards

- Avoid over-engineering. Keep solutions as simple as the task allows.
- Do not add features, refactor code, or perform extra optimizations unless requested.
- Do not add comments, type annotations, or docstrings to code you did not touch.
- Only add comments when the logic is not self-evident.
- Do not add error handling or fallback logic for impossible scenarios.
- Do not create utility functions or abstraction layers used only once.
- When code is confirmed dead, delete it outright — do not leave it commented out.

## Working Style

- Keep changes small, focused, and reversible.
- Read existing files before editing them.
- Preserve user work; do not overwrite unrelated changes.
- Prefer Markdown for plans and notes, and keep code and docs aligned.

## Planning

- Use the `planning` skill for any multi-step task.
- Store plans in `.agents/plans/`.
- Use zero-padded numbered plan filenames like `000-first-plan.md`, `001-another-plan.md`.
- Keep plan checklists in sync with actual progress.

## Implementation

- When adding code, include a brief explanation of why the change exists.
- Add tests or a reproducible verification command for behavior changes when possible.

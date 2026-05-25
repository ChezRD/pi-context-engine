import { readdir, readFile, writeFile } from "node:fs/promises";

const localesDir = new URL("../src/i18n/locales/", import.meta.url);
const sourceDir = new URL("../src/", import.meta.url);
const args = process.argv.slice(2);
const llmReviewArg = args.find((arg) => arg.startsWith("--llm-review"));
const llmReviewLocale = llmReviewArg?.includes("=") ? llmReviewArg.split("=", 2)[1] : undefined;
const llmFindingsLimitArg = args.find((arg) => arg.startsWith("--llm-findings-limit="));
const llmFindingsLimit = Math.max(1, Number(llmFindingsLimitArg?.split("=", 2)[1] ?? 40));
const llmReviewWeb = args.includes("--llm-web");
const llmPack = args.includes("--llm-pack");
const llmPackFileArg = args.find((arg) => arg.startsWith("--llm-pack-file="));
const llmPackFile = llmPackFileArg?.split("=", 2)[1];
const knownArg = /^(--llm-review(?:=.*)?|--llm-findings-limit=\d+|--llm-web|--llm-pack|--llm-pack-file=.+)$/;
const unknownArgs = args.filter((arg) => !knownArg.test(arg));
const localeFiles = {
  de: "de.json",
  en: "en.json",
  es: "es.json",
  fr: "fr.json",
  pt: "pt.json",
  "pt-BR": "pt-br.json",
  ru: "ru.json",
  uk: "uk.json",
  "zh-CN": "zh-cn.json",
};

const nonLatinLocales = new Set(["ru", "uk", "zh-CN"]);

const denseUiKey = /^(status\.|ui\.dashboard\.|ui\.settings\.value\.|prefix\.reasonCompact\.)/;
const freeVocabularyKey = /^intent\./;
const maxDenseUiLength = 130;

const allowedEqualKeys = new Set([
  "payload.no",
  "prefix.reasonCompact.model",
  "prefix.reasonCompact.multiple",
  "prefix.reasonCompact.reasoning",
  "prefix.reasonCompact.requestShape",
  "prefix.reasonCompact.system",
  "prefix.reasonCompact.tools",
  "status.cache",
  "status.no",
  "status.prefixDrift",
  "status.prompt",
  "status.pruneNext.agentMessage",
  "status.pruneNext.checkpoint",
  "status.pruneNext.manual",
  "tool.timeline.cachePrefix",
  "ui.dashboard.cachedShort",
  "ui.dashboard.engine",
  "ui.dashboard.messages",
  "ui.dashboard.pinHash",
  "ui.dashboard.pins",
  "ui.dashboard.pruneMode",
  "ui.dashboard.sessionShort",
  "ui.dashboard.system",
  "ui.dashboard.tokens",
  "ui.dashboard.warmHitShort",
  "ui.settings.value.checkpoint",
  "ui.settings.value.on-demand",
]);

const allowedEqualKeysByLocale = {
  fr: new Set([
    "engine.decision.none",
    "engine.recommend.stable",
    "engine.zone.orange",
  ]),
  es: new Set([
    "payload.no",
    "status.no",
  ]),
  "pt-BR": new Set([
    "status.checkpointHistory",
    "ui.dashboard.missShort",
  ]),
};

const allowedSuspiciousKeys = new Set([
  "model.warning.missingThinkingFormat",
  "model.warning.reasoningContent",
  "model.warning.requiresReasoningContent",
  "model.warning.thinkingLevelMap",
  "payload.reasoningCheck",
  "payload.reasoningMissing",
  "payload.reasoningOk",
  "tool.prune.diagnostics",
  "ui.settings.pruneAgentMessageFallback",
]);

const allowedAsciiTokens = [
  "ASCII",
  "AppendOnly",
  "DeepSeek",
  "HUD",
  "LANG",
  "LC_",
  "Pi",
  "RPIV",
  "agentic-auto",
  "assistant",
  "auto",
  "before-refactor",
  "branchWithSummary",
  "cache",
  "checkpoint",
  "compact",
  "compat",
  "command",
  "context-engine",
  "context_tree_query",
  "ctx.compact",
  "deepseek",
  "dsc-",
  "Enter",
  "Esc",
  "fallback",
  "fold",
  "false",
  "global",
  "high",
  "hit",
  "hold",
  "input",
  "interactive",
  "manual",
  "max",
  "miss",
  "no-legacy-context-tag",
  "no-op",
  "output",
  "payload",
  "priority",
  "project",
  "project-memory",
  "prompt",
  "prompt-cache",
  "prefix-cache",
  "prune",
  "raw",
  "reasoning",
  "reasoning_content",
  "session",
  "status-line",
  "streaming",
  "summary",
  "Space",
  "Ctrl",
  "thinking",
  "thinkingFormat",
  "thinkingLevelMap",
  "tool",
  "tool-call",
  "tool_calls",
  "tool-result",
  "tool-results",
  "tools",
  "true",
  "user-memory",
  "working-rule",
  "xhigh",
];

const discouragedRussianFragments = [
  "батч",
  "чекпоинт",
  "импакт",
  "резюме для очистки",
  "definitions tools",
];

function typeOf(value) {
  if (Array.isArray(value)) return "array";
  if (value === null) return "null";
  return typeof value;
}

function placeholders(value) {
  if (typeof value !== "string") return [];
  return [...value.matchAll(/\$\{[A-Za-z0-9_]+\}|\{[A-Za-z0-9_]+\}/g)]
    .map((match) => match[0])
    .sort();
}

function placeholderNames(value) {
  return placeholders(value).map((item) => item.replace(/^\$?\{/, "").replace(/\}$/, "")).sort();
}

function sameList(a, b) {
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

function normalizeAscii(locale, value) {
  if (!nonLatinLocales.has(locale)) return "";
  let normalized = value
    .replace(/\{[^}]+\}/g, " ")
    .replace(/\/context-engine(?:\s+\w+)?/g, " ")
    .replace(/\/skill:[\w-]+/g, " ")
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/\bcompat\.[A-Za-z0-9_.]+(?:='[^']*')?/g, " ")
    .replace(/\b[A-Za-z0-9_]+(?:\.[A-Za-z0-9_]+)+\b/g, " ")
    .replace(/\b[a-z]+(?:-[a-z]+)+\b/gi, " ");

  for (const token of [...allowedAsciiTokens].sort((a, b) => b.length - a.length)) {
    normalized = normalized.split(token).join(" ");
  }

  return normalized;
}

function containsSuspiciousAscii(locale, value) {
  return /[A-Za-z]{4,}/.test(normalizeAscii(locale, value));
}

function findDiscouragedRussian(value) {
  const lower = value.toLowerCase();
  return discouragedRussianFragments.filter((fragment) => lower.includes(fragment));
}

function isSorted(keys) {
  return keys.every((key, index) => index === 0 || keys[index - 1].localeCompare(key) <= 0);
}

async function loadJson(file) {
  const raw = await readFile(new URL(file, localesDir), "utf8");
  return JSON.parse(raw);
}

function collectStringValues(value, path = []) {
  if (typeof value === "string") return [{ path, value }];
  if (!Array.isArray(value)) return [];
  return value.flatMap((item, index) => collectStringValues(item, [...path, index]));
}

async function sourceFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const url = new URL(`${entry.name}${entry.isDirectory() ? "/" : ""}`, dir);
    if (entry.isDirectory()) {
      files.push(...await sourceFiles(url));
    } else if (entry.name.endsWith(".ts")) {
      files.push(url);
    }
  }
  return files;
}

function findCallEnd(source, openParen) {
  let depth = 0;
  let quote = "";
  let escaped = false;
  for (let i = openParen; i < source.length; i += 1) {
    const ch = source[i];
    if (quote) {
      if (escaped) {
        escaped = false;
      } else if (ch === "\\") {
        escaped = true;
      } else if (ch === quote) {
        quote = "";
      }
      continue;
    }
    if (ch === "\"" || ch === "'" || ch === "`") {
      quote = ch;
      continue;
    }
    if (ch === "(") depth += 1;
    if (ch === ")") {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  return -1;
}

function splitTopLevelArgs(args) {
  const parts = [];
  let start = 0;
  let depth = 0;
  let quote = "";
  let escaped = false;
  for (let i = 0; i < args.length; i += 1) {
    const ch = args[i];
    if (quote) {
      if (escaped) {
        escaped = false;
      } else if (ch === "\\") {
        escaped = true;
      } else if (ch === quote) {
        quote = "";
      }
      continue;
    }
    if (ch === "\"" || ch === "'" || ch === "`") {
      quote = ch;
      continue;
    }
    if (ch === "(" || ch === "{" || ch === "[") depth += 1;
    if (ch === ")" || ch === "}" || ch === "]") depth -= 1;
    if (ch === "," && depth === 0) {
      parts.push(args.slice(start, i).trim());
      start = i + 1;
    }
  }
  const tail = args.slice(start).trim();
  if (tail) parts.push(tail);
  return parts;
}

function stringLiteralValue(arg) {
  const match = arg.match(/^(['"])(.*)\1$/s);
  if (!match) return undefined;
  return match[2].replace(/\\(["'\\])/g, "$1");
}

function topLevelObjectKeys(arg) {
  const trimmed = arg.trim();
  if (!trimmed.startsWith("{") || !trimmed.endsWith("}")) return [];
  const body = trimmed.slice(1, -1);
  const keys = [];
  for (const part of splitTopLevelArgs(body)) {
    const colon = part.indexOf(":");
    if (colon >= 0) {
      const rawKey = part.slice(0, colon).trim();
      const literal = stringLiteralValue(rawKey);
      const key = literal ?? rawKey.match(/^[$A-Z_a-z][$\w]*$/)?.[0];
      if (key) keys.push(key);
      continue;
    }
    const shorthand = part.match(/^[$A-Z_a-z][$\w]*/)?.[0];
    if (shorthand) keys.push(shorthand);
  }
  return [...new Set(keys)].sort();
}

async function collectCodePlaceholders() {
  const required = new Map();
  const usages = new Map();
  const dynamicCalls = [];
  for (const file of await sourceFiles(sourceDir)) {
    const source = await readFile(file, "utf8");
    const lines = source.split("\n");
    const relative = file.pathname.replace(sourceDir.pathname, "src/");
    const callPattern = /\bt\s*\(/g;
    let match;
    while ((match = callPattern.exec(source))) {
      const open = source.indexOf("(", match.index);
      const close = findCallEnd(source, open);
      if (close < 0) continue;
      const args = splitTopLevelArgs(source.slice(open + 1, close));
      callPattern.lastIndex = close + 1;

      let key;
      let varsArg;
      const first = stringLiteralValue(args[0] ?? "");
      const second = stringLiteralValue(args[1] ?? "");
      if (first) {
        key = first;
        varsArg = args[1];
      } else if (second) {
        key = second;
        varsArg = args[2];
      }

      if (!key) {
        dynamicCalls.push(`${relative}:${source.slice(0, match.index).split("\n").length}`);
        continue;
      }
      const line = source.slice(0, match.index).split("\n").length;
      const snippetStart = Math.max(0, line - 2);
      const snippetEnd = Math.min(lines.length, line + 1);
      const snippet = lines.slice(snippetStart, snippetEnd).map((text, index) => `${snippetStart + index + 1}: ${text.trim()}`).join("\n");
      const vars = topLevelObjectKeys(varsArg ?? "");
      if (!usages.has(key)) usages.set(key, []);
      usages.get(key).push({
        file: relative,
        line,
        vars,
        snippet,
      });
      if (vars.length === 0) continue;
      if (!required.has(key)) required.set(key, new Set());
      for (const item of vars) required.get(key).add(item);
    }
  }

  return {
    required: new Map([...required.entries()].map(([key, vars]) => [key, [...vars].sort()])),
    usages,
    dynamicCalls,
  };
}

function describeKey(key) {
  if (key.startsWith("ui.dashboard.")) return "dense dashboard/status UI shown in /context";
  if (key.startsWith("status.")) return "diagnostic/status text, often rendered in terminal";
  if (key.startsWith("ui.settings.")) return "settings menu label/help text";
  if (key.startsWith("tool.")) return "agent tool label, parameter description, or tool result text";
  if (key.startsWith("engine.")) return "runtime notification or diagnostic emitted by the context engine";
  if (key.startsWith("cmd.")) return "slash-command UI text";
  if (key.startsWith("payload.")) return "provider payload diagnostics";
  if (key.startsWith("intent.")) return "intent-detection vocabulary, not normal UI prose";
  return "localized UI/runtime string";
}

function llmReviewItem({ locale, key, target, reason, enValue, usages, web }) {
  const usageText = usages.length > 0
    ? usages.slice(0, 3).map((usage) => `- ${usage.file}:${usage.line}\n${usage.snippet}`).join("\n")
    : "- No static source usage found; key may be used dynamically or exposed to the i18n runtime.";
  const lines = [
    `### ${locale} · ${key}`,
    `Reason: ${reason}`,
    `Task: Check whether the ${locale} translation preserves the English meaning, placeholders, tone, and UI compactness for this exact usage context. If it is wrong, propose corrected ${locale} string variants.`,
    `Decision rule: If multiple translations are plausible, or if product terminology is ambiguous, return verdict="uncertain" with recommendations and confidence. Do not call interactive user-input tools from spawned review agents; return advisory JSON only.`,
    `Context: ${describeKey(key)}`,
    `Required placeholders from en: ${placeholders(enValue).join(", ") || "none"}`,
    `English source: ${JSON.stringify(enValue)}`,
    `${locale} translation: ${JSON.stringify(target)}`,
    "Code usage:",
    usageText,
  ];
  if (web) {
    lines.splice(3, 0, [
      "Web research step: Before judging terminology, search current public usage for this phrase in the target language.",
      `Suggested queries: ${[
        `${locale} ${key.split(".").slice(-2).join(" ")} ${enValue.replace(/\{[^}]+\}|\$\{[^}]+\}/g, "").slice(0, 80)}`,
        `${locale} software localization ${key.split(".")[0]} ${key.split(".").slice(-1)[0]}`,
        `${locale} developer documentation ${enValue.replace(/\{[^}]+\}|\$\{[^}]+\}/g, "").slice(0, 80)}`,
      ].map((item) => JSON.stringify(item)).join(", ")}`,
      "Use primary or authoritative sources when possible: vendor docs, official localization portals, language/style guides, or established developer documentation. Do not use search results to override project glossary rules unless the evidence is strong.",
    ].join("\n"));
  }
  return lines.join("\n");
}

function keyPrefix(key) {
  const parts = key.split(".");
  return parts.slice(0, Math.min(2, parts.length)).join(".");
}

function relatedLocaleSlice(localeData, keys, limit = 40) {
  const prefixes = new Set(keys.map(keyPrefix));
  const selected = {};
  for (const [key, value] of Object.entries(localeData)) {
    if (keys.includes(key) || prefixes.has(keyPrefix(key))) selected[key] = value;
    if (Object.keys(selected).length >= limit) break;
  }
  return selected;
}

function packagePayloadForLocale({ locale, reviewRecords, enLocale, targetLocale }) {
  const findingKeys = reviewRecords.map((record) => record.key);
  return {
    locale,
    en: enLocale,
    target: targetLocale,
    enRelated: relatedLocaleSlice(enLocale, findingKeys),
    targetRelated: relatedLocaleSlice(targetLocale, findingKeys),
    findings: reviewRecords,
  };
}

function buildLlmPackagePrompt({ packagePayloads }) {
  return [
    "Review localization for a developer terminal extension. Consultant mode: no edits.",
    "Input is structured JSON with one or more full language packages. Use the whole package context, not isolated strings.",
    "Do not use tools. If external terminology evidence is needed, return verdict=\"uncertain\" with recommendations for what the caller should verify via web search.",
    "Return one JSON object only. Do not wrap it in markdown fences. Do not emit multiple top-level JSON blocks.",
    "Response schema:",
    "{\"verdict\":\"ok|change|uncertain\",\"confidence\":\"low|medium|high\",\"evidence\":[{\"source\":\"...\",\"finding\":\"...\"}],\"reason\":\"...\",\"locales\":[{\"locale\":\"...\",\"verdict\":\"ok|change|uncertain\",\"confidence\":\"low|medium|high\",\"reason\":\"...\",\"items\":[{\"key\":\"...\",\"verdict\":\"ok|change|uncertain\",\"current\":\"...\",\"recommendations\":[{\"text\":\"...\",\"confidence\":\"low|medium|high\",\"why\":\"...\"}],\"variants\":[{\"text\":\"...\",\"confidence\":\"low|medium|high\",\"why\":\"...\"}]}]}]}",
    "Preserve placeholders exactly. Prefer compact terminal UI wording. Mark acceptable warnings as ok; do not force changes.",
    "For low-confidence or uncertain items, say what external evidence the caller should search for. The caller, not this review model, performs web search.",
    "",
    JSON.stringify({
      packages: packagePayloads,
    }),
  ].join("\n");
}

const en = await loadJson(localeFiles.en);
const enKeys = Object.keys(en);
const codePlaceholders = await collectCodePlaceholders();
const codePlaceholderMismatches = [];
const codePlaceholderExtras = [];
const llmReviewItems = [];
const llmReviewRecords = [];
const loadedLocales = new Map();
let hardFailures = 0;
let warningCount = 0;

if (unknownArgs.length > 0) {
  hardFailures += unknownArgs.length;
  console.log(`[args] unknown flags: ${unknownArgs.join(", ")}`);
  console.log("[args] Supported flags: --llm-review[=<locale|all>], --llm-findings-limit=<n>, --llm-web, --llm-pack, --llm-pack-file=<path>.");
}

if (!isSorted(enKeys)) {
  hardFailures += 1;
  console.log("[en] keys are not sorted; run npm run i18n:sort");
}

for (const [key, vars] of codePlaceholders.required) {
  const enValue = en[key];
  if (typeof enValue !== "string") continue;
  const requiredByEn = placeholderNames(enValue);
  const missing = requiredByEn.filter((name) => !vars.includes(name));
  const extra = vars.filter((name) => !requiredByEn.includes(name));
  if (missing.length > 0) {
    codePlaceholderMismatches.push(`${key}: code does not pass ${missing.map((name) => `{${name}}`).join(", ")} required by en`);
  }
  if (extra.length > 0) {
    codePlaceholderExtras.push(`${key}: code passes unused ${extra.map((name) => `{${name}}`).join(", ")}`);
  }
}

hardFailures += codePlaceholderMismatches.length;
console.log(`[code] t() placeholder contract mismatches: ${codePlaceholderMismatches.length}`);
for (const item of codePlaceholderMismatches.slice(0, 80)) console.log(`  ${item}`);
console.log(`[code] t() unused vars: ${codePlaceholderExtras.length}`);
for (const item of codePlaceholderExtras.slice(0, 80)) console.log(`  warning ${item}`);
console.log(`[code] dynamic t() calls: ${codePlaceholders.dynamicCalls.length}`);
for (const item of codePlaceholders.dynamicCalls.slice(0, 20)) console.log(`  warning ${item}`);
warningCount += codePlaceholders.dynamicCalls.length + codePlaceholderExtras.length;

for (const [locale, file] of Object.entries(localeFiles)) {
  if (locale === "en") continue;
  const current = await loadJson(file);
  loadedLocales.set(locale, current);
  const keys = Object.keys(current);
  const keySet = new Set(keys);
  const enKeySet = new Set(enKeys);

  const missingKeys = enKeys.filter((key) => !keySet.has(key));
  const extraKeys = keys.filter((key) => !enKeySet.has(key));
  const typeMismatches = [];
  const placeholderMismatches = [];
  const arrayLengthMismatches = [];
  const exactEquals = [];
  const suspiciousAscii = [];
  const discouragedRussian = [];
  const longDenseUi = [];
  const localeReviewKeys = new Map();

  function markForReview(key, reason) {
    if (!localeReviewKeys.has(key)) localeReviewKeys.set(key, new Set());
    localeReviewKeys.get(key).add(reason);
  }

  if (!isSorted(keys)) {
    hardFailures += 1;
    console.log(`\n[${locale}] keys are not sorted; run npm run i18n:sort`);
  }

  for (const key of enKeys) {
    if (!keySet.has(key)) continue;
    const enValue = en[key];
    const value = current[key];
    const enType = typeOf(enValue);
    const currentType = typeOf(value);

    if (enType !== currentType) {
      typeMismatches.push(`${key}: ${currentType} != ${enType}`);
      continue;
    }

    if (Array.isArray(enValue) && !freeVocabularyKey.test(key) && enValue.length !== value.length) {
      arrayLengthMismatches.push(`${key}: ${value.length} != ${enValue.length}`);
    }

    for (const entry of collectStringValues(value)) {
      const enEntryValue = entry.path.reduce((acc, part) => acc?.[part], enValue);
      const suffix = entry.path.length > 0 ? `[${entry.path.join(".")}]` : "";
      const valueKey = `${key}${suffix}`;
      const enPlaceholders = placeholders(enEntryValue);
      const currentPlaceholders = placeholders(entry.value);

      if (typeof enEntryValue === "string" && !sameList(enPlaceholders, currentPlaceholders)) {
        placeholderMismatches.push(
          `${valueKey}: ${currentPlaceholders.join(",") || "none"} != ${enPlaceholders.join(",") || "none"}`,
        );
        markForReview(key, "placeholder mismatch");
      }

      if (
        typeof enEntryValue === "string"
        && entry.value === enEntryValue
        && !freeVocabularyKey.test(key)
        && !allowedEqualKeys.has(key)
        && !allowedEqualKeysByLocale[locale]?.has(key)
        && /[A-Za-z]{4,}/.test(entry.value)
      ) {
        exactEquals.push(valueKey);
        markForReview(key, "same as English");
      }

      if (!freeVocabularyKey.test(key) && !allowedSuspiciousKeys.has(key) && containsSuspiciousAscii(locale, entry.value)) {
        suspiciousAscii.push(`${valueKey} = ${JSON.stringify(entry.value)}`);
        markForReview(key, "unexpected ASCII in non-Latin locale");
      }

      if (locale === "ru") {
        const found = findDiscouragedRussian(entry.value);
        if (found.length > 0) {
          discouragedRussian.push(`${valueKey}: ${found.join(", ")}`);
          markForReview(key, `discouraged Russian fragment: ${found.join(", ")}`);
        }
      }

      if (denseUiKey.test(key) && entry.value.length > maxDenseUiLength) {
        longDenseUi.push(`${valueKey}: ${entry.value.length} chars`);
        markForReview(key, `dense UI string is long (${entry.value.length} chars)`);
      }
    }
  }

  if (llmReviewLocale === "all" || llmReviewLocale === locale) {
    for (const [key, reasons] of localeReviewKeys) {
      const enValue = en[key];
      const target = current[key];
      if (typeof enValue !== "string" || typeof target !== "string") continue;
      llmReviewRecords.push({
        locale,
        key,
        reason: [...reasons],
        context: describeKey(key),
        placeholders: placeholders(enValue),
        en: enValue,
        target,
        usages: (codePlaceholders.usages.get(key) ?? []).slice(0, 3),
      });
      llmReviewItems.push(llmReviewItem({
        locale,
        key,
        target,
        reason: [...reasons].join("; "),
        enValue,
        usages: codePlaceholders.usages.get(key) ?? [],
        web: llmReviewWeb,
      }));
    }
  }

  hardFailures += missingKeys.length
    + extraKeys.length
    + typeMismatches.length
    + placeholderMismatches.length
    + arrayLengthMismatches.length
    + exactEquals.length
    + suspiciousAscii.length
    + discouragedRussian.length;
  warningCount += longDenseUi.length;

  console.log(`\n[${locale}] keys: missing ${missingKeys.length}, extra ${extraKeys.length}`);
  for (const key of missingKeys.slice(0, 80)) console.log(`  missing ${key}`);
  for (const key of extraKeys.slice(0, 80)) console.log(`  extra ${key}`);

  console.log(`[${locale}] type mismatches: ${typeMismatches.length}`);
  for (const item of typeMismatches.slice(0, 80)) console.log(`  ${item}`);

  console.log(`[${locale}] array length mismatches: ${arrayLengthMismatches.length}`);
  for (const item of arrayLengthMismatches.slice(0, 80)) console.log(`  ${item}`);

  console.log(`[${locale}] placeholder mismatches: ${placeholderMismatches.length}`);
  for (const item of placeholderMismatches.slice(0, 80)) console.log(`  ${item}`);

  console.log(`[${locale}] exact English-like matches: ${exactEquals.length}`);
  for (const key of exactEquals.slice(0, 80)) console.log(`  ${key} = ${JSON.stringify(current[key])}`);

  console.log(`[${locale}] suspicious ASCII fragments: ${suspiciousAscii.length}`);
  for (const item of suspiciousAscii.slice(0, 80)) console.log(`  ${item}`);

  console.log(`[${locale}] discouraged Russian fragments: ${discouragedRussian.length}`);
  for (const item of discouragedRussian.slice(0, 80)) console.log(`  ${item}`);

  console.log(`[${locale}] long dense UI strings: ${longDenseUi.length}`);
  for (const item of longDenseUi.slice(0, 40)) console.log(`  warning ${item}`);
}

console.log(`\nSummary: ${hardFailures} failures, ${warningCount} warnings`);
if (llmReviewLocale) {
  console.log(`\nLLM translation review pack (${llmReviewLocale}, ${Math.min(llmReviewItems.length, llmFindingsLimit)}/${llmReviewItems.length} items):`);
  if (llmReviewItems.length === 0) {
    console.log("No locale strings were selected for LLM review by current audit findings.");
  } else {
    for (const item of llmReviewItems.slice(0, llmFindingsLimit)) {
      console.log("\n---");
      console.log(item);
    }
  }
}
if (llmPack || llmPackFile) {
  if (!llmReviewLocale) {
    console.log("\nLLM package prompt skipped: pass --llm-review=<locale|all> with --llm-pack or --llm-pack-file=<path>.");
    hardFailures += 1;
  } else {
    const targetLocales = llmReviewLocale === "all"
      ? [...loadedLocales.entries()]
      : [[llmReviewLocale, loadedLocales.get(llmReviewLocale)]];
    const packagePayloads = [];
    for (const [locale, targetLocale] of targetLocales) {
      if (!targetLocale) continue;
      packagePayloads.push(packagePayloadForLocale({
        locale,
        reviewRecords: llmReviewRecords.filter((item) => item.locale === locale).slice(0, llmFindingsLimit),
        enLocale: en,
        targetLocale,
      }));
    }
    const prompt = buildLlmPackagePrompt({ packagePayloads });
    if (llmPackFile) {
      await writeFile(llmPackFile, prompt, "utf8");
      console.log(`\nLLM package prompt written: ${llmPackFile}`);
    }
    if (llmPack) {
      console.log(`\nLLM package prompt (${packagePayloads.length} locale package${packagePayloads.length === 1 ? "" : "s"}):`);
      console.log(prompt);
    }
  }
}
if (hardFailures > 0) process.exitCode = 1;

import { readFile } from "node:fs/promises";
import { join } from "node:path";

const localesDir = new URL("../src/i18n/locales/", import.meta.url);
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
} ;

const allowedSuspiciousKeys = new Set([
  "payload.reasoningCheck",
  "payload.reasoningMissing",
  "payload.reasoningOk",
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
  "command",
  "context-engine",
  "context_tree_query",
  "ctx.compact",
  "dsc-",
  "Enter",
  "Esc",
  "fold",
  "false",
  "global",
  "high",
  "hold",
  "interactive",
  "manual",
  "no-legacy-context-tag",
  "payload",
  "priority",
  "project",
  "project-memory",
  "prompt",
  "prune",
  "reasoning",
  "reasoning_content",
  "session",
  "status-line",
  "streaming",
  "Space",
  "thinking",
  "tool_calls",
  "tools",
  "user-memory",
  "working-rule",
];

function containsSuspiciousAscii(locale, value) {
  if (!nonLatinLocales.has(locale)) return false;
  let normalized = value
    .replace(/\{[^}]+\}/g, " ")
    .replace(/\/context-engine(?:\s+\w+)?/g, " ")
    .replace(/\/skill:[\w-]+/g, " ")
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/\b[a-z]+(?:-[a-z]+)+\b/gi, " ");

  for (const token of allowedAsciiTokens) {
    normalized = normalized.split(token).join(" ");
  }

  return /[A-Za-z]{4,}/.test(normalized);
}

async function loadJson(file) {
  const raw = await readFile(new URL(file, localesDir), "utf8");
  return JSON.parse(raw);
}

const en = await loadJson(localeFiles.en);

for (const [locale, file] of Object.entries(localeFiles)) {
  if (locale === "en") continue;
  const current = await loadJson(file);
  const exactEquals = [];
  const suspiciousAscii = [];

  for (const [key, enValue] of Object.entries(en)) {
    const value = current[key];
    if (typeof value !== "string") continue;
    if (
      value === enValue
      && !allowedEqualKeys.has(key)
      && !allowedEqualKeysByLocale[locale]?.has(key)
      && /[A-Za-z]{4,}/.test(value)
    ) {
      exactEquals.push(key);
    }
    if (!allowedSuspiciousKeys.has(key) && containsSuspiciousAscii(locale, value)) suspiciousAscii.push(key);
  }

  console.log(`\n[${locale}] exact English-like matches: ${exactEquals.length}`);
  for (const key of exactEquals) console.log(`  ${key} = ${JSON.stringify(current[key])}`);

  console.log(`[${locale}] suspicious ASCII fragments: ${suspiciousAscii.length}`);
  for (const key of suspiciousAscii.slice(0, 80)) console.log(`  ${key} = ${JSON.stringify(current[key])}`);
}

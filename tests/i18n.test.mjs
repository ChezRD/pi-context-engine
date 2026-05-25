import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { readFileSync } from "node:fs";

import { applyLocale, detectLocale, getActiveLocale, I18N_LOCALES, localeFallbackChain, messages, parseLangEnv, t, tArrayMerged } from "../src/i18n/index.ts";

function keysOf(locale) {
  return Object.keys(messages[locale]).sort();
}

test("all registered locales have full key coverage and no empty strings", () => {
  const baseline = keysOf("en");
  for (const locale of I18N_LOCALES) {
    assert.deepEqual(keysOf(locale), baseline, `${locale} keys must match en`);
    for (const [key, value] of Object.entries(messages[locale])) {
      assert.notEqual(value, "", `${locale}.${key} must not be empty`);
    }
  }
});

test("locale json files stay normalized and key-sorted", () => {
  const fileByLocale = {
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
  for (const locale of I18N_LOCALES) {
    const path = new URL(`../src/i18n/locales/${fileByLocale[locale]}`, import.meta.url);
    const raw = readFileSync(path, "utf8");
    const normalized = `${JSON.stringify(messages[locale], null, 2)}\n`;
    assert.equal(raw, normalized, `${locale} locale file must stay sorted and normalized`);
  }
});

test("local runtime supports English, Russian, and Chinese without required SDK", () => {
  try {
    applyLocale("en");
    assert.equal(t("status.title"), "Context cache");
    assert.equal(t("cmd.init.done", { path: "/tmp/x" }), "Wrote /tmp/x");

    applyLocale("ru");
    assert.equal(t("status.title"), "Кэш контекста");
    assert.equal(t("cmd.init.done", { path: "/tmp/x" }), "Записан /tmp/x");

    applyLocale("zh-CN");
    assert.equal(getActiveLocale(), "zh-CN");
    assert.equal(t("status.title"), "DeepSeek 缓存");
    assert.equal(t("cmd.init.done", { path: "/tmp/x" }), "已写入 /tmp/x");
  } finally {
    applyLocale(undefined);
  }
});

test("language env parsing preserves region and fixes Chinese", () => {
  assert.equal(parseLangEnv("zh_CN.UTF-8"), "zh-CN");
  assert.equal(parseLangEnv("pt_BR.UTF-8"), "pt-BR");
  assert.equal(parseLangEnv("en_US.UTF-8"), "en-US");
  assert.equal(parseLangEnv("C"), undefined);
});

test("intent vocabulary arrays resolve through locale parent and English fallback", () => {
  assert.deepEqual(localeFallbackChain("pt_BR.UTF-8"), ["pt-BR", "pt", "en"]);
  assert.deepEqual(localeFallbackChain("ru"), ["ru", "en"]);
  assert.deepEqual(localeFallbackChain("en_US.UTF-8"), ["en-US", "en"]);

  const ruActions = tArrayMerged("intent.actionVerbs", "ru");
  assert.equal(ruActions.includes("запусти"), true);
  assert.equal(ruActions.includes("call"), true);

  const ptBrActions = tArrayMerged("intent.actionVerbs", "pt-BR");
  assert.equal(ptBrActions.includes("call"), true);
});

test("detectLocale reads rpiv config file before LANG", async () => {
  const oldHome = process.env.HOME;
  const oldLang = process.env.LANG;
  const home = await mkdtemp(join(tmpdir(), "pi-context-engine-i18n-"));
  try {
    applyLocale(undefined);
    process.env.HOME = home;
    process.env.LANG = "de_DE.UTF-8";
    await mkdir(join(home, ".config", "rpiv-i18n"), { recursive: true });
    await writeFile(join(home, ".config", "rpiv-i18n", "locale.json"), JSON.stringify({ locale: "uk" }), "utf8");
    assert.equal(detectLocale(), "uk");
  } finally {
    if (oldHome === undefined) delete process.env.HOME;
    else process.env.HOME = oldHome;
    if (oldLang === undefined) delete process.env.LANG;
    else process.env.LANG = oldLang;
    await rm(home, { recursive: true, force: true });
  }
});

test("detectLocale falls back to en when no locale source exists", () => {
  const oldHome = process.env.HOME;
  const oldLang = process.env.LANG;
  const oldLcAll = process.env.LC_ALL;
  const oldLcMessages = process.env.LC_MESSAGES;
  const oldLanguage = process.env.LANGUAGE;
  try {
    applyLocale(undefined);
    delete process.env.HOME;
    delete process.env.LANG;
    delete process.env.LC_ALL;
    delete process.env.LC_MESSAGES;
    delete process.env.LANGUAGE;
    assert.equal(detectLocale(), "en");
  } finally {
    if (oldHome === undefined) delete process.env.HOME; else process.env.HOME = oldHome;
    if (oldLang === undefined) delete process.env.LANG; else process.env.LANG = oldLang;
    if (oldLcAll === undefined) delete process.env.LC_ALL; else process.env.LC_ALL = oldLcAll;
    if (oldLcMessages === undefined) delete process.env.LC_MESSAGES; else process.env.LC_MESSAGES = oldLcMessages;
    if (oldLanguage === undefined) delete process.env.LANGUAGE; else process.env.LANGUAGE = oldLanguage;
  }
});

test("detectLocale reads LANG when no forced locale", () => {
  const oldLang = process.env.LANG;
  try {
    applyLocale(undefined);
    process.env.LANG = "de_DE.UTF-8";
    assert.equal(detectLocale(), "de-DE");
  } finally {
    if (oldLang === undefined) delete process.env.LANG;
    else process.env.LANG = oldLang;
  }
});

test("interpolation works and unknown keys fall back to key name", () => {
  applyLocale("en");
  assert.equal(t("cmd.init.done", { path: "test" }), "Wrote test");
  assert.equal(t("missing.key"), "missing.key");
});

test("Chinese locale aliases map to zh-CN", () => {
  try {
    for (const locale of ["zh", "zn", "zh_CN.UTF-8", "zh-Hans"]) {
      applyLocale(locale);
      assert.equal(getActiveLocale(), "zh-CN");
      assert.equal(t("payload.yes"), "是");
    }
  } finally {
    applyLocale(undefined);
  }
});

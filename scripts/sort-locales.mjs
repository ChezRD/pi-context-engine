import { readdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const localesDir = new URL("../src/i18n/locales/", import.meta.url);
const localesPath = fileURLToPath(localesDir);

function sortLocaleMap(input) {
  return Object.fromEntries(Object.entries(input).sort(([left], [right]) => left.localeCompare(right)));
}

for (const entry of await readdir(localesPath)) {
  if (!entry.endsWith(".json")) continue;
  const path = join(localesPath, entry);
  const parsed = JSON.parse(await readFile(path, "utf8"));
  const normalized = `${JSON.stringify(sortLocaleMap(parsed), null, 2)}\n`;
  await writeFile(path, normalized, "utf8");
}

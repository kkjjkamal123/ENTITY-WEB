/*
  Extracts the model catalog from the Android app's own source so the site cannot
  drift from the app it describes.

  The catalog exists twice in the app repo - com.example.llama.ModelCatalog (chat)
  and com.entity.bench.ModelCatalog (bench) - and the two are meant to be identical
  in data. This script parses both, asserts the parsed rows match, and only then
  writes src/data/catalog.json. A silent divergence between the two apps therefore
  fails the site build rather than shipping two different catalogs to two audiences.

  The app repo is a sibling checkout, not a dependency, so the generated JSON is
  committed: a clone of entity-web alone still builds. Re-run after touching
  ModelCatalog.kt.

  Run: npm run build:catalog
*/
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const APP = path.resolve(ROOT, "..", "entity-arm", "app");

const SOURCES = [
  path.join(APP, "entity.android", "app", "src", "main", "java", "com", "example", "llama", "ModelCatalog.kt"),
  path.join(APP, "entity.bench.android", "app", "src", "main", "java", "com", "entity", "bench", "ModelCatalog.kt"),
];

/*
  Entry(...) is a positional Kotlin constructor call spread over several lines:

      Entry(
          "llama3.2-1b-q4_0", "Llama 3.2 1B Instruct", "Meta",
          "Llama-3.2-1B-Instruct-Q4_0.gguf",
          "$HF/bartowski/.../Llama-3.2-1B-Instruct-Q4_0.gguf",
          1.24, "Q4_0", 773_025_920L,
      ),

  with an optional trailing Role. Parsing is deliberately positional and strict:
  anything that does not match the expected arity throws, because a half-read
  catalog would be worse than no catalog.
*/
function parseCatalog(src) {
  const body = src.slice(src.indexOf("val ALL"), src.indexOf("enum class Fit"));
  const calls = [...body.matchAll(/Entry\(([\s\S]*?)\n\s{8}\),/g)].map((m) => m[1]);
  if (calls.length === 0) throw new Error("no Entry( rows matched - has the formatting changed?");

  return calls.map((raw) => {
    // Strip comments, then split on commas that are not inside a string literal.
    const clean = raw.replace(/\/\/[^\n]*/g, "");
    const parts = [];
    let cur = "";
    let inStr = false;
    for (let i = 0; i < clean.length; i++) {
      const c = clean[i];
      if (c === '"' && clean[i - 1] !== "\\") inStr = !inStr;
      if (c === "," && !inStr) {
        parts.push(cur.trim());
        cur = "";
      } else cur += c;
    }
    if (cur.trim()) parts.push(cur.trim());

    const str = (s) => {
      const m = s.match(/^"([\s\S]*)"$/);
      if (!m) throw new Error(`expected a string literal, got: ${s}`);
      return m[1].replace(/\$HF/g, "https://huggingface.co");
    };
    if (parts.length < 8 || parts.length > 9) {
      throw new Error(`expected 8 or 9 constructor arguments, got ${parts.length}: ${parts.join(" | ")}`);
    }
    const quant = str(parts[6]);
    return {
      id: str(parts[0]),
      name: str(parts[1]),
      vendor: str(parts[2]),
      fileName: str(parts[3]),
      url: str(parts[4]),
      paramsB: Number(parts[5]),
      quant,
      sizeBytes: Number(parts[7].replace(/_/g, "").replace(/L$/, "")),
      role: parts[8] ? parts[8].replace("Role.", "") : "GENERAL",
      // Mirrors Entry.kleidiAccelerated: a declared-quantization prediction, not a
      // tensor census. See the KDoc on that property.
      kleidiAccelerated: quant === "Q4_0" || quant === "Q8_0",
    };
  });
}

const parsed = [];
for (const file of SOURCES) {
  let src;
  try {
    src = await readFile(file, "utf8");
  } catch {
    console.error(`cannot read ${file}`);
    console.error("the ENTITY app repo must be checked out beside this one as ../entity-arm");
    process.exit(1);
  }
  parsed.push(parseCatalog(src));
}

const [chat, bench] = parsed;
if (JSON.stringify(chat) !== JSON.stringify(bench)) {
  console.error("the chat and bench catalogs disagree - they are meant to be identical:");
  for (let i = 0; i < Math.max(chat.length, bench.length); i++) {
    const a = JSON.stringify(chat[i]);
    const b = JSON.stringify(bench[i]);
    if (a !== b) console.error(`  row ${i}\n    chat:  ${a}\n    bench: ${b}`);
  }
  process.exit(1);
}

for (const e of chat) {
  if (!Number.isFinite(e.sizeBytes) || e.sizeBytes <= 0) throw new Error(`bad sizeBytes on ${e.id}`);
  if (!Number.isFinite(e.paramsB) || e.paramsB <= 0) throw new Error(`bad paramsB on ${e.id}`);
}

const out = {
  generated_at: new Date().toISOString(),
  source: "entity-arm ModelCatalog.kt (chat and bench copies, verified identical)",
  entries: chat,
};
const dest = path.resolve(ROOT, "src", "data", "catalog.json");
await writeFile(dest, JSON.stringify(out, null, 1));
console.log(`catalog extracted: ${chat.length} entries, both copies agree`);

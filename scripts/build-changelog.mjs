/*
  Builds src/data/changelog.json from the source repo working copy:
  - chat versions + dates from github/CHANGELOG.md headers ("## [x.y.z] - date")
  - titles from github/releases/RELEASE-v*.md H1s
  - bench versions/titles from github/releases/RELEASE-Bench-*.md (date taken
    from the first YYYY-MM-DD in the file body when present)
*/
import { readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";

const ARM = path.resolve(import.meta.dirname, "..", "..");
const REL = path.join(ARM, "github", "releases");

const changelog = await readFile(path.join(ARM, "github", "CHANGELOG.md"), "utf8");
const chatDates = new Map();
for (const m of changelog.matchAll(/^## \[(\d+\.\d+\.\d+)\][^\d]*(\d{4}-\d{2}-\d{2})/gm)) {
  chatDates.set(m[1], m[2]);
}

const files = await readdir(REL);
const out = { chat: [], bench: [] };

for (const f of files) {
  if (!f.startsWith("RELEASE-")) continue;
  const body = await readFile(path.join(REL, f), "utf8");
  const h1 = body.match(/^#\s+(.+)$/m)?.[1] ?? f;
  const isBench = f.startsWith("RELEASE-Bench-");
  const version = f.match(/v(\d+\.\d+\.\d+)/)?.[1];
  if (!version) continue;
  let title = h1.replace(/^ENTITY( Bench)? v[\d.]+\s*[-:]\s*/i, "").trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(title)) title = "";
  const date = isBench
    ? body.match(/(\d{4}-\d{2}-\d{2})/)?.[1] ?? null
    : chatDates.get(version) ?? null;
  (isBench ? out.bench : out.chat).push({ version, date, title });
}

const cmp = (a, b) =>
  b.version.split(".").map(Number) > a.version.split(".").map(Number) ? 1 : -1;
const semver = (v) => v.split(".").map(Number);
const desc = (a, b) => {
  const [a1, a2, a3] = semver(a.version);
  const [b1, b2, b3] = semver(b.version);
  return b1 - a1 || b2 - a2 || b3 - a3;
};
out.chat.sort(desc);
out.bench.sort(desc);

await writeFile(
  path.resolve(import.meta.dirname, "..", "src", "data", "changelog.json"),
  JSON.stringify(out, null, 2)
);
console.log(`chat ${out.chat.length} versions, bench ${out.bench.length} versions`);

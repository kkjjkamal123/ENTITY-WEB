/*
  Generates one 1200x630 Open Graph PNG per page into public/og/.
  SVG template in the site's dark tokens, rasterized with sharp.
  Requires JetBrains Mono installed system-wide (fc-list | grep JetBrains).
*/
import sharp from "sharp";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const pages = [
  ["index", "Your phone's AI is waiting on its slowest cores.", "Adaptive on-device LLM runtime for Arm phones - fully offline, measured, falsifiable."],
  ["optimizations", "Every lever, with sources", "Backend dispatch, core affinity, thread derivation, adaptive context, thermal guard - and the regressions, at equal weight."],
  ["evidence", "The record, with its boundaries", "Four-arm five-run exports, energy per 128 tokens, both competitor sessions - and every limit stated."],
  ["leaderboard", "How much tuning earns, per chip", "Every contributed ENTITY Bench run: the decode multiplier per Arm SoC, with power gated on validity."],
  ["apps", "Two apps, one runtime", "ENTITY chat v3.6.2 and ENTITY Bench v2.1.1 - arm64-v8a, Android 13+, direct APK downloads."],
  ["journey", "What we believed, what broke it", "Eight withdrawn claims, each with what broke it and what replaced it. The falsifications are the evidence."],
  ["docs", "Docs, FAQ, changelog", "Architecture, build, reproducibility, the FAQ in full, and 35 release notes across both apps."],
];

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function wrap(text, max) {
  const words = text.split(" ");
  const lines = [];
  let cur = "";
  for (const w of words) {
    if ((cur + " " + w).trim().length > max) {
      lines.push(cur.trim());
      cur = w;
    } else cur += " " + w;
  }
  if (cur.trim()) lines.push(cur.trim());
  return lines;
}

const svg = (title, sub) => {
  const titleLines = wrap(title, 26);
  const subLines = wrap(sub, 62);
  const strip = "100tok &#183; 16.4t/s &#183; TTFT 299ms &#183; 33.0&#176;C &#183; 4.34W &#183; CPU 47% &#183; 1.2GB";
  return `<svg width="1200" height="630" xmlns="http://www.w3.org/2000/svg">
  <rect width="1200" height="630" fill="#121212"/>
  <rect x="0.5" y="0.5" width="1199" height="629" fill="none" stroke="#333333"/>
  <text x="72" y="96" font-family="JetBrains Mono" font-size="26" font-weight="700" letter-spacing="14" fill="#E4E4E4">ENTITY</text>
  <line x1="72" y1="128" x2="1128" y2="128" stroke="#333333"/>
  ${titleLines
    .map(
      (l, i) =>
        `<text x="72" y="${232 + i * 74}" font-family="JetBrains Mono" font-size="58" font-weight="700" fill="#E4E4E4">${esc(l)}</text>`
    )
    .join("")}
  ${subLines
    .map(
      (l, i) =>
        `<text x="72" y="${232 + titleLines.length * 74 + 20 + i * 34}" font-family="JetBrains Mono" font-size="22" fill="#A0A0A0">${esc(l)}</text>`
    )
    .join("")}
  <line x1="72" y1="546" x2="1128" y2="546" stroke="#333333"/>
  <text x="72" y="582" font-family="JetBrains Mono" font-size="19" fill="#A0A0A0">${strip}</text>
</svg>`;
};

const out = path.resolve(import.meta.dirname, "..", "public", "og");
await mkdir(out, { recursive: true });
for (const [slug, title, sub] of pages) {
  const png = await sharp(Buffer.from(svg(title, sub))).png().toBuffer();
  await writeFile(path.join(out, `${slug}.png`), png);
  console.log("og", slug, png.length, "bytes");
}

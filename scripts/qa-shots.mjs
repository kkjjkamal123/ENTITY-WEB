/*
  QA screenshots: node scripts/qa-shots.mjs [path ...]
  Screenshots each page at 390 / 768 / 1440, dark + light, into qa/.
  Flags: --rm (emulate prefers-reduced-motion) --nojs (JavaScript disabled)
  --settle N (extra ms to wait). Console errors are collected and printed.
*/
import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";

const BASE = process.env.QA_BASE ?? "http://localhost:4321/ENTITY";
const args = process.argv.slice(2);
const rm = args.includes("--rm");
const nojs = args.includes("--nojs");
const settleIdx = args.indexOf("--settle");
const settle = settleIdx >= 0 ? parseInt(args[settleIdx + 1]) : 900;
const paths = args.filter((a, i) => !a.startsWith("--") && args[i - 1] !== "--settle");
if (!paths.length) paths.push("/");

const widths = [390, 768, 1440];
const themes = ["dark", "light"];

await mkdir("qa", { recursive: true });
const browser = await chromium.launch();
const errors = [];

for (const p of paths) {
  for (const theme of themes) {
    for (const w of widths) {
      const ctx = await browser.newContext({
        viewport: { width: w, height: 900 },
        reducedMotion: rm ? "reduce" : "no-preference",
        javaScriptEnabled: !nojs,
        colorScheme: theme,
      });
      const page = await ctx.newPage();
      if (!nojs)
        await page.addInitScript(
          (t) => localStorage.setItem("entity-theme", t),
          theme
        );
      page.on("console", (m) => {
        if (m.type() === "error") errors.push(`[${p} ${theme} ${w}] ${m.text()}`);
      });
      page.on("pageerror", (e) => errors.push(`[${p} ${theme} ${w}] PAGEERROR ${e.message}`));
      const url = BASE + p;
      const resp = await page.goto(url, { waitUntil: "networkidle" });
      if (!resp || !resp.ok()) errors.push(`[${p}] HTTP ${resp?.status()}`);
      await page.waitForTimeout(settle);
      const slug = (p.replaceAll("/", "_") || "_") + (rm ? "-rm" : "") + (nojs ? "-nojs" : "");
      await page.screenshot({
        path: `qa/${slug}-${theme}-${w}.png`,
        fullPage: true,
      });
      await ctx.close();
    }
  }
}
await browser.close();
if (errors.length) {
  console.log("CONSOLE/PAGE ERRORS:");
  for (const e of errors) console.log(" ", e);
  process.exitCode = 1;
} else {
  console.log("no console errors");
}
console.log("done", paths.join(" "));

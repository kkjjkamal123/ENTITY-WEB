/*
  One-shot asset pipeline.
  - App screenshots (1080x2400) -> 780px-wide AVIF + WebP + PNG into public/shots/
  - Icons -> favicons + og base into public/
  - Benchmark plots -> optimized PNG copies into public/plots/
  Emits public/shots/manifest.json with intrinsic dimensions.
  Source folders are the local working copy; run from entity-web/.
*/
import sharp from "sharp";
import { mkdir, readdir, writeFile, copyFile } from "node:fs/promises";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const ARM = path.resolve(ROOT, "..");

const CHAT_SRC = path.join(ARM, "PHOTOS ENTITY CHAT");
const BENCH_SRC = path.join(ARM, "PHOTOS ENTITY BENCH.");
const ICONS_SRC = path.join(ARM, "github", "Icons");
const PLOTS_SRC = path.join(ARM, "github", "benchmarks", "plots");
const COMP_SRC = path.join(ARM, "github", "benchmarks", "competitor-comparison");

const chatMap = {
  "Home.png": "chat-home",
  "Menu.png": "chat-menu",
  "Models.png": "chat-models",
  "Model_Info.png": "chat-model-info",
  "Benchmark.png": "chat-benchmark",
  "About.png": "chat-about",
  "Settings1.png": "chat-settings-1",
  "Settings2.png": "chat-settings-2",
  "Benchmark_Results.png": "chat-benchmark-history",
};
const benchMap = {
  "Home1.png": "bench-device",
  "Home2.png": "bench-config-result",
  "Settings1.png": "bench-settings",
  "Settings2.png": "bench-contribute",
  "Benchmark.png": "bench-full-result",
};

const SHOT_W = 780;

async function shots() {
  const outDir = path.join(ROOT, "public", "shots");
  await mkdir(outDir, { recursive: true });
  const manifest = {};
  for (const [srcDir, map] of [
    [CHAT_SRC, chatMap],
    [BENCH_SRC, benchMap],
  ]) {
    for (const [file, slug] of Object.entries(map)) {
      const src = path.join(srcDir, file);
      const img = sharp(src).resize({ width: SHOT_W });
      const png = await img
        .clone()
        .png({ compressionLevel: 9, palette: true })
        .toFile(path.join(outDir, `${slug}.png`));
      await img.clone().webp({ quality: 82 }).toFile(path.join(outDir, `${slug}.webp`));
      await img.clone().avif({ quality: 55 }).toFile(path.join(outDir, `${slug}.avif`));
      manifest[slug] = { w: png.width, h: png.height };
      console.log("shot", slug, `${png.width}x${png.height}`);
    }
  }
  await writeFile(path.join(outDir, "manifest.json"), JSON.stringify(manifest, null, 2));
}

async function icons() {
  const out = path.join(ROOT, "public");
  await mkdir(out, { recursive: true });
  const dark = path.join(ICONS_SRC, "Blackbg_icon.png");
  for (const [size, name] of [
    [32, "favicon-32.png"],
    [192, "favicon-192.png"],
    [180, "apple-touch-icon.png"],
    [512, "icon-512.png"],
  ]) {
    await sharp(dark).resize(size, size, { fit: "cover" }).png().toFile(path.join(out, name));
  }
  // both marks for in-page use (theme-aware pair)
  const imgOut = path.join(ROOT, "public", "img");
  await mkdir(imgOut, { recursive: true });
  for (const [src, name] of [
    ["Blackbg_icon.png", "icon-dark.png"],
    ["Whitebg_icon.png", "icon-light.png"],
    ["Bench_icon.png", "bench-icon-light.png"],
    ["Bench_icon_dark.png", "bench-icon-dark.png"],
  ]) {
    await sharp(path.join(ICONS_SRC, src)).resize(256, 256, { fit: "inside" }).png().toFile(path.join(imgOut, name));
  }
  console.log("icons done");
}

async function plots() {
  const outDir = path.join(ROOT, "public", "plots");
  await mkdir(outDir, { recursive: true });
  const files = (await readdir(PLOTS_SRC)).filter((f) => f.endsWith(".png"));
  const manifest = {};
  for (const f of files) {
    const src = path.join(PLOTS_SRC, f);
    const meta = await sharp(src).metadata();
    const target = path.join(outDir, f);
    if ((meta.width ?? 0) > 1600) {
      const r = await sharp(src).resize({ width: 1600 }).png({ compressionLevel: 9 }).toFile(target);
      manifest[f] = { w: r.width, h: r.height };
    } else {
      await copyFile(src, target);
      manifest[f] = { w: meta.width, h: meta.height };
    }
    console.log("plot", f, manifest[f]);
  }
  // competitor chart lives outside plots/
  const comp = "three_app_comparison.png";
  const meta = await sharp(path.join(COMP_SRC, comp)).metadata();
  await copyFile(path.join(COMP_SRC, comp), path.join(outDir, comp));
  manifest[comp] = { w: meta.width, h: meta.height };
  await writeFile(path.join(outDir, "manifest.json"), JSON.stringify(manifest, null, 2));
}

await shots();
await icons();
await plots();
console.log("assets complete");

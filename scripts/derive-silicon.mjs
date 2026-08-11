/*
  Turns the contributed benchmark dataset into two per-SoC constants, so the site
  can predict a model it has never run on a phone it does not own.

  ## The idea

  The two phases of inference are bound by different things:

  - Decode reads essentially every weight once per token, so
        decode_tok_s x model_bytes  ==  bytes the SoC can stream per second.
    That product is a property of the silicon, not of the model. If the physics
    holds, two different models - even at two different quantizations - measured
    on the same chip must produce the same number.

  - Prefill is a GEMM over the whole prompt, so
        prompt_tok_s x params_B  ==  the SoC's effective compute rate,
    once the quantization's kernel path is divided out (Q8_0 reaches KleidiAI's
    8-bit kernel and runs ~1.62x faster on prompts than Q4_0 on the same chip).

  Nothing here is fitted. Both are one division applied to numbers that were
  already published on the leaderboard; the interesting part is the residual,
  which is reported rather than smoothed.

  ## What the output is for

  src/data/soc-silicon.json feeds the /predict page: choose a measured SoC and the
  predictor uses that chip's own streaming rate instead of asking a visitor to
  guess a bandwidth figure. Every device on that page is a device someone actually
  ran ENTITY on.

  ## What it is not

  Contributed rows are mostly single-pass, unpinned in the wild, and thermally
  uncontrolled. Where a chip has several observations the spread is carried into
  the output as `spreadPct` and the page shows it. A single-observation SoC gets
  no error bar and is labelled provisional, because one pass cannot have one.

  Run: npm run build:silicon
*/
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const read = async (p) => JSON.parse(await readFile(path.resolve(ROOT, p), "utf8"));

const snapshot = await read("src/data/leaderboard.json");
const catalog = await read("src/data/catalog.json");

/* Prompt-path gain of Q8_0 over Q4_0, and the K-quant penalty. Measured on the
   anchor phone and already constants in DeviceProbe.kt; repeated here so prefill
   observations at different quantizations are comparable to each other. */
const Q8_PREFILL_GAIN = 1.62;
const KQUANT_PREFILL_PENALTY = 0.87;

const byFileStem = new Map(
  catalog.entries.map((e) => [e.fileName.replace(/\.gguf$/, ""), e])
);

const SOC_NAMES = {
  MT6878: "Dimensity 7300",
  MT6897: "Dimensity 8300",
  SM8550: "Snapdragon 8 Gen 2",
  SM8450: "Snapdragon 8 Gen 1",
  SM8250: "Snapdragon 865",
  MT6833: "Dimensity 700",
  MT6765H: "Helio G37",
  SM6650: "Snapdragon 6 Gen 4",
};
const DEVICE_NAMES = {
  "SM-S911B": "Galaxy S23",
  "SM-S908E": "Galaxy S22 Ultra",
  "SM-G781B": "Galaxy S20 FE 5G",
  A015: "CMF Phone 1",
  "TECNO KI5q": "Spark 10",
};

const socCode = (raw) => raw.split("/").map((s) => s.trim()).pop();
const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

/* Collect one observation per unique run. Byte-identical re-uploads are collapsed
   the same way the leaderboard collapses them (CONTRIBUTED-DATA.md documents that
   the app can upload a stored result twice), so a duplicate cannot vote twice on
   a chip's constant. */
const seen = new Set();
const obs = [];
for (const r of [...snapshot.rows].sort((a, b) => a.id - b.id)) {
  const optimized = (r.arms ?? []).find((a) => a.arm === "optimized");
  if (!optimized) continue;
  const entry = byFileStem.get(r.model_file);
  if (!entry) {
    console.warn(`skipped id ${r.id}: "${r.model_file}" is not in the catalog, so its byte count is unknown`);
    continue;
  }
  const sig = JSON.stringify([r.device_model, r.model_file, r.quantization, r.arms]);
  if (seen.has(sig)) continue;
  seen.add(sig);

  const quantGain =
    entry.quant === "Q8_0" ? Q8_PREFILL_GAIN : entry.kleidiAccelerated ? 1.0 : KQUANT_PREFILL_PENALTY;

  /*
    The thread-derivation bug, detected from the row itself rather than from a version
    string. Before v3.5.0 the thread count was chosen by taking cores within 10% of the
    fastest clock; every modern flagship puts its prime core 17-20% above its own big
    cluster, so the count collapsed to 1 and was clamped to 2. A row whose optimized arm
    ran fewer threads than the device reported performance cores was measured under that
    bug, and its numbers are what the chip did with a third of its cluster - not what the
    chip can do.

    Those rows are kept, because deleting a measurement because it is inconvenient is the
    habit this project exists to avoid, and because decode is memory-bound enough that the
    figure is still a floor. They are marked instead, and the mark reaches the page: the
    error has a known sign, and a reader who knows a number understates a chip can use it.
  */
  const threadPolicyStale = optimized.threads < r.fast_cores;

  obs.push({
    id: r.id,
    soc: socCode(r.soc),
    threads: optimized.threads,
    threadPolicyStale,
    device: DEVICE_NAMES[r.device_model] ?? `${r.device_manufacturer} ${r.device_model}`,
    model: entry.id,
    modelLabel: `${entry.name} ${entry.quant}`,
    flags: (r.cpu_flags ?? []).map((f) => f.toLowerCase()),
    fastCores: r.fast_cores,
    runs: r.runs_per_arm,
    decodeToksPerS: optimized.decode_tok_s,
    promptToksPerS: optimized.prompt_tok_s,
    // The two derived quantities.
    decodeGBs: (optimized.decode_tok_s * entry.sizeBytes) / 1e9,
    computeRate: (optimized.prompt_tok_s * entry.paramsB) / quantGain,
    // Carried so the page can mark a chip whose only evidence is one noisy pass.
    provisional: r.runs_per_arm === 1,
    highVariance:
      optimized.decode_tok_s > 0 && optimized.decode_sd / optimized.decode_tok_s > 0.25,
  });
}

const socs = [];
for (const code of [...new Set(obs.map((o) => o.soc))]) {
  const rows = obs.filter((o) => o.soc === code);
  const gbs = rows.map((o) => o.decodeGBs);
  const spreadPct = gbs.length > 1 ? ((Math.max(...gbs) - Math.min(...gbs)) / median(gbs)) * 100 : null;

  /*
    Cross-model check. Where a chip was measured on two different models, the
    bandwidth taken from one must predict the other's decode rate. Only that
    direction is a real test: fitting and predicting the same model would be
    circular, and the quantizations differ too (Q8_0 vs Q4_0), so this also tests
    that the byte count - not the quantization label - is what governs decode.
  */
  let crossModel = null;
  const models = [...new Set(rows.map((o) => o.model))];
  if (models.length > 1) {
    const perModel = models.map((m) => {
      const rs = rows.filter((o) => o.model === m);
      return {
        model: m,
        label: rs[0].modelLabel,
        gbs: median(rs.map((o) => o.decodeGBs)),
        decodeToksPerS: median(rs.map((o) => o.decodeToksPerS)),
        sizeBytes: catalog.entries.find((e) => e.id === m).sizeBytes,
      };
    });
    // Predict each model from every other model's bandwidth; keep the worst error.
    const errs = [];
    for (const held of perModel) {
      const others = perModel.filter((p) => p.model !== held.model);
      const predicted = (median(others.map((p) => p.gbs)) * 1e9) / held.sizeBytes;
      errs.push({
        heldOut: held.label,
        fittedOn: others.map((p) => p.label).join(" + "),
        predictedToksPerS: predicted,
        measuredToksPerS: held.decodeToksPerS,
        errorPct: ((predicted - held.decodeToksPerS) / held.decodeToksPerS) * 100,
      });
    }
    crossModel = errs.sort((a, b) => Math.abs(b.errorPct) - Math.abs(a.errorPct));
  }

  socs.push({
    soc: code,
    name: SOC_NAMES[code] ?? code,
    devices: [...new Set(rows.map((o) => o.device))],
    flags: [...new Set(rows.flatMap((o) => o.flags))].sort(),
    fastCores: Math.max(...rows.map((o) => o.fastCores)),
    observations: rows.length,
    models: [...new Set(rows.map((o) => o.modelLabel))],
    decodeGBs: median(gbs),
    decodeGBsMin: Math.min(...gbs),
    decodeGBsMax: Math.max(...gbs),
    spreadPct,
    computeRate: median(rows.map((o) => o.computeRate)),
    // A chip whose whole record is single-pass rows says so on the page.
    provisional: rows.every((o) => o.provisional),
    highVariance: rows.some((o) => o.highVariance),
    // Every run this chip has was taken under the superseded thread policy, so both
    // constants understate it and the page must say which direction the error runs.
    threadPolicyStale: rows.every((o) => o.threadPolicyStale),
    threadsUsed: [...new Set(rows.map((o) => o.threads))].sort((a, b) => a - b),
    crossModel,
  });
}

socs.sort((a, b) => b.decodeGBs - a.decodeGBs);

/* The anchor. DeviceProbe.kt calibrates against the CMF Phone 1 under controlled
   thermals, and the site quotes 18.2 tok/s on Llama-3.2-1B Q4_0 there; the number
   below is the same chip as the crowd measured it, which is deliberately not the
   same thing and should not silently replace it. */
const anchor = socs.find((s) => s.soc === "MT6878") ?? null;

const out = {
  generated_at: new Date().toISOString(),
  source: "derived from src/data/leaderboard.json and src/data/catalog.json",
  method:
    "decodeGBs = optimized decode_tok_s x model file bytes; computeRate = optimized prompt_tok_s x paramsB, divided by the quantization's prompt-path gain. Median across unique runs per SoC.",
  q8PrefillGain: Q8_PREFILL_GAIN,
  kquantPrefillPenalty: KQUANT_PREFILL_PENALTY,
  anchorSoc: anchor?.soc ?? null,
  socs,
  observations: obs,
};
await writeFile(path.resolve(ROOT, "src", "data", "soc-silicon.json"), JSON.stringify(out, null, 1));

console.log(`silicon table: ${socs.length} SoCs from ${obs.length} unique runs`);
for (const s of socs) {
  const spread = s.spreadPct === null ? "single obs" : `±${(s.spreadPct / 2).toFixed(0)}% spread`;
  const stale = s.threadPolicyStale ? `  [pre-v3.5.0 thread policy: ${s.threadsUsed.join("/")} of ${s.fastCores} cores - understated]` : "";
  console.log(`  ${s.name.padEnd(20)} ${s.decodeGBs.toFixed(2).padStart(6)} GB/s  ${String(s.observations).padStart(2)} runs  ${spread}${stale}`);
  for (const c of s.crossModel ?? []) {
    console.log(
      `      cross-model: ${c.fittedOn} -> ${c.heldOut}: predicted ${c.predictedToksPerS.toFixed(1)}, measured ${c.measuredToksPerS.toFixed(1)} (${c.errorPct >= 0 ? "+" : ""}${c.errorPct.toFixed(1)}%)`
    );
  }
}

/*
  Shared processing for the contributed-benchmark dataset.
  Used at build time (teasers, static table rows) and by the leaderboard island.
  Every display rule here implements a documented reading rule from
  benchmarks/CONTRIBUTED-DATA.md; see comments on each flag.
*/

export interface Arm {
  arm: "naive" | "threads_only" | "optimized" | "efficiency" | "adpf";
  threads: number;
  pinned: boolean;
  passes: number;
  slow_cluster: boolean;
  decode_tok_s: number;
  decode_sd: number;
  prompt_tok_s: number;
  prompt_sd: number;
  ttft_ms: number;
  watts: number;
  tok_per_w: number;
}

export interface BenchRow {
  id: number;
  received_at: string;
  app_version: string;
  run_type: string;
  device_manufacturer: string;
  device_model: string;
  soc: string;
  android_release: string;
  android_sdk: number;
  cpu_flags: string[];
  max_freqs_mhz: number[];
  cpu_capacities: number[] | null;
  fast_cores: number;
  little_cores: number;
  model_file: string;
  quantization: string;
  kleidiai_accelerated: boolean;
  runs_per_arm: number;
  duration_min: number;
  start_temp_c: number;
  charging: boolean;
  power_valid: boolean;
  arms: Arm[];
}

/*
  SoC marketing names. Only unambiguous mappings are applied:
  - MT6878, MT6897, Tensor G5, SM8550, SM8450 are named in the repo's own docs
    (benchmarks/CONTRIBUTED-DATA.md, BENCHMARKS.md).
  - SM8250 (Snapdragon 865), MT6833 (Dimensity 700) and MT6765H (Helio G37,
    the Tecno Spark 10's chip) are unambiguous public mappings.
  - MT6886 ships under several Dimensity names (7200 / 7020 / 7350), so it
    stays raw rather than guessed.
*/
const SOC_NAMES: Record<string, string> = {
  MT6878: "Dimensity 7300",
  MT6897: "Dimensity 8300",
  SM8550: "Snapdragon 8 Gen 2",
  SM8450: "Snapdragon 8 Gen 1",
  SM8250: "Snapdragon 865",
  MT6833: "Dimensity 700",
  MT6765H: "Helio G37",
};

const DEVICE_NAMES: Record<string, string> = {
  "SM-S911B": "Galaxy S23",
  "SM-S908E": "Galaxy S22 Ultra",
  "SM-G781B": "Galaxy S20 FE 5G",
  A015: "CMF Phone 1",
  "TECNO KI5q": "Spark 10",
};

export function socLabel(raw: string): { name: string; raw: string } {
  const part = raw.split("/").map((s) => s.trim());
  const code = part[part.length - 1];
  return { name: SOC_NAMES[code] ?? code, raw: code };
}

export function deviceLabel(r: BenchRow): string {
  const man = r.device_manufacturer.replace(/^samsung$/i, "Samsung");
  const model = DEVICE_NAMES[r.device_model] ?? r.device_model;
  if (model.toLowerCase().startsWith(man.toLowerCase())) return model;
  return `${man} ${model}`;
}

export const arm = (r: BenchRow, k: Arm["arm"]): Arm | undefined =>
  r.arms.find((a) => a.arm === k);

export interface Derived {
  row: BenchRow;
  device: string;
  soc: { name: string; raw: string };
  naive?: Arm;
  threads?: Arm;
  optimized?: Arm;
  multiplier: number | null; // optimized decode / naive decode - the headline
  threadStep: number | null; // threads_only / naive
  pinStep: number | null; // optimized / threads_only
  provisional: boolean; // runs_per_arm == 1
  highVariance: boolean; // any core arm with decode RSD > 0.25
  variantArms: string[]; // which arms breached the RSD rule
  powerSuspect: boolean; // power_valid but physically inconsistent watts
  powerUsable: boolean; // final verdict for showing watts / tok/W
  duplicateOf: number | null; // byte-identical earlier upload
}

/*
  Power sanity gate. CONTRIBUTED-DATA.md excludes "all CPH2737 power figures"
  after that device's voltage-unit bug; one later row from the same device
  reports 0.52 W for a 4-thread decode arm while its own naive arm reads
  3.9 W - the same class of impossible telemetry, one release later. The gate
  is mechanical and applies to every row: an unplugged row is power-suspect
  when any measuring arm reports under 0.8 W during full-width decode, or when
  arms of the same run disagree on watts by more than 4x. Suspect rows keep
  their raw values in the detail panel, flagged, and are excluded from power
  columns and aggregates - flagged, not dropped.
*/
export function derive(r: BenchRow): Derived {
  const naive = arm(r, "naive");
  const threads = arm(r, "threads_only");
  const optimized = arm(r, "optimized");
  const ratio = (a?: Arm, b?: Arm) =>
    a && b && b.decode_tok_s > 0 ? a.decode_tok_s / b.decode_tok_s : null;

  const rsd = (a?: Arm) =>
    a && a.decode_tok_s > 0 ? a.decode_sd / a.decode_tok_s : 0;
  const variantArms = (["naive", "threads_only", "optimized"] as const).filter(
    (k) => rsd(arm(r, k)) > 0.25
  );

  const watts = r.arms.map((a) => a.watts).filter((w) => Number.isFinite(w) && w > 0);
  const powerSuspect =
    r.power_valid &&
    watts.length > 0 &&
    (Math.min(...watts) < 0.8 || Math.max(...watts) / Math.min(...watts) > 4);

  return {
    row: r,
    device: deviceLabel(r),
    soc: socLabel(r.soc),
    naive,
    threads,
    optimized,
    multiplier: ratio(optimized, naive),
    threadStep: ratio(threads, naive),
    pinStep: ratio(optimized, threads),
    provisional: r.runs_per_arm === 1,
    highVariance: variantArms.length > 0,
    variantArms,
    powerSuspect,
    powerUsable: r.power_valid && !powerSuspect,
    duplicateOf: null,
  };
}

const armSig = (r: BenchRow) =>
  JSON.stringify([r.device_model, r.model_file, r.quantization, r.arms]);

/*
  Grouping per the display rules:
  1. Byte-identical re-uploads (the app can upload a stored result twice;
     CONTRIBUTED-DATA.md documents ids 9=14, 10=13, 11=12) collapse to the
     earliest copy, with the duplicates recorded.
  2. One primary row per device + quantization, newest first (rule 10.5.4);
     older runs from the same device stay reachable behind an expander.
*/
export interface Group {
  primary: Derived;
  others: Derived[]; // older runs, same device+quant, newest first
  duplicates: number; // byte-identical uploads removed
}

export function processRows(rows: BenchRow[]): Group[] {
  const seen = new Map<string, Derived>();
  const dupCount = new Map<string, number>();
  const uniques: Derived[] = [];
  for (const r of [...rows].sort((a, b) => a.id - b.id)) {
    const d = derive(r);
    const sig = armSig(r);
    const first = seen.get(sig);
    if (first) {
      d.duplicateOf = first.row.id;
      dupCount.set(sig, (dupCount.get(sig) ?? 0) + 1);
      continue;
    }
    seen.set(sig, d);
    uniques.push(d);
  }

  const byKey = new Map<string, Derived[]>();
  for (const d of uniques) {
    const k = `${d.row.device_model}|${d.row.quantization}`;
    byKey.set(k, [...(byKey.get(k) ?? []), d]);
  }

  const groups: Group[] = [];
  for (const [k, list] of byKey) {
    const sorted = [...list].sort(
      (a, b) => Date.parse(b.row.received_at) - Date.parse(a.row.received_at)
    );
    const dups = list.reduce(
      (acc, d) => acc + (dupCount.get(armSig(d.row)) ?? 0),
      0
    );
    groups.push({ primary: sorted[0], others: sorted.slice(1), duplicates: dups });
  }
  return groups;
}

export type SortKey = "multiplier" | "decode" | "prompt" | "tokw";

export function sortGroups(groups: Group[], key: SortKey): Group[] {
  const val = (g: Group): number => {
    const d = g.primary;
    switch (key) {
      case "multiplier":
        return d.multiplier ?? -1;
      case "decode":
        return d.optimized?.decode_tok_s ?? -1;
      case "prompt":
        return d.optimized?.prompt_tok_s ?? -1;
      case "tokw":
        return d.powerUsable ? d.optimized?.tok_per_w ?? -1 : -1;
    }
  };
  return [...groups].sort((a, b) => val(b) - val(a));
}

export const fmt = (n: number | null | undefined, digits = 1): string =>
  n === null || n === undefined || !Number.isFinite(n) ? "-" : n.toFixed(digits);

export const fmtX = (n: number | null): string =>
  n === null ? "-" : `${n.toFixed(2)}x`;

export const pctDelta = (ratio: number | null): string => {
  if (ratio === null) return "-";
  const d = (ratio - 1) * 100;
  return `${d >= 0 ? "+" : ""}${d.toFixed(1)}%`;
};

export function vendorOf(socRaw: string): string {
  const s = socRaw.toLowerCase();
  if (s.startsWith("mt")) return "MediaTek";
  if (s.startsWith("sm") || s.includes("qcom")) return "Qualcomm";
  if (s.includes("tensor") || s.includes("frankel")) return "Google";
  return "Other";
}

export const topoSummary = (freqs: number[]): string => {
  const counts = new Map<number, number>();
  for (const f of freqs) counts.set(f, (counts.get(f) ?? 0) + 1);
  return [...counts.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([f, n]) => `${n}x${(f / 1000).toFixed(1)}GHz`)
    .join(" + ");
};

export const dateOf = (received: string): string => received.slice(0, 10);

export const esc = (s: string): string =>
  s.replace(/[&<>"']/g, (c) =>
    c === "&" ? "&amp;" : c === "<" ? "&lt;" : c === ">" ? "&gt;" : c === '"' ? "&quot;" : "&#39;"
  );


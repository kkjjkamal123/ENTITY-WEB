/*
  A browser port of the app's device probe.

  DeviceProbe.kt answers "what will this model do on this phone" from two measured
  quantities and one calibration anchor. That prediction is the most useful thing
  the app knows and it was, until this file existed, locked inside an APK: a reader
  had to install ENTITY on an Arm phone to see it. This runs the same arithmetic in
  a page.

  Two rules govern this port:

  1. **The maths is transcribed, not reinterpreted.** Every constant below is the
     value in DeviceProbe.kt / ModelCatalog.kt, and `estimate`, `score` and
     `recommend` are line-for-line ports. `npm run check:parity` diffs the two
     implementations over a fixed grid of profiles; if the app's policy changes and
     this file does not, the check fails.
  2. **The catalog is not retyped.** src/data/catalog.json is extracted from
     ModelCatalog.kt by scripts/extract-catalog.mjs, so the 19 rows here are the 19
     rows the app ships.

  What the browser cannot do is run the probe. `DeviceProbe.measure` times an
  arraycopy and an integer MAC loop on the device itself; JavaScript in a phone
  browser measures the browser, not the phone. So instead of faking a measurement,
  this file substitutes real ones: [socProfile] builds a Profile from a chip's
  observed behaviour in the contributed dataset - see scripts/derive-silicon.mjs -
  which is a stronger input than the probe's own estimate, not a weaker one. The
  cost is coverage: only chips somebody has actually run ENTITY on can be selected.
*/
import catalog from "../data/catalog.json" with { type: "json" };
import silicon from "../data/soc-silicon.json" with { type: "json" };

export interface Entry {
  id: string;
  name: string;
  vendor: string;
  fileName: string;
  url: string;
  paramsB: number;
  quant: string;
  sizeBytes: number;
  role: "GENERAL" | "CODING" | "REASONING";
  kleidiAccelerated: boolean;
}

export const ALL: Entry[] = catalog.entries as Entry[];

// ------------------------------------------------------------------ calibration anchor
// CMF Phone 1 (Dimensity 7300), Llama-3.2-1B-Instruct, 4 threads pinned to the
// performance cluster, llama-bench -p 512 -n 128 -r 3, 2026-08-06.

/** 0.773 GB x 18.2 tok/s - the bytes per second decode actually achieved on the anchor. */
const ANCHOR_DECODE_BYTES_PER_S = 773_025_920 * 18.2;

/**
 * What DeviceProbe's arraycopy test reads on the anchor phone. Far above the ~14 GB/s
 * decode achieves there, because a linear copy sees near-peak DRAM while decode walks
 * many separate tensors. Only the ratio to this number is used, so the gap cancels.
 */
const ANCHOR_BANDWIDTH_GBS = 26.2;

const ANCHOR_PREFILL_TOKS = 128.2;
const ANCHOR_PREFILL_PARAMS_B = 1.24;

/** Measured 208.1 / 128.2: all of a Q8_0 model's block matmuls land on KleidiAI's 8-bit kernel. */
const Q8_PREFILL_GAIN = 1.62;

/** K-quants reach no KleidiAI kernel: Q4_K_M prefills at 111.7 against Q4_0's 128.2. */
const KQUANT_PREFILL_PENALTY = 0.87;

/** No dotprod means no fast integer path anywhere, KleidiAI or ggml. */
const NO_DOTPROD_PENALTY = 0.45;

/** Below this a reply arrives slower than most people read. See the KDoc on MIN_USABLE_DECODE. */
export const MIN_USABLE_DECODE = 5.0;

/** Comfortable reading speed; above it, extra decode buys diminishing returns. */
const COMFORTABLE_DECODE = 12.0;

const GIB = 1_073_741_824;

// ------------------------------------------------------------------ profile

export interface Profile {
  /** Sustained copy bandwidth on DeviceProbe's own scale, GB/s. Predicts decode. */
  bandwidthGBs: number;
  /** Integer throughput relative to the anchor device. Predicts prefill. */
  computeScore: number;
  perfCores: number;
  /** Memory the system can hand out now, not installed RAM - that is what a model must fit into. */
  availableRamBytes: number;
  flags: Set<string>;
}

export type Workload = "BALANCED" | "LONG_PROMPT" | "LONG_GENERATION";

export const WORKLOADS: { id: Workload; label: string; blurb: string }[] = [
  { id: "BALANCED", label: "Balanced", blurb: "A mix of prompt length and reply length" },
  { id: "LONG_PROMPT", label: "Fast first token", blurb: "Long prompts, short answers - summarising, Q&A over pasted text" },
  { id: "LONG_GENERATION", label: "Fast typing", blurb: "Short prompts, long answers - drafting, brainstorming" },
];

export interface Estimate {
  prefillToksPerS: number;
  decodeToksPerS: number;
  /** Seconds to first token on a 512-token prompt - the number a user actually feels. */
  ttftSeconds: number;
}

export type Fit = "GREAT" | "OK" | "TIGHT" | "TOO_BIG";

export interface Assessment {
  fit: Fit;
  reason: string;
}

// ------------------------------------------------------------------ prediction (pure)

/** Port of ModelCatalog.assess. */
export function assess(e: Entry, availableRamBytes: number, flags: Set<string>): Assessment {
  const ramGb = availableRamBytes / GIB;
  const sizeGb = e.sizeBytes / GIB;
  if (ramGb <= 0) return { fit: "OK", reason: "available memory unknown" };

  if (sizeGb > ramGb) {
    return {
      fit: "TOO_BIG",
      reason: `${sizeGb.toFixed(1)} GB of weights with only ${ramGb.toFixed(1)} GB free right now`,
    };
  }

  const notes: string[] = [];
  if (e.kleidiAccelerated) {
    const isa = flags.has("i8mm")
      ? "reaches KleidiAI, and this CPU has i8mm"
      : flags.has("dotprod")
        ? "reaches KleidiAI on this CPU's dotprod kernels"
        : "reaches KleidiAI, but this CPU has no dotprod";
    notes.push(`${e.quant} ${isa}`);
  } else {
    notes.push(`${e.quant} misses KleidiAI - runs ggml's Arm repack kernels instead`);
  }

  if (sizeGb > ramGb * 0.7) {
    notes.push(`${sizeGb.toFixed(1)} GB of weights against ${ramGb.toFixed(1)} GB free leaves little headroom`);
    return { fit: "TIGHT", reason: notes.join(" · ") };
  }

  const budgetB = ramGb >= 8 ? 8.0 : ramGb >= 5 ? 4.0 : ramGb >= 3 ? 2.0 : 1.3;
  const fit: Fit = e.kleidiAccelerated && e.paramsB <= budgetB ? "GREAT" : "OK";
  if (e.paramsB > budgetB) notes.push(`${e.paramsB.toFixed(1)}B will decode slowly on this CPU`);
  return { fit, reason: notes.join(" · ") };
}

/** Port of DeviceProbe.estimate. */
export function estimate(e: Entry, p: Profile): Estimate {
  const bandwidthRatio = ANCHOR_BANDWIDTH_GBS <= 0 ? 1 : p.bandwidthGBs / ANCHOR_BANDWIDTH_GBS;
  const decode = (ANCHOR_DECODE_BYTES_PER_S * bandwidthRatio) / e.sizeBytes;

  let prefill =
    ANCHOR_PREFILL_TOKS * p.computeScore * (ANCHOR_PREFILL_PARAMS_B / Math.max(0.1, e.paramsB));
  prefill *= e.quant === "Q8_0" ? Q8_PREFILL_GAIN : e.kleidiAccelerated ? 1.0 : KQUANT_PREFILL_PENALTY;
  if (!p.flags.has("dotprod")) prefill *= NO_DOTPROD_PENALTY;

  const prefillToksPerS = Math.max(0.1, prefill);
  return {
    prefillToksPerS,
    decodeToksPerS: Math.max(0.05, decode),
    ttftSeconds: 512 / prefillToksPerS,
  };
}

/** Port of DeviceProbe.score. */
function score(e: Entry, est: Estimate, w: Workload, p: Profile): number {
  let s = Math.min(4.0, e.paramsB) * 2.2;
  s += Math.min(est.decodeToksPerS, COMFORTABLE_DECODE) * 0.35;

  if (w === "LONG_PROMPT") s += Math.min(est.prefillToksPerS, 250.0) * 0.008;
  else if (w === "LONG_GENERATION") s += Math.min(est.decodeToksPerS, 20.0) * 0.15;
  else s += Math.min(est.prefillToksPerS, 250.0) * 0.004;

  if (!e.kleidiAccelerated) s -= 0.8;
  if (assess(e, p.availableRamBytes, p.flags).fit === "TIGHT") s -= 1.5;
  return s;
}

export interface Ranked {
  entry: Entry;
  estimate: Estimate;
  assessment: Assessment;
  score: number;
  /** Below MIN_USABLE_DECODE the recommender refuses the row outright. */
  usable: boolean;
}

/**
 * Every catalog row scored for this profile, best first. The app only ever shows the
 * winner; a page has room to show the whole ranking, which is the more honest object -
 * a recommendation with nothing behind it cannot be argued with.
 */
export function rank(p: Profile, w: Workload = "BALANCED"): Ranked[] {
  return ALL.map((entry) => {
    const est = estimate(entry, p);
    const a = assess(entry, p.availableRamBytes, p.flags);
    return {
      entry,
      estimate: est,
      assessment: a,
      score: score(entry, est, w, p),
      usable: a.fit !== "TOO_BIG" && est.decodeToksPerS >= MIN_USABLE_DECODE,
    };
  }).sort((x, y) => {
    if (x.usable !== y.usable) return x.usable ? -1 : 1;
    return y.score - x.score;
  });
}

export interface Recommendation {
  entry: Entry;
  estimate: Estimate;
  headline: string;
  why: string;
  runnerUp: Entry | null;
}

/**
 * Port of DeviceProbe.recommend.
 *
 * A TIGHT fit is excluded rather than penalised - see the KDoc on the Kotlin original
 * for why the -1.5 in `score` was never enough to change the decision. The tight set is
 * used only when nothing roomy is viable.
 */
export function recommend(p: Profile, w: Workload = "BALANCED"): Recommendation | null {
  const viable = rank(p, w).filter((r) => r.usable);
  if (viable.length === 0) return null;
  const roomy = viable.filter((r) => r.assessment.fit !== "TIGHT");
  const candidates = roomy.length > 0 ? roomy : viable;
  const best = candidates[0];
  const runnerUp = candidates.slice(1).find((r) => r.entry.id !== best.entry.id)?.entry ?? null;
  return {
    entry: best.entry,
    estimate: best.estimate,
    headline: `${best.entry.name} ${best.entry.quant}`,
    why: explain(best.entry, best.estimate, w),
    runnerUp,
  };
}

/** Port of DeviceProbe.explain. */
function explain(e: Entry, est: Estimate, w: Workload): string {
  const base = `Estimated ~${est.decodeToksPerS.toFixed(0)} tok/s generation and ~${est.ttftSeconds.toFixed(1)}s to first token on a 512-token prompt`;
  const quantNote =
    e.quant === "Q8_0"
      ? "Q8_0 puts every weight on Arm's kernels - fastest prompts, but the largest file, so generation is slower"
      : e.kleidiAccelerated
        ? "Q4_0 reaches Arm's KleidiAI kernels and stays small, which is what keeps generation quick"
        : `${e.quant} misses KleidiAI, so prompt processing runs on generic kernels`;
  const workloadNote =
    w === "LONG_PROMPT"
      ? "Chosen for time-to-first-token because you picked long prompts."
      : w === "LONG_GENERATION"
        ? "Chosen for generation speed because you picked long replies."
        : "Chosen as the best balance of capability and speed for this phone.";
  return `${base}. ${quantNote}. ${workloadNote}`;
}

// ------------------------------------------------------------------ measured silicon

export interface SocRow {
  soc: string;
  name: string;
  devices: string[];
  flags: string[];
  fastCores: number;
  observations: number;
  models: string[];
  decodeGBs: number;
  decodeGBsMin: number;
  decodeGBsMax: number;
  spreadPct: number | null;
  computeRate: number;
  provisional: boolean;
  highVariance: boolean;
  /**
   * Every run for this chip was taken before v3.5.0 fixed the thread-derivation rule, so
   * it ran on 2 threads where the device reports more performance cores. Both constants
   * therefore understate the silicon, and the error has a known direction.
   */
  threadPolicyStale: boolean;
  threadsUsed: number[];
  crossModel:
    | {
        heldOut: string;
        fittedOn: string;
        predictedToksPerS: number;
        measuredToksPerS: number;
        errorPct: number;
      }[]
    | null;
}

export const SOCS: SocRow[] = silicon.socs as SocRow[];
export const SILICON_META = {
  generatedAt: silicon.generated_at,
  observations: silicon.observations.length,
  anchorSoc: silicon.anchorSoc,
};

/**
 * The anchor chip's effective decode bandwidth: 0.773 GB x 18.2 tok/s, in GB/s.
 *
 * This is the bridge between the two scales. The contributed dataset yields effective
 * decode bandwidth - what a chip really streams while running a model - while
 * [estimate] expects DeviceProbe's arraycopy figure, which reads much higher on the
 * same silicon. Dividing a chip's effective bandwidth by the anchor's and multiplying
 * by the anchor's arraycopy reading converts one to the other exactly, so the
 * unmodified app arithmetic can be fed a measurement instead of a probe.
 */
const ANCHOR_EFFECTIVE_GBS = ANCHOR_DECODE_BYTES_PER_S / 1e9;

/** Denominator that turns a per-SoC compute rate back into DeviceProbe's compute score. */
const ANCHOR_COMPUTE_RATE = ANCHOR_PREFILL_TOKS * ANCHOR_PREFILL_PARAMS_B;

/**
 * A Profile for a chip in the contributed dataset, with free memory supplied by the
 * caller because no dataset row records it - available RAM is a property of the moment,
 * not of the silicon, which is exactly why [assess] sizes against it.
 */
export function socProfile(soc: SocRow, availableRamBytes: number): Profile {
  const flags = new Set(soc.flags);
  // The measured prompt rate already contains whatever penalty this chip pays for
  // lacking dotprod, so it is divided out here and re-applied by estimate(). Without
  // this the penalty would be counted twice on exactly the phones that can least
  // afford it.
  const dotprodCorrection = flags.has("dotprod") ? 1 : 1 / NO_DOTPROD_PENALTY;
  return {
    bandwidthGBs: (soc.decodeGBs / ANCHOR_EFFECTIVE_GBS) * ANCHOR_BANDWIDTH_GBS,
    computeScore: (soc.computeRate / ANCHOR_COMPUTE_RATE) * dotprodCorrection,
    perfCores: soc.fastCores,
    availableRamBytes,
    flags,
  };
}

export const fmtBytes = (b: number): string =>
  b >= 1e9 ? `${(b / 1e9).toFixed(2)} GB` : `${(b / 1e6).toFixed(0)} MB`;

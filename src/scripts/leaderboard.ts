/*
  Leaderboard island.
  Renders the committed snapshot immediately, replaces it with live PostgREST
  data when the fetch resolves, and falls back silently on failure. Sorting,
  filtering and expansion are client-side. Sort changes animate with a FLIP
  transition (transform-only, 200 ms, disabled under prefers-reduced-motion).

  Honesty rules implemented here (benchmarks/CONTRIBUTED-DATA.md):
  1. power/tok-W never rendered where power_valid is false.
  2. n (runs per arm) always shown; single-pass rows marked provisional.
  3. arms with decode RSD > 0.25 flagged; such rows excluded from aggregates.
  4. one row per device+quantization, newest first; older runs expandable.
  5. pinning framing: the threads-only -> optimized axis, not optimized/naive.
*/
import snapshot from "../data/leaderboard.json";
import {
  processRows,
  sortGroups,
  vendorOf,
  dateOf,
  esc,
  fmt,
  fmtX,
  pctDelta,
  type BenchRow,
  type Group,
  type Derived,
  type SortKey,
  type Arm,
} from "../lib/bench";
import { SUPABASE_URL, SUPABASE_KEY } from "../lib/supabase";

interface State {
  sort: SortKey;
  vendor: string;
  quant: string;
  kleidiai: string;
  isa: string;
  power: boolean;
}

const qs = new URLSearchParams(location.search);
const state: State = {
  sort: (["multiplier", "decode", "prompt", "tokw"].includes(qs.get("sort") ?? "")
    ? qs.get("sort")
    : "multiplier") as SortKey,
  vendor: qs.get("vendor") ?? "",
  quant: qs.get("quant") ?? "",
  kleidiai: qs.get("kleidiai") ?? "",
  isa: qs.get("isa") ?? "",
  power: qs.get("power") === "1",
};

let groups: Group[] = processRows(snapshot.rows as unknown as BenchRow[]);
let liveStatus = `snapshot &middot; ${snapshot.rows.length} submissions`;

const rootEl = document.getElementById("lb-root")!;
const statusEl = document.getElementById("lb-status")!;
const statsEl = document.getElementById("lb-live-stats");
const prm = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

function syncUrl() {
  const p = new URLSearchParams();
  if (state.sort !== "multiplier") p.set("sort", state.sort);
  if (state.vendor) p.set("vendor", state.vendor);
  if (state.quant) p.set("quant", state.quant);
  if (state.kleidiai) p.set("kleidiai", state.kleidiai);
  if (state.isa) p.set("isa", state.isa);
  if (state.power) p.set("power", "1");
  const q = p.toString();
  history.replaceState(null, "", q ? `?${q}` : location.pathname);
}

function filtered(): Group[] {
  return groups.filter((g) => {
    const d = g.primary;
    if (state.vendor && vendorOf(d.soc.raw) !== state.vendor) return false;
    if (state.quant && d.row.quantization !== state.quant) return false;
    if (state.kleidiai === "yes" && !d.row.kleidiai_accelerated) return false;
    if (state.kleidiai === "no" && d.row.kleidiai_accelerated) return false;
    if (state.isa && !d.row.cpu_flags.includes(state.isa)) return false;
    if (state.power && !d.powerUsable) return false;
    return true;
  });
}

const runsChip = (d: Derived) =>
  d.provisional
    ? `<span class="chip !text-[0.6875rem] !px-1.5 !border-[color:var(--warn)] t-warn" title="single pass - provisional; two back-to-back 1-pass runs have disagreed by up to 19.6%">1 run</span>`
    : `<span class="text-dim">${d.row.runs_per_arm}</span>`;

const varChip = (d: Derived) =>
  d.highVariance
    ? `<span class="chip !text-[0.6875rem] !px-1.5 !border-[color:var(--danger)] t-danger" title="decode relative SD above 25% on: ${esc(d.variantArms.join(", "))} - excluded from aggregates">high sd</span>`
    : "";

const tokwCell = (d: Derived) => {
  const a = d.optimized;
  if (!d.row.power_valid)
    return `<span class="text-dim" title="${d.row.charging ? "measured while charging; power is the charger&#39;s, not the workload&#39;s" : "power marked invalid by the app for this run"}">-</span>`;
  if (d.powerSuspect)
    return `<span class="t-danger" title="power telemetry implausible on this row (arms disagree by over 4x or read under 0.8 W during decode) - excluded; raw values in the detail panel">excl.</span>`;
  return fmt(a?.tok_per_w, 2);
};

function rowHtml(g: Group): string {
  const d = g.primary;
  const r = d.row;
  const naive = d.naive;
  const opt = d.optimized;
  const more = g.others.length
    ? `<span class="text-dim text-[0.6875rem]">+${g.others.length} more</span>`
    : "";
  const socSub = `${d.soc.name !== d.soc.raw ? `${esc(d.soc.raw)} &middot; ` : ""}${esc(r.quantization)}${r.kleidiai_accelerated ? " &middot; KleidiAI" : ""}`;
  return `
  <tbody data-key="${esc(`${r.device_model}|${r.quantization}`)}" class="lb-group border-b border-outline">
    <tr class="hover:bg-surface/70 transition-colors duration-150">
      <td class="!py-2.5">
        <button type="button" class="lb-expand text-left w-full cursor-pointer" aria-expanded="false">
          <span class="font-medium">${esc(d.device)}</span> ${more}
          <span class="block text-[0.6875rem] text-dim">Android ${esc(r.android_release)} &middot; <span class="whitespace-nowrap">${dateOf(r.received_at)}</span></span>
        </button>
      </td>
      <td>${esc(d.soc.name)}<span class="block text-[0.6875rem] text-dim">${socSub}</span></td>
      <td class="num">${fmt(naive?.decode_tok_s)} ${varChip(d)}</td>
      <td class="num">${fmt(opt?.decode_tok_s)}</td>
      <td class="num"><span class="text-[0.9375rem] font-bold text-accent-ink">${fmtX(d.multiplier)}</span></td>
      <td class="num">${tokwCell(d)}</td>
      <td class="num">${runsChip(d)}</td>
    </tr>
    <tr class="lb-detail" hidden>
      <td colspan="7" class="!p-0">${detailHtml(g)}</td>
    </tr>
  </tbody>`;
}

const armName: Record<string, string> = {
  naive: "naive",
  threads_only: "threads only",
  optimized: "optimized",
  efficiency: "efficiency",
  adpf: "adpf",
};

function armRow(d: Derived, a: Arm): string {
  const power = d.row.power_valid
    ? d.powerSuspect
      ? `<span class="t-danger" title="implausible telemetry - see row flag">${fmt(a.watts, 2)}</span>`
      : fmt(a.watts, 2)
    : `<span class="text-dim" title="power invalid on this run">-</span>`;
  const tokw = d.row.power_valid
    ? d.powerSuspect
      ? `<span class="t-danger">${fmt(a.tok_per_w, 2)}</span>`
      : fmt(a.tok_per_w, 2)
    : `<span class="text-dim">-</span>`;
  return `<tr>
    <td>${armName[a.arm] ?? esc(a.arm)}${a.slow_cluster ? ` <span class="text-dim text-[0.6875rem]">LITTLE</span>` : ""}</td>
    <td class="num">${a.threads}</td>
    <td>${a.pinned ? "pinned" : "scheduler"}</td>
    <td class="num">${fmt(a.decode_tok_s)}${a.decode_sd ? ` <span class="text-dim">&plusmn;${fmt(a.decode_sd, 2)}</span>` : ""}</td>
    <td class="num">${fmt(a.prompt_tok_s, 0)}${a.prompt_sd ? ` <span class="text-dim">&plusmn;${fmt(a.prompt_sd, 1)}</span>` : ""}</td>
    <td class="num">${fmt(a.ttft_ms, 0)}</td>
    <td class="num">${power}</td>
    <td class="num">${tokw}</td>
  </tr>`;
}

function detailHtml(g: Group): string {
  const d = g.primary;
  const r = d.row;
  const naiveNote = r.arms.some((a) => a.arm === "naive" && a.pinned)
    ? `<p class="text-[0.6875rem] text-dim mt-2">The naive arm reports "pinned" because its mask is the 8 fastest of 8 cores - every core. Only the label differs from unpinned (documented in CONTRIBUTED-DATA.md).</p>`
    : "";
  const others = g.others.length
    ? `<div class="mt-3"><p class="microlabel">${g.others.length} older run${g.others.length > 1 ? "s" : ""} from this device</p>
       <ul class="mt-1 space-y-0.5 text-[0.75rem]">${g.others
         .map(
           (o) =>
             `<li>${dateOf(o.row.received_at)} &middot; ${esc(o.row.quantization)} &middot; ${o.row.runs_per_arm} run${o.row.runs_per_arm > 1 ? "s" : ""} &middot; naive ${fmt(o.naive?.decode_tok_s)} -> optimized ${fmt(o.optimized?.decode_tok_s)} tok/s (${fmtX(o.multiplier)})</li>`
         )
         .join("")}</ul></div>`
    : "";
  const dup = g.duplicates
    ? `<p class="text-[0.6875rem] text-dim mt-2">${g.duplicates} byte-identical re-upload${g.duplicates > 1 ? "s" : ""} collapsed (the app can upload a stored result twice; documented in CONTRIBUTED-DATA.md).</p>`
    : "";
  const powerNote = !r.power_valid
    ? `<p class="text-[0.6875rem] t-warn mt-2">Power columns withheld: ${r.charging ? "this run was charging - the battery current is the charger&#39;s, not the workload&#39;s." : "the app marked power invalid for this run (see the voltage-unit bug, JOURNEY.md section 7)."}</p>`
    : d.powerSuspect
      ? `<p class="text-[0.6875rem] t-danger mt-2">Power flagged implausible: arms of this run disagree on watts by more than 4x or read under 0.8 W during decode. Values shown here stay out of every column and aggregate.</p>`
      : "";
  return `<div class="bg-surface/60 px-4 py-4 border-t border-dashed border-outline">
    <div class="flex flex-wrap gap-x-6 gap-y-1 text-[0.6875rem] text-dim">
      <span>bench app v${esc(r.app_version)}</span>
      <span>Android ${esc(r.android_release)} (SDK ${r.android_sdk})</span>
      <span>start ${fmt(r.start_temp_c)} C</span>
      <span>${r.charging ? "charging" : "unplugged"}</span>
      <span>${esc(r.model_file)}</span>
      <span>received ${esc(r.received_at.slice(0, 16))} UTC</span>
    </div>
    <div class="scroll-x mt-3">
      <table class="data-table min-w-[560px]">
        <caption class="sr-only">Per-arm results for ${esc(d.device)}</caption>
        <thead><tr><th scope="col">arm</th><th scope="col" class="num">thr</th><th scope="col">placement</th><th scope="col" class="num">decode tok/s</th><th scope="col" class="num">prompt tok/s</th><th scope="col" class="num">TTFT ms</th><th scope="col" class="num">W</th><th scope="col" class="num">tok/W</th></tr></thead>
        <tbody>${r.arms.map((a) => armRow(d, a)).join("")}</tbody>
      </table>
    </div>
    <p class="text-[0.6875rem] text-dim mt-2">naive -> threads-only isolates the thread count (${pctDelta(d.threadStep)}); threads-only -> optimized isolates the pinning (${pctDelta(d.pinStep)}).</p>
    ${naiveNote}${powerNote}${dup}${others}
  </div>`;
}

function cardHtml(g: Group): string {
  const d = g.primary;
  return `<div class="card p-4 min-w-0 lb-group" data-key="${esc(`${d.row.device_model}|${d.row.quantization}`)}">
    <div class="flex items-start justify-between gap-3">
      <div class="min-w-0">
        <p class="font-medium text-[0.875rem]">${esc(d.device)}</p>
        <p class="text-[0.6875rem] text-dim">${esc(d.soc.name)} &middot; ${esc(d.row.quantization)} &middot; ${dateOf(d.row.received_at)}</p>
      </div>
      <p class="text-[1.25rem] font-bold whitespace-nowrap">${fmtX(d.multiplier)}</p>
    </div>
    <div class="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[0.75rem]">
      <span><span class="text-dim">naive</span> ${fmt(d.naive?.decode_tok_s)}</span>
      <span><span class="text-dim">tuned</span> ${fmt(d.optimized?.decode_tok_s)} tok/s</span>
      <span><span class="text-dim">tok/W</span> ${tokwCell(d)}</span>
      <span><span class="text-dim">runs</span> ${runsChip(d)} ${varChip(d)}</span>
    </div>
    <button type="button" class="lb-expand btn !py-1 !px-2.5 !text-[0.6875rem] mt-3" aria-expanded="false">details</button>
    <div class="lb-detail -mx-4 mt-3" hidden>${detailHtml(g)}</div>
  </div>`;
}

function aggregates(list: Group[]): string {
  const clean = list.filter((g) => !g.primary.highVariance && g.primary.multiplier !== null);
  if (!clean.length) return "";
  const mults = clean.map((g) => g.primary.multiplier!);
  const lo = Math.min(...mults);
  const hi = Math.max(...mults);
  const socs = new Set(list.map((g) => g.primary.soc.raw)).size;
  return `${list.length} device rows &middot; ${socs} SoCs &middot; tuning multiplier ${lo.toFixed(2)}x-${hi.toFixed(2)}x (high-variance rows excluded; single-pass rows provisional)`;
}

function render(withFlip = false) {
  const list = sortGroups(filtered(), state.sort);
  const table = rootEl.querySelector<HTMLElement>("#lb-table")!;
  const cards = rootEl.querySelector<HTMLElement>("#lb-cards")!;

  const first = withFlip && !prm ? capturePositions(table) : null;

  table.querySelectorAll(".lb-group").forEach((el) => el.remove());
  table.insertAdjacentHTML("beforeend", list.map(rowHtml).join(""));
  cards.innerHTML = list.length
    ? list.map(cardHtml).join("")
    : "";

  const empty = rootEl.querySelector<HTMLElement>("#lb-empty")!;
  if (!list.length) {
    const active = [
      state.vendor && `vendor: ${state.vendor}`,
      state.quant && `quant: ${state.quant}`,
      state.kleidiai && `KleidiAI: ${state.kleidiai}`,
      state.isa && `ISA: ${state.isa}`,
      state.power && "valid power only",
    ].filter(Boolean);
    empty.hidden = false;
    empty.querySelector("span")!.textContent = active.join(", ");
  } else {
    empty.hidden = true;
  }

  if (statsEl) statsEl.innerHTML = aggregates(list);

  // header sort state
  rootEl.querySelectorAll<HTMLElement>("th[data-sort]").forEach((th) => {
    th.setAttribute("aria-sort", th.dataset.sort === state.sort ? "descending" : "none");
    th.querySelector("button")?.setAttribute(
      "aria-pressed",
      String(th.dataset.sort === state.sort)
    );
  });
  rootEl.querySelectorAll<HTMLButtonElement>("[data-sortbtn]").forEach((b) => {
    b.toggleAttribute("data-on", b.dataset.sortbtn === state.sort);
    b.setAttribute("aria-pressed", String(b.dataset.sortbtn === state.sort));
  });

  if (first) playFlip(table, first);
}

function capturePositions(table: HTMLElement): Map<string, number> {
  const m = new Map<string, number>();
  table.querySelectorAll<HTMLElement>(".lb-group").forEach((el) => {
    m.set(el.dataset.key!, el.getBoundingClientRect().top);
  });
  return m;
}

function playFlip(table: HTMLElement, first: Map<string, number>) {
  table.querySelectorAll<HTMLElement>(".lb-group").forEach((el) => {
    const prev = first.get(el.dataset.key!);
    if (prev === undefined) return;
    const dy = prev - el.getBoundingClientRect().top;
    if (!dy) return;
    el.animate(
      [{ transform: `translateY(${dy}px)` }, { transform: "translateY(0)" }],
      { duration: 200, easing: "cubic-bezier(0.2,0,0,1)" }
    );
  });
}

/* interactions */
rootEl.addEventListener("click", (e) => {
  const t = e.target as HTMLElement;
  const expand = t.closest<HTMLButtonElement>(".lb-expand");
  if (expand) {
    const group = expand.closest(".lb-group")!;
    const detail = group.querySelector<HTMLElement>(".lb-detail")!;
    const open = detail.hidden;
    detail.hidden = !open;
    expand.setAttribute("aria-expanded", String(open));
    return;
  }
  const sortBtn = t.closest<HTMLButtonElement>("[data-sortbtn]");
  if (sortBtn) {
    state.sort = sortBtn.dataset.sortbtn as SortKey;
    syncUrl();
    render(true);
    return;
  }
  const thBtn = t.closest<HTMLButtonElement>("[data-thsort]");
  if (thBtn) {
    state.sort = thBtn.dataset.thsort as SortKey;
    syncUrl();
    render(true);
  }
});

rootEl.addEventListener("change", (e) => {
  const t = e.target as HTMLInputElement | HTMLSelectElement;
  if (t.id === "f-vendor") state.vendor = t.value;
  if (t.id === "f-quant") state.quant = t.value;
  if (t.id === "f-kleidiai") state.kleidiai = t.value;
  if (t.id === "f-isa") state.isa = t.value;
  if (t.id === "f-power") state.power = (t as HTMLInputElement).checked;
  syncUrl();
  render();
});

document.getElementById("lb-clear")?.addEventListener("click", () => {
  state.vendor = state.quant = state.kleidiai = state.isa = "";
  state.power = false;
  (document.getElementById("f-vendor") as HTMLSelectElement).value = "";
  (document.getElementById("f-quant") as HTMLSelectElement).value = "";
  (document.getElementById("f-kleidiai") as HTMLSelectElement).value = "";
  (document.getElementById("f-isa") as HTMLSelectElement).value = "";
  (document.getElementById("f-power") as HTMLInputElement).checked = false;
  syncUrl();
  render();
});

/* boot: reflect URL state into controls, swap in interactive UI, fetch live */
(document.getElementById("f-vendor") as HTMLSelectElement).value = state.vendor;
(document.getElementById("f-quant") as HTMLSelectElement).value = state.quant;
(document.getElementById("f-kleidiai") as HTMLSelectElement).value = state.kleidiai;
(document.getElementById("f-isa") as HTMLSelectElement).value = state.isa;
(document.getElementById("f-power") as HTMLInputElement).checked = state.power;

document.getElementById("lb-static")?.setAttribute("hidden", "");
rootEl.hidden = false;
render();
statusEl.innerHTML = liveStatus;

fetch(
  `${SUPABASE_URL}/rest/v1/bench_results?select=*&order=id.asc&limit=1000`,
  {
    headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
  }
)
  .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
  .then((rows: BenchRow[]) => {
    if (!Array.isArray(rows) || !rows.length) throw new Error("empty");
    groups = processRows(rows);
    liveStatus = `live &middot; ${rows.length} submissions &middot; fetched ${new Date().toISOString().slice(0, 16)} UTC`;
    statusEl.innerHTML = liveStatus;
    render();
  })
  .catch(() => {
    liveStatus = `snapshot of ${esc(String((snapshot as { fetched_at?: string }).fetched_at ?? "").slice(0, 10))} &middot; live fetch unavailable`;
    statusEl.innerHTML = liveStatus;
  });

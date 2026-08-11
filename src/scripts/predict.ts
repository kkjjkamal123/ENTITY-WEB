/*
  The interactive half of /predict.

  Everything numeric here comes from src/lib/probe.ts, which is a transcription of
  DeviceProbe.kt held to it by a golden-vector test in the app's own suite. This file
  only reads controls, calls it, and prints the result - deliberately, because any
  arithmetic that lived here would be arithmetic the parity test cannot see.

  The page renders statically for the anchor device first, so it is complete and correct
  before this module loads and remains so if it never does.
*/
import {
  SOCS,
  WORKLOADS,
  rank,
  recommend,
  socProfile,
  fmtBytes,
  MIN_USABLE_DECODE,
  type SocRow,
  type Workload,
  type Ranked,
} from "../lib/probe";
import { esc } from "../lib/bench";

const root = document.getElementById("pr-root");
if (root) {
  const socSel = document.getElementById("pr-soc") as HTMLSelectElement;
  const ramInput = document.getElementById("pr-ram") as HTMLInputElement;
  const ramOut = document.getElementById("pr-ram-out") as HTMLElement;
  const workloadBtns = [...document.querySelectorAll<HTMLButtonElement>("[data-workload]")];
  const recBox = document.getElementById("pr-rec") as HTMLElement;
  const tableBody = document.getElementById("pr-rows") as HTMLElement;
  const socNote = document.getElementById("pr-soc-note") as HTMLElement;
  const staticFallback = document.getElementById("pr-static");

  let workload: Workload = "BALANCED";

  /*
    Free memory, not installed RAM. assess() sizes against what the system can hand out
    now, and the two differ by more than people expect - a 6 GB phone with a launcher and
    a browser resident commonly reports around 2.3 GB. The slider therefore runs over
    plausible *free* values and says so, rather than asking for a spec-sheet number and
    quietly recommending against capacity the phone has already spent.
  */
  const ramBytes = () => Number(ramInput.value) * 1024 * 1024;

  const fit = (f: Ranked["assessment"]["fit"]) => {
    const cls = f === "GREAT" ? "t-ok" : f === "TIGHT" ? "t-warn" : f === "TOO_BIG" ? "t-danger" : "";
    const label = f === "GREAT" ? "good fit" : f === "OK" ? "fits" : f === "TIGHT" ? "tight" : "too big";
    return `<span class="${cls}">${label}</span>`;
  };

  /*
    The error bar is the chip's own observed spread, not a confidence interval: half the
    range between the fastest and slowest run recorded for that SoC. A chip with one
    contributed pass has no spread to report and gets a provisional mark instead, because
    one measurement cannot have an error bar and pretending otherwise would be the single
    most misleading thing this page could do.
  */
  const band = (soc: SocRow, value: number): string => {
    if (soc.spreadPct === null) return "";
    const half = (soc.spreadPct / 2 / 100) * value;
    return ` <span class="text-dim">± ${half.toFixed(1)}</span>`;
  };

  const render = () => {
    const soc = SOCS.find((s) => s.soc === socSel.value);
    if (!soc) return;
    const ram = ramBytes();
    const profile = socProfile(soc, ram);
    const ranked = rank(profile, workload);
    const rec = recommend(profile, workload);

    ramOut.textContent = `${(ram / 1024 / 1024 / 1024).toFixed(1)} GB free`;

    const runs = `${soc.observations} contributed ${soc.observations === 1 ? "run" : "runs"}`;
    const spread = soc.spreadPct === null
      ? "single pass, so no spread - treat this chip's row as provisional"
      : `runs spread ${soc.spreadPct.toFixed(0)}% end to end`;
    /*
      A chip measured only under the pre-v3.5.0 thread policy ran on two threads while
      reporting more performance cores, so its constants are a floor rather than a
      reading. Saying which way the error runs is more useful than hiding the chip.
    */
    const stale = soc.threadPolicyStale
      ? ` &middot; <span class="t-warn">measured on ${soc.threadsUsed.join("/")} of ${soc.fastCores} performance cores</span>, ` +
        `before v3.5.0 fixed the thread rule - this chip is understated here`
      : "";

    socNote.innerHTML =
      `${esc(soc.devices.join(", "))} &middot; ${soc.decodeGBs.toFixed(1)} GB/s effective decode bandwidth ` +
      `&middot; ${esc(soc.flags.join(", ") || "no Arm ISA extensions reported")} ` +
      `&middot; ${runs}, ${spread}${stale}`;

    if (rec) {
      const est = rec.estimate;
      recBox.innerHTML = `
        <p class="eyebrow">Start with</p>
        <p class="mt-2 text-xl md:text-2xl font-bold">${esc(rec.headline)}</p>
        <p class="mt-1 text-[0.8125rem] text-dim">${esc(rec.entry.vendor)} &middot; ${fmtBytes(rec.entry.sizeBytes)} download</p>
        <dl class="mt-4 grid grid-cols-2 gap-px bg-outline border border-outline rounded-[8px] overflow-hidden">
          <div class="bg-surface p-3">
            <dd class="text-[1.5rem] font-bold leading-none text-accent-ink tabular-nums">${est.decodeToksPerS.toFixed(1)}</dd>
            <dt class="text-[0.6875rem] mt-1.5 text-dim">tok/s generating${band(soc, est.decodeToksPerS)}</dt>
          </div>
          <div class="bg-surface p-3">
            <dd class="text-[1.5rem] font-bold leading-none text-accent-ink tabular-nums">${est.ttftSeconds.toFixed(1)}s</dd>
            <dt class="text-[0.6875rem] mt-1.5 text-dim">to first token, 512-token prompt</dt>
          </div>
        </dl>
        <p class="mt-4 text-[0.8125rem] leading-relaxed">${esc(rec.why)}</p>
        ${rec.runnerUp ? `<p class="mt-2 text-[0.8125rem] text-dim">Runner-up: ${esc(rec.runnerUp.name)} ${esc(rec.runnerUp.quant)}.</p>` : ""}
      `;
    } else {
      recBox.innerHTML = `
        <p class="eyebrow">No recommendation</p>
        <p class="mt-2 text-[0.9375rem] font-bold">Nothing in the catalog clears ${MIN_USABLE_DECODE} tok/s here</p>
        <p class="mt-3 text-[0.8125rem] text-dim leading-relaxed">
          Below that a reply arrives slower than most people read. Saying so is the useful
          answer; handing over the least-bad option and letting someone spend a gigabyte
          finding out is not.
        </p>`;
    }

    tableBody.innerHTML = ranked
      .map((r) => {
        const e = r.entry;
        const slow = r.assessment.fit !== "TOO_BIG" && r.estimate.decodeToksPerS < MIN_USABLE_DECODE;
        return `<tr class="${r.usable ? "" : "opacity-55"}">
          <td>${esc(e.name)}<span class="block text-[0.6875rem] text-dim">${esc(e.vendor)} &middot; ${esc(e.quant)}${e.kleidiAccelerated ? "" : " &middot; no KleidiAI"}</span></td>
          <td class="num">${fmtBytes(e.sizeBytes)}</td>
          <td class="num">${r.assessment.fit === "TOO_BIG" ? "-" : r.estimate.decodeToksPerS.toFixed(1) + band(soc, r.estimate.decodeToksPerS)}</td>
          <td class="num">${r.assessment.fit === "TOO_BIG" ? "-" : r.estimate.ttftSeconds.toFixed(1) + "s"}</td>
          <td>${fit(r.assessment.fit)}${slow ? ` <span class="t-warn">too slow</span>` : ""}<span class="block text-[0.6875rem] text-dim">${esc(r.assessment.reason)}</span></td>
        </tr>`;
      })
      .join("");

    // Keep the address bar in step so a result can be linked to and argued with.
    const url = new URL(location.href);
    url.searchParams.set("soc", soc.soc);
    url.searchParams.set("ram", ramInput.value);
    url.searchParams.set("workload", workload);
    history.replaceState(null, "", url);
  };

  // ---- controls ----------------------------------------------------------------

  socSel.innerHTML = SOCS.map(
    (s) =>
      `<option value="${esc(s.soc)}">${esc(s.name === s.soc ? s.soc : `${s.name} (${s.soc})`)} - ${esc(s.devices[0])}${s.threadPolicyStale ? " (understated)" : ""}</option>`
  ).join("");

  const setWorkload = (w: Workload) => {
    workload = w;
    for (const b of workloadBtns) {
      const on = b.dataset.workload === w;
      b.toggleAttribute("data-on", on);
      b.setAttribute("aria-pressed", String(on));
    }
    render();
  };

  const params = new URLSearchParams(location.search);
  const wantedSoc = params.get("soc");
  socSel.value = SOCS.some((s) => s.soc === wantedSoc) ? wantedSoc! : "MT6878";
  const wantedRam = Number(params.get("ram"));
  if (Number.isFinite(wantedRam) && wantedRam >= Number(ramInput.min) && wantedRam <= Number(ramInput.max)) {
    ramInput.value = String(wantedRam);
  }
  const wantedWorkload = params.get("workload") as Workload | null;

  socSel.addEventListener("change", render);
  ramInput.addEventListener("input", render);
  for (const b of workloadBtns) {
    b.addEventListener("click", () => setWorkload(b.dataset.workload as Workload));
  }

  staticFallback?.remove();
  root.hidden = false;
  setWorkload(
    WORKLOADS.some((w) => w.id === wantedWorkload) ? wantedWorkload! : "BALANCED"
  );
}

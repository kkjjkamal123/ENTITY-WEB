# Content traceability

Every number and load-bearing claim published on the ENTITY site, with the repo file it traces
to. Repo paths are relative to the private source repo working copy (`ARM/github/`). Rule: if a
sentence on the site has no row here, it must not state a number.

Verified 2026-07-24 against the working copy.

## Versions and artifacts

| Item | Value | Source |
|---|---|---|
| Chat app version | v3.6.2 | `releases/RELEASE-v3.6.2.md`, drawer screenshot |
| Bench app version | v2.1.1 | `releases/RELEASE-Bench-v2.1.1.md`, bench footer screenshot |
| Chat APK | `ENTITY-v24-entity-identity-prompt-20260724-release.apk`, 10,422,675 bytes, sha256 `5f638f3f7ec4eec376d1a2db03ca1bff64706d23b757792afa0bcb6d384fede6` | `apk/`, computed locally |
| Bench APK | `ENTITY-Bench-v2.1.1-release.apk`, 10,284,112 bytes, sha256 `305f71f6d1b93ba20f5e3503827c0d5e1d557f2dfd0be104c5f0b9549cf34f23` | `apk/`, computed locally |
| Platform | arm64-v8a, Android 13+ | `README.md` badges, FAQ |
| License | Apache-2.0, builds on llama.cpp and Arm KleidiAI | `README.md`, `LICENSE` |
| Source repo | github.com/kkjjkamal123/ENTITY---Arm-Create-AI-Optimization-Challenge | `README.md` |
| llama.cpp PR | #25701, one-time KleidiAI fallback warning, merged 2026-07-21, commit `fb0e6b6` | `README.md`, `docs/KLEIDIAI-QUANTS.md` |

## The benchmark of record (four-arm, five runs per arm, 2026-07-18)

Source: `benchmarks/BENCHMARKS.md` "The current result"; raw CSVs
`benchmarks/results/entity_1b-q4_0_unplugged_5run_{cmf,oppo}_20260718.csv`.
Llama-3.2-1B Q4_0, PP 512 / TG 128, unplugged, ENTITY Bench v1.1.0, median +- population SD.

CMF Phone 1 (Nothing A015), Dimensity 7300, start 31 C:

| Arm | Decode | Prompt | TTFT ms | Power W | tok/W |
|---|---|---|---|---|---|
| Naive (8 thr, all cores) | 10.8 +- 1.3 | 111 +- 13.6 | 4720 | 4.25 +- 0.12 | 2.61 +- 0.33 |
| Threads only (4 thr, no pin) | 15.0 +- 0.5 | 137 +- 1.4 | 3803 | 4.09 +- 0.17 | 3.66 +- 0.24 |
| ENTITY Auto (4 thr, pinned) | 18.1 +- 0.4 | 139 +- 0.8 | 3739 | 3.96 +- 0.07 | 4.59 +- 0.17 |
| Efficiency (4 thr, LITTLE) | 15.0 +- 0.3 | 82.5 +- 0.2 | 6272 | 3.51 +- 0.02 | 4.28 +- 0.09 |

OPPO CPH2729, Snapdragon 6 Gen 4, start 35.3 C:

| Arm | Decode | Prompt | TTFT ms | Power W | tok/W |
|---|---|---|---|---|---|
| Naive | 9.7 +- 0.5 | 152 +- 4.5 | 3473 | 2.87 +- 1.04 | 3.37 +- 1.05 |
| Threads only | 17.4 +- 0.3 | 129 +- 22.4 | 4026 | 2.52 +- 0.90 | 6.80 +- 1.82 |
| ENTITY Auto | 17.5 +- 0.2 | 129 +- 23.1 | 4026 | 1.78 +- 0.71 | 9.85 +- 2.54 |
| Efficiency | 14.3 +- 0.1 | 127 +- 1.9 | 4101 | 3.06 +- 0.96 | 4.74 +- 1.57 |

Derived, stated in the same file: CMF thread count earns +39%, pinning +21% (per-run decode
threads-only 15.0/14.7/15.2/15.9/14.5 vs Auto 17.5/17.5/18.3/18.4/18.1 - non-overlapping;
+20.7% on medians). OPPO thread count +80%, pinning +0.6% (~+1%); pinning cuts median power
2.52 -> 1.78 W, tok/W 6.80 -> 9.85. CMF total +68% (10.8 -> 18.1); OPPO total +81% (9.7 -> 17.5).
LITTLE-pinned arm loses on speed and tok/W on both phones; on the CMF it collapses prompt
139 -> 82.5 tok/s and TTFT 3.7 s -> 6.3 s but draws the least power of any arm (3.51 W).

A1 animation durations for 128 tokens at those decode rates: naive 128/10.8 = 11.85 s,
threads-only 128/15.0 = 8.53 s, Auto 128/18.1 = 7.07 s.

## July 2026 three-run record (historical, retained)

Source: `benchmarks/BENCHMARKS.md` Result 1. CMF Phone 1. Decode tok/s.
1B Q3_K_L 3 runs: 8.8+-0.50 / 16.9+-0.08 / 16.7+-1.3 (+92% / -1%). 1B Q4_0 1 run: 7.9/14.7/14.7.
1B Q4_0 3 runs midday: 7.7+-0.78 / 15.9+-0.22 / 16.0+-2.1 (+106% / +1%). Evening repeat:
8.6+-0.82 / 15.9+-1.58 / 15.9+-0.09 (+85% / +0%; pinned spread collapses 1.58 -> 0.09).
3B Q4_0 single runs: 3.1/6.0/6.8 (+94%/+13%) and 3.5/6.3/6.3 (+81%/+0%); a third 3B run while
charging measured -16%; single 3B runs swing about +-15% (the 1-pass noise floor there).
Summary: thread count +81% to +106%, "roughly 2x"; pinning ~0% in this record.

## Energy result

Source: `benchmarks/BENCHMARKS.md` Result 4, from first pass of each arm in
`results/entity_1b-q4_0_unplugged_3run_20260715b.csv` (273 battery-current samples, trapezoid):
naive 19.9 s at 4.34 W = 86 J; threads-only 12.2 s at 3.98 W = 49 J (-44%);
Auto 11.8 s at 4.22 W = 50 J (-42%). Earlier 2026-07-14 single-run export: 95 / 57 / 51 J.
Range across both: 42-47% less energy. All arms draw roughly the same watts; the win is
finishing in 11.8 s instead of 19.9 s. Boundary: battery current reporting is OEM-dependent;
comparative on one device, not lab-grade metering. Plot scripts refuse charging exports.

## v2.0.0 -> v2.1.0 user-facing change

Source: `benchmarks/BENCHMARKS.md` "Combined effect".
Prompt 38.3 -> 133 tok/s. TTFT 13,440 -> 3,918 ms (-3.4x). Decode 16.7 -> 14.7. tok/W 3.9 -> 3.5.

## Quantization / KleidiAI numbers

Source: `docs/KLEIDIAI-QUANTS.md`, `benchmarks/BENCHMARKS.md` Result 2. CMF Phone 1, same
512-token prompt, same 4-thread unpinned config, only the quantization differs:
Q3_K_L (733 MB) vs Q4_0 (773 MB): prompt 42.7 -> 121 tok/s (+183%); derived TTFT 12,050 -> 4,299 ms
(-64%); decode 16.9 -> 14.7 (-13%, bandwidth-bound, ~6% more bytes).
KleidiAI kernels exist for exactly Q4_0 and Q8_0 (`ggml/src/ggml-cpu/kleidiai/kleidiai.cpp`).
Attribution caveat (same files): moving to Q4_0 switches on KleidiAI AND ggml's Arm repack path
at once; the split is unmeasured on this phone; independent measurements (PocketTune Pixel 7a
138.4 vs 143.5; KleidiBench ~1.0x at Q4_0, 1.73x at Q8_0) suggest the flag adds little at Q4_0.
Wording rule (docs/JOURNEY.md section 3 + Models-screen copy): K-quants do NOT fall to "generic"
code - Q4_K/Q5_K/Q6_K have Arm dotprod repack GEMM paths; the site says "misses KleidiAI, runs
ggml's Arm repack kernels", the real unclaimed gap being i8mm/SMMLA.
i8mm second data point: on the Snapdragon 6 Gen 4, MATMUL_INT8 GEMM adds +32% prompt over
dotprod on Q4_0 (190.6 vs 143.7 cold) - `README.md` evidence table.

## Prompt-width regression (negative result)

Source: `benchmarks/BENCHMARKS.md` Result 3: prompt on 4 fast cores 135 tok/s, across all 8
cores 86 tok/s; removed in v2.1.0. (JOURNEY.md section 2 quotes a different instance of the
same regression: 116 vs 86 - quote per page with its own source, never mixed.)

## Contributed dataset (leaderboard editorial)

Source: `benchmarks/CONTRIBUTED-DATA.md`; raw export `results/contributed_ablation_q4_0_20260723.csv`.
As of 2026-07-23: 12 rows, 5 SoCs, all bench app 1.5.0. Devices/topologies (MHz):
Nothing A015 x3 (Dimensity 7300 MT6878, dotprod fp16, 4x2000+4x2500);
Pixel 10 (Tensor G5, dotprod i8mm sve sve2 fp16, 2x2246+5x3052+1x3782);
Galaxy S23 (SM8550, dotprod i8mm fp16, 3x2016+4x2803+1x3360);
Galaxy S22 Ultra (SM8450, dotprod i8mm fp16, 4x1785+3x2496+1x2995);
OPPO CPH2737 x6 (Dimensity 8300 MT6897, dotprod i8mm fp16, 4x2200+3x3200+1x3350).

Established:
1. Thread-count tuning pays on every SoC: 1.65x to 3.58x, none regressed. Flat 4+4 ~1.8x,
   widest-spread flagships ~3.5x; CPH2737 at 1.65x (narrow prime gap behaves flat).
2. Pinning axis (threads-only vs optimized): A015 Q8_0 +4.9/-5.4/+10.9; A015 Q8_0 repeat
   -4.8/+0.1/-4.9; Pixel 10 +29.3/+33.5/-3.2; A015 Q4_0 -8.5/+7.5/-14.9; S23 +1.7/+1.1/+0.2;
   S22U -0.5/-2.1/+2.2 (decode/watts/tok-per-W). Median +0.6% decode, -1.5% tok/W, positive on
   3 of 6 rows. Ranges: decode -8.5% to +29.3%, tok/W -14.9% to +10.9%.
3. Falsified prediction: rule counted cores within 10% of top clock; primes sit 17-20% above
   their big cluster; count collapsed to 1 -> clamped to 2 on Tensor G5 (3782), SM8550 (3360),
   SM8450 (2995); D7300 (2500) passes 4. Prefill inherited it (n_pp = n_gen): D7300 prefills
   139 tok/s vs SM8550's 111. CMF is flat 4+4; OPPO CPH2729 prime only 4.3% above big cluster
   (2304 vs 2208) - both dev phones structurally immune. Fixed v3.5.0.
CPH2737 details: NOT a Snapdragon (mt6897 = Dimensity 8300). Its power rows invalid
(EXTRA_VOLTAGE reported in volts, not mV; underreported by 1e6; fixed chat v3.6.0 / bench
v2.1.0; rows 11-12 corrected to power_valid=false; throughput unaffected). Each run uploaded
twice (ids 9=14, 10=13, 11=12) - dedupe required in any aggregate. Clean unplugged run:
18.1 -> 29.9 -> 30.5 tok/s (1.65x thread count, +2.0% pinning). Efficiency-arm oddity: 30.5
identical to optimized - single pass, flagged as a lead, not a finding.
Reading rules: never quote power/tok-per-W from charging runs; 1-pass rows sd=0, noise floor up
to 19.6% between back-to-back single passes; check RSD - S23 naive 6.72 +- 5.95 (88.5% RSD) is
noise; never compare across models (Q8_0 rows are Qwen2.5-0.5B, Q4_0 rows are Llama-3.2-1B).
Known non-issues: duration_min=0 on ablations; naive reports pinned:true (mask = all 8 = every
core); 3-arm rows lack the optional efficiency arm.
SM8550 decode width datum: 23.8 tok/s on 2 threads vs 6.72 on 8 (`docs/OPTIMIZATIONS.md` section 2).

## Competitor comparison

Source: `benchmarks/competitor-comparison/README.md`. Same phone (CMF Phone 1), same
`Llama-3.2-1B-Instruct-Q4_0`, PP 512 / TG 128, each app's own benchmark, 2026-07-20 session,
5 runs each, 30-min cooldown between apps: PocketPal AI 88.32 / 13.9 (6 threads);
Arm AI Chat 121 +- 2.99 / 12.4 +- 0.0751; ENTITY 128 / 18.2 (4, pinned).
Margins: vs Arm +6% prompt +47% decode; vs PocketPal +45% / +31%.
2026-07-14 session: PocketPal 86.4/10.9; Arm 120+-3.8 / 12.9+-0.08; ENTITY 133/15.6. The two
sessions disagree: PocketPal decode swung ~27%, Arm held within ~4%, the swing flipped the
PocketPal/Arm ranking, ENTITY prompt margin narrowed +11% -> +6%, decode widened +21% -> +47%.
Worst inflated pairing: 18.2 vs July 10.9 reads +67% where the matched figure is +31%. Both
sessions published; figures from different sessions must never be paired. PocketPal caveats:
reports "GPU Layers: 99" while producing a CPU result; its model file is 765 MB vs 773 MB.
Arm AI Chat does not report threads, so the 6-thread mechanism is established for PocketPal only.

## Runtime policy (animation drivers)

Source: `docs/OPTIMIZATIONS.md` section 0 unless noted.
- Decode width: T_gen = min(6, max(2, |{i : f_i >= 0.9 f_max}|)) from `cpuinfo_max_freq`.
- Prefill width (v3.5.0): T_pp = max(T_gen, min(6, |{i : c_i > min_j c_j}|)) from
  `/sys/devices/system/cpu/cpuN/cpu_capacity` (1024 = strongest; from capacity-dmips-mhz x clock).
  Gives 4 / 6 / 5 / 4 on the four contributed topologies under both signals.
- Context: C(M,F): M<1.6 GB and F>3.0 GiB -> 8192; M<1.6, F<=3.0 -> 4096; M>=1.6, F>2.2 -> 4096;
  M>=1.6, F<=2.2 -> 2048. Auto only; manual bypasses. (Kotlin `adaptiveContext()` section 3.)
- Thermal: delay 0 ms at NONE/LIGHT, 6 ms MODERATE, 12 ms SEVERE+; efficiency mode doubles;
  checked every 8th token; status cached 1 s. Cooperative back-off, not a scheduler control.
- Power: watts = |uA| x mV / 1e9; microamp interpretation preferred inside 0.05-15 W plausibility,
  else milliamp if plausible; voltage unit normalised first (v3.6.0, `PowerMath`).
- TTFT (derived): 1000 x (PP/r_pp + PL/r_tg) ms.
- Stats: median of passes, population SD.
- Affinity: `build_fast_cpu_set()` ranks cores by `cpuinfo_max_freq`; `pin_to_fast_cores()` calls
  `sched_setaffinity`; re-pinned on every decode entry; effective mask logged per arm.
- Backends: 7 Arm CPU variants (armv8.0, armv8.2 x2, armv8.6, armv9.0, armv9.2 x2, each with
  KleidiAI) via stock `GGML_CPU_ALL_VARIANTS=ON`; ggml scores and loads best at startup - a build
  decision (stock llama.cpp mechanism), not authored kernels. APK ~9.8 MB vs ~7 MB single-variant.
- ADPF (v3.6.0): deadline-hint session on the decode thread; `adpf` arm ships in Bench v2.1.0;
  "documents a mechanism, not a result" - no claim.
- Sustained mode: 2/5/10 min back-to-back, threads-only vs auto, 2 s gap (bench README).
  No sustained-run export exists in `benchmarks/results/` as of 2026-07-24, so A6 is a schematic.
- Cooldown protocol: discarded PP64/TG16 warm-up; before every pass >=15 s, up to 90 s until
  battery within 0.5 C of pre-run reading (not waiting below 37.5 C); arms in order
  naive -> threads-only -> auto (`benchmarks/REPRODUCIBILITY.md`).
- Contention ceiling (CLI-only, never an app claim): naive 0.7 vs pinned+realtime 4.4 tok/s (6.3x)
  under background download, `--prio 3` SCHED_RR - `docs/OPTIMIZATIONS.md` section 5.

## Screenshot-anchored figures

- Chat stats bar: `100tok - 16.4t/s - TTFT 299ms - 33.0C - 4.34W - CPU 47% - 1.2GB` (Home.png).
- Model info: Q4_0, 773 MB, trained context 131072, running context 4096 auto-fit, 1.1-1.2 GB
  free, Compute: CPU - 4 perf cores - dotprod - KleidiAI active (Model_Info.png). A5 anchor.
- Bench device card: Nothing A015, 4x 2.5GHz + 4x 2.0GHz, UNPLUGGED OK; chip grid solid:
  dotprod gemm, fp16 vector, kleidiai q4_0, big.LITTLE pin, adaptive threads, adaptive ctx,
  thermal guard, mmap weights, energy telem; outline: i8mm gemm, sve2 kernels, sme, sme2
  kleidiai. Legend "solid = live on this device - outline = not present" (Home1.png). A3 anchor.
- Bench last result: DECODE +102% VS NAIVE, 1-run median, "Thread count alone earns +63%;
  pinning adds +24% on top", bars 9.0 / 14.6 / 18.1 t/s; footer "v2.1.1 - arm64 - no network -
  results stay on this phone" (Home2.png). The +102% figure appears ONLY on the Apps page as
  what the bench screen reported on one run - it is 1-run provisional under leaderboard rules.
- Bench full result (Benchmark.png): prompt 111/127/140, decode 9.0/14.6/18.1, TTFT
  4724/4100/3712 ms, power 4.3/4.6/4.2 W, tok/W 2.1/3.2/4.3, App CPU 402/393/409%, perf clk
  2500 MHz, LITTLE clk 860/1401/742 MHz, free RAM 1.2/1.1/1.1 GB, start 30/31/31 C, peak batt
  31 C, peak thermal NONE. "2.1X MORE EFFICIENT" headline (tok/W 2.1 -> 4.3).
- Chat benchmark history: `+85% decode vs naive`, 2026-07-24, 1 run, 3-arm, unplugged
  (Benchmark_Results.png).
- Contribute screen copy (bench Settings2.png): off by default; summary numbers only; no
  telemetry trace, no accounts, no identifier linking two runs; charging recorded because a
  charging phone reports the charger's current; SHOW EXACTLY WHAT GETS SENT.

## Voice references

- "solid = live on this device, outline = not present" (bench device card).
- "results stay on this phone" (bench footer).
- Bench design self-description: monochrome, no pure #000/#FFF (halation; #121212 + #E4E4E4 =
  15:1), "a lab instrument, not a dashboard" (`app/entity.bench.android/README.md`).
- JOURNEY framing: "The falsifications are the evidence that the surviving numbers were actually
  checked" (README.md footer paraphrase of `docs/JOURNEY.md`).
- Method habits: isolate before attributing; call the rule, never restate it; measure on silicon
  you do not own; publish the falsification (`docs/JOURNEY.md`).

## Colour tokens (v3.4.0)

Source: brief + `releases/RELEASE-v3.4.0.md` rationale (halation). Dark: bg #121212, surface
#1E1E1E, fg #E4E4E4, dim #A0A0A0, outline #333333, fill #D6D6D6, on_fill #121212. Light: bg
#F1F0EC, surface #F9F8F5, fg #1F1F1D, dim #5C5C58, outline #D6D4CE, fill #1F1F1D, on_fill #F9F8F5.

## Supabase

Project `ksfuiykmfqhpjpsvvcpe`, table `public.bench_results`, PostgREST + anon key (safe to
publish: insert-only policy documented in `benchmarks/CONTRIBUTE-BACKEND.md`). Read policy for
the leaderboard requires the user-approved migration in `contribute-schema.sql` style:
`create policy "anon can read results" on public.bench_results for select to anon using (true);`
Snapshot: `src/data/leaderboard.json` in this repo, refreshed by `npm run refresh:leaderboard`.

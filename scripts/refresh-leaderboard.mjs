/*
  Refreshes the committed leaderboard snapshot from the public PostgREST
  endpoint. Requires the anon read policy to be live on public.bench_results.
  Run: npm run refresh:leaderboard
*/
import { writeFile } from "node:fs/promises";
import path from "node:path";

const URL = "https://ksfuiykmfqhpjpsvvcpe.supabase.co";
const KEY = "sb_publishable_r2Es7eYPFgIb8CWWIbyJIA_8SuVu-2A";

const res = await fetch(`${URL}/rest/v1/bench_results?select=*&order=id.asc&limit=10000`, {
  headers: { apikey: KEY, Authorization: `Bearer ${KEY}` },
});
if (!res.ok) {
  console.error(`fetch failed: HTTP ${res.status} - is the anon read policy applied?`);
  process.exit(1);
}
const rows = await res.json();
if (!Array.isArray(rows) || rows.length === 0) {
  console.error("fetch returned no rows; refusing to overwrite the snapshot");
  process.exit(1);
}
const out = {
  fetched_at: new Date().toISOString(),
  source: "supabase:public.bench_results",
  rows,
};
const file = path.resolve(import.meta.dirname, "..", "src", "data", "leaderboard.json");
await writeFile(file, JSON.stringify(out, null, 1));
console.log(`snapshot refreshed: ${rows.length} rows`);

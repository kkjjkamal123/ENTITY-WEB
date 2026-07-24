/*
  Public read access to the contributed-results table.
  The publishable key is designed to be public (it ships inside the bench APK
  and every Supabase web client); with the table's row-level security it
  grants inserts and - once the read policy is applied - selects, nothing
  else. See benchmarks/CONTRIBUTE-BACKEND.md in the source repo.
*/
export const SUPABASE_URL = "https://ksfuiykmfqhpjpsvvcpe.supabase.co";
export const SUPABASE_KEY = "sb_publishable_r2Es7eYPFgIb8CWWIbyJIA_8SuVu-2A";

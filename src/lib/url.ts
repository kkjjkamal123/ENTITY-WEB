const raw = import.meta.env.BASE_URL;
const base = raw.endsWith("/") ? raw.slice(0, -1) : raw;

/** Prefix a site-absolute path ("/leaderboard/") with the deploy base. */
export const withBase = (path: string): string =>
  `${base}${path.startsWith("/") ? path : `/${path}`}`;

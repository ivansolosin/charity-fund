/** Shared PostgreSQL SSL settings for Railway and local dev. */
export function pgSslOption() {
  const url = process.env.DATABASE_URL || "";
  const useSsl =
    process.env.PGSSLMODE !== "disable" &&
    (process.env.PGSSLMODE === "require" ||
      url.includes("sslmode=require") ||
      url.includes("railway.app") ||
      url.includes("proxy.rlwy.net"));
  return useSsl ? { rejectUnauthorized: false } : false;
}

export function pgClientOptions() {
  return {
    connectionString: process.env.DATABASE_URL,
    ssl: pgSslOption(),
  };
}

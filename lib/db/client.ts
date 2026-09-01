import { Pool } from "pg";
import { resolveConfiguredDbEnv } from "./env";

const MISSING_DB_MESSAGE =
  "Saknad connection string till databasen. Sätt POSTGRES_URL, POSTGRES_URL_NON_POOLING, STORAGE_POSTGRES_URL eller STORAGE_POSTGRES_URL_NON_POOLING.";

/**
 * Under `next build` samlar Next.js metadata genom att importera varje route-
 * modul. Utan den här gränsen kastar en saknad connection string och sänker
 * hela bygget — exakt det som fällde den tidigare deployen.
 */
function isBuildPhase(): boolean {
  return (
    process.env.NEXT_PHASE === "phase-production-build" ||
    process.env.NEXT_PHASE === "phase-export"
  );
}

function resolveDbConnectionString(): string | null {
  const connectionString =
    resolveConfiguredDbEnv(process.env, {
      warnOnUninterpolated: process.env.NODE_ENV === "development",
    })?.connectionString || null;

  if (!connectionString) {
    if (!isBuildPhase()) {
      throw new Error(MISSING_DB_MESSAGE);
    }
    return null;
  }

  return connectionString;
}

const connectionString = resolveDbConnectionString();
export const dbConfigured = Boolean(connectionString);

const VERIFYING_SSL_MODES = new Set(["verify-ca", "verify-full"]);
const NON_VERIFYING_SSL_MODES = new Set(["allow", "prefer", "require", "no-verify"]);

function parseBooleanEnv(value: string | undefined): boolean | undefined {
  if (value == null) return undefined;
  let normalized = value.trim();
  if (
    (normalized.startsWith('"') && normalized.endsWith('"')) ||
    (normalized.startsWith("'") && normalized.endsWith("'"))
  ) {
    normalized = normalized.slice(1, -1).trim();
  }
  normalized = normalized.toLowerCase();
  if (!normalized) return undefined;

  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;

  return undefined;
}

function getSslMode(connStr: string): string | null {
  try {
    const url = new URL(connStr);
    return url.searchParams.get("sslmode")?.trim().toLowerCase() || null;
  } catch {
    return null;
  }
}

function resolvePoolSslConfig(connStr: string): false | { rejectUnauthorized: boolean } {
  const configured = parseBooleanEnv(process.env.DB_SSL_REJECT_UNAUTHORIZED);
  const sslMode = getSslMode(connStr);

  if (sslMode === "disable") return false;

  const rejectUnauthorized =
    configured ??
    (sslMode && NON_VERIFYING_SSL_MODES.has(sslMode)
      ? false
      : sslMode && VERIFYING_SSL_MODES.has(sslMode)
        ? true
        : true);

  return { rejectUnauthorized };
}

/** Supabase-poolern kväljer sig på `sslmode` och `supa` i query-stringen. */
function cleanConnectionString(connStr: string): string {
  try {
    const url = new URL(connStr);
    url.searchParams.delete("sslmode");
    url.searchParams.delete("supa");
    return url.toString();
  } catch {
    return connStr;
  }
}

/**
 * Känner igen connection strings som går via Supavisor/pgbouncer. Poolern
 * kapar antalet *samtidiga sessioner* hårt (~15 på free, ~60 på pro). I en
 * serverless-miljö skapar varje cold-start-instans sin egen pg.Pool, så ett
 * högt `max` × N instanser slår i poolerns tak som `EMAXCONNSESSION`.
 */
function looksPooled(connStr: string): boolean {
  try {
    const url = new URL(connStr);
    if (url.searchParams.get("pgbouncer") === "true") return true;
    if (url.hostname.includes("pooler.")) return true;
    if (url.port === "6543" || url.port === "5433") return true;
    return false;
  } catch {
    return false;
  }
}

function parsePositiveIntEnv(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const n = Number.parseInt(value.trim(), 10);
  if (!Number.isFinite(n) || n <= 0) return undefined;
  return n;
}

function resolvePoolMax(connStr: string): number {
  return (
    parsePositiveIntEnv(process.env.POSTGRES_POOL_MAX) ?? (looksPooled(connStr) ? 3 : 10)
  );
}

function resolveIdleTimeoutMs(connStr: string): number {
  // Pgbouncer i transaction-mode ogillar långlivade sessioner: stäng lediga
  // anslutningar snabbt så de återlämnas till poolern.
  return (
    parsePositiveIntEnv(process.env.POSTGRES_POOL_IDLE_TIMEOUT_MS) ??
    (looksPooled(connStr) ? 5_000 : 30_000)
  );
}

/**
 * HMR-överlevande pool-cache. Next.js dev omvärderar modulen vid varje Fast
 * Refresh, vilket annars skapar en ny Pool per ombygge och läcker sessioner
 * mot poolern tills allt svarar 500. Samma mönster som Prisma-rekommendationen.
 */
type GlobalWithPool = typeof globalThis & {
  __siteagentPgPool__?: Pool | null;
};
const globalForPool = globalThis as GlobalWithPool;

const pool = (globalForPool.__siteagentPgPool__ ??= connectionString
  ? new Pool({
      connectionString: cleanConnectionString(connectionString),
      ssl: resolvePoolSslConfig(connectionString),
      max: resolvePoolMax(connectionString),
      idleTimeoutMillis: resolveIdleTimeoutMs(connectionString),
      connectionTimeoutMillis:
        parsePositiveIntEnv(process.env.POSTGRES_CONNECT_TIMEOUT_MS) ?? 10_000,
      // TCP keep-alive: utan den kan en anslutning som poolern tyst släppt
      // ligga kvar som "ledig" och ge connection-reset först vid nästa query.
      keepAlive: true,
    })
  : null);

if (pool) {
  pool.on("error", (err) => {
    const msg = err.message ?? String(err);
    if (msg.includes("EMAXCONNSESSION") || msg.includes("max clients")) {
      console.error(
        "[db/client] Poolerns kapacitet uttömd (EMAXCONNSESSION). " +
          "Sänk POSTGRES_POOL_MAX eller gå på direktanslutning.",
        msg,
      );
    } else {
      console.error("[db/client] Oväntat poolfel:", msg);
    }
  });
}

export { pool };

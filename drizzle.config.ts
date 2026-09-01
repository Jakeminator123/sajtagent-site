import { config } from "dotenv";
import type { Config } from "drizzle-kit";

// Ladda lokala env-filer för drizzle-kit (körs utanför Next.js runtime).
config({ path: ".env.development.local" });
config({ path: ".env.local" });

export default {
  schema: "./lib/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    // Migrationer ska gå direkt mot databasen, inte via Supavisor-poolern.
    url:
      process.env.POSTGRES_URL_NON_POOLING ||
      process.env.POSTGRES_URL ||
      process.env.DATABASE_URL ||
      "",
  },
  // Detta repo ska använda en fristående Sajtagent-databas, aldrig
  // Sajtmaskins databas. Drizzle äger bara de äldre workflow-tabellerna;
  // build-job-tabellerna ägs av versionsstyrda Supabase-migrationer.
  tablesFilter: ["workflows", "workflow_executions", "workflow_memory"],
} satisfies Config;

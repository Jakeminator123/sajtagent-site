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
  // Siteagent delar dev-databas med sajtmaskin. Utan den här filtreringen
  // skulle drizzle-kit se sajtmaskins ~38 tabeller som "främmande" och
  // föreslå DROP på dem.
  tablesFilter: ["workflows", "workflow_executions", "workflow_memory"],
} satisfies Config;

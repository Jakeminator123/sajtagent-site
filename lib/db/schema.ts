import { sql } from "drizzle-orm";
import {
  pgTable,
  text,
  timestamp,
  jsonb,
  index,
  unique,
} from "drizzle-orm/pg-core";

// Speglar sajtmaskins konvention: alla tidsstämplar är TIMESTAMPTZ så att
// NOW() och explicita JS-Date-skrivningar lagras som UTC oavsett DB-sessionens
// timezone. Bar timestamp() (WITHOUT TIME ZONE) ger 2h-drift.
const timestamptz = (name: string) => timestamp(name, { withTimezone: true });

// ID-konvention härmad från sajtmaskin: text-kolumner, inte uuid (deras schema
// använder text() 294 ggr och uuid() noll ggr). DB-defaulten behålls så att
// route-koden slipper generera id:n själv.
const textId = () =>
  text("id")
    .primaryKey()
    .default(sql`gen_random_uuid()::text`);

export const workflows = pgTable(
  "workflows",
  {
    id: textId(),
    name: text("name").notNull(),
    description: text("description"),
    nodes: jsonb("nodes").notNull().default([]),
    edges: jsonb("edges").notNull().default([]),
    createdAt: timestamptz("created_at").defaultNow().notNull(),
    updatedAt: timestamptz("updated_at").defaultNow().notNull(),
  },
  (table) => [index("idx_workflows_updated_at").on(table.updatedAt.desc())],
);

export const workflowExecutions = pgTable(
  "workflow_executions",
  {
    id: textId(),
    workflowId: text("workflow_id").references(() => workflows.id, {
      onDelete: "cascade",
    }),
    status: text("status").notNull().default("pending"),
    input: jsonb("input"),
    output: jsonb("output"),
    error: text("error"),
    finalOutput: text("final_output"),
    startedAt: timestamptz("started_at").defaultNow().notNull(),
    completedAt: timestamptz("completed_at"),
  },
  (table) => [
    index("idx_workflow_executions_workflow_id").on(table.workflowId),
    index("idx_workflow_executions_status").on(table.status),
  ],
);

export const workflowMemory = pgTable(
  "workflow_memory",
  {
    id: textId(),
    workflowId: text("workflow_id").references(() => workflows.id, {
      onDelete: "cascade",
    }),
    key: text("key").notNull(),
    value: jsonb("value").notNull(),
    // data_type saknades i scripts/001-create-workflow-tables.sql men läses och
    // skrivs av app/api/memory/route.ts — tas med här så schema och kod stämmer.
    dataType: text("data_type").default("text"),
    createdAt: timestamptz("created_at").defaultNow().notNull(),
    updatedAt: timestamptz("updated_at").defaultNow().notNull(),
  },
  (table) => [
    unique("workflow_memory_workflow_id_key_key").on(table.workflowId, table.key),
    index("idx_workflow_memory_workflow_id").on(table.workflowId),
    index("idx_workflow_memory_key").on(table.key),
  ],
);

export type Workflow = typeof workflows.$inferSelect;
export type WorkflowExecution = typeof workflowExecutions.$inferSelect;
export type WorkflowMemory = typeof workflowMemory.$inferSelect;

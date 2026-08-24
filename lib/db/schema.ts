import {
  pgTable,
  text,
  timestamp,
  varchar,
  jsonb,
  uuid,
  index,
  unique,
} from "drizzle-orm/pg-core";

// Speglar sajtmaskins konvention: alla tidsstämplar är TIMESTAMPTZ så att
// NOW() och explicita JS-Date-skrivningar lagras som UTC oavsett DB-sessionens
// timezone. Bar timestamp() (WITHOUT TIME ZONE) ger 2h-drift.
const timestamptz = (name: string) => timestamp(name, { withTimezone: true });

export const workflows = pgTable(
  "workflows",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: varchar("name", { length: 255 }).notNull(),
    description: text("description"),
    nodes: jsonb("nodes").notNull().default([]),
    edges: jsonb("edges").notNull().default([]),
    createdAt: timestamptz("created_at").defaultNow(),
    updatedAt: timestamptz("updated_at").defaultNow(),
  },
  (table) => [index("idx_workflows_updated_at").on(table.updatedAt.desc())],
);

export const workflowExecutions = pgTable(
  "workflow_executions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workflowId: uuid("workflow_id").references(() => workflows.id, {
      onDelete: "cascade",
    }),
    status: varchar("status", { length: 50 }).notNull().default("pending"),
    input: jsonb("input"),
    output: jsonb("output"),
    error: text("error"),
    finalOutput: text("final_output"),
    startedAt: timestamptz("started_at").defaultNow(),
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
    id: uuid("id").primaryKey().defaultRandom(),
    workflowId: uuid("workflow_id").references(() => workflows.id, {
      onDelete: "cascade",
    }),
    key: varchar("key", { length: 255 }).notNull(),
    value: jsonb("value").notNull(),
    // data_type saknades i scripts/001-create-workflow-tables.sql men läses och
    // skrivs av app/api/memory/route.ts — tas med här så schema och kod stämmer.
    dataType: varchar("data_type", { length: 50 }).default("text"),
    createdAt: timestamptz("created_at").defaultNow(),
    updatedAt: timestamptz("updated_at").defaultNow(),
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

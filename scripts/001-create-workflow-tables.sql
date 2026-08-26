-- Workflow Editor Database Schema
-- Skapar de tre tabellerna Siteagent behover. Ror INGA befintliga tabeller.
--
-- Konventioner harmade fran sajtmaskin (jakembase_dev):
--   * TEXT-kolumner for id:n och strangar (deras schema anvander text() 294 ggr,
--     uuid() noll ggr). DB-defaulten behalls sa route-koden slipper generera id.
--   * TIMESTAMPTZ pa alla tidsstamplar (bar TIMESTAMP ger 2h-drift).
--   * RLS pa + policy <tabell>_backend_full_access, precis som databasens
--     ovriga 42 tabeller. Utan detta star tabellerna oskyddade i en DB dar
--     allt annat ar last.

CREATE TABLE IF NOT EXISTS workflows (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  name TEXT NOT NULL,
  description TEXT,
  nodes JSONB NOT NULL DEFAULT '[]',
  edges JSONB NOT NULL DEFAULT '[]',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS workflow_executions (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  workflow_id TEXT REFERENCES workflows(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending',
  input JSONB,
  output JSONB,
  error TEXT,
  final_output TEXT,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS workflow_memory (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  workflow_id TEXT REFERENCES workflows(id) ON DELETE CASCADE,
  key TEXT NOT NULL,
  value JSONB NOT NULL,
  data_type TEXT DEFAULT 'text',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(workflow_id, key)
);

CREATE INDEX IF NOT EXISTS idx_workflows_updated_at ON workflows(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_workflow_executions_workflow_id ON workflow_executions(workflow_id);
CREATE INDEX IF NOT EXISTS idx_workflow_executions_status ON workflow_executions(status);
CREATE INDEX IF NOT EXISTS idx_workflow_memory_workflow_id ON workflow_memory(workflow_id);
CREATE INDEX IF NOT EXISTS idx_workflow_memory_key ON workflow_memory(key);

-- RLS enligt databasens befintliga monster. service_role anvands av var
-- server-side pg-pool; anon/authenticated far ingen atkomst.
ALTER TABLE workflows ENABLE ROW LEVEL SECURITY;
ALTER TABLE workflow_executions ENABLE ROW LEVEL SECURITY;
ALTER TABLE workflow_memory ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS workflows_backend_full_access ON workflows;
CREATE POLICY workflows_backend_full_access ON workflows
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS workflow_executions_backend_full_access ON workflow_executions;
CREATE POLICY workflow_executions_backend_full_access ON workflow_executions
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS workflow_memory_backend_full_access ON workflow_memory;
CREATE POLICY workflow_memory_backend_full_access ON workflow_memory
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- app/api/memory/route.ts läser och skriver workflow_memory.data_type, men
-- kolumnen saknades i 001-create-workflow-tables.sql. Utan den kastar både
-- SELECT och INSERT "column data_type does not exist".
ALTER TABLE workflow_memory
  ADD COLUMN IF NOT EXISTS data_type VARCHAR(50) DEFAULT 'text';

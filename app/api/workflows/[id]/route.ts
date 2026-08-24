import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, workflows } from "@/lib/db";

const workflowColumns = {
  id: workflows.id,
  name: workflows.name,
  description: workflows.description,
  created_at: workflows.createdAt,
  updated_at: workflows.updatedAt,
};

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const [workflow] = await db
      .select({ ...workflowColumns, nodes: workflows.nodes, edges: workflows.edges })
      .from(workflows)
      .where(eq(workflows.id, id))
      .limit(1);

    if (!workflow) {
      return NextResponse.json({ error: "Workflow not found" }, { status: 404 });
    }

    return NextResponse.json({ workflow });
  } catch (error) {
    console.error("Error fetching workflow:", error);
    return NextResponse.json({ error: "Failed to fetch workflow" }, { status: 500 });
  }
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { name, description, nodes, edges } = await request.json();

    // Bara fält som faktiskt skickats skrivs. Den tidigare COALESCE-varianten
    // körde JSON.stringify(undefined) -> undefined och kunde nolla nodes/edges.
    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (name !== undefined) updates.name = name;
    if (description !== undefined) updates.description = description;
    if (nodes !== undefined) updates.nodes = nodes;
    if (edges !== undefined) updates.edges = edges;

    const [workflow] = await db
      .update(workflows)
      .set(updates)
      .where(eq(workflows.id, id))
      .returning(workflowColumns);

    if (!workflow) {
      return NextResponse.json({ error: "Workflow not found" }, { status: 404 });
    }

    return NextResponse.json({ workflow });
  } catch (error) {
    console.error("Error updating workflow:", error);
    return NextResponse.json({ error: "Failed to update workflow" }, { status: 500 });
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    await db.delete(workflows).where(eq(workflows.id, id));
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting workflow:", error);
    return NextResponse.json({ error: "Failed to delete workflow" }, { status: 500 });
  }
}

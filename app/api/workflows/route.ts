import { NextResponse } from "next/server";
import { desc } from "drizzle-orm";
import { db, workflows } from "@/lib/db";

// Selecten aliasas till snake_case eftersom klientkomponenterna
// (load-workflow-dialog, run-history-dialog) läser de nycklarna.
export async function GET() {
  try {
    const rows = await db
      .select({
        id: workflows.id,
        name: workflows.name,
        description: workflows.description,
        created_at: workflows.createdAt,
        updated_at: workflows.updatedAt,
      })
      .from(workflows)
      .orderBy(desc(workflows.updatedAt));

    return NextResponse.json({ workflows: rows });
  } catch (error) {
    console.error("Error fetching workflows:", error);
    return NextResponse.json({ error: "Failed to fetch workflows" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const { name, description, nodes, edges } = await request.json();

    if (!name) {
      return NextResponse.json({ error: "Name is required" }, { status: 400 });
    }

    const [workflow] = await db
      .insert(workflows)
      .values({
        name,
        description: description || null,
        // jsonb-kolumner tar emot värdet direkt — ingen JSON.stringify behövs,
        // den dubbelkodade strängen som fanns förut lagrades som JSON-text.
        nodes: nodes ?? [],
        edges: edges ?? [],
      })
      .returning({
        id: workflows.id,
        name: workflows.name,
        description: workflows.description,
        created_at: workflows.createdAt,
        updated_at: workflows.updatedAt,
      });

    return NextResponse.json({ workflow });
  } catch (error) {
    console.error("Error creating workflow:", error);
    return NextResponse.json({ error: "Failed to create workflow" }, { status: 500 });
  }
}

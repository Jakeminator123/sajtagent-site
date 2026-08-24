import { NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { db, workflowExecutions } from "@/lib/db";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    const history = await db
      .select({
        id: workflowExecutions.id,
        workflow_id: workflowExecutions.workflowId,
        status: workflowExecutions.status,
        final_output: workflowExecutions.finalOutput,
        started_at: workflowExecutions.startedAt,
        completed_at: workflowExecutions.completedAt,
      })
      .from(workflowExecutions)
      .where(eq(workflowExecutions.workflowId, id))
      .orderBy(desc(workflowExecutions.startedAt))
      .limit(20);

    return NextResponse.json({ history });
  } catch (error) {
    console.error("Failed to fetch run history:", error);
    return NextResponse.json(
      { error: "Failed to fetch run history" },
      { status: 500 }
    );
  }
}

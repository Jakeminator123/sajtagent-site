import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db, workflowMemory } from "@/lib/db";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const workflowId = searchParams.get("workflowId");
    const key = searchParams.get("key");

    if (!workflowId || !key) {
      return NextResponse.json({ error: "workflowId and key are required" }, { status: 400 });
    }

    const [row] = await db
      .select({ value: workflowMemory.value, dataType: workflowMemory.dataType })
      .from(workflowMemory)
      .where(and(eq(workflowMemory.workflowId, workflowId), eq(workflowMemory.key, key)))
      .limit(1);

    if (!row) {
      return NextResponse.json({ value: null });
    }

    return NextResponse.json({ value: row.value, dataType: row.dataType });
  } catch (error) {
    console.error("Error reading memory:", error);
    return NextResponse.json({ error: "Failed to read memory" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const { workflowId, key, value, dataType } = await request.json();

    if (!workflowId || !key) {
      return NextResponse.json({ error: "workflowId and key are required" }, { status: 400 });
    }

    await db
      .insert(workflowMemory)
      .values({ workflowId, key, value, dataType: dataType || "text" })
      .onConflictDoUpdate({
        target: [workflowMemory.workflowId, workflowMemory.key],
        set: { value, dataType: dataType || "text", updatedAt: new Date() },
      });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error writing memory:", error);
    return NextResponse.json({ error: "Failed to write memory" }, { status: 500 });
  }
}

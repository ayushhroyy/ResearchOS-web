// Edit route: given the current document + a user edit request, ask the agent
// to plan a batch of ops, then stream the plan back to the client. The client
// applies the ops to its live ProseMirror editor (server can't touch it).
//
// Doc JSON travels in the request body (it's the client's source of truth).
import { NextResponse } from "next/server";
import { userIdFromRequest } from "@/lib/db/supabase";
import { planEdit } from "@/lib/ai/agent";
import type { TipTapDoc } from "@/lib/doc/schema";

export async function POST(req: Request) {
  const userId = await userIdFromRequest(req);
  if (!userId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let message: string;
  let doc: TipTapDoc;
  try {
    const body = await req.json();
    message = body.message;
    doc = body.doc;
  } catch {
    return NextResponse.json({ error: "bad body" }, { status: 400 });
  }
  if (!message || typeof message !== "string") {
    return NextResponse.json({ error: "message required" }, { status: 400 });
  }
  if (!doc || !Array.isArray(doc.content)) {
    return NextResponse.json({ error: "doc required" }, { status: 400 });
  }

  let plan;
  try {
    plan = await planEdit(doc, message);
  } catch (err) {
    const m = err instanceof Error ? err.message : "planning failed";
    return NextResponse.json({ error: m }, { status: 502 });
  }

  return NextResponse.json({ plan });
}

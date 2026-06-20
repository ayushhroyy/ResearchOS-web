// Returns a one-shot signed upload URL + the sources row to create.
// The client then PUTs the file directly to Supabase Storage (no proxying
// bytes through our edge worker), and POSTs /api/ingest when done.
import { NextResponse } from "next/server";
import { adminClient, userIdFromRequest } from "@/lib/db/supabase";
import { nanoid } from "nanoid";

function kindOf(mime: string): "image" | "pdf" | "note" {
  if (mime.startsWith("image/")) return "image";
  if (mime === "application/pdf") return "pdf";
  return "note"; // text/*, markdown, etc.
}

export async function POST(req: Request) {
  const userId = await userIdFromRequest(req);
  if (!userId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: { name: string; mimeType: string; bytes?: number };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "bad body" }, { status: 400 });
  }
  if (!body.name || !body.mimeType) {
    return NextResponse.json({ error: "name + mimeType required" }, { status: 400 });
  }

  const admin = adminClient();
  const kind = kindOf(body.mimeType);
  // Storage path: <userId>/<sourceId>/<safe-name>  (RLS keys on the userId folder)
  const sourceId = nanoid(12);
  const safeName = body.name.replace(/[^\w.\-]+/g, "_");
  const storagePath = `${userId}/${sourceId}/${safeName}`;

  // 1. create the sources row (status pending)
  const { error: insErr } = await admin.from("sources").insert({
    id: sourceId,
    user_id: userId,
    name: body.name,
    mime_type: body.mimeType,
    storage_path: storagePath,
    kind,
    bytes: body.bytes ?? null,
    status: "pending",
  });
  if (insErr) {
    return NextResponse.json({ error: insErr.message }, { status: 500 });
  }

  // 2. signed upload URL (2 min window)
  const { data: up, error: upErr } = await admin.storage
    .from("sources")
    .createSignedUploadUrl(storagePath);
  if (upErr || !up) {
    await admin.from("sources").delete().eq("id", sourceId);
    return NextResponse.json({ error: "upload url failed" }, { status: 500 });
  }

  return NextResponse.json({
    sourceId,
    storagePath,
    uploadUrl: up.signedUrl,
    path: up.path,
    token: up.token,
    kind,
  });
}

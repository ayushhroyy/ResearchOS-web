// Ingest one uploaded source: OCR → chunk → embed → store chunks.
//
// Flow (client-driven to dodge edge CPU limits):
//   1. Client uploads the file to Supabase Storage and INSERTs a `sources`
//      row (status 'pending').  ← done in the UploadZone component.
//   2. Client POSTs { sourceId } here.
//   3. We: create a 10-min signed URL → OCR → chunk → embed batch →
//      upsert into `chunks` → mark source 'ready' (content_md stored too).
//
// Auth: caller must be signed in; we verify the source belongs to them.
import { NextResponse } from "next/server";
import { adminClient } from "@/lib/db/supabase";
import { userIdFromRequest } from "@/lib/db/supabase";
import { ocrUrl } from "@/lib/ai/ocr";
import { embedBatch } from "@/lib/ai/embed";
import { chunkText } from "@/lib/doc/chunk";

export async function POST(req: Request) {
  const userId = await userIdFromRequest(req);
  if (!userId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let sourceId: string;
  try {
    const body = await req.json();
    sourceId = body.sourceId;
  } catch {
    return NextResponse.json({ error: "bad body" }, { status: 400 });
  }
  if (!sourceId) {
    return NextResponse.json({ error: "sourceId required" }, { status: 400 });
  }

  const admin = adminClient();

  // Load the source, scoped to this user (defense-in-depth even with service
  // role: we only ever touch the row if it's theirs).
  const { data: source, error } = await admin
    .from("sources")
    .select("id,user_id,name,mime_type,storage_path,kind,status")
    .eq("id", sourceId)
    .single();
  if (error || !source) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  if (source.user_id !== userId) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  await admin
    .from("sources")
    .update({ status: "processing" })
    .eq("id", sourceId);

  try {
    let markdown = "";

    if (source.kind === "note") {
      // Plain text: download from storage, no OCR needed.
      const { data, error: dlErr } = await admin.storage
        .from("sources")
        .download(source.storage_path);
      if (dlErr || !data) throw new Error("storage download failed");
      markdown = await data.text();
    } else {
      // Image/PDF: signed URL → aimlapi OCR.
      const { data: signed, error: sErr } = await admin.storage
        .from("sources")
        .createSignedUrl(source.storage_path, 600); // 10 min
      if (sErr || !signed?.signedUrl) {
        throw new Error("could not create signed url");
      }
      markdown = await ocrUrl(signed.signedUrl, source.kind as "image" | "pdf");
    }

    markdown = markdown.trim();
    if (!markdown) throw new Error("OCR returned empty text");

    const chunks = chunkText(markdown);
    if (chunks.length === 0) {
      await admin
        .from("sources")
        .update({ status: "ready", content_md: markdown })
        .eq("id", sourceId);
      return NextResponse.json({ ok: true, chunks: 0 });
    }

    // Embed in batches (embeddings API accepts arrays).
    const embeddings: number[][] = [];
    for (let i = 0; i < chunks.length; i += 32) {
      const batch = chunks.slice(i, i + 32);
      const vecs = await embedBatch(batch.map((c) => c.content));
      embeddings.push(...vecs);
    }

    // Wipe old chunks for this source (idempotent re-ingest), then insert.
    await admin.from("chunks").delete().eq("source_id", sourceId);

    const rows = chunks.map((c, i) => ({
      source_id: sourceId,
      user_id: userId,
      ordinal: c.ordinal,
      content: c.content,
      embedding: embeddings[i],
    }));

    // Insert in batches of 100 to keep payload sane.
    for (let i = 0; i < rows.length; i += 100) {
      const { error: insErr } = await admin
        .from("chunks")
        .insert(rows.slice(i, i + 100));
      if (insErr) throw new Error(`insert chunks: ${insErr.message}`);
    }

    await admin
      .from("sources")
      .update({ status: "ready", content_md: markdown })
      .eq("id", sourceId);

    return NextResponse.json({ ok: true, chunks: chunks.length });
  } catch (err) {
    const message = err instanceof Error ? err.message : "ingest failed";
    await admin
      .from("sources")
      .update({ status: "error", error: message })
      .eq("id", sourceId);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

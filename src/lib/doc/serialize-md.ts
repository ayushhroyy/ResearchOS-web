// ────────────────────────────────────────────────────────────────────────────
// serialize-md.ts — convert a TipTap document to Markdown.
//
// We walk the JSON tree directly (no DOM needed) so this works on the server
// too. Covers the block types the agent can produce: headings, paragraphs,
// lists, blockquote, code block, table, image, horizontal rule.
// ────────────────────────────────────────────────────────────────────────────
import type { TipTapDoc } from "./schema";

interface PmNode {
  type: string;
  attrs?: Record<string, unknown>;
  content?: PmNode[];
  text?: string;
  marks?: { type: string; attrs?: Record<string, unknown> }[];
}

function inlineToMd(node: PmNode): string {
  if (node.text != null) {
    let t = node.text;
    for (const mark of node.marks ?? []) {
      switch (mark.type) {
        case "bold":
          t = `**${t}**`;
          break;
        case "italic":
          t = `*${t}*`;
          break;
        case "code":
          t = `\`${t}\``;
          break;
        case "link":
          t = `[${t}](${mark.attrs?.href ?? ""})`;
          break;
      }
    }
    return t;
  }
  if (node.content) return node.content.map(inlineToMd).join("");
  return "";
}

function blockToMd(node: PmNode): string {
  switch (node.type) {
    case "heading": {
      const level = (node.attrs?.level as number) ?? 1;
      return `${"#".repeat(Math.min(6, level))} ${inlineToMd(node)}`;
    }
    case "paragraph":
      return inlineToMd(node);
    case "bulletList":
      return (node.content ?? [])
        .map((li) => `- ${liToText(li)}`)
        .join("\n");
    case "orderedList":
      return (node.content ?? [])
        .map((li, i) => `${i + 1}. ${liToText(li)}`)
        .join("\n");
    case "blockquote":
      return (inlineToMd(node))
        .split("\n")
        .map((l) => `> ${l}`)
        .join("\n");
    case "codeBlock":
      return "```\n" + (inlineToMd(node)) + "\n```";
    case "horizontalRule":
      return "---";
    case "image":
      return `![${(node.attrs?.alt as string) ?? ""}](${node.attrs?.src ?? ""})`;
    case "table":
      return tableToMd(node);
    default:
      return inlineToMd(node);
  }
}

function liToText(li: PmNode): string {
  // listItem → paragraph content
  return (li.content ?? [])
    .map((c) => inlineToMd(c))
    .join("\n");
}

function tableToMd(node: PmNode): string {
  const rows = (node.content ?? []).map((row) =>
    (row.content ?? []).map((cell) =>
      inlineToMd(cell).replace(/\|/g, "\\|").replace(/\n/g, " "),
    ),
  );
  if (rows.length === 0) return "";
  const width = Math.max(...rows.map((r) => r.length));
  const norm = rows.map((r) => {
    const out = [...r];
    while (out.length < width) out.push("");
    return out;
  });
  const header = `| ${norm[0].join(" | ")} |`;
  const sep = `| ${norm[0].map(() => "---").join(" | ")} |`;
  const body = norm.slice(1).map((r) => `| ${r.join(" | ")} |`).join("\n");
  return [header, sep, body].join("\n");
}

export function docToMarkdown(doc: TipTapDoc): string {
  const blocks = (doc.content ?? []) as unknown as PmNode[];
  if (blocks.length === 0) return "";
  return blocks
    .map((b) => blockToMd(b))
    .filter((s) => s.length > 0)
    .join("\n\n");
}

/** Build a Blob download for the given markdown (browser only). */
export function downloadMarkdown(filename: string, md: string) {
  const blob = new Blob([md], { type: "text/markdown;charset=utf-8" });
  triggerDownload(filename.endsWith(".md") ? filename : `${filename}.md`, blob);
}

function triggerDownload(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

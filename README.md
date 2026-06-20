# ResearchOS

Agentic document editing. Drop in files (images, PDFs, notes) → they're OCR'd,
chunked, embedded into a knowledge cluster. Then ask the agent to generate a
document (report, paper, question bank) and edit it surgically in a split-pane
chat+editor: "add a section about dogs", "move this paragraph up", "make this
red", "add a 3-column table". Export to Markdown or PDF.

## Stack
- **Next.js 16** (App Router, TS) + **TipTap** + **Tailwind/shadcn**
- **Cloudflare Pages** via `@opennextjs/cloudflare` (edge runtime)
- **aimlapi** (OpenAI-compatible) for LLM + vision + embeddings + OCR
- **Supabase** — Postgres + `pgvector` + Storage
- **Serper** for web search

## Setup
1. `npm install`
2. Copy `.env.example` → `.env.local`, fill in keys:
   - `AIMLAPI_KEY`, model ids (`AIMLAPI_*`)
   - `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
   - `SERPER_API_KEY`
3. Supabase: create project → SQL editor → run `supabase/schema.sql`.
   Create a **private** Storage bucket named `sources`.
   The app uses one shared workspace owner. Set `RESEARCHOS_USER_ID` to the
   UUID you want rows to use, or leave it unset for
   `00000000-0000-0000-0000-000000000000`.
4. `npm run dev` → http://localhost:3000

## Scripts
- `npm run dev` — local dev
- `npm run lint` / `npx tsc --noEmit` — checks
- `npm run build:worker` — build the Cloudflare worker (`.open-next/`)
- `npm run preview` — build + `wrangler dev` (local edge)
- `npm run deploy` — build + `wrangler deploy`

## Cloudflare deploy
1. `npm run build:worker`
2. `npx wrangler r2 bucket create rabbitt-ai-opennext-cache`
3. Set secrets: `npx wrangler secret put AIMLAPI_KEY`,
   `... SUPABASE_SERVICE_ROLE_KEY`, `... SERPER_API_KEY`, and optionally
   `... RESEARCHOS_USER_ID`.
   (Public vars like `NEXT_PUBLIC_*` go in `.env` for the build, then in the
   dashboard or `wrangler.jsonc` `vars`.)
4. `npm run deploy`

## Architecture
The document is a **TipTap JSON tree**; every top-level block has a stable
`id`. The agent never rewrites prose — it emits an **`Op[]`** (insert /
update_text / update_format / delete / move) via tool-calling, which we
translate to ProseMirror transactions. See `src/lib/doc/schema.ts` — the
contract the whole app depends on.

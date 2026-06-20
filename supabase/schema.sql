-- Rabbitt AI — Supabase schema
-- Run in Supabase SQL editor (Dashboard → SQL → New query).
-- Requires the pgvector extension (enable via Dashboard or the line below).

create extension if not exists vector;

-- ────────────────────────────────────────────────────────────────────────────
-- KNOWLEDGE CLUSTER: uploaded sources + their chunked/embedded text
-- ────────────────────────────────────────────────────────────────────────────

-- A source = one uploaded file (image, pdf, note). Owned by the shared workspace id.
create table if not exists sources (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null,
  name         text not null,                       -- original filename
  mime_type    text not null,
  storage_path text not null,                       -- path in the "sources" bucket
  kind         text not null check (kind in ('image', 'pdf', 'note')),
  -- raw OCR/extracted text (markdown). null until OCR finishes.
  content_md   text,
  status       text not null default 'pending'
               check (status in ('pending','processing','ready','error')),
  bytes        bigint,
  error        text,
  created_at   timestamptz not null default now()
);

create index if not exists sources_user_idx on sources (user_id, created_at desc);

-- A chunk = a ~500-token slice of a source's text, with its embedding.
-- Vector dim MUST match AIMLAPI_EMBEDDING_DIM (default 1536 for text-embedding-3-small).
create table if not exists chunks (
  id          uuid primary key default gen_random_uuid(),
  source_id   uuid not null references sources (id) on delete cascade,
  user_id     uuid not null,
  ordinal     int  not null,                        -- position within the source
  content     text not null,
  embedding   vector(1536) not null,
  created_at  timestamptz not null default now(),
  unique (source_id, ordinal)
);

create index if not exists chunks_user_idx      on chunks (user_id);
create index if not exists chunks_source_idx    on chunks (source_id);
-- ivfflat HNSW-free default; good enough at small scale. Tune later if needed.
create index if not exists chunks_embedding_idx on chunks
  using hnsw (embedding vector_cosine_ops);

-- ────────────────────────────────────────────────────────────────────────────
-- DOCUMENTS: the TipTap JSON docs users create/generate/edit
-- ────────────────────────────────────────────────────────────────────────────

create table if not exists documents (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null,
  title       text not null default 'Untitled',
  doc         jsonb not null default '{"type":"doc","content":[]}'::jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists documents_user_idx on documents (user_id, updated_at desc);

-- ────────────────────────────────────────────────────────────────────────────
-- ROW LEVEL SECURITY
-- App route handlers use the service-role key and a shared RESEARCHOS_USER_ID.
-- RLS remains enabled so anon clients cannot read/write these tables directly.
-- ────────────────────────────────────────────────────────────────────────────

alter table sources    enable row level security;
alter table chunks     enable row level security;
alter table documents  enable row level security;

-- Sources: users see/manage only their own.
create policy "sources select own" on sources
  for select using (auth.uid() = user_id);
create policy "sources insert own" on sources
  for insert with check (auth.uid() = user_id);
create policy "sources update own" on sources
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "sources delete own" on sources
  for delete using (auth.uid() = user_id);

-- Chunks: same ownership model.
create policy "chunks select own" on chunks
  for select using (auth.uid() = user_id);
create policy "chunks insert own" on chunks
  for insert with check (auth.uid() = user_id);
create policy "chunks update own" on chunks
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "chunks delete own" on chunks
  for delete using (auth.uid() = user_id);

-- Documents.
create policy "documents select own" on documents
  for select using (auth.uid() = user_id);
create policy "documents insert own" on documents
  for insert with check (auth.uid() = user_id);
create policy "documents update own" on documents
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "documents delete own" on documents
  for delete using (auth.uid() = user_id);

-- ────────────────────────────────────────────────────────────────────────────
-- STORAGE — private bucket for uploaded source files
-- ────────────────────────────────────────────────────────────────────────────
-- Create a PRIVATE bucket named "sources" in Dashboard → Storage, then run:

-- (uncomment to create via SQL)
-- insert into storage.buckets (id, name, public) values ('sources', 'sources', false)
--   on conflict (id) do nothing;

-- Storage RLS: a user can read/write only objects under their own user_id prefix.
create policy "sources storage read own"  on storage.objects
  for select using (bucket_id = 'sources' and auth.uid()::text = (storage.foldername(name))[1]);
create policy "sources storage write own" on storage.objects
  for insert with check (bucket_id = 'sources' and auth.uid()::text = (storage.foldername(name))[1]);
create policy "sources storage delete own" on storage.objects
  for delete using (bucket_id = 'sources' and auth.uid()::text = (storage.foldername(name))[1]);

-- Vector search helper: top-k chunks for a user by cosine similarity.
-- Call: select * from match_chunks(query_embedding := $1, query_user := $2, match_count := 5)
create or replace function match_chunks(
  query_embedding vector(1536),
  query_user      uuid,
  match_count     int default 6
) returns table (
  id          uuid,
  source_id   uuid,
  content     text,
  ordinal     int,
  similarity  float
)
language sql stable security definer set search_path = public
as $$
  select c.id, c.source_id, c.content, c.ordinal,
         1 - (c.embedding <=> query_embedding) as similarity
  from chunks c
  where c.user_id = query_user
  order by c.embedding <=> query_embedding
  limit match_count;
$$;

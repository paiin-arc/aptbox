-- aptbox AI overlay schema
-- Run once in your Supabase SQL editor (or `supabase migration up` if using the CLI).
--
-- Source of truth for ownership/access remains the on-chain Move registry.
-- This database is a cache + AI features overlay only — fully derivable from the chain.

create extension if not exists vector;

-- ── Per-file AI processing state ─────────────────────────────────────────────
create table if not exists aptbox_files (
  network         text     not null,            -- 'shelbynet' | 'testnet'
  file_id         bigint   not null,            -- matches on-chain registry id
  uploader        text     not null,            -- 0x... uploader address (denormalized for fast filters)
  shelby_cid      text     not null,            -- shelbyCid stored on chain
  mime_type       text,
  size_bytes      bigint,
  created_at      timestamptz default now(),

  -- AI overlay (nullable until processed)
  ai_status       text     default 'pending',   -- 'pending' | 'processing' | 'ready' | 'failed' | 'unsupported' | 'skipped'
  ai_summary      text,
  ai_tags         text[],
  ai_chunk_count  int      default 0,
  ai_processed_at timestamptz,
  ai_error        text,
  ai_retries      int      default 0,

  primary key (network, file_id)
);

create index if not exists idx_files_uploader on aptbox_files (network, uploader);
create index if not exists idx_files_status on aptbox_files (ai_status);

-- ── Vector chunks for RAG ────────────────────────────────────────────────────
create table if not exists aptbox_chunks (
  id              uuid     primary key default gen_random_uuid(),
  network         text     not null,
  file_id         bigint   not null,
  chunk_index     int      not null,
  content         text     not null,
  embedding       vector(1536),                 -- OpenAI text-embedding-3-small
  page_or_section text,
  created_at      timestamptz default now(),

  foreign key (network, file_id)
    references aptbox_files(network, file_id)
    on delete cascade
);

create index if not exists idx_chunks_file on aptbox_chunks (network, file_id);
-- IVFFlat index for cosine similarity search (rebuild after bulk loads)
create index if not exists idx_chunks_embedding
  on aptbox_chunks
  using ivfflat (embedding vector_cosine_ops)
  with (lists = 100);

-- ── Access log (Phase 1D — schema reserved now) ──────────────────────────────
create table if not exists aptbox_access_log (
  id          bigserial primary key,
  network     text     not null,
  file_id     bigint   not null,
  viewer      text,                              -- 0x... or null for anonymous
  action      text,                              -- 'preview' | 'download' | 'chat_query' | 'search_hit'
  occurred_at timestamptz default now(),
  ip_hash     text                               -- privacy: SHA-256(ip + secret), never raw
);

create index if not exists idx_access_file_time
  on aptbox_access_log (network, file_id, occurred_at desc);

-- ── Vector search RPC ────────────────────────────────────────────────────────
-- Used by the chat / search pipeline to find top-k chunks for a question.
create or replace function match_chunks(
  query_embedding vector(1536),
  filter_network  text,
  filter_file_id  bigint,
  match_count     int default 5
)
returns table (
  id              uuid,
  chunk_index     int,
  content         text,
  page_or_section text,
  similarity      float
)
language sql stable
as $$
  select
    c.id,
    c.chunk_index,
    c.content,
    c.page_or_section,
    1 - (c.embedding <=> query_embedding) as similarity
  from aptbox_chunks c
  where c.network = filter_network
    and c.file_id = filter_file_id
    and c.embedding is not null
  order by c.embedding <=> query_embedding
  limit match_count;
$$;

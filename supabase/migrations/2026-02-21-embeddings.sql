-- Table for storing embeddings per zone/source and chunk offsets
create table if not exists public.embeddings (
  id text primary key,
  zone_code text not null,
  source_url text not null,
  chunk text not null,
  embedding vector(1536) not null,
  start integer not null,
  "end" integer not null,
  created_at timestamptz default now()
);

-- Indexes for filtering and ANN search
create index if not exists embeddings_zone_code_idx on public.embeddings (zone_code);
-- If using pgvector with ivfflat (requires analyze and minimum rows), otherwise fallback to hnsw if available
create index if not exists embeddings_embedding_ivfflat_idx on public.embeddings using ivfflat (embedding vector_cosine_ops) with (lists = 100);
-- Optional HNSW index (requires pgvector>=0.5.0 and extension compiled with hnsw support)
-- create index if not exists embeddings_embedding_hnsw_idx on public.embeddings using hnsw (embedding vector_cosine_ops);

-- RPC function for similarity search filtered by zone_code
create or replace function public.match_embeddings(
  query_embedding vector(1536),
  match_count integer,
  zone_code_filter text
)
returns table (
  id text,
  zone_code text,
  source_url text,
  chunk text,
  embedding vector(1536),
  start integer,
  "end" integer,
  score double precision
)
language plpgsql
as $$
begin
  return query
  select e.id, e.zone_code, e.source_url, e.chunk, e.embedding, e.start, e."end",
         1 - (e.embedding <#> query_embedding) as score
  from public.embeddings e
  where e.zone_code = zone_code_filter
  order by e.embedding <#> query_embedding
  limit match_count;
end;
$$;

comment on table public.embeddings is 'Stores embedding vectors for urbanism PDFs, chunked with offsets and zone codes.';
comment on column public.embeddings.embedding is 'OpenAI text-embedding-3-small (1536 dims).';
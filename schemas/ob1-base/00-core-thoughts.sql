-- ob1-base/00-core-thoughts.sql
-- Minimal Open Brain core so a brain can be provisioned on a blank Supabase
-- project. Re-expressed from OB1's getting-started guide (Nate B. Jones,
-- FSL-1.1-MIT). The canonical, fuller setup lives in OB1 docs/01-getting-started.
-- Idempotent: safe to run multiple times.

BEGIN;

-- pgvector for embedding similarity search
CREATE EXTENSION IF NOT EXISTS vector;

-- The durable atom table. Every memory in the brain is a row here.
CREATE TABLE IF NOT EXISTS public.thoughts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  content TEXT NOT NULL,
  embedding vector(1536),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  content_fingerprint TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- status columns expected by enhanced-thoughts.sql's upsert_thought (OB1 carries
-- these on the base table; we add them here so the migration chain applies on a
-- blank project). Idempotent.
ALTER TABLE public.thoughts ADD COLUMN IF NOT EXISTS status TEXT;
ALTER TABLE public.thoughts ADD COLUMN IF NOT EXISTS status_updated_at TIMESTAMPTZ;

-- Dedup guard used by OB1's fingerprint-dedup recipe + upsert_thought.
CREATE UNIQUE INDEX IF NOT EXISTS idx_thoughts_content_fingerprint
  ON public.thoughts (content_fingerprint)
  WHERE content_fingerprint IS NOT NULL;

-- Vector similarity (HNSW, cosine)
CREATE INDEX IF NOT EXISTS idx_thoughts_embedding_hnsw
  ON public.thoughts USING hnsw (embedding vector_cosine_ops);

-- Metadata containment + recency
CREATE INDEX IF NOT EXISTS idx_thoughts_metadata_gin
  ON public.thoughts USING gin (metadata);
CREATE INDEX IF NOT EXISTS idx_thoughts_created_at_desc
  ON public.thoughts (created_at DESC);

-- updated_at maintenance
CREATE OR REPLACE FUNCTION public.thoughts_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_thoughts_updated_at ON public.thoughts;
CREATE TRIGGER trg_thoughts_updated_at
  BEFORE UPDATE ON public.thoughts
  FOR EACH ROW EXECUTE FUNCTION public.thoughts_set_updated_at();

-- Vector search RPC (cosine similarity, optional metadata filter)
CREATE OR REPLACE FUNCTION public.match_thoughts(
  query_embedding vector(1536),
  match_threshold FLOAT DEFAULT 0.5,
  match_count INT DEFAULT 10,
  filter JSONB DEFAULT '{}'::jsonb
)
RETURNS TABLE (
  id UUID,
  content TEXT,
  metadata JSONB,
  similarity FLOAT
)
LANGUAGE plpgsql
STABLE
AS $$
BEGIN
  RETURN QUERY
  SELECT
    t.id,
    t.content,
    t.metadata,
    1 - (t.embedding <=> query_embedding) AS similarity
  FROM public.thoughts t
  WHERE t.metadata @> COALESCE(filter, '{}'::jsonb)
    AND t.embedding IS NOT NULL
    AND 1 - (t.embedding <=> query_embedding) >= match_threshold
  ORDER BY t.embedding <=> query_embedding
  LIMIT GREATEST(1, LEAST(COALESCE(match_count, 10), 100));
END;
$$;

-- Least privilege: the internal MCP container reaches PostgREST as service_role.
ALTER TABLE public.thoughts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS thoughts_service_role_all ON public.thoughts;
CREATE POLICY thoughts_service_role_all ON public.thoughts
  FOR ALL TO service_role USING (true) WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.thoughts TO service_role;
GRANT EXECUTE ON FUNCTION public.match_thoughts(vector, FLOAT, INT, JSONB) TO service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;

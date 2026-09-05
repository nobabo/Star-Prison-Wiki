CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS wiki_pages_search_title_idx
ON wiki_pages USING gin (lower(normalize(title, NFKC)) gin_trgm_ops)
WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS wiki_snapshots_search_markdown_idx
ON wiki_markdown_snapshots USING gin (lower(normalize(markdown, NFKC)) gin_trgm_ops);

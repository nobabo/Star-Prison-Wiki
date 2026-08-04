CREATE INDEX IF NOT EXISTS wiki_pages_active_title_idx
ON wiki_pages (title)
WHERE deleted_at IS NULL;

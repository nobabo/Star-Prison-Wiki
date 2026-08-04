-- The original table-level UNIQUE declaration creates wiki_pages_slug_key,
-- which prevents a soft-deleted page slug from being reused. The partial
-- index is the canonical active-page uniqueness rule.
ALTER TABLE IF EXISTS wiki_pages
DROP CONSTRAINT IF EXISTS wiki_pages_slug_key;

DROP INDEX IF EXISTS wiki_pages_slug_idx_unique;

CREATE UNIQUE INDEX IF NOT EXISTS wiki_pages_slug_active_idx
ON wiki_pages (slug)
WHERE deleted_at IS NULL;

-- The primary key already provides an index for this lookup.
DROP INDEX IF EXISTS wiki_admin_accounts_email_idx;

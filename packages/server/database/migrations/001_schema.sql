CREATE TABLE IF NOT EXISTS wiki_pages (
    id TEXT PRIMARY KEY,
    slug TEXT NOT NULL UNIQUE,
    title TEXT NOT NULL,
    icon TEXT,
    visibility TEXT NOT NULL DEFAULT 'public' CHECK (visibility IN ('public', 'private')),
    created_by TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ,
    deleted_by TEXT
);

ALTER TABLE wiki_pages
ADD COLUMN IF NOT EXISTS icon TEXT;

ALTER TABLE wiki_pages
ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

ALTER TABLE wiki_pages
ADD COLUMN IF NOT EXISTS deleted_by TEXT;

-- 휴지통(소프트 삭제) 페이지는 slug UNIQUE 제약에서 제외해야 복원 전 새 문서가 같은 slug를 쓸 수 있다.
-- 기존 UNIQUE 제약을 삭제하고 partial unique index로 대체한다.
ALTER TABLE wiki_pages
DROP CONSTRAINT IF EXISTS wiki_pages_slug_key;

DROP INDEX IF EXISTS wiki_pages_slug_idx_unique;
DROP INDEX IF EXISTS wiki_pages_slug_idx;

CREATE UNIQUE INDEX IF NOT EXISTS wiki_pages_slug_active_idx
ON wiki_pages (slug)
WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS wiki_pages_slug_idx
ON wiki_pages (slug);

CREATE TABLE IF NOT EXISTS wiki_doc_states (
    document_name TEXT PRIMARY KEY,
    page_id TEXT NOT NULL REFERENCES wiki_pages(id) ON DELETE CASCADE,
    y_state BYTEA NOT NULL,
    stored_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS wiki_markdown_snapshots (
    page_id TEXT PRIMARY KEY REFERENCES wiki_pages(id) ON DELETE CASCADE,
    markdown TEXT NOT NULL,
    rendered_html TEXT NOT NULL,
    updated_by TEXT NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS wiki_revisions (
    id BIGSERIAL PRIMARY KEY,
    page_id TEXT NOT NULL REFERENCES wiki_pages(id) ON DELETE CASCADE,
    markdown TEXT NOT NULL,
    rendered_html TEXT NOT NULL,
    actor_id TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS wiki_permissions (
    page_id TEXT NOT NULL REFERENCES wiki_pages(id) ON DELETE CASCADE,
    subject_type TEXT NOT NULL CHECK (subject_type IN ('user', 'role')),
    subject_id TEXT NOT NULL,
    access TEXT NOT NULL CHECK (access IN ('read', 'write', 'admin')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (page_id, subject_type, subject_id)
);

-- 사이드바 배치와 화면 설정은 사용자마다 다르므로 페이지 데이터와 분리해 저장한다.
CREATE TABLE IF NOT EXISTS wiki_navigation_preferences (
    user_id TEXT PRIMARY KEY,
    categories JSONB NOT NULL DEFAULT '[]'::jsonb,
    root_page_slugs JSONB NOT NULL DEFAULT '[]'::jsonb,
    favorite_slugs JSONB NOT NULL DEFAULT '[]'::jsonb,
    theme TEXT NOT NULL DEFAULT 'dark' CHECK (theme IN ('dark', 'light')),
    revision BIGINT NOT NULL DEFAULT 1,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS wiki_pages_slug_idx ON wiki_pages(slug);
CREATE INDEX IF NOT EXISTS wiki_pages_active_title_idx
ON wiki_pages (title)
WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS wiki_permissions_subject_idx ON wiki_permissions(subject_type, subject_id);
CREATE INDEX IF NOT EXISTS wiki_revisions_page_created_idx ON wiki_revisions(page_id, created_at DESC);

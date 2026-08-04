CREATE TABLE IF NOT EXISTS wiki_admin_accounts (
    email TEXT PRIMARY KEY CHECK (email = LOWER(email)),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS wiki_admin_accounts_email_idx
ON wiki_admin_accounts (email);

-- 운영 관리자 이메일은 공개 저장소에 기록하지 않는다.
-- 배포 후 비공개 운영 절차에서 다음 형태로 등록한다.
-- INSERT INTO wiki_admin_accounts (email) VALUES ('operator@example.com') ON CONFLICT (email) DO NOTHING;

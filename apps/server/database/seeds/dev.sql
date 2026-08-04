INSERT INTO wiki_pages (id, slug, title, icon, visibility, created_by)
VALUES ('welcome', 'welcome', '별도소 위키 대문', '🔒', 'public', 'dev-admin')
ON CONFLICT (id) DO NOTHING;

INSERT INTO wiki_markdown_snapshots (page_id, markdown, rendered_html, updated_by)
VALUES (
    'welcome',
    E'# 별도소 공식 위키\n\n별도소 서버 전용 기록과 운영 문서를 정리합니다.\n',
    '<h1>별도소 공식 위키</h1><p>별도소 서버 전용 기록과 운영 문서를 정리합니다.</p>',
    'dev-admin'
)
ON CONFLICT (page_id) DO NOTHING;

-- Dev auth uses local tokens; real administrator emails are configured privately.

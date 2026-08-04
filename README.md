# StarPrisonWiki

코코넛스튜디오 Wiki 엔진을 사용하는 별도소 전용 독립 포크입니다. 공용 기능은 `@coconut-studio/wiki-*`, 별도소 조합 앱은 `@star-prison/wiki-*` workspace 패키지로 분리되어 있습니다.

## 개발

```bash
corepack enable
pnpm install --frozen-lockfile
pnpm dev
```

- Web: `http://127.0.0.1:5173/wiki/welcome`
- API: `http://127.0.0.1:5174`
- Collaboration: `ws://127.0.0.1:2234/collab/wiki/:pageId`

`DATABASE_URL`이 없으면 `apps/server/.local/wiki-store.json`을 사용합니다. 이 파일은 첫 실행 시 새 별도소 seed로 생성되며 Git에 포함되지 않습니다.

## 검증

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

구조와 포크 경계는 `docs/architecture.md`, `docs/fork-boundary.md`를 참고합니다.

## Google OAuth와 관리자 권한

Google Cloud Console에서 OAuth 2.0 웹 애플리케이션 클라이언트를 만든 뒤 승인된 리디렉션 URI에 공개 웹 주소의 API 콜백 경로를 등록합니다. 로컬 개발에서는 Vite의 API 프록시를 사용하는 `http://127.0.0.1:5173/api/wiki/auth/google/callback`으로 `GOOGLE_OAUTH_REDIRECT_URI`를 설정합니다.

```dotenv
WIKI_AUTH_MODE=google
WIKI_JWT_SECRET=충분히-길고-무작위인-서명-키
GOOGLE_OAUTH_CLIENT_ID=...
GOOGLE_OAUTH_CLIENT_SECRET=...
GOOGLE_OAUTH_REDIRECT_URI=https://wiki.example.com/api/wiki/auth/google/callback
WIKI_COOKIE_SECURE=1
```

- 이메일이 검증된 Google 계정은 모두 로그인할 수 있습니다.
- `wiki_admin_accounts.email`에 등록된 계정만 관리자 역할과 `수정` 탭을 받습니다. 이메일은 소문자로 저장하며 비교 시 대소문자를 구분하지 않습니다.
- 그 밖의 로그인 계정과 비로그인 사용자는 `일반 위키` 탭에서 공개 문서의 렌더링된 최종 화면만 볼 수 있습니다.
- 특정 Google Workspace 도메인만 로그인시키려면 `WIKI_GOOGLE_HOSTED_DOMAIN`을 함께 설정합니다.
- 운영 환경에서는 HTTPS를 사용하고 `WIKI_COOKIE_SECURE=1`을 설정해야 합니다.

관리자 이메일은 공개 저장소에 포함하지 않습니다. 운영 DB 마이그레이션을 적용한 뒤, 비공개 운영 절차에서 `wiki_admin_accounts`에 실제 관리자 이메일을 등록해야 합니다. 개발 환경에서는 `WIKI_DEV_ADMIN_EMAILS`를 로컬 `.env`에만 설정할 수 있습니다.

관리자 이메일 목록을 바꾸면 기존 세션도 다음 요청부터 새 목록을 기준으로 역할이 다시 계산됩니다. 브라우저의 로그아웃은 로컬 세션 토큰을 제거합니다.

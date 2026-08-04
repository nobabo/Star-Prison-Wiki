# StarPrisonWiki

별도소 전용 위키입니다.

## 개발

```bash
corepack enable
pnpm install --frozen-lockfile
pnpm dev
```

## 검증

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

- `docs/architecture.md`: 시스템 구조와 모듈 책임을 설명합니다.
- `docs/fork-boundary.md`: 원본 엔진과 별도소 조합의 경계를 설명합니다.
- `docs/brand/star-prison.md`: 별도소 브랜드 및 환경 설정을 설명합니다.

## oAuth

```dotenv
WIKI_AUTH_MODE=google
WIKI_JWT_SECRET=충분히-길고-무작위인-서명-키
```

- `WIKI_AUTH_MODE`: 인증 모드를 설정합니다. JWT, google이 있으며 google oAuth를 사용합니다.
- `WIKI_JWT_SECRET`: `openssl rand -hex 32`로 난수 생성 후 사용합니다.

어드민 계정은 구글 oAuth로 로그인된 이메일을 등록합니다.

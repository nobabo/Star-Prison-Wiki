# 저장소와 운영 보안

## GitHub 관리 권한

- 저장소 소유자 `nobabo`만 관리한다. 팀 기여는 fork와 PR로 받으며 collaborator 초대는 기본 운영 절차에 포함하지 않는다.
- `main` 갱신은 소유자의 PR 병합으로 제한한다. CODEOWNERS는 전체 파일에 `@nobabo`를 지정한다.
- 다른 기여자의 셀프 승인·병합은 허용하지 않는다. 소유자 자신의 PR은 단독 관리가 가능하도록 리뷰 규칙만 PR 경로에서 우회할 수 있다.
- CI `quality`는 별도 ruleset으로 강제하며 소유자를 포함해 우회 대상이 없다. 최신 main 기준 검사, 강제 푸시 금지, 브랜치 삭제 금지를 유지한다.
- Actions 토큰은 읽기 전용이며 PR을 승인하지 못한다. 외부 기여자의 workflow 실행은 매번 유지관리자 승인이 필요하다. fork PR에는 비밀값이나 쓰기 토큰을 전달하지 않는다.
- Actions는 전체 commit SHA로 고정한다. GitHub 소유 Actions와 `pnpm/action-setup`만 허용한다. 자동 병합은 사용하지 않는다.
- 개인 저장소 소유자는 GitHub 설정 자체를 변경할 수 있다. 이 권한까지 제한하려면 별도의 조직·관리자 구성이 필요하다.

현재 보호 규칙: [소유자 PR 관리](https://github.com/nobabo/Star-Prison-Wiki/rules/22325392), [필수 CI와 main 이력 보호](https://github.com/nobabo/Star-Prison-Wiki/rules/22325393).

## 이미지 권한과 기존 파일 이전

신규 이미지는 업로드 시 `pageId`를 지정한다. 해당 문서를 현재 읽을 수 있는 사용자만 이미지를 읽을 수 있다. 문서 비공개 전환·삭제 후에도 같은 검사를 적용하며, 브라우저·프록시 캐시에는 저장하지 않는다. 이미지 요청용 HttpOnly 쿠키는 `/auth/me`에서 발급·삭제되고 이미지 GET에만 사용한다.

기존 이미지에는 문서 소유권 정보가 없으므로 관리자만 접근할 수 있다. 관리자가 각 파일의 실제 소유 문서를 확인한 뒤 `POST /api/wiki/media/{fileName}/ownership`에 Bearer 인증과 JSON `{ "pageId": "실제 문서 ID" }`를 보내 연결한다. 다른 문서에서 같은 이미지를 재사용해도 원래 소유 문서 권한을 따른다.

기존 버전에서 공개 캐시된 이미지는 새 코드가 이미 내려받은 복사본을 회수할 수 없다. 배포 시 사용하는 CDN에 기존 `/api/wiki/media/*` 캐시가 있으면 삭제한다. 이 저장소 변경만으로 운영 CDN이나 운영 미디어 파일을 변경하지 않는다.

업로드는 512 KiB 청크, 파일당 100 MiB, 전체 예약·저장 용량 2 GiB로 제한한다. 미완료 업로드는 다음 업로드 시작 시 24시간 기준으로 정리한다. 청크와 완료 요청은 재시도할 수 있다. 저장 용량 제한과 요청 제한은 단일 API 프로세스 기준이다.

## 배포와 검증

PostgreSQL 사용 시 `007_search_indexes.sql`을 포함한 마이그레이션을 적용한다. `pg_trgm` 확장 설치 권한이 필요하다. 검색은 권한 필터와 최대 50개 결과 제한을 DB에서 적용한다. 한두 글자 검색은 trigram 인덱스 효과가 제한적이다.

`pnpm lint`, `pnpm format:check`, `pnpm test`, `pnpm build`, `pnpm audit`를 실행한다. `WIKI_TEST_DATABASE_URL`이 있으면 PostgreSQL 검색·저장점 복원 통합 테스트도 실행된다. 이 URL은 테스트 전용 DB를 가리켜야 한다. GitHub CI는 임시 PostgreSQL 서비스로 이를 검증한다.

저장점 복원은 서버에서 Markdown snapshot과 Yjs 원본을 함께 갱신한다. 연결 중인 편집자는 다시 연결한다. 브라우저 편집은 협업 연결이 끊기면 잠기고, 아직 저장되지 않은 본문은 계정·문서별 sessionStorage 초안으로 복구할 수 있다. 로그아웃 시 초안을 삭제하며, 탭 종료 이후의 영구 보관은 보장하지 않는다.

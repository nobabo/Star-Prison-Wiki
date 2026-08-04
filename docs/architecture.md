# Architecture

이 저장소는 배포 가능한 별도소 앱과 재사용 가능한 코코넛스튜디오 Wiki 베이스를 한 pnpm workspace에서 관리합니다.

- `apps/web`, `apps/server`: 브랜드 설정과 실행 진입점만 소유합니다.
- `packages/web`, `packages/server`: UI와 서버 기능의 공용 구현입니다.
- `packages/contracts`: HTTP 경계에서 공유하는 DTO와 오류 형식입니다.
- `packages/markdown`: Markdown 확장과 안전한 HTML 렌더링입니다.

의존성은 `apps -> packages`, `web/server -> contracts/markdown` 방향으로만 흐릅니다. 웹 코드는 서버 구현을 import하지 않고, 공용 패키지는 별도소 앱을 import하지 않습니다.

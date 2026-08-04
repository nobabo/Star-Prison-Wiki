# 코코넛스튜디오 Wiki Design Tokens

## Atmosphere / Signature

Black Pink Dossier는 코코넛스튜디오 운영진이 반복해서 열어 보는 어두운 기록물형 위키다. 기존 별도소 로고의 검정·핫핑크·수갑 모티프를 시각 서명으로 삼고, 강한 외곽선과 각진 하드 섀도로 ‘공식 보관 문서’의 인상을 만든다. 현재 위치와 강조 표시는 `#ff4fb4`를 반복해서 사용하며, 문서 제목·본문 heading·강조 div·포커스 링·선택 상태가 한 브랜드 계열로 읽혀야 한다.

## Color

| Role                       | Variable                         | Hex       | Notes                                             |
| -------------------------- | -------------------------------- | --------- | ------------------------------------------------- |
| App background             | `--wiki-bg`                      | `#09080a` | 격자 없이 은은한 핑크 광원만 남긴 near-black 배경 |
| App background wash        | `--wiki-bg-2`                    | `#030304` | 하단/깊이 보조 배경                               |
| Surface                    | `--wiki-surface`                 | `#121014` | 문서와 컨트롤 기본 표면                           |
| Surface muted              | `--wiki-surface-muted`           | `#1b171d` | 툴바, 코드, 표 헤더                               |
| Surface strong             | `--wiki-surface-strong`          | `#251d26` | 입력, 버튼 hover 면                               |
| Ink                        | `--wiki-ink`                     | `#fff6fb` | 본문 텍스트, 대비 4.5:1 이상                      |
| Ink soft                   | `--wiki-ink-soft`                | `#e7dce3` | 보조 제목                                         |
| Ink muted                  | `--wiki-ink-muted`               | `#887985` | 메타와 상태 텍스트                                |
| Border                     | `--wiki-border`                  | `#342a32` | 표면 경계                                         |
| Border strong              | `--wiki-border-strong`           | `#68445d` | active, focus 보조선                              |
| Sidebar background         | `--wiki-sidebar-bg`              | `#0b090b` | 앱 배경과 이어지는 검정 레일                      |
| Sidebar surface            | `--wiki-sidebar-surface`         | `#191219` | 검색, hover row                                   |
| Sidebar ink                | `--wiki-sidebar-ink`             | `#f4e9f0` | 사이드바 주요 텍스트                              |
| Sidebar muted              | `--wiki-sidebar-muted`           | `#958590` | 보조 텍스트                                       |
| Rail                       | `--wiki-rail`                    | `#43273a` | 구분선과 스크롤바                                 |
| Accent                     | `--wiki-accent`                  | `#ff4fb4` | 현재 위치, heading, 인장 외곽선                   |
| Accent strong              | `--wiki-accent-strong`           | `#ff9bd9` | hover, icon emphasis                              |
| Accent soft                | `--wiki-accent-soft`             | `#ffc7e6` | 큰 제목과 밝은 브랜드 텍스트                      |
| Accent ink                 | `--wiki-accent-ink`              | `#160810` | 핫핑크 active 면 위의 텍스트                      |
| Accent wash                | `--wiki-accent-wash`             | `#381225` | 칩, selection, pink wash                          |
| Link                       | `--wiki-link`                    | `#ff86c9` | 본문 링크                                         |
| Link hover                 | `--wiki-link-hover`              | `#ffc0e2` | 본문 링크 hover                                   |
| Success                    | `--wiki-success`                 | `#4caf50` | 저장됨, 공개                                      |
| Warning                    | `--wiki-warning`                 | `#cc8800` | 저장 중                                           |
| Danger                     | `--wiki-danger`                  | `#e05555` | 실패, 비공개                                      |
| Danger wash source         | `--wiki-danger-wash-source`      | `#b7352f` | 휴지통 배경 mix                                   |
| Ink dim                    | `--wiki-ink-dim`                 | `#9a9a9a` | 낮은 대비 아이콘                                  |
| Ink subtle                 | `--wiki-ink-subtle`              | `#a8a8a8` | 보조 컨트롤 텍스트                                |
| Ink control                | `--wiki-ink-control`             | `#b0b0b0` | 버튼 기본 텍스트                                  |
| Ink bright muted           | `--wiki-ink-bright-muted`        | `#d0d0d0` | 휴지통 제목/카운트 텍스트                         |
| Border hover ring          | `--wiki-border-hover-ring`       | `#252525` | 스와치 hover ring                                 |
| Restore border             | `--wiki-restore-border`          | `#3a6a4a` | 복원 hover border                                 |
| Restore ink                | `--wiki-restore-ink`             | `#8ed9a8` | 복원 hover text                                   |
| Purge border               | `--wiki-purge-border`            | `#6a2a2a` | 완전 삭제 hover border                            |
| Purge ink                  | `--wiki-purge-ink`               | `#d98e8e` | 완전 삭제 hover text                              |
| Trash ink                  | `--wiki-trash-ink`               | `#b76e6e` | 휴지통 hover text                                 |
| Highlight background       | `--wiki-highlight-bg`            | `#21101b` | 강조 div 기본 배경                                |
| Highlight background muted | `--wiki-highlight-bg-muted`      | `#2d1424` | 문장 강조형 배경                                  |
| Highlight border           | `--wiki-highlight-border`        | `#ff4fb4` | 강조 div 외곽선                                   |
| Highlight border strong    | `--wiki-highlight-border-strong` | `#ff9bd9` | 선택, 리사이즈, 제목 그림자                       |
| Highlight ink              | `--wiki-highlight-ink`           | `#fff3fa` | 강조 div 본문 텍스트                              |
| Highlight muted            | `--wiki-highlight-muted`         | `#ff9bd9` | 강조 div 보조 문구                                |
| Highlight accent           | `--wiki-highlight-accent`        | `#ffc7e6` | 강조 div 제목과 포인트                            |
| Highlight danger           | `--wiki-highlight-danger`        | `#ff4fb4` | 문장 강조형 좌측 강조선                           |
| Highlight control          | `--wiki-highlight-control`       | `#09080a` | 리사이즈 핸들 표면                                |
| Highlight control soft     | `--wiki-highlight-control-soft`  | `#171018` | 강조 메뉴 보조 표면                               |
| Tool fg orange             | `--tool-fg-orange`               | `#c65a1e` | 에디터 글자색                                     |
| Tool fg green              | `--tool-fg-green`                | `#19703b` | 에디터 글자색                                     |
| Tool fg blue               | `--tool-fg-blue`                 | `#2559b7` | 에디터 글자색                                     |
| Tool fg rose               | `--tool-fg-rose`                 | `#ff4fb4` | 에디터 글자색                                     |
| Tool fg orange visual      | `--tool-fg-orange-visual`        | `#d4743c` | 어두운 메뉴용 스와치 표면                         |
| Tool fg green visual       | `--tool-fg-green-visual`         | `#3a8a5c` | 어두운 메뉴용 스와치 표면                         |
| Tool fg blue visual        | `--tool-fg-blue-visual`          | `#4a7fc4` | 어두운 메뉴용 스와치 표면                         |
| Tool bg yellow             | `--tool-bg-yellow`               | `#fff3bd` | 에디터 배경색                                     |
| Tool bg green              | `--tool-bg-green`                | `#d9f1df` | 에디터 배경색                                     |
| Tool bg blue               | `--tool-bg-blue`                 | `#dae6fb` | 에디터 배경색                                     |
| Tool bg rose               | `--tool-bg-rose`                 | `#f9d9e1` | 에디터 배경색                                     |
| Tool bg yellow visual      | `--tool-bg-yellow-visual`        | `#4a4020` | 어두운 메뉴용 배경 스와치 표면                    |
| Tool bg green visual       | `--tool-bg-green-visual`         | `#2a4030` | 어두운 메뉴용 배경 스와치 표면                    |
| Tool bg blue visual        | `--tool-bg-blue-visual`          | `#253048` | 어두운 메뉴용 배경 스와치 표면                    |
| Tool bg rose visual        | `--tool-bg-rose-visual`          | `#402830` | 어두운 메뉴용 배경 스와치 표면                    |

## Typography

| Role                 | Variable                      | Value                                                                           |
| -------------------- | ----------------------------- | ------------------------------------------------------------------------------- |
| UI stack             | `--wiki-font-sans`            | `"Noto Sans KR", "Apple SD Gothic Neo", "Malgun Gothic", system-ui, sans-serif` |
| Display stack        | `--wiki-font-display`         | `"Black Han Sans", "Noto Sans KR", sans-serif`                                  |
| Title stack          | `--wiki-font-serif`           | `"Noto Serif KR", "Apple SD Gothic Neo", serif`                                 |
| Code stack           | `--wiki-font-mono`            | `"SFMono-Regular", Consolas, "Liberation Mono", monospace`                      |
| App title            | `--type-title`                | `30px / 1.18 / 700 / 0`                                                         |
| Document h1          | `--type-doc-h1`               | `30px / 1.24 / 700 / 0`                                                         |
| Document h2          | `--type-doc-h2`               | `22px / 1.32 / 700 / 0`                                                         |
| Body                 | `--type-body`                 | `15.5px / 1.75 / 400 / 0`                                                       |
| UI                   | `--type-ui`                   | `13px / 1.45 / 600 / 0`                                                         |
| Label                | `--type-label`                | `11px / 1.2 / 700 / 0.08em`                                                     |
| Sidebar category     | `--type-sidebar-category`     | `22px / 1.3 / 600 / 0`                                                          |
| Sidebar page         | `--type-sidebar-page`         | `20px / 1.35 / 600 / 0`                                                         |
| Sidebar page compact | `--type-sidebar-page-compact` | `17px / 1.35 / 600 / 0`                                                         |
| Sidebar page mobile  | `--type-sidebar-page-mobile`  | `15px / 1.35 / 600 / 0`                                                         |

## Spacing

Base unit is 2px. Primary layout rhythm prefers 4px multiples, while compact editor controls can use 2px increments.

| Variable                      | Value   |
| ----------------------------- | ------- |
| `--space-1`                   | `4px`   |
| `--space-2`                   | `8px`   |
| `--space-3`                   | `12px`  |
| `--space-4`                   | `16px`  |
| `--space-5`                   | `20px`  |
| `--space-6`                   | `24px`  |
| `--space-7`                   | `28px`  |
| `--space-8`                   | `32px`  |
| `--space-9`                   | `36px`  |
| `--space-10`                  | `40px`  |
| `--space-12`                  | `48px`  |
| `--space-16`                  | `64px`  |
| `--space-20`                  | `80px`  |
| `--wiki-sidebar-w`            | `320px` |
| `--wiki-content-max`          | `980px` |
| `--wiki-sidebar-category-gap` | `16px`  |
| `--wiki-sidebar-child-indent` | `18px`  |

## Components

- Sidebar: 투명 배경의 원형 로고 인장, 아카이브 인덱스, 핫핑크 면으로 뒤집히는 active page row.
- Search: low contrast dark input, border change on focus, icon-only decoration.
- Page list: 40px stable row height, private lock icon at row end, ellipsis for long Korean titles.
- Topbar: unframed header with title, metadata chips, and icon actions. Metadata separators are CSS generated.
- Icon button: 36px square, 8px radius, token border, accent hover, visible focus ring.
- Editor toolbar: dense wrapped toolbar with segmented icon controls, tokenized swatches, status text, and stable hit targets.
- Editor context menu: 316px maximum width, 8px viewport gutter, and a stable seven-column icon row. Emoji and additional-action panels open as independent fixed popovers so the parent toolbar never reflows.
- Document surface: 빈틈없는 단색 핑크 상단 스트립, 각진 외곽선, 핑크 하드 섀도를 가진 공식 기록물 패널.
- Highlight div: width-based block with 8px radius, black-pink surface, pink title, pink strip variant, hidden resize track, and menu-driven 25%, 33.3333%, 50%, 66.6667%, 75%, 100% snap points.
- State panels: dashed ledger panel with concise Korean status text and no marketing copy.

## Motion

Motion is 120ms to 180ms using color, border-color, background-color, opacity, and transform only. Hover lift is limited to 1px. Reduced motion disables transform and transition duration.

## Depth

Depth is border-first. 브랜드 표면에는 4px~10px의 각진 핑크 하드 섀도를 쓰고, 일반 컨트롤에는 낮고 차가운 그림자를 유지한다:

- `--shadow-1`: small control shadow.
- `--shadow-2`: document/editor surface shadow.
- `--shadow-sidebar`: dark sidebar inset depth.
- `--wiki-highlight-radius`: 8px highlight div corner radius.
- `--wiki-highlight-shadow`: low cool highlight div control shadow.

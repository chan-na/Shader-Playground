# Design Changelog — ShaderPlayground

디자인 변경 이력. Git diff가 "무엇이" 바뀌었는지 보여준다면, 이 파일은 **"왜"**를 남긴다.
값 자체는 `theme.ts`가 출처 — 여기엔 의도·결정·영향 범위를 사람이 읽게 적는다.

## 규칙
- 최신이 위로. 날짜 `YYYY-MM-DD`.
- 시각/토큰 변경은 가능하면 `theme.ts` 커밋 + 이 항목 + (영향 화면) 스크린샷 갱신을 **같은 PR**에서.
- 큰 개편은 버전 범프(`v1` → `v2`)하고 README 상단 버전도 함께 수정.
- 태그 예: `[token]` `[component]` `[screen]` `[motion]` `[brand]` `[breaking]`.

---

## [Unreleased]

---

## v1.1 — 2026-07-14
> v1 재구현(M0~M8) 중 드러난 미시연 화면·구현/시안 불일치·미토큰화 값(`design-need-to-update.md` D1~D21)에 대한 디자이너 결정 반영. 마이너 범프(신규 시안 여럿 + 토큰 추가, breaking 없음).

### Added
- `[screen]` **Side Panel — Diagnostics 탭(4번째)** 신규(D1): 런타임 진단(GPU/Frame/Draw calls/Programs 메트릭 + INFO/WARN/ERROR/DEBUG 레벨 로그). 이유: 리스킨 안 된 `DiagnosticsPanel.tsx`의 raw hex 10건 → 토큰 매핑 근거 확보. 레벨=semantic+text.muted, 카드=surface.card, 배경=surface.panel.
- `[screen]` **Node Editor — Webcam / Video 노드 카드** 신규(D8): 16:9 프리뷰 + 레터박스(`surface.letterbox`). 이유: 시안에 카드가 없어 레터박스 배경이 raw `#000`으로 남아 있었음.
- `[screen]` **Node Editor — 포트 라벨 rail**(D2 ★): 라벨을 카드 좌/우 rail(폭 ~46px)에 두고 썸네일을 안쪽으로 inset. 이유: 구현이 추가한 포트 라벨이 96px 썸네일과 겹침. 라벨 색=포트 타입 패밀리.
- `[screen]` **Node Editor — 노드 rename 인라인 편집** + **Side Panel — Inspector `Name` 필드**(D15): 이유: 노드 name 필드 부재로 viewport pane 라벨/​export 파일명이 내부 id 노출. rename 소스 확정.
- `[screen]` **System States — App crashed 폴백(8번째 상태)**(D6): ErrorBoundary 전체-앱 오버레이. 의도적으로 토큰/웹폰트 비의존(system-ui + 중립 그레이). 이유: 크래시 상태 시안 부재.
- `[screen]` **Viewport — 컴팩트 트랜스포트 변형(≤700px)**(D3) + **⏮ reset-time 버튼**(D14): 이유: 좁은 도킹 폭에서 캡션 겹침 / 구현이 추가한 ⏮ 시안 부재.

### Changed
- `[token]` `surface.letterbox`(=appDarker) 신설(D8) · `overlay.gridDot`·`overlay.scrim` 명명 토큰 신설(D9) · `gradient.emptyState` 신설(D10) · `shadow.warnRing` 명시(0.7 알파, errorRing과 패밀리 일관, D12). 이유: raw 리터럴/코드 파생 값에 이름 부여.
- `[screen]` **Viewport 빈 상태 배경** 평면색 → `gradient.emptyState`(D10). 이유: 종점 hex(`#0f1218`/`#0a0b0e`)가 토큰에 없어 평면 대체됐던 것 복원.
- `[screen]` **System States 스켈레톤 인디케이터** 좌하단 → **캔버스 중앙**(D4). 이유: 좌하단 줌 컨트롤 상주 위치와 충돌.
- `[screen]` **System States 권한 차단 링** solid `#f5b13d` → `rgba(245,177,61,0.7)`(D12). 이유: errorRing과 0.7 알파 패밀리 일관.
- `[component]` **Code Editor 근사 토큰 3건 dc→토큰값 정정**(D11): 브레드크럼 아이콘 radius 4→5(`iconBox`), 다중선택 칩 radius 8→7(`button`), 브레드크럼 노드명 색 `#c4dcff`→`text.primary`. 이유: 신규 토큰 없이 정합.
- `[screen]` **Export & Share 파일명 규칙** `{projectTitle}-{timestamp}`로 통일(D16), 완료 카드/토스트 표시명 = 실제 저장명. 이유: 표시(`shader-playground.html`)≠실제(`{title}-{Date.now()}.html`) 불일치 해소.

### Docs (규칙 확정 — 그림 불필요)
- `[screen]` D5: standalone HTML 산출물 = 앱 토큰 이식(`surface.app`/`text.primary`). README §H.
- `[component]` D13: 도킹 헤더 메타 배지 우측 정렬(`metaAlign="end"`). README 도메인 규칙.
- `[component]` D18: Inspector `Output type` 배지 색 = `portTypeToFamily`. README 도메인 규칙.
- `[component]` D19: CompileErrorOverlay = 단일(첫 실패) 노드 기준 + `(+N more)` 병기. README 도메인 규칙.
- D20: README §Files의 `theme.ts` 항목을 "이 번들의 출처 / 런타임은 저장소 `src/theme.ts`"로 명확화.

---

## v1 — 2026-07-13
### Added
- 초기 하이파이 디자인 시스템 + 전 화면 시안 확정.
- 확정 방향: 도킹형 패널 · 절제된 프로툴 무드(Linear/VSCode, 네온 최소) · 다크 기본 · 액센트 `#3d9bff`.
- 포트 이중 인코딩 규칙 확정: 형태=방향(input hollow ring / output solid disc), 색=타입 패밀리(Resource/Scalar/Vector/Matrix).
- 화면: App Shell · Node Editor · Viewport · Code Editor · Side Panel · Command Palette · Welcome · Export & Share · System States · Foundations · Brand · Icon & Social.
- 모션 프로토타입: 포트 연결 → 팬아웃 하이라이트 → 스냅 → 뷰포트 라이브 렌더.
- 브랜드 실파일 세트(파비콘·앱 아이콘·OG·manifest).
- 토큰 단일 출처 `theme.ts` 확립.

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

## v1.2 — 2026-07-16
> v1.1 구현 중 나온 "시안/README/토큰만으로 결정 못 하는 지점" 27건(design-request.md A/B/C)에 대한 디자이너 정본 확정. 마이너 범프(신규 토큰 6종 + 시안 보완, breaking 없음). 값 정본은 여전히 `theme.ts`.

### Added
- `[token]` **신규 토큰 6종** (신규 토큰 기본 금지 원칙의 승인 예외):
  - `text.emphasis`(#fff) [B-2] — 인라인 rename 편집 중 상태를 순백으로 구분. 이유: 편집 텍스트가 `text.primary` 근사로 헤더 타이틀과 구분 안 됨.
  - `nodeCategory.sourceBright`(#6fd6a3) [B-3] — Webcam 렌즈 링 등 source의 밝은 변형. 이유: source 알파 파생으로 근사하던 값에 이름 부여.
  - `overlay.track`(white 0.18) [B-4] — Video 스크럽 등 중립 트랙/필 표면. 이유: 순백 채널 직접 파생을 명명 토큰으로.
  - `radius.transportBarCompact`(11)/`overlayCompact`(8) [B-5] — 컴팩트 트랜스포트 티어 전용. 이유: 풀 바(12/9) 상속 근사 대신 정본화.
  - `radius.skeletonStatus`(10) + `shadow.skeletonStatus`(blur 24) [B-6] — 스켈레톤 상태 필. 이유: 근사(9/20) 대신 dc 실측 정본화.
- `[component]` **Node Editor — 다포트 'Noise' 데모 노드**(우상단) [C-3]: stride 30 고정 + 카드 본체 동적 확장(`previewH = max(96,(n−1)·30+56)`, ~10 포트 상한). 이유: 구 시안의 3-포트 stride 30 가정이 uniform 많은 셰이더에서 카드(144px)를 넘김 — 실물 데이터 범위를 담는 규칙 시안 신설.
- `[screen]` **Side Panel — Diagnostics 크롬** [C-9]: 로그 행 카테고리 접두(gl/shader/mem, text.muted) + 상단 툴바(Copy/Clear/Close) + 레벨 필터(All/Info/Warn/Error/Debug). 이유: 구현엔 있으나 시안엔 없던 기능 — 기존 기능 보존 위해 dc에 요소 추가.
- `[screen]` **Export & Share — HTML File name 편집 필드** [C-10]: 정적 파일명 표기 → 편집형 base 입력 + `-{timestamp}.html` 자리표시. 이유: 앱에 projectTitle 없음 → 이 필드가 유일한 파일명 지정 수단(기존 기능 보존).

### Changed
- `[screen]` **Node Editor — Output 카드 메타** `→ viewport A/B` → `→ viewport`(pane 문자 미노출) [C-1]. 이유: 카드가 뷰포트 레이아웃 상태를 몰라 모듈 경계 유지. dc를 실동작에 맞게 정정.
- `[screen]` **Node Editor — 포트 rail 라벨** 단축명 → **raw 포트명**(`tex`→`texture`, `rgba`→`color`), Output 카드 paddingLeft 34→46 [C-2]. 이유: 구현이 raw 포트명 유지 → dc를 실동작(46/raw)에 정정.
- `[screen]` **Viewport — 컴팩트 임계값** ≤700px → **≤990px** [C-6]. 이유: 700~989px 구간에서 풀 트랜스포트 바가 하단 pane 캡션과 겹침 → 컴팩트 티어가 넓은 구간 커버.
- `[screen]` **Side Panel — Diagnostics 메트릭 라벨** `Programs: N linked` → `Shaders: N compiled` [A-6]. 이유: 실제 GL 링크 카운터 부재 — error 없는 shader/compute 노드 수 프록시에 라벨을 맞춤.
- `[screen]` **Side Panel — Inspector Name 단일화** [A-1·A-2]: param의 Label 필드·group의 Group label 필드 제거, 공통 `Name` 하나로 모든 노드 rename. 이유: 같은 노드에 이름 필드 이원화 해소.
- `[screen]` **Export & Share — 성공 토스트 통일** `Exported {name} · {size}`(HTML·GIF·WebM 동일, 크기 포함) [C-11b]. 이유: 포맷 비대칭(HTML만 크기 표기) 해소.
- `[token]` `overlay.scrim` **범위 축소** — "몰입 모드·GPU 칩·모달 백드롭 공용" → "GPU 칩(향후 몰입 모드) 공용" [B-1]. 이유: 실제 순흑 0.5 파생은 GpuTimerChip 1곳뿐, 모달 백드롭은 M7-U5의 appDarker 0.72 — 문서가 코드와 어긋나 정정(시각 변화 없음).

### Docs (규칙 확정 — dc/토큰 변경 최소)
- `[screen]` A-5: Diagnostics 레벨 태그 색은 **dc 픽셀값이 정본**(INFO=accent.hover, DEBUG=text.secondary). README §E 규칙 문구를 실측에 맞게 정정, 구현 `LEVEL_STYLE` 교체 필요. (README 규칙 vs dc 픽셀 유일 모순 건 해소.)
- `[screen]` A-7: 크래시 폴백 '!' 에러 액센트(#f0555c)는 `semantic.error`를 **빌드타임 보간**한 인라인 상수로 추적(런타임 var 회피). 나머지 그레이/폰트는 토큰 비의존 유지.
- `[screen]` A-8: standalone export 폴백 div의 `color:white`도 D6와 같은 예외이나 빌드타임 상수로 토큰화. [B-7] standalone에 IBM Plex Sans 서브셋을 data URI 번들(파일 +수십 KB).
- `[screen]` C-11a: D16 파일명 규칙의 `{projectTitle}`을 실동작(HTML 편집 필드 / `DEFAULT_EXPORT_BASE`)에 맞게 정정 — projectTitle 상태 신설은 스코프 초과.
- `[screen]` A-4: 컴팩트 FOV 스텝퍼 dc의 `indexOf` 동작은 의도된 원안 — dc 유지(구현의 최근접 순환과 다름을 명시).
- A-3: pane 라벨 미지정 시 "Output" 단독 표기 유지. B-8: Diagnostics 인테리어 근사 5건 일괄 승인(누락 사유 주석 1건만 보완).

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

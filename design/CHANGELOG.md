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
> 다음 변경 대기 중.

---

## v2.1 — 2026-07-20
> `temp/design-request-v2.1.md`(X1~X17) 응답. v2.0 구현(PR #72, 머지 `3d9168f`)이 dc/CHANGELOG 미정의 코너에서 내린 **잠정 결정 확정 + 문서 정합** 라운드(breaking 아님). **X1~X17 전부 인용.** 신규 토큰 0(X14는 기존 토큰 개명 — 무비용). 코드 변경은 X13 소비처 2곳 + X14 참조 2곳뿐, 나머지는 현행 승인/문서 정정. dc 반영: File ▾ 메뉴·＋More=팔레트·pill z-11·스테이지 스트립 규격·접힌 레일 인테리어·죽은 코드 제거.

### A. 자동 접기(W5) 후속
- **X1 [자동 펼침 대상 kind] `[component]`** = **현행 승인(a).** `shader | compute` 채택 — compute 노드도 CodeEditor 편집 대상이라 dc의 shader 단독이면 compute 선택 시 편집할 패널이 자동으로 숨는 모순. README §A `selectNode` 문구를 `shader|compute`로 갱신.
- **X2 [Auto-open 토글 도달성 + 라벨] `[component]` `[screen]`** = **현행 승인(a) + 도달 경로/라벨 규칙 확정.** 접힌 34px 레일에선 토글이 숨는 것을 "접힘=비활성 시그널"로 간주(펼쳐야 끔). 도달성 코너는 **⌘K 팔레트에 `Toggle Code auto-open` 명령**을 신설해 접힘과 무관하게 도달 가능(공간 비용 0, `Command Palette.dc.html`). **라벨 규칙**: `Auto-open: ON/OFF` → **`Auto: ON/OFF`**로 단축 + `white-space:nowrap`(34px/0 12px 스트립에서도 안 넘침, 정상 상태 완전 해소). vertex+fragment 동시 에러(dot 2개)로 극한 폭이 될 때만 ellipsis.
- **X3 [자동 접기 × 최대화] `[component]`** = **잠정 규칙 정본 채택.** 자동 구동이 code leaf를 접을 때 최대화는 **접히는 leaf 자신이 최대화 중일 때만** 해제(사용자가 최대화해 둔 무관 패널은 안 풀림). 수동 `toggleCollapse`는 기존대로 무조건 해제. 테스트 2건으로 고정.
- **X4 [autoCode 영속화] `[component]`** = **현행 승인(a) — 비영속.** activeStage 등 다른 세션 UI 상태와 동일하게 리로드마다 ON 복귀(E2E 격리 유리). 레이아웃 트리만 autoSave 영속.

### B. 도킹 폴백 규칙(T1) 후속
- **X5 [T1 차단 center 폴백] `[component]`** = **잠정 규칙 승인.** viewport/code 대상 center 드롭이 T1로 차단되면 원본 트리 반환(패널 유실, R1 위반) 대신 **`zone:right` 동일 기하 스플릿(대상 60% / 신규 40%)**. 커서 위치 미고려(커서 기반은 `computeDropTarget` 시그니처 확장 필요 — 범위 큼, 반려).
- **X6 [＋Panel 재도킹 타깃] `[component]`** = **잠정 규칙 승인.** dc `addPanel`의 `regions[0]` 무조건 병합이 v2.0 첫 leaf=code라 이종 병합 충돌 → **in-order 첫 `canMerge` 통과 leaf에 병합**(v2.0에선 nodeEditor = 옛 착지점 동일), 없으면 outer-right 스플릿.

### C. 노드 추가 pill(W4) 후속
- **X7 [＋More 동작] `[screen]`** = **현행 승인(a) — ⌘K 팔레트 오픈으로 정본화.** README §A·CHANGELOG §v2.0 W4의 "카테고리 오버플로 드롭다운"을 정정 — 구 오버플로 노드 7종(Webcam/Video/Audio/Blend/Float/Color/Time)이 팔레트 명령에 전부 존재해 기능 손실 0, 역할 분리(W4) 취지와 합치. dc ＋More 버튼에 `openPalette` 배선 + title.
- **X8 [File ▾ 메뉴] `[screen]`** = **위치·명칭 확정.** 구 ＋More에 섞여 있던 Load…/Import JSON/Export JSON/Snap PNG 4항목을 **브랜드 divider 직후 `File ▾` 메뉴**로 배치. dc 툴바에 File ▾ 추가(Presets 앞), README §A 툴바 구성에 반영.
- **X9 [pill z-index/클리어런스] `[screen]`** = **z-index 11 승인 + 상단 클리어런스 현행 승인.** dc L131 z-6은 `.welcome-overlay`(z-10)에 "첫 노드 추가" 클릭을 뺏겨 **z-11**로(근거 주석 병기). 고정 상단 클리어런스는 두지 않고 기존 fitView padding(0.15/0.2) + 패닝 회피로 마무리(pill 뒤 노드는 패닝).

### D. 진단 오버레이(S7/T3) 후속
- **X10 [오버레이 배경] `[token]` `[screen]`** = **(a) `surface.rail` 통일.** dc L405 오버레이 본문+스트립 bg `#0f1114`가 `surface.rail`과 정확히 일치 — rail 톤 통일이 의도. 재구현은 `.status-overlay` 배경을 `var(--surface-rail)`로(1줄). dc는 값이 이미 일치해 무변경.
- **X11 [스트립 GPU/Frame 값] `[screen]`** = **카드=스트립 동일 값 확정.** GPU-time 계측이 없어 카드와 같은 값(GPU=renderer 문자열, Frame=16.7 ms·60 fps)을 단일 헬퍼로 공유. 라벨만 dc대로 카드 "Draw calls"/스트립 "Draws". 진짜 GPU-time은 GL 타이머 쿼리 신규 계측(스코프 밖). (**Y2 정정**: X12로 카드 제거 후 카드 라벨 규정은 소멸 — 스트립 "Draws"만 유효.)
- **X12 [2×2 메트릭 카드 거취] `[screen]` `[component]`** = **(b) 카드 제거 — 스트립 단일화.** R5로 Side Panel diagnostics 탭이 없어 2×2 카드 그리드는 렌더 호스트가 없는 잠복 코드(단위 테스트로만 소비) → **메트릭 카드 컴포넌트/분기 제거**, 오버레이 메트릭 스트립을 유일 경로로 확정. 카드 전용 단위 테스트도 함께 정리(번들 소폭 감소).

### E. 토큰/스타일 확답
- **X13 [S26 소비처 잔여 2곳] `[token]`** = **정본 토큰 교체 승인.** `src/index.css:361`(라벨색 → `--accent-bright`) · `src/ui/Panels/DiagnosticsPanel.tsx:167`(값색 → `--success-bright`) 2곳을 다음 라운드에 정본 토큰으로 교체 + stale 주석 갱신(기계적). theme.ts 값 불변.
- **X14 [pill radius/shadow 개명] `[token]`** = **개명 승인.** dc pill의 radius 10 · shadow `0 8px 24px rgba(0,0,0,0.5)`가 `skeletonStatus`와 동일해 재사용 중 → 의미가 '캔버스 플로팅 필 + 그래프 스켈레톤 상태' 공용이라 **`radius/shadow.skeletonStatus` → `floatingPill`로 개명**(theme.ts). 참조 2곳 교체(무비용), 값 불변.
- **X15 [Code 스테이지 스트립 규격/active] `[screen]`** = **①② 현행 승인(dc 정정).** ① 스트립을 전역 도킹 헤더 규격(**34px · padding 0 12px**)으로 통일(도킹 헤더와 시각 연속성). ② active 표시 = **accent `border-top 2px`**(v1.x 유지, dc의 bg 스왑+weight를 정정). dc `App Shell` Code 헤더 스트립/스테이지 탭을 구현 값으로 정정.

### F. dc 정리
- **X16 [`autoCodeStyle` 죽은 코드] `[component]`** = **제거.** `App Shell.dc.html`의 미사용 `autoCodeStyle`(실 바인딩은 `autoCodeHdrStyle`뿐) 삭제(문서 위생, 구현 영향 0).
- **X17 [접힌 Code 레일 인테리어] `[component]`** = **(b) 정식 채택.** 접힌 34px 레일이 크롬(grip)만 렌더돼 정체성/에러/펼침 어포던스가 없던 것을 정식 인테리어로: **⣿ grip + 패널 dot + 세로 라벨("Code · GLSL", writing-mode) + (에러 시) 빨강 에러 dot + 위치 기반 펼침 chevron**. 접힘 상태에서도 컴파일 에러가 보여야 하므로 에러 dot 채택(소스=diagnosticsStore, 번들 소폭 증가). dc `App Shell`에 접힘 레일 오버레이 추가 — 구현도 이 시안대로 빌드.

### G. v2.1-fix (Y1~Y2 — `design-request-v2.1-fix.md`, 번들 `8fd9d6c` 검증 정정)
- **Y1 [Side Panel이 X12·R5와 모순] `[screen]` `[component]`** = **정정함 — (a) inspector·assets 2탭으로 정리.** X12(카드 제거)·R5(problems/diagnostics는 도킹 탭 아님, 상태바 오버레이 단일 경로)를 v2.1이 `Side Panel.dc.html`엔 반영하지 않아 이 화면만 4탭(inspector/assets/problems/diagnostics)·`diagStats`(카드) 잔존 → 정본과 모순(W3형 파일 간 드리프트). **Problems/Diagnostics 탭 버튼·본문 sc-if·`diagStats`/`diagFilters`/`diagLog` 데이터·`problems` 데이터·관련 return 키/핸들러 전부 제거**, 부제 "— inspector, assets, problems & controls" → "— inspector & assets · form controls", `tab` prop enum을 `inspector|assets`로 축소. problems/diagnostics 정본 화면은 App Shell 상태바 오버레이로 단일화(S6/S7/T4/R5/X12와 정합). (b) 4탭 유지는 R5·X12 번복이라 미채택.
- **Y2 [X11 카드 라벨 규정 정합] `[screen]`** = **정정함.** X12 카드 제거로 X11의 "카드 'Draw calls' / 스트립 'Draws'" 중 **카드 라벨 규정은 소멸** — 스트립 "Draws"만 유효. X11 항목에 병기(위).


### Changed
- `[component]` `App Shell.dc.html` — File ▾ 메뉴 툴바 추가(X8) · ＋More `openPalette` 배선(X7) · add-node pill z-index 6→11 + 근거 주석(X9) · Code 스테이지 스트립 30→34px·padding 0 8px→0 12px, active bg 스왑→accent border-top 2px(X15) · Auto-open 토글 라벨 `Auto: ON/OFF` + nowrap(X2) · 접힌 leaf 34px 세로 레일 인테리어(grip+dot+세로 라벨+에러 dot+펼침 chevron, X17) · `autoCodeStyle` 죽은 코드 제거(X16).
- `[component]` `Command Palette.dc.html` — `Toggle Code auto-open` 명령 추가(X2 도달성 경로).
- `[token]` `theme.ts` — `radius.skeletonStatus`/`shadow.skeletonStatus` → `floatingPill` 개명(X14, 값 불변) · 헤더 버전 v2.1.
- `[screen]` `Side Panel.dc.html` — **inspector·assets 2탭으로 정리(Y1)**: Problems/Diagnostics 탭·본문·`diagStats`(2×2 카드)·`diagFilters`/`diagLog`·`problems` 데이터 제거, 부제 갱신, `tab` prop enum 축소. X12·R5 정합.
- `[screen]` `README.md` — 버전 v2.1 · §A 툴바(File ▾·＋More=팔레트)·Code 자동 접기(shader|compute·라벨·도달성·×최대화·비영속·스트립 규격)·§토큰(floatingPill) · §M 드롭 폴백(T1·＋Panel)·접힌 레일 인테리어·diagnostics 오버레이 bg/스트립/카드 갱신.

> ⚠ 신규 토큰 0(X14는 개명). breaking 0. 코드 변경: X13 소비처 2곳 + X14 참조 2곳 + X12 메트릭 카드 제거(스트립 단일화), 나머지 현행 승인/문서 정정. 근사 없음.

---

## v2.0 — 2026-07-19
> `design-request-v1.9.md`(V1~V5) 응답. **V1이 게이트였고 U2를 확정하지 않았다** — 대신 노드 그래프 비중을 키운 **v2.0 기본 레이아웃으로 재설계·확정**(버전 범프). breaking 유지. (S26 정합성 정리에서 accent.bright·successBright·nodeCategory.*Bright·gradient 토큰 신규.)

### 정합성 정리 (S26)
- `[token]` `[screen]` **S26 — 크로스 화면 드리프트 정리 (v2.0 완성도).** 12개 화면이 `theme.ts`에 없는 색을 각자 만들어 쓰며 "같은 역할·다른 값"으로 갈라진 것을 정본에 맞춰 통일.
  - **A 중간 회색 흡수** `[token]` — 유령 회색을 기존 text 단계로 스냅(신규 토큰 0): `#565e68`·`#59626c`·`#5f7488`→`muted`, `#8f97a1`·`#8890a0`→`secondary`, `#c2c8d0`→`brightBody`. (9개 화면 영향, 가장 광범위)
  - **B accent.bright 신설** `[token]` — 11개 화면 전부가 쓰던 `#7dbcff`(hover보다 밝은 accent)를 `accent.bright`로 정식 토큰화.
  - **C 근-검정 표면 스냅** `[token]` — `#0e1013`·`#0e1116`·`#0d0f12`→`surface.rail(#0f1114)`, `#0a0c10`→`surface.app(#0b0c0e)`.
  - **D 카테고리 bright 정식화** `[token]` — `nodeCategory.processBright(#7dbcff)`·`valueBright(#e2ba57)`·`outputBright(#ee7fac)` + `semantic.successBright(#6fe3b8)` 신설. perf 배지 yellow `#f4d774`→`valueBright`, warn `#f5c778`→`warning`으로 흡수. (green `#6fe3b8`은 scalar가 아니라 success 계열이었음 — GPU active·Shader perf 배지.)
  - **E 그라디언트 단일화** `[token]` — `gradient.viewportActive`·`shaderSphere` 신설. App Shell만 어긋나던 navy 백드롭 `38%/78%`→`40%/80%`, empty-state 3종점(node-connect `#0f1218`, Welcome/System States `#0e1116/#0a0c10`)을 `gradient.emptyState` 하나로 통일.
  - **F 국소 정리** `[component]` — Code Editor의 `#3c434c`(35회)→`border.stronger(#3a414a)`.

### v2.0-fix 응답 (W1~W6, `temp/design-request-v2.0-fix.md` 전부 인용)
- **W1 [v2.0 최종 여부] `[breaking]` ★게이트** = **확정 정본.** U1→U2→v2.0 재설계 종료 — v2.0 레이아웃/툴바 구성을 확정 정본으로 굳힘. breaking 구현·마이그레이션·E2E 1440×900 대개편·토큰 병합·툴바 재구성 착수 가능(E2E 대개편은 CLAUDE.md상 사용자 합의 후).
- **W2 [D1 문서 모순] `[screen]`** = **정정함.** README v2.0 문단 "신규 토큰 0" → "신규 토큰 6종(S26)" + 6종 열거. `theme.ts` 헤더 버전 `v1.5·2026-07-18` → `v2.0·2026-07-19`.
- **W3 [D2 문서 모순] `[screen]`** = **정정함.** 삭제된 `Docking Prototype.dc.html`에 달려있던 "Changed"(req1 chevron·R2 정합·중복 Fresnel 제거) 항목을 **App Shell(SSoT) 귀속**으로 이관하고 "삭제 전 최종 상태"임을 명시. chevron 위치 규칙(`parentDir`+`childSide`)은 App Shell 도킹 로직이 소유.
- **W4 [U1 노드 추가 메뉴] `[component]`** = **선택지 1 — 캔버스 상단 중앙 플로팅 pill 확정 + ⌘K 팔레트 유지.** 플로팅 pill = 빠른 접근, ⌘K CommandPalette = 전체 검색으로 역할 분리. header/rail 대안 폐기 유지. 구현 시 보강: pill이 상단 중앙 상시 점유하므로 노드 배치/패닝/줌·미니맵과 겹치지 않게 캔버스 상단 여백 확보(pill 뒤 노드는 패닝 오프셋으로 회피), `＋ More`는 카테고리 오버플로 드롭다운.
- **W5 [U2 Code 자동 접기] `[component]`** = **옵션 토글 채택.** **Code 패널 헤더 우측에 인라인 `⤢ Auto-open: ON/OFF` 토글 신설**. **Auto → W5-(a)**: 노드 선택이 항상 Code 접힘/펼침을 구동(Shader→펼침, 그 외→접힘), 수동보다 우선. **Manual → 자동 구동 정지**, 수동 토글(헤더 chevron)만 적용. 빈 캔버스 클릭(선택 해제) 시 현 상태 유지. 다중 선택 시 Shader 포함이면 펼침(Auto 한정). `state.autoCode`가 게이트, `selectNode`가 참조.
- **W6 [S1 Unreleased 포트 정렬 4건 스코프]** = **v2.0에 포함.** Noise 멀티포트 정렬·Combine/Output 정렬·노드 폭 포트 라벨 확장·포트 라벨 ellipsis 제거 4건을 `[Unreleased]`에서 v2.0 Changed로 이관(위 `[W6]` 항목).

### V1~V5 결정 (요청서 인용)
- **V1 [U2 최종 여부] `[breaking]` ★게이트** = **U2 미확정.** U1(v1.7)→U2(v1.8) 당일 교체 이력을 감안, U2(우하단 노드)를 정본으로 굳히지 않고 **v2.0으로 한 번 더 개선해 확정.** 이후 breaking 구현·E2E 개편 착수 가능.
- **V2 [U2-b Code 접기] `[component]`** = **접기 가능 → 34px 좌측 세로 레일** 채택. R4(접힌 leaf=split 방향 34px strip)를 좌측 세로로 적용. chevron 가로화(`‹` 접기 / 레일의 `›` 펼치기). 스테일 `codeH` 계산 **제거**, `toggleCode`가 실제로 컬럼을 접도록 배선.
- **V3 [U2-a 노드 그래프 격하] `[screen]`** = **재조정 — 노드 그래프 비중 확대**(사실상 V1 재검토). U2의 "우하단 소형 노드"를 폐기하고 노드 그래프를 **화면 중앙 대형 컬럼**으로 승격. "하단 전폭" 문구 이슈는 레이아웃 자체를 바꿔 해소.
- **V4 [U2-c 마이그레이션] `[breaking]`** = **조용한 폴백.** localStorage 스키마 **버전 키** 신설, 불일치 시 경고/배너 없이 v2.0 기본 트리로 폴백.
- **V5 [U2-d 컴팩트 순서] `[screen]`** = **기능 우선순위 순**: Viewport → Node Editor → Code → Inspector·Assets.

### 결정 요약
- **v2.0 [기본 레이아웃 재설계] `[screen]` `[breaking]` ★** 기본 트리 = `row 0.25 [ code | row 0.60 [ nodeEditor | col 0.52 [viewport / (inspector,assets)] ] ]` — 좌 Code(25%, 접기 가능) · 중앙 Node Editor(주역 그래프, 대형) · 우 col[Viewport(상) / Inspector·Assets(하)]. 대략 25/45/30 비율.

### Changed
- `[component]` `App Shell.dc.html` `[breaking]` — **App Shell을 도킹 시스템 SSoT로 통합.** Docking Prototype의 도킹 엔진(트리 레이아웃·pointer 드래그/드롭·edge-split/tab-merge·divider 리사이즈·collapse/maximize·＋Panel 재도킹·Reset·트랜지언트 고스트·diagnostics 오버레이)을 App Shell 로직 클래스로 흡수하고, 각 leaf 본문은 App Shell의 리치 패널(Node Editor·Viewport·Inspector·Code·Assets)을 렌더. 노드 선택→Code 자동 접힘(req3)은 이제 **도킹 트리의 code leaf `collapsed` 플래그**를 토글해 구현. 별도 `Docking Prototype.dc.html`은 **삭제**(더 이상 두 파일 정합 불필요 — App Shell이 룩앤필+도킹 동작 단일 출처). Problems는 도킹 탭이 아니라 상태바→diagnostics 오버레이(R5).
- `[component]` `App Shell.dc.html` — **패널 탭 헤더를 Docking Prototype 형식으로 통일**: 모든 패널 헤더가 `⣿` + [색 dot + 제목 + 탭 `✕`] 탭 pill(활성 = 하단 2px accent) + 메타 배지 + 박스형(22×22) collapse/maximize/close 아이콘. Viewport/Node Editor의 대문자 라벨 → 탭 pill로 교체, Side Panel 언더라인 탭에 dot·탭✕·메타 배지 추가, Code는 [● Code] 탭 + GLSL 배지 헤더 + vertex/fragment 스테이지 탭을 본문 하위 스트립으로 이동. dot 색 = Docking META(nodeEditor #3d9bff·viewport #4bbf89·inspector #d4a53c·assets #f0b429·code #a06bff·problems #77828f). 단, Side Panel(~431px 우측 컬럼)은 3개 탭+배지가 이미 폭을 채워 탭별 `✕`·메타 배지는 생략(close `✕` 노출 확보).
- `[component]` `App Shell.dc.html` — BODY 재구성: 좌측 Code 컬럼 25%(접힘 시 34px 세로 레일 + 세로 `Code · GLSL` 라벨 + 에러 dot + `›`), 중앙 Node Editor(order:1, flex:1.5, border-right), 우측 col[Viewport(border-bottom) / Side Panel]. 노드 그래프 좌표·엣지·svg viewBox를 세로형 대형 캔버스(680×780)에 맞춰 재배치. 로직: 스테일 `codeH` 제거, `codeOpen`/`codeCollapsed` 노출, `codeChevron`=`‹`.
- `[component]` `App Shell.dc.html` — **노드 추가 메뉴를 툴바에서 제거하고 Node Editor에 부착**(툴바는 brand·Presets·transport만). 배치는 **`floating` 고정** — 캔버스 상단 중앙 떠 있는 pill 바(카테고리 색 타일+글리프 + `＋ More`), `z-index:6`. (header/rail 대안은 검토 후 폐기.)
- `[component]` `App Shell.dc.html` — **Code 자동 접기/펼침**(req3): 노드 선택 상태(`sel`)로 구동 — Shader 노드 선택 시 Code 자동 펼침, 그 외 노드 선택 시 자동 접힘(rail). 5개 노드 클릭 가능, 선택 노드에 파란 링. `selectNode(id)`가 `codeOpen = (id === "shader")` 설정. **(W5-U2 확정: Code 패널 헤더 우측에 인라인 `Auto`/`Manual` 토글 신설 — ON이면 이 자동 구동(W5-a, 선택이 항상 우선), OFF이면 자동 구동 정지·수동 토글만. `state.autoCode`가 게이트. 툴바가 아니라 동작을 소유한 Code 헤더에 배치.)**
- `[component]` `Node Editor.dc.html` `[W6]` — **Noise(멀티포트) 입력 정렬 수정**: 6개 입력 포트(stride 30)가 프리뷰 하단으로 치우쳐 위가 비고 마지막 `mask`가 프리뷰 밖으로 내려가던 문제 → 포트를 프리뷰 중심(≈130)에 대칭 정렬(dot top 50~200), 출력 `color`도 중심에 맞춤.
- `[component]` `Node Editor.dc.html` `[W6]` — **Combine·Output 포트 정렬 수정**: Combine은 입력 dot 3개(rgb/alpha/mask, stride 27)·출력 dot(vec4)에 대응하는 라벨을 dot 위치(top 44/71/98)에 정렬하고 본문 높이를 확보(3번째 포트가 카드 밖으로 나가던 문제 해소, 중앙 채널 스와치 추가). Output은 "texture" 포트명과 "→ viewport" 값을 한 행(flex, dot 중심 정렬)으로 묶어 어긋남 제거.
- `[component]` `Node Editor.dc.html` `[W6]` — **노드 폭이 포트 라벨에 맞춰 커지도록**: 좌/우 레일 폭 = 가장 긴 라벨 수용, 카드 폭 = 좌레일+본문+우레일. Fresnel(196→220px)·Blend(196→208px)를 실제 긴 라벨로 넓혀 규칙 시연, 두 노드의 출력 엣지 시작 x를 새 폭에 맞춰 재계산. README §B에 "포트 라벨 + 노드 폭" 규칙 갱신.
- `[component]` `Node Editor.dc.html` `[W6]` — **포트 라벨 잘림 제거**: 모든 포트 이름의 `max-width`·`overflow:hidden`·`text-overflow:ellipsis` 클램프 제거, `white-space:nowrap`만 유지 → 이름이 길어도 전부 노출(Unreal 블루프린트 스타일). README §B에 포트 라벨 규칙 추가.
- `[component]` `App Shell.dc.html` (req1) — **접기 chevron은 패널 종류가 아니라 위치로 결정**: 부모 split 방향(`parentDir`) + 그 패널이 a/b 어느 쪽 자식인지(`childSide`)로 계산 — row-a=`‹`(열림)/`›`(접힘), row-b=`›`/`‹`, col-a(상)=`⌃`/`⌄`, col-b(하)=`⌄`/`⌃`. 패널을 다른 위치로 도킹하면 chevron 방향도 따라 바뀜. App Shell 정적 chevron도 기본 위치에 맞춰 동일 규칙 적용(Code·Node Editor=`‹`, Viewport(col 상)=`⌃`, Inspector(col 하)=`⌄`). 이 규칙은 SSoT인 App Shell 도킹 로직이 소유한다(구현 귀속처). *(W3-D2 정정: 이 항목은 원래 삭제된 `Docking Prototype.dc.html`에 잘못 귀속돼 있었음 — 삭제 전 최종 상태였던 `_defaultTree()` v2.0 트리 교체·R2 크롬 정합·중복 "Fresnel" 라벨 제거를 포함해 App Shell로 이관.)*
- `[screen]` `README.md` — 버전 v2.0 · §A App Shell 레이아웃 · §M 기본 트리 · R9 마이그레이션(조용한 폴백) · R11 컴팩트 스택 순서를 v2.0으로 갱신.

### Docs / 구현
- `breaking`: `dockTree.createDefaultDockTree` + `layoutStore` 기본값을 v2.0 트리로 교체 → **v1.5 S1(옛 트리 dir 정정)은 무의미**(옛 기본 트리 소멸). localStorage **스키마 버전 키 신설** + 조용한 폴백(V4). E2E 1440×900 스냅샷/도킹 스펙 대개편 — **CLAUDE.md상 사용자 합의 후 착수**. 번들 393 KiB 예산 재측정(순수 구조 변경, 순증 작음).
- v1.6(T1~T6)은 이 문서와 독립 착수 가능(breaking 아님).

> ⚠ 신규 토큰: S26 정합성 정리에서 accent.bright·semantic.successBright·nodeCategory.*Bright·gradient.viewportActive·shaderSphere 추가(그 외 드리프트는 기존 토큰으로 흡수). `breaking`: 기본 레이아웃 U2→v2.0(노드 그래프 중앙 대형화). 근사 없음.

---

## v1.8 — 2026-07-19
> 디자인 리뷰(새 세션)에서 나온 패널 **기본 레이아웃 재조정(U2)**. v1.7 3-컬럼을 폐기하고 Code를 좌측 세로 컬럼으로, 우측 70%를 상하 2단으로. `breaking`. 신규 토큰 0.

### 결정 요약
- **U2 [기본 레이아웃 재조정] `[screen]` `[breaking]` ★** = **좌 Code / 우 상하 2단 채택.** 기본 트리 = `row 0.30 [ code | col 0.50 [ row 0.55 [viewport | (inspector,assets)] / nodeEditor ] ]` — 좌 컬럼(30%) Code(풀하이트) · 우 컬럼(70%) 상단 row [Viewport | Inspector·Assets] / 하단 row Node Editor. 근거: 코드는 세로로 길게(좌측 읽기 흐름), 미리보기·속성은 상단 나란히, 노드 그래프는 하단 전폭. **v1.7 U1(Viewport/Inspector 좌 · Node 중앙 · Code 우) 폐기.**

### Changed
- `[screen]` `Docking Prototype.dc.html` — `_defaultTree()`를 U2 트리로 교체(좌 Code · 우 상 [Viewport|Inspector] / 하 NodeEditor).
- `[component]` `App Shell.dc.html` — BODY 재구성: 좌측 Code 컬럼(30%, border-right) + 우측 컬럼(70%, col) = 상단 row[Viewport(border-right) | Side Panel] / 하단 Node Editor.
- `[screen]` `README.md` — 버전 v1.8 · §A App Shell 레이아웃 · §M 기본 트리를 U2로 갱신.

### Docs / 구현
- `breaking`: 구현은 `dockTree.createDefaultDockTree` + `layoutStore` 기본값을 U2 트리로 교체, localStorage 기존 레이아웃은 버전 키로 무효화(기본 트리 폴백) 또는 `↺ Reset layout` 유도. E2E 기준 화면(1440×900) 스냅샷 갱신 필요.

> ⚠ 신규 토큰 0. `breaking`: 기본 레이아웃 U1→U2. 근사 없음.

---

## v1.7 — 2026-07-19
> 디자인 리뷰(구현 팀과의 대화)에서 나온 패널 **기본 레이아웃 전면 재설계(U1)**. Code를 하단 전폭 독에서 우측 풀하이트 컬럼으로 옮겨 세로로 긴 GLSL 편집을 확보. `breaking`(R3 폐기). 신규 토큰 0.

### 결정 요약
- **U1 [기본 레이아웃 재설계] `[screen]` `[breaking]` ★** = **1안 채택(Unreal 머티리얼 에디터/Blender 계열).** 기본 트리 = `row 0.28 [ col 0.55 [viewport / (inspector,assets)] | row 0.585 [nodeEditor | code] ]` — 좌 컬럼 Viewport(위)/Inspector·Assets(아래) · 중앙 Node Editor · 우 컬럼 Code(풀하이트). 근거: 코드 에디터는 세로로 길어야 편집이 편하고(폭 ~430px 확보), 노드 그래프는 넓은 중앙 2D, 뷰포트·속성은 좌측 세로 스택 = 프로툴 베스트 프랙티스. **v1.4 R3(\"앱 첫 화면 불변\")을 의도적으로 폐기** — Code 하단 전폭 독은 세로 줄 수가 부족. 이종 탭 병합 제한(v1.6 T1)으로 기본 위치 중요도가 커진 것이 계기.

### Changed
- `[screen]` `Docking Prototype.dc.html` — `_defaultTree()`를 U1 트리로 교체(좌 Viewport/Inspector · 중 NodeEditor · 우 Code).
- `[component]` `App Shell.dc.html` — BODY를 3-컬럼 row로 재구성(좌 Viewport+SidePanel 컬럼 · 중 Node Editor · 우 Code 풀하이트). Code 하단 전폭 독 제거(codeH 높이 로직 폐기).
- `[screen]` `README.md` — 버전 v1.7 · §A App Shell 레이아웃 서술 · §M 기본 트리를 U1으로 갱신, R3 폐기 명시.

### Docs / 구현
- `breaking`: 구현은 `dockTree.createDefaultDockTree` + `layoutStore` 기본값을 U1 트리로 교체하고, localStorage에 저장된 v1.6 이전 레이아웃은 버전 키로 무효화(조용한 기본 트리 폴백)하거나 사용자에게 `↺ Reset layout` 유도. E2E 기준 화면(1440×900) 스냅샷 갱신 필요.

> ⚠ 신규 토큰 0. `breaking`: 기본 레이아웃 = R3 폐기. 근사 없음.

---

## v1.6 — 2026-07-18
> design-request-v1.6.md의 6건(T1~T6)에 대한 디자이너 정본. v1.5 S5·S7 구현 착수 전 확답 — 이종 탭 병합 재초기화 코너(T1) 확정 + 진단 스트립 시각 정본(T3·T4) + 문서/라벨 정정(T5·T6). **모든 T ID 명시 인용**(무응답/보류 0). 신규 토큰 0 · breaking 0.

### 결정 요약 (요청서 T ID 전부 인용)
- **T1 [이종 병합 재초기화] `[screen]` ★** = **선택지 (b) — viewport·code는 이종 병합 제외.** active 탭 전환 시 WebGL/CodeMirror 재초기화 플래시가 "이종 leaf 탭 클릭마다"로 격상되는 것을 막기 위해 **viewport·code는 항상 자기 leaf 유지**(이종 병합 대상 아님). side-panel류(inspector·assets·problems·diagnostics류)는 자유 이종 병합 + active 따라 본문 전환. (a) 전면 수용=잦은 재초기화 플래시로 반려, (c) 무리마운트 포털=번들 예산(393 KiB, 여유 ~4.5) 위험으로 반려. 드롭 규칙에서 viewport/code는 같은 kind끼리만 병합. S5 canon을 이 범위로 좁힘. → `dockLayoutModel.ts`(`leafPanelKind`=`leaf.active`), `DockLayout.tsx`(`DockLeafView`).
- **T2 [헤더·메타 active 추종] `[component]`** = **의도 확인 — 현행 승인.** 이종 leaf에서 헤더·메타 배지는 active 패널 소유라 active 전환 시 함께 전환(탭 dot/제목은 탭별 유지). 의도된 동작. 코드 변경 0.
- **T3 [오버레이 메트릭 억제+스트립] `[screen]`** = **선택지 1 — 현행 dc 승인.** 172px 오버레이는 전체 2×2 메트릭 카드를 억제(hosted/compact 변형)하고 단일 행 스트립(GPU/Frame/Draws/Shaders)만. 순서 = 헤더 → 스트립 26px → 진단 툴바/로그. 전체 카드는 Side Panel Diagnostics 탭 전용. → `StatusOverlays.tsx`, `DiagnosticsPanel.tsx`.
- **T4 [스트립 범위] `[screen]`** = **diagnostics 전용 승인.** 메트릭 스트립은 diagnostics 오버레이에만, **problems 오버레이엔 없음**(problems는 목록만). dc대로. → `StatusOverlays.tsx`, `ProblemsPanel.tsx`.
- **T5 [스테이지 탭 라벨] `[screen]`** = **구현 표기 채택 — `vertex.glsl`/`fragment.glsl`.** 구현 `StageTabs.tsx`가 E2E(phase 24~28, `stage-tab-*` testid)로 잠긴 상태라 dc를 `.glsl` 표기로 맞춤(저비용). App Shell·Docking Prototype Code 스테이지 탭 라벨 정정. → `App Shell.dc.html`, `Docking Prototype.dc.html`.
- **T6 [오타 정정] `[screen]`** = **정정.** CHANGELOG v1.5 §S7 "컴트롤"×2→"컨트롤" · §S2 "버도 구현 없음"→"별도 구현 없음", README §M "컴트롤"×2→"컨트롤"·"목록을 열다"→"목록을 연다". 내용 무영향.

### Changed
- `[screen]` `App Shell.dc.html` · `Docking Prototype.dc.html` — Code 스테이지 탭 라벨 `vertex`/`fragment` → `vertex.glsl`/`fragment.glsl`(T5, 구현 StageTabs 정본).
- `[screen]` `README.md` — §M S5 규칙을 T1 선택지 (b)로 정정(viewport·code 이종 병합 제외) · S7/T3·T4 스트립 범위 명문화 · 오타 정정(T6) · 버전 v1.6.
- `[screen]` `CHANGELOG.md` — v1.5 §S7·§S2 오타 정정(T6).

### Docs (확답만 — 코드 변경은 구현 쪽)
- T2 헤더 추종 확인 · T3·T4 스트립 시각 정본 · T5 라벨 · T6 오타 — 구현 반영 항목은 각 영향 파일 참조.

> ⚠ 신규 토큰 0. breaking 0. T1 (b)는 S5 canon을 "viewport/code 제외"로 좁힘(번들 경량·재초기화 회피). 근사 없음.

---

## v1.5 — 2026-07-18
> design-request-v1.5.md의 25건(S1~S25)에 대한 디자이너 정본. v1.4 도킹 구현 후속 — 정본 결함 정정(§A) · 미정의 UX 코너 확정(§B) · 토큰 근사 승인(§C). **모든 S ID 명시 인용**(무응답/보류 0). 신규 토큰 0 · breaking 0 · 값 정본은 `theme.ts`.

### 결정 요약 (요청서 S ID 전부 인용)
- **S1 [트리 dir 결함] `[screen]` ★** = **정정 승인 — 중앙 split은 `col`.** `_defaultTree()` 가운데 split을 `row 0.556`→`col 0.556`으로 정정(viewport 위 / inspector·assets 아래). 근거: 0.556=viewportFrac(높이 비율) · `.shell-right{flex-direction:column}` · R2/R3(앱 첫 화면 불변). dc·CHANGELOG(§v1.4 R3)·README §M **3곳 정정**. 코드는 이미 `col`(`dockTree.ts`).
- **S2 [Combine stride 27] `[screen]`** = **실측 27 승인 + dc 정정.** R15("실측값 정본, dc 사후 정정") 조건 충족. Combine 입력 핸들 44/70/96(stride 26)→**44/71/98(stride 27)** + 엣지 y 갱신. **출력 disc = 프레젠테이션 판정** → dc의 중앙(top:70)을 **첫 행(top:44)**으로 정정(전 카드 공통 PORT_TOP_PAD 관례, 구현과 일치). "중앙 정렬 의도" 아님 — 별도 구현 없음. → `Node Editor.dc.html`.
- **S3 [문서 stride 26→27] `[screen]`** = **정정 승인.** README §도메인·§B "stride 26"→27, CHANGELOG §v1.3 Q7·v1.3 Changed의 26 표기에 정정 노트(S2와 동일 사안의 문서 액션).
- **S4 [fontBundle 잔존] `[screen]`** = **삭제 승인.** README §토큰 목록의 `fontBundle.standalone` 잔존 문구 제거(Q10-b에서 이미 취소된 토큰).
- **S5 [이종 탭 병합] `[screen]` ★** = **선택지 1 — 탭 = 완전한 도킹 단위.** 이종 kind 병합 시 active 탭을 바꾸면 본문도 그 kind로 전환(진짜 도킹 UX). leaf는 단일 kind 비고정. 구현: `DockLeafView`를 active 탭 kind 기반 렌더로 재작성(번들 여유 ~4.5 KiB 사용). README §M 명문화. → `DockLayout.tsx`, `dockLayoutModel.ts`.
- **S6 [Problems 거처] `[screen]`** = **선택지 1 — 현행 승인.** 상태바 `⚠ N problems` 카운트 클릭 → 172px 하단 오버레이(에러 클릭→노드 선택+코드 점프). 0건 카피 "no problems". README §M 반영.
- **S7 [Diagnostics 오버레이] `[screen]`** = **선택지 1 — 컨트롤 단일화 승인 + 메트릭 스트립.** 진단 컨트롤은 한 곳(호스팅 DiagnosticsPanel 툴바)에만 — 오버레이 크롬은 중복 안 함. 172px 부작용(로그가 초기 스크롤 밖) 해소: 전체 메트릭 카드 대신 **단일 행 메트릭 스트립**(GPU/Frame/Draws/Shaders, ~26px)을 헤더 아래 배치. dc 오버레이에 스트립 추가. 전체 카드는 Side Panel Diagnostics 탭에만. → `Docking Prototype.dc.html`, `StatusOverlays.tsx`.
- **S8 [컴팩트 폴백] `[screen]`** = **선택지 1 — 현행 승인 정본화.** 컴팩트(<990px) 고정 스택 = leaf 46vh(min 200px) + 세로 스크롤. README §M 정본화.
- **S9 [접힌 leaf 최대화] `[screen]`** = **선택지 1 — 현행 승인.** 최대화가 접힘을 강제 해제(헤더만 남는 빈 화면 방지). README §M 반영.
- **S10 [일괄 잠정 결정] `[screen/component]`** = **a~k 전부 현행 승인.** 단 **S10-d**: App Shell.dc.html 헤더 버튼 순서(최대화→접기)를 도킹 크롬 정본(**접기 ⌄ → 최대화 ⤢ → 닫기 ✕**)으로 사후 정정(3개 패널 헤더, 뷰포트 장식 ⊞ 제거 — split은 Output 수 자동). 나머지(a 클램프 · b rail 탭존 · c 메타배지 미구현 · e splitter 채색+6px · f 재귀 라벨 · g 스냅샷 범위 · h ＋Panel 배치 · i 팔레트 ◇ 범위 · j 카테고리 select 표기 · k 도킹 카운트 단수)는 현행 유지. → `App Shell.dc.html`.
- **S11 [closeTab reconcile] `[screen]`** = **현행 승인.** dc `closeTab`의 `maximized===id`(leaf id vs panel id) 타입 불일치 결함 확인 — 구현의 `reconcileMaximized`("leaf 실존 여부") 일반화가 정본. 코드 변경 0.
- **S12~S19 [토큰 근사] `[token]`** = **전부 근사 승인**(신규 토큰 0). S12 배지 `#f5c778`→`warning` · S13 탭✕/메타 `#565e68`→`text.muted`+opacity 0.55 · S14 ＋Panel hint `#565e68`→`text.muted`(opacity 미병용) · S15 드롭 라벨 `#7dbcff`→`accent.hover` · S16 고스트/프리뷰 radius 9/8 · S17 고스트 shadow=`modal`+accent 링 · S18 빈 도크 아이콘 radius 16 · S19 오버레이 배경 `panel`/shadow `scrim`. **S13/S14 근사 방식 차이는 의도적 유지**: 탭✕(S13)은 장식적 보조 글리프라 opacity 0.55로 dim, ＋Panel hint(S14)는 기능 안내 텍스트라 가독성 위해 opacity 미병용.
- **S25 [theme.ts 버전 표기] `[token]`** = **현행 승인.** "신규 토큰 0 — 병합분 없음" 방식 유지. `theme.ts` 헤더에 v1.5 라인 추가.
- **S20~S24** = 요청서 미할당(빈 ID). 해당 없음.

### Changed
- `[screen]` `Docking Prototype.dc.html` — `_defaultTree()` 중앙 split `row`→`col`(S1) · 진단 오버레이에 단일 행 메트릭 스트립 추가(S7) · **Code 패널 본문에 `vertex`/`fragment` 스테이지 탭 서브바 추가**(사용자 리뷰): 셰이더는 vertex+fragment 쌍으로 컴파일되므로 단일 코드 뷰는 오표현 — App Shell Code 독 + `CodeEditor` StageTabs와 일치시킴(fragment active + 에러 닷, Fresnel 컨텍스트) + 하단 인라인 에러 스트립(line 8:37 undeclared identifier)도 App Shell과 파리티.
- `[screen]` `Node Editor.dc.html` — Combine 입력 핸들 stride 27(44/71/98) + 출력 disc 첫 행 정정 + 관련 엣지 y 갱신(S2).
- `[component]` `App Shell.dc.html` — 3개 패널 도킹 헤더 버튼 순서를 접기 ⌄→최대화 ⤢→닫기 ✕로 정정, 뷰포트 장식 ⊞ 제거(S10-d).
- `[screen]` `README.md` — 버전 v1.5 · §M 기본 트리 col(S1)·이종 탭 병합(S5)·접힌 leaf 최대화(S9)·problems/diagnostics 오버레이+메트릭 스트립(S6·S7)·컴팩트 폴백(S8) · §도메인/§B stride 27(S3) · §토큰 fontBundle 제거(S4).
- `[token]` `theme.ts` — 헤더 v1.5 라인(신규 토큰 0, S25). 값 불변.
- `[screen]` `CHANGELOG.md` — §v1.4 R3 트리 서술 col 정정(S1) · §v1.3 Q7/Changed stride 26 정정 노트(S3).

### Docs (확답만 — 코드 변경은 구현 쪽)
- S3 문서 정정 · S11 dc 결함 확인 · S12~S19 근사 승인 · S25 버전 표기 — 구현 반영 항목은 각 §영향 파일 참조.

> ⚠ 신규 토큰 0. breaking 0. 근사: S12~S19(기존 토큰 재사용). S5는 기능 갭 해소로 구현 작업 필요(dc/토큰 불변).

---

## v1.4 — 2026-07-17
> design-request-v1.4.md의 15건(R1~R15)에 대한 디자이너 정본. Docking Prototype을 구현 스코프로 승격하면서 나온 모순·기능 삭제·사양 부재 결정. **모든 R ID 명시 인용**(무응답/보류 0). 신규 토큰 0 · breaking 코드 0 · 값 정본은 `theme.ts`. `Docking Prototype`을 `[Unreleased]`에서 **v1.4 정본으로 확정**(더 이상 "다음 세션" 보류 아님).

### 결정 요약 (요청서 R ID 전부 인용)
- **R1 [플로팅] `[breaking]`(dc)** = **선택지 1 — 플로팅 없음 확정.** 상주 플로팅 창 상태 없음. dc의 float 리사이즈 핸들/다중창/`floatWindow`·`tabInFloat`/`setFloatActive`/`closeFloatTab`/float 정지 스타일 분기 등 **죽은 코드 전부 제거**. 드래그는 트랜지언트 고스트 1개(release 시 반드시 도킹, `_fallbackTarget`=첫 region). Empty state 카피 정정: "drop a floating panel here" → **"No panels docked — add one with ＋ Panel"**. → `Docking Prototype.dc.html`.
- **R2 [정본 충돌]** = **선택지 2 — App Shell = 기본 레이아웃 정본.** 두 화면의 기본 구조를 일치시킴. dc 기본 트리를 App Shell에 맞춰 정정(code = 하단 전폭 독). README M에 "구조 동일" 규칙 명문화.
- **R3 [기본 레이아웃] `[screen]`** = **선택지 2 — 현행 기본값 유지(앱 첫 화면 불변).** dc 기본 트리 = `col 0.717 [ row 0.587 [nodeEditor | col 0.556 [viewport / (inspector,assets)]] | code(하단 전폭, 접기 가능) ]`. C-7의 "기본 데모=첫 화면 비주얼 불변" 원칙과 동급. `layoutStore` 기본값 교체 불필요(트리로 동일 상태 표현).
- **R4 [접기/최대화] `[component]`** = **선택지 1 — 병존.** 트리 모델 + 접기/최대화를 leaf 단위 속성으로 유지(기존 기능 + `m1-dock-header-collapse.spec.ts` 회귀 가드 보존). 접힌 leaf = split 방향 고정 34px strip(divider 비활성). 최대화 = leaf를 도크 body 전체로 오버레이. dc에 접힌 leaf 시안 + ⌄/⌃·⤢/⤡ 컨트롤 반영. → `Docking Prototype.dc.html`.
- **R5 [problems/diagnostics] `[screen]`** = **선택지 1 — 5종만 도킹.** problems/diagnostics는 1급 도킹 탭 아님. `diagnostics`는 `debugUiStore.open` 단일 출처 유지 → 상태바 `◨ Diagnostics` 토글로 **하단 트랜지언트 오버레이**(172px, 탭 아님)로 열림. `problems`는 상태바 카운트(`⚠ N problems`). 배선 파괴 없음. dc에 오버레이 + 상태바 항목 시안 추가. → `Docking Prototype.dc.html`.
- **R6 [헤더 ✕] `[component]`** = **선택지 3 — 헤더 ✕ = 패널 전체 닫기 + 탭별 ✕ 별도.** active 탭만 닫히던 혼란 해소(3번 클릭 문제 제거). 탭마다 작은 ✕(hover 강조)로 비활성 탭도 활성화 없이 닫힘. VSCode idiom. → `Docking Prototype.dc.html`.
- **R7 [최소 크기] `[screen]`** = **선택지 1 — 전역 leaf 최소 240×160**(플로팅 리사이즈 최소값과 동일). divider 드래그가 픽셀 하한 아래로 못 가게 클램프(0.15~0.85 비율 클램프에 픽셀 하한 겹침). → `layoutStore.ts`, dc `MIN_W/MIN_H`.
- **R8 [탭 오버플로] `[screen]`** = **선택지 1 — 가로 스크롤(스크롤바 숨김 + 우측 페이드 마스크).** 34px 헤더 높이 불변, 임계 폭/생략 로직 없이 최소 코드(번들 예산 고려). 탭 4개↑에서 마스크 노출. → `DockPanelHeader.tsx`, dc `.sp-tabs`.
- **R9 [영속화] `[screen]`** = **선택지 2 — localStorage.** 레이아웃 = 사용자 작업 환경(프로젝트 데이터 아님). 프로젝트 `.json` 미포함 → `projectSanitize` 마이그레이션 회피. `Reset layout` = 기본 트리 복귀. → `autoSave.ts`(layout 키 신설), `serialization.ts` 미변경.
- **R10 [접근성/입력] `[screen]`** = **선택지 1 + 선택지 3.** 도킹 재배치는 포인터 전용으로 확정(키보드 DnD 미도입 — 번들 예산, 대안으로 ＋Panel/접기/닫기 버튼은 키보드 도달 가능). 단 `mouse*` → `pointer*` 전환으로 **터치/펜 무상 지원**. dc는 pointer 이벤트로 이식. → `App.tsx`, `DockPanelHeader.tsx`.
- **R11 [반응형] `[screen]`** = **선택지 3 + 선택지 2.** 밴드/존 픽셀은 규칙으로 전달(Q6 정신) · 비율만 이식. **컴팩트(<990px, C-6)에서는 트리 도킹 비활성 → 고정 스택 폴백**(좁은 화면 실수 도킹 방지). dc는 1440×826 고정 레퍼런스 유지. → `App.tsx`, `paneLayout.ts`.
- **R12 [패널 dot] `[component]`** = **선택지 1 — 현행 승인.** 패널 dot 5색은 **장식적 식별자**일 뿐 노드 카테고리/포트 타입 의미축과 무관. 신규 토큰 없이 기존 값 재사용, "의미 아님"을 README 규칙으로 명시(Code 보라 dot ≠ resource 포트 보라). 코드 변경 0.
- **R13 [Q9 잔여] `[screen]`** = **선택지 1 — 구현 select 라벨도 `Info+`로**(로직 0, 라벨만). Q9 의도(오독 방지)를 구현 쪽에도 적용. → `DiagnosticsPanel.tsx:267-271`.
- **R14 [Q1-b 잔여] `[screen]`** = **선택지 1 — 육안 근사 승인.** 레시피(중앙 글로우 + 다크 비네트 + `u_time` 변조)만 정본, CSS stop↔GLSL smoothstep 곡선 정확 일치 불요(±4px는 픽셀 기하 규칙이라 미적용). Q6 "규칙으로 받는다" 정신. → `starter.frag`.
- **R15 [Q7 잔여] `[screen]`** = **선택지 1 — 실측값이 정본, dc는 사후 정정.** stride 브라우저 실측이 26이 아니면(25/27 등) 구현이 실측값 확정 후 보고 → dc의 44/70/96 핸들을 그 값으로 재정정. 구현 CSS 불변.

### Changed
- `[screen]` **`Docking Prototype.dc.html` 전면 개정** — 플로팅 제거(R1) · 기본 트리 = App Shell(R2·R3) · 접기/최대화 leaf 속성(R4) · problems/diagnostics 상태바+오버레이(R5) · 헤더 ✕=패널·탭별 ✕(R6) · leaf 최소 240×160 divider 클램프(R7) · 탭바 가로 스크롤+페이드(R8) · pointer 이벤트(R10) · 패널 dot 규칙 주석(R12).
- `[screen]` `README.md` §M을 v1.4 정본으로 갱신(기본 트리·접기/최대화·오버플로·최소크기·영속화·반응형·problems/diagnostics·패널 dot 규칙). §M 헤더에서 `[Unreleased]` 제거.

### Docs (확답만 — dc/코드 변경은 구현 쪽)
- R9 localStorage · R10 pointer/포인터 전용 · R11 <990px 도킹 비활성 · R13 select 라벨 · R14 GLSL 근사 · R15 실측 우선 — 구현 반영 항목(위 영향 파일 참조).

> ⚠ 신규 토큰 0. breaking 코드 0(R1의 breaking은 dc 죽은 코드 제거에 한함). 근사: R7 최소값은 dc 플로팅 최소값 재사용, R11 컴팩트 폴백은 C-6 임계 재사용.

---

## v1.3 — 2026-07-17
> design-request-v1.3.md의 남은 12건(Q1~Q11 + 하위항목)에 대한 디자이너 정본. 모든 Q ID를 명시 인용(무응답/보류 없음). 신규 토큰 0 · breaking 0 · 값 정본은 `theme.ts`.

### 결정 요약 (요청서 Q ID 전부 인용)
- **Q1 [C-7]** `[screen]` starter.frag 채택(선택지 2) **승인**. 잔존 이슈(명시적 "Add Shader: Unlit" = 여전히 링크 에러)는 **선택지 2**: Command Palette의 `Shader: Unlit` 항목에 **`⚠ needs Mesh` 앰버 배지 + 보조텍스트**를 추가해 팔레트에서 미리 알린다(코드 에러 허용은 유지, UX로 예방). → `Command Palette.dc.html`.
- **Q1-b** `[screen]` starter 노드 **기본 출력 비주얼 정본 제시**: `u_baseColor` 중앙 소프트 글로우 + 다크 비네트 + `u_time` 미세 변조, mesh 유무 양쪽 링크(valid @ birth). 시안 = `Node Editor.dc.html` 우측 'New Shader' 데모 카드. 구현 임시 비주얼(틴트+글로우)을 정본으로 승격·구체화.
- **Q2 [C-4]** `[screen]` Video 재생 글리프 = **`node.playing`(사용자 의도) 유지**. 코드 변경 0. dc 불변.
- **Q3 [C-5]** `[screen]` Audio 파형 = **FFT bin 연속 바 유지**(정보량 최대). dc의 청키 6바는 정적 데모로 유지. 코드 변경 0.
- **Q4 [C-8]** `[component]` `metaAlign="end"` 메타 배지 = **배지 박스 유지**(공통 컴포넌트 일관성). dc 정정: App Shell 'GLSL · ES 3.0'을 plain mono → **배지 박스**로. → `App Shell.dc.html`, README [D13].
- **Q5 [C-3]** `[screen]` README 공식 vs dc 모순 → **dc 실측(96/176) 채택**(A-5 선례). v1.2 공식 `max(96,(n−1)·30+56)` **폐기**, README를 규칙 서술로 정정.
- **Q6 [C-3]** `[breaking]`(문서 규칙) 포트 좌표계 재발방지 = **규칙으로 전달**(선택지 1). dc 픽셀 상수 이식 금지 명문화 — 포트 기하는 "본체가 span 덮도록 확장·2px 꼬리·96 floor"로 주고 구현이 `PORT_TOP_PAD` 좌표계에서 유도. README §도메인/§B 갱신.
- **Q7 [C-3]** `[screen]` Math/Combine stride = **26(필드 행 리듬)**. dc의 24 → 26 정정(Combine 핸들 44/70/96, 출력 70 + 엣지 재정렬 — [v1.5 S2·S3] 브라우저 실측 stride **27**로 정정: 44/71/98, 출력 disc=첫 행). 구현이 실측해 정확값 확정. → `Node Editor.dc.html`.
- **Q8 [C-3]** `[screen]` Compute 다포트 = **현행 승인**(썸네일 없음 → 96 floor 없이 body minHeight만 포트 span 따라 확장). README §B에 규칙 명문화. 코드 변경 0.
- **Q9 [C-9]** `[screen]` Diagnostics 레벨 필터 = **누적 유지 + dc 라벨 정정**(선택지 1): `Info/Warn/Error/Debug` → `Info+/Warn+/Error+/Debug+`. 툴바 아이콘(⧉ ⌧ ✕) 정본, 카테고리 필터 유지. 코드 변경 0(시각/라벨만). → `Side Panel.dc.html`.
- **Q10 [B-7]** `[token]` standalone 웹폰트 번들 = **취소**(선택지 1). 번들 예산 2.1 KiB 여유 + woff2 산출물 부재 → `system-ui` 폴백 유지, 브랜드 타이포는 앱 UI 에만. README H 갱신.
- **Q10-b** `[token]` `fontBundle.standalone`(소비 불가 서술 문자열) **제거** → `theme.ts`에서 삭제(src 미포팅).
- **Q11 [A-8]** `[screen]` standalonePlayer.js 폴백 토큰화 = **현행 유지**(선택지 1). `?raw` 인라인이라 보간 지점 없음 + D6(폴백은 토큰 비의존)을 standalone 폴백에도 적용. 코드 변경 0.

### Changed
- `[token]` `theme.ts` — `fontBundle` 트리 제거(Q10/Q10-b). font.ui/mono 불변.
- `[screen]` `Command Palette.dc.html` — Shader 항목을 starter/Unlit 2종으로 분화 + `⚠ needs Mesh` 배지(Q1).
- `[screen]` `Node Editor.dc.html` — Combine stride 26 정정 + 엣지 재정렬(Q7·→v1.5 S3: 실측 27), 'New Shader' starter 데모 카드 신설(Q1-b).
- `[component]` `App Shell.dc.html` — 코드 도킹 헤더 'GLSL · ES 3.0' 메타 배지 박스화(Q4).
- `[screen]` `Side Panel.dc.html` — Diagnostics 레벨 필터 라벨 누적 표기(Q9).
- `[screen]` `README.md` — §도메인(포트 좌표계 Q6·stride Q7·metaAlign Q4)·§B(previewH 규칙 Q5·Compute Q8·starter Q1-b)·§E(Q9)·§F(Q1)·§H(Q10/Q11) 정정.
- `[screen]` **`Docking Prototype.dc.html` 핸드오프 폴더 포함** + `screens/14-docking-prototype.png` 추가. Q4 검증: 도킹 헤더 메타 배지(5N·4E/single/Fresnel/GLSL/6)가 이미 배지 박스형이라 정본과 일치 — 변경 0. 그 외 Q항목은 이 화면에 해당 UI 없음.

> ⚠ 신규 토큰 0 · breaking 코드 0(Q6는 문서 규칙 정정). 근사 없음.

---

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

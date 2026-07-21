# Handoff: ShaderPlayground — UI 전면 리디자인

> **버전 v2.2** · 2026-07-21 (이전: v2.1 2026-07-20). v2.2 = v2.1 구현(PR #73, `bacec2d`) 후속 확정·문서 정합(Z1~Z8) — 대부분 현행 승인. 채택: Auto 토글 2단계 flex-shrink(극한 폭에서만 라벨 ellipsis, Z1/Z3) · 스테이지 스트립 padding `0 12px` 확정(Z2) · 접힌 레일 세로 라벨=라이브 meta prop(Code "Code · GLSL · ES 3.0", Z4) · 레일 에러 dot=현재 연 셰이더 노드 스코프(Z5-b, 정정) · `--success-bright`는 X12로 diagnostics 소비처 0곳 확정(X13=index.css 라벨색 1건, Z6-b) · X13 subsume 각주/X10 line 보정(Z7·Z8). 신규 토큰 0. **버전 v2.1** · 2026-07-20 (이전: v2.0 2026-07-19). v2.1 = v2.0 구현 후속 확정·문서 정합(X1~X17) — 대부분 현행 승인. 채택: Code 자동 펌침 대상 `shader|compute`(X1) · Auto-open 라벨 "Auto: ON/OFF"+⌘K 도달 명령(X2) · 접힌 Code 레일 인테리어(세로 라벨+에러 dot+›, X17) · Diagnostics 오버레이 bg=`surface.rail`(X10) · File ▾ 메뉴(X8) · ＋More=⌘K 팔레트(X7) · `radius/shadow.skeletonStatus`→`floatingPill` 개명(X14). 신규 토큰 0. **버전 v2.0** · 2026-07-19 (이전: v1.8 2026-07-19). v2.0 = design chat V1에서 U2 미확정 → 기본 레이아웃 **v2.0으로 확정**(`breaking`). Code=**좌측 접기 컬럼(25%)**(접으면 34px 세로 레일, chevron 가로 `‹/›`), 중앙=**Node Editor(주역 그래프, 대형)**, 우측=col[Viewport / Inspector·Assets]. 노드 그래프 비중 확대(V3). Code 접기 가능화 + 스테일 `codeH` 제거(V2). localStorage=**조용한 폴백**(버전 불일치 시 무경고 기본 트리, V4). 컴팩트(<990px) 스택=**기능 우선순위 순**(Viewport→Node Editor→Code→Inspector·Assets, V5). 신규 토큰 6종(S26: accent.bright·semantic.successBright·nodeCategory.processBright/valueBright/outputBright·gradient.viewportActive/shaderSphere — 자세한 내용은 CHANGELOG S26). v1.8 = 패널 기본 레이아웃 재조정(design chat U2, `breaking`) — Code를 **좌측 컬럼(30%)**로, 우측 70%를 상하 2단(상: Viewport|Inspector·Assets / 하: Node Editor)으로. v1.7 = 패널 기본 레이아웃 전면 재설계(design chat U1, `breaking`) — Code를 하단 전폭 독에서 **우측 풀하이트 컬럼**으로, 좌측은 Viewport/Inspector 세로 스택, 중앙 Node Editor(Unreal/Blender 계열). R3 "첫 화면 불변" 폐기. v1.6 = v1.5 S5·S7 구현 착수 전 확답(design-request-v1.6.md T1~T6) — 이종 탭 병합에서 viewport·code 제외(T1) · 진단 스트립 범위(T3·T4) · 스테이지 탭 `.glsl` 표기(T5) · 오타 정정(T6). v1.5 = v1.4 도킹 구현 후속 정본 정정(design-request-v1.5.md S1~S25) 반영 — 정본 결함 정정(기본 트리 dir·stride 27·fontBundle) + 미정의 UX 코너 확정(이종 탭 병합·진단 오버레이). 신규 토큰 0. 자세한 변경 사유는 `CHANGELOG.md` 참조.

## Overview
ShaderPlayground는 브라우저에서 도는 **노드 기반 셰이더 플레이그라운드**다. 세 주역 — **① 노드 그래프(React Flow) · ② GLSL 코드 에디터(CodeMirror 6) · ③ 실시간 WebGL2 3D 뷰포트** — 가 한 화면에 공존하는 전문가용 크리에이티브 도구. 이 번들은 기존 임시 UI를 폐기하고 처음부터 다시 만든 하이파이 리디자인의 결과물이다.

**확정된 디자인 방향**
- 레이아웃 패러다임: **도킹형 패널** (고정 3분할이 아니라 이동/리사이즈/접기 가능한 도킹 패널).
- 무드: **절제된 프로툴** — Linear/VSCode 계열의 조용한 크롬, 네온/발광은 상태 표시에만 최소로.
- 테마: **다크 기본** (라이트는 향후 옵션 파생).
- 브랜드 액센트: 블루 `#3d9bff`.
- UI 라벨: 영어 / 문서: 한국어.
- 대상 창 크기: 데스크톱 전용, 최소 1280px.

## About the Design Files
**이 번들의 `.dc.html` / `.jsx` 파일은 HTML로 만든 디자인 레퍼런스**다 — 의도한 룩과 동작을 보여주는 프로토타입이지, 그대로 복사해 배포할 프로덕션 코드가 아니다. 작업의 본질은 **이 디자인을 대상 코드베이스(React 18 · @xyflow/react · CodeMirror 6 · WebGL2 · TypeScript)의 기존 패턴·라이브러리로 재구현**하는 것이다. 아래 §Codebase Mapping이 각 디자인 요소를 실제 스택의 어디에 매핑할지 안내한다.

`.dc.html` 파일은 사내 디자인 툴의 컴포넌트 포맷이다. 브라우저로 직접 열면 렌더되지만, 프레임워크는 무시하고 **인라인 스타일에 박힌 정확한 hex·px·폰트·radius 값만 참고**하면 된다. 로직은 각 파일 하단 `class Component extends DCLogic`의 `renderVals()`에 있다.

## Fidelity
**High-fidelity (hifi).** 최종 컬러·타이포·간격·인터랙션이 확정된 픽셀 단위 시안이다. 개발자는 코드베이스의 기존 라이브러리·패턴을 써서 이 UI를 픽셀에 가깝게 재현해야 한다. 색·간격·폰트는 아래 Design Tokens를 단일 출처(single source of truth)로 삼을 것.

---

## Design Tokens

> ⚠️ **값의 단일 출처는 코드다 — `theme.ts`.** 색·radius·shadow·모션의 정확한 hex/px는 이 문서에 복붙하지 않는다(둘이 어긋나는 drift 방지). 이 문서는 **토큰의 이름·구조·도메인 규칙**만 다루고, 값은 `theme.ts`(재구현 시 `src/theme.ts`로 이관)를 읽는다. 색 하나를 바꾸려면 `theme.ts`에서만 바꾸고, 컴포넌트는 `tokens.surface.panel`처럼 참조할 것. (필요하면 `cssVars()`로 `:root` 변수 파생.)

`theme.ts` 안의 토큰 그룹과 그 의미:

- **`surface.*`** — elevation 계층(app-darker → app → panel → card → input → hover), 도킹 헤더, 레일, 노드 카드 그라디언트, `letterbox`(Webcam/Video 프리뷰 레터박스 = app-darker). [D8]
- **`border.*`** — default / strong / stronger / header-divider / node(카드 외곽).
- **`accent.*`** — 브랜드 블루 default/hover/**bright(`#7dbcff`, hover보다 밝은 단계 — 틴트 배경 위 아이콘/텍스트·a:hover) [S26-B]**/active/muted.
- **`text.*`** — primary / **emphasis(순백 `#fff`, 인라인 rename 편집 중 상태) [B-2]** / bright-body / secondary / muted / disabled.
- **`semantic.*`** — success / **successBright(`#6fe3b8`, GPU active·Shader perf 배지) [S26-D]** / warning / error / info (토스트·상태바·에러 공용).
- **`nodeCategory.*`** — 노드 5 카테고리 색 + **밝은 변형 `sourceBright`(`#6fd6a3`) [B-3] / `processBright`(`#7dbcff`) · `valueBright`(`#e2ba57`) · `outputBright`(`#ee7fac`) [S26-D]** — 선택/호버/아이콘·배지용 lighten. 헤더 그라디언트 `linear-gradient(180deg, rgba(<hex>,0.22~0.30), rgba(<hex>,0.08~0.12))`, 아이콘 박스 `bg rgba(<hex>,0.2) / border 1px <hex>`. 매핑: Source=Mesh·Image·Webcam·Video·Audio / Process=Shader·Compute / Output=Output / Value=Param·Math·Swizzle·Combine / Container=Group.
- **`portFamily.*` + `portTypeToFamily`** — 포트 도메인 규칙(아래).
- **`syntax.*`** — CodeMirror 6 `HighlightStyle`용 GLSL 신택스 색.
- **`overlay.*`** — 캔버스/오버레이 알파 채널 명명 토큰: `gridDot`(노드 캔버스 도트 그리드), `scrim`(**GPU 칩[향후 몰입 모드] 공용** — 모달 백드롭은 `withAlpha(surface.appDarker, 0.72)` 별도, M7-U5) [D9·B-1], `track`(`rgba(255,255,255,0.18)` — Video 스크럽 등 중립 트랙/필 표면) [B-4]. white/black 채널을 코드에서 직접 파생하지 않고 이름으로 참조.
- **`gradient.*`** — `emptyState`(뷰포트 빈/오프 2종점 radial — 모든 empty/off 뷰포트 공용) [D10] / `viewportActive`(활성 navy 백드롭) / `shaderSphere`(프리뷰 구체 5종점) [S26-E].
- **`radius.*`**(카드/버튼/입력/칩/아이콘박스/패널 + `transportBar`(12)/`overlay`(9) 및 컴팩트 변형 `transportBarCompact`(11)/`overlayCompact`(8) [B-5] + `skeletonStatus`→`floatingPill`(10, 그래프 스켈레톤 상태 + 캔버스 add-node pill 공용) [B-6·X14]) · **`shadow.*`**(선택 링 · 에러 링 · warnRing[0.7 알파, errorRing과 패밀리 일관] · `skeletonStatus`[blur 24, B-6] · 포트 글로우) · **`motion.*`** · **`font.*`** — 나머지 스칼라 토큰.

### 도메인 규칙 (값이 아니라 "규칙"이라 문서로 남김)

**포트 = 형태(방향) × 색(타입 패밀리)** 이중 인코딩(색맹 대응):
- 방향은 **형태**로: input = **hollow ring**(`border: 2.5px solid <fam>; background: <node-bg>`), output = **solid disc**(`background: <fam>`, `box-shadow: shadow.portOutputGlow(fam)`).
- 타입은 **색 패밀리**로: 브리프 6종을 4패밀리로 묶음 — Resource(mesh·texture) / Scalar(float) / Vector(vec2·vec3·vec4) / Matrix(예약). 매핑은 `theme.ts`의 `portTypeToFamily`.
- 포트 지름 `PORT_DIAMETER` (카드 11 / 히어로 13). **엣지도 소스 포트 색을 따름**, stroke-width 2.5.

**포트 지오메트리** (React Flow Handle 배치 규칙 — `theme.ts` 하단 주석에 코드로도 명시):
- input x = `node.left`, output x = `node.left + node.width`, center y = `node.top + portTop + 5.5`.
- `portTop`은 노드 실제 높이(header 30 + pad 9 + previewH + pad 9) 안에 들 것. 엣지 path는 이 중심 좌표에 맞춘 베지어.
- **좌표계 주의 (Q6)**: dc는 카드별 첫 포트 y를 다르게 그리지만, 구현은 v1부터 `PORT_TOP_PAD` 하나로 통일한다. dc의 픽셀 상수를 구현에 **그대로 이식하지 말 것** — 포트 기하는 항상 **규칙**("본체가 포트 span을 덮도록 확장 · 꼬리 여유 2px · 96 floor")으로 전달하고 구현이 자기 좌표계에서 유도한다. dc 픽셀은 검수용 참고값이지 이식용 상수가 아니다.
- **포트 stride (Q7)**: uniform 구동 카드(Shader/Compute) = **stride 30**. 고정 arity + 입력 행이 있는 카드(Math/Combine 등) = **stride 27** — 포트가 자기 `.node-card__field` 행과 정렬돼야 하는 종속변수(브라우저 실측: content ~14 + padding 3+3 + border 1+1 = 22, + body gap 5 = **27**). dc의 24/26 표기는 실측 27로 정정(S2·S3).

**Typography**: UI = IBM Plex Sans(400/500/600/700), 코드/메타 = JetBrains Mono(400/500/600). 배지 8–11px · 본문 11–13px · 화면 제목 14–15px. 패널 헤더 라벨은 대문자 + letterSpacing 0.8~0.9px.

**Motion**: 90–150ms · `cubic-bezier(.2,.7,.3,1)`. 발광/펄스는 상태 표시(녹화·에러·선택·컴파일)에만, 상시 애니메이션 금지.

**Inspector 타입 배지 = 포트 패밀리 색** [D18]: Inspector의 `Output type` 배지 색은 `portTypeToFamily`를 따른다 — float/time → scalar(초록), vec2/3/4·color → vector(노랑). 그래프 포트 색과 항상 일치.

**도킹 헤더 메타 배지 정렬** [D13]: 메타 배지는 헤더 **우측**(spacer 뒤) 정렬이 정본. 공통 `DockPanelHeader`에 `metaAlign="end"` 옵션으로 지원. **배지 박스 정본(Q4)**: `metaAlign="end"`에서도 배경+보더 배지 박스를 유지한다(plain mono 텍스트 변형 없음 — 공통 컴포넌트 일관성 우선). App Shell의 'GLSL · ES 3.0'을 배지 박스로 정정.

**컴파일 에러 카운트** [D19]: CompileErrorOverlay는 **항상 단일(첫 실패) 노드 기준**으로 카운트를 표시. 여러 노드 동시 실패 시 StatusBar(전 노드 합산)와 수가 다를 수 있으며, 오버레이에 `(+N more)`를 병기해 차이를 설명한다.

**크래시 폴백(ErrorBoundary) 예외** [D6]: 앱 크래시 폴백 화면은 **의도적으로 토큰/웹폰트에 의존하지 않는다**(system-ui 폰트 + 중립 그레이). CSS 변수·웹폰트 주입이 실패한 상황에서도 렌더돼야 하므로 이 화면만 `theme.ts` 토큰 규칙에서 제외. 액센트 버튼 색만 `accent.default` 유지. '!' 아이콘 등 에러 액센트(`#f0555c`)는 `semantic.error`를 **빌드타임 보간**한 인라인 상수로 추적(런타임 CSS var 의존은 회피) [A-7].

---

## Screens / Views

각 화면의 픽셀 디테일은 대응 `.dc.html` 파일을 직접 열어 인라인 스타일을 참조. 아래는 레이아웃·목적·핵심 컴포넌트 요약이다.

### A. App Shell — `App Shell.dc.html` (1440×900)
- **목적**: 앱 프레임 전체 + **도킹 시스템의 단일 출처(SSoT)**. 룩앤필과 도킹 동작(트리 레이아웃·드래그/드롭·divider·collapse·maximize·탭 병합·＋Panel·Reset·diagnostics 오버레이)을 **한 파일에 구현** — 별도 Docking Prototype은 폐지되고 App Shell로 흡수됨(v2.0). 도킹 동작 규칙은 아래 §M 참조.
- **레이아웃**: 세로 flex. `Top toolbar 48px` → `content(flex:1)` → `status bar`. content는 도킹 영역(v2.0): **좌측 컬럼(25%) = Code Editor**(풀하이트, 접으면 34px 세로 레일) · **중앙 = Node Editor**(주역 그래프, 최대 면적) · **우측 컬럼 = col[Viewport(상) / Inspector·Assets(하)]**. 대략 25 / 45 / 30 비율. Code 컬럼 헤더의 접기 chevron은 가로 방향 `‹`(접기)/레일의 `›`(펼치기).
- **툴바 구성(좌→우)**: 브랜드 마크+워드마크 → 구분선 → **File ▾**(Load…/Import JSON/Export JSON/Snap PNG, X8) → Presets ▾ → ＋ Panel ▾(닫힌 패널 재도킹) → ↺ Reset layout → (flex spacer) → Undo/Redo → Record/GIF → Share/Export → Search ⌘K → ?. **노드 추가 팔레트는 툴바에서 제거** → Node Editor에 부착(아래).
- **노드 추가 팔레트 위치(W4 확정)**: **캔버스 상단 중앙 떠 있는 `floating` pill 바로 고정**(카테고리 색 타일+글리프 + `＋ More`). **⌘K CommandPalette는 유지** — 역할 분리: 플로팅 pill = 빠른 접근(자주 쓰는 카테고리 1클릭 생성), ⌘K = 전체 검색(모든 노드/프리셋/명령). `＋ More`는 **⌘K CommandPalette를 열어** 전체 노드를 브라우징한다(X7 확정 — 구 카테고리 오버플로 드롭다운 대체; 오버플로 노드 7종(Webcam/Video/Audio/Blend/Float/Color/Time)은 팔레트 명령에 전부 존재). **가림 처리**: pill이 상단 중앙을 상시 점유하므로 줌/패닝/미니맵과 겹치지 않게 캔버스 상단 여백을 두고, pill 뒤 노드는 패닝 오프셋으로 회피. header/rail 대안은 폐기 확정. (구현 영향: `AppToolbar.tsx` 재구성 + `NodeEditor` 오버레이 신설 + 팔레트 역할 정리.)
- **Code 자동 접기/펼침(W5 확정 — 옵션 토글)**: **Code 패널 헤더 우측 인라인 토글**(`⤢ Auto: ON`/`Auto: OFF`, 스테이지 탭 스트립 안 `margin-left:auto`)로 자동 구동을 켜고 끈다. **Auto(ON)**: 노드 선택이 항상 Code를 구동 — Shader 선택→좌측 Code 컬럼 자동 펼침, 비-Shader 노드→34px 세로 레일로 자동 접힘(선택이 수동보다 우선, W5-a). **Manual(OFF)**: 자동 구동 정지 — 수동 chevron 토글만 적용. 빈 캔버스 클릭(선택 해제)은 현 상태 유지, 다중 선택은 Shader 포함 시에만 펼침(ON 한정). 구현: `state.autoCode` 게이트 + `selectNode`, 접힘 상태는 code leaf `collapsed` 플래그. **자동 펌침 대상(X1)**: `shader | compute` — compute 노드도 CodeEditor 편집 대상이므로 Shader와 동일하게 펌침(그래야 compute 선택 시 편집할 패널이 숨는 모순 해소; 위 '비-Shader'는 Value/Container류 등 편집 소스 없는 노드). **라벨 규칙(X2)**: 기본 "Auto: ON/OFF"(구 "Auto-open:"에서 단축 — 34px/0 12px 스트립에서도 안 넘침); vertex+fragment 동시 에러로 dot 2개까지 뜼 때만 극한 폭에서 ellipsis. **ellipsis 발동 메커니즘(Z1/Z3, 2단계 flex-shrink)**: 브레드크럼(스테이지 탭) 래퍼 `flex-shrink:100000` → 폭 부족 시 이게 먼저 0까지 양보; 소진된 극한 폭에서만 토글 `flex-shrink:1; min-width:0`이 줄며 라벨 span이 `text-overflow:ellipsis`(라벨을 별도 span으로 래핑 — 버튼이 flex 컨테이너라 text-overflow를 버튼에 직접 못 걺). **도달성(X2)**: Code가 34px 레일로 접히면 토글도 숨으므로(접힘=비활성 시그널), 끔려면 먼저 펼치거나 ⌘K 팔레트의 `Toggle Code auto-open` 명령을 쓴다. **자동 구동 × 최대화(X3)**: 자동이 leaf를 접을 때 최대화는 **접히는 leaf 자신이 최대화 중일 때만** 해제(무관 패널 보존). **영속(X4)**: autoCode는 비영속 — 리로드마다 ON 복귀(activeStage 등 다른 UI 상태와 동일; 레이아웃 트리만 autoSave 영속). **스테이지 탭 스트립(X15)**: 전역 도킹 헤더 규격 재사용(34px · padding 0 12px), active = accent `border-top 2px`(v1.x 유지).
- **도킹 헤더 패턴** (모든 패널 공통): `⣿`(grab dots, `#454c55`) + [색 dot + 제목 + 탭 `✕`] 탭 pill(활성 = 하단 2px accent 언더라인) + 메타 배지(mono, 배경 `#1a1d22`, border `#20242a`, radius 4) + (spacer) + 박스형(22×22) 접기 chevron + `⤢`(최대화) + `✕`(닫기). **접기 chevron 방향은 패널 종류가 아니라 위치로 결정**(아래 R4 R-chevron 규칙) — row-split 좌측=`‹`, col-split 상단=`⌃` 등. 헤더 배경 `#101216`, 높이 34px, 하단 border `#17191e`. (좁은 컬럼에선 탭별 `✕`·메타 배지가 폭에 따라 생략될 수 있음.)
- **상태바**: 높이 ~34px, 배경 `#101216`, mono 11px. `● compiled`/`○ idle`(색=semantic) · 노드 수 · 엣지 수 · GPU ms · fps · u_time.

### B. Node Editor — `Node Editor.dc.html` (1320×860) ★핵심
- **목적**: 노드 그래프 캔버스. 시각 정체성의 절반.
- **캔버스**: 배경 `#0b0c0e` + 도트 그리드 `radial-gradient(rgba(255,255,255,0.045) 1px, transparent 1px)` / `background-size: 22px 22px`.
- **노드 카드 구조**: 헤더(아이콘 박스 + 타이틀 + 우측 메타칩) + 본체(썸네일 96px 또는 값/메타). Shader/Image 노드는 **라이브 썸네일**(96×96, radius 7, inset shadow). Compute는 썸네일 대신 메타(particles/dispatch/buffer). 포트 라벨은 카드 좌/우 **포트 rail**(폭 ~46px)에 두고 썸네일을 rail만큼 안쪽(`margin:0 46px`)으로 밀어 걹침 방지. 라벨 = 포트 타입 패밀리 색, mono 8.5px, max-width ~30–34px ellipsis. 라벨은 축약하지 않고 **raw 포트명**(`texture`, `color` 등) 그대로 사용(단축 매핑 없음) [C-2]. Output 노드는 좌 rail 입력 라벨(raw `texture`) + 본체 메타(`→ viewport`, **pane 문자 미노출** — 카드가 뷰포트 레이아웃을 모름)를 함께 표기, paddingLeft 46(raw 포트명 폭 확보). [D2·C-1·C-2]
- **포트 지오메트리 (구현 시 정밀도 필수)**: 포트 절대위치 `top`은 노드 실제 높이(header 30 + pad 9 + previewH + pad 9) 안에 들어와야 한다. 엣지 path는 포트 중심 좌표에 맞춘다: 입력 x = `node.left`, 출력 x = `node.left + node.width`; y = `node.top + portTop + 5.5`. React Flow에선 각 노드 타입의 Handle 위치를 이 규칙으로 배치. **다포트 Shader 카드**(uniform 수만큼 입력 증가)는 **stride 30 + 카드 본체(previewH) 동적 확장**. dc 실측 정본(Q5): 3-포트 previewH=**96**, 6-포트=**176**(시안은 우상단 'Noise' 데모). v1.2 README 공식 `max(96,(n−1)·30+56)`은 두 데이터포인트와 불일치라 **폐기** — 규칙으로만 유지("본체가 포트 span을 덮도록 확장 · 96 floor · 꼬리 여유 2px"), 픽셀 상수는 구현 좌표계(§도메인 규칙 Q6)에서 재유도. 실용 상한 ~10 포트. **Compute 다포트(Q8)**: 썸네일이 없어 96 floor 없이 body `minHeight`만 포트 span 따라 확장(포트가 적으면 kv 콘텐츠가 높이를 정함). **Math/Combine = stride 27(S2, 브라우저 실측)** — Combine 입력 핸들 44/71/98, 출력 disc는 첫 행(전 카드 공통 관례, 중앙 정렬 아님). **New Shader = starter 기본 출력(Q1-b)**: 갓 생성된 Shader는 `v_uv`만 소비하는 `starter.frag`로 태어나 mesh 유무 양쪽에 링크(= 에러 없이 valid). 기본 출력 비주얼 = `u_baseColor` 중앙 소프트 글로우 + 다크 비네트 + `u_time` 미세 변조(정본 레시피는 파일 우측 'New Shader' 데모 카드 참조). [C-3·C-7]
- **포트 라벨 + 노드 폭**: 포트 이름(label)은 **길어도 전부 노출** — 잘림(ellipsis)/`max-width` 클램프 금지, `white-space:nowrap`만. **노드 폭은 라벨에 맞춰 커진다**: 좌/우 레일 폭 = 각 변의 가장 긴 라벨을 수용(입력=좌측 정렬, 출력=우측 정렬), 카드 폭 = 좌레일 + 본문(썸네일 등) + 우레일 → 라벨이 길수록 노드가 넓어짐(참고: Unreal 블루프린트). 구현은 이를 콘텐츠 기반 폭으로(레일 = `max(기본, 라벨폭)`) 배선하고 엣지 좌표를 노드 실제 폭에서 계산. 색 = 포트 타입 패밀리.
- **엣지**: 베지어 곡선, stroke 2.5, 색=소스 포트 패밀리. 상태별 — 유효(실선), 무효(빨강 점선), 1:N 팬아웃(분기점 dot), 드래그 중(점선 애니메이션 `stroke-dashoffset`).
- **노드 상태**: default / selected(파랑 링) / multi-select(파랑 테두리+마퀴) / error(빨강 테두리+우상단 빨강 카운트 뱃지).
- **오버레이**: 미니맵(우하단, 168×112, 카테고리 색 미니 블록 + 뷰포트 프레임), 줌 컨트롤(좌하단, − / % / + / fit).
- **Webcam / Video 카드** [D8]: Source 카테고리. 프리뷰 16:9, 레터박스 배경 `surface.letterbox`. Webcam=라이브 프레임 자리 + 중앙 렌즈 링, Video=재생 글리프 + 하단 스크럽 바. 출력 포트 violet(resource).
- **Audio 파형** [D7]: 실시간 캔버스. 바 색 `nodeCategory.source`, 캔버스 배경 **투명**(카드 그라디언트 비침), 무음/권한대기 시 dim. canvas 2D는 CSS var 미지원 → `tokens.nodeCategory.source` 직접 import.
- **노드 rename** [D15]: 헤더 타이틀 **더블클릭 → 인라인 편집**(텍스트 필드 + 캐럿). Inspector `Name` 필드(§E)와 동일 값. pane 라벨·export 파일명이 이 이름을 사용.
- 13 노드 종류 · 5 카테고리 · 상태 · 엣지 종류 레퍼런스는 파일 하단 스트립 참조.

### C. Viewport — `Viewport.dc.html` (1320×860)
- **목적**: WebGL2 실시간 렌더 영역. Output 노드 개수에 따라 1/2/3/4 분할.
- **분할 지오메트리**: 1=단일 / 2=좌우(`1fr 1fr`) / 3=2+1(상단 2, 하단 full-width) / 4=2×2. `display:grid` + `gap:1px` + `background:#17191e`(분할선).
- **셰이더 결과물은 손 SVG 금지** — 다층 radial/conic-gradient로 표현(디자인 레퍼런스에서). **실제 구현 시엔 이 자리에 진짜 WebGL 캔버스**가 들어간다. gradient는 자리표시일 뿐.
- **pane 오버레이**: 좌상단 라벨(A/B/C/D + 이름), 우상단 GPU ms 뱃지(success 색), 좌하단 해상도, 스캔라인 오버레이.
- **하단 트랜스포트 바**(중앙 플로팅, 배경 `rgba(11,12,14,0.86)` + blur): **⏮ reset-time(u_time=0)** → 재생/정지 → u_time 스크럽 → 배속(0.25~4×) → 구분선 → FOV 슬라이더 → Reset(카메라). [D14]
- **빈 상태**: Output 미연결 시 중앙 아이콘 + "No Output connected" + 3단계 온보딩 힌트(⌘K → Add Output …). 배경 = `gradient.emptyState`(2종점 radial 토큰). [D10]
- **좁은 도킹 폭(≤990px)** [D3·C-6]: 트랜스포트 바 **컴팩트 변형** — 스크럽·FOV 슬라이더를 스텝퍼 버튼(FOV 탭→프리셋 순환)으로 축약, ⏮/▶/시간/배속/reset만 유지. 하단 행 pane 해상도 캡션은 컴팩트 바 위로 오프셋. 임계값을 700→**990px로 상향**해 700~989px 구간에서 풀 바가 하단 pane 캡션과 겹치던 문제 해소(컴팩트 티어가 넓은 구간 커버). 컴팩트 바/버튼 radius = `radius.transportBarCompact`(11)/`overlayCompact`(8) [B-5]. FOV 스텝퍼는 dc가 `indexOf`(비프리셋서 -1) 동작이 원 의도 — 구현의 최근접 순환과 다르나 dc 유지 [A-4].
- **몰입/VJ 모드**: 전체 스크림 + 최소 트랜스포트 + 녹화 준비 표시(Esc 종료).

### D. Code Editor — `Code Editor.dc.html` (1320×860)
- **목적**: 선택 셰이더 노드의 GLSL 편집. VSCode 수준.
- **탭**: `vertex` / `fragment` 전환, 에러 시 탭 헤더에 빨강 점.
- **거터**: 라인 번호(muted), 에러 라인 표시.
- **인라인**: 에러 라인 빨강 밑줄 + hover 메시지, 자동완성 팝업, 심볼 hover 툴팁, 시맨틱 하이라이팅(위 code syntax 토큰).
- **다중 선택 배너**: 노드 2+ 선택 시 "여러 개 선택됨" 상태.
- **구현**: CodeMirror 6. 위 syntax 색으로 `HighlightStyle` 커스텀, 거터/툴팁 크롬만 테마. 에디터 자체 재발명 금지.

### E. Side Panel — `Side Panel.dc.html` (1320×860)
- **목적**: **Inspector / Assets 2탭.** 선택 노드에 따라 Inspector 내용이 완전히 바뀜. (problems·diagnostics는 Side Panel 탭이 아니라 App Shell 상태바 오버레이로 단일화 — R5·S6·S7·X12·Y1.)
- **Inspector**: uniform 자동 컨트롤 — `float`→슬라이더, `vec2/3/4`→다축 슬라이더, 색→컬러 피커, `bool`→토글. 노드 종류별 8종 인스펙터. 상단 공통 **`Name` 필드**로 노드 rename(그래프 더블클릭 인라인과 동일 값)[D15]. **모든 노드 종류(param·group 포함)가 이 공통 Name 하나로 rename** — param의 Label 필드·group의 Group label 필드는 제거해 단일 소스화 [A-1·A-2]. `Output type` 배지 색 = 포트 패밀리[D18].
- **Assets**: 썸네일 그리드, 드래그&드롭 임포트, "노드로 추가".
- **Problems / Diagnostics**: **Side Panel 탭 아님(Y1 정정)** — 상세 스펙은 §M 상태바 오버레이 참조. Problems=상태바 `⚠ N problems` 클릭 → 172px 오버레이(에러 클릭 → 노드 선택+코드 점프). Diagnostics=상태바 토글 → 오버레이(메트릭 스트립 + 레벨 로그).
- **Diagnostics(상태바 오버레이 — Side Panel 탭 아님, R5)** [D1]: 런타임 진단 — 단일 행 메트릭 스트립(GPU/Frame/Draws/Shaders) + 레벨 로그. `Shaders`는 실제 GL 링크 카운터가 없어 **error 진단 없는 shader/compute 노드 수 프록시**("N compiled") [A-6]. 레벨 태그 색(dc 실측값이 정본) = **INFO `accent.hover` · WARN `warning` · ERROR `error` · DEBUG `text.secondary`** [A-5]. 로그 행 = **카테고리 접두**(gl/shader/mem, `text.muted`) + 레벨 태그 + 메시지 + 시간. 상단 **툴바**(Copy/Clear/Close, 24×24 아이콘 `⧉ ⌧ ✕`) + **레벨 필터**(All/Info+/Warn+/Error+/Debug+, All 기본) [C-9]. **필터 의미 = 누적(Q9)**: `Info+` = info 이상 전부(구현 `<select>` 누적 의미와 일치) — dc 라벨에 `+`를 붙여 '정확히 그 레벨만'으로 오독되지 않게 정정. 카테고리 필터(gl/shader/mem)는 기존 기능이라 유지. 오버레이 배경 = surface.rail(X10). (Problems=컴파일 에러 목록과 별개.)
- 폼 컨트롤 라이브러리(슬라이더·다축·컬러·토글·셀렉트·숫자입력)가 여기 대량 등장.

### F. Command Palette — `Command Palette.dc.html` (1440×900)
- ⌘K 퍼지 검색 오버레이(Linear/Raycast 스타일). 노드 추가·프리셋·명령 실행. 결과 그룹핑 + 키보드 네비 + 우측 단축키 힌트.
- **Shader 템플릿 항목 (Q1)**: `Shader`(starter — mesh 유무 양쪽 링크, 보조텍스트 "links with or without a mesh") + `Shader: Unlit`(surface normals 사용 → **`⚠ needs Mesh` 앰버 배지** + 보조텍스트). Unlit을 mesh 없이 만들면 링크 에러가 나므로 팔레트에서 미리 필요조건을 알린다. 배지 = `warning` 패밀리 알파(bg 0.12 / border 0.35).

### G. Welcome — `Welcome.dc.html` (1440×900)
- 첫 진입 화면. 데모 그래프/프리셋 진입점 + 온보딩.

### H. Export & Share — `Export & Share.dc.html` (1440×900)
- 단일 HTML export, URL 공유 인코딩, 녹화(WebM/GIF) 흐름.
- **파일명 규칙** [D16·C-10·C-11]: export 파일명 = `{base}-{timestamp}.{ext}`(예: `untitled-project-20260716-1532.html`) — 덮어쓰기 방지. **앱에 projectTitle 상태 없음** → `{base}`는 HTML 다이얼로그의 **편집형 File name 필드**에서 옴(퀵 저장·비HTML 경로는 `DEFAULT_EXPORT_BASE`=`untitled-project` 고정) [C-10·C-11a]. timestamp는 다운로드 시점 확정(다이얼로그 프리뷰엔 `-{timestamp}.html` 자리표시). 완료 카드·토스트 표시명 = 실제 저장명. **성공 토스트 = `Exported {name} · {size}`**(HTML·GIF·WebM 동일 포맷, 크기 표기 포함) [C-11b].
- **standalone HTML 산출물** [D5·B-7·A-8]: export되어 나가는 HTML은 앱 토큰 그대로 이식 — 배경 `surface.app`, 텍스트 `text.primary`, badge 배경=`overlay.scrim`, 링크=`text.primary`, `#canvas` 배경=`surface.letterbox`(근사 3건 승인). **웹폰트 번들은 취소(Q10)** — 번들 예산(385 KiB, 여유 ~2.1 KiB) 충돌 + woff2 산출물 부재로, standalone은 `system-ui` 폴백을 유지하고 브랜드 타이포는 앱 UI 에만 로드(export 에 싣지 않음). `fontBundle` 토큰은 제거(Q10-b). 폴백 에러 div의 `color:white`는 **현행 유지(Q11)** — `?raw` 인라인이라 보간 지점이 없고, D6('폴백은 토큰 비의존')을 standalone 폴백에도 그대로 적용(크래시 폴백에 빌드 파이프라인 의존을 늘리지 않음).

### I. System States — `System States.dc.html` (1440×900)
- 좌측 스위처 레일 + 공유 앱 크롬으로 **8개** 상태 시연: Empty(빈 그래프/빈 뷰포트) · Loading(스피너·진행바·스켈레톤 시머) · Permission(카메라/마이크 권한) · Error(컴파일 에러 오버레이 / WebGL2 unavailable 블로킹 / **App crashed 폴백**). 상태별로 노드 그래프·엣지·상태바·툴바가 문맥에 맞게 변함.
- **크래시 폴백** [D6]: 8번째 상태. ErrorBoundary 폴백 — 전체 앱을 덮는 오버레이, system-ui 폰트 + 중립 그레이(토큰 예외, 위 도메인 규칙). Reload / Copy error CTA.
- **스켈레톤 인디케이터** [D4]: "Restoring graph…"는 캔버스 **중앙**에 플로팅(좌하단 줌 컨트롤과 충돌 회피).
- **권한 차단 링** [D12]: warnRing = `rgba(245,177,61,0.7)`(errorRing과 0.7 알파 패밀리 일관).

### J. Foundations — `Foundations.dc.html`
- 컬러/타이포/노드·포트 색/컴포넌트 토큰 레퍼런스 시트. 위 Design Tokens의 시각적 원본.

### K. Brand — `Brand.dc.html`, `Icon & Social.dc.html` (1180×900)
- 로고/워드마크/앱 아이콘/파비콘 시스템 + 사용 규칙. 실파일은 `brand/` 폴더 참조.

### M. 도킹 동작 (App Shell 내장 — v2.0 SSoT)
- **위치**: 도킹 레이아웃/드래그·드롭/탭 병합/divider/collapse/maximize/＋Panel/Reset/diagnostics 오버레이는 **`App Shell.dc.html`에 내장**되어 있다(별도 `Docking Prototype.dc.html`은 v2.0에서 폐지·흡수). 아래는 App Shell 로직 클래스가 구현하는 도킹 동작 규칙(R1~R12)이다. 각 leaf 본문은 §B~§E의 리치 패널(Node Editor·Viewport·Inspector·Code·Assets)을 렌더한다.
- **모델**: 트리 기반 도크 레이아웃(`split`{dir,ratio,a,b} / `leaf`{tabs[],active,collapsed}). BW×BH 영역을 재귀 배치 + divider 계산.
- **기본 트리 = App Shell 첫 화면(R2 · v2.0)**: `row 0.25 [ leaf(code) | row 0.60 [ leaf(nodeEditor) | col 0.52 [viewport / leaf(inspector,assets)] ] ]` — **좌 컬럼(25%)**=Code(풀하이트, 접기 가능), **중앙**=Node Editor(주역 그래프, 최대 면적), **우 컬럼**=col[Viewport(상) / Inspector·Assets(하)]. 노드 그래프를 화면 주역으로 중앙 대형 배치하고(V3), 편집(Code)을 좌측 읽기 흐름 기준으로, 미리보기(Viewport)·속성(Inspector)을 우측 세로 스택으로. **v1.7 U1(3-컬럼)·v1.8 U2(우하단 노드) 모두 폐기**. `breaking`: `layoutStore`/`createDefaultDockTree` 기본값 교체 + 기존 저장 레이아웃 조용한 폴백(V4) 필요.
- **드래그**: ⣿(헤더) → 패널 전체(모든 탭) 이동 · 개별 탭 드래그 → 그 탭만 분리 이동. `pointer*` 이벤트(마우스+터치/펜, R10). 드래그 중에만 커서를 따라다니는 **트랜지언트 고스트** 1개(release 시 반드시 도킹).
- **플로팅 없음 확정(R1)**: 상주 플로팅 창 상태 없음. 이전 번들의 float 리사이즈/다중창/`tabInFloat` 코드는 **제거**됨 — 참조·구현 금지. Empty state 카피 = "No panels docked — add one with ＋ Panel".
- **드롭 규칙**: 영역 가장자리(좌/우/상/하, ~22%) → 스플릿 · 헤더 탭바(상단 34px)·중앙·그 외 → 탭 병합 · 셸 바깥 가장자리(42px 밴드) → 전체 레이아웃 가장자리 도킹. 빈 곳/타깃 없음 → 최근접(첫) 패널로 병합. **T1 차단 폴백(X5)**: viewport/code 대상 center 드롭이 이종 병합 금지로 차단되면 원본 트리 반환(패널 유실, R1 위반) 대신 `zone:right` 동일 기하 스플릿(대상 60% / 신규 40%)으로 폴백(커서 위치 미고려). **＋Panel 재도킹 타깃(X6)**: in-order 첫 `canMerge` 통과 leaf에 탭 병합(v2.0엔 nodeEditor), 없으면 outer-right 스플릿.
- **접기/최대화(R4)**: leaf 단위 속성. 접힌 leaf = split 방향으로 고정 34px strip(divider 비활성). **접기 chevron 방향 = 위치 기반(종류 무관)**: 부모 split dir + 그 leaf가 a/b 어느 쪽 자식인지로 결정 — row-a `‹`(열림)/`›`(접힘), row-b `›`/`‹`, col-a(상) `⌃`/`⌄`, col-b(하) `⌄`/`⌃`. 도킹으로 위치가 바뀌면 chevron도 재계산된다. 최대화 = 해당 leaf를 도크 body 전체로 오버레이(⤢↔⤡). 기존 `collapsed`/`maximized` 상태 + 접기 회귀 E2E 가드 보존. 접힌 leaf를 최대화하면 접힘이 강제 해제된다(헤더만 남는 빈 화면 방지, S9). **접힌 34px 레일 인테리어(X17-b 채택)**: ⣿ grip + 패널 dot + 세로 라벨(writing-mode vertical, `제목 · meta` — meta는 **각 패널이 헤더 배지에 넘기는 라이브 meta prop 그대로**, 단일 출처. Code는 "Code · GLSL · ES 3.0"으로 dc 예시보다 길어져 34px 폭에서 세로로 잘릴 수 있음, Z4-a) + (에러 시) 빨강 에러 dot + 위치 기반 펌침 chevron. 접힌 상태에서도 패널 정체성과 컴파일 에러를 보여준다. **에러 dot 판정 = 그 패널이 현재 보여주는 대상의 에러만**(Code는 에디터가 현재 연 셰이더 노드의 진단, 그래프 전체 아님 — 상태바 합산 카운트와 별개, Z5-b). 툴팁은 동적("N error in ‹file›"). Code가 v2.0에서 처음 이 레일로 접히게 되어 정식 채택.
- **이종 탭 병합 = 완전한 도킹 단위(S5·T1)**: side-panel류(inspector·assets·problems·diagnostics류)는 한 leaf에 이종 탭으로 자유 병합 가능하고, active 탭을 바꾸면 **본문도 그 kind로 전환**된다(진짜 도킹 UX). 단 **viewport·code는 이종 병합에서 제외**(항상 자기 leaf 유지) — active 전환마다 WebGL/CodeMirror 재초기화 플래시가 캐주얼 클릭 비용으로 격상되는 것을 피함(T1 선택지 b, 번들 경량). 드롭 규칙은 같은 kind 또는 side-panel류끼리만 탭 병합 허용. 구현: `leafPanelKind`를 `leaf.active` 기준, `DockLeafView`를 active 탭 kind 렌더로 배선.
- **탭별 닫기(R6)**: 헤더 우측 `✕` = **패널 전체** 닫기. 탭마다 작은 `✕`(hover 시 강조) = 그 탭만 닫기 — 비활성 탭도 활성화 없이 닫힘.
- **탭 오버플로(R8)**: 탭 4개↑이면 탭바 가로 스크롤(스크롤바 숨김) + 우측 페이드 마스크. 34px 헤더 높이 불변.
- **최소 크기(R7)**: leaf 최소 `240×160`. divider 드래그가 어느 쪽도 이 픽셀값 아래로 못 가게 클램프(비율 0.15~0.85 클램프에 픽셀 하한을 겹침).
- **problems / diagnostics(R5)**: 도킹 5종(nodeEditor·viewport·inspector·code·assets)에 **포함 안 됨**. Diagnostics는 `debugUiStore.open` 단일 출처 유지 — 상태바 `◨ Diagnostics` 토글로 **하단 트랜지언트 오버레이**(172px)로 열림, 탭 아님. 오버레이는 진단 컨트롤(레벨 필터·Copy·Clear)을 **한 곳에만** 두고(중복 제거, S7) ✕로 닫는다 — 실구현은 호스팅한 DiagnosticsPanel 내부 툴바가 컨트롤을 제공하므로 오버레이 크롬은 중복하지 않는다. 172px에서는 전체 메트릭 카드 대신 **단일 행 메트릭 스트립**(GPU/Frame/Draws/Shaders, ~26px)을 두어 로그가 초기 뷰에 보이게 한다(S7); 전체 메트릭 카드는 Side Panel Diagnostics 탭에만. **메트릭 스트립은 diagnostics 오버레이 전용 — problems 오버레이엔 없음(T4).** **오버레이 배경(X10)**: 본문·스트립 모두 `surface.rail`(rail 톤 통일 — 의도적). **스트립 값(X11)**: 카드와 동일 소스 공유(GPU=renderer 문자열, Frame=16.7 ms·60 fps) — 진짜 GPU-time은 GL 타이머 쿼리 신규 계측(스코프 밖). 라벨은 카드 "Draw calls"/스트립 "Draws"로 각자 유지. **2×2 메트릭 카드(X12)**: R5로 Side Panel diagnostics 탭이 없어 렌더 호스트가 없음 → **카드 제거·스트립 단일화**(카드 컴포넌트/분기 + 전용 단위 테스트 정리). 오버레이 메트릭 스트립이 유일 경로. Problems는 상태바 카운트(`⚠ N problems`)로 표시하고, 카운트 클릭 시 동일한 172px 하단 오버레이로 목록을 연다(에러 클릭 → 노드 선택 + 코드 점프, 0건 카피 "no problems", S6). 레벨 필터 라벨 = `Info+/Warn+/Error+/Debug+`(Q9).
- **영속화(R9)**: 레이아웃은 **localStorage**(사용자 작업 환경, 프로젝트 파일 아님). **마이그레이션 = 조용한 폴백(V4)**: localStorage 스키마 **버전 키**를 신설하고, 버전 불일치(옛 저장 레이아웃) 시 **경고/배너 없이** v2.0 기본 트리로 폴백한다. `↺ Reset layout` = 언제든 기본 트리로 복귀(수동). 프로젝트 `.json`에는 미포함.
- **반응형(R11)**: 비율은 이식, 픽셀 밴드/존은 **규칙**으로(Q6 정신). 컴팩트(<990px, C-6)에서는 **트리 도킹 비활성** → 고정 스택 폴백. 고정 스택 = leaf 높이 46vh(min 200px) + 세로 스크롤(S8). **스택 순서 = 기능 우선순위 순(V5): Viewport → Node Editor → Code → Inspector·Assets.** dc는 1440×826 고정 레퍼런스.
- **크롬**: 도킹 헤더는 A. App Shell 문법 그대로 — 높이 34, ⣿ `text.disabled`·13px, 메타 배지 박스형(surface.card + border.default), 탭은 E. Side Panel 밑줄형(active `border-bottom 2px accent`).
- **패널 dot(R12)**: dot 5색(accent/source/value/resource/vector)은 **장식적 패널 식별자** — 노드 카테고리/포트 타입 의미축과 무관. 신규 토큰 없이 기존 값 재사용, "의미 아님"을 규칙으로 명시.
- 신규 토큰 없음(전부 기존 theme.ts).

### L. Motion Prototype — `Motion - Connect.dc.html` + `node-connect.jsx`
- **핵심 여정 애니메이션**: 포트 드래그 → 호환 입력 팬아웃 하이라이트(비호환 dim) → 엣지 스냅 → 뷰포트 라이브 렌더. 8.5초 타임라인, 재생/스크럽 컨트롤. 마이크로 인터랙션 타이밍·이징의 구현 기준.

---

## Interactions & Behavior

- **노드 연결**: 출력 포트에서 드래그 시작 → 드래그 중 **호환 입력 포트 하이라이트(펄스 링), 비호환 포트 dim(opacity ~0.4)** → 타입 일치 입력에 드롭 → 스냅(링 확장 펄스) → 엣지 실선 확정 → 뷰포트 갱신. 타이밍은 Motion Prototype 참조.
- **선택**: 클릭=단일(파랑 링), 드래그 마퀴/Shift=다중(파랑 테두리 + "N nodes selected" 배지 + G로 그룹).
- **엣지 드래그**: 점선 + `stroke-dashoffset` 애니메이션, 커서 옆 타입 칩(예: `vec4`).
- **코드→뷰포트**: 코드 편집 1~2프레임 내 뷰포트 반영(디자인상: 컴파일 성공 시 status `● compiled` success 색).
- **uniform→인스펙터**: `uniform float u_x;` 추가 → 인스펙터에 슬라이더 자동 생성.
- **녹화 중**: 빨강 강조 + 펄스(`spPulse`/`vpRec` keyframe) + 타이머. GIF는 진행률.
- **에러**: 노드 우상단 빨강 카운트 뱃지 + 코드 밑줄 + Problems 목록 동기화.
- **모션 원칙**: 90–150ms, `cubic-bezier(.2,.7,.3,1)`. 상시 애니메이션 금지.

## State Management (재구현 시 필요한 상태)
- 그래프: nodes[], edges[], selection(single/multi), 드래그 중 연결(sourcePort, 호환 타입 집합), 그룹.
- 뷰포트: split(1–4), play, u_time, speed, fov, gpuTimers on/off, immersive, empty.
- 코드: activeStage(vertex/fragment), 노드별 소스, 진단(diagnostics) 목록.
- 사이드 패널: activeTab(inspector/assets/problems), 선택 노드의 uniform 값들.
- 앱: 컴파일 상태, 녹화 상태, 세션 복구.

## Codebase Mapping (재구현 가이드)
- **토큰** → `theme.ts` 또는 `:root` CSS 변수. surface/border/accent/text/semantic/node-cat/port-family 전부 이관 후 참조.
- **노드/엣지** → `@xyflow/react`의 커스텀 `nodeTypes`/`edgeTypes`. 카테고리별 노드 컴포넌트, Handle = 포트(형태=방향, className=패밀리 색). 라이브러리의 줌/팬/연결 히트영역은 존중.
- **포트 히트영역**: Handle 위치를 위 포트 지오메트리 규칙으로 배치. 색맹 대응 위해 형태(ring/disc) 이중 인코딩 유지.
- **코드 하이라이팅** → CodeMirror 6 `HighlightStyle.define([...])`에 위 syntax 색. 거터/툴팁/린터(diagnostics) 크롬만 커스텀.
- **뷰포트** → 실제 WebGL2 캔버스. gradient 배경은 자리표시자이니 삭제하고 GL 캔버스를 grid cell에 배치. 오버레이(라벨·ms·트랜스포트)만 디자인대로 DOM.
- **폼 컨트롤** → 슬라이더/다축/컬러/토글/셀렉트/숫자입력 공통 컴포넌트 세트로 추출(인스펙터 재사용).
- **모션** → 위 duration/easing 상수를 트랜지션 유틸로. 상태 펄스는 keyframe(`spPulse` 등, 파일 helmet 참조).

## Assets
- `brand/` 폴더에 실파일 세트: 파비콘(16/32/48/ico), 앱 아이콘(16/32/180/512), apple-touch-icon, PWA 아이콘(192/512), 로고 마크(accent/white, 512/1024), OG 카드(1200×630), `safari-pinned-tab.svg`, `site.webmanifest`.
- 폰트: IBM Plex Sans + JetBrains Mono (Google Fonts, OFL 라이선스). 코드베이스에 self-host 권장.
- 노드 글리프/아이콘: 현재 유니코드 심볼(◆◎▣∿⌗∑⇄⊕ 등)로 표현. 프로덕션에선 일관된 커스텀/선정 아이콘 세트로 교체 권장.

## Files (이 번들)
- `theme.ts` ★ — **이 번들의 토큰 단일 출처**(색/타이포/radius/shadow/모션 + 포트 지오메트리 규칙). 재구현 리포에서는 `src/theme.ts`로 이관되어 **런타임 값의 출처는 저장소의 `src/theme.ts`**가 된다. [D20]
- `CHANGELOG.md` — 디자인 변경 이력(왜 바뀌었는지).
- `screens/*.png` — 각 화면 스냅샷(시각 회귀 diff용).
- `App Shell.dc.html` · `Node Editor.dc.html` · `Viewport.dc.html` · `Code Editor.dc.html` · `Side Panel.dc.html` · `Command Palette.dc.html` · `Welcome.dc.html` · `Export & Share.dc.html` · `System States.dc.html` · `Foundations.dc.html` · `Brand.dc.html` · `Icon & Social.dc.html`
- `Motion - Connect.dc.html` + `node-connect.jsx` (모션 프로토타입)
- `animations.jsx`, `support.js` (레퍼런스 런타임 — 브라우저에서 파일을 직접 열어보기 위한 것. 재구현엔 불필요)
- `brand/` (브랜드 실파일)
- `DESIGN_BRIEF.md` (원본 요청서)

각 `.dc.html`은 브라우저로 바로 열어 인터랙션 확인 가능. 정확한 값은 인라인 스타일을 읽을 것.

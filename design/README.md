# Handoff: ShaderPlayground — UI 전면 리디자인

> **버전 v1.2** · 2026-07-16 (이전: v1.1 2026-07-14). v1.2 = v1.1 구현 중 나온 정본 확정 요청(design-request.md A/B/C 27건) 반영. 자세한 변경 사유는 `CHANGELOG.md` 참조.

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
- **`accent.*`** — 브랜드 블루 default/hover/active/muted.
- **`text.*`** — primary / **emphasis(순백 `#fff`, 인라인 rename 편집 중 상태) [B-2]** / bright-body / secondary / muted / disabled.
- **`semantic.*`** — success / warning / error / info (토스트·상태바·에러 공용).
- **`nodeCategory.*`** — 노드 5 카테고리 색 + **`sourceBright`(`#6fd6a3`, source의 밝은 변형 — Webcam 렌즈 링 등) [B-3]**. 헤더 그라디언트 `linear-gradient(180deg, rgba(<hex>,0.22~0.30), rgba(<hex>,0.08~0.12))`, 아이콘 박스 `bg rgba(<hex>,0.2) / border 1px <hex>`. 매핑: Source=Mesh·Image·Webcam·Video·Audio / Process=Shader·Compute / Output=Output / Value=Param·Math·Swizzle·Combine / Container=Group.
- **`portFamily.*` + `portTypeToFamily`** — 포트 도메인 규칙(아래).
- **`syntax.*`** — CodeMirror 6 `HighlightStyle`용 GLSL 신택스 색.
- **`overlay.*`** — 캔버스/오버레이 알파 채널 명명 토큰: `gridDot`(노드 캔버스 도트 그리드), `scrim`(**GPU 칩[향후 몰입 모드] 공용** — 모달 백드롭은 `withAlpha(surface.appDarker, 0.72)` 별도, M7-U5) [D9·B-1], `track`(`rgba(255,255,255,0.18)` — Video 스크럽 등 중립 트랙/필 표면) [B-4]. white/black 채널을 코드에서 직접 파생하지 않고 이름으로 참조.
- **`gradient.emptyState`** — 뷰포트 빈 상태 2종점 radial 그라디언트. [D10]
- **`radius.*`**(카드/버튼/입력/칩/아이콘박스/패널 + `transportBar`(12)/`overlay`(9) 및 컴팩트 변형 `transportBarCompact`(11)/`overlayCompact`(8) [B-5] + `skeletonStatus`(10) [B-6]) · **`shadow.*`**(선택 링 · 에러 링 · warnRing[0.7 알파, errorRing과 패밀리 일관] · `skeletonStatus`[blur 24, B-6] · 포트 글로우) · **`motion.*`** · **`font.*`**(+`fontBundle.standalone` = standalone export용 data-URI 웹폰트 [B-7]) — 나머지 스칼라 토큰.

### 도메인 규칙 (값이 아니라 "규칙"이라 문서로 남김)

**포트 = 형태(방향) × 색(타입 패밀리)** 이중 인코딩(색맹 대응):
- 방향은 **형태**로: input = **hollow ring**(`border: 2.5px solid <fam>; background: <node-bg>`), output = **solid disc**(`background: <fam>`, `box-shadow: shadow.portOutputGlow(fam)`).
- 타입은 **색 패밀리**로: 브리프 6종을 4패밀리로 묶음 — Resource(mesh·texture) / Scalar(float) / Vector(vec2·vec3·vec4) / Matrix(예약). 매핑은 `theme.ts`의 `portTypeToFamily`.
- 포트 지름 `PORT_DIAMETER` (카드 11 / 히어로 13). **엣지도 소스 포트 색을 따름**, stroke-width 2.5.

**포트 지오메트리** (React Flow Handle 배치 규칙 — `theme.ts` 하단 주석에 코드로도 명시):
- input x = `node.left`, output x = `node.left + node.width`, center y = `node.top + portTop + 5.5`.
- `portTop`은 노드 실제 높이(header 30 + pad 9 + previewH + pad 9) 안에 들 것. 엣지 path는 이 중심 좌표에 맞춘 베지어.

**Typography**: UI = IBM Plex Sans(400/500/600/700), 코드/메타 = JetBrains Mono(400/500/600). 배지 8–11px · 본문 11–13px · 화면 제목 14–15px. 패널 헤더 라벨은 대문자 + letterSpacing 0.8~0.9px.

**Motion**: 90–150ms · `cubic-bezier(.2,.7,.3,1)`. 발광/펄스는 상태 표시(녹화·에러·선택·컴파일)에만, 상시 애니메이션 금지.

**Inspector 타입 배지 = 포트 패밀리 색** [D18]: Inspector의 `Output type` 배지 색은 `portTypeToFamily`를 따른다 — float/time → scalar(초록), vec2/3/4·color → vector(노랑). 그래프 포트 색과 항상 일치.

**도킹 헤더 메타 배지 정렬** [D13]: 메타 배지는 헤더 **우측**(spacer 뒤) 정렬이 정본. 공통 `DockPanelHeader`에 `metaAlign="end"` 옵션으로 지원.

**컴파일 에러 카운트** [D19]: CompileErrorOverlay는 **항상 단일(첫 실패) 노드 기준**으로 카운트를 표시. 여러 노드 동시 실패 시 StatusBar(전 노드 합산)와 수가 다를 수 있으며, 오버레이에 `(+N more)`를 병기해 차이를 설명한다.

**크래시 폴백(ErrorBoundary) 예외** [D6]: 앱 크래시 폴백 화면은 **의도적으로 토큰/웹폰트에 의존하지 않는다**(system-ui 폰트 + 중립 그레이). CSS 변수·웹폰트 주입이 실패한 상황에서도 렌더돼야 하므로 이 화면만 `theme.ts` 토큰 규칙에서 제외. 액센트 버튼 색만 `accent.default` 유지. '!' 아이콘 등 에러 액센트(`#f0555c`)는 `semantic.error`를 **빌드타임 보간**한 인라인 상수로 추적(런타임 CSS var 의존은 회피) [A-7].

---

## Screens / Views

각 화면의 픽셀 디테일은 대응 `.dc.html` 파일을 직접 열어 인라인 스타일을 참조. 아래는 레이아웃·목적·핵심 컴포넌트 요약이다.

### A. App Shell — `App Shell.dc.html` (1440×900)
- **목적**: 앱 프레임 전체. 툴바 + 도킹 패널 배치의 기준.
- **레이아웃**: 세로 flex. `Top toolbar 48px` → `content(flex:1)` → `status bar`. content는 도킹 영역: 좌측 Node Editor, 우측 상단 Viewport, 우측 하단 Side Panel, 하단 Code Editor.
- **툴바 구성(좌→우)**: 브랜드 마크+워드마크 → 구분선 → 노드 추가 팔레트 버튼들(카테고리 색 타일+글리프) → `＋ More` → 구분선 → Presets ▾ → (flex spacer) → Undo/Redo → 녹화/Export/Share → Clear.
- **도킹 헤더 패턴** (모든 패널 공통): `⣿`(grab dots, `#656d78`) + 대문자 라벨(`#9aa2ac`, letter-spacing 0.9) + 메타 배지(mono, 배경 `#191c21`, border `#20242a`, radius 5) + (spacer) + `⤢`(팝아웃) + `⌄`(접기). 헤더 배경 `#101216`, 높이 34px, 하단 border `#17191e`.
- **상태바**: 높이 ~34px, 배경 `#101216`, mono 11px. `● compiled`/`○ idle`(색=semantic) · 노드 수 · 엣지 수 · GPU ms · fps · u_time.

### B. Node Editor — `Node Editor.dc.html` (1320×860) ★핵심
- **목적**: 노드 그래프 캔버스. 시각 정체성의 절반.
- **캔버스**: 배경 `#0b0c0e` + 도트 그리드 `radial-gradient(rgba(255,255,255,0.045) 1px, transparent 1px)` / `background-size: 22px 22px`.
- **노드 카드 구조**: 헤더(아이콘 박스 + 타이틀 + 우측 메타칩) + 본체(썸네일 96px 또는 값/메타). Shader/Image 노드는 **라이브 썸네일**(96×96, radius 7, inset shadow). Compute는 썸네일 대신 메타(particles/dispatch/buffer). 포트 라벨은 카드 좌/우 **포트 rail**(폭 ~46px)에 두고 썸네일을 rail만큼 안쪽(`margin:0 46px`)으로 밀어 걹침 방지. 라벨 = 포트 타입 패밀리 색, mono 8.5px, max-width ~30–34px ellipsis. 라벨은 축약하지 않고 **raw 포트명**(`texture`, `color` 등) 그대로 사용(단축 매핑 없음) [C-2]. Output 노드는 좌 rail 입력 라벨(raw `texture`) + 본체 메타(`→ viewport`, **pane 문자 미노출** — 카드가 뷰포트 레이아웃을 모름)를 함께 표기, paddingLeft 46(raw 포트명 폭 확보). [D2·C-1·C-2]
- **포트 지오메트리 (구현 시 정밀도 필수)**: 포트 절대위치 `top`은 노드 실제 높이(header 30 + pad 9 + previewH + pad 9) 안에 들어와야 한다. 엣지 path는 포트 중심 좌표에 맞춘다: 입력 x = `node.left`, 출력 x = `node.left + node.width`; y = `node.top + portTop + 5.5`. React Flow에선 각 노드 타입의 Handle 위치를 이 규칙으로 배치. **다포트 카드**(uniform 수만큼 입력 증가)는 **stride 30 고정 + 카드 본체(previewH) 동적 확장**: `previewH = max(96, (nPorts−1)·30 + 56)`, 실용 상한 ~10 포트. 포트가 3개를 넘으면 카드가 세로로 늘어 프리뷰가 포트 span을 덮는다(시안은 Node Editor의 우상단 'Noise' 데모 노드). 구 시안의 stride 30 3-포트 고정 가정이 실물에서 카드를 넘친 건을 해소. [C-3]
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
- **목적**: Inspector / Assets / Problems / **Diagnostics** 탭. 선택 노드에 따라 Inspector 내용이 완전히 바뀜.
- **Inspector**: uniform 자동 컨트롤 — `float`→슬라이더, `vec2/3/4`→다축 슬라이더, 색→컬러 피커, `bool`→토글. 노드 종류별 8종 인스펙터. 상단 공통 **`Name` 필드**로 노드 rename(그래프 더블클릭 인라인과 동일 값)[D15]. **모든 노드 종류(param·group 포함)가 이 공통 Name 하나로 rename** — param의 Label 필드·group의 Group label 필드는 제거해 단일 소스화 [A-1·A-2]. `Output type` 배지 색 = 포트 패밀리[D18].
- **Assets**: 썸네일 그리드, 드래그&드롭 임포트, "노드로 추가".
- **Problems**: 전 노드 에러 목록, 클릭 시 노드 선택 + 코드 라인 점프, 탭 헤더 카운트 뱃지.
- **Diagnostics** [D1]: 런타임 진단 — GPU/Frame/Draw calls/**Shaders** 메트릭 카드 + 레벨 로그. `Shaders`는 실제 GL 링크 카운터가 없어 **error 진단 없는 shader/compute 노드 수 프록시**("N compiled") [A-6]. 레벨 태그 색(dc 실측값이 정본) = **INFO `accent.hover` · WARN `warning` · ERROR `error` · DEBUG `text.secondary`** [A-5]. 로그 행 = **카테고리 접두**(gl/shader/mem, `text.muted`) + 레벨 태그 + 메시지 + 시간. 상단 **툴바**(Copy/Clear/Close) + **레벨 필터**(All/Info/Warn/Error/Debug, All 기본) [C-9]. 카드 = surface.card, 배경 = surface.panel. (Problems=컴파일 에러 목록과 별개.)
- 폼 컨트롤 라이브러리(슬라이더·다축·컬러·토글·셀렉트·숫자입력)가 여기 대량 등장.

### F. Command Palette — `Command Palette.dc.html` (1440×900)
- ⌘K 퍼지 검색 오버레이(Linear/Raycast 스타일). 노드 추가·프리셋·명령 실행. 결과 그룹핑 + 키보드 네비 + 우측 단축키 힌트.

### G. Welcome — `Welcome.dc.html` (1440×900)
- 첫 진입 화면. 데모 그래프/프리셋 진입점 + 온보딩.

### H. Export & Share — `Export & Share.dc.html` (1440×900)
- 단일 HTML export, URL 공유 인코딩, 녹화(WebM/GIF) 흐름.
- **파일명 규칙** [D16·C-10·C-11]: export 파일명 = `{base}-{timestamp}.{ext}`(예: `untitled-project-20260716-1532.html`) — 덮어쓰기 방지. **앱에 projectTitle 상태 없음** → `{base}`는 HTML 다이얼로그의 **편집형 File name 필드**에서 옴(퀵 저장·비HTML 경로는 `DEFAULT_EXPORT_BASE`=`untitled-project` 고정) [C-10·C-11a]. timestamp는 다운로드 시점 확정(다이얼로그 프리뷰엔 `-{timestamp}.html` 자리표시). 완료 카드·토스트 표시명 = 실제 저장명. **성공 토스트 = `Exported {name} · {size}`**(HTML·GIF·WebM 동일 포맷, 크기 표기 포함) [C-11b].
- **standalone HTML 산출물** [D5·B-7·A-8]: export되어 나가는 HTML은 앱 토큰 그대로 이식 — 배경 `surface.app`, 텍스트 `text.primary`, badge 배경=`overlay.scrim`, 링크=`text.primary`, `#canvas` 배경=`surface.letterbox`(근사 3건 승인). **IBM Plex Sans 서브셋을 data URI로 번들**(브랜드 타이포 일관, 파일 +수십 KB) [B-7]. 폴백 에러 div의 `color:white`는 D6 크래시 폴백과 같은 '토큰 비의존' 예외지만 빌드타임 상수로 토큰화 [A-8].

### I. System States — `System States.dc.html` (1440×900)
- 좌측 스위처 레일 + 공유 앱 크롬으로 **8개** 상태 시연: Empty(빈 그래프/빈 뷰포트) · Loading(스피너·진행바·스켈레톤 시머) · Permission(카메라/마이크 권한) · Error(컴파일 에러 오버레이 / WebGL2 unavailable 블로킹 / **App crashed 폴백**). 상태별로 노드 그래프·엣지·상태바·툴바가 문맥에 맞게 변함.
- **크래시 폴백** [D6]: 8번째 상태. ErrorBoundary 폴백 — 전체 앱을 덮는 오버레이, system-ui 폰트 + 중립 그레이(토큰 예외, 위 도메인 규칙). Reload / Copy error CTA.
- **스켈레톤 인디케이터** [D4]: "Restoring graph…"는 캔버스 **중앙**에 플로팅(좌하단 줌 컨트롤과 충돌 회피).
- **권한 차단 링** [D12]: warnRing = `rgba(245,177,61,0.7)`(errorRing과 0.7 알파 패밀리 일관).

### J. Foundations — `Foundations.dc.html`
- 컬러/타이포/노드·포트 색/컴포넌트 토큰 레퍼런스 시트. 위 Design Tokens의 시각적 원본.

### K. Brand — `Brand.dc.html`, `Icon & Social.dc.html` (1180×900)
- 로고/워드마크/앱 아이콘/파비콘 시스템 + 사용 규칙. 실파일은 `brand/` 폴더 참조.

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

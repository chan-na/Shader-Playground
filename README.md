# ShaderPlayground

WebGL2 기반 노드 그래프 셰이더 플레이그라운드. React Flow 캔버스에서 메시·이미지·웹캠·비디오·오디오·셰이더·컴퓨트·파라미터·유틸리티 노드를 연결해 그래프를 구성하고(노드 그룹핑 지원), CodeMirror 6 인라인 에디터에서 GLSL을 작성하면 디바운스 후 재컴파일되어 다중 FBO 패스로 렌더된다. 모든 ShaderNode 카드에는 96×96 라이브 썸네일이 WebGL2 PBO + `fenceSync` 비동기 readback으로 표시되고, 그래프는 IndexedDB 자동저장 / `#share=` URL / 의존성 0의 단일 HTML 파일로 영속화·공유할 수 있다.

자세한 기능 명세는 [SPEC.md](./SPEC.md), 시스템 구조는 [Architecture.md](./Architecture.md), 코드 작업 규약은 [CLAUDE.md](./CLAUDE.md)를 참고.

---

## 사전 요구사항

- **Node.js 22** — CI(`.github/workflows/check.yml`)가 Node 22로 `check`와 `e2e`를 검증한다. 로컬도 22 권장. `package.json`에 `engines`나 저장소에 `.nvmrc`는 없다.
- **npm** — Node에 동봉된 버전 사용 (워크플로도 `actions/setup-node@v4`의 기본).
- **E2E를 돌리려면 Playwright Chromium**:
  ```bash
  npx playwright install chromium
  ```
  `playwright.config.ts`는 SwiftShader로 WebGL을 소프트웨어 렌더링하므로 GPU/디스플레이가 없는 환경에서도 동작한다.

## 설치

```bash
npm ci
```

`package-lock.json`을 그대로 적용하는 재현 가능한 설치. 의존성을 추가/제거한 게 아니라면 `npm install` 대신 항상 이걸 쓴다.

## 개발 서버

```bash
npm run dev
```

Vite가 dev 서버를 띄우고 HMR을 활성화한다. GLSL은 `?raw` import로 직접 텍스트 로딩되므로 `src/shaders/` 또는 노드 내 GLSL을 수정하면 즉시 재컴파일된다.

## 빌드

```bash
npm run build      # tsc 타입체크 후 vite build → dist/
npm run preview    # dist/ 결과를 정적 서빙해 확인
```

## 테스트

### 유닛 테스트 — Vitest 4 / jsdom

```bash
npm run test            # 1회 실행 (vitest run)
npm run test:watch      # watch 모드
npm run test:coverage   # v8 커버리지 리포트
```

테스트는 `src/**/*.test.{ts,tsx}` 위치에 모듈과 동거한다. 커버리지 임계치(lines 50% / functions 47% / branches 42% / statements 50%)는 `vitest.config.ts`에 강제되어 있어 임계치 미달 시 `npm run check`가 실패한다.

### E2E 테스트 — Playwright

```bash
npm run test:e2e          # headless (CI와 동등)
npm run test:e2e:ui       # Playwright UI 모드 (대화형 디버깅)
npm run test:e2e:headed   # 브라우저 창을 띄워 실행
```

Phase 1~34 핵심 시나리오가 `tests/e2e/`의 30개 스펙 파일에 있다. dev 서버는 `playwright.config.ts`의 `webServer.command`로 자동 기동되며, 이미 `npm run dev`가 떠 있으면 재사용한다 (chromium / SwiftShader / workers 1 / 직렬 실행).

## 품질 게이트

머지 전 반드시 셋 다 초록이어야 한다. CI는 `check`·`e2e`·`bundle-size` 세 잡으로 분리해 동일한 게이트를 검증한다.

```bash
npm run check       # typecheck → lint → deadcode → circular → unit test (순차, 첫 실패에서 즉시 중단)
npm run test:e2e    # Playwright (Phase 1~34, 30개 스펙)
npm run build && npm run size:check    # gzip 번들 크기 예산 가드 (CI bundle-size 잡)
```

`npm run check`가 묶는 단계:

| 단계        | 명령                                                  | 도구 / 기준                                                          |
| ----------- | ----------------------------------------------------- | -------------------------------------------------------------------- |
| typecheck   | `tsc --noEmit`                                        | TypeScript 5.6 — `strict` + `noUncheckedIndexedAccess` + `exactOptionalPropertyTypes` |
| lint        | `biome check`                                         | Biome 2.4 — errors **0** / warnings **0**                            |
| deadcode    | `knip`                                                | Knip 6 — 미사용 export / type / dep **0**                            |
| circular    | `dpdm --no-warning --no-tree --exit-code circular:1 src/main.tsx` | dpdm 4 — 순환 의존성 **0**                                   |
| test        | `vitest run`                                          | Vitest 4 — 유닛 통과 + 커버리지 임계치 만족                          |

자동 수정이 필요할 때:

```bash
npm run lint:fix    # biome check --write
npm run format      # biome format --write
```

게이트의 도입 경위·우회 금지 규약·`biome-ignore` 정책은 [CLAUDE.md](./CLAUDE.md) §0~§3 참조.

## 디렉토리 구조 (src/ 기준)

```
src/
├─ main.tsx              # React 엔트리, App 마운트
├─ App.tsx               # 셸 (NodeEditor / Viewport / CodeEditor / SidePanel / StatusBar)
│
├─ core/                 # ── React/Zustand 비의존 순수 TS ──
│  ├─ gl/                # WebGL2 래퍼 (program / texture / framebuffer / mesh / uniforms)
│  ├─ graph/             # compile / execute / validate / uniformParser / diagnostics
│  ├─ nodes/             # 노드 레지스트리 + utility 노드(Math/Swizzle/Combine) CPU 평가
│  ├─ thumbnail/         # 동기 readPixels + 비동기 PBO readback + 10Hz 스케줄러
│  ├─ camera/            # OrbitCamera 상태/입력 바인딩
│  └─ assets/            # 프리미티브 / OBJ·GLTF·이미지 로더 / IndexedDB 캐시
│
├─ state/                # ── Zustand 스토어 16개(녹화 컨트롤러 포함) + 직렬화/공유/자동저장 ──
│  ├─ graphStore.ts      # nodes/edges/positions + rev/uniformRev
│  ├─ assetStore.ts      # 메시/이미지 런타임 핸들 카탈로그
│  ├─ selectionStore.ts  # selectedNodeId
│  ├─ editorStore.ts     # vertex/fragment 탭 + 라인 점프 요청
│  ├─ diagnosticsStore.ts# GLSL Diagnostic 컬렉션
│  ├─ cameraStore.ts / viewportStore.ts / timeStore.ts / rendererStore.ts
│  ├─ historyStore.ts    # Undo/Redo 최대 100건
│  ├─ recorder.ts        # MediaRecorder → WebM/mp4
│  ├─ gifRecorder.ts     # 애니메이션 GIF 녹화 (Web Worker 인코딩, Phase 31~34)
│  ├─ autoSave.ts        # 30초 디바운스 IndexedDB 저장
│  ├─ shareUrl.ts        # gzip + base64url + #share=...
│  └─ serialization.ts   # 프로젝트 JSON v1
│
├─ ui/                   # ── React 18 컴포넌트 ──
│  ├─ NodeEditor/        # React Flow 캔버스, Toolbar, 커스텀 노드 뷰
│  ├─ CodeEditor/        # CodeMirror 6 + GLSL(호버/정의 이동/이름 변경/자동완성/시맨틱 하이라이트) + lint 어댑터
│  ├─ Viewport/          # <canvas> + RAF 루프 + asyncReadback 펌프
│  ├─ CommandPalette/    # Cmd+K — 노드/프리셋/유틸 추가
│  ├─ Panels/            # SidePanel (Inspector ↔ Assets ↔ Problems) + StatusBar
│  ├─ BootstrapGate.tsx  # share / autosave 복구 / 데모 분기 + 다이얼로그
│  └─ KeyboardShortcuts.tsx
│
├─ export/               # 의존성 0 단일 HTML export + standalone player
├─ shaders/              # 빌트인 GLSL (fullscreen.vert, color.frag, templates/*)
└─ utils/                # debounce, id
```

레이어 원칙:

- **`core/`는 React/Zustand를 모른다.** `src/export/standalonePlayer.js`가 같은 알고리즘을 의존성 0으로 다시 구현할 수 있는 근거.
- **UI는 Core를 직접 부르지 않는다.** UI는 스토어에 패치를 보내고, RAF 루프가 매 프레임 `snapshotGraph()` / `snapshotAssets()`로 스냅샷을 떠서 Core에 넘긴다.
- **렌더 루프는 React 외부에서 RAF로 독립 구동.** Viewport의 `useEffect` 한 번에서 시작되고, 컴포넌트 리렌더와 무관하게 회전한다.

전체 트리(`.test.ts` 동거 포함)와 모듈별 책임은 [Architecture.md §12](./Architecture.md#12-디렉토리-트리-phase-34-기준) 참조.

## 기술 스택

| 영역             | 채택                                                   | 버전 (package.json) |
| ---------------- | ------------------------------------------------------ | -------------------- |
| UI 프레임워크    | React + React DOM                                      | ^18.3.1              |
| 노드 그래프      | `@xyflow/react` (React Flow)                           | ^12.10.2             |
| 코드 에디터      | CodeMirror 6 (`@codemirror/*`) + `codemirror-lang-glsl`| ^6 / ^0.5.0          |
| 상태 관리        | Zustand                                                | ^5.0.0               |
| 메시 로더        | `@loaders.gl/obj` + `@loaders.gl/gltf` + core          | ^4.4.1               |
| 행렬 연산        | `gl-matrix`                                            | ^3.4.3               |
| 빌드             | Vite                                                   | ^6.0.0               |
| 언어             | TypeScript                                             | ~5.6.3               |
| 린트 / 포맷      | Biome                                                  | 2.4.15               |
| 유닛 테스트      | Vitest + `@vitest/coverage-v8` + jsdom                 | ^4.1.6               |
| E2E              | Playwright                                             | ^1.59.1              |
| 데드코드 검사    | Knip                                                   | 6.12.2               |
| 순환 의존성 검사 | dpdm                                                   | 4.2.0                |

WebGL2는 raw로 직접 다룬다 (three.js 미사용). 정적 HTML export는 의존성 0의 미니 런타임 (`src/export/standalonePlayer.js`)을 빌드 타임에 Vite `?raw`로 인라인한다.

# ShaderPlayground

WebGL2 기반 노드 그래프 셰이더 플레이그라운드. React Flow 캔버스에서 메시·이미지·웹캠·비디오·오디오·셰이더·컴퓨트·파라미터·유틸리티 노드를 연결해 그래프를 구성하고(노드 그룹핑 지원), CodeMirror 6 인라인 에디터에서 GLSL을 작성하면 디바운스 후 재컴파일되어 다중 FBO 패스로 렌더된다. 모든 ShaderNode 카드에는 96×96 라이브 썸네일이 WebGL2 PBO + `fenceSync` 비동기 readback으로 표시되고, 그래프는 IndexedDB 자동저장 / `#share=` URL / 의존성 0의 단일 HTML 파일로 영속화·공유할 수 있다.

자세한 기능 명세는 [SPEC.md](./SPEC.md), 시스템 구조는 [Architecture.md](./Architecture.md), 코드 작업 규약은 [CLAUDE.md](./CLAUDE.md)를 참고.

---

## 사전 요구사항

- **Node.js 22** — CI(`.github/workflows/check.yml`)가 Node 22로 `check`와 `e2e`를 검증한다. 로컬도 22 권장 — 저장소 루트의 `.nvmrc`가 `22`를 고정하므로 `nvm use`로 맞출 수 있다. `package.json`에 `engines`는 없다.
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

Phase 1~39 핵심 시나리오(도킹 레이아웃은 Phase 35 `phase-35-*.spec.ts`)가 `tests/e2e/`의 40개 스펙 파일(151 테스트)에 있다. 공용 헬퍼는 `tests/e2e/helpers/`(`fixtures`·`sp`·`dom`·`editor`·`render`·`canvas`). dev 서버는 `playwright.config.ts`의 `webServer.command`로 자동 기동되며, 이미 `npm run dev`가 떠 있으면 재사용한다 (chromium / SwiftShader / workers 1 / 직렬 실행).

## 품질 게이트

게이트 정의·임계치·우회 금지 규약·`biome-ignore` 정책의 정본은 [CLAUDE.md](./CLAUDE.md)다. 머지 전 아래가 모두 초록이어야 한다 (CI는 `check`·`e2e`·`bundle-size` 세 잡).

```bash
npm run check                          # typecheck → lint → deadcode → circular → unit test
npm run test:e2e                       # Playwright E2E
npm run build && npm run size:check    # gzip 번들 크기 예산 (CI bundle-size 잡)
```

## 디렉토리 구조

디렉토리별 책임과 주요 진입 파일의 단일 정본은 [Architecture.md §12](./Architecture.md#12-디렉토리-맵)다. 최상위만 요약하면 다음과 같다.

- `src/core/`: React/Zustand에 의존하지 않는 순수 TS(그래프 컴파일·실행, WebGL2 래퍼, GLSL 분석, 에셋, 외부 소스, GIF). `src/state/`: Zustand 스토어와 영속화. `src/ui/`: React 컴포넌트(도킹 셸은 `src/ui/dock/`). `src/styles/`: CSS 파셜.
- `src/export/`·`src/shaders/`·`src/utils/`·`src/build/`: 단일 HTML export, 빌트인 GLSL, 공용 유틸, Vite 플러그인. `tests/e2e/`: Playwright 스펙. `docs/`: Phase별 스펙과 아키텍처 보조 문서.

레이어 원칙(`core`는 React를 모르고, UI는 스토어를 거치며, RAF 루프는 React 밖에서 돈다)은 [Architecture.md §1](./Architecture.md#1-레이어-구분)에 있다.

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

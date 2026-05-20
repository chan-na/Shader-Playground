# 디버깅 / 로깅 시스템 도입 계획 (P1~P5)

> **목적**: ShaderPlayground에 부족한 런타임 로깅·디버깅 인프라를 단계적으로 도입한다.
> **성격**: 여러 세션에 걸쳐 끊어서 진행하는 핸드오버 문서. 각 Phase는 독립 PR로 머지 가능하도록 설계했다.
> **작성일**: 2026-05-20

---

## 0. 진행 상황 트래커 (세션 간 핸드오버)

작업을 시작/종료할 때 이 표를 갱신한다. 다음 세션은 이 표만 보고 어디서 이어갈지 판단한다.

| Phase | 내용 | 상태 | PR | 비고 |
| ----- | ---- | ---- | -- | ---- |
| P1 | 중앙 로거 `src/utils/log.ts` | ✅ 머지됨 | #41 | `log.ts` + `log.test.ts`. 게이트 초록 |
| P2 | 전역 안전망 (onerror / unhandledrejection / ErrorBoundary) | ✅ 머지됨 | #41 | main.tsx 핸들러 + `ErrorBoundary.tsx`(메인 작업영역만 감쌈) |
| P3 | 침묵 catch → 로거 교체 (registry/assets/autosave) | ✅ 구현완료 (PR 대기) | - | 동작 불변, 흔적만. registry/audio·videoLoader/recorder/autoSave/cache/AssetBrowser/WebcamInspector/BootstrapGate/Viewport + rendererStore.errors 상한 50. test-setup `setMinLevel("error")`로 로그 노이즈 차단. 게이트 초록 |
| P4 | GL 에러 표면화 (`gl.getError()` + 컨텍스트 손실 상세) | ⬜ 미착수 | - | DEV 플래그 뒤 |
| P5 | 진단 패널 + "진단 정보 복사" | ⬜ 미착수 | - | E2E 1건 동반 |

상태 범례: ⬜ 미착수 / 🟨 진행중 / ✅ 완료

**권장 PR 묶음**: `PR1 = P1+P2`, `PR2 = P3`, `PR3 = P4`, `PR4 = P5`.
(P1 로거만 단독 머지하면 knip 데드코드 게이트가 "미사용 export"로 막는다. 실호출자가 같은 PR에 들어가야 하므로 P2를 함께 넣는다.)

---

## 1. 배경: 현재 무엇이 부족한가

조사 결과(`src/` 전체 기준):

- **중앙 로거 없음**: `console.*` 호출이 코드베이스 전체에 2건뿐. 레벨/카테고리/필터/내보내기 개념 없음.
- **전역 안전망 전무**: `window.onerror`, `unhandledrejection`, React ErrorBoundary 모두 없음 → 렌더 중 uncaught 에러는 화면 백지 + 흔적 0.
- **침묵 catch 다수**: `// ignore` / `/* ignore */` catch가 특히 `src/core/external/registry.ts`에 20건 이상, `assets/*Loader.ts`, `state/recorder.ts`, IndexedDB 경로에 분산. 영상/오디오/웹캠 임포트 실패(커밋 #38, #40 이력 참고) 시 원인 추적 불가.
- **GL 에러 가시성 0**: `gl.getError()` 호출이 한 곳도 없음. WebGL 런타임 에러(`INVALID_OPERATION` 등) 완전히 비가시. 컨텍스트 손실은 한국어 토스트 한 줄(`CONTEXT_LOST_MSG`)이 전부.
- **렌더 에러가 비구조적**: `rendererStore.stats.errors: string[]`에 `pushError`로 문자열만 무한 누적(상한 없음). severity/source/timestamp 없음, 콘솔 흔적 없음.

**이미 잘 되어 있는 것 (건드리지 말 것)**:
- GLSL 컴파일 에러 진단: `parseShaderInfoLog`(`src/core/graph/diagnostics.ts`) → `diagnosticsStore` → ProblemsPanel. 사용자용으로 완결됨.
- 사용자 알림: `toastStore`(`src/state/toastStore.ts`)의 `toast.{info,success,warning,error}` API.
- DEV 디버깅 핸들: `window.__sp`(`src/main.tsx`)로 스토어 노출.

### 로거 vs 토스트 vs 진단 — 역할 경계 (중요)

세 시스템을 혼동하지 말 것:

| 시스템 | 대상 | 용도 |
| ------ | ---- | ---- |
| `toastStore` (`toast.*`) | **사용자** | 일시적 알림 (저장됨, 내보내기 완료 등) |
| `diagnosticsStore` | **사용자** | GLSL 컴파일 에러 → ProblemsPanel |
| **로거 (신규)** | **개발자** | 런타임 추적/디버깅. 평소 비가시, 필요 시 패널/콘솔에서 확인 |

로거는 토스트를 대체하지 않는다. 사용자에게 보여줄 메시지는 계속 `toast.*`를 쓰고, 그 **원인·스택·맥락**을 로거에 함께 남긴다.

---

## 2. 설계 원칙

1. **동작 불변**: P3에서 침묵 catch를 교체할 때 제어 흐름(삼키는 동작 자체)은 바꾸지 않는다. **흔적만 추가**한다. autoplay 정책 실패처럼 "정상적으로 무시해도 되는" 케이스는 `debug` 레벨로.
2. **프로덕션 비용 0에 수렴**: 콘솔 출력은 DEV에서만. 프로덕션은 인메모리 링버퍼에만 저장(상한 있음) → "진단 정보 복사"로 추출.
3. **게이트 우선**: 모든 Phase는 `npm run check && npm run test:e2e` 초록 상태로 마감. `CLAUDE.md`의 금지 사항(임계치 하향, ignore 추가 등) 절대 위반 금지.
4. **knip 데드코드**: 새 export는 같은 PR에 실호출자 동반.
5. **순환 의존성 금지**: 로거는 `src/utils/log.ts`에 두고 **어떤 store도 import하지 않는다**(단방향 유지). store/UI가 로거를 import하는 방향만 허용.

---

## 3. Phase 상세

### P1 — 중앙 로거 (`src/utils/log.ts`)

**목표**: 레벨·카테고리별 로깅 + 인메모리 링버퍼 + DEV 콘솔 패스스루 + 구독/내보내기 API.

**신규 파일**:
- `src/utils/log.ts`
- `src/utils/log.test.ts` (커버리지 동반 — `src/utils`는 커버리지 대상)

**API 스케치** (확정 전 초안 — 구현 세션에서 조정 가능):

```ts
export type LogLevel = "debug" | "info" | "warn" | "error";
export type LogCategory =
  | "gl" | "render" | "graph" | "assets"
  | "external" | "autosave" | "app";

export interface LogEntry {
  ts: number;            // Date.now()
  level: LogLevel;
  category: LogCategory;
  message: string;
  detail?: unknown;      // 직렬화 가능한 추가 맥락 (error.stack 등)
}

// 링버퍼 상한 (메모리 누수 방지). rendererStore.errors의 무한 누적 문제도 이걸로 해소.
const RING_CAPACITY = 500;

export const log = {
  debug(category: LogCategory, message: string, detail?: unknown): void,
  info(category: LogCategory, message: string, detail?: unknown): void,
  warn(category: LogCategory, message: string, detail?: unknown): void,
  error(category: LogCategory, message: string, detail?: unknown): void,
};

// P5 패널/내보내기용
export function getLogBuffer(): readonly LogEntry[];
export function subscribeLog(fn: (entry: LogEntry) => void): () => void;
export function clearLogBuffer(): void;
export function exportLogText(): string;      // "[ts] LEVEL category: message\n  detail"
export function setMinLevel(level: LogLevel): void;  // 기본 DEV=debug, PROD=warn
```

**구현 메모**:
- 콘솔 패스스루: `import.meta.env.DEV`일 때만 `console.{debug,info,warn,error}`로 미러링. `setMinLevel` 미만은 콘솔/버퍼 모두 스킵 여부는 정책 결정(권장: 버퍼엔 항상 저장, 콘솔만 레벨 게이트).
- detail 직렬화: Error는 `{ name, message, stack }`로 정규화하는 헬퍼 권장.
- **store import 금지**(원칙 5). 로거는 순수 유틸.

**게이트 체크리스트**:
- [ ] `log.test.ts`: 레벨 필터, 링버퍼 상한(capacity 초과 시 오래된 것 evict), 구독/해제, `exportLogText` 포맷, Error 정규화 커버
- [ ] knip: export에 실호출자 존재 → **P2를 같은 PR에 포함**
- [ ] biome: 포맷/룰 0 위반, 새 `biome-ignore` 금지

---

### P2 — 전역 안전망

**목표**: 잡히지 않은 에러를 화면 백지로 끝내지 않고 로거에 기록 + 복구 UI 제공.

**변경 파일**:
- `src/main.tsx`: `window.addEventListener("error", ...)`, `window.addEventListener("unhandledrejection", ...)` → `log.error("app", ...)`. DEV의 `__sp` 노출 옆에 배치.
- `src/ui/ErrorBoundary.tsx` (신규): React 클래스 컴포넌트. `getDerivedStateFromError` + `componentDidCatch`에서 `log.error("app", ...)`. 폴백 UI는 "문제가 발생했습니다 + 새로고침/진단 복사" 수준의 최소 복구 화면.
- `src/App.tsx`: 루트 트리를 `<ErrorBoundary>`로 감싼다. 단, **`Toasts`/`BootstrapGate`는 경계 밖**에 둘지 검토(복구 UI가 떠도 토스트는 보여야 할 수 있음). 권장: 메인 작업 영역(NodeEditor/Viewport/CodeEditor/SidePanel)만 감싸고 전역 오버레이는 밖.
- `src/ui/ErrorBoundary.test.tsx` (신규): throw하는 자식으로 폴백 렌더 + 로그 기록 검증.

**게이트 체크리스트**:
- [ ] ErrorBoundary 단위 테스트 (커버리지)
- [ ] E2E(선택, 권장): 강제 에러 주입 시 백지 대신 폴백이 뜨는지 — 단 주입 수단이 마땅찮으면 단위 테스트로 갈음하고 문서에 명시
- [ ] StrictMode 이중 렌더에서 핸들러 중복 등록 안 되는지 확인 (main.tsx는 모듈 1회 실행이라 OK, ErrorBoundary는 인스턴스 단위라 OK)

---

### P3 — 침묵 catch → 로거 교체

**목표**: 지금 조용히 삼키는 실패 지점에 흔적을 남긴다. **동작/제어 흐름 불변**.

**대상 목록** (조사 시점 라인 번호 — 구현 시 재확인 필수):

| 파일 | 위치(대략) | 권장 레벨 | 카테고리 |
| ---- | --------- | -------- | -------- |
| `src/core/external/registry.ts` | 20+ 곳 (362, 370, 376, 386, 391, 399, 411, 420, 496, 561, 569, 591, 613, 619, 631, 709, 763, 784, 789 …) | autoplay/jsdom 무시류는 `debug`, 그 외 실패는 `warn` | `external` |
| `src/core/assets/audioLoader.ts` | 52 | `warn` | `assets` |
| `src/core/assets/videoLoader.ts` | 61 | `warn` | `assets` |
| `src/state/recorder.ts` | 41 | `warn` | `app` |
| `src/state/autoSave.ts` / `src/core/assets/cache.ts` | IDB `onerror` 경로 | `warn` | `autosave` |
| `src/ui/Panels/AssetBrowser.tsx` | 372 (`/* ignore */`) | `debug`/`warn` | `assets` |
| `src/ui/Panels/WebcamInspector.tsx` | 47 | `debug` | `external` |
| `src/ui/BootstrapGate.tsx` | 42 (share decode 실패) | `warn` | `app` |
| `src/ui/Viewport/index.tsx` | 244, 311, 325 (poll 실패/컨텍스트 손실) | `debug` | `render` |

**제외 (건드리지 말 것)**: `compile.ts`의 의도된 fallback 주석(186, 322, 478)은 정상 제어 흐름이며 에러가 아님. 테스트 파일의 "silently"/"fall through" 문구도 대상 아님.

**`rendererStore.errors` 구조화** (P3에 포함 권장):
- `pushError(msg: string)` 호출부(`Viewport/index.tsx`)는 유지하되, 내부에서 `log.error("render", msg)`도 함께 호출.
- `errors: string[]`에 **상한** 부여(예: 최근 50건), 무한 누적 제거.

**게이트 체크리스트**:
- [ ] 기존 단위 테스트(`registry`, `assetActions`, `autoSave` 등) 그대로 통과 — 동작 불변 확인
- [ ] `autoSave.test.ts:277` "swallows IDB errors silently" 같은 테스트가 깨지지 않는지(삼키는 동작은 유지, 로그만 추가)
- [ ] 로그 호출이 jsdom 테스트 환경에서 시끄럽지 않게(테스트 setMinLevel 또는 `debug` 레벨 활용)

---

### P4 — GL 에러 표면화

**목표**: WebGL 런타임 에러와 컨텍스트 손실을 가시화. DEV 플래그 뒤에서만.

**변경 파일** (`src/core/gl/`):
- `src/core/gl/program.ts`: 링크/컴파일 직후 DEV에서 `gl.getError()` 체크 → `log.error("gl", ...)`. (컴파일 에러 자체는 기존 diagnostics가 처리하므로 중복 주의 — 여기선 link 단계 GL 에러 등 보완)
- `src/core/gl/framebuffer.ts`: `checkFramebufferStatus` 불완전 시 `log.warn("gl", ...)`.
- `src/core/gl/context.ts` 또는 Viewport: `webglcontextlost` / `webglcontextrestored` 이벤트에 상세 로깅(현재는 토스트만).
- 드로우 루프: 매 프레임 `getError`는 비용 큼 → **DEV + 명시적 디버그 토글**일 때만, 혹은 N프레임마다.

**구현 메모**:
- `gl.getError()`는 동기 GPU 플러시를 유발할 수 있어 핫패스 호출 금지. 컴파일/링크/FBO 셋업 같은 **셋업 시점**에만 무조건, 드로우 루프는 토글 뒤로.
- `fakeGl.ts`(테스트 더블)가 `getError`를 지원하는지 확인하고, 없으면 no-op 반환하도록 보강.

**게이트 체크리스트**:
- [ ] `program.test.ts` / `framebuffer.test.ts` 보강
- [ ] `fakeGl.ts`에 `getError`/context-lost 시뮬레이션 추가 시 기존 테스트 영향 확인
- [ ] 드로우 루프 성능 회귀 없는지(E2E의 FPS/renderTick 관련 스펙 확인)

---

### P5 — 진단 패널 + "진단 정보 복사"

**목표**: 로그 링버퍼를 UI에서 열람·필터하고, 버그 리포트용 진단 스냅샷을 클립보드로 복사.

**통합 지점 후보** (기존 자산 재활용):
- `src/ui/Panels/StatusBar.tsx` 또는 `ViewportControls.tsx`에 토글 버튼 (GPU 타이머 오버레이와 동일한 패턴 — `gpuTimerStore`의 `enabled` 토글 참고).
- `src/ui/CommandPalette/index.tsx`에 "Open Diagnostics" / "Copy Diagnostics" 커맨드 추가.
- 신규 패널 컴포넌트 `src/ui/Panels/DiagnosticsPanel.tsx`: `subscribeLog`로 실시간 갱신, 카테고리/레벨 필터, `clearLogBuffer`.

**"진단 정보 복사" 내용** (버그 리포트 1-클릭):
- `exportLogText()` 최근 로그
- graph revision / 노드 수, GL `RENDERER`/`VERSION`/주요 확장 지원 여부
- 렌더 통계(fps, frame, drawCalls, renderTick)
- userAgent, 화면/DPR

**상태 저장**: 패널 열림/필터 상태는 별도 경량 store(`debugUiStore`) 또는 기존 패턴 따라 추가. 순환 의존성 주의.

**게이트 체크리스트**:
- [ ] `DiagnosticsPanel` 단위 테스트(렌더, 필터링)
- [ ] E2E 1건: 패널 열기 → 로그 표시 확인 (SPEC.md에 Phase 항목 추가 시 **사용자 합의 필요** — 임의 추가 금지)
- [ ] "진단 정보 복사"가 clipboard API 없는 환경(jsdom)에서 안전한지

---

## 4. 공통 마감 절차 (매 Phase)

```bash
npm run check       # typecheck + lint + deadcode + circular + unit
npm run test:e2e    # Playwright
```

- 둘 다 초록이어야 완료. `CLAUDE.md` §0~§3 준수.
- SPEC.md / Architecture.md 갱신이 필요하면 **사용자 합의 후** 반영.
- PR 머지 후 이 문서 §0 트래커의 상태/PR 칼럼 갱신.

## 5. 리스크 / 결정 대기 항목

- **로거 레벨 정책**: 버퍼엔 항상 저장 vs 레벨 미만은 버퍼도 스킵 — 구현 세션에서 확정.
- **ErrorBoundary 범위**: 전체 트리 vs 메인 작업 영역만 — P2에서 결정.
- **P4 드로우 루프 getError 토글**: 항상 off 기본 vs DEV 자동 on — 성능 측정 후 결정.
- **SPEC.md Phase 추가 여부**(P5 E2E): 사용자 합의 필요.

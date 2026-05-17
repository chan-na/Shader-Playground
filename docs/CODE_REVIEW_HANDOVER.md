# ShaderPlayground 코드 리뷰 — 진행 트래커 / Handover

> **최종 업데이트**: 2026-05-17 · **기준 main**: `e80c4df`
> **원본 리뷰**: [`docs/CODE_REVIEW.md`](./CODE_REVIEW.md) (51건 발견, Critical 0)
> **목적**: 다음 세션이 컨텍스트 없이도 어디서 이어갈지 즉시 파악.

---

## 0. 30초 요약

| 단계 | 묶음 | PR | 상태 |
|---|---|---|---|
| 1 | P1 5건 — 접근성·보안·자원 정리 | [#19](https://github.com/chan-na/Shader-Playground/pull/19) | ✅ merged `73da421` |
| 2 | A — 노드 레지스트리 통합 (P2-1) | [#20](https://github.com/chan-na/Shader-Playground/pull/20) | ✅ merged `1485be1` |
| 3 | C1+C2 — UI 단위 테스트 보강 (P2-2 일부) | [#21](https://github.com/chan-na/Shader-Playground/pull/21) | ✅ merged `039b480` |
| 4 | C3 — BootstrapGate dialog 회귀 가드 | [#23](https://github.com/chan-na/Shader-Playground/pull/23) | ✅ merged `ebc7e00` |
| 5 | C4 — CommandPalette 헬퍼 추출 + 테스트 | [#24](https://github.com/chan-na/Shader-Playground/pull/24) | ✅ merged `ab82ce8` |
| 6 | B — deserialize sanitize + CSP meta + Viewport.tick Map화 (P3) | [#26](https://github.com/chan-na/Shader-Playground/pull/26) | ✅ merged `e80c4df` |
| **다음** | **D·E 중 선택** | — | 🟡 미진행 |

**현재 커버리지** (임계치 50 / 47 / 42 / 50):
statements **56.78** · branches **49.22** · functions **56.34** · lines **57.45**
→ 마진 +6.78 ~ +15.45%. #26 의 sanitize / CSP plugin 테스트로 branches 가 가장 많이 올랐다 (+2.57%).

---

## 1. 머지된 PR 상세

### #19 — P1 묶음 (`73da421`)

`docs/CODE_REVIEW.md`의 P1 권장 5건 묶음:

- §4.1 icon-only/emoji 버튼에 `aria-label` 부착 (Toolbar / AssetBrowser / Toasts)
- §4.2 / §4.12 Recovery dialog `aria-labelledby` + 자동 focus + ESC no-op
- §4.6 / §5.2 자산 임포트 실패를 toast로 표면화 (`assetActions.ts`)
- §2.1 공유 URL hash payload / decompressed JSON 길이 상한 (64 KiB / 1 MiB) — gzip bomb 방어
- §3.1 IndexedDB 자산 캐시 누수 차단 — `deleteCachedMesh/Image` 추가, `forgetMesh/forgetImage`로 store+IDB 동시 정리

신규 테스트: 6건. CLAUDE.md gates 전부 통과.

### #20 — A 묶음: 노드 레지스트리 통합 (P2-1, `1485be1`)

리뷰 §1.1 / §1.8 — 새 `GraphNodeKind` 추가 시 분산된 변경점 6+ → **3**.

핵심 변경:

- `src/utils/assertNever.ts` (신규) — discriminated union exhaustiveness 가드
- `src/core/nodes/registry.ts` — `cloneGraphNode` 추가 (single switch + assertNever default)
- `src/state/serialization.ts` — `structuredCloneNode` / `deepCloneUniformValues` 제거, `cloneGraphNode` 호출 한 줄
- `src/ui/NodeEditor/nodeUiRegistry.ts` (신규) — `Record<GraphNodeKind, { view, minimapColor }>`. `NODE_TYPES` / `minimapColorFor` derive
- `src/ui/NodeEditor/index.tsx` — `nodeTypes` 인라인 맵 + MiniMap nodeColor switch 제거
- `src/ui/Panels/UtilityInspector.tsx` — if-chain → exhaustive switch + assertNever

**효과**: 새 노드 종류 추가 시 컴파일러가 강제하는 변경점이 (1) `types.ts` 유니온 (2) `core/nodes/registry.ts` (3) `ui/NodeEditor/nodeUiRegistry.ts` — 3개로 줄어듦. 나머지(serialization·NodeEditor·UtilityInspector)는 derive/exhaustive로 자동.

신규 테스트: 10건 (cloneNode round-trip 5 + UI 레지스트리 5).

### #21 — C 묶음 C1+C2: UI 단위 테스트 보강 (P2-2 일부, `039b480`)

리뷰 §5.1 — 31개 UI 파일 중 테스트 3건 → +44건 추가.

핵심 변경:

- `src/ui/NodeEditor/nodes/nodeViews.test.tsx` (신규, 28 tests) — 7개 노드 view 정적 렌더 검증
- `src/ui/NodeEditor/nodes/paramNodeViewHelpers.ts` (신규) + 테스트 — `ParamNodeView`의 `formatParamValue`·`colorSwatchHex` 분리 (§5.5 비대화 사이드 이펙트)
- `src/ui/ToastRow.tsx` (신규) + 테스트 — `Toasts.tsx`에서 분리 (§5.5 사이드 이펙트). info/success/warning/error 4 kinds
- `src/ui/Panels/StatusBar.test.tsx` (신규) — cold-start 정적 검증
- `src/ui/Panels/ViewportControls.test.tsx` (신규) — Time/Camera/Viewport 섹션 + 초기 상태

### #23 — C3: BootstrapGate dialog 회귀 가드 (P2-2, `ebc7e00`)

리뷰 §4.2 / §4.3 / §4.12 — P1(#19) 에서 추가된 ARIA / ESC / focus 동작에 단위 테스트 가드. zustand v5 + `renderToStaticMarkup` SSR 함정(§4 참고)을 피하기 위해 dialog JSX + ESC 핸들러를 sibling 모듈로 추출.

핵심 변경:

- `src/ui/RecoveryDialog.tsx` (신규) — 뷰 컴포넌트 + `swallowEscape` 핸들러. `BootstrapGate.tsx` 가 실제 import (테스트 전용 export 아님)
- `src/ui/BootstrapGate.tsx` — dialog 인라인 JSX 60 줄 → `<RecoveryDialog>` 한 줄, ESC useEffect 인라인 → `swallowEscape` 참조
- `src/ui/RecoveryDialog.test.tsx` (신규, 6 tests) — `swallowEscape` 2 (Escape preventDefault+stopPropagation / 다른 키 no-op) + `RecoveryDialog` 4 (aria-modal/labelledby↔id, testids, body content, primary action DOM 순서)

**잠근 회귀**: `role=dialog`, `aria-modal=true`, `aria-labelledby` ↔ `id` 연결, `data-testid` (`recovery-dialog/recovery-restore/recovery-discard`) — E2E Phase 12 가 의존. `restore` 가 `discard` 뒤에 오는 DOM 순서 (기본 Enter 타깃).

### #24 — C4: CommandPalette 헬퍼 추출 + 테스트 (P2-2, `ab82ce8`)

리뷰 §5.5 (비대화) + §5.1 (UI 테스트 부재) — 450 줄 단일 파일의 file-internal 로직을 sibling `helpers.ts` 로 분리.

핵심 변경:

- `src/ui/CommandPalette/helpers.ts` (신규) — 4 함수: `fuzzyMatch` (3 분기 알고리즘), `rankCommands<T>` (빈 query 패스스루 + 필터 + 정렬), `nextActive`/`prevActive` (boundary 클램핑)
- `src/ui/CommandPalette/index.tsx` — `ranked` useMemo 9 줄 → 1 줄, `onKeyDown` 인라인 산식 제거. 행동은 정확히 동일
- `src/ui/CommandPalette/helpers.test.ts` (신규, 13 tests) — fuzzyMatch 6 (empty / substring score = `100 - index` / case-insensitive / subsequence / 미매치 / unmatched trailing) + rankCommands 4 + nav 3

**효과**: 함수 커버리지 +1.02%, 두 큰 UI 파일(BootstrapGate, CommandPalette)의 핵심 로직에 단위 테스트 안전망 부착.

### #26 — B 묶음: deserialize sanitize + CSP meta + Viewport.tick Map화 (P3, `e80c4df`)

리뷰 §2.2 / §2.3 / §3.2 를 한 묶음으로. 데이터 boundary 강화 + prod CSP + 매-프레임 hot-path 최적화.

핵심 변경:

- `src/state/projectSanitize.ts` (신규) — `sanitizeGraphNode` / `sanitizeGraphEdge` + `SANITIZE_LIMITS` 상수. 신뢰되지 않은 페이로드(share URL / import JSON / autosave) 전용 boundary. `serializeProject` 의 trusted 경로 (`cloneGraphNode`) 는 그대로 둠.
  - 하드 reject (throw → warning + drop): 셰이더 소스 > 64 KiB, 노드 > 2048, 엣지 > 8192, unknown kind
  - 소프트 coerce (silent): NaN/Infinity → 0, compute count clamp [1, 1_000_000], unknown enum → 안전 기본값, 초과 uniform key (64) / 배열 길이 (16) 잘라냄
- `src/state/serialization.ts` — `deserializeProject` 가 sanitize 거치도록 변경. 드롭된 노드는 warning, 이어서 `validateGraph` 가 dangling 엣지를 추가 warning.
- `src/build/cspMetaPlugin.ts` (신규) + `vite.config.ts` — **build-only** Vite 플러그인 (`apply: "build"`). Vite dev (HMR) / Playwright E2E 는 영향 없이 prod `index.html` 의 `<head>` 첫 자식으로 meta 주입:
  ```
  default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline';
  img-src 'self' data: blob:; font-src 'self'; connect-src 'self';
  worker-src 'self' blob:; object-src 'none'; base-uri 'self';
  form-action 'none'; frame-ancestors 'none'
  ```
  `script-src 'self'` 로 inline script 완전 차단. `style-src 'unsafe-inline'` 는 React inline `style={{...}}` 호환 유지 (전체 인라인 스타일 제거는 별도 과제).
- `src/ui/Viewport/index.tsx` — tick 의 passes 순회에서 `graph.nodes.find()` (O(P·N) 매 프레임) → `new Map<id, node>` (O(N+P)) 한 줄 교체. 노드 id 유일성으로 의미 동일, E2E Phase 1~12 회귀 가드.

신규 테스트: 32 건 (`projectSanitize` 20 + `serialization` +5 + `cspMetaPlugin` 7). 커버리지 statements 55.35 → **56.78%**, branches 46.65 → **49.22%** (+2.57, 가장 큰 폭).

**중요 함정 (다음 세션 주의)**:
- Vite build-only 플러그인은 `apply: "build"` + `transformIndexHtml.order: "post"` 조합. dev 에서 CSP 안 깔리므로 Playwright E2E 가 CSP 위반을 잡지 않음 — 단위 테스트 (`CSP_CONTENT` 직접 assertion) 와 `npm run build` 후 `dist/index.html` 육안 확인이 가드.
- knip `project` 가 `src/**/*.{ts,tsx}` 라서 vite 플러그인은 `src/build/` 아래 두어야 entry graph 에 포함된다 (초기 `vite/` 디렉터리로 만들었다가 옮김).

---

## 2. 다음 작업 후보 (선택)

| # | 묶음 | 항목 | 규모 | 임팩트 |
|---|---|---|---|---|
| **D** | CSS 토큰화 (P2-3) | §4.5 — `:root` color tokens 도입, Inspector/UtilityInspector/AssetBrowser inline color 치환. 시각 회귀 가능성 있어 E2E 영향 확인 필요 | 중 | 다크모드 외 미래 테마/대비 준비 |
| **E** | CI 캐시·아티팩트 (P3-5) | §6.4 — Playwright browser 캐시 + dist artifact 재사용 | 소 | CI 시간 단축 (DX) |

**추천 순서**: E → D. #26 (B) 완료로 P3 보안/성능 가드는 닫혔다. E 는 게이트 영향 가장 좁고 (CI 워크플로만 수정) 한 시간 안에 마무리 가능하니 워밍업으로 먼저, 그 뒤 D 의 시각 회귀 위험을 다루는 게 자연스럽다. D 는 §4.5 inline color 치환 범위가 넓어 E2E 스냅샷이 없는 현 상태에선 육안 확인이 필요 — 우선 토큰 도입 + 변경 파일 1~2 개로 PR 을 작게 쪼개는 것을 권장.

**기능 백로그 (`TODO.md`) 와의 관계**: 코드 리뷰 트랙(D/E)이 끝나면 `TODO.md` 의 미진행 백로그 (A2 FS Access, A3 GIF 녹화, C3-Playwright visual regression, D1 PWA, D2 Embed, D4 v2 마이그레이션)로 자연스럽게 전환 가능. 우선 권장은 D2 (Embed) — S 규모, 게이트 영향 좁음.

원본 리뷰의 미진행 항목 전체는 [`docs/CODE_REVIEW.md` §7 일람표](./CODE_REVIEW.md#7-발견-항목-일람표-severity별)와 §8 권장 액션 참조.

---

## 3. 다음 세션 빠른 시작

```bash
# 위치
cd /Users/channa/Repository/github/chan-na/ShaderPlayground

# 게이트 (CLAUDE.md 0. 필수)
npm run check        # typecheck + lint + deadcode + circular + 500 unit tests
npm run test:e2e     # Playwright 33 tests (chromium / SwiftShader)
npm run test:coverage  # 커버리지 임계치 확인

# 새 작업 흐름
git checkout -b feat/<묶음-이름>
# ... 변경 ...
npm run lint:fix     # 포맷 자동 적용
npm run check && npm run test:e2e
git commit ... && git push -u origin <브랜치>
gh pr create ...
gh pr checks <num> --watch
gh pr merge <num> --squash --delete-branch
```

PR 컨벤션:
- 제목 `<type>: 코드 리뷰 <묶음> — <한 줄 요약> (<카테고리>)` (한국어, 기존 #19/#20/#21/#23/#24 형식 참고)
- squash 머지 + 브랜치 삭제
- Co-Authored-By 라인 포함

---

## 4. 이전 PR에서 학습한 패턴 / 함정

### zustand v5 + `useSyncExternalStore` SSR 동작 (C 묶음에서 발견)

`react-dom/server`의 `renderToStaticMarkup` 경로에서 zustand v5 store는 **server snapshot으로 initial state**를 반환한다 (`getServerState || getState` fallback이 호출 시점 변동성을 보장하지 않음). 결과: 테스트에서 `setState` 또는 액션으로 store를 미리 바꿔도 정적 렌더 결과에는 반영되지 않음.

**우회**: 동적 store 분기는 정적 렌더로 검증하지 말고, 핵심 로직을 **별도 헬퍼 모듈로 추출**해서 직접 단위 테스트 (예: `paramNodeViewHelpers.ts`). 이는 §5.5 비대화 정리와도 자연스럽게 어울린다.

### ReactFlow `Handle`은 `ReactFlowProvider` 컨텍스트 필수

노드 view 정적 렌더 시 `<ReactFlowProvider>...</ReactFlowProvider>`로 감싸야 함. `nodeViews.test.tsx`의 `renderInFlow` 헬퍼 패턴 재사용.

### testing-library 미사용

이 프로젝트는 `@testing-library/react`를 도입하지 않고 `renderToStaticMarkup` + zustand store 직접 단위 테스트로 일관한다 (`HelpModal.test.tsx`가 기준). 새 컴포넌트 테스트도 이 패턴 유지 — 새 deps 추가 금지.

### biome-ignore / Knip 정책

CLAUDE.md 1-2 / 1-3 참조:
- 새 `biome-ignore` 추가는 사용자 합의 필요
- 테스트만을 위한 export 추가 금지 → 검증이 필요하면 **로직을 별도 모듈로 분리**해서 정상 import 그래프에 편입 (ToastRow / paramNodeViewHelpers / RecoveryDialog / CommandPalette/helpers 가 그 예)
- 추출한 모듈에서 같이 export 한 상수가 외부 import 가 없으면 knip 이 unused 로 잡는다 — 사용처에 import 시키거나 **모듈 내부 `const` 로 강등** (C3 `RECOVERY_TITLE_ID` 가 그 예)

### React 18 `useRef` 와 `RefObject<T>` prop 타입 (#23 함정)

`useRef<HTMLButtonElement>(null)` 의 반환 타입은 React 18 `@types/react` 기준으로 `RefObject<HTMLButtonElement>` 이며 `current: HTMLButtonElement | null` 이다. 자식 컴포넌트의 ref prop 타입을 `RefObject<HTMLButtonElement | null>` 로 적으면 `LegacyRef<HTMLButtonElement>` 와 호환되지 않아 typecheck 가 깨진다. **항상 `RefObject<T>` (T 에 `| null` 붙이지 않음) 로 적을 것**.

### exact-optional / noUncheckedIndexedAccess 주의

`tsconfig.json` strict 옵션이 켜져 있어 `Record<K, V>` indexed access는 `V | undefined`. `Record<string, V | undefined>` 캐스트 패턴 사용 (`nodeUiRegistry.ts`의 `minimapColorFor` 참고).

### Vite build-only 플러그인 위치 / knip 정책 (#26 에서 학습)

Vite 플러그인을 `src/` 바깥 (예: `vite/`) 에 두면 `knip.json` 의 `project: src/**/*.{ts,tsx}` 그래프에서 빠져서 Knip 분석 대상이 아니게 되고, vitest `include: src/**/*.test.{ts,tsx}` 와도 어긋난다. **`src/build/` 같이 src 안의 build 서브디렉터리에 두는 게 일관**. `apply: "build"` 로 dev/E2E 영향은 자연스럽게 격리되고, 테스트는 정상 import 그래프에 편입된다.

### Vite `transformIndexHtml` 의 객체 형식 타입 (#26 함정)

`plugin.transformIndexHtml` 은 union 타입: `IndexHtmlTransformHook | { transform } | { handler, order? }`. 테스트에서 객체 형식의 `handler` 에 접근할 때 `"handler" in hook` narrowing 이 필요하다 — `typeof hook !== "function"` 만으로는 `{ transform }` 변형이 좁혀지지 않아 TS 오류.

### CSP 가드는 dev 에서 검증 불가 (#26)

Vite dev 서버는 inline script / eval 을 쓰므로 strict CSP 와 공존 불가 → CSP 는 build-only. Playwright 가 dev 를 띄우니 **E2E 는 CSP 위반을 검출하지 않는다**. 대신 (1) `CSP_CONTENT` 정책 문자열에 대한 단위 테스트 (script-src 에 unsafe-* 가 들어가지 않는지 등), (2) `npm run build` 후 `dist/index.html` 의 meta 위치 육안 확인이 가드 역할. 정책을 바꿀 땐 두 가드 모두 갱신.

### deserialize sanitize 와 cloneGraphNode 의 역할 분리 (#26)

`cloneGraphNode` (A 묶음에서 통합) 는 **신뢰된** 상태 복제용. `sanitizeGraphNode` (B 묶음 신규) 는 외부 페이로드 **boundary** 전용. 둘을 합치면 sanitize 가 serialize 트랙도 silent-coerce 해서 (예: 사용자가 임의로 NaN 넣은 슬라이더 값을 zero 로 만들어) 동작이 바뀐다. **새 GraphNodeKind 추가 시 두 모듈 모두 갱신** — registry exhaustive switch 가 강제하지만 sanitize 의 switch 는 별도로 잡아야 한다 (assertNever 대신 throw 패턴).

### PR 머지 후 main 동기화

```bash
git checkout main && git pull --ff-only origin main
```

머지 직후에는 PR 브랜치(`gh pr merge --delete-branch`로 자동 삭제)에 남아있을 수 있다.

---

## 5. 참고 메타

- **품질 게이트 정책**: `CLAUDE.md` §0~4 — 게이트 우회 금지 (특히 임계치 하향, biome-ignore, ignore 추가)
- **시스템 구조**: `Architecture.md` (689줄)
- **Phase별 명세**: `SPEC.md` (E2E 시나리오의 근거)
- **개별 항목 추적**: `TODO.md` — 자체 코드 리뷰 E1~E5 표기 형식 참고
- **원본 6관점 리뷰**: `docs/CODE_REVIEW.md`

# ShaderPlayground 코드 리뷰 — 진행 트래커 / Handover

> **최종 업데이트**: 2026-05-13 · **기준 main**: `039b480`
> **원본 리뷰**: [`docs/CODE_REVIEW.md`](./CODE_REVIEW.md) (51건 발견, Critical 0)
> **목적**: 다음 세션이 컨텍스트 없이도 어디서 이어갈지 즉시 파악.

---

## 0. 30초 요약

| 단계 | 묶음 | PR | 상태 |
|---|---|---|---|
| 1 | P1 5건 — 접근성·보안·자원 정리 | [#19](https://github.com/chan-na/Shader-Playground/pull/19) | ✅ merged `73da421` |
| 2 | A — 노드 레지스트리 통합 (P2-1) | [#20](https://github.com/chan-na/Shader-Playground/pull/20) | ✅ merged `1485be1` |
| 3 | C1+C2 — UI 단위 테스트 보강 (P2-2 일부) | [#21](https://github.com/chan-na/Shader-Playground/pull/21) | ✅ merged `039b480` |
| **다음** | **C3·C4·B·D·E 중 선택** | — | 🟡 미진행 |

**현재 커버리지** (임계치 50 / 47 / 42 / 50):
statements **54.59** · branches **45.88** · functions **54.80** · lines **55.13**
→ 마진 +3.88 ~ +7.80%. 다음 UI 변경 한두 건 정도는 안전한 수준.

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

---

## 2. 다음 작업 후보 (선택)

| # | 묶음 | 항목 | 규모 | 임팩트 |
|---|---|---|---|---|
| **C3** | BootstrapGate dialog 검증 | 정적 렌더 + (선택) keydown 핸들러 export → 테스트. P1(#19)에서 추가된 ARIA/ESC/focus 동작의 회귀 가드 | 소 | 회귀 가드, 커버리지 +α |
| **C4** | CommandPalette 헬퍼 추출 | file-internal `fuzzyMatch` 등을 별도 모듈로 → 테스트. 450줄짜리 큰 파일 분해 | 중 | 함수 커버리지 큰 폭 상승 |
| **B** | 보안·성능 가드 묶음 (P3 일부) | §2.2 deserialize sanitize + §2.3 CSP meta + §3.2 Viewport.tick Map화. 작고 독립적이라 한 PR로 묶기 좋음 | 중 | defense-in-depth + 100노드 그래프 성능 |
| **D** | CSS 토큰화 (P2-3) | §4.5 — `:root` color tokens 도입, Inspector/UtilityInspector/AssetBrowser inline color 치환. 시각 회귀 가능성 있어 E2E 영향 확인 필요 | 중 | 다크모드 외 미래 테마/대비 준비 |
| **E** | CI 캐시·아티팩트 (P3-5) | §6.4 — Playwright browser 캐시 + dist artifact 재사용 | 소 | CI 시간 단축 (DX) |

**추천 순서**: C3 → C4 → B → D → E. C 잔여를 먼저 끝내면 UI 변경 안전망이 두꺼워져 B/D를 안심하고 진행할 수 있다.

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
- 제목 `<type>: 코드 리뷰 <묶음> — <한 줄 요약> (<카테고리>)` (한국어, 기존 #19/#20/#21 형식 참고)
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
- 테스트만을 위한 export 추가 금지 → 검증이 필요하면 **로직을 별도 모듈로 분리**해서 정상 import 그래프에 편입 (ToastRow / paramNodeViewHelpers가 그 예)

### exact-optional / noUncheckedIndexedAccess 주의

`tsconfig.json` strict 옵션이 켜져 있어 `Record<K, V>` indexed access는 `V | undefined`. `Record<string, V | undefined>` 캐스트 패턴 사용 (`nodeUiRegistry.ts`의 `minimapColorFor` 참고).

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

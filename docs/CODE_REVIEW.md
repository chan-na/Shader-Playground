# ShaderPlayground 전체 코드 리뷰

> **감사 시점**: 2026-05-13 · **기준 커밋**: `b7b5c6d` (Phase 12 완료 + Node Graph UX)
> **대상**: `src/` 전체 (133 TS/TSX 파일, 7,500+ LOC) · `Architecture.md` (689 lines) · `SPEC.md` (276 lines) · `TODO.md` · CI
> **감사 방식**: 6 관점(아키텍처/보안/성능/UX/품질/유지보수) 직접 코드 읽기 + grep sweep

---

## 0. 요약 대시보드

### 발견 항목 집계

| 관점 | Critical | High | Medium | Low | 합계 |
|---|---:|---:|---:|---:|---:|
| 아키텍처 | 0 | 2 | 5 | 3 | 10 |
| 보안 | 0 | 0 | 3 | 3 | 6 |
| 성능 | 0 | 1 | 4 | 3 | 8 |
| UX / 접근성 | 0 | 3 | 5 | 4 | 12 |
| 코드 품질 | 0 | 1 | 4 | 3 | 8 |
| 유지보수 | 0 | 1 | 3 | 3 | 7 |
| **합계** | **0** | **8** | **24** | **19** | **51** |

### 종합 평가

ShaderPlayground는 **전체적으로 우수한 코드베이스**다. 강제된 품질 게이트(typecheck, lint, deadcode, circular, 커버리지 임계치, Playwright E2E, 번들 사이즈 가드)가 모두 통과 상태이며, 레이어 분리·순환 의존성 0·Core 독립성 등 아키텍처 원칙이 실제 코드에 잘 반영되어 있다. 

가장 큰 약점은 **UI 레이어 테스트 부재**(31 파일 중 3개만 테스트), **접근성(ARIA/키보드) 보강 여지**, 그리고 **확장점이 분산된 노드 시스템**이다. Critical 등급 이슈는 없다.

### 즉시 권장 우선순위

| 우선순위 | 항목 | 관점 | 이유 |
|---|---|---|---|
| **P1** | UI 컴포넌트 단위 테스트 보강 | 품질 | 31개 중 28개 UI 파일이 테스트 0건. 커버리지 임계치가 30% 부근 턱걸이라 다음 UI 변경 한두 건에 게이트 깨질 위험 (`TODO.md#E5` 참조) |
| **P1** | 아이콘-only 버튼 `aria-label` 일괄 부착 | UX | Toolbar의 ✕ ⬇ ⬆ 📷 ● ■ 🔗 📄 ?  스크린리더 이용 불가. 5분 작업, 영향 큼 |
| **P1** | 노드 타입 확장 분산 변경점 (P3 사전 작업) | 아키텍처 | `TODO.md#A2/A3` 진행 전에 registry 분산 정리 안 하면 매번 6+ 파일 수정 |
| **P2** | `standalonePlayer.js` 알고리즘 중복 | 아키텍처 | compile/execute 로직 재구현. compile.ts 버그 픽스가 자동 반영 안 됨 |
| **P2** | 공유 URL 페이로드 크기 제한 부재 | 보안 | DoS 방어, IndexedDB quota 보호 |
| **P2** | IndexedDB 자산 캐시 무한 증가 | 성능 | LRU/quota-aware 정리 없음 |
| **P3** | Inline style → CSS class/token 정리 | UX | Inspector 한 파일에 22회. 다크모드/테마 일관성 |
| **P3** | Recovery dialog ESC 닫기 | UX | BootstrapGate dialog는 ESC로 닫히지 않음 |

### 강점

| 영역 | 내용 |
|---|---|
| **순환 의존성 0** | `dpdm` 게이트 강제. `graphStore ↔ historyStore` 순환을 단방향으로 해소 (`ec47df1`) |
| **Core 독립성** | `src/core/**`에 `react`/`zustand` import 0건. standalonePlayer가 같은 알고리즘을 의존성 0으로 재구현 가능한 이유 |
| **rev 분리 패턴** | `rev`(구조) vs `uniformRev`(슬라이더) 분리. Undo 히스토리 폭주 방지 + 동적 슬라이더 즉시 반응 |
| **GLSL 진단 라우팅** | `parseShaderInfoLog` + `diagnosticsStore` + ProblemsPanel `goTo`로 컴파일 에러를 노드/스테이지/라인 단위로 안내 |
| **컨텍스트 손실 회복** | `webglcontextlost`/`restored` 리스너 + 재컴파일 경로 (`Viewport/index.tsx:115-137`, `TODO.md#E1` 완료) |
| **TODO.md 품질** | 발견된 빈 자리를 근거(라인/커밋)와 함께 자체 분류, 일부는 이미 해결 표기 |
| **품질 게이트 강제** | typecheck + biome + knip + dpdm + coverage 임계치 + E2E + 번들 사이즈가 CI에서 분리 잡으로 실행 |

---

## 1. 아키텍처 관점

### 1.1 노드 타입 확장 시 분산된 변경점 — **High**

- **위치**: `src/core/graph/types.ts`, `src/core/nodes/registry.ts:62-220`, `src/ui/NodeEditor/index.tsx:38-48`, `src/ui/NodeEditor/nodes/`, `src/ui/Panels/Inspector.tsx`, `src/state/serialization.ts:81-138`, `src/export/standalonePlayer.js`
- **문제**: 새 노드 종류를 추가하려면 최소 **6개 위치**를 손수 수정해야 한다 — `GraphNodeKind` 유니온, `NODE_META`, ReactFlow `nodeTypes` 맵, 뷰 컴포넌트, Inspector dispatch, `structuredCloneNode` switch, standalonePlayer 미니 런타임.
- **근거**: `TODO.md#A2` (FS Access), `#A3` (GIF 녹화) 같은 미래 작업이 이를 그대로 밟는다. discriminated union이 컴파일 타임 안전망 역할은 하지만, "추가했는지 추가 안 했는지"의 책임이 사람에게 분산된다.
- **개선 제안**: `NODE_META`에 `viewComponent`, `inspectorComponent`, `serializeFields`, `defaultLayoutOffset` 같은 팩토리/명세를 함께 둬서 dispatch 맵 한 곳을 갱신하면 끝나도록 통합. 또는 `Record<GraphNodeKind, NodeContract>` 형태의 중앙 레지스트리.

### 1.2 `standalonePlayer.js` 알고리즘 중복 — **Medium**

- **위치**: `src/export/standalonePlayer.js` (~500줄, 의존성 0 미니 런타임) ↔ `src/core/graph/compile.ts` (599줄), `src/core/graph/execute.ts` (459줄)
- **문제**: compile/execute의 핵심 알고리즘이 standalone에서 재구현되어 있다. compile.ts에서 버그를 잡거나 노드 타입을 추가하면 standalonePlayer도 손수 동기화해야 한다. 현재 어떤 자동화도 이를 강제하지 않는다.
- **개선 제안 (옵션)**:
  - (A) standalone 런타임을 Worker로 묶어 esbuild로 core 모듈 그대로 번들 → 단일 소스
  - (B) compile/execute를 platform-agnostic TS로 추출해 두 환경에서 재사용
  - (C) 현 상태 유지 + CI에 "compile.ts 변경 → standalonePlayer 미수정 시 경고" sync-checker 추가
  - 최소 비용은 (C). 영구 해결은 (A).

### 1.3 Store 간 암묵적 호출 (graphStore → historyStore) — **High**

- **위치**: `src/state/graphStore.ts:68-76, 85, 94, 104, ...` — 모든 구조 변경 메서드가 `useHistoryStore.getState().push(...)` 직접 호출
- **문제**: 순환 의존성은 단방향으로 해소했지만(좋음), 그 대가로 `graphStore`가 historyStore의 존재와 API에 강결합된다. `applySnapshot`의 `suppressNext: true` 플래그(historyStore.ts:16) 또한 내부 구현이 인터페이스로 새어 나온 신호.
- **개선 제안**: graphStore는 상태와 rev만 관리하고, 외부(또는 Zustand middleware)에서 변경을 가로채 history에 push하는 패턴으로 분리. `subscribe`의 변경 패치에 "이건 undo 대상인가" 메타데이터를 실어 보내면 `suppressNext` 같은 플래그 없이도 처리 가능.

### 1.4 `compileGraph` 단일 함수 비대화 — **Medium**

- **위치**: `src/core/graph/compile.ts:159-599` (단일 함수 ~440줄)
- **문제**: 검증 → 위상 정렬 → FBO 할당 → 프로그램 컴파일 → 패스 생성 → TF 설정 → output 바인딩까지 한 함수에서 처리. 책임이 한 군데 모여 있어 가독성/테스트성이 떨어지고, 부분 실패(특정 패스만 재컴파일) 같은 미래 시나리오가 어렵다.
- **개선 제안**: `CompileContext` 구조체에 누적 상태를 담고 각 단계를 함수로 분리 — `validate(graph) → resolveTopology → allocateTextures → buildShaderPasses → buildComputePasses → bindOutputs`. 단위 테스트가 단계별로 가능해진다.

### 1.5 Core ↔ State 개념적 결합 (snapshot schema) — **Medium**

- **위치**: `src/ui/Viewport/index.tsx:70-71`, `src/state/graphStore.ts:278-281`, `src/state/assetStore.ts:46-49`
- **문제**: 기술적으로는 Core에 `react`/`zustand` import 0건이지만, Core가 받는 `Graph`/`assets` 스냅샷의 schema가 state 레이어의 store 구조에 종속된다. assetStore가 `{ meshes, images }` 키 구조를 바꾸면 Core도 함께 흔들린다.
- **개선 제안**: Core 진입 함수의 입력 타입을 `state`가 아닌 `core/graph/types.ts`에서만 가져오도록 정리(현재 부분적으로 됨). assetStore의 snapshot에 명시적 contract type을 두어 store와 Core 사이에 한 단계 매핑 레이어를 둔다.

### 1.6 ComputePass ↔ ShaderPass 자원 결합 — **Medium**

- **위치**: `src/core/graph/compile.ts:189-296, 561-575`, `src/core/graph/execute.ts:209-212`
- **문제**: ComputePass가 ping-pong VBO를 소유하고, 이를 그리는 ShaderPass가 VAO를 직접 만들어 참조한다. 수명 관리가 분산되고, 정리 순서에 의존한다(`disposers` 순서로 풀림).
- **개선 제안**: ComputeOutput을 명시적 인터페이스(`{ vboA, vboB, layout }`)로 노출하고 ShaderPass는 이를 통해서만 접근. 또는 텍스처 채널로 통일(데이터 텍스처)하면 모든 패스 간 통신이 동일한 채널이 된다.

### 1.7 Viewport의 rev 카운터 6개 추적 — **Low**

- **위치**: `src/ui/Viewport/index.tsx:51-56`
- **문제**: dirty 게이트를 위해 `lastRev`/`lastAssetRev`/`lastUniformRev`/`lastCameraRev`/`lastTimeRev`/`lastViewportRev` 6개를 관리. 새 입력 source 추가 시마다 변수가 늘어난다.
- **개선 제안**: `RevisionBag = { graph, asset, uniform, camera, time, viewport }` 단일 객체로 묶고 shallow-equal 비교로 dirty 판단. 또는 모든 store가 단일 글로벌 rev로 합산되도록 aggregator 도입.

### 1.8 NodeEditor의 매직 스트링 dispatch — **Low**

- **위치**: `src/ui/NodeEditor/index.tsx:38-48`, `src/ui/Panels/Inspector.tsx:37-39, 41-47`
- **문제**: `n.kind === "shader"` 같은 문자열 디스크리미네이션이 여러 곳에 산재. 새 종류 추가 시 누락 위험. (1.1의 일부 결과)
- **개선 제안**: 1.1과 함께 정리. discriminated union의 exhaustiveness check를 `assertNever(node)` 패턴으로 강제하면 컴파일 타임에 누락 검출.

### 1.9 BootstrapGate의 useState 상태 머신 — **Low**

- **위치**: `src/ui/BootstrapGate.tsx:13-89`
- **문제**: `Phase = "init" | "prompt" | "done"`과 `pending`을 useState 2개로 관리. 현재 단순하나 "취소 가능한 로딩", "에러 표시" 같은 상태 조합이 늘면 폭증.
- **개선 제안**: 지금 당장은 OK. 추가 상태가 필요해질 때 `useReducer` 또는 미니 zustand store로 마이그레이션.

### 1.10 Parser 다중 호출 — **Low**

- **위치**: `src/ui/Panels/Inspector.tsx:41-54`, `src/core/nodes/registry.ts:80-91`, `src/core/graph/compile.ts` (간접)
- **문제**: ShaderNode 소스가 바뀔 때 `parseUniforms`가 ShaderNodeView, Inspector, port 계산, compile 단계에서 각각 재호출.
- **개선 제안**: ShaderGraphNode에 `_parsedUniforms?: UniformSpec[]` 캐시 필드(직렬화 제외) 또는 compile 결과의 `uniformSpecs`를 diagnosticsStore와 함께 발행.

---

## 2. 보안 관점

> 이 도구는 **로컬 브라우저에서 사용자가 자기 셰이더를 실시간 실행**하는 것이 핵심 목적이다. "자기 셰이더를 자기 GPU로 돌리는 것"은 위협이 아니다. 진짜 표면은 **공유 URL/프로젝트 JSON으로 외부 페이로드를 받는 경로**다.

### 2.1 공유 URL 페이로드 크기/형식 검증 부재 — **Medium**

- **위치**: `src/state/shareUrl.ts:72-95`, `src/state/serialization.ts:43-79`
- **시나리오**: 악의적 링크가 거대한 압축 페이로드(gzip bomb 가까운 형태)를 #share=에 담아 보낸다. base64 디코딩 → gunzip → `JSON.parse` 전부 try/catch로 감싸져 있어 즉시 크래시는 없지만, **수십 MB JSON이 메모리에 들어와 IndexedDB autosave까지 흘러간다**. quota 폭주 → 사용자의 autosave가 깨질 수 있다.
- **개선 제안**:
  - hash payload 길이 상한 (예: 64KB) 체크 → 초과 시 거절
  - 압축 해제 후 JSON 길이 상한 (예: 1MB)
  - `serializeProject`/`deserializeProject`의 `nodes.length`, `edges.length`, GLSL 소스 길이 상한 명시
  - share에서 받은 그래프는 autosave에 즉시 쓰지 않거나, 사용자 확인 후에만 적재

### 2.2 `deserializeProject` 노드 shape 검증 얕음 — **Medium**

- **위치**: `src/state/serialization.ts:43-79`
- **시나리오**: `validateGraph`로 cycle/missing_node는 체크하지만, 각 노드 필드의 **타입과 범위**는 검증 안 한다. 예: `ShaderGraphNode.vertexSource`가 5MB 문자열, `ComputeGraphNode.count`가 `Number.MAX_SAFE_INTEGER`, `combine.values`가 NaN. 외부에서 받은 페이로드에 들어 있으면 그대로 store에 박힌다 → `compileGraph`에서 buffer alloc 시 GPU 메모리 폭주 또는 NaN propagation.
- **개선 제안**: `structuredCloneNode` switch에서 각 필드를 명시적으로 검증하고 잘못된 값은 reject 또는 clamp. 짧게는 `count: Math.min(Math.max(n.count|0, 1), 1_000_000)`, `vertexSource: typeof === 'string' && length < 64*1024` 같은 sanitize 라인.

### 2.3 `index.html` CSP meta 부재 — **Medium**

- **위치**: `index.html:1-12`
- **문제**: Content-Security-Policy meta가 없다. Vite dev 서버는 inline script 필요해서 strict CSP가 어렵지만, 프로덕션 빌드에는 `<meta http-equiv="Content-Security-Policy">`로 inline script 차단, `'self'` connect-src 명시 등을 추가할 수 있다. WebGL 도구라 외부 fetch가 없고 dangerouslySetInnerHTML도 없어 실제 위협 면적은 낮지만, **defense-in-depth**.
- **개선 제안**: 프로덕션 빌드용 CSP meta 추가. `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'`.

### 2.4 `standalonePlayer.js`의 `innerHTML` 사용 — **Low**

- **위치**: `src/export/standalonePlayer.js:470, 481`
- **문제**: 익스포트된 standalone HTML 안에서 에러 메시지/안내를 표시할 때 `document.body.innerHTML = ...`를 쓴다. 메시지 텍스트는 정적이라 XSS 가능성은 없지만, 패턴 자체는 위험 신호.
- **개선 제안**: `textContent` + DOM 조립으로 교체. 자동 인젝션이 어려운 패턴으로 유지.

### 2.5 자산 로더 신뢰 경계 — **Low**

- **위치**: `src/state/assetActions.ts:42-95`, `src/core/assets/gltfLoader.ts:30-53`, `src/core/assets/objLoader.ts`
- **문제**: 업로드된 OBJ/GLTF/이미지는 `@loaders.gl/*` 또는 자체 파서로 처리되며, 파일 크기/속성 수에 대한 상한 없음. 사용자가 자기 파일을 올리는 시나리오에선 위협이 아니지만, **공유 프로젝트가 거대한 자산 ID를 참조하면 hydrate 시 IndexedDB에서 임의 크기 mesh를 GPU에 업로드**. 메모리 폭주.
- **개선 제안**: vertex count 상한(예: 5M), texture dimension 상한(예: 8192) 체크. `hydrateAssetsFor`에서 IndexedDB에서 읽은 데이터에 같은 검증.

### 2.6 위협 아님 (분류) — 참고

| 항목 | 분류 사유 |
|---|---|
| 사용자 셰이더 GLSL 임의 실행 | 자기 브라우저, 자기 GPU. 의도된 동작 |
| IndexedDB 평문 저장 | 동일 origin 자체 데이터. 암호화 불필요 |
| `window.prompt` 폴백 (Toolbar:130) | 사용자에게 URL 노출. 위협 아님 |
| `new Function(...)` in `tests/e2e/helpers/sp.ts` | 테스트 코드 only |
| `JSON.parse` 직후 사용 (autoSave, shareUrl) | try/catch로 감싸짐 + 2.1/2.2가 boundary 보강을 다룸 |

---

## 3. 성능 관점

### 3.1 IndexedDB 자산 캐시 무한 증가 — **High**

- **위치**: `src/core/assets/cache.ts:109-129`
- **문제**: `cacheMesh`/`cacheImage`가 모든 임포트 자산을 IndexedDB에 영구 저장. 자산 삭제 시 graph store에서만 빠지고 IDB record는 남는다. 장기 사용 사용자의 quota 폭주 → autosave 동시 실패(`autoSave.ts:153-165` 토스트).
- **개선 제안**: 
  - 가시 store에서 `removeMesh`/`removeImage` 호출 시 IDB record도 함께 삭제
  - 또는 LRU + 총 사이즈 cap (예: 500MB)
  - `navigator.storage.estimate()` 활용해 quota 임박 시 사용자 경고

### 3.2 `Viewport.tick`에서 매 프레임 `graph.nodes.find` — **Medium**

- **위치**: `src/ui/Viewport/index.tsx:232-242, 244-248`
- **문제**: `for (const pass of plan.passes) { const node = graph.nodes.find(n => n.id === pass.nodeId); ... }` — passes × nodes의 O(P·N) 매 프레임. 작은 그래프엔 무해하지만 100노드 부근에서 누적된다. 같은 패턴이 248에서 param 빌드에도.
- **개선 제안**: tick 시작에서 `nodeById = new Map(...)` 한 번 만들고 모든 lookup이 이를 사용. 또는 plan이 `pass.uniformValuesRef`로 그래프 노드를 직접 참조하게 하면 lookup 자체가 사라진다.

### 3.3 Inspector/NodeView의 `parseUniforms` 재호출 — **Medium**

- **위치**: `src/ui/Panels/Inspector.tsx:41-54`, `src/core/nodes/registry.ts:80-91`
- **문제**: 매 렌더마다 `parseUniforms(vertexSource + fragmentSource)`. 정규식 + 라인 스캔이라 비싸진 않지만, ShaderNodeView/Inspector/포트 계산에서 동일 작업 반복.
- **개선 제안**: 1.10 참고 — compile 결과의 `uniformSpecs`를 diagnosticsStore와 함께 발행하면 UI는 그걸 재사용.

### 3.4 Selector가 매 렌더 새 객체를 만들어 리렌더 유발 — **Medium**

- **위치**: `src/ui/NodeEditor/index.tsx:84-107` (`rfNodes`, `rfEdges` useMemo)
- **문제**: 노드 한 개만 바뀌어도 `graphNodes.map(...)` 전체가 재실행 → 모든 노드 DOM이 새 prop 객체를 받는다. ReactFlow는 reference equality로 비교하기 때문에 큰 그래프에서 비용 큼.
- **개선 제안**: 노드별로 메모이즈된 변환 함수, 또는 ReactFlow의 incremental update API 사용. 100노드 이상 그래프가 흔치 않다면 P3.

### 3.5 Toolbar.tsx의 `document.querySelector` — **Medium**

- **위치**: `src/ui/NodeEditor/Toolbar.tsx:105-107, 144-146`
- **문제**: screenshot/record 시 `document.querySelector(".viewport-canvas")`로 DOM 탐색. ID/ref 기반이 아니라 클래스명에 의존 → 다른 곳에서 같은 클래스를 쓰면 깨진다.
- **개선 제안**: viewport canvas를 store에 `canvasRef`로 publish하거나, Viewport가 export하는 함수(`getViewportCanvas()`)를 거치게.

### 3.6 RAF 카운터 다발 (1.7과 연계) — **Low**

- 1.7 참조. 성능보단 가독성 이슈에 가깝다.

### 3.7 GL 리소스 해제 흐름은 견고 — **강점**

- `gl.delete*` 38개 호출처 모두 명시적 owner(disposers, plan.dispose, asyncReadback.release/disposeAll). 컴파일 실패 시 임시 셰이더/프로그램도 `program.ts:31-77`에서 정리. 추가 작업 불필요.

### 3.8 번들 사이즈 가드 — **Low (양호)**

- **위치**: `scripts/check-bundle-size.mjs`, CI `bundle-size` job
- **현재**: total JS gzip 360 KiB 상한. 코드를 보면 codemirror 6개 패키지, @xyflow/react, @loaders.gl (core/gltf/obj)이 무거운 디펜던시.
- **개선 제안 (선택)**: 
  - codemirror를 dynamic import (CodeEditor가 열리기 전엔 안 로드)
  - `@loaders.gl/gltf`, `@loaders.gl/obj`를 `assetActions`에서 dynamic import → 사용자가 자산 임포트할 때만 로드
  - 현재 BootstrapGate가 `shareUrl`을 dynamic import한 패턴 그대로 확장
- 360 KiB 상한 안에 있다면 굳이 안 해도 됨. 다만 미래에 한도 가까워질 때 카드.

---

## 4. UX / 접근성 관점

### 4.1 아이콘-only 버튼의 스크린리더 노출 부재 — **High**

- **위치**: `src/ui/NodeEditor/Toolbar.tsx:223-373`, `src/ui/Panels/AssetBrowser.tsx:121-185`, `src/ui/Toasts.tsx:79-94`
- **문제**: Toolbar의 ✕ ⬇ ⬆ 📷 ● ■ 🔗 📄 ? 버튼들과 AssetBrowser의 `+ Node`, ✕ 버튼들이 `title` 속성만 가지고 `aria-label`이 없다. (Help 버튼만 aria-label 있음, line 371.) `title`은 스크린리더에 일관되게 읽히지 않는다 (브라우저/SR 조합에 따라 다름).
- **개선 제안**: 모든 icon-only 버튼에 `aria-label`을 명시. emoji 위에 `<span aria-hidden="true">` 래퍼 + sr-only 텍스트 패턴도 가능. 5분 작업.

### 4.2 Recovery dialog (BootstrapGate) ESC 닫기 부재 — **High**

- **위치**: `src/ui/BootstrapGate.tsx:94-163`
- **문제**: `role="dialog"`, `aria-modal="true"` 선언했지만 ESC 키 핸들러 없음. CommandPalette/HelpModal과 동작 비일관.
- **개선 제안**: useEffect에서 `keydown` 리스너 추가, ESC 시 `discard()` 또는 phase를 그대로 유지(저장된 상태 위 즉시 새 작업 시작 시 손실 위험이 있어 ESC=discard보다는 무동작이 안전할 수도). 최소한 dialog의 첫 버튼에 자동 focus는 추가.

### 4.3 CommandPalette/Recovery dialog `aria-labelledby` 부재 — **High**

- **위치**: `src/ui/CommandPalette/index.tsx:391-399`, `src/ui/BootstrapGate.tsx:94-108`
- **문제**: `aria-modal="true"`인데 dialog 이름이 SR에 안 읽힌다. HelpModal은 `aria-labelledby="help-modal-title"`로 잘 처리되어 있음 (참고 모범).
- **개선 제안**: CommandPalette는 input의 placeholder 외에 `<span id="cmdk-title" className="sr-only">Command palette</span>` 추가 후 dialog에 `aria-labelledby="cmdk-title"`. BootstrapGate는 "이전 작업을 복구할까요?" 텍스트에 id 부여 후 동일.

### 4.4 UI 컴포넌트 키보드 내비게이션 깊이 — **Medium**

- **위치**: `src/ui/CommandPalette/index.tsx:410-422`, `src/ui/NodeEditor/HelpModal.tsx`
- **문제**: CommandPalette는 ↑/↓/Enter/Esc만 처리. Tab은 흐름 외 (input → list buttons로 정상 흐름이지만 `tabIndex={-1}`로 막혀 키보드만으로 마우스 클릭 시뮬레이션 불가). HelpModal은 focus trap 없어서 Tab으로 모달 밖 요소로 이동 가능.
- **개선 제안**: focus trap 추가 (간단한 라이브러리: `focus-trap-react` 또는 직접 구현 ~30줄). Tab → input → 결과 행 → close 버튼 → 다시 input 순환.

### 4.5 Inline style 대량 사용 (테마 일관성/다크모드/CSS-in-JS) — **Medium**

- **위치**: `src/ui/Panels/Inspector.tsx` (22회), `src/ui/Panels/UtilityInspector.tsx` (11회), `src/ui/Panels/AssetBrowser.tsx` (11회), `src/ui/BootstrapGate.tsx` (7회), `src/ui/Toasts.tsx` (5회), …
- **문제**: 색상 `#ddd`, `#888`, `#666`, `#1e1e1e` 등이 인라인으로 하드코딩. CSS 변수/토큰 없음. 다크모드 외 테마, 사용자 선호도 반영 불가. 색약 사용자를 위한 대비 조정 불가.
- **개선 제안**: 
  - `:root`에 색 토큰 정의 (`--color-text-primary: #ddd; --color-text-muted: #888; ...`)
  - 인라인 style의 색상을 토큰으로 치환
  - 추후 `prefers-color-scheme: light` 분기에 같은 토큰 다른 값을 매핑할 수 있도록 준비

### 4.6 에러 메시지 톤 일관성 (alert/prompt vs toast) — **Medium**

- **위치**: `src/ui/NodeEditor/Toolbar.tsx:100, 128, 130`, `src/state/assetActions.ts:134`, `src/state/autoSave.ts:163`
- **문제**: 토스트 시스템이 잘 구현되어 있지만(`Toasts.tsx`, `toastStore.ts`), 일부 경로는 native `window.prompt` 폴백을 쓰고(Toolbar:130 - 클립보드 실패 시), 일부는 console만 출력(`assetActions.ts:134` - 자산 임포트 실패는 사용자에게 안 보임), 일부는 toast(autoSave 실패). `TODO.md#E2`에서 이미 인지됨.
- **개선 제안**: 자산 임포트 실패도 toast로 (`toast.error(\`자산 임포트 실패: ${file.name}\`)`). Toolbar의 클립보드 폴백은 toast.info에 URL 잘림 표시 후 별도 모달로 복사 버튼 제공.

### 4.7 한국어 하드코딩 (i18n 미준비) — **Medium**

- **위치**: `src/ui/BootstrapGate.tsx:122, 125, 142, 158`, `src/ui/Viewport/index.tsx:63`, `src/ui/NodeEditor/Toolbar.tsx:100, 128, 370`, `src/ui/NodeEditor/HelpModal.tsx:35-58, 107`, `src/state/recorder.ts:59, 71, 96`
- **문제**: 모든 사용자 노출 문구가 한국어 리터럴. 국제 사용자/기여자에게 접근성 떨어진다. README는 한국어, Architecture.md도 한국어 — 프로젝트 컨벤션일 수 있으나 i18n 도입 시 산재 발견 비용이 크다.
- **개선 제안**: 
  - 지금 i18n까지 갈 필요는 없음. 다만 한국어 리터럴을 모듈별 `strings.ts`에 모아두면 후일 교체 비용 격감
  - 또는 README/CLAUDE.md에 "이 프로젝트는 ko 우선" 정책 명시

### 4.8 Toolbar의 좁은 화면 대응 — **Medium**

- **위치**: `src/ui/NodeEditor/Toolbar.tsx:213-222`
- **문제**: `flexWrap: "wrap"`만 있고 narrow viewport에서 24개 버튼이 5~6줄로 쌓여 NodeEditor 본문 영역을 잡아먹는다. 모바일/태블릿/작은 노트북에서 UX 깨짐.
- **개선 제안**: "More…" overflow 메뉴로 자주 안 쓰는 버튼(Sphere, Torus, Chain, Split, Clear 같은 프리셋)을 모음. 또는 Toolbar 아이콘화.

### 4.9 빈 상태 (Empty states) 안내 풍부도 — **Low**

- **위치**: `src/ui/Panels/Inspector.tsx:85, 180-186, 257-265`, `src/ui/Panels/ProblemsPanel.tsx:55-56`, `src/ui/Panels/AssetBrowser.tsx:191`
- **상태**: "No node selected", "No assets loaded", "No problems", "No matches", "Add a uniform float or vec3 declaration..." 등 기본 안내는 있다. 다만 첫 진입 사용자가 "여기서 뭘 해야 하는지"가 불분명한 곳: 그래프 비었을 때 NodeEditor에 안내 없음 (Toolbar 버튼이 단서이긴 함).
- **개선 제안**: 그래프가 비었을 때 NodeEditor 본문에 "👉 Toolbar에서 + Mesh 또는 Cmd+K로 시작" 같은 onboarding hint.

### 4.10 색깔만으로 정보 전달 (ProblemsPanel 심각도) — **Low**

- **위치**: `src/ui/Panels/ProblemsPanel.tsx:80-86`
- **문제**: severity = error/warning/info를 색깔 ●로만 표시. 색약 사용자는 구분 어려움.
- **개선 제안**: 색 + 텍스트/아이콘 조합 (e.g. `✕`/`⚠`/`ℹ`). Toasts는 이미 잘 되어 있음 (Toasts.tsx:3-8).

### 4.11 Toast 자동 닫힘과 SR — **Low**

- **위치**: `src/ui/Toasts.tsx:52-95`
- **상태**: `role="status"`로 SR에 알림. 좋음. 다만 long message 처리(`whiteSpace: "pre-wrap"`)는 있는데 `aria-live` 값을 명시 안 함 — `role="status"`가 암묵적으로 `polite`라 OK.

### 4.12 Recovery dialog 첫 버튼 자동 focus 부재 — **Low**

- **위치**: `src/ui/BootstrapGate.tsx:127-160`
- 4.2와 함께. dialog 열 때 첫 actionable 요소에 자동 focus 필요.

---

## 5. 코드 품질 관점

### 5.1 UI 컴포넌트 단위 테스트 부재 — **High**

- **위치**: `src/ui/**` 31개 파일 중 단위 테스트 있는 것: `HelpModal.test.tsx`, `autocomplete.test.ts`, `uniformFilter.test.ts` → 3개
- **상세 (테스트 0건)**:
  - `Toasts.tsx`, `BootstrapGate.tsx`, `KeyboardShortcuts.tsx`
  - `CodeEditor/{index,lintAdapter,autocomplete,StageTabs,glslSetup}.tsx`
  - `Viewport/index.tsx`
  - `Panels/*` 8개 전부 (Inspector, AssetBrowser, ProblemsPanel, StatusBar, ParamInspector, ViewportControls, UtilityInspector, SidePanel)
  - `NodeEditor/{index,Toolbar,NodeThumbnail}.tsx` + `nodes/*.tsx` 7개
  - `CommandPalette/index.tsx`
- **문제**: E2E(Playwright)가 UI를 일부 커버하지만 단위/통합 사각지대가 넓다. `TODO.md#E5`에서 이미 인지("커버리지 임계치 턱걸이 32.2/26.78/29.2/32.16" — 임계치는 50/47/42/50인데 측정값이 더 높은 것으로 보아 E5 작업이 진행된 이력으로 추정). 그래도 UI 변경 한두 건에 임계치 깨질 위험은 여전.
- **개선 제안**: 
  - 우선 순수 함수형 헬퍼(예: `Toolbar`의 export 헬퍼들, `CommandPalette`의 `fuzzyMatch`(현재 file-internal), `Inspector`의 filter 합성) 테스트 추가
  - `@testing-library/react`로 BootstrapGate, HelpModal과 같은 dialog 흐름 테스트
  - 노드 뷰는 prop-driven이라 snapshot 테스트로도 빠르게 보강 가능

### 5.2 자산 임포트 실패 silent — **Medium**

- **위치**: `src/state/assetActions.ts:130-136`
- **문제**: `importFiles`가 try/catch로 `console.error`만 출력. UI에 피드백 없음. 4.6과 연계.
- **개선 제안**: `toast.error(\`자산 임포트 실패 (${file.name}): ${msg}\`)` 추가.

### 5.3 `useMemo` deps에 객체 + 객체.속성 동시 명시 — **Medium**

- **위치**: `src/ui/Panels/Inspector.tsx:48-54`
- **문제**: `useMemo` deps에 `shaderNode?.vertexSource, shaderNode?.fragmentSource, shaderNode, computeNode?.vertexSource, computeNode` — 객체와 속성을 함께 넣어 useExhaustiveDependencies를 만족시키지만 사실상 객체 reference만 비교돼서 속성 deps는 redundant. shaderNode가 매 렌더 새 객체로 만들어지면 (현재 `node?.kind === "shader" ? (node as ShaderGraphNode) : null`이라 매번 새 reference 아님이지만 store 업데이트시 새 reference) 매번 useMemo가 invalid.
- **개선 제안**: 객체 reference만 deps에 넣고, 변환은 안에서. 또는 vertexSource/fragmentSource만 deps로 좁히기.

### 5.4 `compile.ts` 외부 경계 캐스트 — **Medium**

- **위치**: `src/core/assets/gltfLoader.ts:34`, `src/main.tsx:19`
- **문제**: `as unknown as GLTFParsed`로 외부 라이브러리 결과를 받는다. 런타임 shape 검증 없음. @loaders.gl가 형식 변경하면 silent fail.
- **개선 제안**: 진입에서 최소 검증(`if (!parsed?.meshes?.[0]?.primitives) throw new Error(...)`) — 일부는 이미 line 36에 있음. 다만 attributes의 각 필드는 검증 안 되어 있어 `attrs.POSITION?.value`가 undefined일 때 정상 동작은 함(`?.`) — OK.

### 5.5 React 컴포넌트 비대화 (Toolbar 377줄) — **Medium**

- **위치**: `src/ui/NodeEditor/Toolbar.tsx`
- **문제**: 24개 버튼 + 6개 핸들러(import, export, screenshot, share, record, html) + 9개 add 함수가 한 컴포넌트. CommandPalette/index.tsx도 450줄(commands 빌더 + 모달 + 키보드 핸들러).
- **개선 제안**: Toolbar 핸들러를 `state/projectActions.ts` 같은 곳에 추출(screenshot/record/exportJson/importJson/shareUrl/exportHtml). 컴포넌트는 버튼 마크업만.

### 5.6 비표준 캐스팅 패턴 — **Low**

- **위치**: 검색에서 발견된 production 캐스트는 `gltfLoader.ts`, `main.tsx` 2건만 — 매우 양호
- **상태**: 테스트 코드의 캐스팅(`as unknown as WebGLBuffer` 등)은 mock 패턴이라 정당. 프로덕션 코드 평가에서 제외.

### 5.7 중복 패턴: download-blob-and-click — **Low**

- **위치**: `src/ui/NodeEditor/Toolbar.tsx:69-76, 109-117, 152-160`, `src/export/htmlExport.ts:62-69`
- **문제**: Blob → URL.createObjectURL → `<a>` 생성 → click → setTimeout revoke 패턴이 4곳에 중복.
- **개선 제안**: `utils/downloadBlob(blob, filename)` 헬퍼로 추출 (10줄). 적절한 추상화.

### 5.8 일관성: snapshot/spread 패턴 boilerplate — **Low**

- **위치**: `src/state/graphStore.ts:68-76, 119-131, 134-154` 등
- **상태**: 모든 mutator가 spread로 새 객체. zustand 관례에 맞지만 nodes 배열을 .map → new array마다 가는 비용은 큰 그래프에서 누적. 5.5와 함께 추출 고려.

---

## 6. 유지보수 관점

### 6.1 문서 ↔ 코드 동기화 — **High (양호)**

- **상태**: `Architecture.md`(689줄)가 실제 코드 구조를 매우 정확히 반영. state store 목록(13개 언급)이 src/state의 19개 .ts 중 사용자 facing 13개(types, demoGraph, thumbnailScheduler, assetActions, serialization을 제외한 store들)와 일치 ✓
- **장점**: Architecture.md가 *왜* 그렇게 되어있는지, *어떤 위험*을 회피했는지까지 적혀 있음. CLAUDE.md도 게이트 우회 금지를 명시.
- **개선 제안 (선택)**: Architecture.md 머리에 "마지막 코드 검증일: YYYY-MM-DD / 기준 커밋: SHA"를 추가하면 stale 여부 추적 쉽다. 현재는 "Phase 12" 표기로 갈음.

### 6.2 매직 넘버 인라인 — **Medium**

- **위치**: 
  - `src/ui/Viewport/index.tsx:100` `Math.min(window.devicePixelRatio || 1, 2)` — 2가 magic
  - `src/state/recorder.ts` 30fps 하드코딩(Toolbar.tsx:149 `await r.start(canvas, 30)`)
  - `src/ui/Panels/ParamInspector.tsx:46-49` slider min/max -2/2 magic
  - `src/state/demoGraph.ts:250` `count: 1024`
- **개선 제안**: 모듈 상단에 named const. 도메인 의미가 명확해진다. 큰 비용은 아니지만 누적되면 "왜 2인지?"를 묻는 PR comment가 반복된다.

### 6.3 깨지기 쉬운 코드 패턴: `useExhaustiveDependencies` 회피 — **Medium**

- **위치**: `src/ui/NodeEditor/index.tsx:66`, `src/ui/Panels/Inspector.tsx:48-54`
- **문제**: 5.3 참조. biome-ignore가 한 군데(NodeEditor:66 — rev 의존만 일부러)는 명확하지만 Inspector의 deps 패턴은 비효율. 미래 리팩터 시 깨지기 쉬움.
- **개선 제안**: 5.3과 함께 정리. exhaustive-deps 룰을 trust할 수 있도록 deps array를 정확히 좁히기.

### 6.4 CI 캐싱/병렬 최적화 여지 — **Medium**

- **위치**: `.github/workflows/check.yml`
- **상태**: check / e2e / bundle-size 3 job 분리는 잘 되어 있음. 다만:
  - Playwright 브라우저 캐시 없음 → 매 빌드 chromium 재설치
  - `npm ci` 캐시는 사용 중 ✓
  - bundle-size job이 매번 `npm run build` 새로 실행 — check job의 빌드 산출물 재사용 안 함
- **개선 제안**: 
  - `actions/cache@v4`로 `~/.cache/ms-playwright` 캐시 (key는 playwright 버전)
  - check job에서 `dist/`를 artifact 업로드, bundle-size에서 download → build 단계 생략

### 6.5 미래 확장 병목 — **Low**

- 1.1, 1.2가 핵심 병목. 그 외:
  - 새 셰이더 스테이지(예: tessellation) 추가는 WebGL2 제약상 불가 → 비병목
  - 새 자산 타입(예: HDR EXR) 추가 시 `classifyFile` + 로더 + 캐시 + AssetBrowser preview 4곳 변경
  - i18n 도입 시 4.7 흩어진 한국어 리터럴을 하나하나 발굴 — 지금 모아두면 비용 절감

### 6.6 테스트 인프라 안정성 — **Low**

- **상태**: `src/core/gl/fakeGl.ts` (178줄)이 jsdom용 WebGL mock. 충분히 확장 가능한 구조. Playwright는 SwiftShader로 실 렌더(결정론적). 둘 다 잘 분리됨.
- **위험**: `fakeGl`이 실 WebGL과의 미세 차이로 단위 테스트가 통과하는데 실제는 깨지는 경우. `compile.test.ts:12`의 `const fakeGl = null as unknown as ...` 패턴이 그 표현 — null로 실행 가능 경로만 검증.
- **개선 제안 (선택)**: 단위 테스트에서 fakeGl로 실패하는 경로가 발견되면 SwiftShader 통합 테스트로 옮기는 정책을 CLAUDE.md에 명시.

### 6.7 TODO.md 품질 — **강점**

- **상태**: 자체 코드 리뷰("E1~E5 — 2026-05-12 코드 직접 조사 발견")가 포함되어 있고, 발견 항목에 라인 번호/근거가 적혀 있으며, 일부는 [x]로 완료 표기됨. 메타-문서로 매우 우수.
- **참고**: 이 보고서의 일부 발견(예: 1.2 standalonePlayer 중복, 3.1 IDB 무한 증가)은 TODO.md에 없는 항목 — 후속 backlog로 가치 있음.

---

## 7. 발견 항목 일람표 (Severity별)

### High (8건)

| # | 영역 | 항목 |
|---|---|---|
| 1.1 | 아키텍처 | 노드 타입 확장 시 6+ 파일 변경 |
| 1.3 | 아키텍처 | graphStore → historyStore 직접 호출 결합 |
| 3.1 | 성능 | IndexedDB 자산 캐시 무한 증가 |
| 4.1 | UX | 아이콘-only 버튼 aria-label 부재 |
| 4.2 | UX | Recovery dialog ESC 미처리 |
| 4.3 | UX | CommandPalette/Recovery aria-labelledby 부재 |
| 5.1 | 품질 | UI 단위 테스트 28건 부재 |
| 6.1 | 유지보수 | (강점) 문서-코드 동기 양호 |

### Medium (24건)

| # | 영역 | 항목 |
|---|---|---|
| 1.2 | 아키텍처 | standalonePlayer.js 알고리즘 중복 |
| 1.4 | 아키텍처 | compileGraph 단일 함수 비대화 |
| 1.5 | 아키텍처 | Core ↔ State snapshot schema 결합 |
| 1.6 | 아키텍처 | ComputePass ↔ ShaderPass 자원 결합 |
| 2.1 | 보안 | 공유 URL 페이로드 크기 검증 부재 |
| 2.2 | 보안 | deserializeProject 노드 shape 검증 얕음 |
| 2.3 | 보안 | index.html CSP meta 부재 |
| 3.2 | 성능 | Viewport.tick의 O(P·N) node 탐색 |
| 3.3 | 성능 | parseUniforms 다중 재호출 |
| 3.4 | 성능 | NodeEditor의 selector 새 객체 생성 |
| 3.5 | 성능 | Toolbar의 document.querySelector |
| 4.4 | UX | CommandPalette/HelpModal focus trap 없음 |
| 4.5 | UX | Inline style 22+11+11회, 토큰 없음 |
| 4.6 | UX | 에러 알림 톤 불일치 (alert/prompt/toast 혼용) |
| 4.7 | UX | 한국어 하드코딩 (i18n 미준비) |
| 4.8 | UX | Toolbar 좁은 화면 대응 부족 |
| 5.2 | 품질 | 자산 임포트 실패 silent (console만) |
| 5.3 | 품질 | useMemo deps 객체+속성 중복 |
| 5.4 | 품질 | 외부 라이브러리 결과 캐스트 검증 얕음 |
| 5.5 | 품질 | Toolbar 377줄 비대 |
| 6.2 | 유지보수 | 매직 넘버 (DPR cap, 30fps, 1024 등) |
| 6.3 | 유지보수 | exhaustive-deps 회피로 깨지기 쉬움 |
| 6.4 | 유지보수 | CI Playwright 브라우저 캐시 없음 |

### Low (19건)

| # | 영역 | 항목 |
|---|---|---|
| 1.7 | 아키텍처 | Viewport rev 카운터 6개 |
| 1.8 | 아키텍처 | NodeEditor 매직 스트링 dispatch |
| 1.9 | 아키텍처 | BootstrapGate useState 머신 |
| 1.10 | 아키텍처 | parseUniforms 캐시 부재 |
| 2.4 | 보안 | standalonePlayer.js innerHTML 사용 |
| 2.5 | 보안 | 자산 로더 크기 상한 부재 |
| 2.6 | 보안 | (분류) 위협 아님 항목 정리 |
| 3.6 | 성능 | (1.7과 연계) |
| 3.7 | 성능 | (강점) GL 리소스 해제 견고 |
| 3.8 | 성능 | 번들 사이즈 360KiB cap (양호) |
| 4.9 | UX | 빈 그래프 onboarding hint 없음 |
| 4.10 | UX | ProblemsPanel severity 색깔만 |
| 4.11 | UX | Toast aria-live 명시 안 됨 (OK) |
| 4.12 | UX | Recovery dialog 자동 focus 없음 |
| 5.6 | 품질 | 비표준 캐스팅 거의 없음 (양호) |
| 5.7 | 품질 | downloadBlob 헬퍼 추출 후보 |
| 5.8 | 품질 | store mutator boilerplate |
| 6.5 | 유지보수 | 미래 확장 병목 |
| 6.6 | 유지보수 | fakeGl 정책 명문화 |

---

## 8. 종합 권장 액션 (P1~P3)

### P1 — 다음 PR에 권장 (작고 영향 큼)

1. **아이콘-only 버튼 aria-label 일괄 부착** (4.1) — 5분, UX 큰 개선
2. **Recovery dialog ESC + 자동 focus** (4.2, 4.12) — 10분
3. **자산 임포트 실패 toast 표시** (4.6, 5.2) — 5분, TODO.md#E2와 묶기
4. **공유 URL 페이로드 크기 상한** (2.1) — 30분, defense-in-depth
5. **IndexedDB 자산 캐시 정리** (3.1) — store remove와 IDB delete 연결

### P2 — 다음 Phase 작업 전에

1. **노드 타입 확장 dispatch 통합** (1.1, 1.8) — `NODE_META` 중심 레지스트리화. A1/A2 신규 노드 타입 추가 전에 필수
2. **UI 컴포넌트 단위 테스트 보강** (5.1) — 최소 dialog 흐름 + 핵심 panels. TODO.md#E5 연장
3. **Inline style → CSS 토큰** (4.5) — `:root` 변수 도입, 다크모드 외 미래 테마 준비
4. **standalonePlayer sync checker** (1.2) — 자동화가 어렵다면 CHANGELOG 정책

### P3 — 백로그

1. **CSP meta 추가** (2.3)
2. **deserialize 노드 shape sanitize** (2.2)
3. **compileGraph 단계 분리** (1.4) — 다음 큰 compile 변경과 함께
4. **Viewport.tick 노드 lookup Map화** (3.2)
5. **CI Playwright 캐시 + dist artifact 재사용** (6.4)
6. **Toolbar 핸들러 → projectActions로 추출** (5.5)
7. **i18n 준비: 문구 모듈화** (4.7) — 결정 시점까지 보류 가능
8. **Toolbar 좁은 화면 overflow 메뉴** (4.8)

---

## 9. 참고

- 이 리뷰는 **현재 코드(`b7b5c6d`)** 와 `Architecture.md` / `SPEC.md` / `TODO.md`의 대조 결과다.
- 모든 발견은 파일 경로:라인 단위로 검증된다. 일부 정량 추정(예: "100노드에서 O(P·N)")은 동작 원리에서 도출했으며 실측은 안 했다.
- `TODO.md` 에 이미 등록된 항목(E1~E5)과 본 리뷰의 발견 일부가 겹친다 — 본 리뷰는 그 위에 새 발견을 더하는 형태로 작성했다.
- Critical 등급 발견 없음. 게이트(check / e2e / bundle-size)가 모두 통과 상태이며, 아키텍처/보안 critical risk는 식별되지 않았다.

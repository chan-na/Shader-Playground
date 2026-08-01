# 학습 가시성 개선 계획 (Learnability Plan) — 2026-08

> **목적**: "학습자가 셰이더 파이프라인에서 *정확히 무엇이 일어나는지* 해부할 수 있어야 한다"는
> 프로젝트 목표 대비, 현재 구현이 숨기거나 잘못 표시하고 있는 것들을 찾아 고친다.
>
> **작성 근거**: 2026-08-01 코드 전수 조사(사용자 제기 3건 + 추가 발견 8건).
> **진행 방식**: 티어 단위로 **세션을 나눠서** 진행한다. 한 세션 = 한 티어.

---

## 0. 새 세션 진입 지침 (먼저 읽을 것)

1. **§3 전역 제약**을 먼저 읽는다. 특히 §3-1 번들 예산 —
   **T0을 끝내기 전에는 T1에 착수하지 않는다** (여유가 0.88 KiB뿐이라 들어가지 못한다).
2. **§5 미결 결정**에 이번 티어와 관련된 항목이 있으면 **사용자에게 먼저 확인**한다.
3. **§6 트래커**에서 이번에 할 티어를 확인하고, 끝나면 트래커를 갱신한 뒤 커밋한다.
4. 게이트는 `CLAUDE.md` 규약대로 `npm run check` + `npm run test:e2e` 둘 다 green.
5. 신규 기능은 `SPEC.md`에 Phase 항목을 추가한다. **현재 최신은 Phase 35** → 신규는 36부터.

---

## 1. 배경과 원칙

### 관통 원칙: 자동화를 없애지 말고, 자동화의 **결과를 1급 UI로 승격**하라

이 앱의 가치 제안은 "환경 세팅 부담 없음"이다. 자동 유니폼 주입·자동 vertex 대체·자동 FBO
체이닝을 **제거하면 진입장벽이 되돌아온다**. 목표는 자동화 제거가 아니라,
자동화가 한 일을 **볼 수 있게** 만드는 것이다.

예외는 하나: **`uniformValues` 하드코딩 초기값**(C-2). 이건 소스 어디에도 근거가 없는
진짜 "몰래 넣는 값"이라 제거가 정답이다. GLSL `@default` 힌트로 이관하면 소스가
자기설명적이 된다.

---

## 2. 확정된 문제 목록

### 사용자 제기 3건

#### ① Shader 노드의 vertex/fragment 관계가 안 보인다 → **실제로는 오정보 표시**

| 사실 | 근거 |
|---|---|
| mesh 입력이 없으면 `vertexSource`가 조용히 `fullscreen.vert`로 교체됨 | `src/core/graph/compile.ts:576-578` |
| 그런데 새 Shader 노드는 **항상 `basic.vert`를 들고 태어남** | `src/ui/NodeEditor/AddNodePill.tsx:99`, `src/ui/CommandPalette/index.tsx:231·277·675` |
| → `vertex.glsl` 탭에 보이는 코드가 **실행되지 않는 코드**. 편집해도 화면 불변. UI 표시 0건 | `src/ui/` 전체에 사용자 노출 "fullscreen" 문자열 0건 |
| vertex 에러 발췌는 `compiledVertexSource`(= fullscreen.vert)에서 뽑음 → **에디터에 보이는 소스와 다른 파일의 라인 번호**가 오버레이에 뜸 | `src/ui/Viewport/compileErrorInfo.ts:127-134` (주석이 이 사실을 인지하고 있음) |
| `createChainDemoGraph`의 noise/blur/tonemap 3개 노드가 정확히 이 상태 | `src/state/demoGraph.ts:59·69·78` |
| 두 스테이지를 잇는 유일한 계약인 varying(`v_uv`/`v_normal`/`v_world`)이 어디에도 표시되지 않음 | `src/shaders/basic.vert`, `src/shaders/templates/starter.frag`(15줄 주석은 개발자용) |

#### ② Mesh 포트가 불투명

| 사실 | 근거 |
|---|---|
| 모든 프리미티브·OBJ가 `a_position(3)·a_normal(3)·a_uv(2)` 고정 — 이게 `mesh` 포트의 실제 계약인데 UI는 타입명만 보여줌 | `src/core/assets/primitives.ts`, `src/core/assets/objLoader.ts:78-80` |
| vertex shader가 선언하지 않은 attribute는 **경고 없이 스킵**. `a_UV` 오타 → 에러 없이 0 | `src/core/gl/mesh.ts:36` |
| **Compute 노드는 이미 제대로 노출하고 있다** (`a_position → v_position (3, seed=sphere)`) — Mesh만 블랙박스 | `src/ui/Panels/Inspector.tsx:301` |
| Compute 출력도 타입이 `mesh`라 같은 포트에 꽂히지만 실체는 TF ping-pong 버퍼 | `src/core/nodes/registry.ts:130` |

#### ③ 암묵적 주입 → **성격이 다른 두 문제가 섞여 있음**

**(a) `u_time` 계열 = 진짜 시스템 유니폼.** 8개(`src/core/graph/uniformParser.ts:67`).
자동화 자체는 정당(Shadertoy 관례)하나 **가시성이 0**. 특히 조건부 바인딩이 치명적:

> `u_view`/`u_proj`/`u_model`/`u_camera`는 `meshIsFullscreen === false`일 때만 바인딩.
> 풀스크린 패스에서 쓰면 조용히 영행렬.
> 설명 문자열에 "(fullscreen 패스에서는 미적용)"이 있으나, **언제가 fullscreen인지를
> UI가 안 알려주므로 무용지물** — ①과 같은 뿌리.

**(b) `u_baseColor`는 시스템 유니폼이 아님.** `starter.frag`가 선언한 평범한 사용자
유니폼. 선언은 소스에 보이므로 추적 가능하다. 진짜 출처 불명은 **`[0.5, 0.7, 1.0]`이라는
값** — 코드 어디에도 근거가 없다 (`AddNodePill.tsx:101`).

### 추가 발견 8건

| ID | 문제 | 근거 |
|---|---|---|
| **L1** | 유니폼이 슬라이더이자 포트인데, 엣지가 연결되면 슬라이더가 **조용히 무력화**. 슬라이더는 여전히 활성이고 값도 움직이는데 화면만 안 변함 | `registry.ts:104`(포트 노출), `execute.ts` `bindUserUniforms`(paramBindings가 덮어씀). `Inspector.tsx`/`UniformControl.tsx`에 connected 체크 **0건** |
| **L2** | 중간 텍스처와 이미지 텍스처의 파라미터가 다름 → 같은 GLSL이 다른 결과 | `texture.ts:29-32` (`CLAMP_TO_EDGE`+`LINEAR`, 밉맵 없음) vs `texture.ts:63-64` (`REPEAT`+`LINEAR_MIPMAP_LINEAR`) |
| **L3** | Y축 규약이 경로마다 다르게 맞춰져 있음 — 실제로는 정렬돼 있으나 **명시가 없어** 추론 불가 | `fullscreen.vert`(좌하단), `texture.ts:53`(`UNPACK_FLIP_Y`), 썸네일 readback의 프래그먼트 Y-flip, `gl_FragCoord`/`u_mouse` 좌하단 |
| **L4** | **알파/블렌딩이 아예 존재하지 않음**. `gl.enable(gl.BLEND)` 호출 0건. `CULL_FACE` 항상 disable. depth test는 fullscreen 여부로 자동 on/off | `execute.ts:344-351` |
| **L5** | **실행 파이프라인을 보여주는 뷰가 없음** ← 프로젝트 목표와 정면 충돌. 위상 순서·패스 수·FBO 해상도·텍스처 유닛 배정·ping-pong read 측이 전부 `ExecutionPlan` 안에만 있음 | `compile.ts` `ExecutionPlan`, StatusBar는 fps/draws/GPU 합계뿐 |
| **L6** | 미연결·미사용 유니폼이 조용함 → "검은 화면, 원인 불명" | `gl/uniforms.ts:20`(`loc === null` → return), `execute.ts` `bindSamplers` 미발견 시 스킵. Architecture.md §2.2·§3.2가 명시 |
| **L7** | Output 분할 레이아웃이 암묵적. 3개일 때 "상단 2칸 + 하단 전폭 1칸"은 추측 불가 | `validate.ts:3`(`MAX_OUTPUTS=4`), `graph/splitLayout.ts`. 툴팁 한 줄이 전부 |
| **L8** | 앱 안에 학습 자료가 사실상 없음. HelpModal은 단축키만, "왜"를 설명하는 인앱 텍스트는 시스템 유니폼 hover 8줄이 전부 | `src/ui/NodeEditor/HelpModal.tsx`, `uniformParser.ts:83` |

---

## 3. 전역 제약 (반드시 먼저 읽을 것)

### 3-1. 번들 예산 — **가장 큰 제약**

- 천장 `396 KiB` gzip (`scripts/check-bundle-size.mjs:54`), **현재 약 395.12 KiB**.
- **여유 0.88 KiB.** 이 계획은 거의 전부 UI 추가라서 T1 하나만으로도 초과가 확실하다.
- 측정은 **Node 22 기준**만 유효하다 (Node ≥24는 zlib-ng라 ~1.8 KiB 낮게 나옴 —
  로컬 PASS가 CI PASS를 보장하지 않는다). `check-bundle-size.mjs:28-37` 참고.
  버전 관리자가 없으면 스크립트 주석의 절차대로:
  `npm i --prefix <tmp> node@22` 후 그 바이너리를 PATH 앞에 두고 build + size:check.

**✅ D-0 결정 완료 (2026-08-01): 선택 1 — 게이트를 고치고 예산을 벌어온다.**
천장을 올리는 대신 **T0**(§4)에서 게이트 기준을 엔트리 청크로 바꾸고
loaders.gl을 동적 import로 분리한다. 근거는 아래 측정.

**2026-08-01 실측 (Node 22.23.2)**

| | 현재 (정적) | loaders.gl 동적 import |
|---|---|---|
| **엔트리 청크** gzip | 392.12 KiB | **349.15 KiB (−42.97, −11%)** |
| 총합 gzip *(현 게이트가 재는 값)* | 395.12 ✅ | **396.30 ❌ FAIL** |

> **첫 로딩을 11% 빠르게 만드는 변경이 현 게이트를 빨갛게 만든다.**
> 청크 분리로 공유 코드 중복 + 청크 오버헤드가 총합을 +1.18 KiB 올리기 때문.
> 사용자가 기다리는 건 총합이 아니라 엔트리 청크인데 게이트는 총합만 본다 —
> **게이트가 잘못된 것을 재고 있다**는 것이 T0의 근거다.

부수 사실:
- 빌드가 스스로 경고한다: 단일 청크 1233 KiB, `"Some chunks are larger than 500 kB"`.
- 기존 코드 스플리팅 버그 1건: `shareUrl.ts`가 `BootstrapGate`에서는 동적,
  `ExportShare/ExportShareDialog.tsx`에서는 정적으로 import돼 동적 분리가 무효화됨
  (vite reporter 경고). T0에서 함께 처리.

### 3-2. 품질 게이트

```bash
npm run check      # typecheck → lint → deadcode → circular → test(+커버리지 임계치)
npm run test:e2e   # Playwright, 별도 실행 필수
```

- Knip: 호출자 없는 export는 즉시 실패 → 새 헬퍼는 **소비자와 같은 커밋**에.
- 커버리지 임계치(lines 50 / functions 47 / branches 42 / statements 50)를 **낮추지 말 것**.
  신규 UI는 단위 테스트 동반.
- `biome-ignore` 신규 추가 금지(사유+대안 검토 보고 후 합의).

### 3-3. 디자인 SSoT

`design/` 번들이 UI의 정본이다(v2.0 breaking 재설계 → v2.1 → v2.2 확정).
**도킹 패널을 6번째로 추가하는 것은 디자인 정본 이탈**이다:

```
src/state/dockTree.ts:25-30
export type DockPanelId = "nodeEditor" | "viewport" | "inspector" | "code" | "assets";
```

`DOCK_PANEL_IDS`, `sanitizeDockLayoutSnapshot`, `DockPanelHeader`, `DockLayout`,
기본 트리를 전부 건드려야 하고 **디자인 라운드가 필요**하다. → **결정 D-1** (§5).

대안 선례: `DiagnosticsPanel`은 도킹 탭이 아니라 **하단 트랜지언트 오버레이**
(`debugUiStore.open` 단일 출처, `src/ui/Panels/StatusOverlays.tsx`).
D-1(Pass Inspector)에 이 패턴을 재사용하면 디자인 정본을 안 건드린다.

### 3-4. E2E

`tests/e2e/` Phase 스펙. **expect 약화·skip·fixme 금지**. 의도된 동작 변경이면
사용자 합의 후 스펙 갱신. 신규 기능은 새 스펙 파일 추가.

---

## 4. 티어별 작업 패키지

---

### ⚪ T0 — 번들 예산 확보 (준비 작업, T1의 선행 조건)

> **D-0 선택 1의 실행.** 천장을 올리지 않고 게이트를 고쳐서 예산을 벌어온다.
> 기능 변경 0 — 순수 배관 작업이라 이 티어만 UI 회귀 위험이 사실상 없다.
> 완료 시 엔트리 기준 **~26 KiB 여유**가 생겨 T1~T3 전체를 담는다.

#### T0-1 · 게이트 기준을 "전체 합계" → "엔트리 청크"로 변경

**목적**: 코드 스플리팅이 게이트에 의해 처벌받는 현 상태를 없앤다. 사용자 체감
로딩 시간을 결정하는 값(엔트리 청크)을 재고, 총합은 느슨한 안전망으로만 남긴다.

**엔트리 청크 식별 방법** — 세 가지 중 택1:
1. ✅ **vite manifest** — `vite.config.ts`에 `build: { manifest: true }` 추가 →
   `dist/.vite/manifest.json`에서 `isEntry: true` 항목을 찾는다. 가장 명시적.
   `base`가 GitHub Pages에서 `/Shader-Playground/`로 바뀌어도 영향 없음.
2. `dist/index.html`의 `<script type="module" src>` 파싱 — 간단하지만
   `base` 접두사 처리가 필요.
3. 파일명 패턴(`index-*.js`) — **채택 금지**. 취약하다.

**제안 한도** (구현 시 실측 후 확정 — 아래는 실측 349.15 KiB 기준 산정):

| 그룹 | 한도 | 근거 |
|---|---|---|
| **entry** | **375 KiB** | 실측 349.15 + ~26 KiB 여유. T1~T3 추정 증가분(~25 KiB)을 담되 예상 밖 급증은 잡는다 |
| total (안전망) | 430 KiB | 실측 396.30 + 여유. 청크 수가 늘어도 전체가 폭주하지 않게만 감시 |

**변경 파일**
- `scripts/check-bundle-size.mjs` — `LIMITS_KIB`를 `{ entry, total }`로 확장,
  `checkGroup`을 두 번 호출. **기존 주석의 이력(360→396)은 보존**하고 그 아래에
  T0 전환 사유를 이어 적는다 (이 파일의 주석이 예산 결정의 유일한 기록이다).
- `vite.config.ts` — 방법 1 채택 시 `build.manifest`
- `.github/workflows/check.yml` — 변경 불필요 (`npm run size:check` 그대로)

**수용 기준**
1. Node 22에서 `npm run size:check`가 entry/total 두 줄을 각각 보고하고 green.
2. 엔트리를 식별하지 못하면 **exit 2로 실패**한다 (조용히 통과 금지 —
   기존 `ENOENT` 분기와 같은 방침).
3. 기존 Node 버전 경고(`reportNodeContext`)는 그대로 동작.

---

#### T0-2 · loaders.gl 동적 import

**목적**: 엔트리에서 43 KiB gzip 제거. `.obj`/`.gltf` 임포트는 사용자가 파일
선택 다이얼로그를 거친 뒤에만 일어나는 드문 경로라 청크 fetch 지연이 체감되지 않는다.

**구현** — 두 호출부 모두 이미 `async` 함수 안의 `await`라 변환이 자명하다
(`src/state/assetActions.ts:106·124`):

```ts
// import { loadObjFromFile } from "../core/assets/objLoader";  ← 제거
const { loadObjFromFile } = await import("../core/assets/objLoader");
```

분리 결과 (실측): `objLoader` 14.18 KiB + `gltfLoader` 29.98 KiB gzip.
`gltfLoader.ts`가 `objLoader.ts`의 `toGeometryHandle`을 import하므로 둘 다
동적이어야 엔트리에서 완전히 빠진다.

**확인 필요 항목**
- **단위 테스트**: `src/state/assetActions.test.ts:7-10`이 `vi.mock`으로 두 모듈을
  모킹한다. vitest의 `vi.mock`은 동적 `import()`도 가로채므로 **무수정 통과가
  예상**되지만 반드시 실행해 확인할 것.
- **Knip**: `knip.json`의 `entry`가 테스트 파일이고 테스트가 두 모듈을 정적
  import하므로 데드코드 판정에 영향 없음.
- **E2E**: `tests/e2e/phase-7-8-assets-serialization.spec.ts`가 에셋 임포트를
  검증한다. dev 서버는 동적 import를 네이티브로 서빙하므로 통과 예상.
- **실패 경로**: 청크 fetch 실패(오프라인·배포 중 캐시 불일치) 시 현재는
  `importFile`의 예외가 상위로 전파된다. 기존 에러 토스트 경로에 잡히는지 확인하고,
  안 잡히면 `toast.error` 추가.

---

#### T0-3 · `shareUrl` 정적/동적 import 충돌 해소

**목적**: 기존 코드 스플리팅 버그. `BootstrapGate.tsx`가 `shareUrl.ts`를 동적
import하는데 `ExportShare/ExportShareDialog.tsx`가 정적 import해서 동적 분리가
무효화된다 (vite reporter가 매 빌드 경고).

**선택지**: ① `ExportShareDialog` 쪽도 동적으로 ② `BootstrapGate` 쪽을 정적으로
되돌리고 경고 제거. **①이 맞다** — 부트 경로에서 빼는 게 원래 의도다.
다만 `ExportShareDialog` 자체가 이미 지연 로드되는지 먼저 확인할 것.

---

**T0 완료 조건**: 위 3개 + `npm run check` + `npm run test:e2e` green
+ **Node 22 실측**으로 entry/total 수치 기록 + `scripts/check-bundle-size.mjs`
주석에 전환 사유 기록 + §6 트래커 갱신.

**T0 후 예상 상태**: entry ~349 / 375 KiB (여유 ~26), total ~396 / 430.

---

### 🔵 T1 — 정직성 회복 (최우선)

> 네 항목 모두 뿌리가 같다: **`ExecutionPlan`이 이미 알고 있는 사실을 UI로 올리기.**
> 신규 계산 거의 0, 노출만 하면 된다. 함께 하면 배관이 공유돼 중복이 없다.

#### A-1 · 풀스크린 대체를 정직하게 표시 — **버그에 가까움, 최우선**

**목적**: 실행되지 않는 코드를 실행되는 것처럼 보여주는 상태를 없앤다.

**구현 노트**
- 필요한 데이터는 **이미 스토어에 있다**: `plan.compiledVertexSource[id]`가
  `Viewport/index.tsx:233-234`에서 `diagnosticsStore`로 매 recompile 발행된다
  (에러 유무와 무관하게 모든 shader 노드에 대해).
- 다만 **불리언 "이 노드는 fullscreen으로 컴파일됨"이 UI에 없다.** 두 가지 방법:
  - ❌ *그래프에서 유추*(`(id,'mesh')` 타깃 엣지 유무) — **부정확**. mesh 노드가 있어도
    에셋 미로드로 `meshDataFor`가 null이면 fullscreen으로 떨어지고(`compile.ts:560-565`),
    compute 소스의 패스 생성이 실패해도 마찬가지다.
  - ✅ *plan에서 발행* — `ShaderPass.meshIsFullscreen`이 이미 존재(`compile.ts:71·661`).
    `shaderPassByNode.get(id).meshIsFullscreen`을 recompile 시 스토어로 발행.
- **엣지 케이스**: cycle 등 fatal validate에서는 `emptyPlan`이라
  `compiledVertexSource: {}` — 이때 배지 상태를 어떻게 할지 정할 것(직전 값 유지 권장).

**변경 파일**
- `src/state/diagnosticsStore.ts` — `meshIsFullscreen?: boolean` 추가
  (또는 별도 leaf 스토어. 순환 의존 주의 — `npm run circular`)
- `src/ui/Viewport/index.tsx` — recompile 루프에서 발행
- `src/ui/CodeEditor/StageTabs.tsx` — vertex 탭 라벨 `fullscreen.vert (auto)`
- `src/ui/CodeEditor/index.tsx` — fullscreen일 때 **컴파일된 소스를 읽기 전용으로** 표시
- `src/ui/NodeEditor/nodes/ShaderNodeView.tsx` — `FULLSCREEN` 배지

**수용 기준**
1. mesh 미연결 Shader 노드 선택 → vertex 탭이 `fullscreen.vert (auto)`로 표시되고
   내용이 실제 `fullscreen.vert`, 편집 불가.
2. mesh 연결 → 탭이 사용자 소스로 복귀, 편집 가능.
3. Chain 데모 3개 노드가 즉시 정직해진다(회귀 확인 지점).
4. vertex 에러 오버레이의 발췌 라인이 화면에 보이는 소스와 일치.

**테스트**: 단위(스토어 발행 + 탭 라벨 분기), E2E 신규 스펙(`phase-36-*.spec.ts`).
**리스크**: `phase-3-4-editor-uniform`, `phase-9-editor-ux`, `m7-code-auto-open`이
vertex 탭 내용을 가정할 수 있음 → 먼저 확인.

---

#### D-1 · Pass Inspector — **목표 대비 ROI 최고**

**목적**: "이 프레임에 실제로 무엇이 어떤 순서로 실행되는가"를 보여준다. L5 해소.

**표시할 것** (전부 `plan`에 이미 있음 — 신규 계산 0)

| # | 노드 | kind | FBO | mesh 출처 | samplers | GPU ms |
|---|---|---|---|---|---|---|
| 0 | compute1 | compute | — | POINTS ×1024, read=A | — | 0.31 |
| 1 | noise1 | shader | 1920×1080 (1×) | fullscreen quad | — | 0.42 |
| 2 | blur1 | shader | 960×540 (0.5×) | fullscreen quad | u_tex ← noise1 (unit 0) | 1.08 |

**데이터 출처**: `plan.passes[]`(위상 순서 보존), `pass.width/height`,
`pass.samplers[]`(uniformName·sourceNodeId·unit), `pass.meshIsFullscreen`,
`pass.meshComputeNodeId`, ComputePass의 `read`/`count`/`primitive`,
`gpuTimerStore.byNode`(EMA 이미 존재).

**배치**: **결정 D-1 필요**(§5). 기본 권장은 `StatusOverlays` 트랜지언트 오버레이 패턴.

**변경 파일**
- `src/state/` — plan 요약을 발행할 leaf 스토어 신설(예: `passPlanStore.ts`).
  **순환 주의**: 스토어끼리 직접 import 금지 규약(`CLAUDE.md §1-4`).
- `src/ui/Viewport/index.tsx` — recompile 시 요약 발행 (**RAF hot path 아님, recompile만**)
- `src/ui/Panels/PassInspector.tsx` (신규) + 진입점(오버레이 토글 또는 탭)

**수용 기준**
1. 데모 4종 각각에서 패스 수·순서가 `executePlan` 실행 순서와 일치.
2. `resolutionScale` 0.5× 설정 시 해당 행의 FBO가 절반으로 표시.
3. 컴퓨트 데모에서 ping-pong read 측이 프레임마다 A/B로 토글되는 게 보임.
4. GPU 타이머 미지원 환경에서 ms 열이 깨지지 않음.

**리스크**: recompile마다 요약 객체 생성 → 큰 그래프에서 GC 압력. 얕은 요약만 만들 것.

---

#### C-1 · 시스템 유니폼 섹션

**목적**: ③(a) 해소. A-1과 짝.

**구현 노트**
- Inspector에 "System uniforms (auto-bound)" 섹션. **이 노드 소스가 선언한 것만** 표시.
- 각 행: 이름 / 타입 / 현재 값 / **바인딩 여부**.
- `u_view`·`u_proj`·`u_model`·`u_camera`는 fullscreen 패스에서 `not bound (fullscreen pass)`
  회색 처리 ← A-1의 `meshIsFullscreen` 발행을 그대로 재사용.
- 설명 문자열은 `SYSTEM_UNIFORM_DESCRIPTIONS`(`uniformParser.ts:83`) 재사용.

**변경 파일**: `src/ui/Panels/Inspector.tsx` (+ 필요 시 소분할 컴포넌트)

**수용 기준**: fullscreen 노드에서 `u_view`를 선언하면 "미바인딩"으로 표시된다.

---

#### B-1 · Mesh attribute 계약 노출

**목적**: ② 해소. **Compute 노드가 이미 하는 것과 같은 패턴**(`Inspector.tsx:301`)이라
UI 선례가 있다.

**구현 노트**
- Mesh 노드 카드 / mesh 포트 hover에 `a_position vec3 · a_normal vec3 · a_uv vec2`,
  `vertexCount`, `indexCount`, `primitive` 표시.
- 프리미티브는 `primitives.ts`가 고정 3종을 내므로 정적으로 알 수 있고,
  에셋 메시는 `assetStore.meshes[id].data.attributes`에서 읽는다.

**변경 파일**: `src/ui/NodeEditor/nodes/MeshNodeView.tsx`,
`src/ui/NodeEditor/nodes/PortHandle.tsx`(툴팁), `src/ui/Panels/Inspector.tsx`(Mesh 섹션 — 현재 없음)

**수용 기준**: 프리미티브 5종 + 임포트한 OBJ/glTF 모두에서 attribute 목록이 정확.

---

**T1 완료 조건**: 위 4개 + `npm run check` + `npm run test:e2e` green + 번들 천장 준수
+ `SPEC.md` Phase 항목 추가 + 이 문서 §6 트래커 갱신.

---

### 🟡 T2 — 침묵 제거

> 조용한 실패를 진단으로 승격. T1의 배관(plan 요약 발행)을 재사용한다.

#### E-1 · 미연결 sampler / 미사용 유니폼 경고
- ProblemsPanel에 warning 행:
  `u_tex: sampler 선언됐으나 연결된 엣지 없음 → 검은색 샘플링`
  `u_foo: 선언됐으나 프로그램에 존재하지 않음(미사용/최적화 제거)`
- 데이터: `parseUniforms` 결과 ∖ `pass.samplers`/`paramBindings`,
  그리고 `program.uniforms`의 `loc` 유무(`gl/program.ts`).
- **주의**: GLSL 옵티마이저가 제거한 유니폼과 사용자 오타를 구분할 수 없다.
  문구를 단정적으로 쓰지 말 것.
- 파일: `src/ui/Panels/ProblemsPanel.tsx`, `src/state/diagnosticsStore.ts`

#### E-4 · 연결된 유니폼의 슬라이더 무력화 표시 (L1)
- 엣지가 연결된 유니폼은 Inspector 슬라이더를 비활성 + `driven by <노드명>` 표시.
- 데이터: `graphStore.edges`에서 `(target=nodeId, targetHandle=uniformName)` 조회.
- 파일: `src/ui/Panels/Inspector.tsx`, `src/ui/Panels/UniformControl.tsx`

#### B-2 · mesh attribute 소비 여부 체크
- 연결된 vertex shader가 선언한 attribute에 ✓, 안 쓰는 것에
  `제공되지만 미선언(스킵됨)`. `mesh.ts:36`의 조용한 스킵을 UI로 승격.
- **오타 탐지 장치**로서 가치가 크다(`a_UV` → 즉시 눈에 보임).
- 데이터: `program.attributes`(`uploadMesh`에 넘기는 `attribLocations`) vs MeshData.
  → `plan`에 attribute 매칭 결과를 실어 보내야 할 수 있음.
- 파일: `src/core/graph/compile.ts`(요약 발행), `src/ui/NodeEditor/nodes/MeshNodeView.tsx`

---

### 🟢 T3 — 잘못된 멘탈 모델 교정

#### C-2 · `uniformValues` 하드코딩 초기값을 `@default`로 이관 — **③(b)의 진짜 해법**

`uniformParser`는 **이미 `@default V1, V2, V3`를 지원한다**(`uniformParser.ts` 힌트 파서).
따라서 템플릿에:

```glsl
// @color @default 0.5, 0.7, 1.0
uniform vec3 u_baseColor;
```

로 적고, 노드 생성 시의 `uniformValues: { u_baseColor: [...] }` 하드코딩을 제거하면
**"시스템이 몰래 넣는 값"이 문자 그대로 사라진다.** 파서 변경 불필요.

- 파일: `src/shaders/templates/starter.frag`, `src/ui/NodeEditor/AddNodePill.tsx:101`,
  `src/ui/CommandPalette/index.tsx:233·279·677`, `src/state/demoGraph.ts`
- **주의**: 기존 저장 프로젝트(autosave/share URL)에 이미 `uniformValues`가 들어 있다.
  하위 호환 확인 — 저장된 값이 `@default`를 이기는 게 맞다(현재 동작과 동일).
- 검증: `src/state/shareUrl.test.ts:18`이 `u_baseColor`를 가정 → 갱신 필요.

#### E-2 · 렌더 상태 표시 (L4)
- Pass Inspector 행에 `blend off · cull off · depth on|off` 표시.
- **최소한 알파가 무시된다는 사실을 어딘가에 명시.** 현재는 `outColor.a`를 써도
  아무 일도 안 일어나고 설명이 없다.
- 선택: 블렌딩을 실제로 노출할지는 별도 논의(포트/노드 옵션 추가 = 범위 확대).

#### E-3 · 텍스처 파라미터 표시/조작 (L2)
- Image 노드와 Shader 노드(FBO)에 wrap/filter/mipmap 표시.
- **가능하면 Image 노드는 선택 가능하게** — "wrap이 뭔지"를 실험으로 배우게 된다.
  이 경우 `ImageGraphNode`에 필드 추가 → 직렬화/sanitize/undo 경로 전부 영향.

#### F-1 · 좌표계 설명 카드 (L3)
- HelpModal에 탭 추가: UV 원점 · `gl_FragCoord` · `u_mouse` · 이미지 flip이
  어떻게 맞물리는지 한 장.
- 파일: `src/ui/NodeEditor/HelpModal.tsx`

#### F-2 · 데모를 레슨화 (L8, 저비용)
- 기존 데모 4종에 Group 노드 `label`로 단계 설명 삽입. 코드 변경 최소.
- 파일: `src/state/demoGraph.ts`

---

### 🟣 T4 — 구조적 개선 (별도 설계 라운드)

#### A-2 · varying 계약 시각화 (권장 중간안)
- 노드 카드/Inspector에 `vertex ▸ fragment` 사이 **varying 브리지 섹션**.
- `v_uv vec2 ✓ · v_normal vec3 (미사용) · v_world vec3 (미사용)` —
  vertex의 `out` ∩ fragment의 `in` 매칭 표시.
- fragment가 받는데 vertex가 안 주면 **링크 에러 사전 경고**. 진짜 학습 장치.
- 데이터: `src/core/glsl/symbolTable.ts`가 이미 심볼을 파싱한다 → 재사용 가능성 확인.

#### A-3 · Shader 노드를 vertex/fragment 두 노드로 분리
- **breaking**. GLSL 프로그램은 링크 단위라 varying 계약을 엣지로 표현해야 함.
- 직렬화 v1 → v2 마이그레이션, `ExecutionPlan` 구조 변경, E2E 대부분 영향.
- **A-2를 먼저 해보고 그래도 부족할 때만** 착수. 별도 계획 문서 필요.

---

## 5. 미결 결정 사항 (사용자 확인 필요)

| ID | 결정 | 필요 시점 | 기본 권장 |
|---|---|---|---|
| ~~**D-0**~~ | ~~번들 천장 상향~~ → **✅ 결정 완료 (2026-08-01): 선택 1 — 천장을 올리지 않고 게이트를 엔트리 청크 기준으로 고친 뒤 loaders.gl 분리로 예산 확보.** → **T0** 신설 | — | 근거는 §3-1 실측표 |
| **D-0a** | T0-1의 **entry/total 한도 확정** — 제안값 entry 375 / total 430 | T0 구현 중 | 제안값 그대로. 실측 후 조정하되 entry 여유는 20~30 KiB 범위 유지(그 이상이면 래칫이 헐거워짐) |
| **D-0b** | T0-1의 **엔트리 식별 방법** — vite manifest / index.html 파싱 / 파일명 패턴 | T0 구현 중 | vite manifest (`build.manifest: true`). `base` 변화에 영향받지 않는다 |
| **D-1** | **Pass Inspector의 배치** — ① 6번째 도킹 패널(디자인 라운드 필요) ② `StatusOverlays` 트랜지언트 오버레이(디자인 정본 무영향) ③ Inspector 내부 섹션 | T1 | **②**. `debugUiStore`/`DiagnosticsPanel` 선례가 있고 정본을 안 건드린다 |
| **D-2** | A-1에서 fullscreen 시 vertex 탭을 **읽기 전용 컴파일 소스**로 바꿀지, **사용자 소스 + 경고 배너**로 둘지 | T1 | 읽기 전용 컴파일 소스. "보이는 것 = 도는 것"이 이 계획의 요지 |
| **D-3** | E2E 스펙 신규 추가 범위 — 티어마다 새 Phase 스펙을 붙일지, T1~T3 묶어 하나로 | T1 | 티어마다. 회귀 추적이 쉽다 |
| **D-4** | E-3에서 Image 노드 wrap/filter를 **조작 가능**하게 만들지(= 노드 스키마 확장, 직렬화 영향) 아니면 표시만 할지 | T3 | 조작 가능. 학습 가치가 가장 큰 항목이지만 범위가 커진다 |
| **D-5** | A-3(노드 분리)까지 갈지 | T4 | A-2 결과를 보고 판단 |

---

## 6. 진행 상황 트래커

> 각 세션 종료 시 이 표를 갱신하고 커밋할 것.

| 티어 | 항목 | 상태 | 브랜치/PR | 비고 |
|---|---|---|---|---|
| — | D-0 번들 예산 방침 결정 | ✅ 완료 | — | 2026-08-01 선택 1 확정 → T0 신설 |
| — | D-1 Pass Inspector 배치 결정 | ⬜ 미착수 | — | T1 착수 전 |
| **T0** | **T0-1 게이트를 엔트리 청크 기준으로** | ✅ 완료 | feat/learnability-2026-08 | **T1의 선행 조건** |
| **T0** | **T0-2 loaders.gl 동적 import** | ✅ 완료 | feat/learnability-2026-08 | 엔트리 −43 KiB 실측 완료 |
| **T0** | **T0-3 shareUrl import 충돌 해소** | ✅ 완료 | feat/learnability-2026-08 | 기존 버그 |
| T1 | A-1 풀스크린 대체 표시 | ⬜ 미착수 | — | |
| T1 | D-1 Pass Inspector | ⬜ 미착수 | — | |
| T1 | C-1 시스템 유니폼 섹션 | ⬜ 미착수 | — | |
| T1 | B-1 Mesh attribute 노출 | ⬜ 미착수 | — | |
| T2 | E-1 미연결/미사용 경고 | ⬜ 미착수 | — | |
| T2 | E-4 연결된 슬라이더 표시 | ⬜ 미착수 | — | |
| T2 | B-2 attribute 소비 체크 | ⬜ 미착수 | — | |
| T3 | C-2 `@default` 이관 | ⬜ 미착수 | — | |
| T3 | E-2 렌더 상태 표시 | ⬜ 미착수 | — | |
| T3 | E-3 텍스처 파라미터 | ⬜ 미착수 | — | |
| T3 | F-1 좌표계 카드 | ⬜ 미착수 | — | |
| T3 | F-2 데모 레슨화 | ⬜ 미착수 | — | |
| T4 | A-2 varying 브리지 | ⬜ 미착수 | — | 별도 설계 |
| T4 | A-3 노드 분리 | ⬜ 보류 | — | A-2 결과 후 판단 |

**상태 표기**: ⬜ 미착수 / 🟨 진행중 / ✅ 완료 / ⏸ 보류 / ❌ 취소

---

## 7. 참고

- `Architecture.md` — §2.2(포트 동적 생성) · §3.1(컴파일 절차) · §3.2(sampler vs param) · §4.4(시스템 유니폼)
- `SPEC.md` — Phase별 명세 (최신 Phase 35)
- `CLAUDE.md` — 품질 게이트 규약, 게이트 우회 금지 목록
- `design/CHANGELOG.md` — UI 정본 v2.0/v2.1/v2.2
- `scripts/check-bundle-size.mjs` — 번들 천장의 역사와 측정 주의사항

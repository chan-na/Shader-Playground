# ShaderPlayground 스펙

WebGL2 기반 쉐이더 작성/체이닝 플레이그라운드. 노드 그래프로 메시·텍스처·쉐이더를 연결하고, 인라인 에디터에서 GLSL을 작성·디버깅한다.

---

## 1. 기술 스택 선정

### 1.1 UI 프레임워크: **React 18 + TypeScript**

현재 스캐폴드는 바닐라 TS이지만, 다음 이유로 React 도입을 권장한다.

- 노드 에디터·코드 에디터·인스펙터 등 **상태 의존 UI가 다수**라서 직접 DOM을 다루면 비용이 빠르게 커진다.
- 본 스펙에서 채택하는 라이브러리(React Flow, CodeMirror 6, Monaco 등) 모두 React 통합이 가장 성숙하다.
- 렌더 루프(WebGL)는 React 외부에서 RAF로 독립 구동하므로, React가 **UI 레이어에 한정**되어 성능 영향이 없다.

대안: 바닐라 유지(Litegraph.js 채택 시 가능). 단, 우측 패널·모달·다이얼로그 등 일반 UI 비용이 직접 늘어난다.

### 1.2 노드 그래프: **React Flow (`@xyflow/react`) v12**

| 후보 | 채택 여부 | 이유 |
|---|---|---|
| **React Flow** | ✅ | TS 일급 지원, 커스텀 노드/엣지 자유도 높음, 핸들 기반 연결 검증 API, 미니맵·줌·자동 레이아웃 등 표준 인프라가 갖춰짐, 활발한 유지보수. |
| Litegraph.js | ❌ | ComfyUI에서 검증된 안정성과 캔버스 기반 성능은 매력적이나, 자체 캔버스라 React 위젯(코드 에디터, 색상 피커 등) 임베드가 까다롭다. TS 타입도 비공식. |
| Rete.js v2 | ❌ | 플러그인 아키텍처가 강력하지만 학습 곡선이 가파르고, 본 프로젝트 규모에는 과하다. |
| Drawflow / baklavajs | ❌ | 커뮤니티·문서가 얕다. |

### 1.3 코드 에디터: **CodeMirror 6**

| 후보 | 채택 여부 | 이유 |
|---|---|---|
| **CodeMirror 6** | ✅ | 모듈식이라 번들 크기 작음(코어 ~50KB), `@codemirror/lint`로 인라인 에러 표시가 1급 지원, Vite 친화적, GLSL은 `codemirror-lang-glsl` 또는 C 문법으로 충분히 커버. |
| Monaco | △ | VS Code급 UX지만 Web Worker 번들이 무거움(>2MB). 향후 GLSL LSP 서버를 붙일 계획이 생기면 재검토. |
| Ace | ❌ | GLSL 모드 내장은 장점이지만 API가 구식이고 React 통합이 약하다. |

**인라인 에러 표시**는 GLSL 컴파일러 로그(`gl.getShaderInfoLog`)를 파싱해 라인 번호 → CodeMirror `Diagnostic`으로 매핑한다. 일부 드라이버는 `0:line:column` 포맷을 쓰므로 정규식 파서 모듈을 둔다.

### 1.4 메시 로더: **`@loaders.gl/gltf` + `@loaders.gl/obj`**

| 후보 | 채택 여부 | 이유 |
|---|---|---|
| **loaders.gl** | ✅ | three.js 의존성 없이 독립 사용 가능. OBJ/GLTF/PLY/Draco까지 모듈식 추가 가능. WebGL 친화적인 typed-array 출력. |
| three.js loaders | ❌ | 본 프로젝트는 raw WebGL2를 직접 다루는 것이 학습 목적이라 three.js 코어를 끌어오기엔 무겁다. |
| 자체 파서 | △ | OBJ는 가능하지만 GLTF의 binary/glb·extensions까지 직접 짜는 것은 가성비가 낮다. |

기본 프리미티브(cube, sphere, plane, torus, quad)는 **하드코딩 생성기**로 제공한다(외부 의존성 없음). GLTF는 **지오메트리만** 사용하고, 머티리얼·애니메이션·스킨은 무시한다(쉐이더는 사용자가 그래프에서 구성하므로 GLTF 머티리얼은 의미가 없다).

### 1.5 이미지 로더: **브라우저 네이티브 (`createImageBitmap`)**

PNG/JPG/WebP는 `createImageBitmap` → `gl.texImage2D`로 충분. HDR/EXR을 다룰 계획이 생기면 `parse-hdr` 또는 `tinyexr-wasm`을 옵션 의존성으로 추가한다.

### 1.6 상태 관리: **Zustand**

그래프 노드/엣지·셀렉션·에셋 카탈로그 등 다수의 독립 스토어가 필요하다. Redux는 보일러플레이트가 과하고, React Context는 노드 다수 환경에서 렌더 비용이 커진다. Zustand는 selector 기반 부분 구독이 강력해 노드 그래프 시나리오에 적합하다.

### 1.7 WebGL 보조: **twgl.js (선택)** + 자체 얇은 래퍼

raw WebGL2를 직접 쓰되, 유니폼 setter·텍스처 생성·FBO 등 보일러플레이트가 많은 부분만 `twgl.js`로 보조한다. 학습 목적이 강하다면 자체 래퍼만으로 진행해도 무방.

### 1.8 빌드/툴

- **Vite 6** (현행 유지). `?raw` import로 GLSL 텍스트 로드.
- **TypeScript ~5.6** (현행 유지).
- 포맷터/린터: **Prettier + ESLint (typescript-eslint)** — 신규 추가 권장.
- 테스트: **Vitest** — 그래프 토폴로지 정렬, GLSL 에러 파서 등 순수 로직 단위 테스트.

### 1.9 의존성 요약

```jsonc
{
  "dependencies": {
    "react": "^18.3.0",
    "react-dom": "^18.3.0",
    "@xyflow/react": "^12.0.0",
    "zustand": "^5.0.0",
    "codemirror": "^6.0.0",
    "@codemirror/state": "^6.0.0",
    "@codemirror/view": "^6.0.0",
    "@codemirror/language": "^6.0.0",
    "@codemirror/lint": "^6.0.0",
    "codemirror-lang-glsl": "^1.0.0",
    "@loaders.gl/core": "^4.0.0",
    "@loaders.gl/gltf": "^4.0.0",
    "@loaders.gl/obj": "^4.0.0",
    "twgl.js": "^5.5.0",
    "gl-matrix": "^3.4.3"
  },
  "devDependencies": {
    "typescript": "~5.6.3",
    "vite": "^6.0.0",
    "@vitejs/plugin-react": "^4.0.0",
    "vitest": "^2.0.0",
    "eslint": "^9.0.0",
    "prettier": "^3.0.0"
  }
}
```

---

## 2. 아키텍처 설계

### 2.1 레이어 분리

```
┌─────────────────────────────────────────────────┐
│ UI Layer (React)                                │
│   NodeEditor · CodeEditor · Viewport · Panels   │
└──────────────┬──────────────────────────────────┘
               │ commands / state subscriptions
┌──────────────▼──────────────────────────────────┐
│ State Layer (Zustand stores)                    │
│   graphStore · assetStore · selectionStore      │
└──────────────┬──────────────────────────────────┘
               │ graph snapshot
┌──────────────▼──────────────────────────────────┐
│ Core Layer (pure TS, framework-agnostic)        │
│   GraphCompiler → ExecutionPlan → Renderer      │
│   AssetLoaders (mesh/image)                     │
└──────────────┬──────────────────────────────────┘
               │ WebGL2 calls
┌──────────────▼──────────────────────────────────┐
│ WebGL2 (canvas)                                 │
└─────────────────────────────────────────────────┘
```

핵심 원칙: **Core Layer는 React를 모른다.** UI 없이도 그래프를 실행해 PNG 덤프 등 헤드리스 사용이 가능하도록 한다.

### 2.2 노드 모델

세 가지 노드 종류와 포트 타입을 다음과 같이 정의한다.

| 노드 | Inputs | Outputs |
|---|---|---|
| **MeshNode** | (없음) — 프리셋 선택/파일 핸들 | `mesh: GeometryHandle` |
| **ImageNode** | (없음) — 파일 핸들 | `texture: TextureHandle` |
| **ShaderNode** | `mesh: GeometryHandle?`, `samplers: TextureHandle[]`, `uniforms: scalar/vec` (자동 추출) | `texture: TextureHandle` (FBO 컬러 어태치먼트) |
| **OutputNode** (명시적, 최대 1개) | `texture: TextureHandle` × 1 | (캔버스 출력) |

- 쉐이더 노드 출력은 항상 **오프스크린 텍스처**(FBO에 렌더). 이 텍스처를 다음 쉐이더의 sampler 입력으로 그대로 연결.
- 메시 입력이 없는 쉐이더 노드는 **풀스크린 쿼드**로 자동 폴백(포스트프로세싱 패스).
- 포트 타입이 다르면 React Flow 레벨에서 연결을 거부(`isValidConnection`).
- 한 출력은 여러 입력으로 분기 가능(1:N), 단 한 입력에는 하나의 소스만(N:1 금지).
- **Output 노드는 자동으로 추론하지 않는다.** 사용자가 명시적으로 배치하고 입력을 연결해야 캔버스에 그려진다. Output 노드가 없거나 입력이 비어 있으면 캔버스는 placeholder(어두운 배경 + "Connect an Output node to render" 안내)를 표시한다.
- Output 노드는 그래프당 0~1개로 제한한다(컴파일러가 검증, 2개 이상이면 에러). 멀티뷰포트 사용 사례는 후속 페이즈에서 검토.
- Output 노드의 단일 입력 포트 타입은 `texture`. 메시·이미지를 직접 꽂을 수 없으며, 반드시 ShaderNode 출력을 거쳐야 한다(이미지를 그대로 보여주려면 패스스루 쉐이더 노드 사용).

#### 2.2.1 ShaderNode 내부 구조

각 ShaderNode는 **vertex 쉐이더와 fragment 쉐이더 GLSL 소스를 둘 다 보유**하며, 코드 에디터에서 탭으로 전환해 편집한다.

- 두 쉐이더는 함께 한 GL 프로그램으로 링크되며, 둘 중 하나라도 컴파일/링크 실패 시 해당 노드는 빨간 상태 + Diagnostic 누적.
- 메시 입력이 있을 때: vertex 쉐이더는 메시의 attribute(`a_position`, `a_normal`, `a_uv` 등) + 카메라 유니폼(`u_view`, `u_proj`)을 받는다.
- 메시 입력이 없을 때: 빌트인 풀스크린 쿼드 vertex가 자동 사용되고, 사용자가 작성한 vertex 쉐이더는 무시된다(에디터에서 dim 처리 + 안내 표시).

#### 2.2.2 유니폼 자동 추출

GLSL 소스에서 `uniform <type> <name>;` 선언을 정규식 + 토큰 파서로 추출해 인스펙터에 자동으로 컨트롤을 띄운다.

- 추출 트리거: 코드 변경 디바운스(50ms)와 동일 타이밍.
- 자동 매핑: `float` → 슬라이더, `vec2/3/4` → 다축 슬라이더, `vec3`/`vec4`로 이름이 `*Color`/`u_color*`이면 컬러 피커, `sampler2D` → 입력 포트로 노출(인스펙터에 안 띄움).
- 시스템 유니폼은 자동 바인딩되어 인스펙터에서 숨김: `u_time`(float), `u_resolution`(vec2), `u_view`/`u_proj`/`u_model`(mat4).
- 슬라이더 범위는 기본값(`0..1`, `-1..1` 등)을 타입별로 가지며, 향후 GLSL 주석 힌트(`// @range 0..10`)로 오버라이드 가능하도록 파서를 확장 여지로 둔다(MVP 외).
- **유니폼 컨트롤은 노드 카드 안에 두지 않는다.** 노드를 선택하면 우측 Inspector 패널에 자동 생성된 컨트롤이 나타난다. 노드 카드 자체는 핸들 + 라벨 + 썸네일만으로 컴팩트하게 유지한다.

#### 2.2.3 노드 카드 썸네일 (Blender 스타일)

모든 ShaderNode 카드는 항상 **자기 FBO 컬러 어태치먼트의 썸네일**을 카드 본문에 표시한다(예: 96×96, 카드 폭에 맞춰 4:3 또는 1:1).

- **추가 렌더 패스 없음.** ExecutionPlan은 평소처럼 한 프레임 한 번만 각 ShaderNode를 렌더한다. 썸네일은 그 결과로 이미 GPU에 존재하는 텍스처를 읽어 표시할 뿐이다.
- 갱신 방식: 각 노드 패스 직후 `gl.readPixels`로 96×96 영역에 다운샘플링된 픽셀을 CPU로 가져와, 카드 내 `<canvas>`에 `putImageData`로 그린다. (드라이버에 따라 `gl.readPixels`가 비용이 있을 수 있으므로 — 실측에 따라 PBO 비동기 readback으로 대체할 여지를 둔다.)
- **스로틀**: 메인 렌더는 60fps, 썸네일은 기본 10Hz로 스로틀. 슬라이더 드래그·코드 편집 직후에는 일시적으로 즉시 갱신.
- **가시성 컬링**: React Flow의 줌/팬 결과 화면 밖에 있는 노드는 IntersectionObserver로 감지해 readback 자체를 스킵.
- ImageNode도 같은 방식으로 원본 텍스처의 썸네일을 표시(렌더 없이 GPU 텍스처를 readback). MeshNode는 wireframe/normal 등 정적 미리보기 아이콘을 사용(메시 자체는 렌더링 결과가 없으므로).
- Output 노드는 캔버스 자체가 미리보기이므로 별도 썸네일을 두지 않는다(또는 캔버스 축소판).

### 2.3 데이터 플로우

```
[GUI 편집]                   [컴파일]                    [렌더 루프]
graphStore  ──snapshot──▶  GraphCompiler  ──plan──▶  Renderer.tick()
   ▲                            │                          │
   │ patch                      │ topo sort                │ for each pass:
   │                            │ port type check          │   bind FBO
   │                            │ FBO 할당                 │   bind program
   │                            │ uniform 바인딩 매핑      │   set uniforms
   │                            ▼                          │   draw
   │                       ExecutionPlan ─────────────────▶│
   │                       (불변 객체)                     ▼
   │                                                    canvas
   │                                              에러 발생 시
   └──────── shader compile error ◀────── Diagnostics ─────┘
                            (CodeEditor 인라인 표시)
```

- **그래프 변경 → 재컴파일**은 디바운스(예: 50ms)된다. 키 입력마다 GL 프로그램을 재링크하지 않는다.
- **유니폼만 바뀐 경우**(슬라이더 드래그 등)는 ExecutionPlan 재생성 없이 직접 패치.
- **렌더 루프**는 React 외부의 단일 RAF에서 돈다. 컴파일된 ExecutionPlan을 ref로 넘겨받아 매 프레임 실행.
- **카메라 매트릭스**는 OrbitCamera에서 매 프레임 갱신되어 시스템 유니폼으로 자동 주입된다(별도 그래프 노드 아님).
- **Output 노드가 없으면** ExecutionPlan은 비어 있고, 렌더 루프는 캔버스에 placeholder만 그린다(노드 패스는 여전히 실행되어 썸네일은 동작).
- **썸네일 readback**은 메인 렌더 RAF의 일부로 스케줄되며, 10Hz 스로틀과 가시성 체크를 통과한 노드에 대해서만 수행한다.

### 2.4 카메라 (Orbit Controls)

뷰포트는 항상 단일 OrbitCamera를 가진다.

- 컨트롤: 좌클릭 드래그(yaw/pitch), 우클릭 드래그(pan), 휠(zoom).
- 상태: `target: vec3`, `distance: number`, `yaw: number`, `pitch: number`, `fov: number`.
- 매 프레임 view/proj 매트릭스를 계산해 ShaderNode 시스템 유니폼(`u_view`, `u_proj`, `u_model`)에 주입.
- 메시가 없는 풀스크린 노드에서는 매트릭스가 의미 없으므로 유니폼 바인딩에서 자동 제외.
- 행렬 연산은 **`gl-matrix`** 사용(검증된 경량 라이브러리, ~30KB).

### 2.5 에러 처리

- GLSL 컴파일 실패 → `Diagnostic[]`로 변환 → `codeEditorStore`에 기록 → CodeMirror `lintGutter`에서 표시.
- vertex/fragment 어느 쪽 에러인지 Diagnostic의 source에 표기해 탭 헤더에 빨간 닷 표시.
- 런타임 GL 에러는 dev 모드에서만 `WEBGL_debug_shaders` 등으로 보조 정보 수집.
- 그래프 사이클 감지 시 컴파일러가 빨간 엣지 마커를 통해 UI에 보고.

### 2.6 직렬화

`graphStore` 스냅샷을 JSON으로 export/import. 에셋(메시/이미지)은 IndexedDB(또는 단순 Blob URL 캐시)에 저장하고 그래프에서는 ID만 참조.

---

## 3. 디렉토리 구조

```
ShaderPlayground/
├─ index.html
├─ vite.config.ts
├─ tsconfig.json
├─ package.json
├─ SPEC.md
├─ README.md
└─ src/
   ├─ main.tsx                       # React 엔트리, App 마운트
   ├─ App.tsx                        # 레이아웃 (좌: 그래프, 우상: 뷰포트, 우하: 코드)
   ├─ index.css
   │
   ├─ core/                          # ── React 비의존 ──────────────────
   │  ├─ gl/
   │  │  ├─ context.ts               # WebGL2 컨텍스트 생성/검증
   │  │  ├─ program.ts               # 컴파일/링크 + InfoLog 파싱
   │  │  ├─ texture.ts               # 텍스처 생성/포맷
   │  │  ├─ framebuffer.ts           # FBO + 컬러/깊이 어태치먼트
   │  │  ├─ mesh.ts                  # VBO/VAO 업로드
   │  │  └─ uniforms.ts              # 유니폼 setter 헬퍼
   │  │
   │  ├─ camera/
   │  │  ├─ orbitCamera.ts           # yaw/pitch/distance + view/proj 행렬
   │  │  └─ input.ts                 # 마우스/휠 이벤트 → 카메라 상태
   │  │
   │  ├─ graph/
   │  │  ├─ types.ts                 # Node, Edge, Port, Graph 타입
   │  │  ├─ compile.ts               # graph → ExecutionPlan (topo sort, FBO 할당, Output 노드 검증)
   │  │  ├─ execute.ts               # ExecutionPlan을 매 프레임 GL 호출
   │  │  ├─ validate.ts              # 사이클·타입 미스매치·Output 노드 0~1개 검증
   │  │  ├─ diagnostics.ts           # GLSL 에러 로그 → Diagnostic[]
   │  │  └─ uniformParser.ts         # GLSL 소스 → UniformSpec[] (자동 추출)
   │  │
   │  ├─ thumbnail/
   │  │  ├─ readback.ts              # FBO → 96×96 ImageData (readPixels + 다운샘플)
   │  │  └─ scheduler.ts             # 10Hz 스로틀 + 가시성 큐 관리
   │  │
   │  ├─ nodes/
   │  │  ├─ registry.ts              # 노드 타입 레지스트리
   │  │  ├─ meshNode.ts              # 메시 노드 정의 (port 스펙)
   │  │  ├─ imageNode.ts
   │  │  ├─ shaderNode.ts            # vertex+fragment GLSL 한 쌍 보유
   │  │  └─ outputNode.ts            # 단일 입력 포트, 캔버스 출력 마커
   │  │
   │  └─ assets/
   │     ├─ primitives.ts            # cube/sphere/plane/torus/quad 생성기
   │     ├─ objLoader.ts             # @loaders.gl/obj 래퍼
   │     ├─ gltfLoader.ts            # @loaders.gl/gltf 래퍼 (지오메트리만)
   │     ├─ imageLoader.ts           # createImageBitmap 래퍼
   │     └─ types.ts                 # GeometryHandle, TextureHandle
   │
   ├─ state/                         # ── Zustand 스토어 ────────────────
   │  ├─ graphStore.ts               # 노드/엣지/유니폼 값
   │  ├─ assetStore.ts               # 로드된 메시/이미지 카탈로그
   │  ├─ selectionStore.ts           # 현재 선택 노드
   │  └─ rendererStore.ts            # ExecutionPlan ref, 통계
   │
   ├─ ui/                            # ── React 컴포넌트 ────────────────
   │  ├─ NodeEditor/
   │  │  ├─ index.tsx                # React Flow 캔버스
   │  │  ├─ NodeThumbnail.tsx        # 카드 내 <canvas>, scheduler 구독
   │  │  ├─ nodes/
   │  │  │  ├─ MeshNodeView.tsx      # 정적 미리보기 아이콘
   │  │  │  ├─ ImageNodeView.tsx     # 원본 텍스처 썸네일
   │  │  │  ├─ ShaderNodeView.tsx    # FBO 라이브 썸네일 + 핸들/라벨만
   │  │  │  └─ OutputNodeView.tsx    # 단일 입력 핸들
   │  │  ├─ edges/
   │  │  │  └─ TypedEdge.tsx
   │  │  └─ Toolbar.tsx              # 노드 추가(Output 포함)/저장/불러오기
   │  │
   │  ├─ CodeEditor/
   │  │  ├─ index.tsx                # CodeMirror 6 마운트
   │  │  ├─ StageTabs.tsx            # vertex / fragment 탭 전환
   │  │  ├─ glslSetup.ts             # 언어/하이라이트
   │  │  └─ lintAdapter.ts           # Diagnostic → CM lint
   │  │
   │  ├─ Viewport/
   │  │  ├─ index.tsx                # <canvas id="gl"> + 마운트 시 RAF 시작
   │  │  ├─ orbitBindings.ts         # 캔버스 이벤트 → core/camera/input
   │  │  └─ controls.tsx             # 카메라 리셋/스크린샷
   │  │
   │  └─ Panels/
   │     ├─ Inspector.tsx            # 선택 노드 상세 (자동 생성된 유니폼 슬라이더)
   │     ├─ UniformControl.tsx       # 타입별 컨트롤 디스패처(slider/color/vec)
   │     ├─ AssetBrowser.tsx         # 메시/이미지 가져오기
   │     └─ StatusBar.tsx            # FPS, GL 상태, 에러 카운트
   │
   ├─ shaders/                       # ── 빌트인 GLSL ───────────────────
   │  ├─ fullscreen.vert             # 풀스크린 쿼드 (포스트 패스용)
   │  ├─ basic.vert                  # 메시 + MVP
   │  └─ templates/
   │     ├─ unlit.frag
   │     ├─ uvDebug.frag
   │     └─ blur.frag
   │
   ├─ utils/
   │  ├─ debounce.ts
   │  └─ id.ts
   │
   └─ vite-env.d.ts
```

---

## 4. 개발 페이즈

각 페이즈는 머지 가능한 단위로, 끝에서 항상 앱이 실행 가능한 상태여야 한다.

### Phase 0 — 현행 (완료)
- Vite + TS + WebGL2 풀스크린 쿼드 동작.

### Phase 1 — UI/상태 인프라 도입 (1~2일)
- React 18 도입, `App.tsx` 레이아웃 (그리드: 그래프 / 뷰포트 / 코드).
- Zustand 스토어 골격(`graphStore`, `rendererStore`).
- 기존 풀스크린 쿼드를 Viewport 컴포넌트 안으로 이동, RAF 루프는 그대로.
- ESLint/Prettier/Vitest 설정.
- **검증**: 화면 분할이 보이고 기존 셰이더가 우측 뷰포트에서 그대로 돈다.

### Phase 2 — Core 렌더러 + 카메라 (FBO 체인) (3~4일)
- `core/gl/*` 모듈화: program/texture/framebuffer/mesh.
- `core/camera/orbitCamera.ts` + 마우스/휠 입력 바인딩.
- 단일 쉐이더 패스 → 다중 패스(FBO ping-pong) 동작.
- 시스템 유니폼(`u_time`/`u_resolution`/`u_view`/`u_proj`/`u_model`) 자동 바인딩.
- 하드코딩된 그래프(MeshNode → ShaderNode → OutputNode)로 Core만 단독 검증. **Output 노드도 데이터 모델 단계부터 명시**.
- Output 노드가 없는 그래프는 placeholder 처리 분기를 검증.
- **검증**: UI 없이 코드로 정의한 그래프가 화면에 렌더되고, 마우스로 카메라가 움직인다. Output을 떼면 placeholder가 나온다.

### Phase 3 — 코드 에디터 + vertex/fragment 탭 + 라이브 컴파일 (2~3일)
- CodeMirror 6 + GLSL 언어 통합.
- `StageTabs`로 한 ShaderNode의 vertex/fragment 소스를 탭 전환 편집.
- 입력 디바운스(50ms) 후 GL 프로그램 재링크.
- `getShaderInfoLog` 파서 → 인라인 Diagnostic. vertex/fragment 어느 쪽 에러인지 탭 헤더에 빨간 닷.
- **검증**: 코드 수정 시 1~2프레임 내 화면 반영, 문법 오류 시 빨간 밑줄 + 어느 stage 에러인지 식별 가능.

### Phase 4 — 단일 쉐이더 노드 + 유니폼 자동 노출 (2~3일)
- ShaderNode 1개 + (Mesh | Image) 입력 + Output. 그래프는 아직 하드코딩.
- `uniformParser`로 GLSL `uniform` 선언을 파싱해 인스펙터에 자동 컨트롤 생성.
- 타입별 컨트롤: `float` 슬라이더, `vec2/3/4` 다축 슬라이더, `*Color`/`u_color*` 컬러 피커.
- 시스템 유니폼은 자동 숨김.
- **검증**: 사용자가 `uniform float u_intensity;`를 추가하면 즉시 인스펙터에 슬라이더가 나타나고 드래그가 화면에 반영된다.

### Phase 5 — 노드 그래프 GUI + 노드 썸네일 (4~5일)
- React Flow 통합, MeshNodeView/ImageNodeView/ShaderNodeView/**OutputNodeView** 커스텀 노드.
- Toolbar의 노드 팔레트에 Output 노드 포함, 사용자가 명시적으로 배치.
- `isValidConnection`으로 포트 타입 검증, 사이클 차단, **Output 2개 이상 차단**.
- graphStore ↔ React Flow 양방향 동기화.
- 선택 노드의 GLSL이 CodeEditor에 로드되고, 유니폼 컨트롤이 우측 Inspector에 자동 노출되도록 셀렉션 연동.
- `core/thumbnail/*` 구현, ShaderNode/ImageNode 카드 내부 라이브 썸네일 동작.
- **검증**: GUI에서 노드 생성/연결/삭제만으로 Phase 4 시나리오 재현. Output을 빼면 placeholder, 다시 꽂으면 즉시 출력. 모든 ShaderNode 카드에 Blender처럼 라이브 썸네일이 표시된다.

### Phase 6 — 다중 쉐이더 체이닝 (2일)
- ShaderNode → ShaderNode 연결 → FBO 텍스처 자동 라우팅.
- GraphCompiler에 토폴로지 정렬 + FBO 풀 할당 로직.
- 입력이 없는 ShaderNode는 풀스크린 쿼드 폴백.
- **검증**: 쉐이더 3개 체이닝(예: 노이즈 → 블러 → 톤매핑) + Output 노드. 각 중간 노드의 카드 썸네일에서 단계별 결과가 동시에 보인다.

### Phase 7 — 외부 에셋 로더 (2~3일)
- 프리미티브 5종(cube/sphere/plane/torus/quad).
- OBJ 임포트(loaders.gl).
- GLTF 임포트(애니메이션/머티리얼은 무시, 메시만).
- 이미지 임포트(PNG/JPG/WebP).
- AssetBrowser 패널 + 드래그&드롭.
- **검증**: 사용자가 OBJ/PNG를 드롭하면 노드로 등장하고 즉시 연결 가능.

### Phase 8 — 직렬화 & 마무리 (1~2일)
- 그래프 JSON export/import.
- 에셋은 IndexedDB에 캐시(파일 경로 의존 제거).
- 프리셋 예제 그래프 2~3개 번들.
- 스크린샷 캡처, 에러/통계 표시(StatusBar).

### (선택) Phase 9 — 확장
- GLSL 주석 힌트(`// @range`, `// @label`)로 유니폼 컨트롤 메타 오버라이드.
- 파라미터 노드(Float/Vec/Color/Time)로 유니폼 외부화.
- 썸네일 readback을 PBO 비동기 방식으로 전환(드라이버 stall 회피).
- 멀티 Output 노드(분할 뷰포트).
- 쉐이더 핫리로드 디스크 백업.
- 컴퓨트(Transform Feedback) 노드.
- GLSL LSP 도입 검토(Monaco로 전환).

---

## 5. 결정 사항 요약

### 5.1 사용자 확정 (이번 라운드)

| 항목 | 결정 |
|---|---|
| UI 프레임워크 | React 18 |
| 노드 그래프 | React Flow (`@xyflow/react`) |
| 코드 에디터 | CodeMirror 6 |
| 메시 로더 | loaders.gl (OBJ + GLTF 지오메트리) |
| 상태 관리 | Zustand |
| 쉐이더 노드 | 한 노드에서 vertex/fragment 둘 다 편집 (탭) |
| 유니폼 노출 | GLSL 소스 자동 파싱 → 인스펙터 슬라이더 (노드 카드 안 X, 우측 패널 O) |
| 카메라 | OrbitCamera (좌클릭 회전 / 우클릭 팬 / 휠 줌) |
| 플랫폼 | 데스크톱 전용 (모바일 대응 없음) |
| Output 노드 | 명시적 배치, 그래프당 0~1개. 없으면 캔버스에 placeholder. |
| 노드 카드 썸네일 | 모든 ShaderNode/ImageNode에 라이브 썸네일 상시 표시 (Blender 스타일). 추가 렌더 패스 없이 기존 FBO를 readback. 10Hz 스로틀 + 가시성 컬링. |

### 5.2 기본값으로 진행 (사용자 미지정 — 합리적 디폴트 채택)

| 항목 | 디폴트 | 비고 |
|---|---|---|
| 포트 연결 | 1:N 분기 OK, N:1 금지 | 합성이 필요하면 명시적 블렌드 노드(후속) |
| GLTF 범위 | 지오메트리만 | 머티리얼/애니메이션 무시 |
| 컴파일 트리거 | 디바운스 자동 재컴파일 | 향후 수동 컴파일 단축키 추가 가능 |
| 직렬화 | JSON export/import (Phase 8), 에셋은 IndexedDB 캐시 | |
| 노드 종류 | Mesh / Image / Shader / Output(명시적) 4종 | 파라미터 노드는 Phase 9 |
| 의존성 무게 | 경량 우선 | three.js·Monaco는 의도적으로 회피 |

이 디폴트 중 바꾸고 싶은 항목이 있으면 알려줘. 아니면 이대로 Phase 1부터 진행.

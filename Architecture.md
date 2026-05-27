# ShaderPlayground 아키텍처

> 본 문서는 **현재 코드(Phase 29)** 의 실제 동작을 설명한다. 기술 스택을 *왜* 골랐는지·페이즈 진행 이력은 [SPEC.md](./SPEC.md) 를 참고하라.

---

## 1. 레이어 구분

```
┌─────────────────────────────────────────────────┐
│ UI Layer (React 18)                             │
│   App / NodeEditor / Viewport / CodeEditor      │
│   SidePanel · CommandPalette · BootstrapGate    │
└──────────────┬──────────────────────────────────┘
               │ commands · selectors
┌──────────────▼──────────────────────────────────┐
│ State Layer (Zustand stores · src/state)        │
│   graph · asset · selection · renderer          │
│   camera · viewport · time · history · editor   │
│   diagnostics · autoSave · recorder · shareUrl  │
└──────────────┬──────────────────────────────────┘
               │ snapshotGraph()  snapshotAssets()
┌──────────────▼──────────────────────────────────┐
│ Core Layer (pure TS · src/core)                 │
│   graph (compile/execute/validate/parser)       │
│   gl (program/texture/framebuffer/mesh/uniform) │
│   camera · thumbnail · nodes · assets           │
└──────────────┬──────────────────────────────────┘
               │ WebGL2 calls
┌──────────────▼──────────────────────────────────┐
│ WebGL2 (canvas)                                 │
└─────────────────────────────────────────────────┘
```

원칙:

- **Core 는 React/Zustand 를 모른다.** `src/core/**` 어디에도 `react`·`zustand` import 가 없다. 그래프와 옵션만 받아 `ExecutionPlan` 을 만들고 실행하는 순수 TS 모듈이다 — 정적 HTML export 의 `standalonePlayer.js` 가 같은 알고리즘을 의존성 0 으로 다시 구현할 수 있는 이유다.
- **UI 는 Core 를 직접 부르지 않는다.** UI 는 Zustand 스토어에 패치를 보내고, Viewport 안의 단일 RAF 루프가 매 프레임 `snapshotGraph()` / `snapshotAssets()` 로 read-only 스냅샷을 떠서 Core 에 넘긴다.
- **렌더 루프는 React 외부에서 돈다.** `useEffect` 안에서 한 번 시작된 `requestAnimationFrame` 이 컴포넌트 트리 리렌더와 무관하게 돌고, 스토어는 `getState()` 로 폴링한다(서브스크립션 콜백 폭주 회피).

---

## 2. 그래프 모델

### 2.1 노드와 포트

`src/core/graph/types.ts` 에 정의된 타입.

| 종류 | 입력 포트 | 출력 포트 | 비고 |
|---|---|---|---|
| `mesh` | — | `mesh: mesh` | `primitive` 또는 `assetId` (assetId 가 우선; 미로드 시 primitive fallback) |
| `image` | — | `texture: texture` | `assetId` 로 비트맵 참조 |
| `webcam` | — | `texture: texture` | `navigator.mediaDevices.getUserMedia` 로 받은 live MediaStream 을 매 프레임 `texSubImage2D(HTMLVideoElement)`. 옵셔널 `deviceId`; 핸들 lifecycle 은 plan 외부 (`core/external/registry.ts`) 가 관리. Phase 14a. |
| `video` | — | `texture: texture` | import 한 mp4/webm 에셋(`assetId`)을 object URL `<video>` 로 디코드해 매 프레임 `texSubImage2D`. `playing`/`loop`/`muted`/`currentTime`(seek) 은 in-place, assetId 변경만 restart. webcam 과 같은 external registry 풀이 관리. Phase 14b. |
| `audio` | — | `texture: texture` | mic(`getUserMedia({audio:true})`) 또는 file(`decodeAudioData`) → `AnalyserNode` FFT. 매 프레임 `getByteFrequencyData` → 1D R8 텍스처(`fftSize/2 × 1`). `sourceKind`/`fftSize`(32~2048)/`smoothing`/`playing`/`loop`. external registry 풀이 관리. Phase 14c. |
| `shader` | `mesh: mesh?` + sampler 입력 (`sampler2D` 유니폼) + 비-샘플러 유니폼 입력 (`float/vec2/vec3/vec4`) | `texture: texture` | vertex + fragment 두 GLSL 소스를 함께 보유 |
| `compute` | 비-샘플러 유니폼 입력만 (`float/vec2/vec3/vec4`) | `mesh: mesh` | vertex GLSL 한 개 + `transformFeedbackVaryings` 로 캡처되는 출력 attribute 페어 목록. fragment 단계는 `RASTERIZER_DISCARD` 로 비활성화. ping-pong 더블 버퍼로 매 프레임 시뮬레이션. primitive 는 POINTS/LINES/TRIANGLES 중 선택. |
| `output` | `texture: texture` | — | 캔버스에 합성될 패스 마커 |
| `param` (`float`/`vec3`/`color`/`time`) | — | `value: float` 또는 `value: vec3` | `time` 은 `[scale, offset]` 두 채널을 가지고 매 프레임 `simTime*scale + offset` 으로 재평가 |
| `math` (8 op) | `a: float`, 이항만 `b: float` | `value: float` | 단항: `abs/sin/cos` (`MATH_UNARY_OPS`) |
| `swizzle` | `in: vec4` (스칼라는 broadcast) | `value: float\|vec2\|vec3\|vec4` (mask 길이) | mask 는 x/y/z/w 의 1~4 글자 |
| `combine` (arity 2/3/4) | `x, y, (z, w): float` | `value: vec2\|vec3\|vec4` | arity 만큼 채널 노출 |
| `group` (Phase 29) | — | — | 시각적 컨테이너. 포트 없음, `ExecutionPlan` 에 절대 들어가지 않음. `{label, color?, width, height}` 만 보유. 자식 관계는 `graphStore.parents` map 으로 보관 |

포트 타입: `'mesh' | 'texture' | 'float' | 'vec2' | 'vec3' | 'vec4'`.

엣지: `{id, source, sourceHandle, target, targetHandle}`.

### 2.2 포트 표면의 동적 생성

`src/core/nodes/registry.ts` 가 노드 종류별 PortSpec 의 단일 진실원본이다.

- **ShaderNode 의 입력 포트는 GLSL 소스에서 매번 다시 파싱**된다. `parseUniforms(vertex + '\n' + fragment)` 의 결과에서 sampler 는 `texture` 입력, 비-system·비-sampler·비-matrix 인 `float/vecN` 은 동일 타입 입력으로 노출. 이름이 바뀌면 엣지가 자동으로 끊기지 않으며 — 다음 컴파일에서 unknown uniform 으로 무시될 뿐이다(`bindUserUniforms` 의 `loc === undefined` 분기).
- **ComputeNode 의 입력 포트도 GLSL 소스 파싱 결과**다. ShaderNode 와 동일한 `parseUniforms` 를 vertex source 단독에 적용해 비-샘플러·비-matrix uniform 만 입력 포트로 노출(sampler 입력은 컴퓨트에 부적절해 의도적으로 제외). 출력은 항상 `mesh: mesh` 하나로 고정.
- **Math** 의 포트 수는 `op` 에 따라 1 또는 2 (`mathInputPorts`).
- **Swizzle** 의 출력 타입은 mask 길이에 따라 `float / vec2 / vec3 / vec4` (`swizzleOutputPort`).
- **Combine** 은 arity 만큼 입력 채널을, arity 에 따른 vec 타입을 출력 (`combineInputPorts` / `combineOutputPort`).

따라서 React Flow 의 `isValidConnection` 도 노드 인스턴스를 받아 `nodeInputPorts(node)` / `nodeOutputPorts(node)` 를 호출해 *그 시점의* 포트 타입과 비교한다.

### 2.3 연결 규칙

`src/core/graph/validate.ts` 가 검사하는 규칙(컴파일 직전, 그리고 `isValidConnection` 시도 시 즉석에서 가설 그래프에 대해 실행):

| 코드 | 조건 |
|---|---|
| `missing_node` | 엣지가 존재하지 않는 노드를 가리킴 |
| `multi_input` | 같은 `(target, targetHandle)` 에 두 개 이상의 엣지 — **한 핸들에 N:1 금지** |
| `multiple_outputs` | Output 노드가 `MAX_OUTPUTS = 4` 를 초과 |
| `cycle` | DFS 로 검출 |

`multi_input` 은 `NodeEditor` 의 `onConnect` 가 이미 거부하므로 보통은 컴파일까지 도달하지 않는다. `isValidConnection` 은 *타입 매칭만* 검사하고, cycle 은 `onConnect` 가 가설 엣지를 추가한 그래프에 `validateGraph` 를 돌려 `code === 'cycle'` 이면 거부한다.

규칙은 **핸들 단위**라는 점이 핵심이다: 금지되는 것은 *동일 핸들*에 두 입력이 꽂히는 경우뿐이고, **서로 다른 핸들로 들어오는 N:1 합성(fan-in)은 허용**된다. ShaderNode 는 GLSL 의 sampler uniform 마다 별도 입력 핸들을 노출하므로(§2.2), 3-way blend·mask composite 처럼 한 셰이더가 여러 텍스처를 받는 일반 N:1 합성이 자연스럽게 성립한다. 빌트인 템플릿 `Composite 3`(u_a/u_b/u_c)·`Mask`(u_base/u_overlay/u_mask)가 이 패턴을 노출한다(Phase 18). 즉 1:N 분기와 (핸들이 다른) N:1 합성은 모두 허용, *동일 핸들* N:1 만 금지.

### 2.4 위상 정렬

`topologicalOrder()` 는 Kahn 알고리즘(indegree 큐). 사이클이 있어도 `validateGraph` 에서 이미 fatal 로 잡혀 컴파일이 빈 plan 으로 종료되므로, `topologicalOrder` 가 도달하는 그래프는 DAG 임이 보장된다.

---

## 3. 컴파일 — 그래프 → ExecutionPlan

`src/core/graph/compile.ts` 의 `compileGraph(gl, graph, {width, height, assets})`.

```
┌────────────┐   validate    ┌──────────────┐   topo    ┌────────────────────┐
│  Graph     │ ────────────▶ │  errors[]    │ ────────▶ │  ordered nodes     │
└────────────┘               │  (fatal abort)│           └────────────────────┘
                              └──────────────┘                   │
                                                                 │ filter shader|compute
                                                                 ▼
              ┌──────────── ImageTexture pool ◀──── ImageNode.assetId ──┐
              │                                                          │
              ▼                                                          │
       ┌─────────────┐  per ShaderNode    ┌──────────┐                  │
       │ FBO + Mesh  │ ─────────────────▶ │ ShaderPass│ ◀────────────────┤
       │ + Program   │                    └──────────┘                  │
       └─────────────┘                                                  │
       ┌─────────────────┐  per ComputeNode  ┌───────────┐              │
       │ vboA/B + vaoA/B │ ───────────────▶ │ ComputePass│ ◀─────────────┘
       │ + tfA/B + TF prog│                  └───────────┘
       └─────────────────┘                          │
                                                    ▼
                                  ┌─────────────────────────┐
                                  │ ExecutionPlan           │
                                  │   passes[] (union)      │
                                  │   imageTextures{}       │
                                  │   outputs[]             │
                                  │   errors[]              │
                                  │   shaderErrors{}        │
                                  │   width/height          │
                                  │   dispose()             │
                                  └─────────────────────────┘
```

### 3.1 컴파일 절차

0. **`reconcileExternal`** — 외부 소스 노드(webcam / video / audio) specs 를 모아 `core/external/registry.ts` 의 싱글톤 풀에 전달. 새 노드 ID 는 acquire 시작(webcam/audio-mic 는 비동기 getUserMedia, video/audio-file 은 resolver 로 Blob 해석), 사라진 노드 ID 는 release, restart 가 필요한 변경(webcam deviceId / video assetId / audio sourceKind·assetId)만 restart 하고 나머지(play/pause/loop/mute/seek/fftSize/smoothing)는 in-place 적용. **validate 보다 먼저** 호출되므로 cycle 같은 일시적 fatal 이 카메라/비디오/오디오를 죽이지 않는다. `hasExternal`(외부 소스 1 개 이상) 도 이 시점에 결정되어 fatal 분기에서도 보존.
1. `validateGraph` — `cycle`/`multi_input`/`multiple_outputs` 중 하나라도 있으면 **patch 만 채운 emptyPlan** 으로 즉시 종료 (단 `hasExternal` 은 위에서 결정된 값을 그대로 캐리). `missing_node` 는 fatal 아님(엣지를 건너뛰고 계속).
2. `topologicalOrder` → shader/compute 노드만 filter (두 종류 모두 패스를 생성).
3. **ImageTexture 업로드**: 그래프의 모든 ImageNode 를 순회해 `assetStore` 에 비트맵이 있으면 `createImageTexture` 로 GPU 에 올린다. **키는 node.id** (assetId 가 아니다) — 그래야 다음 패스의 sampler 라우팅에서 `edge.source` 만으로 찾을 수 있다.
4. **위상 순서대로 Pass 생성** — 각 노드의 `kind` 에 따라 ShaderPass 또는 ComputePass 가 만들어져 `passes[]` 에 들어간다. union 단일 배열이며 위상 순서가 보존된다.
   - **ShaderPass (`kind: 'shader'`)**:
     - **메시 결정**: `(target=sn.id, handle='mesh')` 인 엣지가 있으면 메시 노드에서 가져오고 `meshIsFullscreen=false`. 없거나 메시 노드가 비어 있으면 `quad` 프리미티브 + `fullscreen.vert` 가 자동 주입되어 `meshIsFullscreen=true`.
     - **컴퓨트 mesh 입력 특수 경로**: 메시 엣지의 source 가 ComputeNode 인 경우, 컴파일 시점에 해당 ComputePass 의 두 vbo 세트(A/B) 각각에 대해 VAO 두 개를 만들어 `pass.meshComputeVaos = [vaoA, vaoB]` 로 보관. `pass.meshComputeNodeId` 로 연결된 ComputePass 를 식별. `pass.mesh.primitive` 는 ComputeNode 의 primitive 를, `vertexCount` 는 ComputeNode 의 `count` 를 그대로 가져온다.
     - **프로그램 컴파일**: `createProgram(gl, vertexSource, fragmentSource)`. 실패하면 `shaderErrors[node.id]` 에 stage 정보와 함께 누적되고 해당 패스는 건너뛰어진다 — 그래프 나머지는 계속 컴파일됨.
     - **FBO** 할당 (plan 의 `width × height` 단일 해상도).
     - **입력 라우팅**: `sn.id` 로 들어오는 모든 엣지를 순회.
       - `targetHandle === 'mesh'` 는 위에서 처리했으므로 스킵.
       - source 가 `param / math / swizzle / combine` → **`paramBinding`** (CPU 평가 경로).
       - 그 외 (`shader / image / mesh-by-accident`) → **`samplerBinding`** + 텍스처 유닛 증가.
   - **ComputePass (`kind: 'compute'`)**:
     - **TF 프로그램 컴파일**: vertex shader 만 진짜 로직이고 fragment 는 빌트인 `tfNoop.frag` (의미 없는 dummy 출력 — `RASTERIZER_DISCARD` 로 어차피 폐기). `createComputeProgram` 이 link 전에 `gl.transformFeedbackVaryings(prog, [outNames], INTERLEAVED 또는 SEPARATE)` 를 호출. 현재 구현은 attribute slot 별 분리된 vbo 를 쓰므로 `SEPARATE_ATTRIBS`.
     - **Ping-pong 버퍼**: attribute slot 마다 두 vbo (A/B) 를 만들고 seed 함수(`sphere`/`cube`/`random`/`zero`) 로 양쪽 모두 초기화. read 측이 다음 프레임 입력, write 측이 다음 프레임 출력. compile 시 `read = 'A'` 로 시작.
     - **VAO**: vbo 세트마다 VAO 1 개. `vaoA` 는 A 측 vbo 를 attribute pointer 로 묶고, `vaoB` 는 B 측. 매 dispatch 마다 read 에 맞는 VAO 가 bound 되고 다른 측이 TF 캡처 대상.
     - **TF object**: `tfA` 는 A 측 vbo 들을 `bindBufferBase` 로 묶고, `tfB` 는 B 측. dispatch 시 read 측의 TF 가 캡처 대상.
     - **입력 라우팅**: ShaderPass 와 동일하게 `paramBindings` 만 추출 (sampler 없음). uniform 값은 노드의 `uniformValues` 를 그대로 베이스로.
     - **dispose**: program / vbos×N×2 / VAOs / TF objects 모두 정리.
5. **Output 바인딩**: `kind === 'output'` 노드들을 *문서 순서대로* `outputs[]` 에 매핑(`(target=output.id, handle='texture')` 엣지의 source 를 `sourceNodeId` 로 기록; 없으면 null).
6. `dispose()` 는 모든 `program / fbo / mesh / imageTexture` 핸들 + 컴퓨트 패스의 vbo/TF/VAO 핸들의 deleter 를 한 번에 호출.

### 3.2 sampler vs param 라우팅 — 한 번 더

- **sampler 경로**: 실행 시 `bindSamplers` 가 `pass.samplers[]` 를 따라가며, `passByNode.get(source).fbo.color.texture` → `plan.imageTextures[source]` → `getExternalTexture(source)` (Phase 14a, webcam 같은 live source) 순으로 텍스처를 찾아 `gl.uniform1i` + `bindTexture`. 어디서도 못 찾으면 sampler 스킵(검은 frame fallback) — external 핸들이 acquire 중이라 아직 텍스처가 없는 경우가 정상 케이스. 메시 그래프의 텍스처 라우팅 = ShaderNode → ShaderNode 체이닝 = 자동 FBO ping-pong.
- **param 경로**: 실행 시 `bindUserUniforms` 가 `pass.uniformValues` 를 베이스로 시작해 `paramBindings` 가 가리키는 노드를 `resolveValueFor(sourceId, graph, {time}, cache)` 로 재귀 평가해 덮어쓴다. utility 노드들은 GL 패스를 만들지 않고 CPU 에서만 평가된다. ShaderPass 와 ComputePass 가 같은 캐시 + 같은 resolver 를 공유.

---

## 4. 렌더 루프와 실행

### 4.1 RAF 루프 (`src/ui/Viewport/index.tsx`)

마운트 시 한 번 `useEffect` 안에서 시작되고 unmount 까지 살아 있다. 매 틱:

1. **Resize**: DPR(최대 2) 을 곱한 `clientWidth × clientHeight` 와 백버퍼가 다르면 캔버스 크기 재설정.
2. **구조 변경 감지**: `graphStore.rev` 또는 `assetStore.rev` 가 변하거나 캔버스 크기가 바뀌면 `recompile()`. 이때:
   - 이전 plan 의 `dispose()` 호출.
   - 새 plan 의 `shaderErrors` → `parseShaderInfoLog` → `diagnosticsStore.set(nodeId, ...)`.
   - 사라진 패스에 대응하는 `asyncReadback` 슬롯 `release(gl, prevId)` — PBO 가 사라진 FBO 의 stale 메모리를 읽지 않도록.
   - `thumbnailScheduler.bumpAll()` 로 모든 썸네일을 즉시 갱신 큐에 다시 올림.
3. **유니폼 변경 감지**: `uniformRev` 가 변했으면 `bumpAll()` 만(컴파일은 안 함).
4. **dirty 게이트(B2)**: 다음 조건 중 하나라도 참이면 이 프레임을 *렌더링 프레임*으로 마크한다 — `timeStore.playing === true`, **`plan.hasExternal === true`** (Phase 14a; webcam 같은 라이브 소스가 있으면 시간 정지와 무관하게 무조건 dirty), 또는 마지막 프레임 대비 `graphStore.rev` / `assetStore.rev` / `graphStore.uniformRev` / `cameraStore.rev` / `timeStore.rev` / `viewportStore.rev` 중 하나라도 변화. 어떤 조건도 참이 아니면 **이번 프레임은 `executePlan` 을 스킵**하고, async readback 펜스만 펌프한 뒤 다음 RAF 만 등록한다. 정적 그래프 + 정지 시간 + 외부 소스 없음 = GPU 0 비용. 카메라/슬라이더/스크럽 등 모든 사용자 입력은 자기 스토어의 `rev` 를 올려 다음 프레임을 깨운다. **컴퓨트 패스의 영향(Phase 13)**: 컴퓨트 패스가 한 개 이상이면 `timeStore.playing === true` 일 때 무조건 dirty(애초에 위 첫 조건에 해당). 시간이 정지된 idle 상태에서는 컴퓨트 dispatch 도 건너뛰므로 시뮬레이션이 멈춘 채 GPU 0 비용을 유지한다 — 다음 dispatch 시 read 측의 직전 결과부터 다시 시작. **외부 입력의 영향(Phase 14a)**: webcam 노드가 있으면 `hasExternal` 이 시간 정지를 덮어쓰므로 일시정지 중에도 카메라 프레임이 흐른다 — 매 RAF tick 의 `updateExternalSources(gl)` 가 `texSubImage2D(HTMLVideoElement)` 로 신선한 frame 을 GL 텍스처에 업로드.
5. **유니폼 핫패치**: (렌더 프레임에서만) 현재 `graphStore.nodes` 의 `shader` 노드들의 `uniformValues` 를 `pass.uniformValues` 로 그대로 복사. 슬라이더 드래그가 매 프레임 즉시 반영되는 경로.
6. **시간 진행**: `timeStore.advance(dt/1000)` — `playing=false` 면 noop. dirty 게이트와 무관하게 매 틱 호출되므로 idle 중 wall-clock 만 지나가도 `simTime` 은 변하지 않는다.
7. **FPS 통계**: 500ms 누적분으로 `setStats({fps, frame, drawCalls})`. idle 프레임에서는 `drawCalls = 0` 으로 보고된다.
8. **실행**: `executePlan(gl, plan, FrameContext, canvasWidth, canvasHeight)` + `rendererStore.bumpRenderTick()`. `renderTick` 은 누적 카운터로, idle 게이트가 작동하는지를 E2E 가 확인하는 신호다.
9. **썸네일**: `asyncReadback.poll(gl)` → 완료된 슬롯들을 `scheduler.commit`, `scheduler.pickReady(now)` → 대상 노드에 대해 `asyncReadback.request`.

### 4.2 FrameContext

`{ time, width, height, camera, background?, params?, graph? }`. `graph` 는 `paramBindings` 가 있을 때만 필요하지만 현재 Viewport 는 항상 넘긴다.

### 4.3 executePlan (`src/core/graph/execute.ts`)

```
for each pass in plan.passes:           # 토포 순서가 보존되어 있음 (Shader | Compute union)
    if pass.kind == 'compute':
        useProgram(pass.program)
        bindUserUniforms     # uniformValues + paramBindings; system u_time 만 자동
        bindVertexArray(pass.read == 'A' ? vaoA : vaoB)             # 입력 attribute
        bindTransformFeedback(pass.read == 'A' ? tfB : tfA)         # 캡처 대상
        enable(RASTERIZER_DISCARD)
        beginTransformFeedback(prim)
        drawArrays(prim, 0, count)
        endTransformFeedback()
        disable(RASTERIZER_DISCARD)
        pass.read = pass.read == 'A' ? 'B' : 'A'                    # ping-pong swap
    else:  # shader
        bindFramebuffer(pass.fbo); clear()
        depth on if !fullscreen, off if fullscreen
        useProgram(pass.program)
        bindSystemUniforms   # u_time, u_resolution; matrix 는 메시일 때만
        bindUserUniforms     # uniformValues 위에 paramBindings 덮어쓰기
        bindSamplers         # FBO color attach 또는 imageTextures 에서
        if pass.meshComputeNodeId:                                  # 컴퓨트 mesh 입력
            cp = passByNode.get(pass.meshComputeNodeId)
            pass.mesh.vao = pass.meshComputeVaos[cp.read == 'A' ? 0 : 1]
        drawMesh(pass.mesh)

bindFramebuffer(null); viewport(0,0,W,H); clear(bg)

drawable = outputs.filter(o => o.sourceNodeId && passByNode.has(o.sourceNodeId))
if drawable.length === 0:
    drawPlaceholder(bg)
else:
    cells = splitLayout(drawable.length, W, H)
    for i in 0..drawable.length:
        viewport(cells[i])
        blitToCanvas(pass.fbo.color.texture)   # 내부 1-패스 텍스처드 쿼드
```

**컴퓨트 mesh 입력의 read 시점**: 위에서 `cp.read` 는 ComputePass 가 *이미 이번 프레임 dispatch 를 끝낸 뒤의 상태*다(컴퓨트 패스는 위상순서상 ShaderPass 앞). 즉 ShaderPass 가 그릴 때는 방금 캡처된 새 데이터가 read 측에 있어 가장 신선한 vbo 로 attribute 가 묶인다.

`splitLayout`:
- 1 → 전체
- 2 → 좌·우 반반
- 3 → 상단 행 2 칸 + 하단 행 전체 폭 1 칸
- 4 → 2×2

### 4.4 System uniforms

`parseUniforms` 가 `system: true` 로 표시하는 이름은:

```
u_time  u_resolution  u_view  u_proj  u_model  u_camera  u_mouse  u_frame
```

- `u_time` ← `simTime` (timeStore)
- `u_resolution` ← `[pass.width, pass.height]`
- `u_view` / `u_proj` / `u_model` / `u_camera` 는 `meshIsFullscreen === false` 인 패스에만 바인딩. 풀스크린 쿼드에는 의미 없으므로 자동 제외.
- `u_mouse` (vec4) ← `mouseStore`. `xy` = 현재 포인터 위치, `zw` = 마지막 클릭 위치. 픽셀 단위·좌하단 원점이라 `gl_FragCoord` / `u_resolution` 과 동일 좌표계(Shadertoy iMouse 관례). Viewport 의 canvas pointer 리스너가 store 를 갱신하고 `rev` 를 올려 idle RAF 를 깨운다.
- `u_frame` (float) ← Viewport 의 누적 렌더 프레임 카운터(`executePlan` 호출마다 +1). compute 패스에도 바인딩.

System uniform 은 Inspector 에서 자동 숨김(`inspectorUniforms`), 입력 포트로도 노출되지 않음.

### 4.5 유니폼 자동 노출 (`src/core/graph/uniformParser.ts`)

- 정규식 한 줄짜리 매처로 `uniform <type> <name>;` 추출. 블록 코멘트는 미리 공백으로 치환.
- 기본 컨트롤 추론:
  - `sampler2D / samplerCube` → `sampler` (입력 포트)
  - `mat*` → `matrix` (UI 노출 안 함)
  - `bool` → `bool` (자리만 차지)
  - `vec3/vec4` 이면서 이름에 `color` 포함 → `color`
  - `float / int` → `slider`
  - `vec2/3/4` → `multi` (다축 슬라이더)
- 기본 범위:
  - 이름이 `intensity|strength|amount|opacity|alpha` → `0..1`
  - 이름이 `scale|frequency|radius` → `0..10`
  - 그 외 float → `-1..1`
  - 색 벡터 → `0..1` 흰색 디폴트
- **GLSL 주석 힌트**가 모든 추론을 오버라이드. 트레일링 라인 코멘트 *및* 바로 위의 연속된 `//` 라인을 모두 모아 `parseHintComment` 가 한 번에 파싱:
  - `@range A..B`, `@min A`, `@max B`, `@step S`
  - `@default V` 또는 `@default V1, V2, V3` (스칼라/벡터 둘 다)
  - `@label "..."` 또는 `@label 텍스트`
  - `@color` / `@slider` / `@multi` — 컨트롤 종류 자체를 오버라이드. 같은 텍스트에 여러 번 나오면 **마지막 위치가 이김** (`@color @slider` → slider). 색이 아니었던 벡터에 `@color` 를 붙이면 범위가 `[0,1]` 흰색으로 자동 승격.

### 4.6 GPU 타이밍 (Phase 15)

`EXT_disjoint_timer_query_webgl2` 기반 per-pass 측정. 인프라는 `core/gl/gpuTimer.ts` 의 `GpuTimerPool`, store 는 `state/gpuTimerStore.ts`.

- **`GpuTimerPool.create(gl)`** — extension 미노출 환경(Safari, 일부 Firefox 기본 설정 등)에서는 `null` 반환. RAF 루프는 `pool?.begin(...)` 처럼 옵셔널 체이닝으로 호출하므로 미지원 분기에서 비용 0.
- **lifecycle**: `begin(gl, nodeId)` → 다음 draw → `end(gl)` 가 한 패스를 감싼다. `TIME_ELAPSED_EXT` 는 nest 불가하므로 패스는 순차 측정. 노드 release / pool dispose 는 thumbnail PBO 풀과 동일한 형태.
- **poll**: 매 frame `executePlan` 직후 호출. `GPU_DISJOINT_EXT` 가 true 면 in-flight 쿼리를 전부 버리고 다음 프레임부터 재시작 (extension 스펙 요구).
- **store**: 결과는 EMA(α=0.2) 로 평활해 `byNode[id]` 에 저장, `totalMs` 는 매 sample 시 재계산. `supported` 는 pool 생성 가능 여부, `enabled` 는 ViewportControls 의 사용자 토글. 두 flag 가 모두 true 일 때만 begin/end 가 실제로 호출된다.
- **UI**: ShaderNodeView / ComputeNodeView 카드 우상단에 `0.42ms` 칩 (`node-card__gpu-ms`), StatusBar 에 합계 `12.3ms GPU`. 둘 다 `supported && enabled && sample 존재` 일 때만 렌더.
- **context lost 처리**: 잃은 컨텍스트의 extension 객체는 무효 → restored 시 `GpuTimerPool.create(gl)` 재호출 + `setSupported` 재반영.

---

## 5. 카메라

### 5.1 상태 (`src/core/camera/orbitCamera.ts`)

```ts
OrbitCameraState = {
  target: [x, y, z]
  distance, yaw, pitch
  fov, near, far
  minDistance, maxDistance, minPitch, maxPitch
}
```

기본값: target=원점, distance=4, yaw≈π/4, pitch≈π·0.15, fov=π/4, clamps `minDistance=0.5..maxDistance=50`, `pitch ∈ ±π·0.49`. `viewMatrix / projMatrix / modelMatrix` 는 `gl-matrix` 의 `mat4.lookAt` / `mat4.perspective` / identity 위에 작은 래퍼.

### 5.2 입력 (`src/core/camera/input.ts`)

`createCameraController(initial)` 가 캔버스에 pointer/wheel/contextmenu 리스너를 붙이고 변경마다 `onChange(state)` 콜백을 호출한다.

| 입력 | 효과 |
|---|---|
| 좌클릭 드래그 | `orbit(yaw -= dx·0.005, pitch += dy·0.005)` |
| 우클릭 드래그 | `pan(target += rightDx, upDy)` (속도는 `distance × 0.003`) |
| 휠 | `zoom(distance *= 1 + dy·0.0015)` |
| 우클릭 메뉴 | `preventDefault` (drag pan 과 충돌 방지) |

Viewport 가 `setOnChange((c) => cameraStore.setCamera(c))` 를 걸어 매 입력 → 스토어. 매 프레임은 반대로 `cameraStore.getState().camera` 로 읽어 `executePlan` 의 FrameContext 에 넣는다. UI 측 카메라 컨트롤(`ViewportControls`) 의 Reset/FOV 도 같은 스토어를 거친다.

---

## 6. 썸네일 서브시스템

Blender 스타일의 노드 카드 라이브 미리보기를 **추가 렌더 패스 없이** 구현한다.

### 6.1 ThumbnailScheduler (`src/core/thumbnail/scheduler.ts`)

노드 ID 기반 pub/sub.

```
subscribe(nodeId, listener)   — 마운트된 NodeThumbnail 컴포넌트가 호출
setVisibility(nodeId, bool)   — IntersectionObserver 콜백에서 호출
bump(nodeId) / bumpAll()      — 즉시 갱신 강제 (슬라이더, 코드 편집, recompile)
pickReady(now)                — visible && (forceNext || now - lastUpdate >= 100ms)
commit(nodeId, image, now)    — 결과 ImageData 를 listener 로 푸시 + lastUpdate 갱신
```

스로틀은 생성자에서 `1000/hz` (기본 10Hz). 싱글톤 인스턴스는 `src/state/thumbnailScheduler.ts` 가 export.

### 6.2 AsyncThumbnailReadback (`src/core/thumbnail/asyncReadback.ts`)

WebGL2 PBO + `fenceSync` 로 메인 스레드 stall 없이 픽셀을 가져온다. **다운샘플은 GPU 에서 먼저** 수행하므로 readback 전송량은 원본 해상도와 무관하게 `96×96×4` 로 고정된다.

```
buildBlit(gl):            # 인스턴스 lazy 싱글톤
    풀스크린 쿼드 program(Y-flip 샘플) + VAO/VBO 생성

request(gl, nodeId, fb):
    if slot.pending: return false
    slot = slots[nodeId] (없으면 PBO[96²·4] + thumb FBO[96×96, no-depth] 생성)
    save(FRAMEBUFFER_BINDING, VIEWPORT)
    downsampleInto(gl, blit, slot.thumb, fb.color.texture)   # 1 draw, GPU 축소
    bindBuffer(PIXEL_PACK, slot.pbo)
    readPixels(0,0,96,96, RGBA, U8, 0)   # thumb FBO → PBO 에 비동기로 채워짐
    restore(framebuffer, viewport)
    slot.sync = fenceSync(SYNC_GPU_COMMANDS_COMPLETE, 0)
    slot.pending = true

poll(gl):
    for slot in slots:
        status = clientWaitSync(slot.sync, 0, 0)   # timeout=0 → non-blocking
        if status in {ALREADY_SIGNALED, CONDITION_SATISFIED}:
            getBufferSubData(PBO, 0, buf[96²·4])
            yield {nodeId, image: new ImageData(buf, 96, 96)}   # 이미 top-down
        # TIMEOUT_EXPIRED 이면 그대로 둠 — N 프레임 지연 허용
```

- **노드당 in-flight 1 건.** request 중복은 false 로 거절. blit program 컴파일 실패 시에도 false.
- **컴파일로 사라진 노드는 release()** — RAF 루프가 `lastPassNodeIds` 와 `plan.passes` 의 차집합에 대해 호출. `release` 는 PBO + thumb FBO 를 함께 해제, `disposeAll` 은 추가로 blit 리소스까지 정리.
- **96×96 다운샘플은 GPU 측** — 텍스처드 쿼드 1패스로 thumb FBO 에 축소(프래그먼트가 Y-flip 하여 readback 이 곧 top-down). CPU 박스필터(`downsampleToThumb`)는 더 이상 호출되지 않고, §6.4 의 동기 폴백 전용으로 남는다.

### 6.3 IntersectionObserver

`NodeThumbnail.tsx` 가 자기 `<canvas>` 에 대해 IntersectionObserver 를 달아 `scheduler.setVisibility(id, isIntersecting)` 를 호출. React Flow 의 줌/팬으로 카드가 화면 밖에 있으면 readback 자체가 큐에 들어가지 않는다.

### 6.4 동기 fallback

`src/core/thumbnail/readback.ts` 가 **동기 CPU 박스필터** `downsampleToThumb` 와 공유 상수 `THUMB_SIZE` 를 보관한다. `THUMB_SIZE` 는 `AsyncThumbnailReadback`·`NodeThumbnail` 이 공유하고, `downsampleToThumb` 는 PBO·GPU 가 쓰이지 않는 컨텍스트(정적 export 등)를 위한 CPU 폴백으로 남는다 — Phase 22 이후 라이브 readback 경로(§6.2)는 GPU 다운샘플만 사용한다.

---

## 7. 상태 스토어 (Zustand)

`src/state/*` 의 14 개 스토어. 책임 분리가 분명하므로 다음 표가 가장 빠른 인덱스다.

| Store | 보관 | recompile? | history? | 비고 |
|---|---|---|---|---|
| `graphStore` | nodes/edges/positions/parents | `rev` 변화 | structural mutation 시 push | `uniformRev` 는 별도, 슬라이더 드래그 전용. `parents` (Phase 29) 는 자식→그룹 id 의 보조 컬렉션 — 구조 변경이라 rev/history 에 포함 |
| `assetStore` | 메시·이미지 핸들 | `rev` 변화 | ✗ | 이미지 비트맵이 도착해 sampler 가 채워질 때만 의미 있음 |
| `selectionStore` | `selectedNodeIds[]` + `selectedNodeId`(primary=마지막) | ✗ | ✗ | NodeEditor 가 집합을 RF `selected` 로 동기화. Inspector·CodeEditor 는 primary 만 편집하고 2개 이상이면 다중 선택 배너 표시 (Phase 23) |
| `editorStore` | activeStage, jumpRequest | ✗ | ✗ | jumpRequest 는 `rev` 카운터 포함 — 동일 행 두 번 클릭도 발화 |
| `diagnosticsStore` | byNode[id] = {vertex, fragment, link}[] | ✗ | ✗ | recompile 직후 채워짐, CodeEditor 의 CM `setDiagnostics` 와 ProblemsPanel 이 모두 구독 |
| `cameraStore` | OrbitCameraState | ✗ | ✗ | 입력 → `setCamera`, RAF 가 `getState`. `rev` 카운터(B2) 가 idle 게이트를 깨움 |
| `viewportStore` | background rgb | ✗ | ✗ | placeholder/composite 클리어 색. `rev` 카운터(B2) 가 배경 변경 시 idle 게이트를 깨움 |
| `timeStore` | simTime, playing, speed | ✗ | ✗ | `advance(dt)` 는 RAF 가 호출. `rev` 는 play/pause/scrub/speed 변경에만 올라가고 `advance` 는 올리지 않음 |
| `rendererStore` | ready, fps/frame/drawCalls/errors | ✗ | ✗ | StatusBar 가 구독 |
| `historyStore` | past[]/future[], MAX=100 | ✗ | — | `suppressNext` 로 apply 중 재push 방지 |
| `recorderStore` | MediaRecorder 상태 | ✗ | ✗ | start/stop/elapsedMs |
| `gpuTimerStore` | byNode EMA + totalMs + supported/enabled | ✗ | ✗ | Phase 15. Viewport 가 매 frame `setSample`, 노드 사라지면 `removeNode` |

추가로 작업/디스패치 모듈(스토어 아님): `assetActions`(파일 import + IndexedDB 캐시), `autoSave`(30s 디바운스 스케줄러), `shareUrl`(`#share=` 인코딩), `serialization`(프로젝트 JSON v1).

### 7.1 rev 두 개 — 왜?

`graphStore` 는 의도적으로 두 카운터를 갖는다.

- **`rev`** — 노드/엣지/소스 등 **구조** 변경. 변하면 Viewport 가 `recompile()` 한다 (GL 프로그램 재링크 + FBO 재할당). `pushHistory` 가 같은 path 에서 일어나므로 Undo 단위와 일치한다.
- **`uniformRev`** — 슬라이더 드래그(`setUniformValue`) 와 param 값 변경(`setParamValue`). 컴파일은 안 하고 다음 RAF 에서 `pass.uniformValues` 만 새로 복사. **history 에는 안 들어감** — Undo 가 60Hz 드래그 이벤트로 가득 차는 것을 막는다.

`setParamLabel`/`setMathConfig`/`setSwizzleMask`/`setCombineConfig`/`setComputeConfig`/`updateComputeSource` 는 **포트 표면 또는 GPU 자원을 바꾸므로** `rev` 를 올리고 history 도 푸시한다 (recompile 으로 ping-pong 버퍼/TF object/VAO 가 새로 만들어짐).

추가로 B2 가 도입한 `cameraStore.rev` / `timeStore.rev` / `viewportStore.rev` 는 같은 패턴이다 — 자기 스토어가 사용자 입력으로 변경됐다는 신호만 RAF 의 dirty 게이트에 전달한다. `timeStore.advance()` 만은 매 프레임 호출되는 hot path 라 rev 를 올리지 않는다.

### 7.2 Undo/Redo

- `historyStore.push(snap)` 는 매 구조 변경 *전* 의 스냅샷을 저장(`pushHistory` 가 `useGraphStore.getState()` 를 그대로 클론).
- `undoGraph()` → 마지막 `past` 를 뱉고, 그것을 `applySnapshot` 으로 적용. `applySnapshot` 은 `suppressNext` 플래그를 살펴 자체 push 를 한 번 건너뛴다.
- `future[]` 는 `redoGraph` 가 비울 때까지 유지되며, 새로운 push 가 들어오면 `future = []` 로 잘려나간다(보통의 Undo 모델).
- `BootstrapGate` 가 그래프를 갈아끼울 때마다 `useHistoryStore.getState().clear()` 를 부른다 — 데모/share/복구 후 첫 push 는 비어 있는 상태에서 시작.

### 7.3 시간

`timeStore` 는 wall-clock 과 분리된 `simTime` 만 관리한다. RAF 가 wall-clock `dt` 를 매 프레임 `advance(dt)` 로 넘기면 `playing`/`speed` 에 따라 `simTime` 이 진행. `setTime(t)` 으로 스크럽, `togglePlaying()` 으로 Space 토글, `setSpeed(0~4×)` 가능. `u_time` 과 `paramKind='time'` 둘 다 `simTime` 을 본다.

---

## 8. 에러 처리와 진단

```
GLSL 컴파일 (createProgram)
    │
    │  ShaderError[] (stage, raw)
    ▼
compile.ts: plan.shaderErrors[nodeId] = [...]
    │
    │  per-frame recompile in Viewport
    ▼
parseShaderInfoLog(raw)  →  GLSLDiagnostic[]
    │
    ▼
diagnosticsStore.set(nodeId, {vertex, fragment, link})
    │
    ├─▶ CodeEditor: setDiagnostics(view, toCMDiagnostics(...))    # CM lint 게터
    │
    └─▶ ProblemsPanel: flatten → 클릭 → select() + setStage() + requestJump()
                                                                    │
                                                                    ▼
                                                       CodeEditor: scrollIntoView + cursor + focus
```

### 8.1 GLSL 로그 파서 (`diagnostics.ts`)

두 포맷을 지원:

- `ERROR: 0:12: 'foo' : ...`  (Mesa/ANGLE)
- `ERROR: 0:12:34: 'foo' : ...`  (line:col 변형)
- `0(12) : error C0000: ...`  (NVIDIA)
- 위 어느 것도 매칭 안 되면 `line=1, severity=error` 로 fallback — 사용자가 메시지를 잃지 않게.

### 8.2 jumpRequest 동시성

`ProblemsPanel` 의 클릭은 동시에 세 가지를 만들어낸다: `selectionStore.select(nodeId)`, `editorStore.setStage(stage)`, `editorStore.requestJump({line, column})`. CodeEditor 는 두 단계로 처리:

1. **doc 교체** — `(effectiveId, stage)` 가 바뀌면 새 소스로 dispatch.
2. **점프 effect** — `jumpRequest.nodeId === effectiveId && stage === activeStage` 일 때만 `EditorView.scrollIntoView(pos, {y:'center'}) + cursor + focus` 적용 후 `clearJump()`.

순서가 보장되지 않을 수 있으므로, `nodeId/stage` 가 맞아떨어진 시점에서만 점프하고 doc 교체와 경합하지 않는다. `jumpRequest.rev` 카운터는 *같은* `(node, stage, line)` 의 두 번째 클릭에서도 effect 가 재발화하도록 보장한다.

### 8.3 런타임 에러

`rendererStore.stats.errors[]` 는 `pushError(msg)` 로 누적. `compileGraph` 가 throw 하거나 plan.errors (validate 결과) 가 있으면 한 줄 join. StatusBar 에 카운트, ProblemsPanel "Runtime errors" 섹션에 메시지 노출.

### 8.5 LSP-like 편집기 기능 (Phase 25)

Phase 24 의 *진단* 채널과 별도로, **에디터 측 심볼 인식과 hover** 를 위한 정적 분석 계층. CodeMirror 6 위에 다음 두 모듈이 얹힌다:

```
CM updateListener (doc 변경)
    │
    └─▶ autocomplete (codemirror autocompletion override)
            │  source = state.doc.toString(), line = state.doc.lineAt(pos).number
            ▼
        glslSource(context)
            │
            ├─▶ symbolCompletions(source, line)
            │       └─ buildSymbolTable(source) → symbolsVisibleAt(table, line)
            │
            ├─▶ uniformCompletions(source)          // @label / system desc
            │
            └─▶ STATIC_BASE                          // GLSL_FUNCTIONS/TYPES/KEYWORDS
                                                     // 빌트인은 BUILTIN_FUNCTIONS 에서
                                                     // signature(detail) + 설명(info) 부착

CM pointer (hover)
    │
    └─▶ hoverTooltip(view, pos)
            │  identifierAt(line.text, line.from, pos)  → {from, to, word}
            ▼
        lookupHover(source, word, line)
            │
            ├─▶ resolveSymbol(buildSymbolTable, word, line)   // 1순위: 문서 심볼
            ├─▶ BUILTIN_FUNCTIONS[word]                       // 2순위: 빌트인 함수
            ├─▶ SYSTEM_UNIFORM_DESCRIPTIONS[word]             // 3순위: 미선언 system uniform
            └─▶ KEYWORD_DESCRIPTIONS[word]                    // 4순위: storage/제어 키워드
                                                              // 매칭 없으면 null → 툴팁 미표시
```

**심볼 테이블 (`core/glsl/symbolTable.ts`)** — 정규식 + 중괄호 깊이 워커:
- 블록 코멘트는 공백으로 치환(라인 번호 유지), 라인 코멘트는 라인 단위 strip.
- `depth === 0 && !structDepth`: storage-qualified decl(`uniform/in/out/attribute/varying/const`), `struct ... {`, 함수 헤더(`<retType> <name>(<args>) {`) 매칭. 함수 헤더 진입 시 파라미터들을 `scope = funcName` 로 추가.
- `depth ≥ 1` 안에서: 로컬 변수 decl(쉼표 멀티 — `float a, b = 1.0;` 두 번째 패스로 수집), `for (int i = ...)` 인덕션 변수.
- `if/for/while/return/case/switch` 키워드는 `NOT_A_FUNCTION` 화이트리스트로 함수 헤더 매칭에서 제외.
- 출력 `GlslSymbol` 은 `{name, type, kind, line, column, scope, parameters?}`. `scope` 는 함수 이름 또는 `null`(top-level).
- `symbolsVisibleAt(table, line)` — 라인의 enclosing 함수를 *해당 라인 이전의 마지막 함수 헤더* 로 근사(body 의 정확한 끝을 추적하지 않아도 sequential function 정의에서는 정확). 출력 순서: 로컬(decl ≤ line) → 파라미터 → 글로벌, 이름 중복은 처음 등장한 것만 유지(local shadow 글로벌이 우선).

**빌트인 카탈로그 (`core/glsl/builtins.ts`)** — `BUILTIN_FUNCTIONS: Record<name, {signatures[], description}>` + `KEYWORD_DESCRIPTIONS`. `GLSL_FUNCTIONS` 와 양방향 일치(단위 테스트가 강제).

**오작동 시나리오 — 명시적으로 받아들임**:
- 중첩 블록 안의 로컬도 함수 scope 로 처리(블록 scope 추적 안 함). hover 가 잠시 풀어진 로컬을 제안할 뿐, 컴파일은 진단 채널이 잡으므로 안전.
- 사용자가 GLSL 의 nested function 처럼 보이는 lambda 등을 적으면 헤더 매칭이 어긋날 수 있으나, GLSL ES 는 nested function decl 자체가 없어서 실제 셰이더에서는 발생하지 않음.
- `for` 안의 동일 라인에 일반 decl 이 함께 있으면 dupe 회피 가드가 두 번째 등록을 막음.

**DEV bridge** — `window.__sp.glslSymbols = { build, visibleAt, resolve, builtins, keywords }` (다른 store 와 동형, DEV 빌드 한정). E2E 가 CM 와이어링 없이 심볼 파싱 정확도를 직접 검증할 때 사용.

### 8.6 시맨틱 토큰 하이라이트 (Phase 26)

Phase 25 의 심볼 테이블 위에 *식별자 역할 색* 만 덧칠하는 layered approach. lexer-based `glsl()` 언어팩과 `defaultHighlightStyle` (키워드·타입·숫자·연산자)은 그대로 두고, 식별자 위에 우리 decoration 이 색을 덮어쓴다.

```
CM ViewPlugin (mounted from glslSetup.ts)
   │
   │  update.docChanged || update.viewportChanged
   ▼
buildSemanticDecorations(view)
   │
   ├─▶ classifySemanticTokens(source)
   │       ├─ buildSymbolTable(source)            // Phase 25 재사용
   │       ├─ stripBlockComments + maskLineComment
   │       └─ 라인별 identifier 정규식 매칭마다:
   │             (1) resolveSymbol → kind 매핑 (local 은 null)
   │             (2) BUILTIN_FUNCTIONS[name]      → function-builtin
   │             (3) SYSTEM_UNIFORMS.has(name)    → system-uniform
   │             else                              → 토큰 미발행
   │
   ├─▶ Decoration 캐시 (kind 당 단일 Decoration.mark 인스턴스)
   │
   └─▶ view.visibleRanges 와 정렬된 토큰을 lockstep 으로 walk
           → RangeSetBuilder.add(from, to, deco)  // 정렬 보장
```

- **11 종 토큰 kind**: `uniform / system-uniform / in / out / attribute / varying / const / parameter / struct-type / function-user / function-builtin`. local 은 의도적으로 미분류 → 에디터 기본 색.
- **우선순위**: in-scope 심볼 테이블이 1순위 → 사용자가 `float sin(...)` 으로 빌트인 이름을 재정의하면 `function-user` 가 이긴다. 이미 사용자 uniform 이름이 `u_*` 라도 SYSTEM_UNIFORMS 셋에 없으면 `uniform` 으로 분류된다.
- **CSS 매핑**: 각 kind 는 `cm-glsl-token-<kind>` 클래스 → `glslSetup.ts` 의 dark theme 에서 색 지정 (VS Code Dark+ 관례).
- **cost 통제**: 분류기는 라인 한 번씩만 정규식 + 심볼 테이블 lookup. 1000-line 셰이더에서도 < 1ms 추정이라 별도 debounce 없음. viewport 외 토큰은 RangeSetBuilder 에 추가하지 않으므로 큰 문서에서도 O(visible-lines) decoration 만 보유.
- **DEV bridge**: `window.__sp.glslSemanticTokens = { classify, classifyIdentifier }` (다른 store/glsl 모듈과 동형, DEV 빌드 한정). E2E 가 CM 와이어링 없이 분류 정확도와 정렬 계약을 직접 검증.

### 8.7 Goto / References / Rename (Phase 27 + Phase 28 cross-stage)

Phase 25 의 심볼 테이블 + `resolveSymbol` 을 그대로 재활용해 같은 declaration 으로 해석되는 모든 occurrence 를 모으고, 그 위에 (a) cursor 점프 (b) 단일 트랜잭션 rename (c) active reference 페인트 세 가지 surface 를 얹는다. Phase 28 에서 rename 은 ShaderNode 의 vertex + fragment 두 stage 를 묶는 *프로그램* 단위로 확장 — 한 `updateShaderSource({vertexSource,fragmentSource})` 패치 = 한 graph history push.

```
core/glsl/references.ts
   findReferences(source, name, atLine)
      ├─ buildSymbolTable + resolveSymbol(name, atLine) → target
      ├─ source 의 모든 identifier 위치 스캔(블록/라인 코멘트 마스킹)
      ├─ 각 위치에서 다시 resolveSymbol → target 과 line·column 일치만 채택
      └─ ReferenceSite[] (from/to/line/column/isDefinition) — document 순서

CodeMirror 와이어링 (glslSetup.ts)
   ├─ glslGotoDefinition()    F12 keymap + Cmd/Ctrl+Click DOM 핸들러
   │      └─ findDefinitionAt(view, pos) → EditorSelection.cursor + scrollIntoView
   ├─ glslRename()            F2 keymap
   │      └─ runRename(view, promptFn) → validateRenameName → findReferences
   │           → view.dispatch({ changes: sites.map(...) })  // single undo step
   └─ glslReferenceHighlight() StateField<DecorationSet>
          └─ docChanged || selection 변화 시 buildReferenceDecorations
                  → isDefinition ? .cm-glsl-ref-definition : .cm-glsl-ref-occurrence
```

- **Shadowing 규칙은 references 단에서 한 번 적용**: 한 occurrence 의 binding 이 target 과 다르면(예: 로컬이 글로벌을 가린 안쪽), 그 위치는 결과에서 빠진다. global rename 은 shadowed 안 된 곳만, local rename 은 자기 함수 본문만 변경되는 게 자동 보장된다.
- **F12 / Cmd+Click 분기**: 키맵은 `view.state.selection.main.head` 기준, 클릭 핸들러는 `posAtCoords(clientXY)` 로 doc offset 계산. modifier(`metaKey || ctrlKey`) 가 없으면 무시 — CM 기본 selection 동작 보존. 미정의 식별자(builtin / keyword / no-binding) 는 silently no-op.
- **Rename UX**: 기본 prompt 는 `window.prompt` (가장 마찰 적은 경로). 검증은 `^[A-Za-z_][A-Za-z0-9_]*$` + `GLSL_KEYWORDS ∪ GLSL_TYPES` 예약어 set. 결과는 `RenameResult` discriminated union — `applied: true` 면 `{ sites, newName }`, false 면 `{ reason }` 로 5 종 skip 사유(`not-on-identifier` / `no-binding` / `prompt-cancelled` / `unchanged` / `invalid-name`).
- **Active highlight**: 단일 site(decl 만 존재)면 `Decoration.none` — 노이즈 회피. 비용은 cursor 이동마다 `buildSymbolTable + findReferences` 한 번이지만 playground 규모에서 < 1ms 추정이라 debounce 없음.
- **CodeEditor observation bridge (`ui/CodeEditor/currentView.ts`)**: CodeEditor.tsx 가 mount/unmount 시 `setCurrentView(view)` / `setCurrentView(null)` 로 module-level ref 갱신. 프로덕션 코드는 의존하지 않고, `__sp.codeEditor = { getCursorLine, focus }` (DEV 한정) 으로 E2E 가 cursor 위치를 직접 읽는다 — F12 점프 결과 검증을 CM DOM 추측 없이 line number 비교로 처리.
- **DEV bridge 추가**: `window.__sp.glslSymbols.findReferences` (references finder), `window.__sp.codeEditor` (cursor introspection). 기존 Phase 25 의 `glslSymbols` 객체에 한 함수만 더해 형태가 일관된다.

#### 8.7.1 Cross-stage rename (Phase 28)

ShaderNode 는 vertex + fragment 두 GLSL 소스를 한 *프로그램* 으로 묶는다 — uniform / varying / function / struct 같은 글로벌은 GLSL 링커가 한 binding 으로 본다. Phase 28 의 rename 은 이 사실을 반영해 두 stage 의 occurrence 를 같은 트랜잭션으로 교체한다.

```
core/glsl/references.ts
   findReferencesAcrossStages({vertex, fragment}, name, originStage, atLine)
      ├─ originSource = stages[originStage]
      ├─ resolveSymbol(originTable, name, atLine) → target
      ├─ findReferencesOf(origin) → originSites  (각 site.stage = originStage)
      │
      └─ if target.scope === null && CROSS_STAGE_KINDS.has(target.kind):
           otherTable = buildSymbolTable(otherSource)
           otherTarget = resolveSymbol(otherTable, target.name, 1)
           if otherTarget?.scope === null && CROSS_STAGE_KINDS.has(otherTarget.kind):
             findReferencesOf(other) → otherSites
      → sortByStageAndOffset(originSites + otherSites)

ui/CodeEditor/rename.ts
   runRename(view, promptFn, crossStage?)
      ├─ collectSites — crossStage 가 있으면 findReferencesAcrossStages,
      │                 없으면 Phase 27 의 findReferences
      ├─ split → localSites (= origin stage) + otherSites
      ├─ if crossStage && otherSites.length > 0:
      │     newOrigin = applyEdits(source, localSites, next)
      │     newOther  = applyEdits(crossStage.otherStageSource, otherSites, next)
      │     crossStage.applyBothStages(newOrigin, newOther)   // 한 history push
      └─ view.dispatch({ changes: localSites })               // CM undo step

   resolveCrossStageContext()  (module-private)
      ├─ selectionStore.getState().selectedNodeId → ShaderGraphNode 이어야
      ├─ editorStore.getState().activeStage → originStage
      └─ applyBothStages = (newOrigin, newOther) =>
            graphStore.updateShaderSource(sn.id, {
              vertexSource:  originStage === 'vertex' ? newOrigin : newOther,
              fragmentSource: originStage === 'vertex' ? newOther : newOrigin,
            })
```

- **`CROSS_STAGE_KINDS`**: `uniform / in / out / attribute / varying / const / function / struct`. 로컬 / 파라미터는 GLSL 링커가 다른 binding 으로 보므로 의도적으로 제외 — vertex `main` 의 `float k` 와 fragment `main` 의 `float k` 는 이름만 같은 별개 변수. 같은 stage 안에서는 Phase 27 의 shadowing 규칙 그대로.
- **Partial rename**: other stage 에 동명 글로벌이 없으면 (예: vertex 의 `in a_position`) origin-stage 단독 rewrite. 결과는 partial 이지만 정상 종료 — 오류 아님.
- **Other-stage shadowing**: other stage 의 글로벌 binding 은 잡되, 그 안에서 같은 이름의 로컬이 가린 곳(`resolveSymbol` 이 로컬을 돌려주는 위치)은 자동 제외. global rename 이 local 을 망가뜨리지 않는다.
- **Single graph-history push**: `applyBothStages` 가 한 `updateShaderSource({ vertexSource, fragmentSource })` 패치로 양 stage 를 동시에 set. 이후 CM dispatch 가 origin stage 의 view 를 갱신하고, 50 ms 후 commit debounce 가 다시 `updateShaderSource(...)` 를 부를 때는 store 값이 같아 early-return → 추가 push 없음. Cmd+Z 한 번에 전체 rename 이 되돌려진다.
- **ComputeNode / 비-Shader 선택**: `resolveCrossStageContext()` 가 `undefined` 반환 → `runRename` 은 Phase 27 의 single-document 경로로 폴백. 단위 테스트와 ComputeNode 편집기에서 기존 동작 변화 없음.

### 8.4 라이브 GLSL 검증 (Phase 24)

Authoritative recompile 경로(`graphStore.rev` → `compileGraph` → `gl.getShaderInfoLog`) 와 별개로, **CodeMirror 의 키스트로크마다** OffscreenCanvas WebGL2 워커에 셰이더를 보내 컴파일 로그를 받아오는 라이브 채널을 둔다. 사용자가 50ms commit debounce + 그래프 recompile 까지 기다리지 않고 밑줄을 본다.

```
CM updateListener (doc 변경)
   │
   ├─▶ commit (debounce 50ms)  ─▶ updateShaderSource ─▶ graphStore.rev++ ─▶ 권위 진단 (그대로)
   │
   └─▶ liveValidate (debounce 150ms)
           │
           ▼
       glslValidator().validate(stage, source)
           │  (lazy 첫 호출에 ?worker 인스턴스화)
           ▼
       Worker: OffscreenCanvas(1,1).getContext('webgl2')
               → createShader/compileShader/getShaderInfoLog
               → postMessage({log, ok})
           │
           ▼
       parseShaderInfoLog(log) → GLSLDiagnostic[]
           │  (ctxRef 가 promise 도착 시점에 같은 (node, stage) 면 적용)
           ▼
       setLiveDiags(diags)
           │
           ▼
       CM diagnostics push effect: 권위 ∪ 라이브 (같은 line:severity 면 라이브 드롭)
                                  → setDiagnostics → CM 밑줄
```

- **백엔드 선정 근거**: M0 측정 (`tests/measure/glsl-validator.spec.ts`) 에서 워커의 InfoLog 가 메인 스레드 GL 컨텍스트와 byte-perfect 일치(5/5 셰이더, syntax/undeclared/type-mismatch 포함) 함을 확인. 신규 의존성 0, 워커 소스 ~1KB, init 52ms. glslang-wasm (~1.8MB wasm, deprecated) 대비 모든 축에서 우세 — 측정 없이 채택.
- **격리**: 워커는 메인 스레드 GL 컨텍스트와 분리된 OffscreenCanvas 라 사용자 셰이더가 잘못 컴파일돼도 렌더 GL state 를 오염시키지 않는다. 워커 GL 컨텍스트는 한 번 만들고 영구 재사용 (셰이더만 매 요청에 create/compile/delete).
- **실패 모델**: 워커 construct/post/error 어느 단계 실패해도 클라이언트는 `[]` resolve. 권위 recompile 경로가 source of truth 로 그대로 동작 — 라이브는 *보조* 채널이다. 워커 미가용 환경에서는 기존 동작(컴파일 후 진단)만 남는다.
- **머지/우선순위**: CodeEditor 진단 push effect 가 `auth = diagnosticsStore[stage] + link` 와 `live = liveDiags` 를 합성하되 *같은 `line:severity` 가 양쪽에 있으면 라이브 드롭*. 사용자가 에러를 고치는 순간 — 라이브는 즉시 비고, 권위는 다음 recompile 까지 잠시 stale — 잠깐 권위가 살아 있는 동안 라이브가 추가로 중복 표시하지 않는다.
- **switch race**: `liveValidate` 가 dispatch 한 promise 가 다른 노드/스테이지로 전환된 뒤 도착하면 `ctxRef` 가 다른 `(id, stage)` 라 그대로 폐기. doc 교체 effect 는 switching 일 때 `setLiveDiags([])` 로 초기화.

---

## 9. 직렬화와 영속화

```
                       ┌────────────────────────────┐
                       │  graphStore + positions    │
                       └─────────────┬──────────────┘
                                     │
                       serializeProject({format, version=1, exportedAt, graph, positions})
                                     │
              ┌──────────────────────┼────────────────────────────┐
              ▼                      ▼                            ▼
        JSON.stringify         IndexedDB (autosave)         gzip + base64url
        (export 버튼)         shader-playground-session         (#share=...)
                              /session/autosave
```

### 9.1 프로젝트 포맷 (`src/state/serialization.ts`)

`{ format: 'shader-playground', version: 1, exportedAt: ISO, graph, positions }`.

- 노드는 `kind` 별로 손수 정규화(`structuredCloneNode`) — 알 수 없는 키가 같이 흘러들지 않게.
- 검증은 import 시 `validateGraph` 를 돌려 `missing_node`/`multiple_outputs` 만 warnings 로 노출. `cycle` 은 fatal 처럼 보이지만 deserialize 자체는 통과하고 컴파일 시 그쪽에서 막힌다.
- `version` 이 미래 값이면 `warnings` 로 알리고 로드는 시도.

### 9.2 Auto-save (`src/state/autoSave.ts`)

- 키: `IDBDatabase('shader-playground-session') / store('session') / key 'autosave'`.
- 스케줄러는 `graphStore.subscribe` 로 모든 변경을 받아 30 초 debounce, `rev === lastSavedRev` 이면 패스. **bootstrap 직후 rev 와 lastSavedRev 가 같으므로 데모 그래프 자체는 자동저장에 쓰이지 않는다** — 첫 클린 부팅에서 복구 다이얼로그가 뜨지 않는 이유.
- `BootstrapGate` 의 `startAutoSave()` 는 idempotent. 같은 모듈 안에서 모든 인스턴스가 싱글톤 `_activeHandle` 을 공유.
- `flush()` 는 unload 직전 강제 저장 훅 (현재 unload 리스너는 안 걸려 있지만 API 는 노출).

### 9.3 Share URL (`src/state/shareUrl.ts`)

`#share=<payload>` 만 본다.

```
serializeProject → JSON.stringify → TextEncoder → CompressionStream('gzip') → base64url
```

복호도 정확히 역순. `CompressionStream` 미지원 브라우저는 passthrough(압축 안 함) — 동작은 하되 URL 이 길어짐. payload 정규식은 `[#&]share=([A-Za-z0-9_-]+)`.

### 9.4 BootstrapGate 우선순위

`src/ui/BootstrapGate.tsx`:

1. 그래프에 이미 노드가 있으면 (HMR/테스트) → autosave 시작하고 종료.
2. URL 해시에 `share=` 가 있으면 → decode → setGraph → `clearSession()` (공유 URL 이 복구를 무력화) → autosave.
3. autosave 로드 → 노드 0개가 아니면 `<dialog>` 표시. 사용자가:
   - "복구" → deserialize → setGraph → history.clear → autosave
   - "새로 시작" → `clearSession()` → 데모 → autosave
4. autosave 도 없으면 → 데모 그래프 (`createDemoGraph` + `DEMO_LAYOUT`) → autosave 시작.

### 9.5 에셋 캐시 (`src/core/assets/cache.ts`)

별도 IndexedDB (`shader-playground` DB, `meshes`/`images` 스토어). MeshAttribute 들은 `ArrayBuffer.slice` 로 재현 가능한 형태로 저장(`view.byteOffset` 보정). 이미지는 원본 `Blob` 으로 저장하고 hydrate 시 `createImageBitmap(blob, {premultiplyAlpha:'none'})` 로 비트맵 복원. 프로젝트 JSON 에는 assetId 만 들어가므로 그래프와 에셋이 분리되어 share URL 도 가벼움.

---

## 10. 정적 HTML export

`src/export/htmlExport.ts` + `src/export/standalonePlayer.js`.

- 빌드 타임에 Vite 의 `?raw` 로 `standalonePlayer.js` 의 텍스트를 가져와 결과 HTML 에 `<script>...</script>` 로 인라인. 이 스크립트는 **0 dependencies** — 자체 `mat4`, primitive 생성기, GLSL 컴파일/링크, 패스 위상정렬, paramBindings 평가, splitLayout 까지 미니 런타임으로 다시 구현한다.
- 프로젝트 JSON 은 `window.__SP_PROJECT = ...` 로 동일 페이지에 임베드. `</script>` 와 `<!--` 는 `<\/script>` / `<\!--` 로 이스케이프 — 사용자 입력 GLSL 이나 라벨이 HTML 컨텍스트를 깨뜨리지 못한다.
- 페이지에는 풀스크린 `<canvas id="canvas">` 하나뿐. 카메라 마우스 입력·녹화·Inspector 같은 에디터 UI 는 export 에 포함되지 않는다(재생 전용 결과물).

생성된 HTML 한 파일을 `iframe srcdoc` 또는 정적 호스팅 어디든 올리면 그래프가 그대로 돌아간다.

---

## 11. 캔버스 녹화

`src/state/recorder.ts`:

- `canvas.captureStream(fps=30)` + `new MediaRecorder(stream, {mimeType})`.
- mimeType 후보 순서: `video/webm;codecs=vp9` → `vp8` → `webm` → `mp4`. `MediaRecorder.isTypeSupported` 로 첫 매치.
- 250ms 청크로 받아 `chunks[]` 에 누적, stop 시 `new Blob(chunks, {type})` → `URL.createObjectURL` → 자동 다운로드(Toolbar 가 wire).
- 진행 시간은 RAF 가 `tick()` 호출로 갱신 (StatusBar/Toolbar 표시).
- `captureStream` 미지원 (구 Safari) 또는 `MediaRecorder` 자체 미지원이면 `error` 필드로 보고하고 idle 유지.

---

## 12. 디렉토리 트리 (Phase 29 기준)

> `.test.ts` 파일은 같은 디렉토리에 동거하며, 단위 테스트가 존재하는 모듈은 끝에 `(+ test)` 로 표기.

```
ShaderPlayground/
├─ index.html
├─ vite.config.ts
├─ vitest.config.ts
├─ tsconfig.json
├─ package.json
├─ SPEC.md
├─ Architecture.md
├─ README.md
└─ src/
   ├─ main.tsx                       # React 엔트리, App 마운트
   ├─ App.tsx                        # 셸 (NodeEditor / Viewport / CodeEditor / SidePanel / StatusBar + overlay)
   ├─ index.css
   ├─ test-setup.ts                  # Vitest + jsdom 부트스트랩
   ├─ vite-env.d.ts
   │
   ├─ core/                          # ── React 비의존 ──────────────────
   │  ├─ gl/
   │  │  ├─ context.ts               # WebGL2 컨텍스트 생성/검증
   │  │  ├─ program.ts               # 컴파일/링크 + InfoLog 노출
   │  │  ├─ texture.ts               # 텍스처 생성/포맷
   │  │  ├─ framebuffer.ts           # FBO + 컬러/깊이 어태치먼트
   │  │  ├─ mesh.ts                  # VBO/VAO 업로드/draw
   │  │  ├─ uniforms.ts              # 유니폼 setter 디스패처
   │  │  └─ gpuTimer.ts              # Phase 15 — EXT_disjoint_timer_query_webgl2 풀 (+ test)
   │  │
   │  ├─ camera/
   │  │  ├─ orbitCamera.ts           # OrbitCameraState + view/proj/orbit/pan/zoom (+ test)
   │  │  └─ input.ts                 # createCameraController — pointer/wheel 부착
   │  │
   │  ├─ graph/
   │  │  ├─ types.ts                 # GraphNode/Edge/Port + Param·Math·Swizzle·Combine·Compute·Group
   │  │  ├─ compile.ts               # graph → ExecutionPlan (ShaderPass | ComputePass) (+ test)
   │  │  ├─ execute.ts               # executePlan + splitLayout + TF dispatch
   │  │  ├─ validate.ts              # cycle / multi_input / multiple_outputs (+ test)
   │  │  ├─ diagnostics.ts           # GLSL 로그 파서 (+ test)
   │  │  ├─ uniformParser.ts         # uniform + 주석 힌트 (+ test)
   │  │  ├─ computeSeed.ts           # sphere/cube/random/zero seed 생성기 (+ test)
   │  │  ├─ parents.ts               # Phase 29 — parent map + abs/relative 좌표 + cycle 가드 (+ test)
   │  │  └─ splitLayout.test.ts      # 분할 뷰포트 단위 테스트
   │  │
   │  ├─ thumbnail/
   │  │  ├─ readback.ts              # 동기 readPixels + 96×96 다운샘플 (폴백)
   │  │  ├─ asyncReadback.ts         # PBO + fenceSync 비동기 readback (+ test)
   │  │  └─ scheduler.ts             # 10Hz 스로틀 + 가시성 큐 (+ test)
   │  │
   │  ├─ external/                   # Phase 14a — 라이브 외부 텍스처 소스
   │  │  └─ registry.ts              # singleton handle pool · reconcile/update/dispose · getUserMedia (+ test)
   │  │
   │  ├─ glsl/                       # Phase 24/25/26/27/28 — 라이브 GLSL 검증 + LSP-like 정적 분석
   │  │  ├─ glslValidator.ts         # main-thread 클라이언트 (lazy worker · Promise API · 실패 시 [] resolve) (+ test)
   │  │  ├─ glslValidator.worker.ts  # OffscreenCanvas WebGL2 컴파일 워커 (?worker)
   │  │  ├─ symbolTable.ts           # Phase 25 — uniform/in/out/const/local/parameter/function/struct 파서 + scope 추적 (+ test)
   │  │  ├─ builtins.ts              # Phase 25 — GLSL_FUNCTIONS 시그니처/설명 + KEYWORD_DESCRIPTIONS (+ test)
   │  │  ├─ semanticTokens.ts        # Phase 26 — 식별자 역할 분류기 (symbolTable + builtins + SYSTEM_UNIFORMS) (+ test)
   │  │  └─ references.ts            # Phase 27/28 — findReferences + findReferencesAcrossStages (cross-stage rename) (+ test)
   │  │
   │  ├─ nodes/
   │  │  ├─ registry.ts              # 노드별 PortSpec + 동적 포트(Shader/Math/Swizzle/Combine) (+ test)
   │  │  └─ utility.ts               # resolveValueFor + Math/Swizzle/Combine CPU 평가 (+ test)
   │  │
   │  └─ assets/
   │     ├─ primitives.ts            # cube/sphere/plane/torus/quad 생성기 (+ test)
   │     ├─ objLoader.ts             # @loaders.gl/obj 래퍼 (+ test)
   │     ├─ gltfLoader.ts            # @loaders.gl/gltf 래퍼 (지오메트리만)
   │     ├─ imageLoader.ts           # createImageBitmap 래퍼
   │     ├─ videoLoader.ts           # Phase 14b — mp4/webm 메타 프로빙 + Blob (+ test)
   │     ├─ audioLoader.ts           # Phase 14c — decodeAudioData 메타 프로빙 + Blob (+ test)
   │     ├─ cache.ts                 # IndexedDB 에셋 캐시 (mesh ArrayBuffer / image·video·audio Blob)
   │     └─ types.ts                 # GeometryHandle, ImageHandle, VideoAssetHandle, AudioAssetHandle
   │
   ├─ state/                         # ── Zustand 스토어 ────────────────
   │  ├─ graphStore.ts               # nodes/edges/positions + rev/uniformRev (+ test)
   │  ├─ assetStore.ts               # 메시/이미지 카탈로그 (런타임 핸들)
   │  ├─ assetActions.ts             # import + IndexedDB hydrate (+ test)
   │  ├─ selectionStore.ts           # selectedNodeIds[] + primary selectedNodeId (+ test)
   │  ├─ rendererStore.ts            # fps/frame/drawCalls/errors (+ test)
   │  ├─ cameraStore.ts              # OrbitCameraState 보관 + reset
   │  ├─ viewportStore.ts            # background rgb
   │  ├─ timeStore.ts                # simTime/playing/speed/advance (+ test)
   │  ├─ diagnosticsStore.ts         # byNode[id]={vertex/fragment/link}
   │  ├─ editorStore.ts              # activeStage + jumpRequest(rev) (+ test)
   │  ├─ historyStore.ts             # Undo/Redo 100건 + suppressNext (+ test)
   │  ├─ demoGraph.ts                # 부트스트랩/프리셋 그래프 시드 (+ test)
   │  ├─ serialization.ts            # 프로젝트 JSON v1 (+ test)
   │  ├─ shareUrl.ts                 # gzip + base64url + URL hash (+ test)
   │  ├─ autoSave.ts                 # 30s debounce IndexedDB 자동저장 (+ test)
   │  ├─ recorder.ts                 # MediaRecorder → WebM/mp4
   │  ├─ thumbnailScheduler.ts       # core/thumbnail/scheduler 싱글톤
   │  └─ gpuTimerStore.ts            # Phase 15 — byNode EMA ms + totalMs + supported/enabled (+ test)
   │
   ├─ ui/                            # ── React 컴포넌트 ────────────────
   │  ├─ BootstrapGate.tsx           # share / autosave 복구 / 데모 분기 + 다이얼로그
   │  ├─ KeyboardShortcuts.tsx       # 전역 단축키 — Cmd+Z/Y(undo/redo), Cmd+D(복제), Cmd+A(전체 선택), 화살표(선택 일괄 이동, Phase 23), Space(play/pause), Cmd+K
   │  │
   │  ├─ NodeEditor/
   │  │  ├─ index.tsx                # React Flow 캔버스 + graphStore 양방향
   │  │  ├─ Toolbar.tsx              # 노드 팔레트 / 저장 / Share / Record / Export HTML
   │  │  ├─ NodeThumbnail.tsx        # 카드 <canvas> + IntersectionObserver
   │  │  ├─ nodeCard.css
   │  │  └─ nodes/
   │  │     ├─ MeshNodeView.tsx
   │  │     ├─ ImageNodeView.tsx
   │  │     ├─ WebcamNodeView.tsx    # Phase 14a — live <video> preview + getExternalStream polling
   │  │     ├─ VideoNodeView.tsx     # Phase 14b — live <video> preview + status
   │  │     ├─ AudioNodeView.tsx     # Phase 14c — source kind / fftSize / status 메타
   │  │     ├─ ShaderNodeView.tsx    # FBO 라이브 썸네일 + 핸들/라벨
   │  │     ├─ OutputNodeView.tsx
   │  │     ├─ ParamNodeView.tsx     # Float/Vec3/Color/Time
   │  │     ├─ UtilityNodeViews.tsx  # Math/Swizzle/Combine
   │  │     ├─ ComputeNodeView.tsx   # TF 컴퓨트 — count/primitive/attribute 메타 표시
   │  │     ├─ GroupNodeView.tsx     # Phase 29 — 그룹 카드 + NodeResizer 컨테이너
   │  │     └─ GpuTimerChip.tsx      # Phase 15 — 카드 우상단 ms 칩
   │  │
   │  ├─ CodeEditor/
   │  │  ├─ index.tsx                # CodeMirror 6 + jumpRequest + lint sync + 라이브 검증 + currentView 등록
   │  │  ├─ StageTabs.tsx            # vertex / fragment + 에러 닷
   │  │  ├─ glslSetup.ts             # CM extensions 묶음 (lint + autocomplete + hover + semantic tokens + refs/goto/rename + theme)
   │  │  ├─ autocomplete.ts          # Phase 25 — scope-aware 자동완성 (symbolTable + builtins) (+ test)
   │  │  ├─ hover.ts                 # Phase 25 — hoverTooltip + lookupHover (+ test)
   │  │  ├─ semanticHighlight.ts     # Phase 26 — ViewPlugin + Decoration.mark + visibleRanges walker (+ test)
   │  │  ├─ gotoDef.ts               # Phase 27 — F12 keymap + Cmd/Ctrl+Click DOM 핸들러 (+ test)
   │  │  ├─ rename.ts                # Phase 27 — F2 keymap + single-transaction rewrite + reserved-word 검증 (+ test)
   │  │  ├─ referenceHighlight.ts    # Phase 27 — StateField → Decoration set (커서 위 심볼의 occurrence 페인트) (+ test)
   │  │  ├─ currentView.ts           # Phase 27 — module-level EditorView ref (DEV bridge 관찰 전용)
   │  │  └─ lintAdapter.ts
   │  │
   │  ├─ Viewport/
   │  │  └─ index.tsx                # <canvas> + RAF + asyncReadback 펌프 + cameraCtl
   │  │
   │  ├─ CommandPalette/
   │  │  └─ index.tsx                # Cmd+K — 노드/프리셋/Math/Swizzle/Combine 추가
   │  │
   │  └─ Panels/
   │     ├─ SidePanel.tsx            # Inspector ↔ Assets ↔ Problems 탭 컨테이너
   │     ├─ Inspector.tsx            # 디스패처 (Shader/Param/Utility/Mesh/Webcam/Video/Audio)
   │     ├─ UniformControl.tsx       # slider / multi / color
   │     ├─ UniformHintEditor.tsx    # Phase 21 — ⚙ 주석 힌트 GUI (range/step/default/label)
   │     ├─ ParamInspector.tsx
   │     ├─ UtilityInspector.tsx
   │     ├─ WebcamInspector.tsx      # Phase 14a — device dropdown + live status
   │     ├─ VideoInspector.tsx       # Phase 14b — 에셋 선택 / play·loop·mute / seek
   │     ├─ AudioInspector.tsx       # Phase 14c — mic↔file / fftSize / smoothing / play·loop
   │     ├─ GroupInspector.tsx       # Phase 29 — label/color 편집 + ungroup / delete-with-children
   │     ├─ ViewportControls.tsx     # 카메라 Reset/FOV + 배경색 + 시간
   │     ├─ ProblemsPanel.tsx        # 진단 → select + setStage + requestJump
   │     ├─ AssetBrowser.tsx
   │     └─ StatusBar.tsx
   │
   ├─ export/                        # ── 정적 HTML export ──────────────
   │  ├─ htmlExport.ts               # Project JSON → 단일 파일 HTML (+ test)
   │  └─ standalonePlayer.js         # 의존성 0 미니 런타임 (Vite `?raw` 임베드)
   │
   ├─ shaders/                       # ── 빌트인 GLSL ───────────────────
   │  ├─ fullscreen.vert
   │  ├─ basic.vert
   │  ├─ color.frag
   │  ├─ tfNoop.frag                 # 컴퓨트 패스의 dummy fragment (RASTERIZER_DISCARD 와 짝)
   │  ├─ particles/
   │  │  ├─ particle.vert            # 컴퓨트 — sin 기반 noise field 시뮬
   │  │  └─ particleRender.vert      # 컴퓨트 출력 attribute 를 받는 ShaderNode vertex
   │  └─ templates/
   │     ├─ unlit.frag
   │     ├─ uvDebug.frag
   │     ├─ blur.frag
   │     ├─ noise.frag
   │     ├─ tonemap.frag
   │     ├─ blend.frag               # 두 sampler + u_mix + u_mode(0=mix/1=add/2=mul/3=screen)
   │     └─ particlePoint.frag       # 컴퓨트 점 렌더용 fragment
   │
   └─ utils/
      ├─ debounce.ts                 # (+ test)
      └─ id.ts
```

### 12.1 초안과 달라진 지점

- **`core/nodes/` 통합** — 처음에는 노드 종류별로 `meshNode.ts / imageNode.ts / shaderNode.ts / outputNode.ts` 를 따로 두려고 했으나, 포트 정의가 짧고 분기점이 한 곳이라 `registry.ts` 의 `NODE_META` 맵 + 인스턴스 의존 포트(`nodeInputPorts / nodeOutputPorts`)로 합쳤다. Param/Math/Swizzle/Combine 도 같은 레지스트리에서 분기. 유틸 노드의 평가 로직은 `utility.ts` 로 분리.
- **`ui/NodeEditor/edges/` 폐기** — 별도 `TypedEdge` 컴포넌트를 두지 않고 React Flow 기본 엣지 + `isValidConnection` 으로 타입 검증.
- **Viewport 분할 폐기** — `orbitBindings.ts`/`controls.tsx` 가 따로 없다. 입력 바인딩은 `core/camera/input.ts` 의 `createCameraController` 가 직접 캔버스에 부착, 카메라/시간/배경색 UI 는 `Panels/ViewportControls.tsx` 로 옮겨 Inspector 상단에 항상 노출된다.
- **SidePanel 단일화** — Inspector 단독 패널 대신 `SidePanel` 이 Inspector ↔ Assets ↔ Problems 3 탭 컨테이너 (Phase 9).
- **Bootstrap/Hotkey/CommandPalette** — Phase 9 이후 `BootstrapGate`, `KeyboardShortcuts`, `CommandPalette/` 가 App 셸에 상시 마운트.
- **상태 스토어 확장** — 초안의 4개(`graph/asset/selection/renderer`) 외에 Phase 9~12 의 기능을 받기 위해 10여 개 스토어가 추가.
- **`src/export/` 신설** — Phase 11 의 정적 HTML export 코드와 미니 런타임.
- **셰이더 추가** — 초안의 `unlit/uvDebug/blur` 외에 `noise/tonemap/blend.frag` 와 패스스루용 `color.frag`, 그리고 Phase 13 의 컴퓨트 dummy `tfNoop.frag` + 파티클 데모 vert/frag.
- **썸네일 readback 이원화** — `readback.ts`(동기 폴백) + `asyncReadback.ts`(PBO + fenceSync, Phase 12 기본 경로) 가 공존하고 `downsampleToThumb` / `THUMB_SIZE` 는 동기 모듈에서 공유.
- **Pass union (Phase 13)** — 초안의 `ShaderPass[]` 는 `(ShaderPass | ComputePass)[]` 로 일반화. ComputePass 는 FBO 없이 vbo 두 세트 + VAO 두 개 + TF object 두 개로 ping-pong 시뮬레이션을 수행하고, 출력은 ShaderPass.mesh 의 duel VAO 로 흘러간다. dispose 책임은 ShaderPass 가 자기 mesh 의 VAO 두 개를 정리하되 vbo 자체는 ComputePass 소유 — 일반 mesh 경로와 인터페이스는 동일하지만 vbo lifetime 만 외부 소유로 다르다.
- **External texture pool (Phase 14a)** — `core/external/registry.ts` 가 *ExecutionPlan 외부에* 사는 싱글톤이다. 다른 모든 리소스(FBO, mesh, TF object…) 가 plan.dispose 와 함께 사라지는 것과 의도적으로 다르며, 그 이유는 recompile 마다 getUserMedia 권한 재요청이 일어나는 것을 막기 위해서다. compile 은 webcam specs 만 추출해 `reconcileExternal` 에 넘기고, 핸들 lifecycle (acquire/restart/release) 은 registry 가 그래프 변화에 따라 자체 관리한다. plan 은 `hasExternal: boolean` flag 만 보유 — bindSamplers 가 매번 `getExternalTexture(nodeId)` 로 lookup 하고, RAF dirty 게이트가 idle 우회 신호로 사용한다.

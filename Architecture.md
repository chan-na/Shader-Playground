# ShaderPlayground 아키텍처

> 본 문서는 **현재 코드(Phase 34)** 의 실제 동작을 설명한다. 기술 스택을 *왜* 골랐는지·페이즈 진행 이력은 [SPEC.md](./SPEC.md) 를 참고하라.

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
| `group` (Phase 29) | — | — | 시각적 컨테이너. 포트 없음, `ExecutionPlan` 에 절대 들어가지 않음. `{label, color?, width, height, collapsed?}` 만 보유. 자식 관계는 `graphStore.parents` map 으로 보관. `collapsed`(Phase 30) ⇒ 헤더만 렌더 + 모든 후손 노드를 에디터에서 숨김 (`hasCollapsedAncestor`) |

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

0. **`reconcileExternal`** — 외부 소스 노드(webcam / video / audio) specs 를 모아 `core/external/registry.ts` 의 싱글톤 풀에 전달. 새 노드 ID 는 acquire 시작(webcam/audio-mic 는 비동기 getUserMedia, video/audio-file 은 resolver 로 Blob 해석), 사라진 노드 ID 는 release, restart 가 필요한 변경(webcam deviceId / video assetId / audio sourceKind·assetId)만 restart 하고 나머지(play/pause/loop/mute/seek/fftSize/smoothing)는 in-place 적용. **validate 보다 먼저** 호출되므로 cycle 같은 일시적 fatal 이 카메라/비디오/오디오를 죽이지 않는다. `hasExternal`(외부 소스 1 개 이상) 도 이 시점에 결정되어 fatal 분기에서도 보존. 이 풀은 **ExecutionPlan 밖에 사는 싱글톤**이다 — FBO·mesh·TF object 등 다른 리소스는 `plan.dispose` 와 함께 사라지지만, 외부 핸들까지 그러면 recompile 마다 getUserMedia 권한 재요청이 일어난다. 그래서 plan 은 `hasExternal` flag 만 보유하고, `bindSamplers` 가 매번 `getExternalTexture(nodeId)` 로 조회하며, RAF dirty 게이트가 이 flag 를 idle 우회 신호로 쓴다.
1. `validateGraph` — `cycle`/`multi_input`/`multiple_outputs` 중 하나라도 있으면 **patch 만 채운 emptyPlan** 으로 즉시 종료 (단 `hasExternal` 은 위에서 결정된 값을 그대로 캐리). `missing_node` 는 fatal 아님(엣지를 건너뛰고 계속).
2. `topologicalOrder` → shader/compute 노드만 filter (두 종류 모두 패스를 생성).
3. **ImageTexture 업로드**: 그래프의 모든 ImageNode 를 순회해 `assetStore` 에 비트맵이 있으면 `createImageTexture` 로 GPU 에 올린다. **키는 node.id** (assetId 가 아니다) — 그래야 다음 패스의 sampler 라우팅에서 `edge.source` 만으로 찾을 수 있다.
4. **위상 순서대로 Pass 생성** — 각 노드의 `kind` 에 따라 ShaderPass 또는 ComputePass 가 만들어져 `passes[]` 에 들어간다. union 단일 배열이며 위상 순서가 보존된다.
   - **ShaderPass (`kind: 'shader'`)**:
     - **메시 결정**: `(target=sn.id, handle='mesh')` 인 엣지가 있으면 메시 노드에서 가져오고 `meshIsFullscreen=false`. 없거나 메시 노드가 비어 있으면 `quad` 프리미티브 + `fullscreen.vert` 가 자동 주입되어 `meshIsFullscreen=true`.
     - **컴퓨트 mesh 입력 특수 경로**: 메시 엣지의 source 가 ComputeNode 인 경우, 컴파일 시점에 해당 ComputePass 의 두 vbo 세트(A/B) 각각에 대해 VAO 두 개를 만들어 `pass.meshComputeVaos = [vaoA, vaoB]` 로 보관. `pass.meshComputeNodeId` 로 연결된 ComputePass 를 식별. `pass.mesh.primitive` 는 ComputeNode 의 primitive 를, `vertexCount` 는 ComputeNode 의 `count` 를 그대로 가져온다. 이 두 VAO 는 ShaderPass 가 dispose 하지만 그 뒤의 vbo 는 **ComputePass 소유**다 — 일반 mesh 경로와 인터페이스는 같고 vbo lifetime 만 외부 소유로 다르다.
     - **프로그램 컴파일**: `createProgram(gl, vertexSource, fragmentSource)`. 실패하면 `shaderErrors[node.id]` 에 stage 정보와 함께 누적되고 해당 패스는 건너뛰어진다 — 그래프 나머지는 계속 컴파일됨.
     - **FBO** 할당 — 노드의 `resolutionScale`(Phase 17)를 canvas `width × height` 에 곱한 뒤 `scaledDimensions` 로 반올림·최소 1px 클램프한 per-pass 해상도(`pass.width × pass.height`)로 생성. `resolutionScale` 이 없으면 1× 라서 캔버스 해상도와 동일. plan 최상위 `width/height` 는 캔버스 원본 해상도를 유지한다.
     - **입력 라우팅**: `sn.id` 로 들어오는 모든 엣지를 순회.
       - `targetHandle === 'mesh'` 는 위에서 처리했으므로 스킵.
       - source 가 `param / math / swizzle / combine` → **`paramBinding`** (CPU 평가 경로).
       - 그 외 (`shader / image / mesh-by-accident`) → **`samplerBinding`** + 텍스처 유닛 증가.
   - **ComputePass (`kind: 'compute'`)**:
     - **TF 프로그램 컴파일**: vertex shader 만 진짜 로직이고 fragment 는 빌트인 `tfNoop.frag` (의미 없는 dummy 출력 — `RASTERIZER_DISCARD` 로 어차피 폐기). `createTransformFeedbackProgram`(`core/gl/program.ts`) 이 link 전에 `gl.transformFeedbackVaryings(prog, [outNames], INTERLEAVED 또는 SEPARATE)` 를 호출. 현재 구현은 attribute slot 별 분리된 vbo 를 쓰므로 `SEPARATE_ATTRIBS`.
     - **Ping-pong 버퍼**: attribute slot 마다 두 vbo (A/B) 를 만들고 seed 함수(`sphere`/`cube`/`random`/`zero`) 로 양쪽 모두 초기화. read 측이 다음 프레임 입력, write 측이 다음 프레임 출력. compile 시 `read = 'A'` 로 시작.
     - **VAO**: vbo 세트마다 VAO 1 개. `vaoA` 는 A 측 vbo 를 attribute pointer 로 묶고, `vaoB` 는 B 측. 매 dispatch 마다 read 에 맞는 VAO 가 bound 되고 다른 측이 TF 캡처 대상.
     - **TF object**: `tfA` 는 A 측 vbo 들을 `bindBufferBase` 로 묶고, `tfB` 는 B 측. dispatch 시 read 측의 TF 가 캡처 대상.
     - **입력 라우팅**: ShaderPass 와 동일하게 `paramBindings` 만 추출 (sampler 없음). uniform 값은 노드의 `uniformValues` 를 그대로 베이스로.
     - **dispose**: program / vbos×N×2 / VAOs / TF objects 모두 정리.
5. **Output 바인딩**: `kind === 'output'` 노드들을 *문서 순서대로* `outputs[]` 에 매핑(`(target=output.id, handle='texture')` 엣지의 source 를 `sourceNodeId` 로 기록; 없으면 null).
6. `dispose()` 는 모든 `program / fbo / mesh / imageTexture` 핸들 + 컴퓨트 패스의 vbo/TF/VAO 핸들의 deleter 를 한 번에 호출.

### 3.2 sampler vs param 라우팅 — 한 번 더

- **sampler 경로**: 실행 시 `bindSamplers` 가 `pass.samplers[]` 를 따라가며, `passByNode.get(source).fbo.color.texture` → `plan.imageTextures[source]` → `getExternalTexture(source)` (Phase 14a, webcam 같은 live source) 순으로 텍스처를 찾아 `gl.uniform1i` + `bindTexture`. 어디서도 못 찾으면 sampler 스킵(검은 frame fallback) — external 핸들이 acquire 중이라 아직 텍스처가 없는 경우가 정상 케이스. 메시 그래프의 텍스처 라우팅 = ShaderNode → ShaderNode 체이닝 = 자동 FBO ping-pong.
- **param 경로**: 실행 시 `bindUserUniforms` 가 `{...pass.seededDefaults, ...pass.uniformValues}` 를 베이스로 만들고, `paramBindings` 가 가리키는 노드를 `resolveValueFor(sourceId, graph, {time}, cache)` 로 재귀 평가해 그 위에 덮어쓴다. 우선순위는 **paramBindings > 저장된 `uniformValues` > GLSL `@default`(`seededDefaults`) > GL zero** 다(학습 가시성 라운드 C-2). `seededDefaults` 는 컴파일 시점에 `withExplicitDefaults(컴파일된 vertex + fragment 소스)` 로 채워지는 **별도 필드**이며 `uniformValues` 에 병합하지 않는다 — 병합하면 Viewport 가 매 RAF 수행하는 `pass.uniformValues = node.uniformValues` 핫패치가 첫 draw 전에 시드를 통째로 덮어써 사라진다(실제 회귀 사례라 `execute.test.ts` 에 가드가 있다). utility 노드들은 GL 패스를 만들지 않고 CPU 에서만 평가된다. ShaderPass 와 ComputePass 가 같은 캐시 + 같은 resolver 를 공유.

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
4. **dirty 게이트(B2)**: 다음 조건 중 하나라도 참이면 이 프레임을 *렌더링 프레임*으로 마크한다 — `timeStore.playing === true`, **`plan.hasExternal === true`** (Phase 14a; webcam 같은 라이브 소스가 있으면 시간 정지와 무관하게 무조건 dirty), **`gifRecorderStore.status === 'recording'`** (Phase 31; GIF 녹화 중에는 정적 그래프라도 일정 케이던스로 프레임을 계속 그려야 하므로 무조건 dirty), 또는 마지막 프레임 대비 `graphStore.rev` / `assetStore.rev` / `graphStore.uniformRev` / `cameraStore.rev` / `timeStore.rev` / `viewportStore.rev` / `mouseStore.rev` 중 하나라도 변화. 어떤 조건도 참이 아니면 **이번 프레임은 `executePlan` 을 스킵**하고, async readback 펜스만 펌프한 뒤 다음 RAF 만 등록한다. 정적 그래프 + 정지 시간 + 외부 소스 없음 = GPU 0 비용. 카메라/슬라이더/스크럽 등 모든 사용자 입력은 자기 스토어의 `rev` 를 올려 다음 프레임을 깨운다. **컴퓨트 패스의 영향(Phase 13)**: 컴퓨트 패스가 한 개 이상이면 `timeStore.playing === true` 일 때 무조건 dirty(애초에 위 첫 조건에 해당). 시간이 정지된 idle 상태에서는 컴퓨트 dispatch 도 건너뛰므로 시뮬레이션이 멈춘 채 GPU 0 비용을 유지한다 — 다음 dispatch 시 read 측의 직전 결과부터 다시 시작. **외부 입력의 영향(Phase 14a)**: webcam 노드가 있으면 `hasExternal` 이 시간 정지를 덮어쓰므로 일시정지 중에도 카메라 프레임이 흐른다 — 매 RAF tick 의 `updateExternalSources(gl)` 가 `texSubImage2D(HTMLVideoElement)` 로 신선한 frame 을 GL 텍스처에 업로드.
5. **유니폼 핫패치**: (렌더 프레임에서만) 현재 `graphStore.nodes` 의 `shader` 노드들의 `uniformValues` 를 `pass.uniformValues` 로 그대로 복사. 슬라이더 드래그가 매 프레임 즉시 반영되는 경로.
6. **시간 진행**: `timeStore.advance(dt/1000)` — `playing=false` 면 noop. dirty 게이트와 무관하게 매 틱 호출되므로 idle 중 wall-clock 만 지나가도 `simTime` 은 변하지 않는다.
7. **FPS 통계**: 500ms 누적분으로 `setStats({fps, frame, drawCalls})`. idle 프레임에서는 `drawCalls = 0` 으로 보고된다.
8. **실행**: `executePlan(gl, plan, FrameContext, canvasWidth, canvasHeight, gpuTimer)` + `rendererStore.bumpRenderTick()`. (`gpuTimer` 는 supported && enabled 일 때만 전달되는 `GpuTimerPool`, 아니면 `null` — §4.6.) `renderTick` 은 누적 카운터로, idle 게이트가 작동하는지를 E2E 가 확인하는 신호다.
9. **썸네일**: `asyncReadback.poll(gl)` → 완료된 슬롯들을 `scheduler.commit`, `scheduler.pickReady(now)` → 대상 노드에 대해 `asyncReadback.request`.

### 4.2 FrameContext

`{ time, width, height, camera, mouse?, frame?, background?, params?, graph? }`. `mouse` 는 `u_mouse`(vec4), `frame` 은 `u_frame` 값이다. `graph` 는 `paramBindings` 가 있을 때만 필요하지만 현재 Viewport 는 `graph` 와 함께 `mouse`/`frame` 도 항상 넘긴다.

### 4.3 executePlan (`src/core/graph/execute.ts`)

```
for each pass in plan.passes:           # 토포 순서가 보존되어 있음 (Shader | Compute union)
    if pass.kind == 'compute':
        useProgram(pass.program)
        bindUserUniforms     # seededDefaults(@default) < uniformValues(저장값) < paramBindings; system u_time / u_frame 자동
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
        bindSystemUniforms   # u_time, u_resolution, u_mouse, u_frame; matrix(u_view/u_proj/u_model/u_camera) 는 메시일 때만
        bindUserUniforms     # seededDefaults(@default) < uniformValues(저장값) < paramBindings
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

`src/core/thumbnail/readback.ts` 가 **동기 CPU 박스필터** `downsampleToThumb` 와 공유 상수 `THUMB_SIZE` 를 보관한다. `THUMB_SIZE` 는 `AsyncThumbnailReadback`·`NodeThumbnail` 이 공유하고, `downsampleToThumb` 는 PBO·GPU 가 없는 컨텍스트를 위한 CPU 박스필터로 export 되어 있으나 현재 프로덕션 호출자는 없고 단위 테스트(`asyncReadback.test.ts`)에서만 쓰인다 — Phase 22 이후 라이브 readback 경로(§6.2)는 GPU 다운샘플만 사용한다.

---

## 7. 상태 스토어 (Zustand)

`src/state/*` 의 16 개 스토어. 책임 분리가 분명하므로 다음 표가 가장 빠른 인덱스다.

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
| `mouseStore` | x/y + clickX/clickY + down | ✗ | ✗ | Phase 19. `u_mouse`(vec4: xy=현재 포인터, zw=마지막 클릭) 시스템 유니폼 소스. `rev` 카운터(B2) 가 일시정지 중 포인터 이동 시 idle 게이트를 깨움 |
| `rendererStore` | ready, fps/frame/drawCalls/errors | ✗ | ✗ | StatusBar 가 구독 |
| `historyStore` | past[]/future[], MAX=100 | ✗ | — | `suppressNext` 로 apply 중 재push 방지 |
| `recorderStore` | MediaRecorder 상태 | ✗ | ✗ | start/stop/elapsedMs |
| `gifRecorderStore` | GIF 캡처 상태 (status/frameCount/elapsedMs) | ✗ | ✗ | Phase 31. 프레임 버퍼는 스토어 밖 `_active` 싱글톤. Viewport RAF 가 `captureFrame`, stop 시 `core/gif/gifEncoderClient` 의 워커로 인코드(Phase 32; 워커 미가용 시 인라인 폴백) |
| `gpuTimerStore` | byNode EMA + totalMs + supported/enabled | ✗ | ✗ | Phase 15. Viewport 가 매 frame `setSample`, 노드 사라지면 `removeNode` |
| `toastStore` | toast[] (id/kind/message/durationMs) | ✗ | ✗ | 사일런트 에러·알림 표면화. `push`/`dismiss`/`clear`, kind별 기본 duration 후 자동 소멸. `toast.info/success/warning/error` 래퍼 제공, Toasts UI 가 구독 |
| `debugUiStore` | 진단 패널 open + level/category 필터 | ✗ | ✗ | 개발자 진단 패널(DiagnosticsPanel) 전용 UI 상태. `utils/log` 의 타입만 import 하는 leaf 스토어라 순환 위험 없음 |

추가로 작업/디스패치 모듈(스토어 아님): `assetActions`(파일 import + IndexedDB 캐시), `autoSave`(30s 디바운스 스케줄러), `shareUrl`(`#share=` 인코딩), `serialization`(프로젝트 JSON v1).

### 7.1 rev 두 개 — 왜?

`graphStore` 는 의도적으로 두 카운터를 갖는다.

- **`rev`** — 노드/엣지/소스 등 **구조** 변경. 변하면 Viewport 가 `recompile()` 한다 (GL 프로그램 재링크 + FBO 재할당). `pushHistory` 가 같은 path 에서 일어나므로 Undo 단위와 일치한다.
- **`uniformRev`** — 슬라이더 드래그(`setUniformValue`) 와 param 값 변경(`setParamValue`). 컴파일은 안 하고 다음 RAF 에서 `pass.uniformValues` 만 새로 복사. **history 에는 안 들어감** — Undo 가 60Hz 드래그 이벤트로 가득 차는 것을 막는다.

`setParamLabel`/`setMathConfig`/`setSwizzleMask`/`setCombineConfig`/`setComputeConfig`/`updateComputeSource` 는 **포트 표면 또는 GPU 자원을 바꾸므로** `rev` 를 올리고 history 도 푸시한다 (recompile 으로 ping-pong 버퍼/TF object/VAO 가 새로 만들어짐).

추가로 B2 가 도입한 `cameraStore.rev` / `timeStore.rev` / `viewportStore.rev` / `mouseStore.rev` 는 같은 패턴이다 — 자기 스토어가 사용자 입력으로 변경됐다는 신호만 RAF 의 dirty 게이트에 전달한다. `timeStore.advance()` 만은 매 프레임 호출되는 hot path 라 rev 를 올리지 않는다.

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

### 8.4 ~ 8.7 GLSL 편집기 인텔리전스 → [docs/architecture/glsl-editor.md](./docs/architecture/glsl-editor.md)

CodeMirror 위의 에디터 보조 기능은 분량이 커서 하위 문서로 분리했다. 절 번호는 그대로 유지된다.

- **§8.4 라이브 GLSL 검증 (Phase 24)** — OffscreenCanvas WebGL2 워커로 키스트로크마다 컴파일 로그 수집, 권위 ∪ 라이브 진단 머지, 노드/스테이지 전환 시 `view.setState` 문서 교체 계약.
- **§8.5 LSP-like 편집기 기능 (Phase 25)** — `core/glsl/symbolTable.ts` 심볼 테이블, `core/glsl/builtins.ts` 빌트인 카탈로그, 자동완성 · hover.
- **§8.6 시맨틱 토큰 하이라이트 (Phase 26)** — 식별자 역할 분류(`core/glsl/semanticTokens.ts`) + `core/glsl/stripComments.ts` 주석 마스킹 계약.
- **§8.7 Goto / References / Rename (Phase 27)** · **§8.7.1 Cross-stage rename (Phase 28)** — `core/glsl/references.ts`, `ui/CodeEditor/rename.ts`, `ui/CodeEditor/editorNode.ts`.

### 8.8 디버깅 · 진단 인프라 (Phase 16)

`toastStore`(사용자 알림) · `diagnosticsStore`(GLSL 진단) 와 역할이 분리된, 평소 비가시 / 필요 시 열람하는 개발자 채널.

- **중앙 로거 (`src/utils/log.ts`)** — 레벨(`debug`/`info`/`warn`/`error`) · 카테고리(`gl`/`render`/`graph`/`assets`/`external`/`autosave`/`app`)별 로깅 + 500 엔트리 인메모리 링버퍼(초과 시 오래된 것부터 evict) + 구독/내보내기 API(`subscribeLog` / `exportLogText` / `clearLogBuffer`). 콘솔 미러링은 DEV 한정 + `minLevel` 게이트, 버퍼는 레벨과 무관하게 항상 기록. 어떤 store 도 import 하지 않는 leaf util (단방향).
- **전역 안전망** — `main.tsx` 의 `window.onerror` / `unhandledrejection` 핸들러 → `log.error("app", …)`. `ErrorBoundary`(메인 작업 영역만 감쌈)가 렌더 중 uncaught 를 잡아 폴백 UI(새로고침 / 진단 복사) 를 띄운다.
- **GL 에러 표면화 (`src/core/gl/glError.ts`)** — DEV 한정 `checkGlError(gl, context)`. `gl.getError()` 로 첫 플래그를 읽고 남은 플래그를 최대 16 회까지 drain(stale 오류가 다음 probe 로 새지 않게). program 링크 · FBO 셋업은 무조건 호출, 드로우 루프는 호출부의 프레임 카운터로 스로틀(동기 플러시 비용 회피). context lost/restored 도 로깅.
- **진단 패널** — StatusBar `🛈 Diagnostics` 토글이 `debugUiStore.open` 을 켠다. `DiagnosticsPanel` 은 `subscribeLog` 로 실시간 갱신되는 로그 리스트(레벨/카테고리 필터 + Clear), `Copy` 는 `buildDiagnosticsReport(...)`(로그 + GL renderer/version + 렌더 통계 + userAgent/화면/DPR + 그래프 노드·엣지 수)를 클립보드로 복사(미지원 환경은 안전 폴백). GL 어댑터 identity 는 컨텍스트 생성 시 `rendererStore.glInfo` 에 1회 캡처.

---

## 9. 직렬화와 영속화

```
                       ┌────────────────────────────┐
                       │  graphStore + positions    │
                       └─────────────┬──────────────┘
                                     │
                       serializeProject({format, version=1, exportedAt, graph, positions, parents})
                                     │
              ┌──────────────────────┼────────────────────────────┐
              ▼                      ▼                            ▼
        JSON.stringify         IndexedDB (autosave)         gzip + base64url
        (export 버튼)         shader-playground-session         (#share=...)
                              /session/autosave
```

### 9.1 프로젝트 포맷 (`src/state/serialization.ts`)

`{ format: 'shader-playground', version: 1, exportedAt: ISO, graph, positions, parents? }`. `parents` 는 Phase 29 그룹 중첩(child→parent) 맵이며 pre-Phase-29 페이로드에는 없어 optional — 없으면 '중첩 없음' 으로 로드해 옛 share URL 도 그대로 열린다.

- 직렬화 시 노드는 `kind` 별로 손수 클론(`cloneGraphNode`, `src/core/nodes/registry.ts`) — 알 수 없는 키가 같이 흘러들지 않게. 역직렬화 시에는 신뢰할 수 없는 페이로드를 `src/state/projectSanitize.ts` 의 `sanitizeGraphNode`/`sanitizeGraphEdge` 로 정규화한다.
- 역직렬화는 `projectSanitize.ts` 의 하드 캡을 적용한다: `MAX_NODES 2048` / `MAX_EDGES 8192` 초과 시 throw, 노드/엣지별로 NaN·범위 초과·미지 enum 을 안전값으로 클램프하거나 드롭(warnings 로 보고), shader 소스 64 KiB 상한. `parents` 는 미지 id·자기순환·깊이 64(`MAX_DEPTH`) 초과 체인을 잘라낸다 — 손수 만든 악성 share URL 방어.
- 검증은 import 시 `validateGraph` 를 돌려 `missing_node`/`multiple_outputs` 만 warnings 로 노출. `cycle` 은 fatal 처럼 보이지만 deserialize 자체는 통과하고 컴파일 시 그쪽에서 막힌다.
- `version` 이 미래 값이면 `warnings` 로 알리고 로드는 시도.

### 9.2 Auto-save (`src/state/autoSave.ts`)

- 키: `IDBDatabase('shader-playground-session') / store('session') / key 'autosave'`.
- 스케줄러는 `graphStore.subscribe` 로 모든 변경을 받아 30 초 debounce, `rev === lastSavedRev` 이면 패스. **bootstrap 직후 rev 와 lastSavedRev 가 같으므로 데모 그래프 자체는 자동저장에 쓰이지 않는다** — 첫 클린 부팅에서 복구 다이얼로그가 뜨지 않는 이유.
- `BootstrapGate` 의 `startAutoSave()` 는 idempotent. 같은 모듈 안에서 모든 인스턴스가 싱글톤 `_activeHandle` 을 공유.
- `flush()` 는 강제 저장 훅. `startAutoSave()` 가 `attachUnloadFlush` 로 `beforeunload`/`pagehide` 에 flush 를 붙여 탭 종료·새로고침·iOS Safari 이탈 직전 best-effort 저장하고, `stopAutoSave()` 가 리스너를 해제한다 (30 초 debounce 최악 지연을 unload tick 이 커밋할 수 있게 함).

### 9.3 Share URL (`src/state/shareUrl.ts`)

`#share=<payload>` 만 본다.

```
serializeProject → JSON.stringify → TextEncoder → CompressionStream('gzip') → base64url
```

복호도 정확히 역순. `CompressionStream` 미지원 브라우저는 passthrough(압축 안 함) — 동작은 하되 URL 이 길어짐. payload 정규식은 `[#&]share=([A-Za-z0-9_-]+)`. 또한 hash payload 가 64 KiB(`MAX_SHARE_HASH_PAYLOAD_BYTES`)를 넘거나 gzip 해제 후 JSON 이 1 MiB(`MAX_SHARE_JSON_BYTES`)를 넘으면 `decodeShareHash` 가 null 을 반환한다 — 과대·악성 공유 링크 방어.

### 9.4 BootstrapGate 우선순위

`src/ui/BootstrapGate.tsx`:

1. 그래프에 이미 노드가 있으면 (HMR/테스트) → autosave 시작하고 종료.
2. URL 해시에 `share=` 가 있으면 → decode → setGraph → `clearSession()` (공유 URL 이 복구를 무력화) → autosave.
3. autosave 로드 → 노드 0개가 아니면 `<dialog>` 표시. 사용자가:
   - "복구" → deserialize → setGraph → history.clear → autosave
   - "새로 시작" → `clearSession()` → 데모 → autosave
4. autosave 도 없으면 → 데모 그래프 (`createDemoGraph` + `DEMO_LAYOUT`) → autosave 시작.

### 9.5 에셋 캐시 (`src/core/assets/cache.ts`)

별도 IndexedDB (`shader-playground` DB v3, `meshes`/`images`/`videos`/`audios` 스토어 — 비디오·오디오도 원본 Blob 으로 캐시/hydrate). MeshAttribute 들은 `ArrayBuffer.slice` 로 재현 가능한 형태로 저장(`view.byteOffset` 보정). 이미지는 원본 `Blob` 으로 저장하고 hydrate 시 `createImageBitmap(blob, {premultiplyAlpha:'none'})` 로 비트맵 복원. 프로젝트 JSON 에는 assetId 만 들어가므로 그래프와 에셋이 분리되어 share URL 도 가벼움.

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

### 11.1 애니메이션 GIF 녹화 (Phase 31)

WebM 과 별개로, 의존성 0 자체 인코더로 캔버스를 애니메이션 GIF 로 내보낸다. WebM 이 브라우저 코덱(`MediaRecorder`)에 위임하는 것과 달리 GIF 는 프레임 캡처·색 양자화·LZW 압축을 전부 직접 수행한다 — `standalonePlayer.js` 가 export 런타임을 의존성 0 으로 재구현하는 것과 같은 원칙.

```
core/gif/               # 순수 TS · DOM/GL 비의존
   quantize.ts  buildPalette(frames, maxColors)  — rgb555 히스토그램 + median-cut 전역 팔레트
                mapToPalette(rgba, palette)       — rgb555 캐시 nearest 매핑
                mapToPaletteDithered(rgba,palette,w,h) — Floyd–Steinberg 오차확산 디더링 매핑 (Phase 33)
   lzw.ts       lzwEncode(indices, minCodeSize)  — GIF 가변폭 LZW (폭 증가 2^w+1, 4096 리셋)
   encode.ts    encodeGif(opts, mapper?, onProgress?) — GIF89a 조립 (전역/로컬 팔레트 + NETSCAPE 루프, mapper 주입 · 프레임별 진행 콜백)
   gifEncoderClient.ts encode(job) — 워커 클라이언트 (lazy · Promise · 실패 시 인라인 폴백, Phase 32)
   gifEncoder.worker.ts encodeGif 를 워커에서 실행 (?worker · reqId RPC, Phase 32)

state/gifRecorder.ts    # 캡처 오케스트레이션 (recorder.ts 와 형제)
   start() → captureFrame(canvas) ×N → stop() → image/gif Blob
```

- **프레임 캡처는 Viewport RAF 안에서**: 컨텍스트가 `preserveDrawingBuffer: false` 라 drawing buffer 는 tick 종료 후 무효화된다. 따라서 `gifRecorder.captureFrame(canvas)` 는 `executePlan` *직후 같은 tick* 에서 호출되어 스크래치 2D 캔버스로 `drawImage`(다운스케일, longest edge ≤ `maxLongEdge`) → `getImageData` 로 RGBA 를 떠 모은다. 목표 fps 스로틀 + `maxSeconds` 프레임 캡으로 메모리를 제한.
- **dirty 게이트(B2)**: recording 중이면 `gifRecording` 이 `hasExternal` 과 동급의 무조건 dirty 신호가 되어, 시간 정지·정적 그래프에서도 프레임이 일정 cadence 로 렌더·캡처된다.
- **인코딩은 stop 시 한 번**: 캡처 타임스탬프 차이로 프레임별 delay(centiseconds, 2cs 하한)를 산출하고, `stop()` 은 `status` 를 `"encoding"` 으로 바꾼 뒤 모듈 싱글톤 `gifEncoder().encode()`(Phase 32 워커 클라이언트, 인라인 폴백)로 합성 → Blob → `URL.createObjectURL` → Toolbar 가 `.gif` 자동 다운로드. 무거운 프레임 버퍼는 zustand 밖 모듈 싱글톤(`_active`)에 두고 스토어에는 status/frameCount/elapsedMs/encodeProgress 만.
- **팔레트/디더링 기본값 (Phase 33)**: 초기(Phase 31)에는 모든 프레임이 한 256색 전역 팔레트(local color table 없음)를 공유했으나, 지금은 `gifRecorder` 기본값이 per-frame 로컬 팔레트(`localPalette:true`) + Floyd–Steinberg 디더링(`dither:true`)이다(§11.3). 색이 시간에 따라 변하는 클립의 충실도를 높인다. `localPalette:false` 로 단일 전역 팔레트 모드도 여전히 선택 가능.

### 11.2 인코딩 Web Worker 오프로드 (Phase 32)

`core/gif/gifEncoder.worker.ts` + `core/gif/gifEncoderClient.ts`:

- **워커 위임**: `gifRecorder.stop()` 은 이제 `encodeGif` 를 직접 부르지 않고 모듈 싱글톤 `gifEncoder()`(`GifEncoderClient`)의 `encode(job)` 로 위임한다. LZW·양자화 패스가 워커에서 돌아 멀티초 녹화가 에디터를 얼리지 않는다.
- **무상태 RPC**: 워커는 data-in / bytes-out 무상태 함수를 `reqId` RPC(`glslValidator.worker.ts` 와 동형)로 감싼 것뿐. 인코딩된 바이트 버퍼는 transfer(zero-copy)로 돌려받는다. **입력 프레임은 transfer 하지 않는다** — 워커가 도중에 죽어도 클라이언트가 원본을 그대로 들고 인라인 폴백을 돌릴 수 있게 하기 위함.
- **절대 잃지 않는 폴백**: 워커 생성 실패·postMessage 실패·`error` 이벤트 등 모든 실패 경로는 메인 스레드 **인라인 인코드로 폴백**한다(사용자가 명시적으로 녹화한 GIF 는 유실 금지 — validator 가 실패 시 `[]` 를 반환하는 것과 대비되는 강한 실패 모델). 인라인 경로는 기본 mapper(디더링 없음)만 실어 `mapToPaletteDithered` 를 초기 번들 밖 워커 청크에 격리한다. jsdom 등 `Worker` 미정의 환경에서는 바로 인라인 경로로 간다.

### 11.3 per-frame 로컬 팔레트 + 디더링 (Phase 33)

- **로컬 팔레트**: `encodeGif({localPalette:true})` 는 전역 색표 대신 프레임마다 자체 ≤256색 로컬 색표를 싣고 전역 색표를 생략한다. 색이 시간에 따라 변하는 클립의 충실도를 높인다. `gifRecorder` 기본값이 `localPalette: true` 로 바뀌어 §11.1 의 "단일 전역 팔레트" 는 더 이상 기본이 아니다.
- **Floyd–Steinberg 디더링**: `quantize.ts` 의 `mapToPaletteDithered(rgba, palette, w, h)` 가 각 픽셀의 양자화 오차를 아직 방문하지 않은 이웃(우 7/16, 하좌 3/16, 하 5/16, 하우 1/16)으로 확산해 하드 밴딩을 미세 노이즈로 바꾼다 — 셰이더 그라디언트에서 큰 품질 이득. 오차 누적으로 같은 색이 다르게 매핑되므로 per-cell 캐시 없이 픽셀마다 nearest 탐색을 돈다.
- **mapper 주입**: `encodeGif` 의 두 번째 인자로 per-pixel 매핑 함수를 주입한다. 워커는 `dither` 플래그에 따라 `mapToPaletteDithered` 를, 인라인 폴백은 기본 nearest(`mapToPalette`)를 넘긴다 — 무거운 디더링 패스를 워커 청크에만 묶어두기 위함. `gifRecorder` 기본값 `dither: true`.

### 11.4 인코딩 진행률 (Phase 34)

- **진행 콜백**: `encodeGif` 는 선택적 `onProgress(done, total)` 콜백을 받아 프레임 하나를 조립할 때마다 호출한다. 워커는 이를 `{type:'progress', reqId, done, total}` 메시지로 메인 스레드에 중계하며, 최종 응답 전까지 job 을 pending 으로 유지한다.
- **encodeProgress 상태**: `gifRecorder.stop()` 은 `status` 를 `"encoding"` 으로 바꾸고 진행 콜백에서 `encodeProgress`(0..1)를 갱신한다. 인코딩이 끝나면 `idle` 로 복귀하며 진행률을 리셋한다. StatusBar/Toolbar 가 이 값을 표시한다.

---

## 12. 디렉토리 트리 (Phase 34 기준)

> `.test.ts` 파일은 같은 디렉토리에 동거하며, 단위 테스트가 존재하는 모듈은 끝에 `(+ test)` 로 표기.

```
ShaderPlayground/
├─ index.html
├─ vite.config.ts
├─ vitest.config.ts
├─ tsconfig.json
├─ biome.json                        # Biome 린트/포맷 설정
├─ knip.json                         # Knip 데드코드 설정
├─ playwright.config.ts              # Playwright E2E 러너 (SwiftShader chromium)
├─ package.json
├─ SPEC.md
├─ Architecture.md
├─ README.md
├─ CLAUDE.md                         # Claude 작업 규약 / 품질 게이트
├─ tests/e2e/                        # Playwright E2E 스펙 (40 파일 / 156 테스트 — Phase 1~39, 도킹은 phase-35-*)
│  └─ helpers/                      # fixtures·sp(window.__sp)·dom·editor·render·canvas 공용 헬퍼
└─ src/
   ├─ main.tsx                       # React 엔트리, App 마운트
   ├─ App.tsx                        # 셸 (NodeEditor / Viewport / CodeEditor / SidePanel / StatusBar + overlay)
   ├─ index.css
   ├─ test-setup.ts                  # Vitest + jsdom 부트스트랩
   ├─ vite-env.d.ts
   │
   ├─ build/                         # ── 빌드 전용 (Vite 플러그인) ─────
   │  └─ cspMetaPlugin.ts            # 프로덕션 HTML 에만 CSP meta 주입 (dev/E2E 제외) (+ test)
   │
   ├─ core/                          # ── React 비의존 ──────────────────
   │  ├─ gl/
   │  │  ├─ context.ts               # WebGL2 컨텍스트 생성/검증 (+ test)
   │  │  ├─ program.ts               # 컴파일/링크 + InfoLog 노출 (+ test)
   │  │  ├─ texture.ts               # 텍스처 생성/포맷 (+ test)
   │  │  ├─ framebuffer.ts           # FBO + 컬러/깊이 어태치먼트 (+ test)
   │  │  ├─ mesh.ts                  # VBO/VAO 업로드/draw (+ test)
   │  │  ├─ uniforms.ts              # 유니폼 setter 디스패처 (+ test)
   │  │  ├─ gpuTimer.ts              # Phase 15 — EXT_disjoint_timer_query_webgl2 풀 (+ test)
   │  │  ├─ glError.ts               # DEV 전용 gl.getError() 표면화 (셋업 무조건 / 드로우 스로틀) (+ test)
   │  │  └─ fakeGl.ts                # 테스트 전용 가짜 WebGL2 컨텍스트 (GL 모듈 단위 테스트용)
   │  │
   │  ├─ camera/
   │  │  ├─ orbitCamera.ts           # OrbitCameraState + view/proj/orbit/pan/zoom (+ test)
   │  │  └─ input.ts                 # createCameraController — pointer/wheel 부착 (+ test)
   │  │
   │  ├─ graph/
   │  │  ├─ types.ts                 # GraphNode/Edge/Port + Param·Math·Swizzle·Combine·Compute·Group
   │  │  ├─ compile.ts               # graph → ExecutionPlan (ShaderPass | ComputePass) (+ test)
   │  │  ├─ execute.ts               # executePlan + splitLayout + TF dispatch
   │  │  ├─ validate.ts              # cycle / multi_input / multiple_outputs (+ test)
   │  │  ├─ diagnostics.ts           # GLSL 로그 파서 (+ test)
   │  │  ├─ uniformParser.ts         # uniform + 주석 힌트 (+ test)
   │  │  ├─ uniformCache.ts          # 패스별 유니폼 값 변경 감지 (엄격 비교 — 재업로드 스킵) (+ test)
   │  │  ├─ computeSeed.ts           # sphere/cube/random/zero seed 생성기 (+ test)
   │  │  ├─ parents.ts               # Phase 29/30 — parent map + abs/relative 좌표 + cycle 가드 + hasCollapsedAncestor (+ test)
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
   │  ├─ gif/                        # Phase 31~34 — 의존성 0 애니메이션 GIF 인코더 (worker 오프로드 · per-frame 팔레트 · 진행률)
   │  │  ├─ quantize.ts              # median-cut 팔레트 + nearest / Floyd–Steinberg 디더 매핑 (+ test)
   │  │  ├─ lzw.ts                   # GIF 가변폭 LZW 압축 (+ test)
   │  │  ├─ encode.ts                # GIF89a 조립 (palette + NETSCAPE loop + frames + onProgress) (+ test)
   │  │  ├─ gifEncoderClient.ts      # Phase 32 — 워커 클라이언트 (lazy · Promise · 실패 시 인라인 폴백) (+ test)
   │  │  └─ gifEncoder.worker.ts     # Phase 32 — encodeGif 를 워커에서 실행 (?worker · reqId RPC)
   │  │
   │  ├─ glsl/                       # Phase 24/25/26/27/28 — 라이브 GLSL 검증 + LSP-like 정적 분석
   │  │  ├─ glslValidator.ts         # main-thread 클라이언트 (lazy worker · Promise API · 실패 시 [] resolve) (+ test)
   │  │  ├─ glslValidator.worker.ts  # OffscreenCanvas WebGL2 컴파일 워커 (?worker)
   │  │  ├─ symbolTable.ts           # Phase 25 — uniform/in/out/const/local/parameter/function/struct 파서 + 소스별 LRU 캐시 (+ test)
   │  │  ├─ glslDecl.ts              # 선언자 분할 · struct 멤버 이름 오프셋 · precededByDot · 파라미터 리스트 파서 (+ test)
   │  │  ├─ symbolScope.ts           # symbolsVisibleAt / resolveSymbol — 라인별 scope 쿼리 (+ test)
   │  │  ├─ ident.ts                 # GLSL 식별자 정규식 단일 정의 (IDENT_RE · IDENT_EXACT_RE · identScanner)
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
   │     ├─ gltfLoader.ts            # @loaders.gl/gltf 래퍼 (지오메트리만) (+ test)
   │     ├─ imageLoader.ts           # createImageBitmap 래퍼 (+ test)
   │     ├─ videoLoader.ts           # Phase 14b — mp4/webm 메타 프로빙 + Blob (+ test)
   │     ├─ audioLoader.ts           # Phase 14c — decodeAudioData 메타 프로빙 + Blob (+ test)
   │     ├─ cache.ts                 # IndexedDB 에셋 캐시 (mesh ArrayBuffer / image·video·audio Blob) (+ test)
   │     └─ types.ts                 # GeometryHandle, ImageHandle, VideoAssetHandle, AudioAssetHandle
   │
   ├─ state/                         # ── Zustand 스토어 ────────────────
   │  ├─ types.ts                    # 공유 상태 타입 (NodePosition 등)
   │  ├─ graphStore.ts               # nodes/edges/positions + rev/uniformRev (+ test)
   │  ├─ assetStore.ts               # 메시/이미지 카탈로그 (런타임 핸들) (+ test)
   │  ├─ assetActions.ts             # import + IndexedDB hydrate (+ test)
   │  ├─ selectionStore.ts           # selectedNodeIds[] + primary selectedNodeId (+ test)
   │  ├─ rendererStore.ts            # fps/frame/drawCalls/errors (+ test)
   │  ├─ cameraStore.ts              # OrbitCameraState 보관 + reset (+ test)
   │  ├─ viewportStore.ts            # background rgb (+ test)
   │  ├─ mouseStore.ts               # u_mouse 포인터 위치 (framebuffer px · bottom-left · xy 현재 / zw 마지막 down) (+ test)
   │  ├─ timeStore.ts                # simTime/playing/speed/advance (+ test)
   │  ├─ diagnosticsStore.ts         # byNode[id]={vertex/fragment/link} (+ test)
   │  ├─ editorStore.ts              # activeStage + jumpRequest(rev) (+ test)
   │  ├─ historyStore.ts             # Undo/Redo 100건 + suppressNext (+ test)
   │  ├─ demoGraph.ts                # 부트스트랩/프리셋 그래프 시드 (+ test)
   │  ├─ serialization.ts            # 프로젝트 JSON v1 (+ test)
   │  ├─ projectSanitize.ts          # 비신뢰 프로젝트(share/import/autosave) 하드 캡 검증 (+ test)
   │  ├─ shareUrl.ts                 # gzip + base64url + URL hash (+ test)
   │  ├─ autoSave.ts                 # 30s debounce IndexedDB 자동저장 (+ test)
   │  ├─ recorder.ts                 # MediaRecorder → WebM/mp4 (+ test)
   │  ├─ gifRecorder.ts              # Phase 31~34 — 캔버스 프레임 캡처 → core/gif 인코드 → GIF Blob (+ encodeProgress) (+ test)
   │  ├─ thumbnailScheduler.ts       # core/thumbnail/scheduler 싱글톤 (+ test)
   │  ├─ gpuTimerStore.ts            # Phase 15 — byNode EMA ms + totalMs + supported/enabled (+ test)
   │  ├─ toastStore.ts               # 사용자 토스트 큐 (info/success/warning/error) (+ test)
   │  └─ debugUiStore.ts             # 진단 패널 open + level/category 필터 (leaf store — log 타입만 의존) (+ test)
   │
   ├─ ui/                            # ── React 컴포넌트 ────────────────
   │  ├─ BootstrapGate.tsx           # share / autosave 복구 / 데모 분기 + 다이얼로그
   │  ├─ KeyboardShortcuts.tsx       # 전역 단축키 — Cmd+Z/Y(undo/redo), Cmd+D(복제), Cmd+A(전체 선택), 화살표(선택 일괄 이동, Phase 23), Space(play/pause — 텍스트 입력 + 활성화 가능 컨트롤(button/a[href]/summary/role=button·menuitem·tab) 포커스 시 제외), Cmd+K
   │  ├─ ErrorBoundary.tsx           # 최상위 에러 경계 → RecoveryDialog + 로그 export (+ test)
   │  ├─ RecoveryDialog.tsx          # 크래시 복구 다이얼로그 (ESC 격리 · 로그 복사) (+ test)
   │  ├─ Toasts.tsx                  # toastStore 구독 → ToastRow 리스트
   │  ├─ ToastRow.tsx                # 단일 토스트 행 (kind 아이콘 + dismiss) (+ test)
   │  │
   │  ├─ NodeEditor/
   │  │  ├─ index.tsx                # React Flow 캔버스 + graphStore 양방향
   │  │  ├─ Toolbar.tsx              # 노드 팔레트 / 저장 / Share / Record / Export HTML
   │  │  ├─ NodeThumbnail.tsx        # 카드 <canvas> + IntersectionObserver
   │  │  ├─ nodeUiRegistry.ts        # GraphNodeKind → NodeView 컴포넌트 매핑 (+ test)
   │  │  ├─ HelpModal.tsx            # 단축키/도움말 모달 (+ test)
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
   │  │     ├─ GroupNodeView.tsx     # Phase 29/30 — 그룹 카드 + NodeResizer + collapse 토글 + 라벨 인라인 편집
   │  │     ├─ GpuTimerChip.tsx      # Phase 15 — 카드 우상단 ms 칩
   │  │     ├─ PortHandle.tsx        # 포트 핸들 (React Flow Handle 래퍼)
   │  │     ├─ ValueInput.tsx        # 숫자 입력 위젯 (라이브 커밋) (+ test)
   │  │     └─ paramNodeViewHelpers.ts # 파람 값 → 카드 표시 문자열 (Time scale/offset) (+ test)
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
   │  │  ├─ editorNode.ts            # 편집 대상 노드 선택 규칙 (index.tsx ↔ rename.ts 공용 leaf, #10) (+ test)
   │  │  └─ lintAdapter.ts
   │  │
   │  ├─ Viewport/
   │  │  └─ index.tsx                # <canvas> + RAF + asyncReadback 펌프 + cameraCtl
   │  │
   │  ├─ CommandPalette/
   │  │  ├─ index.tsx                # Cmd+K — 노드/프리셋/Math/Swizzle/Combine 추가
   │  │  └─ helpers.ts               # fuzzyMatch 등 검색 스코어링 (+ test)
   │  │
   │  └─ Panels/
   │     ├─ SidePanel.tsx            # Inspector ↔ Assets ↔ Problems 탭 컨테이너
   │     ├─ Inspector.tsx            # 디스패처 (Shader/Param/Utility/Mesh/Webcam/Video/Audio)
   │     ├─ UniformControl.tsx       # slider / multi / color
   │     ├─ UniformHintEditor.tsx    # Phase 21 — ⚙ 주석 힌트 GUI (range/step/default/label)
   │     ├─ uniformFilter.ts         # 유니폼 검색 쿼리 정규화/필터 (+ test)
   │     ├─ ParamInspector.tsx
   │     ├─ UtilityInspector.tsx
   │     ├─ WebcamInspector.tsx      # Phase 14a — device dropdown + live status
   │     ├─ VideoInspector.tsx       # Phase 14b — 에셋 선택 / play·loop·mute / seek
   │     ├─ AudioInspector.tsx       # Phase 14c — mic↔file / fftSize / smoothing / play·loop
   │     ├─ GroupInspector.tsx       # Phase 29 — label/color 편집 + ungroup / delete-with-children
   │     ├─ ViewportControls.tsx     # 카메라 Reset/FOV + 배경색 + 시간 (+ test)
   │     ├─ ProblemsPanel.tsx        # 진단 → select + setStage + requestJump
   │     ├─ DiagnosticsPanel.tsx     # 개발자 진단 패널 — 로그/GL 정보 + 버그리포트 스냅샷 (+ test)
   │     ├─ diagnosticsReport.ts     # 버그리포트 스냅샷 순수 조립기 (주입식 · store 무의존) (+ test)
   │     ├─ AssetBrowser.tsx
   │     └─ StatusBar.tsx            # (+ test)
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
   │     ├─ mask.frag                # base/overlay/mask 3-sampler 마스킹 합성
   │     ├─ composite3.frag          # 3-sampler 가중 합성 (u_a/u_b/u_c + u_wa/u_wb/u_wc)
   │     └─ particlePoint.frag       # 컴퓨트 점 렌더용 fragment
   │
   └─ utils/
      ├─ debounce.ts                 # (+ test)
      ├─ id.ts                       # (+ test)
      ├─ log.ts                      # 개발자용 런타임 로거 (store 무의존 · 단방향) (+ test)
      └─ assertNever.ts              # discriminated union exhaustiveness 가드
```

### 12.1 초안과 달라진 지점

초기 SPEC 초안의 디렉토리 설계와 실제 구현이 어떻게 달라졌는지(노드 모듈 통합, edges 패키지 폐기, Viewport 분할 폐기, SidePanel 단일화, export 신설 등)는 역사 자료라 [docs/archive/architecture-history.md](./docs/archive/architecture-history.md) 로 옮겼다. 현재 구조는 위 트리와 §1~§11 이 정본이다.

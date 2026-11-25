# 스펙 — 렌더링 파이프라인

> Core 렌더러·FBO 체인·시스템 유니폼·컴퓨트(Transform Feedback)·패스 해상도·N:1 합성·썸네일 다운샘플 관련 Phase 본문.
> 인덱스(Phase 번호 → 현재 동작 · E2E 스펙 · 파일)는 [SPEC.md](../../SPEC.md)에 있다. 아래 본문은 Phase 작성 당시 기록을 그대로 옮긴 것이며, 이후 Phase가 덮어쓴 내용은 인덱스의 "현재 동작" 열이 우선한다.

### Phase 0 — 현행 (완료)
- Vite + TS + WebGL2 풀스크린 쿼드 동작.

### Phase 2 — Core 렌더러 + 카메라 (FBO 체인)
- `core/gl/*` 모듈화: program/texture/framebuffer/mesh.
- `core/camera/orbitCamera.ts` + 마우스/휠 입력 바인딩.
- 단일 쉐이더 패스 → 다중 패스(FBO ping-pong) 동작.
- 시스템 유니폼(`u_time`/`u_resolution`/`u_view`/`u_proj`/`u_model`) 자동 바인딩.
- 하드코딩된 그래프(MeshNode → ShaderNode → OutputNode)로 Core만 단독 검증. **Output 노드도 데이터 모델 단계부터 명시**.
- Output 노드가 없는 그래프는 placeholder 처리 분기를 검증.
- **검증**: UI 없이 코드로 정의한 그래프가 화면에 렌더되고, 마우스로 카메라가 움직인다. Output을 떼면 placeholder가 나온다.

### Phase 4 — 단일 쉐이더 노드 + 유니폼 자동 노출
- ShaderNode 1개 + (Mesh | Image) 입력 + Output. 그래프는 아직 하드코딩.
- `uniformParser`로 GLSL `uniform` 선언을 파싱해 인스펙터에 자동 컨트롤 생성.
- 타입별 컨트롤: `float` 슬라이더, `vec2/3/4` 다축 슬라이더, `*Color`/`u_color*` 컬러 피커.
- 시스템 유니폼은 자동 숨김.
- **검증**: 사용자가 `uniform float u_intensity;`를 추가하면 즉시 인스펙터에 슬라이더가 나타나고 드래그가 화면에 반영된다.

### Phase 6 — 다중 쉐이더 체이닝
- ShaderNode → ShaderNode 연결 → FBO 텍스처 자동 라우팅.
- GraphCompiler에 토폴로지 정렬 + FBO 풀 할당 로직.
- 입력이 없는 ShaderNode는 풀스크린 쿼드 폴백.
- **검증**: 쉐이더 3개 체이닝(예: 노이즈 → 블러 → 톤매핑) + Output 노드. 각 중간 노드의 카드 썸네일에서 단계별 결과가 동시에 보인다.

### Phase 13 — Transform Feedback 컴퓨트 노드 (완료)
- **새 노드 종류 `compute`**: WebGL2 `transformFeedbackVaryings` 로 vertex stream 을 캡처해 GPU 측 파티클/시뮬레이션을 지원. 노드 한 개당 vertex shader 한 개, 출력 attribute 페어 목록(`{ inName, outName, size, seed }`), 카운트, 출력 primitive(POINTS/LINES/TRIANGLES) 를 보유. fragment stage 는 `RASTERIZER_DISCARD` 로 비활성화되어 raster 비용 0.
- **Ping-pong 더블 버퍼**: 한 attribute slot 당 vbo 두 개(A/B) + VAO 두 개 + TF object 두 개. 매 frame dispatch 마다 read 측을 스왑해 다음 프레임 입력이 이번 프레임 출력. seed 함수는 빌트인(`sphere` / `cube` / `random` / `zero`) 으로 attribute 마다 지정. recompile 시 seed 로 재초기화.
- **포트 표면**: ShaderNode 와 동일하게 vertex source 의 비-샘플러 uniform 선언이 입력 포트로 자동 노출(Param/Math/Swizzle/Combine 연결 가능). sampler/mesh 입력은 금지(컴퓨트는 첫 단계 시뮬레이터로 한정). 출력은 `mesh: mesh` 단일 — 다운스트림 ShaderNode 가 mesh 입력으로 받아 자기 vertex/fragment shader 로 점/선/삼각형을 렌더.
- **ExecutionPlan 통합**: 기존 `passes: ShaderPass[]` 를 `passes: (ShaderPass | ComputePass)[]` union 으로 확장하고 위상 순서를 그대로 보존. 컴퓨트 → 셰이더 → (다음 프레임) 컴퓨트 의존성도 같은 배열에서 자연 처리.
- **ShaderPass.mesh 듀얼 VAO**: ShaderNode 가 mesh 입력으로 ComputeNode 를 받으면 ShaderPass 가 두 VAO 를 들고 매 프레임 ComputePass.read 에 맞춰 활성 VAO 를 전환. 일반 mesh 입력 (primitive/asset) 은 기존 path 그대로.
- **dirty 게이트 영향**: 컴퓨트 패스가 한 개 이상이면 `timeStore.playing === true` 일 때 무조건 dirty(RAF idle 게이트 B2 가 정지된 정적 그래프로 분류하지 않음). 시간이 정지되면 dispatch 가 건너뛰어져 시뮬레이션도 멈추고 idle 가능.
- **유틸리티 노드 연동**: ComputeNode 의 uniform 입력에 Param/Math/Swizzle/Combine 을 그대로 연결 가능. fan-out 캐시도 ShaderNode 와 공유.
- **CommandPalette**: `Add Compute: Particle (POINTS)` 프리셋 + `Add Compute (empty)` 1 종 등록.
- **데모 프리셋**: `createParticleDemoGraph()` — sphere seed 의 1024 POINTS 가 sin 기반 noise field 로 흐르는 파티클 시뮬. Phase 13 의 E2E 가 이 프리셋을 골든 시나리오로 사용.
- **검증**: Vitest 단위 테스트 — types/registry/validate/serialization/compile 의 compute 경로 신규. Playwright E2E Phase 13 — (a) CommandPalette 로 Particle 프리셋 로드, (b) ComputeNode → ShaderNode → Output 체인 컴파일·렌더 확인, (c) 노드 삭제 시 dispose 안정, (d) Share URL 라운드트립으로 compute 노드 복원, (e) 시간 정지 후 idle 게이트 동작.

### Phase 17 — Pass별 해상도 스케일 (완료)
다운샘플 기반 효과(블룸·가우시안 피라미드 등)를 위해 단일 `plan.width × plan.height` FBO 가정을 깨고 패스별 렌더 타깃 해상도를 도입.
- **모델**: `ShaderGraphNode.resolutionScale?: 0.25 | 0.5 | 1`(`RESOLUTION_SCALES`). 생략 시 1 로 간주 — 기존 저장본/공유 URL 무손상. 구조 변경이므로 setter(`graphStore.setResolutionScale`)는 `rev` 증가 + history push → recompile.
- **컴파일**: `compile.ts` 의 `scaledDimensions(w, h, scale)` 헬퍼가 `round(canvas × scale)` 로 패스별 FBO 크기를 결정(1px 하한). `ShaderPass` 에 `width/height` 저장. sampler 라우팅은 정규화 UV 라 해상도가 달라도 그대로 동작.
- **실행**: `execute.ts` 가 패스별 `gl.viewport` 와 `u_resolution` 을 `pass.width/height` 로 바인딩(이전엔 전역 `plan.width/height`). 카메라 proj aspect 도 패스 치수 기준(균일 스케일이라 비율 불변).
- **UI**: Inspector 에 셰이더 노드 전용 `Render resolution` 드롭다운(`data-testid="resolution-scale"`).
- **정적 export**: `standalonePlayer.js` 는 이미 `pass.fbo.w/h` 단위로 viewport·u_resolution 을 처리하므로 `createFBO` 에 스케일만 반영. `projectSanitize`·`cloneGraphNode` 가 필드 검증/보존.
- **검증**: Vitest — `scaledDimensions`(compile.test) 라운딩/클램프, `graphStore.setResolutionScale`(rev·비셰이더 무시), `projectSanitize`(유효/무효 스케일). Playwright E2E `phase-17-resolution-scale.spec.ts` — 0.25× 다운샘플 체인이 회귀 없이 렌더 + Inspector 드롭다운 반영.

### Phase 18 — N:1 합성 일반화 (완료)
한 셰이더가 여러 텍스처를 입력으로 받는 일반 N:1 합성(fan-in)을 정식 기능으로 노출. 검증 결과 **연결·컴파일 파이프라인은 이미 완전히 일반화**되어 있었다 — 코드 완화가 아니라 노출·테스트·문서화 작업.
- **연결 규칙(기존)**: `validate.ts` 의 `multi_input` 은 `(target, targetHandle)` 단위라 *동일 핸들* 2입력만 금지하고, 서로 다른 핸들로 들어오는 N:1 은 이미 허용. `NodeEditor.onConnect` 도 같은 핸들이 점유된 경우에만 거부(`e.target === conn.target && e.targetHandle === conn.targetHandle`). ShaderNode 는 sampler uniform 마다 별도 입력 핸들을 노출하므로(registry `NODE_META.shader.inputs`) 다중 sampler 셰이더가 곧 N-입력 합성 노드.
- **컴파일(기존)**: `compile.ts` 가 타깃의 모든 입력 엣지를 순회하며 texture 엣지마다 `SamplerBinding{ uniformName, sourceNodeId, unit: unit++ }` 을 생성 → 임의 fan-in 이 unit 0..N-1 로 라우팅. 토포 정렬(`topologicalOrder`)은 모든 source 가 sink 보다 앞서도록 보장.
- **노출(신규)**: 빌트인 템플릿 `Composite 3`(`composite3.frag` — u_a/u_b/u_c + 가중치)·`Mask`(`mask.frag` — u_base/u_overlay/u_mask)를 CommandPalette 에 추가.
- **검증**: Vitest `validate.test` — 서로 다른 핸들 N:1 이 `multi_input` 미발생 + fan-in 토포 정렬(3 source → 1 sink, 모두 sink 앞). Playwright E2E `phase-18-fanin-composite.spec.ts` — R/G/B 3 source 를 u_a/u_b/u_c 로 합성 → 세 채널 모두 출력(핸들별 라우팅 판별).

### Phase 19 — `u_mouse` / `u_frame` 시스템 유니폼 (완료)
Shadertoy 호환 절차적 셰이더 이식성을 위해 포인터 좌표·프레임 카운터를 시스템 유니폼으로 자동 주입.
- **모델**: `u_mouse`(vec4) / `u_frame`(float) 을 `SYSTEM_UNIFORMS` 에 추가 — Inspector 자동 숨김 + 입력 포트 미노출(`inspectorUniforms`). `u_mouse` 는 Shadertoy iMouse 관례: `xy` = 현재 포인터 위치, `zw` = 마지막 클릭 위치. 픽셀 단위·좌하단 원점이라 `gl_FragCoord`/`u_resolution` 과 동일 좌표계.
- **포인터 store**: 신규 `state/mouseStore.ts`(x/y/clickX/clickY/down/rev). Viewport 의 canvas pointer 리스너(`pointermove`/`down`/`up`/`cancel`)가 `getBoundingClientRect` 기준으로 클라이언트 좌표를 프레임버퍼 픽셀(+y flip)로 변환해 store 갱신. 카메라 컨트롤러 리스너와 공존. `setPosition`/`setDown`/`setUp` 이 `rev` 를 올려 일시정지 상태의 idle RAF 를 깨운다(dirty 게이트에 `mouseChanged` 추가).
- **u_frame**: Viewport 의 `renderFrame` 로컬 카운터를 `executePlan` 호출마다 +1 해 `FrameContext.frame` 으로 주입. `bindSystemUniforms`(셰이더) + `bindComputeSystemUniforms`(compute) 양쪽 바인딩. `u_mouse` 는 `FrameContext.mouse` 로 셰이더 패스에 vec4 바인딩.
- **정적 export**: `standalonePlayer.js` 도 canvas pointer 리스너 + 프레임 카운터로 `u_mouse`/`u_frame` 동형 바인딩.
- **검증**: Vitest — `uniformParser.test`(u_mouse/u_frame system 인식 + Inspector 숨김), `mouseStore.test`(setPosition/Down/Up/reset 의 rev 증가 + vec4 패킹). Playwright E2E `phase-19-mouse-frame.spec.ts` — 풀스크린 셰이더가 화면을 `u_mouse.xy / u_resolution` 평면색으로 칠하고, 포인터를 좌하단→우상단으로 이동하면 R/G 채널이 함께 상승(포인터→u_mouse 경로 end-to-end 판별).

### Phase 22 — 썸네일 GPU 다운샘플 (완료)
노드 카드 라이브 미리보기의 readback 비용 절감. 다운샘플을 CPU 박스필터에서 GPU 1패스로 이전해 PBO 전송량을 원본 해상도와 무관하게 `96×96×4` 로 고정.
- **다운샘플**: `AsyncThumbnailReadback.request` 가 PBO readback 전에 GPU 로 축소한다. 노드당 96×96 thumb FBO(`createFramebuffer(gl, 96, 96, false)`)에 패스의 color 텍스처를 풀스크린 쿼드 1패스로 그려 넣고(`downsampleInto`), 그 작은 FBO 만 `readPixels(0,0,96,96)` 로 PBO 에 담는다. 프래그먼트가 `texture(u_src, vec2(uv.x, 1.0 - uv.y))` 로 Y-flip 하므로 readback 버퍼가 곧 top-down → `poll` 은 `new ImageData(buf, 96, 96)` 로 바로 감싼다(기존 `downsampleToThumb` CPU 박스필터 미사용).
- **리소스**: blit program + 쿼드 VAO/VBO 는 인스턴스 lazy 싱글톤(`buildBlit`), PBO·thumb FBO 는 slot 단위. `release` 는 PBO+thumb FBO 동시 해제, `disposeAll` 은 blit 리소스까지 정리. `request` 는 그릴 때 `FRAMEBUFFER_BINDING`/`VIEWPORT` 를 저장·복원해 호출자 상태를 보존한다.
- **검증**: Vitest `asyncReadback.test` — 원본 1024×768 이어도 `readPixels` 가 96×96(GPU 축소 증명), blit 프로그램 컴파일 실패 시 `request` 가 false, 다중 노드 독립 in-flight·release 정리. Playwright E2E 전 Phase 회귀 없이 통과(썸네일 시각 결과 동일). 동기 CPU 폴백 `downsampleToThumb` 는 자체 단위 테스트와 함께 readback.ts 에 보존(Architecture §6.4).

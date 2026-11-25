# Architecture 이력 (역사 자료)

> **이 문서는 역사 기록이다 — 현재 코드의 동작을 설명하지 않는다.** [Architecture.md](../../Architecture.md) 에서 *대체된 설계·초안 대비 변경 경위* 만 원문 그대로 옮겨 왔다. 현재 구조와 동작은 Architecture.md 와 [docs/architecture/](../architecture/) 가 정본이며, 여기의 서술이 그것과 다르면 정본이 옳다. 아래 각 절의 제목은 원래 위치를 가리킨다.

---

## Architecture.md §12.1 에서 이관

#### 12.1 초안과 달라진 지점

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

## Architecture.md §8.7.1 (편집 대상 노드의 단일 규칙) 에서 이관

현재 규칙(`ui/CodeEditor/editorNode.ts` 의 `pickEditorNodeId`)이 도입되기 전의 결함 기록:

> 예전에 rename 이 `selectionStore.selectedNodeId` 만 보던 시절엔 선택이 빈 상태의 F2 가 cross-stage 를 못 타고 절반만 rename 했다.

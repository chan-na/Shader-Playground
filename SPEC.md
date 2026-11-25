# ShaderPlayground 스펙

WebGL2 기반 쉐이더 작성/체이닝 플레이그라운드. 노드 그래프로 메시·텍스처·라이브 입력(웹캠/비디오/오디오)·쉐이더·컴퓨트를 연결하고, 인라인 CodeMirror 에디터에서 GLSL을 작성·디버깅한다. 그래프는 자동저장·Share URL·정적 HTML로 영속화/공유하고, 캔버스를 WebM/GIF로 녹화한다. 데스크톱 전용이며, 학습 도구로서 "실제로 무엇이 실행되는가"를 숨기지 않는 것을 지향한다.

이 문서는 **인덱스**다. Phase별 본문(작성 당시 기록)은 `docs/spec/<영역>.md`에 있고, 코드·테스트는 Phase **번호**로 이를 참조한다(`grep -rn "### Phase 18" docs/spec`). 현 구현의 코드 경로·동작은 [Architecture.md](./Architecture.md), 기술 스택·버전은 [README.md](./README.md#기술-스택)가 정본이다.

---

## 2. 아키텍처 요약

상세(레이어, 컴파일·렌더 루프, 카메라, 썸네일, 스토어, 에러, 직렬화, export, 녹화)는 [Architecture.md](./Architecture.md) §1~§11. SPEC 차원 핵심만:

- 노드 13 종 — `Mesh / Image / Webcam / Video / Audio / Shader / Compute / Output / Param / Math / Swizzle / Combine / Group`. Group 은 포트 없는 편집기 컨테이너라 `ExecutionPlan` 에 없다. Webcam/Video/Audio 는 plan 밖 싱글톤 풀(`core/external/registry.ts`)이 관리하는 라이브 텍스처. 포트 타입은 `mesh / texture / float / vec2 / vec3 / vec4` 6 종.
- Shader = vertex + fragment 한 쌍, 입력 포트는 GLSL `uniform` 선언에서 매번 재파싱. 메시 입력이 없으면 `fullscreen.vert` 로 대체 컴파일되고 UI 가 이를 표시(Phase 36).
- Compute = vertex GLSL + Transform Feedback 출력(`RASTERIZER_DISCARD`, ping-pong vbo). `mesh` 출력 하나를 다운스트림 Shader 가 그린다.
- Param·Math/Swizzle/Combine 은 GL 패스 없이 비-샘플러 uniform 입력을 CPU 에서 매 프레임 평가해 덮어쓴다(fan-out 시 프레임당 1 회 메모이즈).

## 3. 디렉토리 구조

전체 트리와 모듈별 책임은 [Architecture.md §12](./Architecture.md#12-디렉토리-트리-phase-34-기준) 참조(초안 대비 달라진 점은 §12.1).

---

## 4. Phase 인덱스

각 Phase 는 머지 가능한 단위이며 끝에서 앱이 항상 실행 가능해야 한다. **신규 Phase 는 40 부터** — 맞는 `docs/spec/` 영역 파일에 `### Phase N — 제목` 본문을 추가하고 이 표에 한 줄을 더한다.

"현재 동작"은 이후 Phase 가 덮어쓴 결과까지 반영한 요약이다(본문과 다르면 이 열과 코드가 우선). E2E 는 `tests/e2e/` 기준, `—` 는 Vitest 단위 테스트만 존재. 영역 파일은 모두 `docs/spec/` 아래: `rendering` · `editor-glsl` · `graph-nodes` · `inputs-assets` · `persist-export-record` · `diagnostics-learnability` · `layout`.

| Phase | 제목 | 현재 동작 (한 줄) | E2E 스펙 | 영역 |
|---|---|---|---|---|
| 0 | 초기 스캐폴드 | Vite + TS + WebGL2 풀스크린 쿼드 | — | rendering |
| 1 | UI/상태 인프라 | React 18 셸 + Zustand 스토어, RAF 루프는 React 밖에서 구동 | `phase-1-2-boot-render.spec.ts` | layout |
| 2 | Core 렌더러 + 카메라 | `core/gl/*` 래퍼, FBO 체인, OrbitCamera, 시스템 유니폼 자동 바인딩, Output 없으면 placeholder | `phase-1-2-boot-render.spec.ts` | rendering |
| 3 | 코드 에디터 + 라이브 컴파일 | CodeMirror 6, vertex/fragment 탭, 50ms 디바운스 재링크, InfoLog → 인라인 진단 | `phase-3-4-editor-uniform.spec.ts` | editor-glsl |
| 4 | 유니폼 자동 노출 | `uniform` 선언 파싱 → Inspector 컨트롤 자동 생성, 시스템 유니폼 숨김 | `phase-3-4-editor-uniform.spec.ts` | rendering |
| 5 | 노드 그래프 GUI + 썸네일 | React Flow 편집, 타입 검증·사이클 차단, 셀렉션 ↔ 에디터/Inspector 연동, 라이브 썸네일 | `phase-5-6-graph-chain.spec.ts` | graph-nodes |
| 6 | 다중 쉐이더 체이닝 | 위상 정렬 + FBO 텍스처 자동 라우팅, 입력 없는 Shader 는 풀스크린 쿼드 | `phase-5-6-graph-chain.spec.ts` | rendering |
| 7 | 외부 에셋 로더 | 프리미티브 5종, OBJ/GLTF(지오메트리만), PNG/JPG/WebP, 드래그&드롭 | `phase-7-8-assets-serialization.spec.ts` | inputs-assets |
| 8 | 직렬화 | 프로젝트 JSON export/import, 에셋 IndexedDB 캐시, 프리셋, 스크린샷 | `phase-7-8-assets-serialization.spec.ts` | persist-export-record |
| 9 | 에디터 경험 강화 | 주석 힌트(`@range` 등), 시간 컨트롤, Problems 패널, Undo/Redo, Command Palette(Cmd+K) | `phase-9-editor-ux.spec.ts` | editor-glsl |
| 10 | 표현력 확장 | Param 노드, uniform 입력 포트, 포트 타입 6종, Output 1~4개 분할 뷰포트, Blend 템플릿 | `phase-10-params-multioutput.spec.ts` | graph-nodes |
| 11 | 공유/배포 | `#share=` URL, WebM 녹화, 의존성 0 정적 HTML export(에셋 blob 미임베드) | `phase-11-share-export.spec.ts` | persist-export-record |
| 12 | 회복성·표현력 보강 | Problems → 라인 점프, 자동저장 + 복구 다이얼로그, `@color/@slider/@multi`, Math/Swizzle/Combine, PBO 썸네일 | `phase-12-resilience.spec.ts` | graph-nodes |
| 13 | Transform Feedback 컴퓨트 | Compute 노드(ping-pong TF), `mesh` 출력, Particle 프리셋 | `phase-13-compute.spec.ts` | rendering |
| 14a | Webcam | `getUserMedia` 라이브 텍스처, 외부 소스 레지스트리 | `phase-14-webcam.spec.ts` | inputs-assets |
| 14b | Video | 비디오 에셋 → 텍스처, 재생/루프/뮤트/seek | `phase-14b-video.spec.ts` | inputs-assets |
| 14c | Audio | 마이크/파일 → FFT 텍스처 | `phase-14c-audio.spec.ts` | inputs-assets |
| 15 | GPU Timer Overlay | 패스별 GPU 시간(`EXT_disjoint_timer_query_webgl2`), 미지원 시 no-op | `phase-15-gpu-timer.spec.ts` | diagnostics-learnability |
| 16 | 디버깅·진단 인프라 | 중앙 로거 + 링버퍼, 전역 안전망, ErrorBoundary, 진단 패널/복사 | `phase-16-diagnostics.spec.ts` | diagnostics-learnability |
| 17 | Pass별 해상도 스케일 | Shader 노드별 FBO 배율 0.25/0.5/1 | `phase-17-resolution-scale.spec.ts` | rendering |
| 18 | N:1 합성 일반화 | 서로 다른 핸들로의 fan-in 합성 정식화, Composite 3/Mask 템플릿 | `phase-18-fanin-composite.spec.ts` | rendering |
| 19 | `u_mouse` / `u_frame` | Shadertoy 관례 마우스·프레임 시스템 유니폼 | `phase-19-mouse-frame.spec.ts` | rendering |
| 20 | 노드 복제 | Cmd/Ctrl+D, 엣지는 복제하지 않음 | `phase-20-node-duplicate.spec.ts` | graph-nodes |
| 21 | 주석 힌트 GUI 생성 | Inspector 에서 힌트 편집 → GLSL 주석에 정규형으로 기록 | `phase-21-hint-editor.spec.ts` | editor-glsl |
| 22 | 썸네일 GPU 다운샘플 | readback 전 96×96 FBO 로 GPU 축소 | — | rendering |
| 23 | 다중 선택 편집 | 화살표 이동, Cmd/Ctrl+A, 다중 선택 배너(편집은 primary 에만) | `phase-23-multi-select.spec.ts` | graph-nodes |
| 24 | 라이브 GLSL 검증 | OffscreenCanvas 워커에서 타이핑 중 컴파일 진단 | `phase-24-live-validation.spec.ts` | editor-glsl |
| 25 | GLSL LSP: 심볼 + Hover | 심볼 테이블, 빌트인 카탈로그, Hover, 자동완성 | `phase-25-glsl-lsp.spec.ts` | editor-glsl |
| 26 | 시맨틱 토큰 | 식별자 11 종 분류 하이라이트 | `phase-26-semantic-tokens.spec.ts` | editor-glsl |
| 27 | Goto / References / Rename | F12·Cmd+Click 정의 이동, 참조, 스코프 인지 이름 변경 | `phase-27-glsl-refs-rename.spec.ts` | editor-glsl |
| 28 | Cross-stage rename | 인터페이스 심볼을 vertex/fragment 양쪽에서 함께 변경 | `phase-28-cross-stage-rename.spec.ts` | editor-glsl |
| 29 | 노드 그룹 | Group 노드, 부모 상대 좌표, 중첩, 그룹화/해제 | `phase-29-node-groups.spec.ts` | graph-nodes |
| 30 | 그룹 접기/펼치기 | `collapsed` 필드, 자식 숨김, undo 가능 | `phase-30-group-collapse.spec.ts` | graph-nodes |
| 31 | GIF 녹화 | 자체 GIF89a 인코더(LZW·양자화) | `phase-31-gif-recording.spec.ts` | persist-export-record |
| 32 | GIF 워커 오프로드 | 인코딩을 Web Worker 로, 실패 시 메인 스레드 폴백 | — | persist-export-record |
| 33 | GIF 로컬 팔레트 + 디더링 | 프레임별 팔레트, Floyd–Steinberg | `phase-33-gif-quality.spec.ts` | persist-export-record |
| 34 | GIF 진행률 | 워커 progress 메시지 → 툴바 진행률 | `phase-34-gif-progress.spec.ts` | persist-export-record |
| 35 | 도킹 레이아웃 | 트리 도크(split/leaf), 탭 드래그 도킹, 접기/최대화, 영속화, 컴팩트 폭 폴백, Code 자동 열기 | `m1-dock-header-collapse.spec.ts`, `m2-dock-drag.spec.ts`, `m3-dock-b6.spec.ts`, `m4-dock-dragdrop.spec.ts`, `m5-dock-chrome.spec.ts`, `m6-dock-fallback.spec.ts`, `m7-code-auto-open.spec.ts` | layout |
| 36 | 파이프라인 가시성 I | 풀스크린 대체 표시, Pass Inspector, 시스템 유니폼 섹션, Mesh attribute 계약 | `phase-36-pipeline-visibility.spec.ts` | diagnostics-learnability |
| 37 | 조용한 실패 진단 승격 | 미연결 sampler/미사용 유니폼 경고, 연결된 슬라이더 표시, attribute 소비 체크 | `phase-37-silent-failures.spec.ts`, `phase-37-driven-uniforms.spec.ts` | diagnostics-learnability |
| 38 | 멘탈 모델 교정 | GLSL `@default` 초기값, 렌더 상태·텍스처 파라미터 표시, 좌표계 카드, 레슨형 데모 | `phase-38-defaults-and-lessons.spec.ts`, `phase-38-render-state.spec.ts`, `phase-38-texture-params.spec.ts`, `phase-38-coordinate-card.spec.ts` | diagnostics-learnability |
| 39 | varying 계약 시각화 | Inspector Varyings 섹션, Problems 사전 링크 경고(불확실하면 판정 보류) | `phase-39-varying-contract.spec.ts` | diagnostics-learnability |

### 백로그
- 쉐이더 핫리로드 디스크 백업(File System Access API).
- **GLSL LSP — 추가 확장**: Phase 24~28 이 진단·심볼 테이블·Hover·시맨틱 토큰·Goto/References/Rename·Cross-stage rename 까지 다룸. 함수 오버로드 해석, call hierarchy, for-init block-scope 정확도, 그래프 연결을 따라가는 multi-program rename 이 잠재 후속. CodeMirror 6 유지(Monaco 전환은 계속 회피).
- 정적 HTML export 의 에셋 임베드 한계(Phase 11 본문 참조).
- Shader 노드를 vertex/fragment 두 노드로 분리(A-3) — 별도 결정 대기.

---

## 5. 결정 사항 · 불변식

코드로 확인한 현재 규칙이다. 바꾸려면 이 표와 해당 Phase 본문, 관련 테스트를 함께 갱신한다.

### 5.1 제품·UX 결정

| 항목 | 결정 |
|---|---|
| UI 프레임워크 | React 18. 렌더 루프는 React 밖 RAF 로 독립 구동 — React 는 UI 레이어 한정 |
| 노드 그래프 | React Flow (`@xyflow/react`) — React 위젯 임베드·핸들 연결 검증 API. Litegraph/Rete 는 기각 |
| 코드 에디터 | CodeMirror 6 — 모듈식·경량, `@codemirror/lint` 인라인 진단. Monaco 는 번들 무게로 회피 |
| 메시 로더 | loaders.gl (OBJ + GLTF **지오메트리만**, 머티리얼/애니메이션/스킨 무시). three.js 미사용 — raw WebGL2 직접 사용이 학습 목적 |
| WebGL 래퍼 | 자체 얇은 래퍼(`core/gl/*`)만 사용, 외부 WebGL 헬퍼 라이브러리 없음 |
| 상태 관리 | Zustand (selector 부분 구독). 스토어 간 상호 import 금지 — 단방향 구독 |
| 쉐이더 노드 | 한 노드에서 vertex/fragment 를 탭으로 편집 |
| 유니폼 노출 | GLSL 자동 파싱 → **우측 Inspector** 컨트롤(노드 카드 안에는 컨트롤 없음). 비-샘플러 uniform 은 카드에 입력 포트로도 노출되며, 연결되면 Param/유틸 값이 Inspector 값을 덮어쓴다 |
| 컨트롤 메타 | 명시적 주석 힌트(`@range/@default/@color`…)가 이름 패턴 추론보다 항상 우선 |
| 초기 uniform 값 | 소스 근거 없는 하드코딩 금지 — GLSL `@default` 가 초기값의 근거(Phase 38) |
| 카메라 | OrbitCamera (좌클릭 회전 / 우클릭 팬 / 휠 줌). Reset·FOV 는 뷰포트 하단 TransportBar |
| 플랫폼 | 데스크톱 전용. 좁은 창(≤990px)은 고정 스택 레이아웃으로 폴백(Phase 35) |
| Output 노드 | 명시적 배치, **그래프당 0~4 개**(`MAX_OUTPUTS`, 분할 뷰포트 1/2/3/4). 0 개면 placeholder, 5 개 이상은 검증에서 거부되고 추가 UI 도 막힌다 |
| 노드 카드 썸네일 | ShaderNode 는 자기 FBO 라이브 썸네일(추가 렌더 패스 없이 readback), ImageNode 는 에셋 미리보기 |
| 진단 정직성 | 확신할 수 없는 정적 판정은 경고도 ✓ 도 띄우지 않고 "판정 보류"로 침묵(Phase 39) |

### 5.2 그래프 · 런타임 불변식

| 항목 | 규칙 | 근거 |
|---|---|---|
| 포트 연결 | 동일 타입끼리만. 1:N 분기 허용, **서로 다른 핸들로의 N:1 fan-in 합성 허용**(Phase 18). 금지는 *같은* `(target, targetHandle)` 에 두 소스 — 검증의 `multi_input`, UI 의 `onConnect` 거부 | `core/graph/validate.ts` |
| 사이클 | 금지 — `cycle` 검증 에러, 컴파일 중단 | `core/graph/validate.ts` |
| 치명적 검증 에러 | `cycle` / `multi_input` / `multiple_outputs` 는 빈 plan 으로 컴파일 중단. `missing_node`(끊긴 엣지)는 보고만 하고 컴파일 계속 | `isFatalValidation` |
| 컴파일 트리거 | 에디터 입력 50ms 디바운스 후 자동 재컴파일 | `ui/CodeEditor` |
| 직렬화 | JSON export/import, `#share=` URL, IndexedDB 자동저장. 에셋 blob 은 IndexedDB 캐시. 선택 필드 생략 = 기본값이라 구버전 저장본 무손상 | Phase 8 / 11 / 12 |
| 노드 종류 | 13 종(§2). Param 은 Phase 10, Math·Swizzle·Combine 은 Phase 12, Compute 는 Phase 13, Webcam/Video/Audio 는 Phase 14a/b/c, Group 은 Phase 29 | `core/graph/types.ts` |
| 의존성 무게 | 경량 우선 — three.js·Monaco 는 의도적으로 회피. 번들 예산은 `scripts/check-bundle-size.mjs` 가 강제 | |

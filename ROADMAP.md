# ShaderPlayground 개선 로드맵

> Phase 16 이후의 제안 항목. 각 항목은 **독립적으로 머지 가능한 단위**로 설계되어 있으며, 시작 시 [SPEC.md](./SPEC.md) §4 의 정식 Phase 로 승격한다. 우선순위·동기·접근법·영향 모듈·게이트 영향을 함께 적어 다른 세션에서 콜드 스타트로 집어 들 수 있게 한다.
>
> 구조/동작 용어는 [Architecture.md](./Architecture.md) 기준. 모든 항목은 `npm run check` + `npm run test:e2e` 통과가 완료 조건이며, UI/렌더 변경 시 관련 E2E Phase 스펙을 갱신(사용자 합의 후)한다.

---

## 추천 진행 순서

표현력을 직접 키우고 기존 컴파일/실행 구조에 자연스럽게 얹히는 **1 → 2** 가 최우선. 그다음 워크플로/디버깅(4·5·3) → 성능(7) → 비용 높은 디스크 연동(6) 순.

> ✅ **1번(Pass별 해상도 스케일)은 완료** — SPEC.md Phase 17 로 승격. 다음은 **2번(N:1 합성 일반화)**.

| # | 항목 | 분류 | 난이도 | 추천도 |
|---|---|---|---|---|
| ~~1~~ | ~~Pass별 해상도 스케일~~ (완료 → Phase 17) | 표현력 | 중 | ★★★ |
| 2 | N:1 합성 일반화 | 표현력 | 중 | ★★★ |
| 3 | `u_mouse` / `u_frame` 시스템 유니폼 | 표현력 | 하 | ★★ |
| 4 | 노드 그래프 키보드 접근성 & 복제 | 워크플로 | 하 | ★★ |
| 5 | Inspector 주석 힌트 GUI 생성 | 워크플로 | 중 | ★★ |
| 6 | 셰이더 핫리로드 디스크 백업 | 워크플로 | 상 | ★ |
| 7 | 썸네일 GPU 다운샘플 | 성능 | 중 | ★★ |

---

## 1. Pass별 해상도 스케일 — ✅ 완료 (SPEC.md Phase 17)

`ShaderGraphNode.resolutionScale?: 0.25 | 0.5 | 1` 도입. `compile.ts` 의 `scaledDimensions()` 가 패스별 FBO 크기 결정, `execute.ts` 가 패스별 viewport·u_resolution 바인딩, Inspector 드롭다운(`data-testid="resolution-scale"`), standalonePlayer `createFBO` 반영. 검증: `scaledDimensions`/`setResolutionScale`/`projectSanitize` 단위 테스트 + `phase-17-resolution-scale.spec.ts`. 자세한 내용은 SPEC.md Phase 17.

---

## 2. N:1 합성 일반화

**동기.** 지금은 N:1 합성이 Blend 노드(2 sampler)로만 가능하다(Architecture §2.3, `multi_input` 금지). 그런데 ShaderNode 는 이미 GLSL 의 sampler uniform 마다 **서로 다른 핸들**을 입력 포트로 노출한다 — 즉 한 셰이더가 3개 텍스처를 받을 수 있는데, 현재 규칙은 "같은 `(target, targetHandle)` 에 2개 엣지"만 금지하면 충분하다. 실제로 검증 규칙은 이미 핸들 단위(`multi_input`)이므로, **서로 다른 핸들로 들어오는 N개 입력은 이미 허용되고 있을 가능성**이 높다. 확인 후 명시적으로 문서화/테스트로 굳히는 작업.

**접근법.**
- 먼저 `validate.ts` 와 `NodeEditor.onConnect` 가 정말로 *다른 핸들*은 막지 않는지 코드로 검증(가설: 막지 않음). 막힌다면 핸들 단위로 완화.
- sampler 입력이 여러 개인 커스텀 셰이더 템플릿(예: 3-way blend, mask composite) 1~2개를 빌트인으로 추가해 기능을 노출.
- 임의 fan-in DAG 에서 FBO 라우팅·토포 정렬이 정상인지 compile 테스트 보강.

**영향 모듈.** `core/graph/validate.ts`(필요 시), `shaders/templates/*`, `ui/NodeEditor/Toolbar.tsx`·`CommandPalette`(템플릿 등록), `core/graph/compile.test.ts`.

**게이트.** validate.test / compile.test 보강. E2E: 다중 sampler 합성 그래프 렌더 스펙.

**주의.** 이건 "이미 되는지 확인 → 안 되면 완화 → 노출" 순서라 1번보다 코드 변경이 적을 수도, 검증으로 끝날 수도 있다. 시작 시 현 동작 확인이 첫 단계.

---

## 3. `u_mouse` / `u_frame` 시스템 유니폼

**동기.** Shadertoy 호환 셰이더 이식성. 마우스 좌표·프레임 카운터는 절차적 셰이더에서 흔히 쓰인다. 마우스 입력은 이미 `core/camera/input.ts` 가 pointer 이벤트를 받고 있어 좌표 추출이 쉽다.

**접근법.**
- `parseUniforms` 의 system 이름 집합에 `u_mouse`(vec2 또는 vec4: xy=현재, zw=클릭) / `u_frame`(float, 누적 프레임) 추가(Architecture §4.4). → Inspector·입력 포트 자동 숨김.
- 마우스 좌표 store(또는 기존 cameraStore 옆 소형 store) + RAF 의 `FrameContext` 에 주입. dirty 게이트: 마우스 이동 시 `rev` 증가.
- `u_frame` 은 `rendererStore.renderTick` 또는 별도 카운터.

**영향 모듈.** `core/graph/uniformParser.ts`, `core/graph/execute.ts`(bindSystemUniforms), `ui/Viewport/index.tsx`, 신규/기존 store, `standalonePlayer.js`.

**게이트.** uniformParser.test 에 system 인식 케이스. E2E: 마우스 이동이 화면에 반영되는 스펙(좌표 의존 셰이더).

---

## 4. 노드 그래프 키보드 접근성 & 복제

**동기.** 노드 편집 생산성. 복제(Cmd+D), 화살표 이동, 박스 다중 선택은 노드 에디터의 기본 기대치다.

**접근법.**
- React Flow 가 다중 선택/박스 선택을 일부 내장 — `selectionStore` 를 단일 ID 에서 다중으로 확장할지 결정(영향 큼). 우선 **복제(Cmd+D)** 만 단독 머지: 선택 노드의 graphStore 엔트리를 새 ID 로 클론 + 위치 오프셋 + 들어오는 엣지는 복제 안 함(또는 옵션). history push.
- `KeyboardShortcuts.tsx` 에 핸들러 추가.

**영향 모듈.** `ui/KeyboardShortcuts.tsx`, `state/graphStore.ts`(cloneNode), `state/selectionStore.ts`(다중 선택은 별도 단계).

**게이트.** graphStore.test(clone). E2E: Cmd+D 로 노드 복제 스펙.

**주의.** 다중 선택은 selectionStore·Inspector·CodeEditor 가 단일 선택 가정이라 파급이 크다. **복제만 먼저, 다중 선택은 별도 항목**으로 쪼개는 게 안전.

---

## 5. Inspector 주석 힌트 GUI 생성

**동기.** 현재 `// @range 0..5 @default 2` 같은 메타를 손으로 GLSL 에 써야 한다(Architecture §4.5). uniformParser 의 역방향 — 슬라이더에서 GUI 로 범위를 정하면 소스 주석을 자동 삽입.

**접근법.**
- UniformControl 우클릭/기어 메뉴 → "범위·기본값 편집" 팝오버.
- 변경 시 해당 uniform 선언 라인의 트레일링 주석을 파싱→갱신→재작성. 기존 주석 보존하며 키만 갱신하는 직렬화기 필요(`@range`/`@default`/`@label`).
- 소스 변경이므로 `updateShaderSource` 경로(구조 rev) 를 탄다.

**영향 모듈.** `core/graph/uniformParser.ts`(주석 write-back 헬퍼 신규 + 테스트), `ui/Panels/UniformControl.tsx`, `state/graphStore.ts`.

**게이트.** uniformParser.test 에 round-trip(parse→edit→serialize→parse) 테스트. E2E: GUI 로 범위 변경 → 소스 주석 반영 + 슬라이더 갱신.

---

## 6. 셰이더 핫리로드 디스크 백업 (File System Access API)

**동기.** 외부 에디터(VSCode)에서 GLSL 편집 → 앱 자동 반영. 파워유저 가치 큼. (SPEC §4 백로그에 이미 언급.)

**접근법.**
- `showSaveFilePicker` / `FileSystemFileHandle` 로 노드 GLSL 을 디스크 파일에 export, 권한 유지 동안 폴링 또는 `FileSystemObserver`(가용 시)로 변경 감지 → `updateShaderSource`.
- 권한·핸들 lifecycle 은 webcam registry(`core/external/registry.ts`)처럼 plan 외부 싱글톤으로 관리하는 패턴 재사용.
- 브라우저 지원 한정(Chromium 계열) — 미지원 시 기능 숨김.

**영향 모듈.** 신규 `core/external/` 또는 `state/` 모듈, `ui/CodeEditor/` 또는 Toolbar 토글.

**게이트.** 파일 시스템은 jsdom/Playwright 에서 모킹 한계가 큼 — 단위는 핸들 추상화 레이어만, E2E 는 가용 여부 가드. **비용 대비 가치 재평가 후 착수.**

---

## 7. 썸네일 GPU 다운샘플

**동기.** 현재 96×96 다운샘플이 CPU(`downsampleToThumb`, Architecture §6.2). 원본 FBO 가 클수록 PBO 전송량(풀해상도 RGBA)과 CPU 비용이 크다.

**접근법.**
- blit 단계에서 GPU 로 먼저 96×96 FBO 에 축소(텍스처드 쿼드 1패스) → 그 작은 FBO 를 PBO readback. 전송량이 `W×H×4` → `96×96×4` 로 급감, CPU 다운샘플 제거.
- `asyncReadback` 의 request 가 원본 FBO 대신 thumb FBO 를 읽도록. thumb FBO 풀(노드당 1개) 신설.
- 동기 폴백(`readback.ts`)은 그대로 두되 공유 상수만 유지.

**영향 모듈.** `core/thumbnail/asyncReadback.ts`, 신규 thumb-blit 경로(`execute.ts` 또는 thumbnail 모듈), `core/gl/framebuffer.ts`.

**게이트.** asyncReadback.test 보강. E2E: 기존 썸네일 라이브 갱신 스펙이 회귀 없이 통과(시각 결과 동일).

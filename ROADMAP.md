# ShaderPlayground 개선 로드맵

> Phase 16 이후의 제안 항목. 각 항목은 **독립적으로 머지 가능한 단위**로 설계되어 있으며, 시작 시 [SPEC.md](./SPEC.md) §4 의 정식 Phase 로 승격한다. 우선순위·동기·접근법·영향 모듈·게이트 영향을 함께 적어 다른 세션에서 콜드 스타트로 집어 들 수 있게 한다.
>
> 구조/동작 용어는 [Architecture.md](./Architecture.md) 기준. 모든 항목은 `npm run check` + `npm run test:e2e` 통과가 완료 조건이며, UI/렌더 변경 시 관련 E2E Phase 스펙을 갱신(사용자 합의 후)한다.

---

## 추천 진행 순서

표현력을 직접 키우고 기존 컴파일/실행 구조에 자연스럽게 얹히는 **1 → 2** 가 최우선. 그다음 워크플로/디버깅(4·5·3) → 성능(7) → 비용 높은 디스크 연동(6) 순.

> ✅ **1번(Pass별 해상도 스케일)은 완료** — SPEC.md Phase 17. ✅ **2번(N:1 합성 일반화)도 완료** — SPEC.md Phase 18. ✅ **3번(`u_mouse`/`u_frame` 시스템 유니폼)도 완료** — SPEC.md Phase 19. 다음은 **4번(노드 그래프 키보드 접근성 & 복제)**.

| # | 항목 | 분류 | 난이도 | 추천도 |
|---|---|---|---|---|
| ~~1~~ | ~~Pass별 해상도 스케일~~ (완료 → Phase 17) | 표현력 | 중 | ★★★ |
| ~~2~~ | ~~N:1 합성 일반화~~ (완료 → Phase 18) | 표현력 | 중 | ★★★ |
| ~~3~~ | ~~`u_mouse` / `u_frame` 시스템 유니폼~~ (완료 → Phase 19) | 표현력 | 하 | ★★ |
| 4 | 노드 그래프 키보드 접근성 & 복제 | 워크플로 | 하 | ★★ |
| 5 | Inspector 주석 힌트 GUI 생성 | 워크플로 | 중 | ★★ |
| 6 | 셰이더 핫리로드 디스크 백업 | 워크플로 | 상 | ★ |
| 7 | 썸네일 GPU 다운샘플 | 성능 | 중 | ★★ |

---

## 1. Pass별 해상도 스케일 — ✅ 완료 (SPEC.md Phase 17)

`ShaderGraphNode.resolutionScale?: 0.25 | 0.5 | 1` 도입. `compile.ts` 의 `scaledDimensions()` 가 패스별 FBO 크기 결정, `execute.ts` 가 패스별 viewport·u_resolution 바인딩, Inspector 드롭다운(`data-testid="resolution-scale"`), standalonePlayer `createFBO` 반영. 검증: `scaledDimensions`/`setResolutionScale`/`projectSanitize` 단위 테스트 + `phase-17-resolution-scale.spec.ts`. 자세한 내용은 SPEC.md Phase 17.

---

## 2. N:1 합성 일반화 — ✅ 완료 (SPEC.md Phase 18)

가설대로 **연결·컴파일 파이프라인은 이미 핸들 단위로 일반화**되어 있었다. `validate.ts` 의 `multi_input` 은 `(target, targetHandle)` 단위라 동일 핸들만 금지하고, `onConnect` 도 동일 핸들 점유 시에만 거부. `compile.ts` 는 타깃의 모든 입력 엣지를 순회하며 texture 마다 `SamplerBinding{ unit: unit++ }` 라우팅 → 임의 fan-in 정상. 따라서 코드 완화 없이 **노출·테스트·문서화**로 마무리: 빌트인 템플릿 `Composite 3`(composite3.frag)·`Mask`(mask.frag) CommandPalette 등록, `validate.test` 에 다른 핸들 N:1 허용 + fan-in 토포 정렬 케이스, E2E `phase-18-fanin-composite.spec.ts`(R/G/B → u_a/u_b/u_c 합성). Architecture §2.3 문구도 "동일 핸들만 금지, 핸들 다른 N:1 허용" 으로 정정. 자세한 내용은 SPEC.md Phase 18.

---

## 3. `u_mouse` / `u_frame` 시스템 유니폼 — ✅ 완료 (SPEC.md Phase 19)

`u_mouse`(vec4: xy=현재, zw=마지막 클릭, 픽셀·좌하단 원점) / `u_frame`(float, 누적 프레임)을 `SYSTEM_UNIFORMS` 에 추가 → Inspector·입력 포트 자동 숨김. 신규 `state/mouseStore.ts` 가 포인터 좌표를 보관하고 Viewport 의 canvas pointer 리스너가 갱신(+y flip, `rev` 증가로 idle RAF 깨움). `execute.ts` 가 `FrameContext.mouse`/`frame` 을 셰이더(+compute u_frame)에 바인딩, `standalonePlayer.js` 동형. 검증: `uniformParser`/`mouseStore` 단위 + `phase-19-mouse-frame.spec.ts`. 자세한 내용은 SPEC.md Phase 19.

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

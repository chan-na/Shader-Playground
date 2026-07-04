# 코드 리뷰 후속 작업 (Follow-up Pass)

> 이 문서는 **새 세션(zero-context)에서 단독으로 실행 가능**하도록 작성된 작업 지시서다.
> 원본 리뷰(`docs/review.md`)의 발견 중, 1차 패스에서 **의식적으로 보류한 항목**만 다룬다.

---

## 0. 배경 — 지금까지 무엇이 끝났나

- 원본 리뷰: `docs/review.md` (분석 시점 HEAD `ee5d6c0`). 채택 72건 (Critical 1 · High 7 · Medium 12 · Low 51).
- **1차 패스는 완료·머지됨** (PR #63, 머지 커밋 `b6b7b9d`). 처리 내역:
  - CONFIRMED & 수정: **Critical 1 · High 7 · Medium 12 · Low 23** (총 43건) + 단위 테스트 35건 추가(938→973).
  - REFUTED(반증→스킵): L1, L2, L6, L7, L13, L20, L37, L42, L43 (아래 §5).
  - **이 문서가 다루는 보류분**: L5, L16, L17, L21, L22, L23, L25, L26, L28, L35, L44 + E2E 스펙 강화 2건.
- 보류 사유는 공통적으로 **렌더/에디터 핫패스의 단위 테스트 커버리지 부재로 회귀 위험이 가치보다 컸기 때문**이거나, **E2E 스펙 변경이라 사용자 합의가 필요**했기 때문이다.

---

## 1. 절대 규칙 — 품질 게이트 (머지 전제 조건)

`CLAUDE.md`가 정본이다. 반드시 준수:

```bash
npm run check       # typecheck → lint → deadcode → circular → unit test (하나라도 실패 시 중단)
npm run test:e2e    # Playwright E2E (SwiftShader, chromium 단일, 직렬)
```

- **strict TS**: `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes` 포함. `any` / `as unknown as T` 우회 금지(진짜 외부 경계면 사유 주석).
- **Biome warn 0**: `noNonNullAssertion`(warn), `useImportType`(error), `noExplicitAny`(warn). **새 `biome-ignore` 추가 금지** — 필요하면 사유·대안검토를 먼저 보고하고 합의. (테스트 파일은 `noNonNullAssertion` off — `biome.json` overrides 참고.)
- **Knip 데드코드 0**: 새 export는 같은 변경 안에 실제 호출자 동반. `*.test.ts(x)`가 entry라 테스트만 쓰는 export는 flag되지 않지만, "테스트용 export 남발"은 지양.
- **순환 의존 0**: store 간 직접 상호 import 금지(단방향 유지).
- **커버리지 임계치**(`vitest.config.ts`): lines 50 / functions 47 / branches 42 / statements 50. **낮추지 말 것** — 신규 로직엔 테스트 동반.
- `standalonePlayer.js`는 biome/coverage 제외(순수 JS 재구현). 편집 후 `node --check`로 문법만 확인.

## 2. 작업 프로토콜 (매 항목 공통)

1. **검증 우선**: 이 문서의 위치/근거를 맹신하지 말고 **현재 소스에서 재확인**한다. 1차 패스 이후 코드가 또 바뀌었을 수 있고, 이 문서의 "보류" 판단 자체도 재검증 대상이다. 재현 안 되면 고치지 말고 근거와 함께 스킵 보고.
2. **브랜치**: `main`은 보호됨. 작업 브랜치를 판다(예: `fix/review-followup-<범위>`).
3. **커밋 단위 = 발견 그룹 1개**. 커밋 메시지는 `fix/perf/refactor/test(scope): ...` + 본문에 다룬 ID. 말미에:
   `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`
4. **게이트**: 논리 그룹마다 `npm run check` + (UI/렌더 영향 시) 관련 `npm run test:e2e`. 순수 내부 변경으로 E2E 생략이 타당하면 사유 명시 후 사용자 확인.
5. **⚠️ E2E 스펙 약화 금지**: `expect` 약화 / `test.skip` / `test.fixme` 금지. **스펙 강화·회귀 가드 추가/갱신도 사용자 합의 후에만** (§4-A 참고).
6. push / PR / merge는 사용자가 명시 요청할 때만.

---

## 3. 보류 항목 상세

> 위치는 머지 커밋 `b6b7b9d` 기준. `file:line`은 드리프트할 수 있으니 grep 힌트로 재확인.

### 그룹 B — 정확성 엣지 (실제 버그, 신중 필요)

#### L17 — 50ms commit 창 안의 편집이 노드/stage 전환 시 유실 ★우선순위 높음(데이터 손실)
- **위치**: `src/ui/CodeEditor/index.tsx` — `commit = debounce(…, 50)` (≈L76), 리로드 effect (≈L161-174, `switching`/`externalChange` 분기).
- **문제**: 타이핑은 `commit`을 50ms 디바운스로 스토어에 반영한다. 디바운스가 아직 발화하지 않은 상태에서 활성 노드/stage를 전환하면, 리로드 effect가 이전(미커밋) 텍스트를 스토어 값으로 덮어써 **그 50ms 창의 편집이 유실**된다.
- **제안**: 전환(리로드) 직전에 pending 디바운스 커밋을 flush. `commit.flush?.()` 지원 여부 확인(디바운스 구현), 없으면 리로드 effect의 `switching` 분기에서 현재 view 텍스트를 동기 커밋한 뒤 로드. 1차 패스에서 넣은 `source === view.state.doc.toString()` 스킵(M11)과 상호작용 주의.
- **보류 사유**: 에디터 commit/reload 타이밍은 단위 커버리지가 없고, flush 배선이 M11 수정·라이브 검증 디바운스와 얽혀 회귀 위험.
- **수용/테스트**: 가능하면 CodeEditor commit 로직을 순수 함수로 얇게 뽑아 단위화; 최소한 phase-9/24/27/28 E2E 회귀 없음 확인. (커서/유실 회귀를 E2E로 잡으려면 §4-A 합의.)
- **위험**: 중.

#### L5 — 컴파일 실패 소스의 sampler가 unbound로 남아 이전 텍스처 잔상
- **위치**: `src/core/graph/execute.ts:176` — `bindSamplers` 내 `if (!texture) continue;`.
- **문제**: 소스 셰이더가 컴파일 실패하면 `passByNode`에 없어 `texture=null` → 바인딩을 **스킵**. 해당 sampler 유닛이 이전 draw의 텍스처를 유지해 잔상(ghost)이 남는다.
- **제안**: null일 때 blank(1×1 opaque-black) placeholder 텍스처를 유닛에 바인딩하고 uniform을 세팅. **주의**: 같은 분기가 "외부 소스(webcam/video/audio) acquisition pending"도 커버한다(L170-173). 이 경우까지 black으로 바꾸면 웹캠 시작 순간이 검게 보일 수 있어, **컴파일 실패 케이스만** 스코프하는 것이 이상적(소스 노드 kind로 구분).
- **보류 사유**: 렌더 핫패스, 단위 커버리지 없음(L35), placeholder 텍스처 인프라 필요 + external-pending 경로 상호작용 모호.
- **수용/테스트**: L35 하네스 위에서 "실패 소스 → 유닛에 placeholder 바인딩" 검증. 웹캠/비디오 startup 시각 회귀 없음(수동/E2E).
- **위험**: 중.

#### L16 — 일시정지 중 뷰로 스크롤된 썸네일이 readback을 못 받음
- **위치**: `src/ui/Viewport/index.tsx` — paused/static 분기(≈L307-324)는 pending fence만 poll하고 return. `pickReady`+`asyncReadback.request`는 needsRender 분기(≈L438-444)에만 존재.
- **문제**: 일시정지 상태에서 새 노드 썸네일이 뷰포트로 스크롤돼 들어와도 readback 요청이 안 나가 썸네일이 비어 있음.
- **제안**: paused 분기에서도 `thumbnailScheduler.pickReady` 결과가 있으면 최소 1회 request/poll 하도록. 매 프레임 렌더를 깨우지 않게(B2 idle 스펙 유지) 주의.
- **보류 사유**: 렌더 루프 분기 변경, 단위 커버리지 없음. phase-9 "B2 idle" E2E와 상호작용.
- **수용/테스트**: phase-9 idle 스펙 통과 유지(렌더가 다시 깨어나면 안 됨) + 썸네일이 채워짐.
- **위험**: 중.

### 그룹 C — 성능 미세 최적화 (핫패스 할당 축소, 즉시 위험 없음)

- **L21** — `src/ui/NodeEditor/index.tsx:79` `rfNodes` useMemo가 노드마다 `data:{node:n}`(L91)를 매 렌더 재생성 → 드래그 프레임마다 전체 재렌더. **제안**: node별 data 객체 메모이즈/안정화(node id+rev 키). React Flow 재렌더 특성상 신중.
- **L22** — `src/ui/Viewport/index.tsx:351,366` RAF 루프가 프레임마다 `nodeById = new Map(...)` + `params` 재구축(이중 스캔·할당). **제안**: rev 변화 시에만 재구축하도록 캐시.
- **L23** — `src/core/graph/execute.ts:235-239` `executePlan`이 매 프레임 `passByNode`/`shaderPassByNode` 재구축. **제안**: `plan`에 맵을 1회 캐시(plan 재컴파일 시에만 갱신). plan 수명주기와 정합 주의.
- **L25** — `src/core/glsl/references.ts:99,187,205`, `semanticTokens.ts:159`, `referenceHighlight.ts`, `Inspector.tsx`가 편집/커서 이동마다 `buildSymbolTable`(전체 재파싱). **제안**: (source 문자열 키) 심볼테이블 메모이즈.
- **L28** — `src/core/assets/audioLoader.ts:39-40` 메타데이터만 필요한데 `decodeAudioData`로 전체 파일 디코드. **제안**: `<audio>` 엘리먼트 `loadedmetadata`로 duration/sampleRate/channels 추출(디코드 회피). API 변경이라 테스트 동반.
- **L26** — `src/core/gif/encode.ts:132` 전체 GIF를 `number[]`에 per-byte push(`pushSubBlocks` L94 등). **제안**: `Uint8Array` 청크 누적 후 1회 concat. **모든 push 헬퍼(pushU16LE/pushColorTable/pushSubBlocks 등)를 함께 바꿔야 하는 광범위 변경**. `encode.test.ts`가 GIF 디코드/검증하므로 바이트 오류는 잡히지만 회귀 표면이 넓다.
- **보류 사유(공통)**: 렌더/React 핫패스 단위 커버리지 부재 → 회귀 감지 어려움. 성능 회귀/개선은 E2E로 잘 안 잡힘.
- **위험**: 중 (L26은 중~높).

### 그룹 D — 정비 (버그 아님)

- **L44** (리팩터) — `src/core/graph/compile.ts` VAO 빌더가 두 곳에 중복(≈L270 슬롯 로컬 경로 / `buildShaderComputeVaos` ≈L387-401 computePass.attributes 경로) + TF 빌더 유사 반복. **제안**: 슬롯 소스만 다른 공용 `buildVaoFromSlots(gl, program, slots)` 헬퍼로 추출. **주의**: 렌더 경로, 단위 커버리지 없음 → L35 하네스 후 진행 권장.
- **L35** (테스트 공백, **선행 권장**) — `src/core/graph/execute.ts` 렌더 심장부(ping-pong swap, compute-mesh VAO 선택, dispose 누수)에 단위 테스트 없음(`execute.test.ts` 부재). **제안**: fake WebGL2(`src/core/gl/fakeGl.ts`, `asyncReadback.test.ts`/`registry.test.ts`의 fake gl 패턴 참고)로 `executePlan`·컴포지트·bindSamplers 구동. **이 하네스를 먼저 만들면 L5/L23/L44를 훨씬 안전하게 진행 가능.**
- **위험**: 낮(D는 버그 없음, 하지만 렌더 경로라 하네스 없이는 신중).

---

## 4. 사용자 합의가 필요한 항목

### 4-A. E2E 스펙 강화 (코드 수정은 1차 패스에서 완료, 회귀 가드만 남음)
> §2-5에 따라 **반영 전 사용자에게 변경안 보고 후 합의 필요.**

- **phase-9 undo id 단언 (C1 가드)**: `tests/e2e/phase-9-editor-ux.spec.ts`의 "Cmd+Z undoes…"가 현재 노드 `.length`만 확인. **노드 id 왕복**(add→undo→정확히 그 노드만 사라짐)으로 강화 제안.
- **phase-28 커서 회귀 가드 (M11 / 원본 L41)**: `tests/e2e/phase-28-cross-stage-rename.spec.ts`가 소스 텍스트·history만 확인하고 **CodeMirror selection(커서) 위치는 미확인**. cross-stage rename 후 커서가 offset 0으로 붕괴하지 않는지 selection 확인 추가 제안.

---

## 5. 재확인 불필요 — REFUTED (다시 하지 말 것)

1차 패스 검증에서 반증되어 **의도적으로 스킵**. 근거:
- **L1** snapshot shallow-clone: 모든 graphStore 뮤테이션이 immutable → 공유 중첩 상태 미변형.
- **L2** parents 사이클: 호출부가 항상 비순환 parents 전달(`wouldCreateParentCycle` 가드).
- **L6** `gl/uniforms` value shape: Float32Array 경로는 16-el 행렬만, 배열은 2/3/4만 전송.
- **L7** `framebuffer bindFramebuffer(null)` viewport: 유일 caller가 다음 줄에서 viewport 설정.
- **L13** `nextId` 충돌: 모듈 counter가 세션 내 유일성 보장.
- **L20** `utility.ts` `as` 캐스트: 판별 union 내로잉으로 이미 안전(중복 캐스트).
- **L37** serialization 테스트 공백: 해당 동작들은 각 소유 모듈 테스트에서 이미 커버.
- **L42** camera `attach()` 리스너 누수: effect마다 fresh 컨트롤러 + cleanup detach.
- **L43** `paramValue` 참조 누출: 모든 소비자 read-only(uniformCache가 `[...v]` 복사).
- 원본 문서 끝 "반증되어 제외된 항목" 2건(`references.ts` CRLF, `input.ts` clamp)도 건드리지 말 것.

---

## 6. 권장 진행 순서

1. **4-A 합의** (E2E 가드 2건 — 저비용, 1차 수정을 잠금).
2. **L17** (데이터 손실 엣지 — B 중 최우선).
3. **L35** 테스트 하네스 구축 (execute 렌더 심장부) — 이후 작업의 안전망.
4. 하네스 위에서 **L5 → L23 → L44**.
5. 나머지 성능(**L21, L22, L25, L28, L16, L26**) — 개별 측정하며 선택적.

범위를 나눠 여러 브랜치/PR로 진행해도 좋다. 각 그룹 = 별도 커밋, 매번 게이트 통과 확인.

# 코드 리뷰 후속 — 그룹 C (성능 미세최적화 + 잔여 엣지)

> 이 문서는 **새 세션(zero-context)에서 단독 실행 가능**하도록 작성된 작업 지시서다.
> 선행 문서 `docs/review-followup.md`의 §6 5단계 "나머지 성능" 배치만 다룬다.
> `docs/review.md`(원본 리뷰), `docs/review-followup.md`(1·2차 후속)도 참고 가능하나, 이 문서만으로 진행할 수 있게 필요한 맥락을 아래에 요약했다.

---

## 0. 배경 — 지금까지 무엇이 끝났나

- 원본 리뷰: `docs/review.md`. 채택 72건.
- **1차 패스**(PR #63, 머지 `b6b7b9d`): Critical 1 · High 7 · Medium 12 · Low 23.
- **2차 패스**(PR #64, 머지 `b445772`): 아래 항목 완료 — 이 문서에서 **다시 손대지 말 것**.
  - **L17** 에디터 50ms 커밋 창 편집 유실(debounce.flush + 편집 시점 target 캡처).
  - **L35** `src/core/graph/execute.test.ts` 렌더 하네스 신설(fakeGl 구동). ← **이 문서의 L16/L22에 부분적 안전망**.
  - **L5** 컴파일 실패 소스 sampler에 1×1 검정 placeholder 바인딩.
  - **L23** `passByNode`/`shaderPassByNode`를 plan에 캐시(매 프레임 재구축 제거). ← **L22와 유사 패턴, 참고**.
  - **L44** `compile.ts` VAO 빌더를 `buildVaoFromSlots`로 추출.
  - **4-A** E2E 가드: phase-9 undo id 왕복(C1), phase-28 커서 보존(M11).
- **이 문서가 다루는 잔여분**: **L25, L28, L26, L22, L21, L16** (6건).
- 이들이 2차 패스에서 보류된 공통 사유: **렌더/React/에디터 핫패스라 회귀 감지가 어렵고**(성능 회귀·개선은 E2E로 잘 안 잡힘), **개별 측정이 필요**한 미세최적화이기 때문. L16은 성능이 아니라 **실제 correctness 버그**지만 Viewport RAF 분기 변경이라 같은 배치로 묶였다.

---

## 1. 절대 규칙 — 품질 게이트 (머지 전제 조건)

`CLAUDE.md`가 정본. 반드시 준수:

```bash
npm run check       # typecheck → lint → deadcode → circular → unit test (하나라도 실패 시 중단)
npm run test:e2e    # Playwright E2E (SwiftShader, chromium 단일, 직렬). 현재 111건.
```

- **strict TS**: `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes` 포함. `any` / `as unknown as T` 우회 금지(진짜 외부 경계면 사유 주석).
- **Biome warn 0**: `noNonNullAssertion`(warn), `useImportType`(error), `noExplicitAny`(warn). **새 `biome-ignore` 추가 금지** — 필요하면 사유·대안검토를 먼저 보고하고 합의. (테스트 파일은 `noNonNullAssertion` off.)
- **Knip 데드코드 0**: 새 export는 같은 변경 안에 실제 호출자 동반. export를 늘리면 테스트만 쓰는 export라도 지양.
- **순환 의존 0**: store 간 직접 상호 import 금지.
- **커버리지 임계치**(`vitest.config.ts`): lines 50 / functions 47 / branches 42 / statements 50. **낮추지 말 것** — 신규 로직엔 테스트 동반.
- `src/export/standalonePlayer.js`는 biome/coverage 제외(순수 JS 재구현). 편집 시 `node --check`로 문법만 확인.
- **게이트 우회 금지**: strict 완화, 룰 off, 임계치 하향, `knip.json` ignore 추가, `dpdm` exit 무시, E2E `expect` 약화/`skip`/`fixme`, `--no-verify`/`--force` 등 전부 금지.

---

## 2. 작업 프로토콜 (매 항목 공통)

1. **검증 우선**: 이 문서의 `file:line`은 드리프트할 수 있다(작성 시점 머지 커밋 `b445772` 기준). 반드시 **현재 소스에서 grep으로 재확인**. 재현 안 되면 고치지 말고 근거와 함께 스킵 보고.
2. **성능 항목은 "실측"이 원칙**: 그룹 C는 미세최적화다. 각 항목은 **핫패스가 맞는지, 실제 할당/재파싱이 프레임/입력마다 일어나는지**를 코드로 확인하고, 가능하면 before/after를 논증(또는 간단 측정)한다. "이론상 빠름"만으로 리스크를 감수하지 말 것.
3. **브랜치**: `main`은 보호됨(CI 3잡 필수: `typecheck+lint+deadcode+circular+test`, `playwright e2e`, `bundle size guard`). 작업 브랜치를 판다(예: `perf/review-followup-<범위>`).
4. **커밋 단위 = 항목 1개(또는 밀접한 그룹)**. 메시지 `perf/fix/refactor(scope): ...` + 본문에 ID. 말미:
   `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`
5. **게이트**: 각 커밋마다 `npm run check` + (Viewport/NodeEditor/렌더/에디터 UI 변경 시) `npm run test:e2e`. 순수 내부 변경으로 E2E 생략이 타당하면 사유 명시 후 사용자 확인.
6. **⚠️ E2E 스펙 약화 금지**. 스펙 강화/가드 추가도 사용자 합의 후에만.
7. **push / PR / merge는 사용자가 명시 요청할 때만.** 로컬 커밋까지는 워크플로의 일부.

---

## 3. 항목 상세 (권장 진행 순서대로)

> 아래 순서는 **안전·테스트 용이 → 핫패스·저테스트 순**으로 재배열했다(원본 §6 순서 L21→L22→L25→L28→L16→L26과 다름). 각 항목은 독립적이라 별도 브랜치/PR로 나눠도 된다.

### ① L25 — `buildSymbolTable` 재파싱 메모이즈  ★가장 안전, 이득 넓음
- **위치**: `src/core/glsl/symbolTable.ts`(`buildSymbolTable` 정의). 호출부가 **많다**: `src/core/glsl/references.ts:99,187,205`, `src/core/glsl/semanticTokens.ts`, `src/ui/CodeEditor/{hover,autocomplete,gotoDef}.ts`, `src/main.tsx`. (grep: `buildSymbolTable`)
- **문제**: 편집/커서 이동/호버/자동완성마다 **소스 전체를 재파싱**한다. 같은 소스 문자열에 대해 반복 호출이 잦다.
- **제안**: **`symbolTable.ts` 안에서 source 문자열을 키로 메모이즈**(호출부마다가 아니라 한 곳에서). 마지막 1~수 개만 캐시(LRU 1~2 엔트리로 충분 — 보통 "현재 편집 중인 소스" 하나). WeakMap은 문자열 키에 못 쓰니 `Map<string, SymbolTable>` + size 캡. 결과 테이블이 **호출부에서 mutate되지 않는지** 확인(안 되면 캐시 공유가 위험 — 현재 read-only인지 점검).
- **테스트**: `src/core/glsl/symbolTable.test.ts` 존재. "같은 소스 재호출 시 재파싱 안 함"을 파서 스파이/카운터로 검증, 다른 소스는 새로 파싱. 기존 references/semanticTokens 테스트 회귀 없음.
- **위험**: 낮음(순수 함수 메모이즈). 캐시 공유로 인한 aliasing만 주의.

### ② L28 — 오디오 메타데이터를 디코드 없이 추출
- **위치**: `src/core/assets/audioLoader.ts:40` — `await ctx.decodeAudioData(buf)` 로 전체 디코드 후 `duration/sampleRate/numberOfChannels`만 사용(:42-44).
- **문제**: 메타데이터만 필요한데 파일 전체를 PCM으로 디코드 → 큰 오디오에서 메모리·시간 낭비.
- **제안**: `<audio>` 엘리먼트 + `URL.createObjectURL(blob)` + `loadedmetadata` 이벤트로 `duration` 추출. `sampleRate`/`channels`는 `<audio>`로는 못 얻으니, **정말 필요한지 소비자 확인**: 안 쓰면 0/기본값 유지, 꼭 필요하면 `decodeAudioData` 폴백을 유지하되 메타 우선. **API/반환 형태 변경이므로 소비자 전수 확인**(grep: `probeAudio`/`audioLoader` import) 후 진행.
- **테스트**: `audioLoader.test.ts` 유무 확인 후, `<audio>` 경로를 jsdom에서 어떻게 스텁할지 검토(jsdom은 `HTMLMediaElement.play/load` 미구현 — 이벤트 수동 디스패치 필요). 테스트가 과하게 어려우면 **함수를 얇게 쪼개** metadata-parse 부분만 단위화.
- **위험**: 중(API 변경, jsdom 제약). 소비자 계약 안 깨지게 반환 타입 보존이 관건.

### ③ L26 — GIF 인코더 per-byte `number[]` → `Uint8Array` 청크 누적
- **위치**: `src/core/gif/encode.ts` — `pushU16LE`(:68), `pushColorTable`(:78), `pushSubBlocks`(:94) 등 **모든 push 헬퍼가 `out: number[]`에 per-byte `out.push(...)`**. 최종 `Uint8Array`로 변환.
- **문제**: 전체 GIF를 `number[]`로 바이트 단위 push → 큰 프레임/장수에서 GC·복사 비용.
- **제안**: `Uint8Array` 청크를 누적하는 writer(예: 동적 grow 버퍼 또는 청크 배열 후 1회 concat)로 교체. **모든 push 헬퍼를 함께 바꿔야 하는 광범위 변경**. 시그니처를 `(out: ByteWriter, ...)`로 통일.
- **테스트**: `src/core/gif/encode.test.ts`가 **인코딩 결과를 실제 디코드/검증**하므로 바이트 오류는 잡힌다 — 강력한 안전망. 그래도 회귀 표면이 넓으니 리팩터를 작게 쪼개 각 헬퍼 교체마다 테스트.
- **위험**: 중~높(표면 넓음). 단, 디코드 검증 테스트가 있어 정확성 회귀는 감지됨.

### ④ L22 — Viewport RAF 루프의 `nodeById`/`params` 매 프레임 재구축
- **위치**: `src/ui/Viewport/index.tsx:351` `const nodeById = new Map(graph.nodes.map(...))`, `:366-367` `params` 객체 재구축. 매 프레임(RAF) 실행.
- **문제**: 프레임마다 전체 노드 스캔 2회 + Map/객체 할당. **L23(이미 머지)와 동일 계열** — plan은 캐시했지만 이 두 스냅샷은 여전히 매 프레임.
- **제안**: `graph` rev(또는 참조 동일성)이 바뀔 때만 재구축하도록 캐시(`useRef` + rev 비교, 또는 RAF 클로저 밖으로 승격). **주의**: `params`/`nodeById`는 프레임 컨텍스트(`FrameContext.params`, `graph`)로 `executePlan`에 전달됨 — 캐시가 stale이면 파라미터 노드 변경이 반영 안 될 수 있으니 **rev 비교 키를 정확히**.
- **테스트**: 순수 유닛은 어려움. `execute.test.ts` 하네스는 `executePlan`만 커버하고 Viewport RAF는 아님. **E2E로 회귀 확인**: phase-9 B2 idle, 파라미터 노드 변경 반영, 3-shader 체인 렌더 등. 필요하면 Viewport의 스냅샷 빌드 로직을 순수 함수로 추출해 단위화.
- **위험**: 중(렌더 핫패스, stale 캐시 위험). rev 키 설계가 핵심.

### ⑤ L16 — 일시정지 중 뷰로 스크롤된 썸네일이 readback을 못 받음  ★correctness 버그
- **위치**: `src/ui/Viewport/index.tsx` — paused/`!needsRender` 분기(:318-324)는 pending fence만 poll하고 return. `pickReady`+`asyncReadback.request`(:438-444)는 needsRender 분기에만 존재.
- **문제**: 일시정지 상태에서 새 노드 썸네일이 뷰포트로 스크롤돼 들어와도 readback 요청이 안 나가 **썸네일이 비어 있음**.
- **제안**: `!needsRender` 분기에서도 `thumbnailScheduler.pickReady(now)` 결과가 있으면 **최소 1회 request/poll**. **매 프레임 렌더를 깨우면 안 됨**(B2 idle 스펙 유지) — request는 이미 렌더된 FBO(`pass.fbo`)에서 readback만 하면 되므로 draw 없이 가능한지 확인. request 후 다음 프레임 poll이 필요하면 그 프레임만 깨우는 최소 스케줄.
- **테스트**: **phase-9 "B2 idle" E2E와 상호작용** — 렌더 루프가 다시 상시 깨어나면 안 된다(idle 스펙 통과 유지) + 썸네일이 채워짐. `asyncReadback.test.ts`(fakeGl) 패턴으로 request/poll 단위 보강 가능. E2E 가드 추가가 필요하면 **사용자 합의 후**.
- **위험**: 중(렌더 루프 분기, idle 스펙과 얽힘). "깨우지 않고 readback"이 성립하는지 먼저 검증.

### ⑥ L21 — React Flow `rfNodes` useMemo가 노드별 `data:{node:n}` 매 렌더 재생성
- **위치**: `src/ui/NodeEditor/index.tsx:79` `rfNodes: Node[] = useMemo(...)`, `:91` `data: { node: n }`.
- **문제**: `rfNodes` 메모가 노드마다 새 `data` 객체(`{node:n}`)를 만들어 → React Flow가 드래그 프레임마다 전체 카드 재렌더.
- **제안**: node별 `data` 객체를 **안정화**(node id+rev 키로 메모이즈, 변경된 노드만 새 객체). React Flow는 `data` 참조 동일성으로 재렌더를 가르므로 안정 참조가 관건. **주의**: React Flow 내부 재렌더 특성·selection/position 갱신과 얽히니 신중.
- **테스트**: 순수 유닛 어려움(React Flow DOM). **E2E**: phase-5-6(노드 카드 렌더/추가), phase-9(노드 클릭 selection/.selected), phase-29/30(그룹) 회귀 없음. 드래그 성능은 자동 검증 어려우니 수동 확인 병행.
- **위험**: 중(React Flow 재렌더 반직관적). 가장 테스트하기 어려운 항목 — **마지막에** 두고 회귀 감시 강화.

---

## 4. 권장 진행 순서 & 분할

1. **L25**(심볼테이블 메모이즈) — 저위험·광범위 이득, 단위 테스트 명확. 첫 타자.
2. **L28**(오디오 메타) — 격리된 로더, 단위화 가능(단 jsdom 제약).
3. **L26**(GIF 인코더) — 표면 넓지만 디코드 검증 테스트가 안전망.
4. **L22**(Viewport 스냅샷 캐시) — 렌더 핫패스, L16과 같은 파일이라 함께 보기 좋음.
5. **L16**(일시정지 썸네일 readback) — correctness 버그, B2 idle 스펙과 얽힘.
6. **L21**(React Flow data 안정화) — 가장 저테스트, 마지막.

각 항목 = 별도 브랜치/PR로 나눠도 되고, 성격이 겹치는 ④⑤(Viewport)를 한 PR로 묶어도 된다. **매 커밋 게이트 통과 필수.**

---

## 5. 다시 하지 말 것 (완료/반증)

- **완료(PR #63/#64)**: L5, L17, L23, L35, L44, 4-A(C1/M11) + 1차 패스 43건. 재작업 금지.
- **REFUTED(반증→스킵)**: L1, L2, L6, L7, L13, L20, L37, L42, L43, 그리고 `references.ts` CRLF·`input.ts` clamp. 근거는 `docs/review-followup.md` §5 참고. **건드리지 말 것.**

---

## 6. 시작 프롬프트(복붙용)

```
@docs/review-followup-groupC.md 읽고 진행.
그룹 C를 새 브랜치(perf/review-followup-…)에서 이어서 처리해줘.
문서의 권장 순서(L25 → L28 → L26 → L22 → L16 → L21)를 따르되,
각 항목은 현재 소스에서 재검증 후 진행하고, 재현 안 되면 스킵 사유를 보고해.
항목마다 npm run check + (Viewport/NodeEditor/에디터 변경 시) npm run test:e2e 통과시키고 별도 커밋.
push / PR / merge는 내가 명시할 때만.
```

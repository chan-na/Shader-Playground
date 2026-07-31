# 코드리뷰 2026-07 — 후속 추적 기록

> 라운드 자체는 종료됐다: 13개 영역 병렬 리뷰 52건 제기 → 적대적 반증 → 42항목 반영 → **PR #77 머지**(머지 커밋 `594e44f`, 기준 main `ea2de84`, CI 3잡 green).
> 이 문서는 그 라운드에서 **앞으로도 유효한 것만** 남긴 것이다 — 승인된 이탈·동작 변경, 의도적으로 수용한 한계, 아직 열려 있는 후속 작업, 상시 주의사항. 배치별 처방과 구현 경위는 커밋 메시지와 PR #77 본문에 있다.

---

## 1. 디자인 정본 이탈 (승인 완료 — 디자이너 인지 필요)

### D1. `addPanel`이 최대화를 해제한다 — 정본 X3의 예외

**정본**: `design/CHANGELOG.md` X3 — "최대화는 **접히는 leaf 자신**이 최대화 중일 때만 해제 — 무관한 최대화 패널은 안 풀림". `dockStore.setCollapsed`가 그 구현이다.

**문제였던 것**: 어떤 leaf가 최대화된 상태에서 닫힌 패널을 다시 열면(`addPanel` — AppToolbar 패널 토글 / Command Palette), 재도킹된 탭이 최대화 오버레이 **뒤에** 놓여 화면에 아무 변화가 없었다. 사용자에게는 "다시 열었는데 안 열렸다"로 보이고, 최대화를 직접 풀기 전까지 복구 경로가 없었다.

**채택안 (사용자 승인)**: 신규/병합된 leaf가 **최대화 오버레이에 가려질 때만** `maximized`를 해제한다.
- outer-right T1 폴백(새 leaf 생성) → 항상 가려짐 → `maximized: null`
- 탭 병합 → 대상이 **최대화된 leaf 자신**이면 새 탭이 오버레이 안에 보이므로 `maximized` 유지, 다른 leaf면 해제
- 이미 도킹된 패널의 `addPanel`(no-op) → `maximized` 불변

**기각안 (b)** "최대화 유지 + 새 탭을 최대화된 leaf에 병합": T1(S5) 이종 병합 게이트와 충돌한다(최대화된 leaf가 viewport/code면 병합 자체가 불가) — 그 경우 다시 유실 상태로 돌아간다.

**X3와의 관계**: X3는 *접기* 조작의 규칙이고 이 예외는 *재도킹* 조작에만 적용된다. `setCollapsed`/`toggleCollapsed`의 X3 동작은 그대로다. 비교는 **leaf id**로 한다(패널 id 아님).

가드: `dockStore.test` "maximized interaction (#22)" 4케이스.

### D2. 포커스된 탭 ✕ 위의 Space는 재생 토글이 아니라 버튼 활성화

정본 R10(`design/CHANGELOG.md`) 이행으로 탭 ✕의 `onKeyDown`이 Enter/Space에서 `stopPropagation`한다. React는 루트 컨테이너에서 네이티브 전파까지 끊으므로 그 키는 `window` 리스너(`KeyboardShortcuts`)에 닿지 않는다 → ✕에 포커스가 있는 동안 Space는 재생 토글 대신 그 버튼을 누른다. 아래 D4와 같은 방향의 의도된 결과다. Enter/Space 외의 키(Cmd+Z/D/A, 화살표 nudge)는 통과한다(`DockPanelHeader.test`가 고정).

---

## 2. 승인된 동작 변경 (버그로 오인되기 쉬움)

- **D3. 자동 fitView는 전체 교체·undo/redo에서만 동작한다.** 종전에는 모든 구조 변경(엣지 연결, 셰이더 코드 편집, 그룹 이동)마다 캔버스가 전체 맞춤으로 되돌아가 사용자의 줌/팬이 사라졌다. 이제 `setGraph` / `reset` / `applySnapshot`에서만 refit한다. 부수적으로 "뷰포트 밖에 추가된 노드"는 별도 경로가 줌을 유지한 채 팬해서 보여준다.
- **D4. 전역 Space 단축키의 범위가 좁아졌다.** `button, a[href], summary, [role=button|menuitem|tab]`에 포커스가 있으면 재생 토글 대신 그 요소가 활성화된다. 캔버스/body에서는 종전대로 재생 토글. HelpModal / SPEC.md / Architecture.md 카피도 함께 갱신됨.
- **D5. 실패한 컴파일은 더 이상 매 프레임 재시도되지 않는다.** `recompile()`의 catch가 `emptyPlan`으로 교체하므로, 리사이즈가 유발한 실패의 프레임당 재시도 루프가 사라진다. 대신 다음 `rev`/리사이즈까지 대기한다 — 일시적 실패의 자가 회복이 없어지는 대신, dispose된 플랜을 계속 실행하며 GPU 리소스를 누수하던 동작이 사라졌다.
- **D6. cross-stage rename은 에디터에 포커스가 있는 동안 Cmd+Z로 되돌릴 수 없다.** 두 스테이지를 한 번에 고치는 rename의 CM 트랜잭션에 `addToHistory.of(false)`가 붙는다(반쪽만 되돌아가 varying이 어긋나는 것을 막기 위함). `KeyboardShortcuts`가 `.cm-editor` 안을 편집 타깃으로 보므로 그래프 undo로도 흐르지 않는다. **에디터 밖에 포커스를 두고 Cmd+Z를 누르면 그래프 히스토리에서 원자적으로 되돌아간다.**
- **D7. Viewport 패널이 닫혀 있으면 File ▸ Snap PNG가 거절되고 그 사실을 토스트로 알린다** (F1 해소). `snapshotRequested`의 서버는 Viewport RAF 루프 **하나뿐**인데, 종전에는 서버 없이도 플래그가 켜져 **다음 Viewport 마운트 첫 프레임이 요청하지 않은 PNG를 내려받았다**. 창이 둘이라 처방도 둘이다: ① `requestSnapshot()`이 `ready === false`면 무장을 거부하고 `false`를 반환(불변식을 스토어에 둬서 호출부가 늘어도 안전) → 툴바가 토스트로 보고, ② 효과 cleanup이 남은 요청을 소비 + 토스트(컨텍스트 손실 경로 `:344`와 같은 처방). ②의 창은 최대 1프레임이고(`snapshotPending`이 idle 게이트를 열므로 다음 틱이 반드시 소비한다), **teardown이 곧 패널 닫기는 아니다** — 임의 leaf 제거·탭 드래그·`addPanel`도 트리를 재구성해 이 서브트리를 리마운트한다. 그래서 ②의 문구는 의도적으로 **원인 중립**이다. 가드: `rendererStore.test`(원샷 + 두 창), `AppToolbar.test`(호출부), `phase-11` additive E2E(닫기→거절→재개봉→다운로드 0건).

- **D8. 접히거나 가려진 Viewport에서도 File ▸ Snap PNG가 거절된다** (F21 해소). D7이 닫은 창은 `ready`(= 루프가 살아 있는가)뿐이었고, `ready`는 **캔버스가 보이는가를 뜻하지 않는다**. 접힌 레일·최대화된 형제 뒤의 Viewport는 `display:none`이라 마운트된 채 루프가 계속 도는데(`resize()`가 매 RAF 틱 실행) `clientWidth/Height`가 0이 되고 `Math.max(1, …)` 클램프가 걸려 **1×1 PNG가 경고 없이 내려받아졌다**(E2E로 실측 확인). 이제 `requestSnapshot()`이 `canvasSize`가 **양축 모두 1**일 때 거절한다 — 한 축만 1인 "얇지만 실제로 보이는" 패널은 오탐이므로 통과시킨다. 문구는 사유별로 갈린다: 닫힘은 "패널을 열어 주세요"(D7), 접힘은 "접힌 패널을 펼쳐 주세요". **호출부는 거절 후 `ready`를 읽어 둘을 구분한다** — 세 번째 사유가 생기면 이 대응을 함께 갱신해야 한다(양쪽 jsdoc에 명시). 가드: `rendererStore.test`("must not capture an invisible canvas (F21)" 5케이스), `AppToolbar.test`(문구 분기 — 반대 문구가 **안** 나오는 것까지 단언), `phase-11` additive E2E(접기→거절→펼치기→정상 다운로드).
- **D9. 임포트한 프로젝트의 셰이더 소스는 개행이 LF로 정규화된다 — 바이트 보존이 아니다** (F22 해소, **사용자 합의 후 진행**). `safeShaderSource`가 CodeMirror와 **같은 규칙**(`/\r\n?/g` → `\n`, CM의 `DefaultSplit`과 동일)으로 정규화한다. 종전에는 스토어만 CRLF를 이고 있고 CM 문서는 항상 LF라 **둘이 영구히 불일치**했고, 그 결과 undo로 CRLF 소스를 되살리는 순간 리로드 이펙트가 LF 쌍둥이를 재커밋해 `pushHistory`가 `future: []`로 **redo 스택을 파괴**했다(런타임 trace로 실측: undo 직후 `future=1` → settle 후 `future=0`, 소스 58자→56자). 길이 상한은 **정규화 전** 원본에 적용된다(CRLF 2배 페이로드가 LF 환산으로 통과하지 못하도록). 영향 진입점은 셋 다 `deserializeProject`를 통과한다 — 파일 임포트·공유 URL·자동저장 복구(따라서 이미 디스크에 있던 pre-fix 자동저장도 복구 시점에 정규화된다). **`updateShaderSource`는 정규화하지 않는다** — `__sp` 개발 훅이 심는 CRLF는 F3 offset 산술의 가드로 계속 유효해야 하고, `phase-28` CRLF 스펙이 바로 그 경로를 쓴다.

---

## 3. 의도적으로 수용한 한계

- **L1. 미종료 `/*`를 두 마스킹 진입점이 다르게 다룬다.** `maskComments`(블록+라인)는 EOF까지 마스킹하고, `maskBlockComments`(블록 전용)는 평문으로 남긴다. 후자는 `parseUniforms` → 노드 포트 표면을 만들기 때문 — EOF 마스킹을 적용하면 `/*`를 치는 순간(닫기 전) 포트가 전멸하고 `pruneEdgesForNode`가 유니폼 엣지를 **삭제**하며, `*/`를 마저 쳐도 포트만 돌아오고 엣지는 안 돌아온다. 잠정적·구문 미완성 편집이 그래프 상태를 파괴해선 안 된다는 판단. 가드: `stripComments.test`, `uniformParser.test`, `edgePrune.test`.
- **L2. 내장 struct 정의의 안쪽 멤버 이름은 수집하지 않는다.** `struct Outer { struct Inner { … } i; }` 형태. GLSL ES가 내장 struct 정의를 금지하므로 애초에 컴파일되지 않는다.
- **L3. 줄바꿈으로 분리된 멤버 접근(`light\n  .color`)은 dot 가드가 감지하지 못한다.** 가드는 현재 라인 안만 뒤로 훑는다.
- **L4. `pendingAddedIds`의 "교체" 의미론은 현재 추가 경로 좌표에 기댄다.** 접힌 패널에서 두 노드를 추가하면 최신 것만 프레이밍하는데, 앱의 모든 추가 경로가 원점 근처 고정 좌표라 최신 것을 프레이밍하면 이전 것도 함께 들어온다(실측). **좌표가 멀리 떨어질 수 있는 추가 경로(커서 위치 붙여넣기, 스크립트/플러그인 추가)를 만들면 이 전제가 깨진다** — 함수 docstring에 조치 지침이 있다.
- **L5. compute 노드에서 stage 탭을 눌러도 CM undo 히스토리가 초기화된다.** 문서 내용은 그대로인데 key가 바뀌어 `setState`가 도는 경우다. 회귀는 아니지만 미문서화된 상태 손실이라 F12에 후속으로 올려둠.
- **L6. 단독 `\r`(구 Mac) 개행은 심볼 테이블이 한 줄로 본다.** CodeMirror의 `DefaultSplit`(`/\r\n?|\n/`)은 단독 `\r`를 개행으로 취급하지만 `symbolTable.ts`/`references.ts`의 라인 walk는 그렇지 않다(둘 다 `\n`만 기준). 실측: `"a\rb\rc"`는 CM에서 3줄, `buildSymbolTable`에서는 1줄이 되어 선언 4건 중 1건만 수집된다. F3 수정은 이 동작을 **바꾸지 않는다**(offset 자체는 정확히 유지되므로 소스가 깨지지는 않고, 대신 rename이 조용히 부분 적용된다). CRLF·LF는 이제 정확하므로 실사용 도달 가능성이 매우 낮아 수용한다. **F22(D9) 이후 더 낮아졌다** — 임포트 경로가 단독 `\r`도 `\n`으로 정규화하므로, 이 한계에 닿으려면 `__sp` 훅처럼 sanitize를 우회하는 writer가 필요하다.
- **L7. F21의 가드는 *요청 시점*만 본다 — 무장 후 1프레임 안에 패널이 접히면 여전히 1×1 PNG가 나온다.** `requestSnapshot()`이 거절 판정을 하는 것은 클릭 순간이고, 실제 캡처는 다음 RAF 틱의 `consumeSnapshotRequest()` → `downloadCanvasPng`(`Viewport/index.tsx:547`)다. 그 사이에 접기가 일어나면 같은 틱의 `resize()`가 먼저 캔버스를 1×1로 만든 뒤 캡처가 그것을 읽는다. **창은 최대 1프레임(~16ms)이고, 메뉴 클릭과 레일 접기라는 별개의 포인터 조작 둘을 그 안에 넣어야 하므로 손으로는 사실상 도달 불가능하다.** 닫으려면 캡처 시점에도 크기를 봐야 하는데, 그 코드는 라인 커버리지 0%인 `Viewport/index.tsx` 안이라 새 분기를 가드 없이 늘리게 된다 — 이득보다 비용이 크다고 판단해 수용한다. (F1의 W1 창을 cleanup consume으로 닫은 것과 대비되는데, 그쪽은 플래그가 **다음 마운트까지 시간 제한 없이** 살아남아 성격이 달랐다.)

---

## 4. 열려 있는 후속 작업

라운드 종료 시점에 **검증에서 minor로 남은 것들**이다. 전부 게이트 green 상태이며, 하나도 차단 사유가 아니다. 비용 대비 효과 순으로 묶었다.

### 실제 결함 (작지만 사용자에게 닿음)

| # | 내용 | 위치 |
|---|---|---|
| ~~**F1**~~ | ✅ **해소** — 아래 §2 D7 참조. | `rendererStore.ts` / `AppToolbar.tsx` / `Viewport/index.tsx` |
| **F2** | 원 상태로 무장했던 그룹으로 **되돌아가면 삭제 확인 블록이 다시 무장된 채 표시**된다. 다른 그룹으로 새는 문제는 고쳤지만 원 그룹 복귀는 남았다. `node.id` 변경 시 `confirmingId`를 비우면 닫힌다. | `src/ui/Panels/GroupInspector.tsx` |
| ~~**F3**~~ | ✅ **해소** — 도달 가능으로 실증됐고 offset 산술을 고쳤다. 아래 §3 L6·§4 F22 참조. | `references.ts` / `semanticTokens.ts` |
| **F4** | 접힌 조상 아래의 보이지 않는 그룹이 여전히 유효한 드롭 타깃이다(`groupBoxes`에 `hasCollapsedAncestor` 필터 없음). | `src/ui/NodeEditor/index.tsx` |
| **F5** | 출력 4개 초과 그래프의 **저작·임포트 구멍**이 남아 있다 — `cloneNode`가 MAX_OUTPUTS를 강제하지 않고, `deserializeProject`는 경고만 한다. standalone 플레이어 쪽 클램프만 이번에 넣었다. | `graphStore.ts` / `serialization.ts` |
| **F6** | GIF 레코더에 `visibilitychange` 처리가 없다. 프레임 지연 상한 클램프만 넣었으므로, 탭을 백그라운드로 두고 녹화하면 여전히 짧고 시간이 왜곡된 클립이 나온다. | `src/state/gifRecorder.ts` |
| **F7** | 비디오 로드 중 스크럽은 여전히 반영되지 않는다. `currentTime`만 바뀌면 `isScrubOnly` 분기가 `uniformRev`만 올려 `reconcileExternal`이 돌지 않는 선행 갭. | `src/core/external/registry.ts` |

### 가드 공백 (되돌려도 게이트가 안 잡음)

| # | 내용 |
|---|---|
| **F8** | `#7`의 `plan = emptyPlan(w, h)` catch 폴백 — 지우면 아무 테스트도 실패하지 않는다. `Viewport/index.tsx`를 다시 건드릴 때 명시적 보존 대상. |
| **F9** | `#1(a)`의 보상 dispatch `liveValidate(source)` — 지우면 조용한 기능 퇴화(전환 직후 문서에 진단이 안 붙음). `index.test.tsx`에 스텁 + 디바운스 경과 후 1회 호출 assert로 닫을 수 있다. |
| **F10** | Inspector 기어 버튼의 활성색(`#8`의 세 번째 사이트) — 되돌려도 전체 스위트가 green. |
| **F11** | `#32`의 러닝 커서 — 타입 앵커만 가드된다. `void f(vec3 abc, vec3 c)` 케이스를 추가하면 pin된다. |
| **F12** | `#6` 카메라 구독, `#37`/`#38`의 프로덕션 호출부 — 단위·E2E 어디에서도 가드되지 않는다(아래 §5의 0% 커버리지 파일과 같은 뿌리). |
| **F13** | `#36`의 사용자 가시 목표(탭 ✕ 키보드 조작 가능)는 간접 증명뿐이다 — jsdom이 활성화를 합성하지 못한다. additive E2E 1건이면 닫힌다. |

### 문서·정리 (코드 동작 무관)

| # | 내용 |
|---|---|
| **F14** | `FrameContext.mouse` jsdoc이 `#19` 이후 사실과 다르다 — 이제 ctx로 들어오는 값은 캔버스(플랜) 프레임버퍼 공간이고, 패스 공간 변환은 `bindSystemUniforms`가 축별로 한다. |
| ~~**F15**~~ | ✅ **해소** — F3가 고친 `lineStart` 근거 주석이 바로 그 줄이라 재작성하며 함께 사라졌다. |
| **F16** | `Architecture.md`의 `u_frame` (float) 서술이 int 선언도 합법이 된 새 동작을 반영하지 못한다. |
| **F17** | `fakeGl`의 `FLOAT_VEC4` 상수가 어디서도 읽히지 않는다. |
| **F18** | 길이 1 배열에서 int 경로와 float 경로가 다르게 동작한다(`setTypedUniform`은 `case 1` 처리, `setUniform`은 no-op). 실사용 도달 가능성은 낮으나 어느 쪽으로 맞출지 명시 필요. |
| **F19** | B8이 제거한 동작을 E2E 스펙 헤더 주석이 여전히 설명한다. |
| **F20** | `editorNode.ts`는 'import 0건 store-free leaf'가 아니다(스토어를 직접 import). 순환은 0건이고 `rename.ts`가 이미 두 스토어를 import하므로 도달 가능성은 늘지 않았지만, 원래 의도한 미래 보증은 성립하지 않는다. |

### F1·F3 처리 중 적대적 검증이 새로 찾은 것

F1/F3 자체는 해소됐다. 아래는 그 과정에서 **실증까지 끝났지만 두 항목의 범위 밖**이라 손대지 않았던 선행 결함들로, **이번 라운드에서 셋 다 해소**했다(§2 D8·D9 참조).

| # | 내용 | 위치 |
|---|---|---|
| ~~**F21**~~ | ✅ **해소** — 접힌 레일/최대화된 형제 뒤의 Viewport에서 Snap PNG가 1×1 PNG를 내려받던 문제. `requestSnapshot()`이 `canvasSize` 양축 1을 거절하고 툴바가 사유별 문구로 보고한다. 착수 전 E2E로 **실제 1×1 PNG가 떨어지는 것을 실측**한 뒤 고쳤다. 상세는 §2 **D8**. | `rendererStore.ts` · `AppToolbar.tsx` |
| ~~**F22**~~ | ✅ **해소** — 스토어 CRLF가 그래프 redo 스택을 영구히 파괴하던 문제. `safeShaderSource`가 임포트 경계에서 CM과 같은 규칙으로 개행을 정규화한다. **사용자 합의를 받고** 진행했다(임포트 의미론 변경). 착수 전 런타임 trace로 `future` 소멸을 실측했다. 상세는 §2 **D9**. | `projectSanitize.ts` |
| ~~**F23**~~ | ✅ **해소(F22에 흡수)** — "스토어의 개행이 스테이지별로 갈린다"는 전제 자체가 사라졌다. 프로덕션에서 셰이더 소스를 쓰는 곳은 `CodeEditor`(CM 유래 LF)와 `rename.ts`(스토어 파생)뿐이므로, 임포트가 LF로 정규화되면 스토어는 LF 단일이 된다. `writeUniformHints`의 `join("\n")`도 이제 no-op 재작성이다. `rename.test.ts`가 고정하던 CRLF 비대칭은 **삭제하지 않고** 의미를 다시 붙였다 — sanitize를 우회하는 writer(`__sp` 훅 등)에 대한 방어로 남는다. | `uniformParser.ts` · `rename.ts` |

---

## 5. 상시 주의사항

### 번들 게이트는 반드시 Node 22로 잰다

로컬 Node 26은 zlib **1.2.12**, CI가 `.nvmrc`로 고정하는 Node 22는 zlib **1.3.1**이다. 같은 dist·같은 level 9에서 **약 1.8 KiB** 벌어진다 — 로컬 PASS는 CI green의 근거가 아니다. 이번 라운드에서 "여유 4 KiB"로 알던 값이 실제로는 1.02 KiB였고, 이전 라운드들의 "measured … locally" 수치도 전부 같은 오류였다.

`scripts/check-bundle-size.mjs`가 실행 Node major와 `.nvmrc` 불일치를 경고하도록 고쳐 뒀다. 한도 상향 이력과 사유도 그 파일 헤더에 있다.

측정 절차(스크립트 헤더에도 있음): `npm i --prefix <tmp> node@22` → 그 바이너리로 이미 빌드된 dist에 대해 스크립트를 돌린다.

**현재 수치(Node 22 실측):** 한도 396 KiB. F1·F3 직전 main = **394.85 KiB**, F1·F3 반영 후 = **395.02 KiB**(+0.17 KiB, 토스트 문자열 2개 + `ready` 가드), **F21·F22·F23 반영 후 = 395.12 KiB**(+0.10 KiB — 토스트 문구 1개 + `canvasSize` 가드 + 개행 정규화 1줄. 한글 문자열은 gzip이 잘 먹어 raw 증가분보다 훨씬 적게 든다). 남은 여유 **0.88 KiB**. 참고로 같은 dist를 로컬 Node 26으로 재면 약 1.9 KiB 낙관적으로 나온다 — 여유가 1 KiB 아래인 지금은 **로컬 수치로 판단하면 확실히 틀린다**.

⚠ **다음 라운드는 여유 0.88 KiB에서 시작한다.** 사용자 가시 문자열을 하나만 더 늘려도 넘칠 수 있다. 넘치면 한도를 올리지 말고 보고할 것.

### 단위 가드가 없는 파일

`src/ui/Viewport/index.tsx`와 `src/ui/KeyboardShortcuts.tsx`는 **라인 커버리지 0%**다. 이 파일들을 건드리는 변경은 게이트가 사실상 검증하지 못하므로 E2E나 수동 확인에 의존해야 한다. `src/ui/NodeEditor/index.tsx`는 이번 라운드에서 `index.test.tsx`가 생겨 해소됐다.

F1(D7)에서 쓴 우회 패턴: **불변식을 스토어로 내리고**(`rendererStore.test`가 원샷·두 창을 고정) **호출부를 별도로 테스트하고**(`AppToolbar.test`) **배선만 additive E2E로 덮는다**. F21(D8)도 같은 3층으로 덮었고, 세 층이 **각각 독립적으로 red**임을 확인했다(스토어 가드만 되돌리면 스토어 4건+호출부 1건이 깨지고, 툴바 분기만 되돌리면 호출부 1건이 깨진다). Viewport 안의 cleanup 한 줄은 여전히 단위 커버리지가 0이므로 E2E가 유일한 가드다 — 그 스펙(`phase-11`의 "Snap PNG with the Viewport panel closed")은 **수정 전 코드에서 실제로 빨간지 확인한 뒤** 커밋했다(다운로드 0건 단언이 헛단언이 아님을 실측: 미수정 빌드에서 PNG가 실제로 떨어진다). 이 영역에 스펙을 추가할 때 같은 절차를 밟을 것.

### 게이트를 통과하면서 런타임에서 틀리는 패턴

이번 라운드에서 두 번 겪었고, 둘 다 순수 헬퍼는 옳은데 **호출부가 잘못된 입력을 먹이는** 형태라 단위 테스트로 안 잡혔다.

1. React Flow의 `internal.measured`는 effect의 rAF 시점에 **항상 `undefined`**다 — ResizeObserver 콜백이 rAF 이후에 전달되기 때문. 예외용으로 둔 대체 크기가 사실상 유일 경로가 됐다. 카드 크기는 `measured` → 마운트된 DOM의 `offsetWidth/Height`(React Flow 자신이 재는 것과 동일) → 최후 대체값 순으로 해석해야 한다.
2. 새로 추가한 E2E 스펙이 **단독 실행 시 50% 플레이크**였는데 파일 전체로 돌리면 숨었다. 원인은 정착 판정기가 "변화가 시작됐다"는 양성 신호 없이 동일값 2회만 보고 판단한 것 — `MOTION_MAX_MS`가 150ms뿐이라 첫 움직임이 두 번째 샘플 이후면 fit 이전 값이 "정착"으로 잡힌다. 애니메이션되는 값을 샘플링해 셋업을 만들지 말 것.

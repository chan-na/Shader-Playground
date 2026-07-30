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

---

## 3. 의도적으로 수용한 한계

- **L1. 미종료 `/*`를 두 마스킹 진입점이 다르게 다룬다.** `maskComments`(블록+라인)는 EOF까지 마스킹하고, `maskBlockComments`(블록 전용)는 평문으로 남긴다. 후자는 `parseUniforms` → 노드 포트 표면을 만들기 때문 — EOF 마스킹을 적용하면 `/*`를 치는 순간(닫기 전) 포트가 전멸하고 `pruneEdgesForNode`가 유니폼 엣지를 **삭제**하며, `*/`를 마저 쳐도 포트만 돌아오고 엣지는 안 돌아온다. 잠정적·구문 미완성 편집이 그래프 상태를 파괴해선 안 된다는 판단. 가드: `stripComments.test`, `uniformParser.test`, `edgePrune.test`.
- **L2. 내장 struct 정의의 안쪽 멤버 이름은 수집하지 않는다.** `struct Outer { struct Inner { … } i; }` 형태. GLSL ES가 내장 struct 정의를 금지하므로 애초에 컴파일되지 않는다.
- **L3. 줄바꿈으로 분리된 멤버 접근(`light\n  .color`)은 dot 가드가 감지하지 못한다.** 가드는 현재 라인 안만 뒤로 훑는다.
- **L4. `pendingAddedIds`의 "교체" 의미론은 현재 추가 경로 좌표에 기댄다.** 접힌 패널에서 두 노드를 추가하면 최신 것만 프레이밍하는데, 앱의 모든 추가 경로가 원점 근처 고정 좌표라 최신 것을 프레이밍하면 이전 것도 함께 들어온다(실측). **좌표가 멀리 떨어질 수 있는 추가 경로(커서 위치 붙여넣기, 스크립트/플러그인 추가)를 만들면 이 전제가 깨진다** — 함수 docstring에 조치 지침이 있다.
- **L5. compute 노드에서 stage 탭을 눌러도 CM undo 히스토리가 초기화된다.** 문서 내용은 그대로인데 key가 바뀌어 `setState`가 도는 경우다. 회귀는 아니지만 미문서화된 상태 손실이라 F12에 후속으로 올려둠.

---

## 4. 열려 있는 후속 작업

라운드 종료 시점에 **검증에서 minor로 남은 것들**이다. 전부 게이트 green 상태이며, 하나도 차단 사유가 아니다. 비용 대비 효과 순으로 묶었다.

### 실제 결함 (작지만 사용자에게 닿음)

| # | 내용 | 위치 |
|---|---|---|
| **F1** | Viewport가 마운트되지 않은 상태에서 스냅샷을 요청하면 플래그만 켜진 채 남아, **다음 Viewport 마운트 때 예고 없이 PNG가 다운로드**된다. 컨텍스트 손실 경로에는 드롭+토스트를 넣었지만 언마운트 경로가 빠졌다. 효과 cleanup에서 요청을 소비/해제하면 된다. | `src/ui/Viewport/index.tsx` |
| **F2** | 원 상태로 무장했던 그룹으로 **되돌아가면 삭제 확인 블록이 다시 무장된 채 표시**된다. 다른 그룹으로 새는 문제는 고쳤지만 원 그룹 복귀는 남았다. `node.id` 변경 시 `confirmingId`를 비우면 닫힌다. | `src/ui/Panels/GroupInspector.tsx` |
| **F3** | `findReferences`가 **CRLF 소스에서 라인당 1씩 offset이 어긋난다.** 이번 라운드가 만든 것이 아니라 선행 결함으로, B4 검증 중 발견됐다. rename 편집 범위가 그 offset을 쓰므로 CRLF 파일에서는 rename이 어긋난다. | `src/core/glsl/references.ts` |
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
| **F15** | `semanticTokens.ts`에 삭제된 `stripBlockComments`를 가리키는 죽은 참조 주석이 남았다(1줄). |
| **F16** | `Architecture.md`의 `u_frame` (float) 서술이 int 선언도 합법이 된 새 동작을 반영하지 못한다. |
| **F17** | `fakeGl`의 `FLOAT_VEC4` 상수가 어디서도 읽히지 않는다. |
| **F18** | 길이 1 배열에서 int 경로와 float 경로가 다르게 동작한다(`setTypedUniform`은 `case 1` 처리, `setUniform`은 no-op). 실사용 도달 가능성은 낮으나 어느 쪽으로 맞출지 명시 필요. |
| **F19** | B8이 제거한 동작을 E2E 스펙 헤더 주석이 여전히 설명한다. |
| **F20** | `editorNode.ts`는 'import 0건 store-free leaf'가 아니다(스토어를 직접 import). 순환은 0건이고 `rename.ts`가 이미 두 스토어를 import하므로 도달 가능성은 늘지 않았지만, 원래 의도한 미래 보증은 성립하지 않는다. |

---

## 5. 상시 주의사항

### 번들 게이트는 반드시 Node 22로 잰다

로컬 Node 26은 zlib **1.2.12**, CI가 `.nvmrc`로 고정하는 Node 22는 zlib **1.3.1**이다. 같은 dist·같은 level 9에서 **약 1.8 KiB** 벌어진다 — 로컬 PASS는 CI green의 근거가 아니다. 이번 라운드에서 "여유 4 KiB"로 알던 값이 실제로는 1.02 KiB였고, 이전 라운드들의 "measured … locally" 수치도 전부 같은 오류였다.

`scripts/check-bundle-size.mjs`가 실행 Node major와 `.nvmrc` 불일치를 경고하도록 고쳐 뒀다. 한도 상향 이력과 사유도 그 파일 헤더에 있다(현재 396 KiB, 여유 약 1.15 KiB).

### 단위 가드가 없는 파일

`src/ui/Viewport/index.tsx`와 `src/ui/KeyboardShortcuts.tsx`는 **라인 커버리지 0%**다. 이 파일들을 건드리는 변경은 게이트가 사실상 검증하지 못하므로 E2E나 수동 확인에 의존해야 한다. `src/ui/NodeEditor/index.tsx`는 이번 라운드에서 `index.test.tsx`가 생겨 해소됐다.

### 게이트를 통과하면서 런타임에서 틀리는 패턴

이번 라운드에서 두 번 겪었고, 둘 다 순수 헬퍼는 옳은데 **호출부가 잘못된 입력을 먹이는** 형태라 단위 테스트로 안 잡혔다.

1. React Flow의 `internal.measured`는 effect의 rAF 시점에 **항상 `undefined`**다 — ResizeObserver 콜백이 rAF 이후에 전달되기 때문. 예외용으로 둔 대체 크기가 사실상 유일 경로가 됐다. 카드 크기는 `measured` → 마운트된 DOM의 `offsetWidth/Height`(React Flow 자신이 재는 것과 동일) → 최후 대체값 순으로 해석해야 한다.
2. 새로 추가한 E2E 스펙이 **단독 실행 시 50% 플레이크**였는데 파일 전체로 돌리면 숨었다. 원인은 정착 판정기가 "변화가 시작됐다"는 양성 신호 없이 동일값 2회만 보고 판단한 것 — `MOTION_MAX_MS`가 150ms뿐이라 첫 움직임이 두 번째 샘플 이후면 fit 이전 값이 "정착"으로 잡힌다. 애니메이션되는 값을 샘플링해 셋업을 만들지 말 것.

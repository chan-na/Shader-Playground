# 스펙 — 노드 그래프 · 노드 종류

> React Flow 그래프 GUI·Parameter/유틸 노드·Multi-Output·노드 복제·다중 선택·그룹 관련 Phase 본문.
> 인덱스(Phase 번호 → 현재 동작 · E2E 스펙 · 파일)는 [SPEC.md](../../SPEC.md)에 있다. 아래 본문은 Phase 작성 당시 기록을 그대로 옮긴 것이며, 이후 Phase가 덮어쓴 내용은 인덱스의 "현재 동작" 열이 우선한다.

### Phase 5 — 노드 그래프 GUI + 노드 썸네일
- React Flow 통합, MeshNodeView/ImageNodeView/ShaderNodeView/**OutputNodeView** 커스텀 노드.
- Toolbar의 노드 팔레트에 Output 노드 포함, 사용자가 명시적으로 배치.
- `isValidConnection`으로 포트 타입 검증, 사이클 차단, **Output 2개 이상 차단**.
- graphStore ↔ React Flow 양방향 동기화.
- 선택 노드의 GLSL이 CodeEditor에 로드되고, 유니폼 컨트롤이 우측 Inspector에 자동 노출되도록 셀렉션 연동.
- `core/thumbnail/*` 구현, ShaderNode/ImageNode 카드 내부 라이브 썸네일 동작.
- **검증**: GUI에서 노드 생성/연결/삭제만으로 Phase 4 시나리오 재현. Output을 빼면 placeholder, 다시 꽂으면 즉시 출력. 모든 ShaderNode 카드에 Blender처럼 라이브 썸네일이 표시된다.

### Phase 10 — 표현력 확장 (완료)
- **Parameter 노드** 4종: `Float` / `Vec3` / `Color` / `Time`. Time은 `simTime × scale + offset` 으로 매 프레임 재평가되어 단일 float 출력. 인스펙터에서 값/레이블 편집.
- **셰이더의 비-샘플러 uniform**도 입력 포트로 노출 (`float`/`vec2`/`vec3`/`vec4`). 동일 이름 핸들에 파라미터 노드를 연결하면 인스펙터 값 대신 파라미터가 매 프레임 uniform 을 덮어씀.
- **포트 타입 확장**: 기존 `mesh`/`texture`에 `float`/`vec2`/`vec3`/`vec4` 추가. React Flow `isValidConnection`에서 동일 타입만 허용.
- **Multi-Output**: 그래프당 1~4개 Output 노드 허용. 분할 뷰포트 레이아웃(1=전체, 2=좌우, 3=상단2+하단1, 4=2×2). `splitLayout()` 단위 테스트.
- **Blend 셰이더 템플릿**: 두 sampler 입력 + `u_mix` + `u_mode`(0=mix, 1=add, 2=multiply, 3=screen). 툴바와 팔레트에서 1클릭으로 추가.
- **AssetBrowser 탭**: 메시/이미지 카탈로그 + 썸네일, 'Forget' 버튼, '+ Node' 버튼으로 즉시 그래프에 추가.
- **Split 데모 프리셋**: noise→blur→tonemap 체이닝의 각 단계를 동시에 보여주는 3-Output 예제.
- **검증**: Color 파라미터를 sphere의 `u_baseColor`에 연결하면 인스펙터 슬라이더 무시하고 파라미터 색이 적용됨. Split 프리셋 로드 시 캔버스가 3분할로 동시 렌더.

### Phase 12 — 회복성·표현력 보강 (완료)
- **ProblemsPanel → CodeEditor 라인 점프**: Problems 항목 클릭 시 노드 선택 + vertex/fragment 탭 전환 *에 더해* CodeMirror 가 해당 라인으로 스크롤(가운데 정렬) + 커서 이동 + 포커스까지 수행. `editorStore.jumpRequest`에 rev 카운터를 포함해 동일 라인을 두 번 눌러도 두 번째 클릭이 다시 발화한다. 점프는 effectiveId·stage 가 요청과 일치할 때만 일어나 stage 전환 직후의 doc 교체와 경합하지 않는다.
- **Auto-save + 세션 복구**: 그래프 구조 rev 가 바뀌면 30 초 디바운스로 직렬화된 프로젝트 JSON 을 IndexedDB(`shader-playground-session/session/autosave`) 에 저장. 다음 부트 때 저장본이 있으면 모달 다이얼로그로 "이전 작업을 복구할까요?" 를 표시 — 백업 시각·노드 수 표시, [복구]/[새로 시작] 2 버튼. share 해시(`#share=...`) 가 있으면 백업을 의도적으로 무시 + 삭제(공유 URL 이 복구보다 우선). bootstrap rev 와 lastSavedRev 가 같으면 데모 그래프 자체는 저장되지 않으므로 첫 클린 부팅에서는 다이얼로그가 뜨지 않는다.
- **GLSL 주석 힌트 확장**: 기존 메타 키(`@range/@min/@max/@step/@default/@label`)에 더해 **컨트롤 종류 오버라이드** 키 도입.
  - `// @color`: vec3/vec4 에 강제로 컬러 피커. 이름이 `*Color` 가 아니어도 작동. 이전 추론이 다축 슬라이더였다면 범위를 `0..1`, 디폴트를 흰색 벡터로 자동 승격(사용자가 `@default` 를 같이 지정하면 그 값이 우선).
  - `// @slider`, `// @multi`: 컬러 추론을 되돌리거나, 컬러 → 다축 슬라이더로 강제. sampler/matrix/bool 타입에는 적용되지 않는다.
  - 동일 토큰이 여러 번 등장하면 마지막이 이김(예: `@color @slider` → slider).
  - 원칙: **명시적 주석이 이름 패턴 추론보다 항상 우선** (초기 SPEC 초안의 후행 메모를 본격 채택 — 현재 힌트 규약은 [Architecture.md §4.5](../../Architecture.md#45-유니폼-자동-노출-srccoregraphuniformparserts)).
- **Math/Swizzle/Combine 유틸 노드**: [Architecture.md §2.1](../../Architecture.md#21-노드와-포트) 노드 표에 추가된 세 종류의 CPU 평가 노드. ShaderNode 비-샘플러 uniform 입력에 연결되어 프레임마다 평가되고, 그 결과로 uniform 을 덮어쓴다. CommandPalette 에 `Add Math: <op>` × 8, `Add Swizzle: .<mask>` × 8 프리셋, `Add Combine: Float×N → vec N` × 3 등록.
- **썸네일 readback PBO 비동기화**: 기존 `gl.readPixels` 동기 호출을 WebGL2 PBO + `fenceSync` 로 교체. 매 프레임 `clientWaitSync(timeout=0)` 로 완료된 슬롯만 `getBufferSubData`→다운샘플→`scheduler.commit`. 미완료 슬롯은 그대로 유지되므로 메인 스레드 stall 이 사라진다(N 프레임 지연 허용). 노드당 in-flight 1건, 컴파일로 사라진 노드는 PBO 해제. 96×96 해상도, 10 Hz throttle 그대로 유지.
- **검증**: Vitest 추가 51건(`asyncReadback` 8, `autoSave` 7, `editorStore` 3, `utility` 25, `uniformParser` +8, 합계 182 통과). Chrome 자동화로 (a) Problems 항목 클릭 → 정확한 라인 활성화, (b) 자동저장 → 리로드 → 복구 다이얼로그 양 경로, (c) `@color` 가 컬러 피커로 즉시 전환, (d) Param→Math→Combine→Swizzle 체인이 sphere 색을 변경, (e) Chain 프리셋(3 노드)의 96×96 썸네일 라이브 갱신을 확인.

### Phase 20 — 노드 복제 (Cmd/Ctrl+D) (완료)
노드 에디터 편집 생산성 향상. 선택한 노드를 한 키로 복제.
- **store**: `graphStore.cloneNode(id)` — `structuredClone` 으로 노드를 깊은 복사하고 `nextId(kind)` 로 새 id 부여, 원본 위치에서 (+40, +40) 오프셋. 들어오는/나가는 **엣지는 복제하지 않는다**(독립 노드로 시작). `pushHistory` + 구조 rev 증가라 undo/재컴파일 정상. 알 수 없는 id 면 `null` 반환.
- **단축키**: `KeyboardShortcuts.tsx` 에 `Cmd/Ctrl+D` 추가 — 편집 대상(input/CodeMirror)에 포커스가 있으면 무시(에디터 멀티커서 보존), 그 외에는 `selectionStore.selectedNodeId` 를 복제하고 선택을 새 노드로 이동(Inspector/CodeEditor 가 즉시 따라감). 선택이 없으면 no-op.
- **검증**: Vitest `graphStore.test` — 깊은 복사(클론 변형이 원본 불변)·엣지 미복제·오프셋·rev 증가·미지 id null. Playwright E2E `phase-20-node-duplicate.spec.ts` — Cmd+D 로 노드 수 +1, 선택이 클론으로 이동, 엣지 불변, 위치 오프셋 확인 + 무선택 no-op.

### Phase 23 — 다중 선택 편집 (완료)
`selectionStore` 는 이미 `selectedNodeIds` 집합을 보관하고 박스 선택(Shift+드래그)·다중 드래그·다중 삭제(Backspace/Delete)는 React Flow 가 네이티브로 처리하고 있었다. 남아 있던 단일 선택 가정 — 화살표 이동·전체 선택·Inspector 표시 — 을 마무리.
- **화살표 이동**: `graphStore.nudgeNodes(ids, dx, dy)` 가 선택 노드들의 position 을 일괄 평행이동(드래그와 동일하게 `rev`/history 미변경 — position 은 비구조적). `KeyboardShortcuts` 가 ↑↓←→ 를 받아 선택 전체를 한 step(10px, Shift 40px) 이동. **React Flow 네이티브 이동과의 충돌 회피**: RF 는 노드/선택박스가 키보드 포커스(`:focus-visible`)일 때 화살표로 선택 전체를 옮기며 `preventDefault` 한다 — 우리 핸들러는 `e.defaultPrevented` 가 true 면 양보하고, 아무것도 포커스되지 않은(마우스 선택 직후 등) 경우에만 직접 이동.
- **전체 선택**: `Cmd/Ctrl+A` 가 모든 노드를 선택(`setSelectedIds`). 텍스트 입력/CodeMirror 포커스 시에는 네이티브 select-all 보존.
- **Inspector 다중 선택 인지**: 2개 이상 선택 시 `data-testid="multi-select-banner"` 배너로 "N nodes selected · editing <primary>" 표시. 아래 편집 컨트롤은 여전히 primary(마지막 선택 id, `selectedNodeId`)에만 적용됨을 명시.
- **검증**: Vitest `graphStore.test` — `nudgeNodes` 가 나열된 노드만 평행이동·미나열 노드 불변·`rev`/history 불변·미지 id·no-op delta 무시. Playwright E2E `phase-23-multi-select.spec.ts` 4건 — (a) 화살표로 선택 쌍이 같은 방향·같은 delta 로 이동하고 비선택 노드는 불변, (b) 무선택 화살표 no-op, (c) Cmd+A 전체 선택, (d) Inspector 배너가 단일 선택엔 없고 다중 선택에 카운트·primary 표시.

### Phase 29 — 노드 그룹 (자식 hierarchy) (완료)
큰 그래프의 시각적 분할·일괄 이동을 위해 *부모-자식 관계* 를 갖는 그룹 노드를 도입. 그룹은 순수 편집기 레이어 — `ExecutionPlan` / 렌더 파이프라인은 group 노드를 완전히 무시하므로 다른 페이즈의 회귀가 0.
- **새 노드 종류 `group`**: `{ id, kind:'group', label, color?, width, height }`. 포트 0개, edges 가 그룹을 가리킬 일 없음. 그룹의 *자식* 관계는 노드 필드가 아니라 `graphStore.parents: Record<childId, parentGroupId>` 로 별도 보관 — positions 와 동형의 보조 컬렉션이라 직렬화·undo 가 자연스럽게 따라온다.
- **좌표 모델 — 부모 상대 (`core/graph/parents.ts`)**: positions 는 React Flow native 모델과 일치하게 *부모 상대* 로 저장. top-level 노드는 절대. `getAbsolutePosition / relativePositionFor / wouldCreateParentCycle / orderParentsBeforeChildren` 헬퍼가 변환·검증·노드 정렬을 담당. `setParent / removeGroup(release-children) / removeNode(group)` 가 reparent 시 자식의 절대 좌표를 보존하도록 position 을 재계산한다.
- **`graphStore` 액션**: `addGroup(label, absolutePosition, size, options?)` / `setParent(childId, newParentId | undefined)` (cycle 거부 시 false) / `groupSelected(ids)` (선택의 bounding box 로 그룹 크기·위치 산정, 공통 부모 자동 상속 → 중첩 그룹 자연 형성) / `removeGroup(id, mode)` (`delete-children` cascade vs `release-children` promote-to-grandparent) / `setGroupLabel / setGroupColor / setGroupSize` (size 는 high-frequency drag handle 이라 history/rev 미반영). `removeNode` 도 사라진 부모의 직접 자식들의 좌표를 절대 좌표로 승격.
- **검증·컴파일·실행 무영향**: `validate.ts` 는 group 을 절대 못 본다(edges/cycle 검사는 edges 기반, multiple_outputs 는 kind === 'output' 만 카운트). `compile.ts` 의 모든 분기가 명시적 kind 체크 — group 은 어떤 패스도 만들지 못함. `standalonePlayer.js` 도 모든 filter 가 명시적 kind 매칭이라 group 이 export 에 들어가도 무시.
- **React Flow 통합 (`NodeEditor/index.tsx` + `GroupNodeView.tsx`)**: 자식 노드는 `parentId` 만 emit 하고 `extent: 'parent'` 는 일부러 제외 — 자식을 다른 그룹으로 끌어내거나 top-level 로 풀어줄 수 있도록 드래그를 허용하고, `onNodeDragStop` 이 새 절대 좌표로 reparent 결정. group 노드는 `NodeResizer` 로 in-place 리사이즈(드래그 종료 시 `setGroupSize`). 카드 색은 `color` 필드 + 기본 슬레이트 톤. MiniMap 에도 group 색상 등록.
- **다중 선택 → 그룹화**: 새 단축키 **Cmd/Ctrl+G** (`KeyboardShortcuts.tsx`) — selectionStore 의 `selectedNodeIds.length >= 2` 일 때 `groupSelected` 호출하고 새 그룹을 primary 선택으로 이동. CommandPalette 도 `Group selected nodes` / `Add Group (empty container)` 항목 추가. 텍스트 입력/CodeMirror 포커스 시 단축키는 양보(브라우저 "찾기" Cmd+G 보존).
- **중첩 그룹 (그룹 안의 그룹)**: React Flow 는 native 로 nested groups 지원 — `parentId` 가 그룹이든 일반 노드든 같은 메커니즘. `setParent` 가 parentId chain 의 cycle 을 별도 헬퍼(`wouldCreateParentCycle`)로 거부. `groupSelected` 가 *common parent* 를 감지해 새 그룹을 그 부모의 자식으로 자동 배치(외부 그룹 안에 더 작은 그룹이 자연스럽게 생성됨).
- **삭제 모드 — Inspector 다이얼로그**: `GroupInspector` 의 두 버튼 — "Ungroup (keep children)" 은 `release-children` 으로 자식을 한 단계 위(grandparent 또는 top-level)로 승격하고 절대 좌표 보존, "Delete with children…" 은 확인 다이얼로그 후 `delete-children` 으로 descendants + 관련 edges 까지 cascade 제거. Backspace 로 group 만 삭제하는 기본 경로는 자식 orphan(absolute 좌표 유지) 동작.
- **직렬화 (`state/serialization.ts`)**: `SerializedProject` 에 옵셔널 `parents` 필드 추가 — Phase 28 이전 share URL 은 필드가 없어도 정상 로드(빈 객체로 폴백). deserialize 시 parents map 의 unknown id / self-cycle / 깊은 chain 을 sanitize 단계에서 제거(`MAX_DEPTH = 64`). autoSave / shareUrl / Toolbar export 모두 parents 를 함께 라운드트립.
- **검증**: Vitest 단위 25 건 추가 — `parents.test.ts` (16: getAbsolutePosition·wouldCreateParentCycle·parentDepth·directChildren·allDescendants·relativePositionFor), `graphStore.test.ts` (14: addGroup / setParent 절대좌표 보존 / cycle 거부 / 그룹 해제 / 중첩 / common parent 상속 / removeGroup 두 모드 / setGroupLabel/Color/Size / removeNode orphan 절대좌표), `compile.test.ts` (+1: group 있어도 ExecutionPlan 동일), `validate.test.ts` (+2: group 무시 + topological order 통과), `serialization.test.ts` (+4: parents round-trip / 알 수 없는 id 드롭 / cycle 거부 + warning / 누락 필드 backward compat), `htmlExport.test.ts` (+1: standalonePlayer 의 어느 filter 도 group 매칭 안 함 — 회귀 가드). Playwright E2E `phase-29-node-groups.spec.ts` 3 건 — (a) Cmd+G 키바인딩으로 선택 그룹화 + 새 그룹 primary 선택, (b) 그룹 있는 그래프 렌더 루프 회귀 없음 (`renderTick` 증가 + `errors` 비어있음), (c) Cmd+Z 가 cross-stage 와 동일하게 single-undo 로 그룹 생성 전 상태 복원. `addGroup` 의 id 접두사 / rev / parents, `groupSelected` 의 parent 할당 + 자식 좌표의 그룹 상대 변환, `setParent` cycle 거부 반환값 + parents 불변, `delete-children` cascade(그룹 밖 노드 생존 포함), 중첩 그룹 부모 상속·`release-children` 절대 좌표 보존은 위 `graphStore.test.ts` 가 담당.
- **비범위 (Out of scope — 별도 백로그)**: 그룹 z-order 명시 조정, share URL 의 group 색상 다양화 UI(현재 Inspector 컬러 픽커만 — 키바인딩이나 프리셋 팔레트 없음). (collapse/expand 와 헤더 더블클릭 라벨 인라인 편집은 Phase 30 에서 구현됨.)

### Phase 30 — 그룹 collapse/expand (완료)
Phase 29 노드 그룹의 후속. 큰 그래프를 접어 화면을 정리하는 collapse/expand 와 헤더 라벨 인라인 편집을 추가. Phase 29 와 동일하게 **순수 편집기 레이어** — `ExecutionPlan` / 렌더 파이프라인은 group 을 여전히 완전히 무시하므로 회귀 0.
- **새 필드 `GroupGraphNode.collapsed?: boolean`**: 노드 종류 필드(label/color/width/height 와 동형). 생략 ⇒ 펼침 — 기존 저장본/share URL 무손상. `cloneGraphNode`(직렬화) 와 `projectSanitize`(역직렬화, `collapsed === true` 만 채택) 가 라운드트립. 접힘은 `width × GROUP_COLLAPSED_HEIGHT`(헤더만) 로 렌더되고 *원본 height 는 보존* 되어 펼칠 때 복원.
- **`graphStore.toggleGroupCollapsed(id)`**: 구조-tier setter (rev + history push) — undo 가능 + autoSave 가 rev 변화로 영속. recompile 은 group 을 무시하므로 no-op. group 이 아니거나 미지 id 면 무시.
- **자식 숨김 (`core/graph/parents.ts` 의 `hasCollapsedAncestor`)**: 순수 헬퍼 — 부모 체인을 따라 collapsed 그룹 조상이 있으면 true(자기 자신은 제외, cycle-safe MAX_DEPTH 캡). `NodeEditor` 의 `rfNodes` 가 이 결과로 `hidden: true` 를 세팅 → React Flow 가 노드 + 연결 엣지를 DOM 에서 제거. 중첩 그룹도 조상 워크로 자연 처리. `onNodeDragStop` 의 드롭 히트박스도 접힌 그룹은 헤더 높이로 제한.
- **GroupNodeView UI**: 헤더에 collapse 토글 chevron(▸/▾) 버튼, 접힘 시 자식 수 `(N)` 표시, 접힘 시 `NodeResizer` 숨김. 라벨 버튼 더블클릭(React Flow 드래그가 native dblclick 을 삼켜 클릭 타이밍으로 자체 검출) → 인라인 input(Enter 커밋 / Escape 취소 / blur 커밋). 라벨 버튼은 키보드 접근(Enter/Space)도 지원.
- **검증**: Vitest 단위 — `graphStore.test`(toggle 플립 + rev/history + 비그룹/미지 id no-op), `parents.test`(`hasCollapsedAncestor` 직접/조상/없음/자기제외/cycle), `serialization.test`(collapsed 라운드트립 + 펼침은 필드 생략). Playwright E2E `phase-30-group-collapse.spec.ts` 5 건 — (a) collapse 가 자식을 DOM 에서 숨기고 expand 가 복원(비그룹 o1 불변), (b) 헤더 chevron 버튼 토글, (c) 사전 접힘 그래프 로드가 collapsed 렌더 + 자식 숨김, (d) 헤더 더블클릭 인라인 rename, (e) collapse 후에도 렌더 루프 유지(`renderTick` 증가 + `errors` 비어있음). store toggle 플립 + rev 는 위 `graphStore.test` 가 담당.
- **비범위 (Out of scope — 별도 백로그)**: 그룹 z-order 명시 조정, share URL 의 group 색상 프리셋 팔레트.

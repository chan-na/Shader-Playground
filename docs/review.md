# ShaderPlayground 코드 리뷰

> 대상: `src/**` 전체 (Phase 34 기준, HEAD `ee5d6c0`).
> 방식: 16개 모듈 그룹을 관점별(정확성 / 아키텍처 / 타입 안전성 / 성능 / 중복 / 데드코드 / 테스트 공백)로 리뷰한 뒤, 각 발견을 별도 검증 에이전트가 *반증 시도*(adversarial verify)해 살아남은 항목만 채택했다. read-only 분석이며 이 문서 작성 과정에서 소스는 수정하지 않았다.
> 채택 72건 (Critical 1 · High 7 · Medium 12 · Low 51). 검증 단계에서 반증되어 **제외**된 후보 2건은 문서 끝 "반증되어 제외된 항목" 참고.
> 심각도는 검증 단계에서 조정된 값(예: 브라우저 GC 백스톱·트리거 희소성 고려로 하향)을 반영한다. 확신이 낮은 부분은 "추정" 으로 표시했다.

---

## 요약 — 전반적 코드 건강도

전반적으로 **성숙하고 규율 있는 코드베이스**다. Core 는 React/Zustand 를 모르는 순수 TS 로 유지되고, 순환 의존 0·데드코드 게이트·strict 타입·커버리지 임계치가 실제로 작동하고 있으며, 순수 로직(그래프 컴파일·GIF 인코더·GLSL 정적 분석)은 단위 테스트가 촘촘하다. 발견된 문제 대부분은 **엣지 케이스·복구 경로·GL 리소스 수명주기**에 몰려 있고, 정상 흐름(happy path)의 결함은 드물다.

가장 주목할 축은 세 가지다:

1. **Undo/Redo 서브시스템의 정확성** — `historyStore` 의 undo 는 off-by-one 으로 한 스텝을 건너뛰어 사용자 작업을 소실시킨다(Critical). `suppressNext` 플래그도 다음 편집으로 새어 나가 redo 스택을 오염시킨다(High). 이 영역이 최우선.
2. **WebGL 컨텍스트 손실/복구 경로** — Viewport 는 복구를 정성껏 처리하지만, 모듈 전역 싱글톤 3종(`_composite`, `AsyncThumbnailReadback`, 외부 텍스처 풀)이 복구 시 무효화되지 않아 죽은 GL 핸들을 재사용한다. 렌더 파이프라인의 여러 리소스가 에러 경로/reconcile 경로에서 누수된다.
3. **정적 HTML export 의 코드 드리프트** — `standalonePlayer.js` 가 Core 를 의존성 0 으로 재구현하는 구조라, Core 가 진화하면 export 런타임이 조용히 뒤처진다(유틸 노드 유니폼 오분류, 리사이즈마다 프로그램 누수). export XSS 이스케이프도 불완전.

Low 51건은 대부분 성능 미세 최적화(핫패스 할당/재계산)·리소스 정리 위생·테스트 공백이며, 즉시 위험하진 않으나 누적 가치가 있다.

---

## Critical

### C1. `historyStore.undo()` off-by-one — Undo 가 한 스텝을 건너뛰어 작업을 소실
- **위치**: `src/state/historyStore.ts:58-70` (undo), 연동 `src/state/graphStore.ts` 의 `pushHistory`/`undoGraph`
- **문제**: `undo()` 가 `past` 스택의 top(`past[length-1]`)을 future 로 옮기고 `past[length-2]` 를 복원 대상으로 반환한다. 그러나 `graphStore` 의 모든 뮤테이션은 **변경 직전**에 `pushHistory(get())` 를 호출하므로 `past` 에는 *pre-mutation* 스냅샷만 쌓인다. 따라서 올바른 undo 대상은 top(`past[length-1]`)인데, 코드는 그 한 칸 아래를 되돌린다.
- **근거**(직접 트레이스로 확인): 빈 상태에서 `addNode a`→`addNode b` 시 `past=[{}, {a}]`, live=`{a,b}`. `undo()` 는 `past[0]={}` 를 반환해 live 를 **완전히 비운다**(a·b 둘 다 삭제, 기대값은 `{a}`). 이후 `redo()` 는 `{a}` 만 복원해 `b` 는 영구 소실 → `{a,b}→undo→{}→redo→{a}` 로 항등성이 깨진다. 부트스트랩 직후(데모 로드 후 `history.clear()`, `past=[]`)에는 더 극적이다: 노드 하나 추가 후 첫 Cmd+Z 가 `past.length(1) >= 2` 가 거짓이라 `{nodes:[],…}` 빈 스냅샷을 반환 → **그래프 전체가 지워진다**. `graphStore.test.ts:454` 는 이 동작을 주석으로 명시("undo returns past[length-2] (not the most recent push)")하고 단언을 `nodes.length < 2` 로 약화해 버그를 사실상 인코딩하고 있고, E2E `phase-9` 는 `.length` 만 확인(데모/픽스처 모두 노드 3개)이라 통과한다.
- **제안**: 모델을 바로잡는다 — undo 시 **현재 live 스냅샷**(graphStore 에서 주입)을 future 로 push 하고 `past.pop()`(top)을 복원 대상으로 반환. redo 는 대칭적으로 현재 live 를 past 로 push 하고 `future.shift()` 를 반환. 스토어가 "현재 상태" 를 `past` 의 top 으로 위조할 수 없다는 점이 핵심. 수정 후 `graphStore.test.ts:454`·`469` 의 약화된 단언을 노드 **id 기반** 왕복 단언으로 강화하고, phase-9 E2E 도 id 를 확인하도록 갱신할 것.

---

## High

### H1. `ivec2/3/4` 유니폼이 스칼라 default + `multi` 컨트롤로 매핑돼 Inspector 렌더가 크래시
- **위치**: `src/core/graph/uniformParser.ts:88` (`defaultRangeFor`) ↔ `src/ui/Panels/UniformControl.tsx:44,48`
- **문제**: `defaultRangeFor` 가 벡터 default 를 `type.startsWith("vec")` 로 게이트하는데 `ivec*` 는 `"ivec"` 로 시작해 제외된다. 그래서 `parseUniforms` 는 `ivecN` 에 컨트롤 `"multi"` 를 부여하면서 default 는 스칼라 `0` 이 된다.
- **근거**: `uniform ivec2 u_cells;` 는 sampler/color/matrix/float/int 어디에도 안 걸려 `"multi"` 로 떨어지고, `defaultRangeFor` 는 최종 폴백 `defaultValue:0` 을 반환(`VEC_LEN` 에 ivec 항목이 있는데도). `UniformControl` multi 분기(`arr = Array.isArray(v) ? v : (spec.defaultValue as number[])`)에서 저장값이 없으면 `arr = 0` → `arr.map(...)` 이 `TypeError` 를 던진다. Inspector 는 첫 shader 노드를 자동 선택하므로 셰이더에 `ivec` 유니폼 하나만 선언돼도 재현. `ivecN` 은 `UniformType` union·`VEC_LEN`·autocomplete 에 정식 등록된 지원 타입이다.
- **영향 범위 정정**: 크래시는 `App.tsx` 의 `ErrorBoundary`(NodeEditor/Viewport/CodeEditor/SidePanel 를 감쌈)가 잡으므로 백스크린은 아니지만, **에디터 주요 영역 전체가 폴백 UI 로 대체**된다(단순 Inspector 한정이 아님).
- **제안**: `defaultRangeFor` 에서 `ivec2/3/4` 를 `vecN` 처럼 처리(`VEC_LEN` 으로 N-길이 0 배열 생성), 정수 친화 step 부여. `parseUniforms` 에 ivec 단위 테스트 추가.

### H2. 정적 export 가 `math/swizzle/combine` 유니폼 소스를 sampler 로 오분류
- **위치**: `src/export/standalonePlayer.js:877`
- **문제**: `rebuild()` 가 `param` 노드만 유니폼(paramBinding) 소스로 처리하고, `math/swizzle/combine` 값 노드는 else 분기로 떨어져 texture sampler 로 등록된다. 그 결과 이 노드들이 구동해야 할 유니폼이 export HTML 에서 값을 못 받는다.
- **근거**: Core `compile.ts`(606-623 / 345-355) + `utility.ts resolveValueFor` 는 `param/math/swizzle/combine` 엣지를 모두 paramBindings 로 라우팅해 매 프레임 값 체인을 평가한다. 반면 standalone 은 `src.kind === "param"` 만 검사해, `u_speed` 를 Math/Combine 노드가 구동하면 sampler 로 `unit++` 등록 → 렌더 루프에서 텍스처를 못 찾아 스킵 → 유니폼은 default 에 고정. `htmlExport` 는 전체 그래프를 직렬화하므로 Math 노드와 엣지가 그대로 도달한다. **에디터와 export 결과가 조용히 달라진다**(값이 얼거나 틀림) + 텍스처 유닛 낭비.
- **제안**: Core 를 미러링 — `param|math|swizzle|combine` 을 paramBindings 로 분류하고, `resolveValueFor`(math/swizzle/combine 평가)를 standalone `paramValue` 경로로 포팅.

### H3. 정적 export 의 `rebuild()` 가 리사이즈마다 프로그램·메시 VAO/VBO/IBO 를 누수
- **위치**: `src/export/standalonePlayer.js:823`
- **문제**: `rebuild()` dispose 루프가 각 pass 의 FBO/텍스처/렌더버퍼만 삭제하고, 이전 pass 의 컴파일된 프로그램·메시 VAO/VBO/IBO 는 전혀 삭제하지 않는다. 그리고 리사이즈 이벤트가 매번 전체 rebuild(모든 셰이더 재컴파일)를 유발한다.
- **근거**: dispose 루프(823-829)는 `p.fbo` 만 정리. 이후 `createProgram`·`uploadMesh` 로 새 GL 객체를 할당하는데 옛 `p.program.program`·`p.mesh.vao`·VBO·`ibo` 는 `deleteProgram/deleteVertexArray/deleteBuffer` 없이 버려진다(`deleteProgram` 은 링크 실패 경로에만 존재). 창 리사이즈가 `sizeDirty=true` 를 세팅→다음 프레임 rebuild(979-982). 창 가장자리 드래그는 초당 다수 이벤트 → 프로그램/VAO/버퍼가 무한 누적 + 매 프레임 전 셰이더 재컴파일. **이 코드는 배포되는 standalone HTML 에서 실행**되므로 최종 사용자 환경에서 심각한 jank·컨텍스트 손실 유발 가능.
- **정정(VBO)**: `uploadMesh` 는 `{vao, ibo, indexCount, vertexCount}` 만 반환하고 VBO 는 로컬이라, VAO 삭제만으로는 VBO 가 해제되지 않는다. 수정은 `deleteProgram + deleteVertexArray + deleteBuffer(ibo)` **에 더해 VBO 도 노출/삭제**해야 완전하다. 이상적으로는 FBO 재할당과 프로그램 컴파일을 분리해 리사이즈 시 재컴파일을 피할 것.

### H4. `suppressNext` 누수 — undo/redo 직후 첫 구조 편집이 history 에서 조용히 누락
- **위치**: `src/state/historyStore.ts:47-56,65` ↔ `src/state/graphStore.ts:829` (`applySnapshot`)
- **문제**: `undo()/redo()` 는 `applySnapshot` 이 push 를 트리거할 것을 기대하고 `suppressNext=true` 를 세팅하지만, `graphStore.applySnapshot` 은 push 를 하지 않는다(직접 `set`). 따라서 플래그가 살아남아 **사용자의 다음 진짜 뮤테이션**이 소비하게 되고, 그 편집의 pre-state 는 기록되지 않는다.
- **근거**: `applySnapshot` 은 `pushHistory` 없이 상태를 교체(전용 테스트 `graphStore.test.ts:432` 가 확인). undo/redo 는 `undo()/redo()`→`applySnapshot()` 만 부르므로 push 가 발생하지 않는다. 다음 `addNode`→`push()` 가 `suppressNext=true` 를 보고 **기록을 건너뛰고 플래그를 소비**한다(그 편집은 undo 불가). `historyStore.test.ts:47-48` 의 "Need to reset suppress flag so push below actually lands" 워크어라운드가 이 누수를 증명한다.
- **추가 영향**: `push()` 의 early-return 은 `future=[]` 도 건너뛴다(55행). 즉 undo→편집 이후 남아 있던 **redo 스택이 비워지지 않아**, 이후 redo 가 diverged 된 낡은 브랜치를 되살릴 수 있다(그래프 손상).
- **제안**: `suppressNext` 를 제거(`applySnapshot` 이 push 하지 않으므로 억제할 대상이 없음)하거나, undo/redo 가 history 를 원자적으로 갱신하도록 배선해 플래그가 같은 연산 안에서 소비되게 한다. C1 수정과 함께 재설계하는 것이 자연스럽다.

### H5. autosave/세션 복구가 캐시된 에셋을 재수화(hydrate)하지 않아 커스텀 메시·이미지·비디오·오디오가 폴백으로 되돌아감
- **위치**: `src/ui/BootstrapGate.tsx:34-36`(share), `:84-86`(restore)
- **문제**: 복구/복원·share 로드 경로가 `setGraph` 만 호출하고 `hydrateAssetsFor` 를 부르지 않는다. IndexedDB 에 캐시된 에셋을 참조하는 노드가 실제 에셋 대신 폴백을 렌더.
- **근거**: `importFile()` 은 모든 임포트 에셋을 IDB 에 캐시(`cacheMesh/Image/Video/Audio`)하고 autosave 는 `assetId` 문자열로 그래프를 저장한다. 재로드 시 `restore()`·share-hash 경로는 `setGraph` 만 호출. `hydrateAssetsFor` 의 유일한 프로덕션 호출자는 `Toolbar.tsx:105`(JSON 파일 임포트)뿐이며, `setGraph` 에 hydrate 를 걸어주는 subscriber/effect 는 없다(grep 확인). 구체적 실패: 커스텀 `.obj` 임포트→재로드→RecoveryDialog "복구" → `assetStore.meshes[id]` 가 비어 `compile.ts` 가 `primitive`(cube) 로 폴백, 이미지/비디오/오디오는 빈 상태(블롭은 IDB 에 그대로 있는데도).
- **범위 정정**: cross-device share 수신자는 블롭이 그 origin 의 IDB 에 없어 hydrate 가 no-op — **확정 영향은 동일 origin 의 autosave/세션 복구(복구 버튼) 경로**다.
- **제안**: `BootstrapGate` 의 restore/share-load/session-restore 분기에서 `setGraph` 후 `parsed.graph.nodes` 에서 assetId 를 수집(Toolbar 와 동일 루프)해 `hydrateAssetsFor(...)` 호출. 수집 로직을 공용 헬퍼로 추출해 모든 로드 진입점을 일관되게.

### H6. Undo/Redo 단축키가 전역 발화 — 네이티브·CodeMirror 텍스트 undo 를 가로챔
- **위치**: `src/ui/KeyboardShortcuts.tsx:42-54`
- **문제**: Cmd/Ctrl+Z(undo) / Cmd/Ctrl+Shift+Z·Cmd+Y(redo) 핸들러가 이 파일의 다른 모든 단축키가 쓰는 `isEditingTarget()` 가드 없이 무조건 `preventDefault()`+`undoGraph()/redoGraph()` 를 호출한다.
- **근거**: 다른 분기(D:57, A:67, G:76, 화살표:85, Space:99)는 모두 `isEditingTarget(e.target)` 로 단락하는데 undo/redo 분기만 안 한다. 리스너가 `window` 에 있어 텍스트 입력·CodeMirror 에서 버블링된 이벤트에도 발화한다(CM keymap 은 preventDefault 하되 stopPropagation 은 안 함). 구체적 실패: GroupInspector 라벨 입력·ParamInspector·UniformHintEditor 필드에서 텍스트 입력 후 Cmd+Z → 네이티브 텍스트 undo 대신 `undoGraph()` 가 실제 그래프 history 를 되돌림. 셰이더 CodeMirror 안에서는 더 나쁨 — CM 자체 텍스트 undo **와 동시에** `undoGraph()` 가 실행돼 커밋된 소스/무관한 노드 조작이 의도치 않게 롤백.
- **제안**: undo/redo 분기도 `isEditingTarget(e.target)` 이면 early-return(다른 단축키와 동일). 또는 텍스트 입력/`.cm-editor` 포커스 중에는 그래프 undo/redo 를 막는다.

### H7. `_composite` 싱글톤이 WebGL 컨텍스트 복구 시 무효화되지 않음
- **위치**: `src/core/graph/execute.ts:352-355,436,459-476` (두 리뷰 관점 — compile-exec·viewport — 에서 동일 결함으로 독립 검출)
- **문제**: 특정 GL 컨텍스트로 만든 컴포지트 파이프라인(program/VAO/VBO/uniform 위치)을 담는 모듈 전역 `_composite` 가 한 번 세팅 후 영구 캐시되고 리셋 경로가 없다. 컨텍스트 손실+복구 후에도 죽은 GL 핸들로 계속 그린다.
- **근거**: `ensureComposite`(355)는 `if (_composite) return _composite` 로 단락. `src/` 전체에 `_composite`/`resetComposite` 리셋 경로 없음(grep). `Viewport.onContextRestored`(index.tsx:199-210)는 `plan=emptyPlan(...)` 리셋·`gpuTimer` 재생성·전체 recompile 을 정성껏 하지만 모듈 전역 `_composite` 는 건드릴 수 없다. `compositeOutputs` 는 **매 프레임 캔버스 합성 경로**(drawable>0 이면 항상 호출)라, 복구 후 `useProgram/bindVertexArray/drawArrays` 가 무효 핸들에 걸려 `INVALID_OPERATION` + 페이지 새로고침 전까지 빈 캔버스. `userUniformCache` 는 Pass 객체 키 WeakMap 이라 recompile 시 새 키로 자연 무효화되지만 `_composite` 는 그런 키가 없다.
- **제안**: `resetComposite()`(program/vao/vbo 삭제 후 `_composite=null`)를 export 해 `onContextRestored` 에서 호출. **주의**: WebGL 은 손실/복구 시 동일 `gl` 컨텍스트 객체를 재사용하므로 `WeakMap<WebGL2RenderingContext, …>` 키잉으로는 해결되지 않는다(같은 stale 엔트리 반환). 명시적 리셋이 정답.
- 심각도: 트리거(실제 GPU 컨텍스트 손실)는 드물지만, 앱이 우아한 복구를 위해 투자한 처리를 이 결함이 통째로 무력화한다.

---

## Medium

### M1. `gltfLoader` 가 첫 mesh 의 첫 primitive 만 로드하고 실패를 "OBJ" 에러로 오보 — (일부 추정)
- **위치**: `src/core/assets/gltfLoader.ts:35`
- **문제/근거**: `parsed.meshes?.[0]?.primitives?.[0]` 만 읽어 다중 primitive/다중 mesh glTF 가 **경고 없이 부분 로드**된다(멀티머티리얼 GLB = 머티리얼당 primitive 1개가 흔한 export 형태 → 첫 서브메시만 렌더, 데이터 소실). 또한 첫 primitive 에 POSITION 값이 없으면 `toGeometryHandle`(objLoader.ts:52-54)이 `"OBJ has no POSITION attribute"` 를 던져 glTF 임포트에 혼란스러운 메시지. **추정**: non-embedded `.gltf` 가 외부 `.bin` 을 bare ArrayBuffer(no baseUri)로 못 풀어 POSITION 이 비는 시나리오는 loaders.gl 내부 동작 미검증(그러나 원인과 무관하게 "OBJ" 오보는 성립).
- **제안**: 모든 mesh/primitive 순회·병합(또는 최소 1개 초과 폐기 시 warn/log). gltfLoader 전용 에러 메시지.

### M2. 휠 줌이 `WheelEvent.deltaMode` 를 무시 — Firefox 에서 줌 속도 붕괴
- **위치**: `src/core/camera/input.ts:60-64`
- **문제/근거**: `onWheel` 이 raw `e.deltaY` 를 `zoom()` 에 그대로 전달, `zoom` 은 `distance*(1+delta*0.0015)` 로 픽셀 스케일 델타를 가정. Firefox 물리 마우스휠은 `DOM_DELTA_LINE`(deltaY≈3/notch)라 배율 ≈1.0045 — Chrome(≈100/notch, 1.15) 대비 ~30배 약해 줌이 고장난 느낌. `deltaMode` 는 모듈 어디서도 안 읽힘.
- **제안**: `deltaMode` 로 정규화(LINE 은 ~16×, PAGE 는 clientHeight×) 하거나 sign/step 기반 줌으로 단위를 브라우저 독립화.

### M3. 외부 소스 GL 텍스처가 reconcile-시점 dispose 마다 누수 — (심각도 하향: GC 백스톱)
- **위치**: `src/core/external/registry.ts:441` (`disposeHandle`), 호출부 205/213/218
- **문제/근거**: `disposeHandle` 은 `if (h.glTexture && gl)` 일 때만 `deleteTexture` 하는데, `reconcileExternal` 은 gl 없이 호출(compile.ts:461 은 GL 컨텍스트 없음)해 가드가 거짓 → `h.glTexture=null` 로 유일 참조만 잃는다. 한 프레임이라도 렌더된 외부 노드를 제거·kind 전환·restart(webcam device swap / video assetId swap / audio fftSize·source swap)하면 텍스처 누수. 1280×720 webcam ≈ swap 당 ~3.5MB GPU.
- **정정**: 참조가 unreachable 해지면 브라우저 GC 가 결국 회수할 수 있어 "컨텍스트 손실까지 영구 누수" 는 과장 — 다만 off-heap GPU 할당은 GC 회계에 안 잡혀 누적은 실재. 트리거는 프레임당이 아닌 이산적 사용자 액션.
- **제안**: 레지스트리가 마지막 렌더 gl 을 저장해 `reconcileExternal` 에서 `disposeHandle` 로 넘기거나, orphan 텍스처 리스트를 다음 `updateExternalSources` tick 이 drain·삭제. `disposeAllExternal` 은 이미 gl 을 넘기므로 reconcile 도 동일 패턴이면 됨.

### M4. 디코드 중 오디오 play 토글이 조용히 유실(stale 캡처 spec)
- **위치**: `src/core/external/registry.ts:746,771`
- **문제/근거**: `startAudioFile` 이 진입 시 `const spec = handle.spec` 를 캡처하고 `decodeAudioData` 를 await. 그 사이 `applyAudioSpec` 이 `handle.spec=newSpec`(playing 반전)을 세팅하지만 `handle.buffer` 가 아직 null 이라 재생 시작이 no-op. 디코드 완료 후 771행은 **stale 캡처된 `spec.playing`** 을 검사해 소스를 시작하지 않는다. 큰 파일 디코드 중 Play 클릭 시 재생이 안 걸리고, off→on 재토글 전까지 자가 회복 안 됨.
- **제안**: 라이브 값 사용 — `if (handle.spec.playing) startAudioBufferSource(handle);` (참고: `loop` 은 `startAudioBufferSource` 가 이미 라이브로 읽으므로 추가 조치 불필요).

### M5. 외부 텍스처 수명주기(create/resize-delete/dispose-delete) 단위 테스트 0
- **위치**: `src/core/external/registry.test.ts`
- **문제/근거**: 어떤 테스트도 mock WebGL2 컨텍스트를 `updateExternalSources`/`disposeAllExternal` 에 넘기지 않는다(모든 dispose 테스트가 gl 없이 호출). `updateExternalSources` 는 테스트에 아예 import 되지 않음. 이 공백이 M3 누수를 놓치게 한 직접 원인 — create 대 delete 호출 수를 세는 fake gl 이면 즉시 잡혔을 것.
- **제안**: `createTexture/deleteTexture/texImage2D` 를 스파이하는 fake WebGL2 로 `updateExternalSources` 구동 후 노드를 reconcile 로 제거, `deleteTexture` 횟수 == `createTexture` 횟수 단언. 비디오/오디오 resize(삭제+재생성) 분기도 커버.

### M6. 다중인자 함수 호출로 초기화된 로컬 선언이 인자를 phantom 로컬로 등록
- **위치**: `src/core/glsl/symbolTable.ts:303-331`
- **문제/근거**: 다중 선언 축약을 처리하는 콤마 워커가 초기화식의 함수 호출 인자 리스트 안 콤마를 새 선언자 구분자로 취급한다. `RE_LOCAL_DECL` 의 초기화 그룹 `(?:=\s*[^,;]+)?` 가 첫 콤마에서 멈춰, 여러 줄 본문에서 `vec3 c = mix(a, b, t);` 가 `b`·`t` 를 `vec3 local` 로 등록. autocomplete/hover/semantic tokens/rename 을 오염(예: `t` rename 이 phantom 로컬로 해석). 렌더/컴파일에는 영향 없음(에디터 LSP 한정)이라 medium.
- **근거 정정**: 리뷰가 인용한 **한 줄** 재현(`void main(){ … }`)은 실제로 트리거되지 않음(함수 헤더와 같은 줄에서는 depth≥1 로컬 분기가 안 돎). **여러 줄** 본문(실제 셰이더 작성 형태)에서 `c/b/t/uv/y` phantom 로컬이 재현됨.
- **제안**: 종결 콤마가 선언자 기준 brace/paren depth 0 일 때만 콤마-선언자 워크를 수행(꼬리 스캔 시 `()`/`[]` 중첩 추적). identifier 인자를 가진 단위 테스트 추가.

### M7. 검증 없는 `as UniformType` 캐스트가 미지원 GLSL 타입을 통과·오분류
- **위치**: `src/core/graph/uniformParser.ts:405`
- **문제/근거**: `RE_UNIFORM` 타입 그룹이 `(\w+)` 라 임의 단어를 캡처하는데 `m[1] as UniformType` 로 union 검증 없이 캐스트. `sampler3D/usampler2D/sampler2DArray/uint/uvec3/double/struct 이름` 등이 UniformType 으로 취급된다. `isSampler` 는 `sampler2D/samplerCube` 만 인식하므로 `uniform sampler3D u_vol;` 은 sampler 로 안 잡히고 `"multi"`+스칼라 default 로 → H1 과 동일한 `arr.map` 크래시(WebGL2 `#version 300 es` 라 이들은 합법 컴파일 입력). `registry.ts` 의 포트 매핑은 unknown 을 null 반환해 크래시는 없지만 포트가 조용히 누락.
- **제안**: 캡처 타입을 알려진 `Set<UniformType>` 멤버십으로 가드해 unknown 은 스킵/명시 버킷팅. `isSampler` 를 지원 의도 sampler 변형까지 확장.

### M8. `AsyncThumbnailReadback` 가 컨텍스트 손실/복구 시 리셋 안 됨 → 죽은 GL 객체 재사용
- **위치**: `src/ui/Viewport/index.tsx:199-210`, `src/core/thumbnail/asyncReadback.ts:141,198`
- **문제/근거**: `asyncReadback` 은 index.tsx:105 에서 `const` 로 1회 생성(effect deps 가 컨텍스트 이벤트로 안 변함). `onContextLost/Restored` 는 `gpuTimer` 는 재생성하면서 `asyncReadback` 은 건드리지 않는다(정확히 그 비대칭). 복구 후 `request()` 는 `if (!this.blit)` 가 여전히 truthy 라 죽은 program 으로 `downsampleInto` 를 그림; 살아남은 nodeId 의 slot 도 옛것이라 fresh-resource 분기가 안 돌아 stale PBO/thumb FBO 영구 재사용. 손실 시점에 pending 이던 slot 은 `clientWaitSync` 가 `WAIT_FAILED` 를 반환→`continue` 로 pending 이 영구 고정 → `request()` 가 영영 false. 결과: 복구 후 썸네일이 얼고 DEV 빌드에 GL 에러. (메인 뷰포트는 복구되므로 부차 기능 한정 → medium)
- **제안**: `onContextLost`(또는 restore 의 recompile 전)에서 `asyncReadback.disposeAll(gl)` 호출(lost 컨텍스트에서 GL delete 는 안전한 no-op, slots+blit 캐시를 비워 다음 request 가 새 컨텍스트로 재구축). 또는 `let` 으로 두고 복구 시 새 인스턴스 재대입. (연관: Low L28 — `WAIT_FAILED` 를 transient 로 오취급하는 문제)

### M9. `</script>` 이스케이프 불완전 — 사용자 GLSL 로 HTML/스크립트 브레이크아웃 가능
- **위치**: `src/export/htmlExport.ts:21-22`
- **문제/근거**: `safeJson` 이 리터럴 `</script>`(뒤에 `>` 필수)와 `<!--` 만 이스케이프한다. 그러나 HTML 파서는 `</script` 뒤에 공백/`/`/개행/탭이 와도 인라인 스크립트를 종료한다(script-data-end-tag 상태). `JSON.stringify` 는 `<` 를 이스케이프 안 하므로 `fragmentSource` 에 `</script ><img src=x onerror=alert(1)>` 를 넣으면 인라인 스크립트를 조기 종료해 export/공유 HTML 을 열 때 실행. `projectSanitize.safeShaderSource` 도 길이/타입만 보고 `<` 를 안 거른다 → 신뢰 불가 share URL/import 도 그대로 통과. 기존 테스트는 `>` 붙은 케이스만 커버.
- 심각도: 인앱 직접 실행이 아니라 share→export→파일 열기 흐름이 필요해 medium.
- **제안**: 직렬화 JSON 에서 모든 `<` 를 JSON 유니코드 이스케이프 `<` 로 치환(JS 문자열 리터럴 안에서 유효하고 런타임 `JSON.parse` 가 `<` 로 복원)해 모든 `<` 기반 브레이크아웃 무력화. `</script `·`</script/`·개행 변형 테스트 추가.

### M10. 삭제된 노드의 진단이 정리되지 않음 — phantom 문제 행·부풀려진 배지
- **위치**: `src/state/diagnosticsStore.ts:21` (`clear`/`reset` 프로덕션 호출자 없음)
- **문제/근거**: `graphStore.removeNode` 는 diagnostics 를 건드리지 않고, Viewport recompile 은 현존 shader 노드 id 에만 `set` 하며 사라진 id 를 제거하지 않는다. `clear()/reset()` 은 테스트에서만 호출. `ProblemsPanel`·SidePanel 배지는 모든 `byNode` 엔트리를 순회하므로 **컴파일 에러가 있던 노드를 삭제하면 phantom 행 + 부풀려진 문제 배지**가 남고, phantom 행 클릭은 존재하지 않는 노드를 select(크래시는 아님, 빈 소스 표시). 단, 깨끗이 컴파일된 노드는 `emptyDiagnostics()` 라 stale 엔트리가 0행/0카운트로 비가시 → 조건부 발현.
- **제안**: `removeNode`/`removeGroup` 에서 `diagnosticsStore.clear(id)` 호출, 또는 recompile 시 현 shader 노드 집합에 없는 `byNode` 키를 prune(덤으로 `clear()` 에 실호출자 부여).

### M11. cross-stage rename 후 스퍼리어스 전체 문서 리로드로 커서가 문서 최상단으로 점프
- **위치**: `src/ui/CodeEditor/index.tsx:161-174`, `src/ui/CodeEditor/rename.ts:153-159`
- **문제/근거**: cross-stage F2 rename 이 `view.dispatch` **전에** `applyBothStages` 로 origin-stage 소스를 스토어에 동기 커밋한다. 리로드 effect 가 `lastCommittedRef`(아직 rename 이전 텍스트, 50ms commit debounce 미발화)와 새 `source` 를 비교해 `externalChange=true` 로 판정, `{from:0, to:doc.length, insert:newOrigin}` 로 전체 교체를 dispatch. 이 트랜잭션에 selection 이 없어 **커서가 offset 0(파일 맨 위)로 붕괴**한다. single-document rename 은 `commit()` 이 스토어 뮤테이션 전에 `lastCommittedRef` 를 세팅하므로 무영향.
- **정정(중요)**: 원 발견의 "single-CM-undo 보장 위반 / 첫 Ctrl+Z 가 먹통, 두 번 필요" 주장은 **검증에서 반증됨** — CodeMirror history 가 리로드 트랜잭션을 rename 트랜잭션에 join 하므로 한 번의 Ctrl+Z 로 rename 전체가 되돌려지고 원 커서(예: 16)도 복원된다. **실제 영향은 커서 점프(회복 가능·데이터 손실 없음) 한정**이라 medium.
- **제안**: cross-stage 분기에서 `applyBothStages` **전에** origin stage 의 `lastCommittedRef.current = newOrigin` 을 세팅, 또는 리로드 effect 가 dispatch 전에 `source === view.state.doc.toString()` 이면 스킵.

### M12. 비운 숫자 입력이 유니폼/그래프 상태에 `NaN` 을 기록(`|| 0` 가드 누락)
- **위치**: `src/ui/Panels/UniformControl.tsx:37,71`, `src/ui/Panels/UtilityInspector.tsx`(Math a:78/b:92, Combine:168)
- **문제/근거**: 여러 숫자 편집기가 `parseFloat(e.target.value)` 를 가드 없이 스토어로 전달. `type="number"` 필드를 비우면 `value===""`, `parseFloat("")===NaN` 이 그대로 저장돼 GL 유니폼으로 업로드(셰이더 검정/깨짐) + `uniformValuesEqual(NaN,NaN)===false`(uniformCache.ts) 라 매 프레임 재업로드. `ParamInspector`(60/91/157)는 일관되게 `parseFloat(...) || 0` 를 쓰므로 이 가드가 단순 누락임이 드러난다.
- **정정**: 영속화 영향은 과장 — `JSON.stringify(NaN)→null` 이지만 재로드 시 `value ?? spec.defaultValue` 로 default 폴백돼 자가 회복. 즉 숫자칸을 비운 동안만 지속되는 회복 가능 엣지 트리거 글리치라 medium. (참고: `setMathConfig/setCombineConfig` 의 `patch.x ?? node.x` 는 `NaN` 이 nullish 가 아니라 NaN 을 저장하므로, 가드는 ParamInspector 처럼 **입력 onChange 지점**에 둘 것.)
- **제안**: UniformControl slider+multi, MathInspector a/b, CombineInspector values 의 onChange 를 `parseFloat(...) || 0`(또는 `Number.isFinite` 체크)로 가드.

---

## Low

즉시 위험은 낮지만 누적 가치가 있는 항목(핫패스 성능·리소스 위생·정확성 엣지·테스트 공백·데드코드). `[파일:라인] — 요지` 형식.

**정확성 엣지**
- `src/state/historyStore.ts:33` — 스냅샷이 노드를 shallow-clone(`{...n}`) 해 중첩 상태(`uniformValues/values/attributes`)를 live 노드와 공유 → undo 후에도 값이 변형될 수 있음.
- `src/core/graph/parents.ts:37` — parent-chain 워커가 visited set 대신 반복 횟수로 캡 → 사이클에서 잘못된 값 누적.
- `src/state/serialization.ts:152` — parent-chain 깊이 가드 off-by-one 으로 정확히 `MAX_DEPTH` 조상의 유효 비순환 체인을 드롭.
- `src/core/thumbnail/asyncReadback.ts:198` — `WAIT_FAILED` 를 transient `TIMEOUT` 처럼 처리해 slot 을 영구 pending 고정(M8 과 연관).
- `src/core/graph/execute.ts:176` — 컴파일 실패한 소스 pass 를 가리키는 sampler 가 blank 대신 unbound 로 남음(이전 텍스처 잔상 가능).
- `src/core/gl/uniforms.ts:19` — 미지원 value shape 에 조용히 no-op + 길이로 matrix 디스패치 하드코딩(향후 `float[9]/[16]` 오전송 위험).
- `src/core/gl/framebuffer.ts:73` — `bindFramebuffer(gl, null)` 이 viewport 를 리셋 안 함(호출자 의존 비대칭, 현재는 무해).
- `src/core/gl/gpuTimer.ts:87` — pending 이 비면 `GPU_DISJOINT_EXT` drain 을 건너뛰어 sticky disjoint 가 다음 프레임의 정상 쿼리를 무효화(추정).
- `src/core/graph/uniformParser.ts:107,211` — 배열 유니폼(`u_x[4]`) 이 스칼라로 평탄화(크기 폐기); `serializeHintComment` 의 greedy `@default` 정규식이 힌트 왕복 시 뒤 free-text 삭제.
- `src/core/nodes/utility.ts:46,67` — `applySwizzle` 이 빈/무효 mask 에서 `swizzleOutputPort` 와 출력 shape 불일치; `computeMath 'pow'` 가 NaN/Infinity 를 유니폼으로 방출 가능.
- `src/core/gif/gifEncoderClient.ts:218` — 워커 사망→인라인 폴백 시 인코드 진행률이 뒤로 점프.
- `src/export/standalonePlayer.js:951` — time-param 값 해석이 `scale===0` 일 때 Core 와 diverge.
- `src/utils/id.ts:5` — `nextId` 가 페이지 리로드/세션 병합 간 충돌 가능.
- `src/state/timeStore.ts:38` — `advance` 가 unclamped `dt` 적용 → 백그라운드 탭/GC 정지 후 `simTime` 이 정지 구간만큼 급점프.
- `src/state/recorder.ts:86,108` — captureStream 트랙이 stop 되지 않아 녹화/시작 실패마다 라이브 캔버스-캡처 트랙 누수; `stop()` 에 onerror/timeout 없어 onstop 미발화 시 promise 영구 pending.
- `src/ui/Viewport/index.tsx:427` — 일시정지 중 뷰로 스크롤된 썸네일이 readback 을 못 받음.
- `src/ui/CodeEditor/index.tsx:131` — 50ms commit 윈도 안에 타이핑한 편집이 활성 노드/stage 전환 시 유실.
- `src/core/assets/cache.ts:68` — `openDb` 가 `onblocked` 미처리 → IndexedDB 버전 업그레이드 중 hydrate/import 영구 hang.

**타입 안전성**
- `src/state/serialization.ts:97` — `deserializeProject` 가 다른 건 sanitize 하면서 `positions` 는 미검증 통과.
- `src/core/nodes/utility.ts:126` — 판별 union 내로잉 후 불필요한 `as` 캐스트가 향후 불일치를 은폐할 수 있음.

**성능(핫패스/할당/누수)**
- `src/ui/NodeEditor/index.tsx:86` — `rfNodes` 가 매 렌더마다 모든 노드 `data` 객체를 재생성 → 드래그 프레임마다 전체 재렌더.
- `src/ui/Viewport/index.tsx:340` — RAF 루프가 프레임마다 노드 리스트를 이중 스캔·할당.
- `src/core/graph/execute.ts:235` — `executePlan` 이 매 프레임 lookup map 재구축·pass 당 할당.
- `src/state/gpuTimerStore.ts:63` — GPU 타이머 poll 이 프레임당 `setSample` N회 → N개 throwaway 레코드 할당 + 구독자 N회 통지.
- `src/core/glsl/semanticTokens.ts:180`, `references.ts:133`, `src/ui/CodeEditor/referenceHighlight.ts:36`, `src/ui/Panels/Inspector.tsx:67` — 편집/커서 이동마다 심볼 테이블 전체 재구축 또는 셰이더 소스 재파싱(대형 문서에서 비용).
- `src/core/gif/encode.ts:132` — 전체 GIF 를 JS `number[]` 에 per-byte push 로 누적(Uint8Array chunk 가 유리).
- `src/core/assets/imageLoader.ts:9` — `ImageBitmap` 을 `close()` 안 함 → 에셋 제거/교체 시 디코드 이미지 메모리 누수.
- `src/core/assets/audioLoader.ts:39` — 메타데이터만 읽는데 전체 파일을 디코드.
- `src/core/gl/framebuffer.ts:54` — `createFramebuffer` 의 에러/incomplete throw 경로가 이미 할당된 texture/FBO/renderbuffer 를 해제 안 함(오버사이즈 viewport 등 유효 컨텍스트 트리거, GC 로 bound).
- `src/state/shareUrl.ts:93` — 압축 해제 바이트 캡을 gunzip 완료 *후* 검사 → 압축 폭탄 가드 무력.

**아키텍처/중복**
- `src/core/camera/input.ts:77` — `attach()` 가 이전 캔버스를 detach 안 함 → 리스너 누수.
- `src/core/nodes/utility.ts:85` — `paramValue` 가 스토어 소유 값 배열을 참조로 eval 캐시/유니폼 맵에 누출(외부 뮤테이션 위험).
- `src/core/graph/compile.ts:269` — compute-slot VAO 빌더 로직이 두 함수에 삼중 중복.

**데드코드**
- `src/core/thumbnail/readback.ts:13` — `downsampleToThumb`(CPU 박스필터)는 자기 테스트로만 살아있는 프로덕션 데드코드(문서 §6.4 를 이번에 정정함).
- `src/state/recorder.ts:126` — `recorder.tick()`/`elapsedMs` 가 프로덕션에서 데드(WebM 경과시간이 실제로 안 오름 — 문서의 "RAF tick 이 갱신" 서술과 불일치).
- `src/ui/CodeEditor/StageTabs.tsx:32` — `vertexDimmed/dimmed` override-title 기능 데드코드.
- `src/ui/NodeEditor/Toolbar.tsx:178` — `recorderUrl` 구독 후 폐기 → 불필요 재렌더.

**테스트 공백**
- `src/core/graph/execute.ts:315` — 렌더 심장부(ping-pong swap·compute-mesh VAO 선택·dispose 누수) 단위 커버리지 없음.
- `src/core/thumbnail/asyncReadback.test.ts:190` — readback 실패/복구 경로(`WAIT_FAILED`·컨텍스트 손실·release 시 sync 누수) 미커버.
- `src/state/serialization.test.ts:98` — 미신뢰 positions sanitize·gzip 크기 가드·로드 시 에셋 재수화 미커버.
- `src/core/assets/cache.test.ts:53` — 캐시 왕복 테스트가 video/audio 및 `byteOffset>0` slice 분기 누락.
- `src/core/nodes/utility.test.ts:158` — fan-out 메모이즈 테스트가 아무것도 단언 안 함; 사이클 안전 센티넬 미검증.
- `src/core/camera/orbitCamera.test.ts:87` — degenerate viewMatrix·deltaMode 휠 줌 커버리지 없음.
- `tests/e2e/phase-28-cross-stage-rename.spec.ts:76` — cross-stage rename 회귀(커서 점프) 미검증.

---

## 우선순위 액션 아이템

1. **[Critical] Undo/Redo 재설계** — `historyStore.undo/redo` off-by-one(C1)과 `suppressNext` 누수(H4)를 함께 고친다. "push-before-mutation" 모델에 맞춰 undo 가 현재 live 를 future 로 밀고 `past.pop()` 을 복원하도록. 수정과 동시에 `historyStore.shallow-clone`(Low)도 deep-ish clone 으로. 테스트를 id 기반 왕복 단언으로 강화.
2. **[High] 텍스트 입력 중 그래프 undo/redo 차단** — `KeyboardShortcuts` undo/redo 분기에 `isEditingTarget` 가드 추가(H6). 저비용·고효과.
3. **[High] WebGL 컨텍스트 복구 완성** — `resetComposite()`(H7) + `asyncReadback.disposeAll(gl)`(M8)을 `onContextRestored`/`onContextLost` 에 배선. 세 번째 전역(외부 텍스처 풀 M3)도 gl 스레딩으로 정리.
4. **[High] autosave 복구의 에셋 재수화** — `BootstrapGate` restore/share/session 경로에 `hydrateAssetsFor` 배선(H5). 공용 헬퍼로 진입점 일원화.
5. **[High] 정적 export 드리프트 해소** — 유틸 노드 유니폼 라우팅 미러링(H2) + rebuild 의 프로그램/VAO/VBO 정리 및 리사이즈-재컴파일 분리(H3). export XSS 이스케이프(`<`→`\u003c` 치환, M9)도 같은 파일군.
6. **[High/Med] 유니폼 파서 견고화** — `ivec*` default(H1) + 미지 타입 캐스트 가드(M7) + `NaN` 입력 가드(M12)를 묶어 처리(모두 Inspector 크래시/오염 방지). ivec/array/uint 단위 테스트 추가.
7. **[Med] 리소스 누수·수명주기** — 외부 텍스처 reconcile 삭제(M3)와 그 테스트 공백(M5), `ImageBitmap.close`·recorder 트랙 stop(Low)까지 GL/미디어 리소스 위생 스윕.
8. **[Med] 에셋 로더·입력 정확성** — glTF 다중 primitive/에러 메시지(M1), 휠 `deltaMode` 정규화(M2), 오디오 디코드-중 토글(M4).
9. **[Med] 에디터 UX·정합성** — cross-stage rename 커서 점프(M11), 삭제 노드 진단 prune(M10), symbolTable phantom 로컬(M6).
10. **[Low] 성능·테스트 스윕** — RAF/렌더 루프·CodeMirror 재계산 핫패스 할당 축소, 렌더 심장부·readback 실패 경로·serialization sanitize 단위 테스트 보강, 데드코드 4건 제거.

---

## 반증되어 제외된 항목 (검증 단계에서 탈락)

- `src/core/glsl/references.ts:147` — "절대 문서 오프셋이 단일 문자 줄 구분자를 가정한다"(CRLF 회귀 주장) → 검증 결과 실제 경로에서 성립하지 않아 제외.
- `src/core/camera/input.ts:74` — "state setter / `initial` override 가 `clampCamera` 를 우회해 degenerate 뷰 허용" → 실제 클램프 경로가 이를 커버해 제외.

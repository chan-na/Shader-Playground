# GLSL 편집기 인텔리전스

> [Architecture.md](../../Architecture.md) §8 (에러 처리와 진단) 에서 분리한 하위 문서다. 라이브 GLSL 검증(Phase 24), LSP-like 편집기 기능(Phase 25), 시맨틱 토큰 하이라이트(Phase 26), Goto / References / Rename(Phase 27 · 28) 을 다룬다. 권위 진단 경로(`compileGraph` → `parseShaderInfoLog` → `diagnosticsStore`)와 jumpRequest 는 Architecture.md §8.1~§8.3 이 정본이다. 절 번호는 Architecture.md §8 의 번호를 그대로 유지한다.

---

### 8.4 라이브 GLSL 검증 (Phase 24)

Authoritative recompile 경로(`graphStore.rev` → `compileGraph` → `gl.getShaderInfoLog`) 와 별개로, **CodeMirror 의 키스트로크마다** OffscreenCanvas WebGL2 워커에 셰이더를 보내 컴파일 로그를 받아오는 라이브 채널을 둔다. 사용자가 50ms commit debounce + 그래프 recompile 까지 기다리지 않고 밑줄을 본다.

```
CM updateListener (doc 변경)
   │
   ├─▶ commit (debounce 50ms)  ─▶ updateShaderSource ─▶ graphStore.rev++ ─▶ 권위 진단 (그대로)
   │
   └─▶ liveValidate (debounce 150ms)
           │
           ▼
       glslValidator().validate(stage, source)
           │  (lazy 첫 호출에 ?worker 인스턴스화)
           ▼
       Worker: OffscreenCanvas(1,1).getContext('webgl2')
               → createShader/compileShader/getShaderInfoLog
               → postMessage({log, ok})
           │
           ▼
       parseShaderInfoLog(log) → GLSLDiagnostic[]
           │  (ctxRef 가 promise 도착 시점에 같은 (node, stage) 면 적용)
           ▼
       setLiveDiags(diags)
           │
           ▼
       CM diagnostics push effect: 권위 ∪ 라이브 (같은 line:severity 면 라이브 드롭)
                                  → setDiagnostics → CM 밑줄
```

- **백엔드 선정 근거**: 도입 전 측정 스파이크(커밋 `83d5f2f` — 측정 하네스는 저장소에서 제거됨) 에서 워커의 InfoLog 가 메인 스레드 GL 컨텍스트와 byte-perfect 일치(5/5 셰이더, syntax/undeclared/type-mismatch 포함) 함을 확인. 신규 의존성 0, 워커 소스 ~1KB, init 52ms. glslang-wasm (~1.8MB wasm, deprecated) 대비 모든 축에서 우세 — 측정 없이 채택.
- **격리**: 워커는 메인 스레드 GL 컨텍스트와 분리된 OffscreenCanvas 라 사용자 셰이더가 잘못 컴파일돼도 렌더 GL state 를 오염시키지 않는다. 워커 GL 컨텍스트는 한 번 만들고 영구 재사용 (셰이더만 매 요청에 create/compile/delete).
- **실패 모델**: 워커 construct/post/error 어느 단계 실패해도 클라이언트는 `[]` resolve. 권위 recompile 경로가 source of truth 로 그대로 동작 — 라이브는 *보조* 채널이다. 워커 미가용 환경에서는 기존 동작(컴파일 후 진단)만 남는다.
- **머지/우선순위**: CodeEditor 진단 push effect 가 `auth = diagnosticsStore[stage] + link` 와 `live = liveDiags` 를 합성하되 *같은 `line:severity` 가 양쪽에 있으면 라이브 드롭*. 사용자가 에러를 고치는 순간 — 라이브는 즉시 비고, 권위는 다음 recompile 까지 잠시 stale — 잠깐 권위가 살아 있는 동안 라이브가 추가로 중복 표시하지 않는다.
- **switch race**: `liveValidate` 가 dispatch 한 promise 가 다른 노드/스테이지로 전환된 뒤 도착하면 `ctxRef` 가 다른 `(id, stage)` 라 그대로 폐기. doc 교체 effect 는 switching 일 때 라이브 진단을 비운다 — 단 **이미 비어 있으면 배열 아이덴티티를 유지**한다(`setLiveDiags((prev) => prev.length === 0 ? prev : [])`). 매번 새 `[]` 를 넣으면 `[diags, stage, liveDiags]` 진단 effect 가 전환마다 무조건 재발화해 CM dispatch 가 중복되고, 아래 (2) 의 보상 dispatch 가 없어도 결과가 같아져 **가드가 사라진다**.
- **문서 교체 = `view.setState` (2026-07 리뷰 #1a)**: 노드/스테이지 전환은 `{from:0,to:len}` 변경 트랜잭션이 아니라 **`view.setState(EditorState.create({ doc, extensions }))`** 로 처리한다. 한 view 가 (노드 × stage) 개의 서로 다른 문서를 돌려쓰는데 트랜잭션으로 갈아끼우면 undo 타임라인이 문서 경계를 넘어 이어져, 전환 직후 Cmd+Z 가 *문서 로드 트랜잭션* 을 pop 해 이전 문서를 현재 stage 에 쏟아붓고 50 ms commit debounce 가 그걸 store 에 써 버린다. 구현 계약 3 가지: (1) `extensions` 는 마운트 때 만든 **동일 배열**(`glslExtensions() + updateListener`)을 재사용한다 — `glslExtensions()` 만 다시 담으면 update listener 가 사라져 이후 모든 타이핑이 store 에 커밋되지 않는다. (2) `setState` 는 트랜잭션이 아니므로 보상 dispatch 2 개가 뒤따른다 — lint 재설치·재적용(`setDiagnostics`; lint 는 `StateEffect.appendConfig` 로 설치돼 extensions 배열에 없다)과 `liveValidate(source)` 명시 호출(`commit` 은 호출하지 않는다 — 들어온 텍스트의 출처가 store 다). (3) `EditorView` 인스턴스는 그대로 유지 — `currentView.ts` 브리지가 붙들고 있다. 잃는 상태는 fold 범위 / lint 마커 / 열린 자동완성·hover 팝업 / 커서·스크롤 위치이며, 나머지 확장은 doc+selection 의 순수 함수라 재계산된다. `historyCompartment.reconfigure(history())` 는 대안이 되지 못한다 — `@codemirror/commands` 의 history 필드는 모듈 싱글턴이라 reconfigure 경로가 기존 상태를 **보존**한다.

### 8.5 LSP-like 편집기 기능 (Phase 25)

Phase 24 의 *진단* 채널과 별도로, **에디터 측 심볼 인식과 hover** 를 위한 정적 분석 계층. CodeMirror 6 위에 다음 두 모듈이 얹힌다:

```
CM updateListener (doc 변경)
    │
    └─▶ autocomplete (codemirror autocompletion override)
            │  source = state.doc.toString(), line = state.doc.lineAt(pos).number
            ▼
        glslSource(context)
            │
            ├─▶ symbolCompletions(source, line)
            │       └─ buildSymbolTable(source) → symbolsVisibleAt(table, line)
            │
            ├─▶ uniformCompletions(source)          // @label / system desc
            │
            └─▶ STATIC_BASE                          // GLSL_FUNCTIONS/TYPES/KEYWORDS
                                                     // 빌트인은 BUILTIN_FUNCTIONS 에서
                                                     // signature(detail) + 설명(info) 부착

CM pointer (hover)
    │
    └─▶ hoverTooltip(view, pos)
            │  identifierAt(line.text, line.from, pos)  → {from, to, word}
            ▼
        lookupHover(source, word, line)
            │
            ├─▶ resolveSymbol(buildSymbolTable, word, line)   // 1순위: 문서 심볼
            ├─▶ BUILTIN_FUNCTIONS[word]                       // 2순위: 빌트인 함수
            ├─▶ SYSTEM_UNIFORM_DESCRIPTIONS[word]             // 3순위: 미선언 system uniform
            └─▶ KEYWORD_DESCRIPTIONS[word]                    // 4순위: storage/제어 키워드
                                                              // 매칭 없으면 null → 툴팁 미표시
```

**심볼 테이블 (`core/glsl/symbolTable.ts`)** — 정규식 + 중괄호 깊이 워커:
- 블록 코멘트는 공백으로 치환(라인 번호 유지), 라인 코멘트는 라인 단위 strip.
- `depth === 0 && !structDepth`: storage-qualified decl(`uniform/in/out/attribute/varying/const`), `struct ... {`, 함수 헤더(`<retType> <name>(<args>) {`) 매칭. 함수 헤더 진입 시 파라미터들을 `scope = funcName` 로 추가.
- `depth ≥ 1` 안에서: 로컬 변수 decl(쉼표 멀티 — `float a, b = 1.0;` 두 번째 패스로 수집), `for (int i = ...)` 인덕션 변수.
- `if/for/while/return/case/switch` 키워드는 `NOT_A_FUNCTION` 화이트리스트로 함수 헤더 매칭에서 제외.
- 출력 `GlslSymbol` 은 `{name, type, kind, line, column, scope, parameters?}`. `scope` 는 함수 이름 또는 `null`(top-level).
- 선언자 분할(`bracketDepth` / `splitTopLevelDeclarators`)·파라미터 리스트 파서·struct 멤버 이름 오프셋·`precededByDot` 은 `core/glsl/glslDecl.ts`, 식별자 정규식은 `core/glsl/ident.ts` 한 곳에 둔다.
- `symbolsVisibleAt(table, line)` (`core/glsl/symbolScope.ts`, `resolveSymbol` 도 여기) — 라인의 enclosing 함수를 *해당 라인 이전의 마지막 함수 헤더* 로 근사(body 의 정확한 끝을 추적하지 않아도 sequential function 정의에서는 정확). 출력 순서: 로컬(decl ≤ line) → 파라미터 → 글로벌, 이름 중복은 처음 등장한 것만 유지(local shadow 글로벌이 우선).

**빌트인 카탈로그 (`core/glsl/builtins.ts`)** — `BUILTIN_FUNCTIONS: Record<name, {signatures[], description}>` + `KEYWORD_DESCRIPTIONS`. `GLSL_FUNCTIONS` 와 양방향 일치(단위 테스트가 강제).

**오작동 시나리오 — 명시적으로 받아들임**:
- 중첩 블록 안의 로컬도 함수 scope 로 처리(블록 scope 추적 안 함). hover 가 잠시 풀어진 로컬을 제안할 뿐, 컴파일은 진단 채널이 잡으므로 안전.
- 사용자가 GLSL 의 nested function 처럼 보이는 lambda 등을 적으면 헤더 매칭이 어긋날 수 있으나, GLSL ES 는 nested function decl 자체가 없어서 실제 셰이더에서는 발생하지 않음.
- `for` 안의 동일 라인에 일반 decl 이 함께 있으면 dupe 회피 가드가 두 번째 등록을 막음.


### 8.6 시맨틱 토큰 하이라이트 (Phase 26)

Phase 25 의 심볼 테이블 위에 *식별자 역할 색* 만 덧칠하는 layered approach. lexer-based `glsl()` 언어팩과 `defaultHighlightStyle` (키워드·타입·숫자·연산자)은 그대로 두고, 식별자 위에 우리 decoration 이 색을 덮어쓴다.

```
CM ViewPlugin (mounted from glslSetup.ts)
   │
   │  update.docChanged || update.viewportChanged
   ▼
buildSemanticDecorations(view)
   │
   ├─▶ classifySemanticTokens(source)
   │       ├─ buildSymbolTable(source)            // Phase 25 재사용
   │       ├─ stripBlockComments + maskLineComment
   │       └─ 라인별 identifier 정규식 매칭마다:
   │             (1) resolveSymbol → kind 매핑 (local 은 null)
   │             (2) BUILTIN_FUNCTIONS[name]      → function-builtin
   │             (3) SYSTEM_UNIFORMS.has(name)    → system-uniform
   │             else                              → 토큰 미발행
   │
   ├─▶ Decoration 캐시 (kind 당 단일 Decoration.mark 인스턴스)
   │
   └─▶ view.visibleRanges 와 정렬된 토큰을 lockstep 으로 walk
           → RangeSetBuilder.add(from, to, deco)  // 정렬 보장
```

- **11 종 토큰 kind**: `uniform / system-uniform / in / out / attribute / varying / const / parameter / struct-type / function-user / function-builtin`. local 은 의도적으로 미분류 → 에디터 기본 색.
- **우선순위**: in-scope 심볼 테이블이 1순위 → 사용자가 `float sin(...)` 으로 빌트인 이름을 재정의하면 `function-user` 가 이긴다. 이미 사용자 uniform 이름이 `u_*` 라도 SYSTEM_UNIFORMS 셋에 없으면 `uniform` 으로 분류된다.
- **CSS 매핑**: 각 kind 는 `cm-glsl-token-<kind>` 클래스 → `glslSetup.ts` 의 dark theme 에서 색 지정 (VS Code Dark+ 관례).
- **cost 통제**: 정규식 스캔은 라인당 1 회지만 **심볼 테이블 lookup 은 식별자마다** 일어난다 (`classifyIdentifier` → `resolveSymbol` → `symbolsVisibleAt`). 그래서 `symbolsVisibleAt` 이 `WeakMap<SymbolTable, Map<line, GlslSymbol[]>>` 로 메모이즈되어 있고(테이블 **아이덴티티** 키 — cross-stage rename 이 한 호출에서 두 테이블을 쓴다), 같은 라인의 N 개 식별자는 계산을 1 회만 공유한다. 메모는 캐시 배열을 그대로 주지 않고 `slice()` 사본을 돌려준다 — 호출자가 결과를 자유롭게 정렬·splice 해도 캐시가 오염되지 않도록. viewport 외 토큰은 RangeSetBuilder 에 추가하지 않으므로 큰 문서에서도 O(visible-lines) decoration 만 보유.
- **주석 마스킹 단일화 (`core/glsl/stripComments.ts`)**: import 0 건 leaf. `maskComments`(블록+라인) / `maskBlockComments`(블록만) 두 진입점을 한 스캐너가 처리한다. symbolTable · references · semanticTokens 는 combined 를, `parseUniforms` / `writeUniformHints` 는 **block-only** 를 쓴다 — 후자는 `//` 뒤의 `@range` / `@label` 을 *읽어야* 하므로 combined 를 쓰면 앱 전체의 uniform 힌트가 사라진다. 두 진입점 모두 **길이 보존**이 계약이다(라인 길이로 doc offset 을 전진시켜 rename 편집 범위를 만든다). 미종료 `/*` 처리는 두 진입점이 **의도적으로 갈린다** — `maskComments` 는 GLSL 렉서처럼 EOF 까지 마스킹하고(소비자는 심볼/하이라이트/참조 같은 에디터 보조 기능뿐), `maskBlockComments` 는 평문으로 남긴다. 후자의 소비자는 노드의 **포트 표면**(`parseUniforms` → `nodeInputPorts`)을 만들고 스토어는 사라진 포트의 엣지를 프룬하므로, EOF 마스킹이면 사용자가 `/*` 를 치는 순간 50ms 디바운스가 그 노드의 입력 엣지를 전부 지운다 — 닫는 `*/` 를 쳐도 포트만 돌아오고 배선은 돌아오지 않는다. 잠정적·구문 미완성 편집이 그래프 상태를 파괴해서는 안 된다.

### 8.7 Goto / References / Rename (Phase 27 + Phase 28 cross-stage)

Phase 25 의 심볼 테이블 + `resolveSymbol` 을 그대로 재활용해 같은 declaration 으로 해석되는 모든 occurrence 를 모으고, 그 위에 (a) cursor 점프 (b) 단일 트랜잭션 rename (c) active reference 페인트 세 가지 surface 를 얹는다. Phase 28 에서 rename 은 ShaderNode 의 vertex + fragment 두 stage 를 묶는 *프로그램* 단위로 확장 — 한 `updateShaderSource({vertexSource,fragmentSource})` 패치 = 한 graph history push.

```
core/glsl/references.ts
   findReferences(source, name, atLine)
      ├─ buildSymbolTable + resolveSymbol(name, atLine) → target
      ├─ source 의 모든 identifier 위치 스캔(블록/라인 코멘트 마스킹)
      ├─ 각 위치에서 다시 resolveSymbol → target 과 line·column 일치만 채택
      └─ ReferenceSite[] (from/to/line/column/isDefinition) — document 순서

CodeMirror 와이어링 (glslSetup.ts)
   ├─ glslGotoDefinition()    F12 keymap + Cmd/Ctrl+Click DOM 핸들러
   │      └─ findDefinitionAt(view, pos) → EditorSelection.cursor + scrollIntoView
   ├─ glslRename()            F2 keymap
   │      └─ runRename(view, promptFn) → validateRenameName → findReferences
   │           → view.dispatch({ changes: sites.map(...) })  // single undo step
   └─ glslReferenceHighlight() StateField<DecorationSet>
          └─ docChanged || selection 변화 시 buildReferenceDecorations
                  → isDefinition ? .cm-glsl-ref-definition : .cm-glsl-ref-occurrence
```

- **Shadowing 규칙은 references 단에서 한 번 적용**: 한 occurrence 의 binding 이 target 과 다르면(예: 로컬이 글로벌을 가린 안쪽), 그 위치는 결과에서 빠진다. global rename 은 shadowed 안 된 곳만, local rename 은 자기 함수 본문만 변경되는 게 자동 보장된다.
- **멤버 / struct 본문 제외 (두 가드는 한 쌍)**: `precededByDot` 은 `light.color` · `v.xyz` 처럼 앞의 첫 비공백이 `.` 인 매치를 버리고, `structMemberNameOffsets` 는 `struct Light { vec3 color; }` 의 **멤버 선언자 이름 위치**(`color`)만 버린다. 본문 전체를 버리지 않는 게 핵심이다 — 멤버의 *타입* 토큰과 배열 크기 식(`struct Outer { Inner i; }` 의 `Inner`, `float v[MAX];` 의 `MAX`)은 실제 글로벌에 대한 진짜 사용처라서, 함께 버리면 선언만 개명되고 사용처가 남는 같은 실패가 반대 방향으로 재현된다. 심볼 테이블이 struct 멤버를 인덱싱하지 않으므로 **한쪽만 넣으면 rename 이 셰이더를 깨뜨린다** — 멤버 *선언*은 개명되고 그 멤버 *접근*은 dot 가드에 걸려 남기 때문. 커서 쪽에도 같은 가드가 있어 스위즐 글자 위 F2 / F12 는 조용한 no-op (`runRename` → `no-binding`, `findDefinitionAt` → `null`). **알려진 한계**: (1) 줄바꿈으로 분리된 `light\n  .color` 는 감지하지 않는다(가드는 현재 라인 안만 뒤로 훑는다). (2) 내장 struct 정의(`struct Outer { struct Inner { … } i; }`)의 안쪽 멤버 이름은 수집하지 않는다 — GLSL ES 가 내장 struct 정의를 금지하므로 이 형태는 애초에 컴파일되지 않는다. semanticTokens 는 dot 가드만 공유한다 — struct 멤버 선언은 여전히 동명 글로벌 색으로 칠해지지만 rename 대상이 아니므로 표시상의 문제일 뿐.
- **F12 / Cmd+Click 분기**: 키맵은 `view.state.selection.main.head` 기준, 클릭 핸들러는 `posAtCoords(clientXY)` 로 doc offset 계산. modifier(`metaKey || ctrlKey`) 가 없으면 무시 — CM 기본 selection 동작 보존. 미정의 식별자(builtin / keyword / no-binding) 는 silently no-op.
- **Rename UX**: 기본 prompt 는 `window.prompt` (가장 마찰 적은 경로). 검증은 `^[A-Za-z_][A-Za-z0-9_]*$` + `GLSL_KEYWORDS ∪ GLSL_TYPES` 예약어 set. 결과는 `RenameResult` discriminated union — `applied: true` 면 `{ sites, otherStageSites, newName }`(`otherStageSites` = 다른 stage 에서 교체된 site 수, single-document rename 은 0), false 면 `{ reason }` 로 5 종 skip 사유(`not-on-identifier` / `no-binding` / `prompt-cancelled` / `unchanged` / `invalid-name`).
- **Active highlight**: 단일 site(decl 만 존재)면 `Decoration.none` — 노이즈 회피. 비용은 cursor 이동마다 `buildSymbolTable + findReferences` 한 번이지만 playground 규모에서 < 1ms 추정이라 debounce 없음.
- **CodeEditor observation bridge (`ui/CodeEditor/currentView.ts`)**: `ui/CodeEditor/index.tsx` 가 mount/unmount 시 `setCurrentView(view)` / `setCurrentView(null)` 로 module-level ref 갱신. 프로덕션 코드는 의존하지 않고, `__sp.codeEditor = { getCursorLine, focus }` (DEV 한정) 으로 E2E 가 cursor 위치를 직접 읽는다 — F12 점프 결과 검증을 CM DOM 추측 없이 line number 비교로 처리.
- **DEV bridge 추가**: `window.__sp.codeEditor` (cursor introspection).

#### 8.7.1 Cross-stage rename (Phase 28)

ShaderNode 는 vertex + fragment 두 GLSL 소스를 한 *프로그램* 으로 묶는다 — uniform / varying / function / struct 같은 글로벌은 GLSL 링커가 한 binding 으로 본다. Phase 28 의 rename 은 이 사실을 반영해 두 stage 의 occurrence 를 같은 트랜잭션으로 교체한다.

```
core/glsl/references.ts
   findReferencesAcrossStages({vertex, fragment}, name, originStage, atLine)
      ├─ originSource = stages[originStage]
      ├─ resolveSymbol(originTable, name, atLine) → target
      ├─ findReferencesOf(origin) → originSites  (각 site.stage = originStage)
      │
      └─ if target.scope === null && CROSS_STAGE_KINDS.has(target.kind):
           otherTable = buildSymbolTable(otherSource)
           otherTarget = resolveSymbol(otherTable, target.name, 1)
           if otherTarget?.scope === null && CROSS_STAGE_KINDS.has(otherTarget.kind):
             findReferencesOf(other) → otherSites
      → sortByStageAndOffset(originSites + otherSites)

ui/CodeEditor/rename.ts
   runRename(view, promptFn, crossStage?)
      ├─ collectSites — crossStage 가 있으면 findReferencesAcrossStages,
      │                 없으면 Phase 27 의 findReferences
      ├─ split → localSites (= origin stage) + otherSites
      ├─ wroteOtherStage = crossStage && otherSites.length > 0
      ├─ if wroteOtherStage:
      │     newOrigin = applyEdits(source, localSites, next)
      │     newOther  = applyEdits(crossStage.otherStageSource, otherSites, next)
      │     crossStage.applyBothStages(newOrigin, newOther)   // 한 history push
      └─ view.dispatch({
            changes: localSites,
            // wroteOtherStage 면 CM undo 스택 제외 (#1c)
            ...(wroteOtherStage
                 ? { annotations: Transaction.addToHistory.of(false) } : {}),
         })

   ui/CodeEditor/editorNode.ts   (leaf — index.tsx 와 rename.ts 의 공용 규칙)
      pickEditorNodeId(selectedId, nodes)
         = selectedId ?? nodes.find(kind === 'shader')?.id ?? null
      currentEditorNodeId() = pickEditorNodeId(selection.getState(), graph.getState())

   resolveCrossStageContext()  (module-private)
      ├─ currentEditorNodeId() → ShaderGraphNode 이어야  (#10)
      ├─ editorStore.getState().activeStage → originStage
      └─ applyBothStages = (newOrigin, newOther) =>
            graphStore.updateShaderSource(sn.id, {
              vertexSource:  originStage === 'vertex' ? newOrigin : newOther,
              fragmentSource: originStage === 'vertex' ? newOther : newOrigin,
            })
```

- **`CROSS_STAGE_KINDS`**: `uniform / in / out / attribute / varying / const / function / struct`. 로컬 / 파라미터는 GLSL 링커가 다른 binding 으로 보므로 의도적으로 제외 — vertex `main` 의 `float k` 와 fragment `main` 의 `float k` 는 이름만 같은 별개 변수. 같은 stage 안에서는 Phase 27 의 shadowing 규칙 그대로.
- **Partial rename**: other stage 에 동명 글로벌이 없으면 (예: vertex 의 `in a_position`) origin-stage 단독 rewrite. 결과는 partial 이지만 정상 종료 — 오류 아님.
- **Other-stage shadowing**: other stage 의 글로벌 binding 은 잡되, 그 안에서 같은 이름의 로컬이 가린 곳(`resolveSymbol` 이 로컬을 돌려주는 위치)은 자동 제외. global rename 이 local 을 망가뜨리지 않는다.
- **Single graph-history push**: `applyBothStages` 가 한 `updateShaderSource({ vertexSource, fragmentSource })` 패치로 양 stage 를 동시에 set. 이후 CM dispatch 가 origin stage 의 view 를 갱신하고, 50 ms 후 commit debounce 가 다시 `updateShaderSource(...)` 를 부를 때는 store 값이 같아 early-return → 추가 push 없음.
- **Undo 범위 (2026-07 리뷰 #1c)**: other stage 를 실제로 쓴 CM dispatch 는 `Transaction.addToHistory.of(false)` 라 **CM undo 스택에 없다**. CM history 는 view 의 한 문서만 커버하므로 undo 를 허용하면 보이는 stage 만 되돌아가고 짝 stage 는 새 이름으로 남아 링크가 깨진다. 대가: `KeyboardShortcuts.tsx` 가 `.cm-editor` 안을 editing target 으로 보고 Cmd+Z 를 CodeMirror 에 양보하므로 **에디터 포커스 상태에서는 cross-stage rename 이 키보드로 되돌려지지 않는다**. graph history 의 단일 엔트리는 살아 있으므로 에디터 밖에서 Cmd+Z 를 누르면 전체가 한 번에 복구된다. partial rename(other stage 미기록)과 단일 문서 rename 은 종전대로 CM undo 1 스텝.
- **ComputeNode / 비-Shader 편집 대상**: `resolveCrossStageContext()` 가 `undefined` 반환 → `runRename` 은 Phase 27 의 single-document 경로로 폴백. 단위 테스트와 ComputeNode 편집기에서 기존 동작 변화 없음.
- **편집 대상 노드의 단일 규칙 (#10)**: Code 패널은 선택이 없어도 그래프의 첫 `shader` 노드를 연다. 그 규칙은 `ui/CodeEditor/editorNode.ts` 의 `pickEditorNodeId(selectedId, nodes)` 하나뿐이고, `CodeEditor/index.tsx` 는 zustand 셀렉터 **안에서**(reactive 유지), `rename.ts` 는 `currentEditorNodeId()` 로 같은 규칙을 읽는다. 별도 leaf 모듈인 이유는 순환 회피 — `rename.ts → index.tsx → glslSetup.ts → rename.ts` 는 `npm run circular`(dpdm) 하드 게이트에 걸린다.

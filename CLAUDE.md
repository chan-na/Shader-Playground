# ShaderPlayground — Claude 작업 규약

React 18 + Zustand + React Flow + CodeMirror 6 + raw WebGL2 기반 셰이더 노드 그래프 플레이그라운드다. 이 저장소는 **품질 게이트가 머지의 전제 조건**이다. 모든 변경은 아래 게이트를 100% 통과한 상태로 마무리하고, 통과하지 않은 채 완료를 보고하지 않는다.

---

## 0. 작업 종료 전 필수 명령

Node 22 (`.nvmrc`, CI와 동일). 코드 수정이 끝나면 **순서대로 실행하고 모두 성공**해야 한다:

```bash
npm run check       # typecheck → lint → deadcode → circular → unit test (하나라도 실패하면 중단)
npm run test:e2e    # Playwright E2E (tests/e2e, Phase 1~39)
```

CI(`.github/workflows/check.yml`)는 `check` · `e2e` · `bundle-size`(`npm run build && npm run size:check`) **3잡**이며 모두 통과해야 머지된다. 번들에 영향을 줄 수 있는 변경(의존성 추가, 큰 모듈 추가, 동적 import 경계 변경)이면 `npm run build && npm run size:check`도 로컬에서 돌린다 (§1-7).

UI에 영향을 주지 않는 순수 내부 변경(주석, 로깅 문구)이라 E2E를 생략하고 싶다면, 그 사실을 **명시적으로 사용자에게 알리고 확인**을 받은 뒤에만 생략한다. 임의 판단 금지.

---

## 1. 품질 게이트 상세

### 1-1. TypeScript (`npm run typecheck`)

- `strict`, `noUnusedLocals` / `noUnusedParameters`(의도된 미사용은 `_` 접두사), `noFallthroughCasesInSwitch`.
- `noUncheckedIndexedAccess` — 인덱스 접근은 항상 `T | undefined`. 길이 가드 후 명백히 안전할 때만 `!` 또는 `biome-ignore`를 사유와 함께.
- `exactOptionalPropertyTypes` — optional 프로퍼티에 `undefined`를 명시적으로 할당하지 말 것.
- `any` / `as unknown as T`로 우회하지 말 것. 타입 시스템이 표현 못 하는 외부 경계라면 사유를 주석으로 남긴다.

### 1-2. Biome 린트/포맷 (`npm run lint`)

`biome.json` 기준. error·**warn 모두 0건**을 유지한다.

- 주요 룰: `noNonNullAssertion`(warn, 사유 없는 `!` 금지) · `useImportType`(error) · `noExplicitAny`(warn) · `useExhaustiveDependencies`(warn) · `useHookAtTopLevel`(error).
- 포맷: 2-space, lineWidth 80, double quote, semicolon, trailing comma all, arrow paren always. 자동 수정은 `npm run lint:fix` / `npm run format` — 의미를 바꾸지 않는지 한 번 더 확인.
- **`biome-ignore` 정책 (임의 추가 금지):** 모든 ignore에 사유 주석 필수. ignore보다 리팩터로 해소 가능한지 먼저 검토. 새 ignore가 필요하면 사유와 대안 검토 결과를 사용자에게 보고하고 합의받는다.

### 1-3. Knip 데드코드 (`npm run deadcode`)

미사용 export / 타입 / dep **0건**.

- 새 헬퍼·컴포넌트·타입은 **실제 호출자와 같은 PR**에 넣는다.
- `knip.json`의 entry는 `*.test.ts(x)`라서 **테스트에서만 쓰는 export도 "사용됨"으로 통과한다.** 프로덕션 호출자가 없는 export를 늘리지 말 것 (테스트 시드용 export는 지양).
- 의존성 추가 시 실제 import 코드와 함께 커밋.

### 1-4. 순환 의존성 (`npm run circular`)

`dpdm --exit-code circular:1 src/main.tsx`, **0건** 유지. `-T` 없이 돌기 때문에 **type-only import도 순환에 포함**된다.

- 순환이 생길 구조면 공통 타입/의존성을 leaf 모듈로 분리하거나 콜백 주입으로 단방향화한다 (예: `graphStoreTypes.ts`, `core/external/types.ts`·`resolvers.ts`).
- store끼리 서로 import 금지. 한쪽이 다른 쪽의 selector/subscribe API에만 의존하는 단방향 구조.

### 1-5. 단위 테스트 + 커버리지 (`npm run test`, `npm run test:coverage`)

Vitest 4 + jsdom, 테스트는 대상 모듈 옆 `src/**/*.test.{ts,tsx}`. 커버리지 임계치(`vitest.config.ts`): lines 50 · functions 47 · branches 42 · statements 50.

- 신규 로직은 단위 테스트를 동반한다. 임계치를 **낮추지 말고**, 커버리지 제외 목록(`main.tsx`, `test-setup.ts`, `vite-env.d.ts`, `export/standalonePlayer.js`)에 임의로 추가하지 말 것.
- **공용 테스트 헬퍼를 재정의하지 말고 import한다:** `state/testStores.ts`(`resetAllStores()`), `core/graph/testNodes.ts`(노드 팩토리), `ui/NodeEditor/testFlow.tsx`(ReactFlowProvider 렌더), `ui/dock/testDockTree.ts`, `core/gl/fakeGl.ts`(가짜 WebGL2).
- `src/test-setup.ts`가 jsdom 미구현 API(media play/pause/load, canvas getContext)를 조용한 스텁으로 바꿔 출력 소음을 없앤다. 테스트 출력이 다시 시끄러워지면 원인을 고친다.

### 1-6. Playwright E2E (`npm run test:e2e`)

SwiftShader WebGL, chromium 단일, 직렬(`workers: 1`). 파일명은 `tests/e2e/phase-N-*.spec.ts`로 SPEC Phase 번호를 접두사로 쓴다. 한 파일이 여러 Phase를 덮거나(`phase-1-2-*`), 한 Phase가 여러 파일이거나(35·37·38), 전용 스펙이 없는 Phase(0·22·32)도 있으므로 정확한 매핑은 SPEC.md §4 표를 본다 (Phase 35 = `phase-35-*`: dock-chrome/drag/persistence + code-auto-open).

- 앱 상태는 `src/main.tsx`가 노출하는 `window.__sp` 테스트 훅으로 다룬다. 헬퍼는 `tests/e2e/helpers/`(`sp.ts`의 `withSp`/`readSp`, `dom.ts`의 `boxOf`, `editor.ts`, `render.ts`, `fixtures.ts`) — 스펙 안에서 재구현하지 말 것.
- UI/상호작용/렌더 파이프라인 변경은 관련 Phase 스펙을 통과해야 한다. 실패 시 회귀를 먼저 의심하고, 의도된 동작 변경이면 **사용자 합의 후** 스펙을 갱신한다. expectation 약화 금지.
- 순수 함수 검증은 단위 테스트로 한다. E2E는 DOM·렌더·실제 GL·워커처럼 jsdom이 못 보는 것만.
- dev 서버는 `webServer`가 자동으로 띄우고(기본 포트 5179, `E2E_PORT`로 변경), 떠 있는 서버는 재사용된다 — 다른 체크아웃의 서버를 잘못 재사용하지 않도록 worktree에서는 `E2E_PORT`를 바꾼다.
- 고정 `waitForTimeout` 대신 `expect.poll`/locator 대기. 새 스펙은 단독 `--repeat-each=8`로 안정성을 확인한다. `npm run test:e2e | tail`처럼 파이프로 결과를 판단하지 말 것(종료 코드가 tail의 것).

### 1-7. 번들 크기 (`npm run size:check`, CI `bundle-size` 잡)

`scripts/check-bundle-size.mjs`가 JS gzip을 잰다: **entry ≤ 375 KiB, 전체 ≤ 430 KiB** (`LIMITS_KIB`). CSS는 대상이 아니다.

- **Node 22로 측정한 값만 게이트 값이다.** Node ≥24는 zlib-ng라 약 1.8 KiB 작게 나온다 — 로컬 PASS가 CI PASS를 뜻하지 않는다.
- 초과 시 한도를 올리지 말고 사용자에게 보고한다. 한도 변경 이력은 `docs/archive/bundle-budget-history.md`.

---

## 2. 코드베이스 지도

상세 정본은 `Architecture.md` §12(디렉토리 맵)·§13(도킹). 요약:

| 경로 | 내용 |
|---|---|
| `src/main.tsx`, `App.tsx` | 엔트리(`window.__sp` 훅 포함) · 셸: `AppToolbar` → `DockLayout` → `StatusBar` |
| `src/core/` | React 없는 순수 TS: `graph/`(컴파일·실행·검증) · `gl/`(WebGL2 래퍼) · `glsl/`(검증 워커, 심볼 테이블, LSP 기능) · `nodes/`(포트 스펙 단일 원본) · `external/`(웹캠·비디오·오디오) · `assets/` · `camera/` · `thumbnail/` · `gif/` |
| `src/state/` | Zustand 스토어 + 직렬화/공유/자동저장. `graphStore.ts`는 `graphStoreTypes`·`Groups`·`NodeConfig`·`Helpers` 슬라이스로 조립 |
| `src/ui/dock/` | 도킹 기능 전체(모델 `tree/geometry/drop/snapshot`, `dockStore`, 렌더러). `state/`가 여기를 import하는 것은 허용된 예외 |
| `src/ui/` | `NodeEditor/` · `CodeEditor/` · `Viewport/`(단일 RAF 루프) · `Panels/`(Inspector 등) · `CommandPalette/` · `ExportShare/` · `controls/`(폼 컨트롤) + 셸 조각 |
| `src/styles/` | `NN-*.css` 영역별 파셜. `src/index.css`는 `@import` 목록뿐이며 **번호 순서가 cascade 순서**다 |
| `src/theme.ts` | 디자인 토큰 (CSS 변수로 주입) |
| `src/export/`, `src/shaders/`, `src/utils/`, `src/build/` | 단일 HTML export · 빌트인 GLSL · 공용 유틸 · Vite 플러그인 |

문서:

- `SPEC.md` — Phase 인덱스(현재 동작 · E2E 파일 · 영역 문서). Phase 본문은 `docs/spec/*.md`. 새 Phase는 40부터.
- `Architecture.md` — 구조·모듈 경계. GLSL 에디터 지능은 `docs/architecture/glsl-editor.md`.
- `design/` — 디자이너 핸드오프 번들. **UI의 정본은 `design/*.dc.html`** (+ `design/README.md` 규칙, `design/CHANGELOG.md` 결정 기록). `design/theme.ts`는 원본 보관용이며 앱은 `src/theme.ts`를 쓴다.
- `docs/learnability-plan-2026-08.md`, `docs/review-2026-07-followup.md` — 남은 결정·백로그. `docs/archive/` — 역사 자료(작업에 필요할 때만).
- `temp/`는 gitignore된 로컬 전용 폴더다. 커밋되는 코드·문서에서 참조하지 말 것.

---

## 3. 주석 규약

주석은 다음 에이전트가 읽는 컨텍스트다. 썩지 않게 쓴다.

- **줄번호를 인용하지 않는다** (`L123`, `~L45`, `file.ts:80`). 심볼·셀렉터·함수명·섹션 제목으로 가리킨다: `design/Side Panel.dc.html (AUTO badge)`, `` dc `computeDrop` ``, `.dock-header-tabs`.
- **리뷰/라운드 ID(F22, M1-U3, B6-U1, L23 …)·버전 태그(v2.1)·변경 이력을 코드 주석에 쓰지 않는다.** 현재 동작과 그 이유(WHY)만 남긴다. 이력은 git과 `design/CHANGELOG.md`에 있다. 예외: `Phase N`, 그리고 `design/CHANGELOG.md`·`design/README.md`에 정의된 디자인 결정 ID(R*/S*/T*/V*/W*/X*/Y*/Z*/Q*, [Dn]/[C-n]/[B-n])는 근거·의도적 이탈을 가리키는 앵커로 인용해도 된다. 이때는 문서 경로와 함께 쓴다(예: `design/CHANGELOG.md §v1.4 R9`). `temp/`나 닫힌 리뷰 라운드에서만 풀리는 ID는 금지.
- 파일을 옮기거나 쪼개면 그 경로를 인용하는 주석·문서도 같이 고친다 (`grep -rn <옛 경로>`).
- 진짜 근거·불변식·함정·우회 사유는 지우지 않는다 — 가장 가치 있는 주석이다.

---

## 4. 작업 워크플로

1. **계획**: 변경 범위와 영향받을 게이트(단위 테스트 파일, E2E Phase) 식별.
2. **구현**: §1 제약을 처음부터 만족하게 작성. 파일이 커지면 기존 경계(섹션 배너, 슬라이스)를 따라 분리하고 barrel/re-export 파일은 만들지 않는다(Knip·dpdm 교란).
3. **단위 테스트**: 신규 로직은 테스트 동반. 고치기 전에 런타임에서 먼저 재현한다 — 코드만 읽고 확신한 버그가 실제로는 범위가 다른 경우가 많았다.
4. **E2E 영향 확인**: 회귀면 코드를 고치고, 의도된 변경이면 사용자에게 스펙 갱신 합의를 요청.
5. **로컬 게이트**: `npm run check && npm run test:e2e` (+ 필요 시 §1-7). 둘 다 초록일 때까지 완료로 간주하지 않는다.
6. **보고**: 실행한 게이트와 결과를 명시. 실행하지 않은 게이트가 있으면 그 사실과 사유를 밝힌다.

검증 요령:

- "아무 일도 안 일어난다" 단언은 따로 빨갛게 만들어 볼 수 있는지 확인한다 — 앞선 단언이 먼저 실패해 빈 단언이 통과처럼 보일 수 있다.
- 임시 프로브 테스트는 `src/**/*.test.ts(x)` 위치여야 vitest가 잡고, Knip이 테스트 파일을 entry로 보므로 남은 프로브를 잡아주지 않는다 — 끝나면 지운다.
- `src/ui/Viewport/index.tsx`는 단위 커버리지 0%다. 여기 변경은 E2E로만 검증된다 — 불변식을 스토어나 순수 함수로 빼서 단위 테스트하고, 배선만 E2E로 덮는다.
- React Flow `internal.measured`는 effect의 rAF 시점에 `undefined`일 수 있다: `measured` → DOM `offsetWidth/Height` → 폴백 순으로 해석한다.

---

## 5. 금지 사항 (게이트 우회)

명시적 사용자 승인 없이는 **절대 하지 않는다**:

- `tsconfig.json` strict 옵션 완화
- `biome.json` 룰 `off` 또는 includes에서 파일 제외
- `vitest.config.ts` 커버리지 임계치 하향, `coverage.exclude`에 신규 파일 추가
- `knip.json`의 `ignore` / `ignoreDependencies`에 항목 추가
- `dpdm` exit code 무시 또는 `circular` 스크립트 변경
- `scripts/check-bundle-size.mjs`의 한도 상향
- Playwright 스펙의 `expect` 약화, `test.skip`, `test.fixme` 추가
- `--no-verify`, `--force`, `--skip-checks` 등 hook/CI 우회 플래그
- 새로운 `biome-ignore` 추가 (§1-2 절차)

게이트는 실제 손실·회귀가 있었던 자리에 세운 것이다. 게이트를 끄지 말고 코드를 고쳐서 통과시키는 것이 기본이다.

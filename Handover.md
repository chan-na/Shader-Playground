# Handover — Lint/Static Analysis/Coverage 후속 작업

> 2026-05-12 갱신. 진행 이력:
> - `000aaca chore: Biome / Knip / dpdm / vitest coverage 도구 셋업`
> - `7cad6bc style: Biome 포매팅 + 안전한 lint fix 일괄 적용`
> - `72889d2 docs: Handover.md — lint/static-analysis/coverage 후속 작업 핸드오프`
> - `313dd23 chore: Biome 잔여 진단 0 errors / 0 warnings 정리 (P1)`
> - `ec47df1 refactor: graphStore ↔ historyStore 순환 의존성 해소 (P3)`
> - `289f082 chore: Knip 미사용 dep/export/type 정리 (P2)`
> - `f51008e chore: GitHub Actions CI 도입 (P6)`
> - `1516da3 chore: tsconfig noUncheckedIndexedAccess 도입 (P4-a)`
> - **이번 세션**: P4-b (`exactOptionalPropertyTypes` 도입) — tsconfig 옵션 추가, **7 errors / 7 files** (추정 130에 비해 훨씬 적음) 처리. 모두 동일한 "optional 필드에 명시적 `undefined` 전달" 패턴이라 conditional spread (`...(v && { key: v })`) 또는 분리 할당으로 일괄 처리. `biome-ignore` 추가 없음. `npm run check` exit 0 (182/182) + `npm run build` 성공.

## 현재 상태

| 항목 | 상태 |
|---|---|
| `tsc --noEmit` (`noUncheckedIndexedAccess` + `exactOptionalPropertyTypes` 포함) | 0 errors |
| `vitest run` | 182/182 pass |
| `vite build` | 성공 |
| `vitest run --coverage` | lines 30.68% / branches 83.39% / functions 55.04% / statements 30.68% (임계값 통과, Vitest 3 기준) |
| `biome check` | **0 errors / 0 warnings** ✅ |
| `knip` | **0 errors** ✅ |
| `dpdm` | **0건** ✅ |
| `npm run check` | **exit 0** (typecheck + lint + deadcode + circular + test 일괄 통과) ✅ |

## 도입된 도구 / 설정

- `biome.json` — Biome 2.4.15 (린트 + 포매터)
- `knip.json` — Knip 6.12.2 (dead code)
- `vitest.config.ts` — `vitest` / `@vitest/coverage-v8` 3.2.4 (P5에서 v2.1.9 → v3.2.4 업그레이드)
- `package.json` 스크립트: `lint`, `lint:fix`, `format`, `typecheck`, `deadcode`, `circular`, `test:coverage`, `check`

**중요 컨텍스트**:
- `src/export/standalonePlayer.js`는 ES5 호환 vanilla JS(export HTML에 그대로 인라인되는 런타임)이라 Biome `files.includes`에서 `!` 패턴으로 제외 처리되어 있음
- 이전 세션에서 `--unsafe` 자동 수정 시 회귀가 발견된 케이스 2가지:
  1. `useExhaustiveDependencies` — `src/ui/NodeEditor/index.tsx`의 `const rev = useGraphStore((s) => s.rev)` 가 `useEffect` deps용 zustand 구독 부작용으로 의도된 것인데, 자동 수정이 deps에서 빼면서 미사용 변수가 됨
  2. `useOptionalChain` — `if (a && a.value) return a` 같은 패턴을 `if (a?.value) return a`로 바꾸면 `a` 타입 좁힘이 깨져서 후속 코드가 TS18048 발생 (`src/core/assets/objLoader.ts` 등)
- 따라서 `npm run lint:fix`는 `--write` (safe only)로 설정됨. `--unsafe` 옵션은 항상 변경을 검토 후 적용할 것

---

## 미해결 항목 (우선순위)

### ~~P1. Biome 잔여 진단 정리~~ ✅ 완료 (2026-05-11)

처리 요약:

| 룰 | 처리 전 | 처리 방식 |
|---|---|---|
| `a11y/useButtonType` | 34 errors | 6개 파일에 `type="button"` 일괄 추가 |
| `a11y/noStaticElementInteractions` (×3) + `a11y/useKeyWithClickEvents` (×2) | 5 errors | `ProblemsPanel`/`CommandPalette` 행을 `<button>`로 변환 + CSS reset 추가. `NodeEditor/index.tsx`의 파일 드롭 zone은 `// biome-ignore` (키보드 대안은 툴바 Import 버튼) |
| `suspicious/noArrayIndexKey` | 3 errors | `UniformControl`은 `key={labels[i]}` (x/y/z/w 고정), `ProblemsPanel`은 composite stable key |
| `correctness/useHookAtTopLevel` | 2 errors | `execute.ts` 파일 상단에 `// biome-ignore-all` — `gl.useProgram` 은 WebGL API false positive |
| `suspicious/noAssignInExpressions` | 1 error | `RegExp.exec` 루프에 inline biome-ignore |
| `complexity/useOptionalChain` | 1 warning | `objLoader.ts:15` `if (a?.value) return a` 적용 — TS 좁힘 OK (이전 우려 무효) |
| `correctness/useExhaustiveDependencies` | 1 warning | `NodeEditor/index.tsx`의 zustand 구독 deps는 의도된 패턴, biome-ignore |
| `style/noNonNullAssertion` | 30 warnings | `biome.json` overrides로 `**/*.test.ts*` 에서 off (23건). 프로덕션은 `execute.ts` 파일-레벨 ignore (6건) + `validate.ts:105` inline ignore (1건) |

**변경 사항 위치**:
- `biome.json` — `overrides` 추가 (테스트는 `noNonNullAssertion` off)
- `src/index.css` — `.problem-row` / `.cmdk-row` button 기본 스타일 reset
- `src/ui/{Panels/ProblemsPanel,CommandPalette/index,NodeEditor/index,Panels/AssetBrowser,Panels/SidePanel,Panels/ViewportControls,Panels/UniformControl,NodeEditor/Toolbar,BootstrapGate,CodeEditor/StageTabs}.tsx`
- `src/core/graph/{execute,validate,uniformParser}.ts`, `src/core/assets/objLoader.ts`

`npm run typecheck`, `npm run lint`, `npm run test`, `npm run build` 모두 통과.

### ~~P2. Knip false positive 정리 + 설정 다듬기~~ ✅ 완료 (2026-05-11)

처리 요약:

| 항목 | 처리 전 | 처리 방식 |
|---|---|---|
| `knip.json` 설정 힌트 | 5 hints | `dist/**` ignore + redundant entry 4개 제거 |
| 미사용 dependencies | 4 | `npm uninstall @codemirror/search @lezer/highlight @loaders.gl/images codemirror` — grep으로 src 사용 0건 검증 후 |
| 진짜 dead 함수/타입 (정의만 있고 호출 없음) | 8 | 함수 자체 삭제: `listCachedIds`/`clearCache` (`cache.ts`), `readbackThumbnail` (`thumbnail/readback.ts`), `makeEditorState` (`glslSetup.ts`), `totalProblems` (`ProblemsPanel.tsx`), `_resetAutoSaveForTests` + `stopAutoSave` (`autoSave.ts`, 연쇄). 타입: `Port`, `SwizzleVecKind` (`graph/types.ts`) |
| 파일 내부에서만 쓰이는 export | 18 | `export` 키워드만 제거 (로컬화). 함수 4건 (`loadGltfFromArrayBuffer`, `loadImageFromBlob`, `paramValue`, `importFile`) + 상수/함수 2건 (`AUTOSAVE_DEBOUNCE_MS`, `saveSession`) + 타입 12건 (`AssetCatalog`/`SamplerBinding`/`ParamBinding`/`OutputBinding`/`BaseNode`/`OutputGraphNode`/`UniformType`/`Vec`/`JumpRequest`/`RecorderStatus`/`RendererStats`) |

`_resetAutoSaveForTests` 는 현재 어떤 테스트도 호출하지 않아 삭제. 미래에 다시 필요하면 export로 재공개 가능. YAGNI 원칙.

부수 정리: `readback.ts`의 unused `Framebuffer` 타입 import + `glslSetup.ts`의 unused `EditorState` value import 제거.

검증: `npm run check` exit 0 (전 단계 통과). 빌드/테스트/순환 모두 클린.

### ~~P3. 순환 의존성 (1건)~~ ✅ 완료 (2026-05-11)

원인: `historyStore.ts`가 `graphStore.ts`에서 `NodePosition`을 type-only import. dpdm은 `import type`도 의존으로 집계하므로 순환으로 잡힘.

처리: 공유 타입을 `src/state/types.ts`로 추출 (옵션 2). 모든 사용처(`graphStore`, `historyStore`, `serialization`, `demoGraph`, `shareUrl`, `htmlExport`) import 경로를 `./types` / `../state/types`로 일괄 변경. graphStore의 `NodePosition` 정의 제거.

검증: `dpdm` 0건, `tsc --noEmit` 통과, `biome check` 0 errors/warnings, `historyStore.test.ts` + `graphStore.test.ts` 12/12 통과, `vite build` 성공.

### ~~P4-a. `noUncheckedIndexedAccess`~~ ✅ 완료 (2026-05-12)

처리 요약:

| 항목 | 처리 전 | 처리 후 |
|---|---|---|
| `tsc --noEmit` (옵션 ON) | 123 errors / 19 files | **0 errors** ✅ |
| 변경 파일 | — | 19 (비-테스트 13 + 테스트 6) |
| `biome.json` | 변경 없음 | 변경 없음 (`noNonNullAssertion` 정책 유지) |
| 신규 file-level `biome-ignore-all` | 1 (`execute.ts`) | **9** (`objLoader`, `primitives`, `diagnostics`, `uniformParser`, `nodes/utility`, `thumbnail/readback`, `state/historyStore`, `state/shareUrl` 추가; `execute.ts`는 기존 유지) |
| 신규 inline `biome-ignore` | 5 | 5 + **3** (`state/assetActions`, `NodeEditor/index`, `NodeEditor/nodes/UtilityNodeViews`) |

**접근 방식**:
- `noUncheckedIndexedAccess`는 `arr[i]`, `regex.exec[n]`, 타입 배열 등 모든 인덱스 접근을 `T | undefined`로 좁힘
- 비-테스트 코드: 루프 경계가 수학적으로 안전한 hot path(메시 생성/파서)와 정규식 캡처가 다수 → `!` 단언이 가장 깔끔. 해당 파일들에 `// biome-ignore-all lint/style/noNonNullAssertion: <이유>` 추가
- 테스트 코드: 이미 `noNonNullAssertion: off` override 적용 중 → `!` 단언만 추가
- `out[i] += x` 같은 복합 할당은 LHS에 `!`가 안 먹어서 `out[i] = out[i]! + x` 형태로 풀어씀

**검증**: `npm run check` exit 0 (typecheck 0/lint 0/0/knip 0/dpdm 0/test 182/182), `npm run build` 성공.

### ~~P4-b. `exactOptionalPropertyTypes`~~ ✅ 완료 (2026-05-12)

처리 요약:

| 항목 | 처리 전 | 처리 후 |
|---|---|---|
| `tsc --noEmit` (옵션 ON) | **7 errors / 7 files** (추정 130 → 실측 7) | **0 errors** ✅ |
| 변경 파일 | — | 7 (모두 비-테스트) |
| 신규 `biome-ignore` | — | **0** (룰 위반 없음) |

**케이스별 처리** — 모두 "optional 필드(`prop?: T`)에 명시적 `undefined` 또는 `T | undefined` 전달"이라는 동일 패턴:

| 파일 | 위치 | 처리 |
|---|---|---|
| `core/assets/cache.ts` | `serializeMesh` 의 `indices: ... ? {...} : undefined` | conditional spread `...(indices && { indices: {...} })` |
| `core/assets/gltfLoader.ts` | `reshape.attributes.{POSITION,NORMAL,TEXCOORD_0}` + `indices` | 각 값 캡처 후 conditional spread |
| `core/graph/diagnostics.ts` | `out.push({ column: colOrLine })` | `...(colOrLine !== undefined && { column: colOrLine })` |
| `core/graph/uniformParser.ts` | `controlOrder` 배열 element type | `value: NonNullable<UniformHints["control"]>` 로 narrow |
| `state/serialization.ts` | `case "param"` 의 `label: n.label` | `...(n.label !== undefined && { label: n.label })` |
| `ui/CodeEditor/StageTabs.tsx` | `<Tab dimmed={vertexDimmed} title={... : undefined} />` | `dimmed={vertexDimmed ?? false}` + JSX spread `{...(vertexDimmed && { title: "..." })}` |
| `ui/Panels/ProblemsPanel.tsx` | `requestJump({ column: entry.diag.column })` | conditional spread |

**왜 7개로 끝났나**: P4-a (`noUncheckedIndexedAccess`)가 인덱스/배열/정규식 접근 전반을 건드리는 광범위한 변화인 반면, `exactOptionalPropertyTypes`는 객체 리터럴 작성 시점만 영향. 이 코드베이스는 (1) 대부분 zustand store mutator가 명시적인 set/update 패턴이고 (2) 객체 spread 시 `key: undefined`를 직접 쓰는 곳이 적어서 실측값이 추정보다 훨씬 작음.

**검증**: `npm run check` exit 0 (typecheck 0/lint 0/0/knip 0/dpdm 0/test 182/182), `npm run build` 성공.

### ~~P5. Vitest 3 업그레이드~~ ✅ 완료 (2026-05-11)

처리 요약:

| 항목 | 처리 전 | 처리 후 |
|---|---|---|
| `vitest` | 2.1.8 (실제 lock: 2.1.9) | **3.2.4** |
| `@vitest/coverage-v8` | 2.1.9 | **3.2.4** |
| 테스트 결과 | 182/182 pass | **182/182 pass** (회귀 0) |
| 커버리지 (lines / branches / functions / statements) | 31 / 82 / 52 / 31 | **30.68 / 83.39 / 55.04 / 30.68** (AST remapping으로 함수/브랜치 정확도 ↑) |

코드 변경 사항: **없음**. `package.json` devDependencies 두 줄만 교체. `vitest.config.ts`, `src/test-setup.ts`, 테스트 파일 모두 v3 API와 호환되어 마이그레이션 작업이 발생하지 않음 (Vite 6 + jsdom 25 + 기존 config가 그대로 동작).

검증: `npm run typecheck`, `npm run check` (typecheck + lint + deadcode + circular + test), `npm run test:coverage`, `npm run build` 모두 exit 0.

미래에 Vitest 4로 한 번 더 올릴 때는 v3→v4 마이그레이션 가이드 별도 확인 필요.

### ~~P6. CI 추가 (GitHub Actions)~~ ✅ 완료 (2026-05-11)

처리 요약:

| 항목 | 내용 |
|---|---|
| 신설 파일 | `.github/workflows/check.yml` |
| 트리거 | `push: branches: [main]` + `pull_request: branches: [main]` |
| 동시성 제어 | `concurrency` 그룹 + PR에 한해 `cancel-in-progress: true` (push는 유지) |
| 권한 | `permissions: contents: read` (최소 권한) |
| 환경 | `ubuntu-latest`, Node 22 LTS, `actions/setup-node@v4`의 `cache: npm` 활용 |
| 실행 | `npm ci` → `npm run check` (typecheck + lint + deadcode + circular + test) |

로컬 재검증: `npm run check` exit 0 (typecheck 0 errors, biome 0/0, knip 0, dpdm 0, vitest 182/182). 워크플로 동작은 다음 push/PR에서 실제 확인 필요.

커버리지 업로드(codecov/coveralls) 및 빌드 게이트(`vite build`)는 의도적으로 포함하지 않음 — Handover에서 "단일 잡으로 충분" 지침 준수. 필요해지면 같은 잡에 step 추가 또는 별도 잡으로 확장 가능.

### ~~P7. `useButtonType` 일괄 처리 후 readability~~ ✅ P1과 함께 완료

### P8. (선택) Biome ignore의 정당성 재검토

- file-level `biome-ignore-all`:
  - `src/core/graph/execute.ts` — useHookAtTopLevel(WebGL false positive) + noNonNullAssertion(WebGL 세팅)
  - **P4-a에서 추가된 9개 파일** (모두 `noUncheckedIndexedAccess`로 인한 구조적 `!` 사용): `core/assets/objLoader`, `core/assets/primitives`, `core/graph/diagnostics`, `core/graph/uniformParser`, `core/nodes/utility`, `core/thumbnail/readback`, `state/historyStore`, `state/shareUrl`. 각 파일 첫 줄에 사용 패턴 명시
- inline `biome-ignore`: 기존 5건 + P4-a에서 추가 3건 (`state/assetActions`, `NodeEditor/index` line 178, `NodeEditor/nodes/UtilityNodeViews`)
- 미래에 룰 자체를 `off`로 내릴지 검토 가능 (특히 `noNonNullAssertion`은 테스트만 끄도록 override 됨). `noUncheckedIndexedAccess` 도입 후 hot-path 파일은 file-level ignore가 더 자연스러움

---

## 명령어 치트시트

```bash
# 진단만 (수정 없음)
npm run lint
npm run lint -- --reporter=summary   # 룰별 집계

# 안전 자동 수정
npm run lint:fix

# unsafe 자동 수정 (회귀 검토 필수)
npx biome check --write --unsafe

# 포매팅만
npm run format

# dead code
npm run deadcode

# 순환 의존성
npm run circular

# 커버리지
npm run test:coverage   # 결과는 coverage/index.html

# CI 전체 묶음
npm run check
```

---

## 알려진 함정

1. **standalonePlayer.js는 ES5라 Biome 대상 아님** — 수정 시 `biome.json`의 `files.includes`에서 의도적으로 제외하고 있음을 잊지 말 것
2. **unsafe fix는 한 파일 단위로 검토하며 적용** — 전체 `--unsafe`는 zustand 구독 패턴 (`NodeEditor/index.tsx`) 등을 깨뜨릴 수 있음. 단, `objLoader.ts` 의 `if (a?.value)` 케이스는 TS 4.4+ 좁힘이 정상 동작하므로 안전 (이번 세션에서 검증)
3. **`useExhaustiveDependencies` warn은 진짜 버그/false positive 혼재** — zustand `useStore((s) => s.x)` 부작용 구독은 deps에 들어가야 정상
4. ~~**Vitest 2.1.x V8 커버리지의 라인 매핑 부정확 가능성**~~ — P5에서 Vitest 3.2.4 + AST 기반 V8 remapping으로 해소. 더 정확한 교차 검증이 필요하면 `provider: "istanbul"`로 임시 전환 가능
5. ~~**순환 의존성 해결 시 history 동작 회귀 주의**~~ — P3 처리 시 양쪽 store 테스트 회귀 없음을 확인함 (12/12 통과)
6. ~~**`npm run check` 는 현재 P2 (knip dead code) 때문에 exit 1**~~ — P2 처리 후 `npm run check` exit 0 달성. CI 도입(P6) 가능 상태
7. **RTK 프록시 환경에서 `npx biome check` 출력이 잘려 보일 수 있음** — 정확한 진단 보려면 `rtk proxy npx biome check --reporter=summary --max-diagnostics=100` 등 raw 호출 사용

## 참고 파일

- `biome.json` — 룰 튜닝 시 수정. `linter.rules` 트리에 룰명 그대로 명시 (`"style": { "noNonNullAssertion": "off" }` 식)
- `knip.json` — 의도적 export(테스트 헬퍼 등)를 보호하려면 `ignoreExportsUsedInFile`/`ignore` 추가. 현재는 0 errors 상태
- `vitest.config.ts` — 커버리지 임계값. UI/WebGL 테스트가 추가되면 점진적으로 상향
- 직전 측정 시점의 진단 분포는 본 문서 P1 표 기준 — 잔여 항목 처리하면 갱신할 것

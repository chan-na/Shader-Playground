# Handover — Lint/Static Analysis/Coverage 후속 작업

> 2026-05-11 시작. 직전 두 커밋:
> - `000aaca chore: Biome / Knip / dpdm / vitest coverage 도구 셋업`
> - `7cad6bc style: Biome 포매팅 + 안전한 lint fix 일괄 적용`

## 현재 상태

| 항목 | 상태 |
|---|---|
| `tsc --noEmit` | 0 errors |
| `vitest run` | 182/182 pass |
| `vite build` | 성공 |
| `vitest run --coverage` | lines 31% / branches 82% / functions 52% / statements 31% (임계값 통과) |
| `biome check` | **45 errors / 32 warnings** (자동 수정 더 없음, 수동 검토 필요) |
| `knip` | 미사용 dep 4 + export 13 + type 13 + 설정 힌트 5 |
| `dpdm` | 순환 1건 (`graphStore ↔ historyStore`) |

## 도입된 도구 / 설정

- `biome.json` — Biome 2.4.15 (린트 + 포매터)
- `knip.json` — Knip 6.12.2 (dead code)
- `vitest.config.ts` — `@vitest/coverage-v8` 2.1.9 블록 추가
- `package.json` 스크립트: `lint`, `lint:fix`, `format`, `typecheck`, `deadcode`, `circular`, `test:coverage`, `check`

**중요 컨텍스트**:
- `src/export/standalonePlayer.js`는 ES5 호환 vanilla JS(export HTML에 그대로 인라인되는 런타임)이라 Biome `files.includes`에서 `!` 패턴으로 제외 처리되어 있음
- 이전 세션에서 `--unsafe` 자동 수정 시 회귀가 발견된 케이스 2가지:
  1. `useExhaustiveDependencies` — `src/ui/NodeEditor/index.tsx`의 `const rev = useGraphStore((s) => s.rev)` 가 `useEffect` deps용 zustand 구독 부작용으로 의도된 것인데, 자동 수정이 deps에서 빼면서 미사용 변수가 됨
  2. `useOptionalChain` — `if (a && a.value) return a` 같은 패턴을 `if (a?.value) return a`로 바꾸면 `a` 타입 좁힘이 깨져서 후속 코드가 TS18048 발생 (`src/core/assets/objLoader.ts` 등)
- 따라서 `npm run lint:fix`는 `--write` (safe only)로 설정됨. `--unsafe` 옵션은 항상 변경을 검토 후 적용할 것

---

## 미해결 항목 (우선순위)

### P1. Biome 잔여 진단 정리 (45 errors / 32 warnings)

| 룰 | 건수 | 분류 | 처리 방향 |
|---|---|---|---|
| `a11y/useButtonType` | 34 errors | 일괄 자동 가능 | `<button>` → `<button type="button">` 일괄 추가 → 31 errors 감소 |
| `style/noNonNullAssertion` | 30 warnings | 수동 검토 | `!` 사용처 살펴보고 안전한 곳은 가드 추가, 명백한 곳은 `// biome-ignore` 또는 룰 자체를 off |
| `a11y/noStaticElementInteractions` | 3 errors | 수동 | `<div onClick>` → `<button>` 또는 `role/tabIndex/onKeyDown` 추가 |
| `suspicious/noArrayIndexKey` | 3 errors | 수동 | `key={index}` → 안정적 id 사용 |
| `correctness/useHookAtTopLevel` | 2 errors | **수동 (구조 변경)** | 조건문 안 hook 호출 — 컴포넌트 분리 필요 |
| `a11y/useKeyWithClickEvents` | 2 errors | 수동 | `onClick` 있는 곳에 `onKeyDown` 추가 |
| `suspicious/noAssignInExpressions` | 1 error | 수동 | `while ((m = re.exec(...)))` — 거의 항상 의도적이라 룰 자체를 off 권장 |
| `complexity/useOptionalChain` | 1 warning | 검토 후 적용 | 위 회귀 사례 주의하면서 수동 적용 |
| `correctness/useExhaustiveDependencies` | 1 warning | **신중 검토** | zustand 구독 부작용 deps는 의도된 패턴 — false positive 가능 |

**파일별 분포** (errors 위주):
- `src/ui/Panels/ViewportControls.tsx` 3 errors
- `src/ui/Panels/UniformControl.tsx` 1 error
- (기타 패널 컴포넌트들에 a11y errors가 산재)

**전체 분포 확인**: `npm run lint -- --reporter=summary | tail -30`

### P2. Knip false positive 정리 + 설정 다듬기

`knip.json` 설정 힌트:
- `dist/**` ignore 제거 권장 (이미 `.gitignore`에 있어 중복)
- `src/main.tsx`, `src/test-setup.ts`, `vite.config.ts`, `vitest.config.ts` entry 패턴은 plugin이 자동 감지 — redundant

실제 미사용 dependencies (4) — **제거 전에 동적 import / re-export 여부 grep으로 검증할 것**:
- `@codemirror/search` `@lezer/highlight` `@loaders.gl/images` `codemirror`

실제 미사용 exports (13) + types (13): `src/core/assets/cache.ts:listCachedIds/clearCache`, `src/core/graph/compile.ts` 4 type 등 — 점진 제거. `_resetAutoSaveForTests` 같은 test 헬퍼는 의도적으로 export 됐을 수 있어 개별 판단.

### P3. 순환 의존성 (1건)

`src/state/graphStore.ts ↔ src/state/historyStore.ts`

- `graphStore.pushHistory()`가 `historyStore.push()` 호출
- `historyStore`가 graphStore 타입 import?
- 해결 옵션:
  - history push를 이벤트/콜백으로 뒤집기
  - 공유 타입을 제3의 파일로 추출
  - 한쪽이 다른 쪽을 lazy import (간이 방편)

### P4. tsconfig 강화

- `noUncheckedIndexedAccess`: 켜면 **129 추가 오류** (이전 측정). 별도 PR로 점진 도입 필요. `arr[i]` 사용처마다 가드 추가 또는 `!` 처리. 가장 큰 거 — 시간 들임
- `exactOptionalPropertyTypes`: 미측정. 추정 비슷한 양

### P5. Vitest 3 업그레이드 (선택)

- 현재 2.1.8. 3.x는 AST 기반 V8 커버리지 remapping으로 정확도 향상
- breaking change 있음 (config API 일부 변경) — 마이그레이션 가이드: https://vitest.dev/guide/migration.html
- `@vitest/coverage-v8`도 동일 버전으로 함께 올려야 함

### P6. CI 추가 (GitHub Actions)

- `.github/workflows/check.yml` 신설
- `npm ci && npm run check` 단일 잡으로 충분 (typecheck + lint + deadcode + circular + test)
- 커버리지 리포트는 옵션 — codecov/coveralls 또는 PR 코멘트
- PR 트리거: `pull_request: branches: [main]`

### P7. (이전 추천) `useButtonType` 일괄 처리 후 readability 한 번 더

- 잔여 lint 진단 정리 → CI에서 errors=0이 되어야 의미 있음
- errors 0 도달까지 `biome.json`의 일부 룰을 `warn`/`off`로 잠시 낮추는 것도 한 방법

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
2. **unsafe fix는 한 파일 단위로 검토하며 적용** — 전체 `--unsafe`는 zustand 구독 패턴/타입 좁힘 깨뜨림
3. **`useExhaustiveDependencies` warn은 진짜 버그/false positive 혼재** — zustand `useStore((s) => s.x)` 부작용 구독은 deps에 들어가야 정상
4. **Vitest 2.1.x V8 커버리지의 라인 매핑 부정확 가능성** — 정확한 줄 수가 필요하면 Vitest 3 업그레이드 또는 임시로 `provider: "istanbul"`로 교차 검증
5. **순환 의존성 해결 시 history 동작 회귀 주의** — `src/state/historyStore.test.ts`와 `graphStore.test.ts` 둘 다 통과시켜야 함

## 참고 파일

- `biome.json` — 룰 튜닝 시 수정. `linter.rules` 트리에 룰명 그대로 명시 (`"style": { "noNonNullAssertion": "off" }` 식)
- `knip.json` — 의도적 export(`_resetAutoSaveForTests` 등) 보호하려면 `ignoreExportsUsedInFile`/`ignore` 추가
- `vitest.config.ts` — 커버리지 임계값. UI/WebGL 테스트가 추가되면 점진적으로 상향
- 직전 측정 시점의 진단 분포는 본 문서 P1 표 기준 — 잔여 항목 처리하면 갱신할 것

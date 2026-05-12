# ShaderPlayground — Claude 작업 규약

이 저장소는 **품질 게이트가 코드 머지의 전제 조건**이다. 신규 기능, 리팩터, 버그 픽스 등 모든 변경 작업은 **아래 게이트를 100% 통과**한 상태로 마무리해야 한다. 통과하지 않은 채로 작업을 끝났다고 보고하지 말 것.

---

## 0. 작업 종료 전 필수 명령

코드 수정이 끝나면 **반드시 다음을 순서대로 실행하고 모두 성공**해야 한다:

```bash
npm run check       # typecheck + lint + deadcode + circular + unit test (한 줄에 묶여 있음)
npm run test:e2e    # Playwright E2E (Phase 1~12)
```

`npm run check`는 내부적으로 `typecheck → lint → deadcode → circular → test` 순서로 실행되며 하나라도 실패하면 즉시 중단된다 (`package.json#scripts.check`).

E2E는 `check`에 포함되어 있지 않으므로 **별도로 반드시 실행**해야 한다. CI(`.github/workflows/check.yml`)에서 `check` 잡과 `e2e` 잡이 분리되어 있고 둘 다 통과해야 머지 가능하다.

UI에 영향을 주지 않는 순수 내부 변경(예: 주석, 로깅 문구)이라 E2E를 생략하고 싶다면, 그 사실을 **명시적으로 사용자에게 알리고 확인**을 받은 뒤에만 생략한다. 임의 판단 금지.

---

## 1. 품질 게이트 상세

### 1-1. TypeScript (`npm run typecheck`)

`tsconfig.json`에 다음이 켜져 있다. 새 코드는 이 모든 제약을 만족해야 한다.

- `strict: true`
- `noUnusedLocals` / `noUnusedParameters` — 미사용 변수/파라미터 금지. 의도된 미사용은 `_` 접두사로 표시.
- `noFallthroughCasesInSwitch`
- `noUncheckedIndexedAccess` — 배열/인덱스 접근 결과는 항상 `T | undefined`로 다뤄야 한다. 길이 가드 후의 비단언이 명백히 안전한 경우에만 `!` 또는 `biome-ignore`를 사유와 함께 사용.
- `exactOptionalPropertyTypes` — `{ x?: T }`와 `{ x?: T | undefined }`를 구분한다. optional 프로퍼티에 `undefined`를 명시적으로 할당하지 말 것.

타입 오류는 `any` / `as unknown as T` 캐스팅으로 우회하지 말 것. 진짜로 타입 시스템이 표현 못 하는 외부 경계라면 사유를 주석으로 남긴다.

### 1-2. Biome 린트/포맷 (`npm run lint`)

`biome.json` 기준. 다음 규칙은 **error** 또는 **warn**이지만 **warn도 0건**을 유지해야 한다 (`de2bccba` 커밋에서 잔여 진단 0 정리, 이후 `de6eec7`에서 ignore 전수 감사 완료).

주요 룰:
- `style.noNonNullAssertion`: warn — `!` 단언은 사유 주석 없이는 금지
- `style.useImportType`: error — 타입 전용 import는 `import type`
- `suspicious.noExplicitAny`: warn — `any` 금지
- `correctness.useExhaustiveDependencies`: warn — React hook deps 누락 금지
- `correctness.useHookAtTopLevel`: error
- 포맷: 2-space, lineWidth 80, double quote, semicolon always, trailing comma all, arrow paren always

**`biome-ignore` 정책 (`de6eec7` 전수 감사 기준 — 임의 추가 금지):**
- 모든 `biome-ignore` / `biome-ignore-all`에는 **반드시 사유**를 주석에 남긴다. 예: `// biome-ignore lint/style/noNonNullAssertion: noUncheckedIndexedAccess + 길이 가드 ...`
- ignore보다 **리팩터로 해소 가능한지를 먼저 검토**한다. 인라인 ignore는 리팩터 비용이 크고 의미가 명확할 때만 허용된다.
- 새 ignore를 추가하려면 사용자에게 그 사유와 대안 검토 결과를 보고한 뒤 합의받는다.

작업 마무리 직전 자동 포맷이 필요하면 `npm run lint:fix` / `npm run format`을 사용한다. 단, **수동 수정으로 의미를 바꾸지 않는 안전한 변경**인지 한 번 더 확인한다.

### 1-3. Knip 데드코드 (`npm run deadcode`)

`knip.json` 기준. **미사용 export / 미사용 타입 / 미사용 dep는 0건**을 유지한다.

- 새 헬퍼 / 컴포넌트 / 타입을 만들 때 **실제 호출자/임포터가 같은 PR에 함께 들어가야** 한다. 호출자 없는 export는 Knip이 즉시 잡는다.
- 테스트만을 위해 export를 늘리는 패턴은 지양한다 (`knip.json`의 `entry`가 `*.test.ts(x)`이므로 호출 그래프는 테스트에서 시작한다).
- 패키지 추가 시 `package.json`에 등록한 의존성은 실제 import 코드와 함께 커밋한다.

### 1-4. 순환 의존성 (`npm run circular`)

`dpdm --exit-code circular:1 src/main.tsx`. **순환 의존성 0건**을 유지한다 (`ec47df1`에서 graphStore↔historyStore 해소 완료).

- 모듈 간 순환이 생길 만한 구조(서로 import)가 보이면 **공통 의존성을 별도 모듈로 분리**하거나 **이벤트/콜백 주입**으로 단방향화한다.
- store끼리 직접 import해서 서로 참조하는 패턴은 금지. 한쪽이 다른 쪽의 selector/subscribe API에 의존하는 단방향 구조를 유지한다.

### 1-5. 단위 테스트 + 커버리지 (`npm run test`, `npm run test:coverage`)

Vitest 4.1.6 (`d347386`에서 업그레이드). `vitest.config.ts`에 **커버리지 임계치가 강제**되어 있다:

| 지표        | 임계치 |
| ----------- | ------ |
| lines       | 50%    |
| functions   | 47%    |
| branches    | 42%    |
| statements  | 50%    |

- 신규 기능 코드는 **해당 임계치를 떨어뜨리지 않도록 단위 테스트를 함께 추가**한다. 임계치 미달 시 `npm run check`가 실패한다.
- 테스트 파일은 `src/**/*.test.{ts,tsx}` 위치, jsdom 환경.
- 커버리지에서 제외되는 항목은 `src/main.tsx`, `src/test-setup.ts`, `src/vite-env.d.ts`, `src/export/standalonePlayer.js` (이 외에 임의 제외 금지).
- 임계치를 **낮추는 방향으로 vitest.config.ts를 수정하지 말 것**. 임계치가 가까워졌다면 테스트를 추가해서 해결한다.

### 1-6. Playwright 런타임 E2E (`npm run test:e2e`)

`playwright.config.ts` 기준. SwiftShader로 WebGL 렌더링, chromium 단일 프로젝트, 직렬 실행(`fullyParallel: false`, `workers: 1`).

- `tests/e2e/`의 Phase 1~12 스펙 26건은 **SPEC.md의 핵심 시나리오를 반영**한 회귀 가드다 (`1ecf9ea`).
- UI/상호작용/렌더링 파이프라인을 건드리는 변경은 **관련 Phase 스펙을 통과해야** 한다. 실패 시 우선 회귀를 의심하고, 의도된 동작 변경이라면 스펙을 함께 갱신한다.
- 스펙 갱신은 **사용자 합의 후**에만. 임의로 expectation을 약화해서 통과시키지 말 것.
- 로컬 실행 시 dev 서버가 자동으로 띄워진다 (`webServer.command`). 별도 `npm run dev`를 띄워두면 재사용된다.

---

## 2. 새 기능 개발 워크플로

1. **계획 단계**: 변경 범위 파악, 영향 받을 게이트(테스트 파일/E2E Phase) 식별.
2. **구현**: 위 1-1~1-4 제약을 처음부터 만족하는 코드 작성.
3. **단위 테스트 추가**: 신규 로직은 `*.test.ts(x)` 동반. 커버리지 임계치 하락 방지.
4. **E2E 영향 확인**: UI/렌더 변경이면 관련 Phase 스펙 검토 — 회귀면 코드 수정, 의도된 변경이면 사용자에게 스펙 갱신 합의 요청.
5. **로컬 게이트 통과**:
   ```bash
   npm run check && npm run test:e2e
   ```
   둘 다 초록일 때까지 작업을 완료로 간주하지 않는다.
6. **보고**: 어떤 게이트를 실행했고 모두 통과했는지 사용자에게 명시적으로 보고한다. 실행하지 않은 게이트가 있다면 그 사실과 사유를 밝힌다.

---

## 3. 금지 사항 (게이트 우회)

다음은 명시적 사용자 승인 없이는 **절대 하지 않는다**:

- `tsconfig.json`의 strict 옵션을 끄거나 완화
- `biome.json`의 룰을 `off`로 변경하거나 includes에서 파일 제외
- `vitest.config.ts`의 커버리지 임계치 하향
- `vitest.config.ts`의 `coverage.exclude`에 신규 파일 추가
- `knip.json`의 `ignore` / `ignoreDependencies`에 항목 추가
- `dpdm` exit code 무시 또는 `circular` 스크립트 변경
- Playwright 스펙의 `expect` 약화, `test.skip`, `test.fixme` 추가
- `--no-verify`, `--force`, `--skip-checks` 등 hook/CI 우회 플래그 사용
- 새로운 `biome-ignore` 추가 (1-2의 절차 따를 것)

게이트가 막아서는 이유는 **이전에 실제로 손실/회귀가 있었거나, 의도적으로 가드를 추가한 결과**다 (`Architecture.md`, 커밋 로그 참고). 게이트를 끄는 게 정답인 경우는 거의 없다 — 코드를 고쳐서 통과시키는 방향이 기본이다.

---

## 4. 참고 문서

- `Architecture.md` — 시스템 구조 / 모듈 경계
- `SPEC.md` — Phase별 기능 명세 (E2E 시나리오의 근거)
- `.github/workflows/check.yml` — CI 게이트 정의
- 커밋 로그 — 각 게이트가 도입된 맥락 (P1~P8 시리즈)

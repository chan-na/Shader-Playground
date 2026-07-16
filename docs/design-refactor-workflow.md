# design-refactor 워크플로우 런북

`design/` 핸드오프 **v1.1**의 디자이너 결정(D1~D21)을 `temp/todo.md`의 잔여 작업에 반영하는 **자율 완주형** 멀티에이전트 워크플로우.
스크립트: `.claude/workflows/design-refactor.js`

## 설계 원칙: 멈추지 않는다

이 워크플로우는 **사용자에게 묻지 않고 끝까지 진행**한다. 사람의 답을 기다리며 정지하는 지점은 Setup(사전 점검) 하나뿐이다.

판단이 필요한 상황은 다음과 같이 처리한다:

| 상황 | 처리 |
| --- | --- |
| 구현이 설계 갈림길에서 막힘 | `status:'blocked'` → **fable 아키텍트가 결정**해 준다 (사용자에게 묻는 게 아니다). 2라운드 후에도 안 풀리면 fable이 직접 구현을 인계 |
| 디자인이 확정하지 않은 값 (토큰 없음, 시안 없음) | 잠정 결정으로 진행 — 우선순위: **기존 토큰/패턴으로 근사 → 현행 유지 + 사유 주석 → 최소 변경**. `theme.ts`에 값을 지어내 추가하는 것은 금지 |
| 사용자 스코프/정책 판단 필요 | 되돌리기 쉬운 쪽으로 잠정 진행 |
| 게이트를 끝내 초록으로 못 만듦 | 해당 마일스톤을 `git stash`로 **격리**하고 브랜치를 마지막 초록 커밋으로 되돌린 뒤 **다음 마일스톤 계속** (작업은 stash에 보존되어 사라지지 않음) |

위 모든 잠정 결정·격리·스펙 변경은 **`temp/design-followup-v1.1.md`** 에 누적된다. 이 문서는 매 마일스톤마다 재생성되므로 중간에 죽어도 기록이 남는다.

### `temp/design-followup-v1.1.md` (워크플로우 산출물)

1. **사용자 판단 필요** — 스코프·정책·게이트. 각 항목에 잠정 처리와 "정식 결정 시 바꿀 위치"가 적힌다.
2. **디자인 문서 갱신 필요** — 다음 핸드오프(v1.2) 요청 후보. `temp/design-need-to-update.md`와 같은 형식(🎨 시안 / 🎯 토큰 / ✅ 확답)이라 그대로 디자이너에게 보낼 수 있다.
3. **적용된 E2E 스펙 변경** — 사후 검토용 (아래 참조).
4. **격리된 마일스톤** — stash 이름 + 복구 방법(`git stash apply`) + 실패 요약.

## 지금까지의 경위

1. **핸드오프 v1** (`e8e2af1`) → 마일스톤 M0~M8로 전 화면 재구현. **PR #68로 main에 머지 완료**.
2. 재구현 중 드러난 문제(시안 없는 화면, 구현/시안 불일치, 토큰 없는 raw hex)를 `temp/design-need-to-update.md`로 디자이너에게 문의.
3. **핸드오프 v1.1** 수령 — 결정 D1~D21이 `design/CHANGELOG.md`, `design/README.md`, `.dc.html` 5종, `screens/*.png` 4종에 반영됨.
   - ⚠ v1.1 커밋이 디자이너 번들의 `theme.ts`로 `src/theme.ts`를 덮어써 구현이 쓰던 export(`withAlpha`, `nodeCardSolid`, radius/shadow 추가분, `cssVars()` 방출 절반)가 사라졌던 문제는 **같은 커밋에 병합본을 접어넣어 해소**됐다. 현재 `src/theme.ts` = v1.1 신규 토큰 + 구현이 쓰는 export 전부.
4. **이 워크플로우** = `temp/todo.md`의 잔여 작업을 v1.1 결정에 따라 처리 (V0~V7).

`temp/todo.md`(잔여 작업)와 `temp/design-need-to-update.md`(디자이너 문의 원문)는 워크플로우가 매 마일스톤에서 읽는 **입력 문서**다. 지우지 말 것.

## 실행 방법

```
design-refactor 워크플로우 실행해줘
```

옵션:

```
design-refactor 워크플로우 실행해줘.
args: { "only": ["V0", "V1"], "commit": true }
```

### args

| 키 | 기본값 | 의미 |
| --- | --- | --- |
| `only` | (전체) | 실행할 마일스톤 ID 배열. 예: `["V0","V1"]` |
| `branch` | `design/handoff-v1.1` | 작업 브랜치. 없으면 현재 HEAD에서 생성 |
| `allowSpecUpdates` | **`true`** | E2E 스펙 갱신 사전 승인. 자율 완주를 위해 기본 허용이며, **강화 방향(새 디자인 값을 단언)만** 가능하다 — `expect` 삭제·완화·`test.skip`은 여전히 금지. 적용된 건은 전부 followup 문서에 기록된다. `false`로 주면 스펙을 건드리지 않고 코드 쪽으로만 해결을 시도한다(실패 시 그 마일스톤은 격리됨) |
| `commit` | `true` | 마일스톤별 게이트 초록 시 체크포인트 커밋. **`false`면 실패 마일스톤의 격리(stash)도 하지 않으므로** 빨간 변경이 트리에 남을 수 있다 |

> **`allowSpecUpdates` 기본값이 `true`인 이유**: 이번 리팩터링은 UI 구조를 의도적으로 바꾼다 — pane 라벨이 노드 이름을 표시(D15), Side Panel 탭 4개(D1), 트랜스포트 컴팩트 변형(D3), 노드 카드 포트 rail(D2). 기존 E2E 스펙이 옛 UI를 단언하고 있으면 반드시 충돌하는데, 여기서 멈추면 자율 완주가 불가능하다. CLAUDE.md의 "스펙 갱신은 사용자 합의 후" 규약은 **사전 승인 + 강화 방향 한정 + 전건 기록**으로 대체한다.

## 모델 티어링

| 역할 | 모델 | 이유 |
| --- | --- | --- |
| 마일스톤 플래너 (유닛 분해) | fable (effort high) | 설계 결정 |
| 구현 (유닛/수정) | sonnet | 토큰 절약 |
| Q&A 오라클 (구현이 막힌 질문에 **결정**을 내려줌) | fable (effort high) | 최종 결정권자 |
| 디자인 검증 (.dc.html 대조 + 스크린샷 비교) | fable (effort high) | 정확도 |
| 게이트 실행 (check + e2e) | sonnet (effort low) | 기계적 |
| E2E 실패 트리아지 (회귀 vs 의도된 변경) | fable (effort high) | 판단 |
| 커밋 / 격리(stash) | haiku (effort low) | 기계적 |
| followup 문서 작성 / 커버리지·hex 스캔 | sonnet (effort low~medium) | 문서화 |

## 흐름

```
Setup: 작업 트리 clean → v1.1 핸드오프 존재 확인(CHANGELOG v1.1 · theme.ts 신규 토큰 · export 온전성)
       → 브랜치 → 베이스라인 npm run check
       ※ 여기서만 중단될 수 있다 (자동으로 고칠 수 없는 사전 조건)

마일스톤 V0 → V7 순차:
  1. plan   : fable이 dc + CHANGELOG + 현재 코드를 읽고 2~6개 유닛으로 분해
              └ 선행 마일스톤이 격리됐으면 그 사실을 알려 의존 유닛만 제외하고 계획
  2. impl   : 유닛별 sonnet 구현
              └ 막히면 blocked + questions → fable 오라클이 **결정** → 재시도
              └ 2회 반복에도 blocked면 fable이 직접 구현 인계
  3. verify : fable이 .dc.html(v1.1) 대조 + 실제 화면 스크린샷을 screens/*.png와 비교
              → blocker/major는 수정 루프 (최대 3라운드), 끝내 남으면 followup에 기록하고 진행
  4. gates  : npm run check + npm run test:e2e (최대 4라운드)
              └ 실패 시 fable 트리아지: 회귀→수정 / 의도된 변경→스펙 강화 갱신
  5. 초록이면 → commit ("design(V#): … — 핸드오프 v1.1")
     빨강이면 → git stash 격리 + followup 기록 → **다음 마일스톤 계속**
  6. followup 문서 갱신 (매 마일스톤마다 재생성)

Report: followup 문서 최종본 + temp/todo.md 전 항목 커버리지 대조
        + 잔여 raw hex 스캔 + 번들 사이즈 참고 측정
```

## 마일스톤

각 마일스톤은 `temp/todo.md` 항목(todo)과 디자이너 결정(D#)의 교차로 정의된다.

| ID | 내용 | todo | 결정 | 의존 |
| --- | --- | --- | --- | --- |
| V0 | Foundations — overlay 토큰 소비(도트 그리드·스크림), radius 리터럴, stale 주석, 근사 토큰/warnRing 확인 | C4 C5 D2 E5 E7 | D9 D11 D12 | — |
| V1 | **노드 이름(name) 모델** ★선행 — GraphNode name 필드, 헤더 더블클릭 인라인 rename, Inspector Name 필드, 직렬화 하위호환 | E3·B8의 선행 | D15 | — |
| V2 | **Node Editor** ★최대 — 포트 라벨 rail(46px) + 썸네일 inset, Webcam/Video 카드(letterbox), Audio 파형(source 색·투명 배경), PortHandle 회귀 테스트 | B5 C2 C3 D1 | D2 D7 D8 | — |
| V3 | Viewport — 컴팩트 트랜스포트(≤700px), 빈 상태 gradient.emptyState, pane 라벨=노드 이름, ⏮ 유지 확인 | B6 E4 E3 E2 | D3 D10 D14 | **V1** |
| V4 | Side Panel — Diagnostics **4번째 탭** 승격 + 리스킨(raw hex 10건 → 0), Inspector 타입 배지 = 포트 패밀리 | C1 B3 | D1 D18 | — |
| V5 | Shell·Editor·Palette — 메타 배지 우측 정렬, CompileErrorOverlay `(+N more)`, 팔레트 빈 결과 CTA, 팔레트 검색어 리셋, Welcome 포커스 가드 | E1 E8 E6 B1 B2 | D13 D19 D17 | — |
| V6 | Export & Share — 파일명 `{projectTitle}-{timestamp}` 통일(표시=실제), 완료 액션 1행, standalone HTML 토큰 이식 | B8 B7 E9 | D16 D5 | **V1** |
| V7 | System States — 크래시 폴백(8번째 상태, 토큰 예외 유지), 스켈레톤 인디케이터 캔버스 중앙 | E10 B4 | D6 D4 | — |

**의존 처리**: V1이 격리되면 V3/V6의 플래너에게 "선행 격리됨"이 전달되어, 노드 이름에 의존하는 유닛만 빼고 나머지(컴팩트 트랜스포트, 빈 상태 그라디언트, 완료 액션 1행 등)를 진행한다. 제외된 유닛은 followup에 기록된다.

## 정책 결정

- **번들 사이즈는 게이트가 아니다.** CI에 `bundle size guard` 잡(`npm run build && npm run size:check`, 한도 385 KiB)이 따로 있고, 워크플로우는 Report에서 **참고 수치만** 측정한다. 직전 측정이 379.58 KiB라 여유가 ~5 KiB뿐이고 이번 작업은 신규 UI를 여럿 추가하므로 **PR CI에서 한도를 넘길 가능성이 높다**. 한도 상향은 사용자 승인 사항이라 워크플로우가 `scripts/check-bundle-size.mjs`를 건드리지 않고, 초과 사실을 followup 문서의 사용자 판단 항목으로 남긴다 (`81d49b2`가 363→385로 올렸던 것과 같은 절차를 사람이 밟을 것).
- **D17(팔레트 빈 결과 CTA)은 구현한다.** 디자이너가 v1.1에서 명시 응답하지 않았지만 `Command Palette.dc.html`(L116-125)에 CTA가 그대로 남아 있어 **dc를 정본으로 보기로 사용자가 결정**했다. V5에 포함.
- **theme.ts에 새 토큰 추가 금지.** 값의 출처는 디자이너다. 토큰이 부족하면 기존 토큰 근사 → 현행 유지 순으로 잠정 처리하고 followup(designer)에 기록한다.
- **새 `biome-ignore` 추가 금지.** 리팩터로 해소하고, 불가하면 followup에 기록 후 현행 유지.
- **ErrorBoundary는 토큰 예외.** 크래시 폴백은 CSS 변수·웹폰트 주입 실패 상황에서도 렌더돼야 하므로 `system-ui` + 중립 그레이를 의도적으로 유지한다 (README §도메인 규칙 [D6]).
- **`temp/todo.md` A1(main 머지/PR 생성)은 워크플로우 범위 밖** — 사용자 결정 사항으로 남긴다.

## 실행이 끝난 뒤 볼 것

1. `temp/design-followup-v1.1.md` — 잠정 결정·격리·스펙 변경 전건. **여기부터 읽어라.**
2. 워크플로우 반환값의 `todoCoverage` — `not-covered` 항목이 있으면 누락이다.
3. `git log --oneline` — 마일스톤별 체크포인트 커밋.
4. `git stash list` — 격리된 마일스톤이 있으면 여기 있다 (`git stash apply <ref>`로 복구).
5. PR CI의 bundle size guard — 한도 초과 시 사람이 판단.

## 중단 후 재개

- Setup에서 멈췄다면(더러운 트리/빨간 베이스라인/핸드오프 누락) 그 원인을 해소하고 다시 실행.
- 중간에 죽었다면 실행 결과의 `runId`로 `resumeFromRunId` 재개 (완료된 agent 호출은 캐시로 즉시 통과), 또는 이미 커밋된 마일스톤을 빼고 `args.only`로 남은 것만 재실행.
- 각 마일스톤이 게이트 초록 + 커밋(또는 격리) 상태로 끝나므로, 어느 시점에 멈춰도 브랜치는 항상 머지 가능한 상태다.

# design-refactor 워크플로우 런북

`design/` 핸드오프 v1(`e8e2af1`)을 실제 UI 코드로 재구현하는 자율 멀티에이전트 워크플로우.
스크립트: `.claude/workflows/design-refactor.js`

## 실행 방법

Claude Code 세션에서 아래처럼 요청하면 된다:

```
design-refactor 워크플로우 실행해줘
```

옵션을 주려면:

```
design-refactor 워크플로우 실행해줘.
args: { "only": ["M0", "M1"], "allowSpecUpdates": true, "commit": true }
```

### args

| 키 | 기본값 | 의미 |
| --- | --- | --- |
| `only` | (전체) | 실행할 마일스톤 ID 배열. 예: `["M0","M1"]` |
| `branch` | `design/handoff-v1` | 작업 브랜치. 없으면 생성 |
| `allowSpecUpdates` | `false` | E2E 스펙 갱신 사전 승인. `false`면 스펙 변경이 필요해지는 순간 워크플로우가 멈추고 변경 제안 목록을 보고한다 (CLAUDE.md "스펙 갱신은 사용자 합의 후" 준수). 리디자인은 UI를 의도적으로 바꾸므로, 검토 후 `true`로 재실행/재개하는 흐름을 상정 |
| `commit` | `true` | 마일스톤별 게이트 초록 시 브랜치에 체크포인트 커밋. `false`면 커밋 없이 작업 트리에만 남김 |

## 모델 티어링

| 역할 | 모델 | 이유 |
| --- | --- | --- |
| 마일스톤 플래너 (유닛 분해) | fable (effort high) | 설계 결정 |
| 구현 (유닛/수정) | sonnet | 토큰 절약 |
| Q&A 오라클 (구현이 막힌 질문에 답) | fable (effort high) | 설계 결정 |
| 디자인 검증 (.dc.html 대조 + 스크린샷 비교) | fable (effort high) | 정확도 |
| 게이트 실행 (check + e2e) | sonnet (effort low) | 기계적 |
| E2E 실패 트리아지 (회귀 vs 의도된 변경) | fable (effort high) | 판단 |
| 커밋 / hex 잔여 스캔 | haiku (effort low) | 기계적 |

## 흐름

```
Setup: 작업 트리 clean 확인 → 브랜치 → 베이스라인 npm run check (빨간 상태면 중단)

마일스톤 M0 → M8 순차 (의존도 순서):
  1. plan   : fable이 디자인 파일 + 현재 코드를 읽고 2~6개 유닛으로 분해
  2. impl   : 유닛별 sonnet 구현
              └ 막히면 status:blocked + questions → fable 오라클이 답변 → 재시도
              └ 2회 반복에도 blocked면 fable이 직접 구현 인계
  3. verify : fable이 .dc.html 인라인 값 대조 + (가능하면) 실제 화면 스크린샷을
              design/screens/*.png와 비교 → blocker/major는 수정 루프 (최대 3라운드)
  4. gates  : npm run check + npm run test:e2e (최대 4라운드)
              └ 실패 시 fable 트리아지: 회귀→수정 / 의도된 변경→스펙 갱신
              └ 스펙 갱신은 allowSpecUpdates:true일 때만 적용, 아니면 여기서 정지+보고
  5. commit : 게이트 초록이면 "design(M#): ..." 체크포인트 커밋

Report: src 전체 raw hex 잔여 스캔 + 마일스톤별 결과 요약 반환
```

게이트가 초록이 되지 않으면 다음 마일스톤으로 넘어가지 않고 정지한다 (빨간 상태를 누적시키지 않기 위함).

## 마일스톤

| ID | 내용 | 주 대상 |
| --- | --- | --- |
| M0 | 토큰 배선 — theme.ts 소스화, cssVars() `:root` 주입, hex→tokens 치환 시작 | `src/theme.ts`, `src/main.tsx`, `src/index.css` |
| M1 | App Shell — 툴바 48px·도킹 패널·상태바, 도킹 헤더 공통 컴포넌트 | `src/App.tsx`, Toolbar, StatusBar |
| M2 | Node Editor ★ — 커스텀 nodeTypes/edgeTypes, Handle=포트(형태=방향, 색=패밀리), 포트 지오메트리 | `src/ui/NodeEditor/**` |
| M3 | Viewport — grid 분할 + 실제 WebGL2 캔버스, 오버레이만 DOM | `src/ui/Viewport/`, ViewportControls |
| M4 | Code Editor — HighlightStyle(tokens.syntax) + 거터/툴팁/린터 크롬 | `src/ui/CodeEditor/**` |
| M5 | Side Panel — Inspector/Assets/Problems + 폼 컨트롤 라이브러리 추출 | `src/ui/Panels/**`, 신규 `src/ui/controls/` |
| M6 | Command Palette · Welcome · Export/Share | CommandPalette 외 |
| M7 | System States — empty/loading/error/permission | Viewport/Toasts/ErrorBoundary 등 |
| M8 | Motion — 90–150ms, cubic-bezier(.2,.7,.3,1) 트랜지션 유틸 + 연결 인터랙션 | 신규 모션 유틸, NodeEditor |

## 중단 후 재개

- 워크플로우가 `needs-spec-approval` 등으로 멈추면, 보고된 스펙 변경 제안을 검토한 뒤:
  - 전체 재실행이 아니라 **resume**: 실행 결과에 찍힌 `runId`로 `resumeFromRunId` 재개 (완료된 agent 호출은 캐시로 즉시 통과), 또는
  - 이미 커밋된 마일스톤은 건너뛰고 `args.only`로 남은 마일스톤만 재실행.
- 각 마일스톤이 게이트 초록 + 커밋 상태로 끝나므로, 어느 시점에 멈춰도 브랜치는 항상 머지 가능한 상태다.

## 안전장치 (CLAUDE.md 준수)

- 게이트 설정(tsconfig/biome/knip/vitest 임계/dpdm) 완화 금지 — 모든 에이전트 프롬프트에 명시.
- 새 `biome-ignore` 필요 시 에이전트가 임의 추가하지 않고 blocked로 반환 → 보고서에 남음.
- E2E 스펙은 약화(expect 삭제, skip) 절대 금지 — 갱신은 "새 디자인 값을 단언"하는 방향만, 그것도 `allowSpecUpdates` 승인 하에.
- Setup에서 작업 트리가 더러우면 아무것도 하지 않고 중단.

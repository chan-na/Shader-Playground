# 스펙 — 앱 셸 · 레이아웃

> React/Zustand 앱 셸 도입과 트리 기반 도킹 레이아웃 관련 Phase 본문.
> 인덱스(Phase 번호 → 현재 동작 · E2E 스펙 · 파일)는 [SPEC.md](../../SPEC.md)에 있다. 아래 본문은 Phase 작성 당시 기록을 그대로 옮긴 것이며, 이후 Phase가 덮어쓴 내용은 인덱스의 "현재 동작" 열이 우선한다.

### Phase 1 — UI/상태 인프라 도입
- React 18 도입, `App.tsx` 레이아웃 (그리드: 그래프 / 뷰포트 / 코드).
- Zustand 스토어 골격(`graphStore`, `rendererStore`).
- 기존 풀스크린 쿼드를 Viewport 컴포넌트 안으로 이동, RAF 루프는 그대로.
- ESLint/Prettier/Vitest 설정.
- **검증**: 화면 분할이 보이고 기존 셰이더가 우측 뷰포트에서 그대로 돈다.

### Phase 35 — 도킹 레이아웃 (트리 도크 모델, 디자인 핸드오프 v1.3/v1.4) (완료)
고정 4분할 레이아웃을 **트리 기반 도크**로 교체 — 디자인 핸드오프 v1.3/v1.4(`design/CHANGELOG.md` §v1.3·§v1.4, `design/README.md` §M)가 정본. `Docking Prototype.dc.html`을 구현 스코프로 승격하면서 나온 모순·기능 삭제·사양 부재 결정(R1~R15) 중 도킹 모델 자체에 해당하는 R1·R4·R5·R6·R7·R8·R9·R11 을 반영한다.
- **모델**: 트리 기반 도크(`split{dir,ratio,a,b}` / `leaf{tabs[],active,collapsed}`), 도킹 5종(nodeEditor/viewport/inspector/code/assets — R5: problems/diagnostics 제외), 기본 트리 = `col 0.717 [ row 0.587 [nodeEditor | col 0.556 [viewport | (inspector,assets)]] | code(하단 전폭) ]`(src/state/dockTree.ts `createDefaultDockTree`).
- **드래그/드롭 규칙**: ⣿=leaf 전체, 탭=그 탭만. pointer* 이벤트 전용(R10). 판정 우선순위 — (1) region 상단 34px 탭바 존(`TAB_BAR_DROP_PX`) 탭 병합이 **셸 바깥 42px 밴드(`OUTER_DROP_BAND_PX`)보다 우선**, (2) 바깥 밴드 → 전체 가장자리 도킹, (3) region 내부 가장자리 22%(`REGION_EDGE_DROP_FRAC`) → 스플릿(프리뷰 라벨 `Split <zone>`), 그 외 중앙 병합. 드롭 타깃 없이 release → 첫 region으로 강제 도킹(R1 — 플로팅 없음, `fallbackDropTarget`).
- **접기/최대화(R4)**: leaf 단위, 접힌 leaf = split 방향 고정 34px strip + 그 split의 divider 비활성(렌더 제거), 복원 버튼은 strip 안에서 실포인터 도달 가능.
- **닫기(R6)**: 헤더 ✕ = 패널 전체(모든 탭), 탭별 ✕ = 그 탭만(비활성 탭도 활성화 없이).
- **최소 크기(R7)**: leaf 최소 240×160(`MIN_LEAF_WIDTH/HEIGHT`), divider 드래그 클램프(0.15~0.85 + 픽셀 하한).
- **탭 오버플로(R8)**: 4개↑ 가로 스크롤 + 우측 페이드 마스크, 34px 헤더 높이 불변.
- **영속화(R9)**: localStorage `shader-playground.dock-layout`(500ms 디바운스, `sanitizeDockLayoutSnapshot` 검증), 손상 값은 조용히 기본 트리 폴백. `Reset layout` = 기본 트리. ＋Panel 재도킹, empty state 카피 `No panels docked — add one with ＋ Panel`.
- **반응형(R11)**: 컴팩트(≤990px, C-6 임계 재사용) 도킹 비활성(고정 스택 폴백, 드래그 트리거 무력화), 넓어지면 트리 무변경 복원.
- **검증**: Playwright E2E — `m1-dock-header-collapse.spec.ts`(접기 도달성), `m2-dock-drag.spec.ts`(드래그/강제 도킹), `m3-dock-b6.spec.ts`(영속화·＋Panel·empty·컴팩트), `m4-dock-dragdrop.spec.ts`(존 우선순위·스플릿, B7 신설), `m5-dock-chrome.spec.ts`(R4/R6/R7/R8, B7 신설), `m6-dock-fallback.spec.ts`(R9 손상 폴백·R11 드래그 비활성, B7 신설). Vitest 단위 — `dockTree.test.ts`, `dockStore.test.ts`, `dockLayoutModel.test.ts`, `DockLayout.test.tsx`, `DockPanelHeader.test.tsx`, `autoSave.test.ts`.

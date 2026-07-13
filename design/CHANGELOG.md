# Design Changelog — ShaderPlayground

디자인 변경 이력. Git diff가 "무엇이" 바뀌었는지 보여준다면, 이 파일은 **"왜"**를 남긴다.
값 자체는 `theme.ts`가 출처 — 여기엔 의도·결정·영향 범위를 사람이 읽게 적는다.

## 규칙
- 최신이 위로. 날짜 `YYYY-MM-DD`.
- 시각/토큰 변경은 가능하면 `theme.ts` 커밋 + 이 항목 + (영향 화면) 스크린샷 갱신을 **같은 PR**에서.
- 큰 개편은 버전 범프(`v1` → `v2`)하고 README 상단 버전도 함께 수정.
- 태그 예: `[token]` `[component]` `[screen]` `[motion]` `[brand]` `[breaking]`.

---

## [Unreleased]
### Changed
- (예) `[token]` accent/default `#3d9bff` → … — 이유: …. 영향: 툴바·선택 링·info.

---

## v1 — 2026-07-13
### Added
- 초기 하이파이 디자인 시스템 + 전 화면 시안 확정.
- 확정 방향: 도킹형 패널 · 절제된 프로툴 무드(Linear/VSCode, 네온 최소) · 다크 기본 · 액센트 `#3d9bff`.
- 포트 이중 인코딩 규칙 확정: 형태=방향(input hollow ring / output solid disc), 색=타입 패밀리(Resource/Scalar/Vector/Matrix).
- 화면: App Shell · Node Editor · Viewport · Code Editor · Side Panel · Command Palette · Welcome · Export & Share · System States · Foundations · Brand · Icon & Social.
- 모션 프로토타입: 포트 연결 → 팬아웃 하이라이트 → 스냅 → 뷰포트 라이브 렌더.
- 브랜드 실파일 세트(파비콘·앱 아이콘·OG·manifest).
- 토큰 단일 출처 `theme.ts` 확립.

# ShaderPlayground TODO

작성일: 2026-05-12
기준: Phase 12 완료 (`c730dcf` / `1ecf9ea` / `bd85153`)

Phase 12 까지의 SPEC.md / Architecture.md 를 기준으로 도출한 다음 작업 후보 목록. 각 항목의 근거는 [SPEC.md](./SPEC.md) §4 백로그 또는 [Architecture.md](./Architecture.md) 의 해당 절에 있다. 착수 전 영향 받는 품질 게이트(테스트 파일·E2E Phase)를 한 번 더 식별한 뒤 진행한다.

---

## A. 기능 완성도

- [x] **A1. Transform Feedback 컴퓨트 노드** — L
  - WebGL2 transform feedback 기반 GPU 시뮬레이션/파티클 노드 종류 신설. registry / compile / execute / serialize 전 라인에 영향. (SPEC §4 백로그)
- [ ] **A2. File System Access API 디스크 백업** — M
  - ShaderNode 의 vertex/fragment 소스를 디스크 파일에 바인딩해 외부 에디터 저장을 핫리로드. capability detect 분기 필요. (SPEC §4 백로그)
- [ ] **A3. GIF 녹화** — M
  - 기존 `recorder.ts` (WebM/mp4) 에 gifenc WASM 또는 gif.js 동적 import 경로 추가. 번들 영향은 dynamic import 로 격리. (SPEC §4 백로그)

## B. 성능

- [x] **B1. Output 분할 뷰포트 blit 합성 최적화** — M
  - 4-Output 분할 시 `blitToCanvas` 4 패스 → 단일 패스 viewport 변경 또는 `BlitFramebuffer` 경로로 셰이더/바인딩 중복 제거. (Architecture §4.3)
- [x] **B2. 정적 그래프 RAF 아이들** — M
  - 시간 정지 + 입력 정지 + uniform 변화 0 일 때 `executePlan` 스킵, dirty 이벤트로 다음 프레임 재기동. 정적 그래프에서 GPU 0 비용. (Architecture §4.1)
- [x] **B3. uniform 핫패치 증분 동기화** — S
  - 매 프레임 모든 ShaderPass uniformValues 전체 복사 → 변경된 패스만 동기화. (Architecture §4.1 step 4)

## C. DX

- [x] **C1. CodeMirror GLSL 자동완성** — M
  - `@codemirror/autocomplete` 로 빌트인 함수 / 타입 / 현재 노드의 `parseUniforms` 결과 / `// @` 힌트 키워드 제안. Monaco 전환 없이 가벼운 LSP 전 단계. (SPEC §1.3, §4 백로그)
- [ ] **C2. Inspector uniform 검색·필터** — S
  - SidePanel Inspector 탭 상단 검색 박스로 name/label/type 매칭. uniform 다수 노드의 UX 개선. (SPEC Phase 4 / Architecture §4.5 후속)
- [ ] **C3. Visual regression (Playwright 스크린샷)** — M
  - SwiftShader 결정론적 출력을 활용한 골든 스크린샷 비교. 픽셀 회귀 가드 추가. (CLAUDE.md §1-6, `1ecf9ea`)

## D. 배포 · 운영

- [ ] **D1. PWA 오프라인 지원** — M
  - vite-plugin-pwa 로 정적 빌드 캐싱 + manifest. 에셋·autosave IndexedDB 가 이미 갖춰져 있어 앱 셸만 추가하면 완성. (Architecture §9.2, §9.5)
- [ ] **D2. Embed 모드 (`?embed`)** — S
  - 쿼리/해시로 NodeEditor·SidePanel·Toolbar 숨기고 Viewport+카메라 컨트롤만 노출. iframe 임베드 친화. (Architecture §10, SPEC Phase 11 후속)
- [ ] **D3. 번들 사이즈 CI 가드** — S
  - `dist/assets/*.js` gzip 임계치를 `.github/workflows/check.yml` 에 추가. "경량 우선" 디폴트 유지. (SPEC §5.2, `bd85153`)
- [ ] **D4. 프로젝트 JSON v2 마이그레이션 인프라** — S
  - `serialization.ts` 에 `migrators: Record<number, fn>` 테이블 도입. 현재는 v1 항등 등록만으로도 향후 노드 종류 추가 시 자연 활용. (Architecture §9.1)

---

## 우선순위 후보 (참고)

- **빠른 가치 / 낮은 위험**: B3, C2, D2, D3, D4 — 모두 S 난이도, 게이트 영향 좁음.
- **사용자 체감 큰 개선**: C1 (자동완성), B1/B2 (체감 성능), A2 (외부 에디터 워크플로).
- **장기 투자**: A1 (컴퓨트 노드) — 노드 종류 신설이라 SPEC/Architecture 도 함께 갱신 필요.

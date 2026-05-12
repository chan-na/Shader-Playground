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
- [x] **C2. Inspector uniform 검색·필터** — S
  - SidePanel Inspector 탭 상단 검색 박스로 name/label/type 매칭. uniform 다수 노드의 UX 개선. (SPEC Phase 4 / Architecture §4.5 후속)
- [ ] **C3. Visual regression (Playwright 스크린샷)** — M
  - SwiftShader 결정론적 출력을 활용한 골든 스크린샷 비교. 픽셀 회귀 가드 추가. (CLAUDE.md §1-6, `1ecf9ea`)

## D. 배포 · 운영

- [ ] **D1. PWA 오프라인 지원** — M
  - vite-plugin-pwa 로 정적 빌드 캐싱 + manifest. 에셋·autosave IndexedDB 가 이미 갖춰져 있어 앱 셸만 추가하면 완성. (Architecture §9.2, §9.5)
- [ ] **D2. Embed 모드 (`?embed`)** — S
  - 쿼리/해시로 NodeEditor·SidePanel·Toolbar 숨기고 Viewport+카메라 컨트롤만 노출. iframe 임베드 친화. (Architecture §10, SPEC Phase 11 후속)
- [x] **D3. 번들 사이즈 CI 가드** — S
  - `dist/assets/*.js` gzip 임계치를 `.github/workflows/check.yml` 에 추가. "경량 우선" 디폴트 유지. (SPEC §5.2, `bd85153`)
- [ ] **D4. 프로젝트 JSON v2 마이그레이션 인프라** — S
  - `serialization.ts` 에 `migrators: Record<number, fn>` 테이블 도입. 현재는 v1 항등 등록만으로도 향후 노드 종류 추가 시 자연 활용. (Architecture §9.1)

## E. 회복성·관측성 (2026-05-12 코드 직접 조사 발견)

SPEC/Architecture 백로그에는 없지만 코드를 읽으며 발견한 빈 자리. 사용자 만나는 에러 경로의 침묵이 공통 테마.

- [ ] **E1. WebGL context-loss / restore 핸들러** — M
  - 현재 [`Viewport/index.tsx`](src/ui/Viewport/index.tsx) 에 `webglcontextlost`/`webglcontextrestored` 리스너 없음. 주석만 *"Poll failure (e.g., context lost) — drop this frame's results"* (line 192, 245). 노트북 sleep/GPU 스왑 시 캔버스가 조용히 멈추고 errors[] 에도 안 잡힘. 핸들러 부착 + `plan.dispose()` + 다음 RAF 에서 `recompile()` 재호출 + `rendererStore.pushError("GPU 컨텍스트 손실 — 복구 중…")` → 복구 시 clear. (Architecture §8.3 의 "런타임 에러" 가 사실상 GLSL 컴파일 에러로 좁혀져 있는 점도 함께 보완.)
- [ ] **E2. Toast 알림 + 사일런트 에러 통합 표면화** — S~M
  - [`Toolbar.tsx`](src/ui/NodeEditor/Toolbar.tsx) 의 native `alert()` 2 곳 (line 98 프로젝트 로드 실패 / line 126 Share URL 복사 성공) 이 앱의 다른 polished `<dialog>` UI 톤과 어긋남. 동시에 [`recorder.ts`](src/state/recorder.ts) 의 `error` (line 56, 66 — MediaRecorder/captureStream 미지원) 와 [`autoSave.ts`](src/state/autoSave.ts) 의 IndexedDB 실패 (line 38-42 의 unhandled rejection 가능 경로) 가 UI 어디에도 안 표시됨. 새 `toastStore` + 우상단 stack 컴포넌트로 세 자리를 한 PR 에 묶어 정리. (E3 의 autosave 에러 표면도 여기에 흡수 가능.)
- [ ] **E3. `beforeunload`/`pagehide` autosave flush + 실패 표면** — S
  - Architecture §9.2 가 명시적으로 *"unload 리스너는 안 걸려 있지 않지만 API 는 노출"* 이라고 적어둔 빈 자리. [`autoSave.ts:78-128`](src/state/autoSave.ts) 의 `flush()` 가 준비되어 있는데 호출자 없음 → 30 s 디바운스 내 탭 닫으면 최대 30 s 손실. `BootstrapGate` 또는 `main.tsx` 에서 `beforeunload` + `pagehide` (iOS Safari) 양쪽 부착해 fire-and-forget `flush()`. 함께 `saveSession()` 의 IndexedDB quota 실패를 catch 해서 `lastSaveError` 상태 + (E2 가 끝나 있으면) toast.
- [ ] **E4. AssetBrowser 드롭 영역 일치** — S
  - [`AssetBrowser.tsx:65`](src/ui/Panels/AssetBrowser.tsx) 가 *"Drag & drop also works on the graph"* 라고 안내하지만, 실제 드롭 핸들러는 [`NodeEditor/index.tsx:209`](src/ui/NodeEditor/index.tsx) 한 곳뿐. AssetBrowser 패널 위에 드롭하면 무반응. 패널 컨테이너에 `onDragOver`/`onDrop` → `importFiles(files)` 부착해 UI 카피와 동작 일치. 단순 패치라 게이트 영향 좁음.
- [ ] **E5. 콜드 존 단위 테스트 보강** — S
  - 임계치(30/22/22/30) 턱걸이 상태 — 2026-05-12 측정 32.2 / 26.78 / 29.2 / 32.16. 다음 UI 작업 한두 건만 추가돼도 게이트 실패 위험. 순수 로직인데 0~15 % 만 커버된 모듈에 단위 테스트 보강: `recorder.ts` (pickMimeType 분기, start/stop 상태 전이, blob URL 라이프사이클 — 0 %), `diagnosticsStore.ts` (set/clear/reset — 0 %), `assetStore.ts` (add/remove + rev — 12.5 %), `assetActions.ts` 의 `classifyFile` (확장자/MIME 분기 — 15 %). UI 컴포넌트가 아닌 store/순수 함수만 다루므로 jsdom 만으로 충분.

---

## 우선순위 후보 (참고)

- **빠른 가치 / 낮은 위험**: B3, C2, D2, D3, D4, **E3, E4, E5** — 모두 S 난이도, 게이트 영향 좁음.
- **사용자 체감 큰 개선**: C1 (자동완성), B1/B2 (체감 성능), A2 (외부 에디터 워크플로), **E1 (context-loss 회복), E2 (에러 표면 통합)**.
- **장기 투자**: A1 (컴퓨트 노드) — 노드 종류 신설이라 SPEC/Architecture 도 함께 갱신 필요.
- **자연스러운 묶음**: E2 + E3 — 새 toast 시스템이 autosave 에러 표면 자리를 흡수해 1 PR 로 cross-cutting fix. E1 은 단독 PR 권장 (영향 범위 다름).

# ShaderPlayground 스펙

WebGL2 기반 쉐이더 작성/체이닝 플레이그라운드. 노드 그래프로 메시·텍스처·쉐이더를 연결하고, 인라인 에디터에서 GLSL을 작성·디버깅한다.

---

## 1. 기술 스택 선정

### 1.1 UI 프레임워크: **React 18 + TypeScript**

현재 스캐폴드는 바닐라 TS이지만, 다음 이유로 React 도입을 권장한다.

- 노드 에디터·코드 에디터·인스펙터 등 **상태 의존 UI가 다수**라서 직접 DOM을 다루면 비용이 빠르게 커진다.
- 본 스펙에서 채택하는 라이브러리(React Flow, CodeMirror 6, Monaco 등) 모두 React 통합이 가장 성숙하다.
- 렌더 루프(WebGL)는 React 외부에서 RAF로 독립 구동하므로, React가 **UI 레이어에 한정**되어 성능 영향이 없다.

대안: 바닐라 유지(Litegraph.js 채택 시 가능). 단, 우측 패널·모달·다이얼로그 등 일반 UI 비용이 직접 늘어난다.

### 1.2 노드 그래프: **React Flow (`@xyflow/react`) v12**

| 후보 | 채택 여부 | 이유 |
|---|---|---|
| **React Flow** | ✅ | TS 일급 지원, 커스텀 노드/엣지 자유도 높음, 핸들 기반 연결 검증 API, 미니맵·줌·자동 레이아웃 등 표준 인프라가 갖춰짐, 활발한 유지보수. |
| Litegraph.js | ❌ | ComfyUI에서 검증된 안정성과 캔버스 기반 성능은 매력적이나, 자체 캔버스라 React 위젯(코드 에디터, 색상 피커 등) 임베드가 까다롭다. TS 타입도 비공식. |
| Rete.js v2 | ❌ | 플러그인 아키텍처가 강력하지만 학습 곡선이 가파르고, 본 프로젝트 규모에는 과하다. |
| Drawflow / baklavajs | ❌ | 커뮤니티·문서가 얕다. |

### 1.3 코드 에디터: **CodeMirror 6**

| 후보 | 채택 여부 | 이유 |
|---|---|---|
| **CodeMirror 6** | ✅ | 모듈식이라 번들 크기 작음(코어 ~50KB), `@codemirror/lint`로 인라인 에러 표시가 1급 지원, Vite 친화적, GLSL은 `codemirror-lang-glsl` 또는 C 문법으로 충분히 커버. |
| Monaco | △ | VS Code급 UX지만 Web Worker 번들이 무거움(>2MB). 향후 GLSL LSP 서버를 붙일 계획이 생기면 재검토. |
| Ace | ❌ | GLSL 모드 내장은 장점이지만 API가 구식이고 React 통합이 약하다. |

**인라인 에러 표시**는 GLSL 컴파일러 로그(`gl.getShaderInfoLog`)를 파싱해 라인 번호 → CodeMirror `Diagnostic`으로 매핑한다. 일부 드라이버는 `0:line:column` 포맷을 쓰므로 정규식 파서 모듈을 둔다.

### 1.4 메시 로더: **`@loaders.gl/gltf` + `@loaders.gl/obj`**

| 후보 | 채택 여부 | 이유 |
|---|---|---|
| **loaders.gl** | ✅ | three.js 의존성 없이 독립 사용 가능. OBJ/GLTF/PLY/Draco까지 모듈식 추가 가능. WebGL 친화적인 typed-array 출력. |
| three.js loaders | ❌ | 본 프로젝트는 raw WebGL2를 직접 다루는 것이 학습 목적이라 three.js 코어를 끌어오기엔 무겁다. |
| 자체 파서 | △ | OBJ는 가능하지만 GLTF의 binary/glb·extensions까지 직접 짜는 것은 가성비가 낮다. |

기본 프리미티브(cube, sphere, plane, torus, quad)는 **하드코딩 생성기**로 제공한다(외부 의존성 없음). GLTF는 **지오메트리만** 사용하고, 머티리얼·애니메이션·스킨은 무시한다(쉐이더는 사용자가 그래프에서 구성하므로 GLTF 머티리얼은 의미가 없다).

### 1.5 이미지 로더: **브라우저 네이티브 (`createImageBitmap`)**

PNG/JPG/WebP는 `createImageBitmap` → `gl.texImage2D`로 충분. HDR/EXR을 다룰 계획이 생기면 `parse-hdr` 또는 `tinyexr-wasm`을 옵션 의존성으로 추가한다.

### 1.6 상태 관리: **Zustand**

그래프 노드/엣지·셀렉션·에셋 카탈로그 등 다수의 독립 스토어가 필요하다. Redux는 보일러플레이트가 과하고, React Context는 노드 다수 환경에서 렌더 비용이 커진다. Zustand는 selector 기반 부분 구독이 강력해 노드 그래프 시나리오에 적합하다.

### 1.7 WebGL 보조: **twgl.js (선택)** + 자체 얇은 래퍼

raw WebGL2를 직접 쓰되, 유니폼 setter·텍스처 생성·FBO 등 보일러플레이트가 많은 부분만 `twgl.js`로 보조한다. 학습 목적이 강하다면 자체 래퍼만으로 진행해도 무방.

### 1.8 빌드/툴

- **Vite 6** (현행 유지). `?raw` import로 GLSL 텍스트 로드.
- **TypeScript ~5.6** (현행 유지).
- 포맷터/린터: **Prettier + ESLint (typescript-eslint)** — 신규 추가 권장.
- 테스트: **Vitest** — 그래프 토폴로지 정렬, GLSL 에러 파서 등 순수 로직 단위 테스트.

### 1.9 의존성 요약

```jsonc
{
  "dependencies": {
    "react": "^18.3.0",
    "react-dom": "^18.3.0",
    "@xyflow/react": "^12.0.0",
    "zustand": "^5.0.0",
    "codemirror": "^6.0.0",
    "@codemirror/state": "^6.0.0",
    "@codemirror/view": "^6.0.0",
    "@codemirror/language": "^6.0.0",
    "@codemirror/lint": "^6.0.0",
    "codemirror-lang-glsl": "^1.0.0",
    "@loaders.gl/core": "^4.0.0",
    "@loaders.gl/gltf": "^4.0.0",
    "@loaders.gl/obj": "^4.0.0",
    "twgl.js": "^5.5.0",
    "gl-matrix": "^3.4.3"
  },
  "devDependencies": {
    "typescript": "~5.6.3",
    "vite": "^6.0.0",
    "@vitejs/plugin-react": "^4.0.0",
    "vitest": "^2.0.0",
    "eslint": "^9.0.0",
    "prettier": "^3.0.0"
  }
}
```

---

## 2. 아키텍처 설계

레이어 분리, 노드/포트 모델, 컴파일·렌더 파이프라인, 카메라, 썸네일 서브시스템, 상태 스토어 구조, 에러 처리, 직렬화, 정적 HTML export 등 **현 구현(Phase 22)의 동작 설명은 [Architecture.md](./Architecture.md) 로 이전**되었다. 본 SPEC 의 노드 모델·연결 규칙·페이즈 결정은 그쪽 문서의 §2 (그래프 모델) / §3 (컴파일) / §4 (렌더 루프) 와 일치하도록 유지된다.

핵심 SPEC 차원 결정만 다시 한 번 요약:

- 노드 종류는 12 가지 — `Mesh / Image / Webcam / Video / Audio / Shader / Compute / Output / Param / Math / Swizzle / Combine`. Shader 와 Compute 의 입력 포트는 GLSL 의 `uniform` 선언으로부터 매번 다시 파싱되어 자동 생성된다. Webcam / Video / Audio 는 plan 외부 싱글톤 풀(`core/external/registry.ts`)이 lifecycle 을 관리하는 라이브 외부 텍스처 소스다.
- ShaderNode 는 vertex + fragment GLSL 한 쌍을 함께 보유. 메시 입력이 없으면 빌트인 `fullscreen.vert` 가 자동 주입되고 사용자의 vertex 소스는 사용되지 않는다.
- ComputeNode 는 vertex GLSL 한 개와 `transformFeedbackVaryings` 로 캡처할 출력 attribute 목록을 보유. fragment 단계는 `RASTERIZER_DISCARD` 로 비활성화되고, ping-pong 두 vbo 세트로 매 프레임 시뮬레이션 결과를 갱신한다. 출력은 `mesh` 포트 하나 — 다운스트림 ShaderNode 가 mesh 입력으로 받아 POINTS/LINES/TRIANGLES 중 하나로 그린다.
- 포트 타입은 6 가지 — `mesh / texture / float / vec2 / vec3 / vec4`. 분기(1:N)는 허용, 합성(N:1)은 금지. Output 노드는 그래프당 0~4 개, 5 개 이상은 검증 단계에서 거부.
- 유틸 노드(Math/Swizzle/Combine)는 GL 패스를 만들지 않고 ShaderNode/ComputeNode 의 비-샘플러 uniform 입력을 CPU 측에서 매 프레임 평가해 덮어쓴다. fan-out 시 프레임당 1 회 메모이즈.
- 모든 ShaderNode 카드는 자기 FBO 컬러 어태치먼트의 96×96 라이브 썸네일을 표시. 추가 렌더 패스 없이 PBO + `fenceSync` 비동기 readback 으로 가져오며, 10 Hz 스로틀 + IntersectionObserver 가시성 컬링을 적용. ComputeNode 는 FBO 가 없어 썸네일이 없고, 대신 카드에 vertex count/primitive 메타정보를 표시한다.

자세한 동작·코드 경로는 [Architecture.md](./Architecture.md) 의 §2~§11 참조.

---

## 3. 디렉토리 구조

전체 트리와 모듈별 책임은 [Architecture.md §12](./Architecture.md#12-디렉토리-트리-phase-22-기준) 로 이전되었다. 초안 SPEC 디렉토리와 실제 구현이 어떻게 달라졌는지(노드 모듈 통합, edges 패키지 폐기, Viewport 컴포넌트 분할 폐기, SidePanel 단일화, export 신설 등) 도 같은 문서의 §12.1 참조.

---

## 4. 개발 페이즈

각 페이즈는 머지 가능한 단위로, 끝에서 항상 앱이 실행 가능한 상태여야 한다.

### Phase 0 — 현행 (완료)
- Vite + TS + WebGL2 풀스크린 쿼드 동작.

### Phase 1 — UI/상태 인프라 도입 (1~2일)
- React 18 도입, `App.tsx` 레이아웃 (그리드: 그래프 / 뷰포트 / 코드).
- Zustand 스토어 골격(`graphStore`, `rendererStore`).
- 기존 풀스크린 쿼드를 Viewport 컴포넌트 안으로 이동, RAF 루프는 그대로.
- ESLint/Prettier/Vitest 설정.
- **검증**: 화면 분할이 보이고 기존 셰이더가 우측 뷰포트에서 그대로 돈다.

### Phase 2 — Core 렌더러 + 카메라 (FBO 체인) (3~4일)
- `core/gl/*` 모듈화: program/texture/framebuffer/mesh.
- `core/camera/orbitCamera.ts` + 마우스/휠 입력 바인딩.
- 단일 쉐이더 패스 → 다중 패스(FBO ping-pong) 동작.
- 시스템 유니폼(`u_time`/`u_resolution`/`u_view`/`u_proj`/`u_model`) 자동 바인딩.
- 하드코딩된 그래프(MeshNode → ShaderNode → OutputNode)로 Core만 단독 검증. **Output 노드도 데이터 모델 단계부터 명시**.
- Output 노드가 없는 그래프는 placeholder 처리 분기를 검증.
- **검증**: UI 없이 코드로 정의한 그래프가 화면에 렌더되고, 마우스로 카메라가 움직인다. Output을 떼면 placeholder가 나온다.

### Phase 3 — 코드 에디터 + vertex/fragment 탭 + 라이브 컴파일 (2~3일)
- CodeMirror 6 + GLSL 언어 통합.
- `StageTabs`로 한 ShaderNode의 vertex/fragment 소스를 탭 전환 편집.
- 입력 디바운스(50ms) 후 GL 프로그램 재링크.
- `getShaderInfoLog` 파서 → 인라인 Diagnostic. vertex/fragment 어느 쪽 에러인지 탭 헤더에 빨간 닷.
- **검증**: 코드 수정 시 1~2프레임 내 화면 반영, 문법 오류 시 빨간 밑줄 + 어느 stage 에러인지 식별 가능.

### Phase 4 — 단일 쉐이더 노드 + 유니폼 자동 노출 (2~3일)
- ShaderNode 1개 + (Mesh | Image) 입력 + Output. 그래프는 아직 하드코딩.
- `uniformParser`로 GLSL `uniform` 선언을 파싱해 인스펙터에 자동 컨트롤 생성.
- 타입별 컨트롤: `float` 슬라이더, `vec2/3/4` 다축 슬라이더, `*Color`/`u_color*` 컬러 피커.
- 시스템 유니폼은 자동 숨김.
- **검증**: 사용자가 `uniform float u_intensity;`를 추가하면 즉시 인스펙터에 슬라이더가 나타나고 드래그가 화면에 반영된다.

### Phase 5 — 노드 그래프 GUI + 노드 썸네일 (4~5일)
- React Flow 통합, MeshNodeView/ImageNodeView/ShaderNodeView/**OutputNodeView** 커스텀 노드.
- Toolbar의 노드 팔레트에 Output 노드 포함, 사용자가 명시적으로 배치.
- `isValidConnection`으로 포트 타입 검증, 사이클 차단, **Output 2개 이상 차단**.
- graphStore ↔ React Flow 양방향 동기화.
- 선택 노드의 GLSL이 CodeEditor에 로드되고, 유니폼 컨트롤이 우측 Inspector에 자동 노출되도록 셀렉션 연동.
- `core/thumbnail/*` 구현, ShaderNode/ImageNode 카드 내부 라이브 썸네일 동작.
- **검증**: GUI에서 노드 생성/연결/삭제만으로 Phase 4 시나리오 재현. Output을 빼면 placeholder, 다시 꽂으면 즉시 출력. 모든 ShaderNode 카드에 Blender처럼 라이브 썸네일이 표시된다.

### Phase 6 — 다중 쉐이더 체이닝 (2일)
- ShaderNode → ShaderNode 연결 → FBO 텍스처 자동 라우팅.
- GraphCompiler에 토폴로지 정렬 + FBO 풀 할당 로직.
- 입력이 없는 ShaderNode는 풀스크린 쿼드 폴백.
- **검증**: 쉐이더 3개 체이닝(예: 노이즈 → 블러 → 톤매핑) + Output 노드. 각 중간 노드의 카드 썸네일에서 단계별 결과가 동시에 보인다.

### Phase 7 — 외부 에셋 로더 (2~3일)
- 프리미티브 5종(cube/sphere/plane/torus/quad).
- OBJ 임포트(loaders.gl).
- GLTF 임포트(애니메이션/머티리얼은 무시, 메시만).
- 이미지 임포트(PNG/JPG/WebP).
- AssetBrowser 패널 + 드래그&드롭.
- **검증**: 사용자가 OBJ/PNG를 드롭하면 노드로 등장하고 즉시 연결 가능.

### Phase 8 — 직렬화 & 마무리 (1~2일)
- 그래프 JSON export/import.
- 에셋은 IndexedDB에 캐시(파일 경로 의존 제거).
- 프리셋 예제 그래프 2~3개 번들.
- 스크린샷 캡처, 에러/통계 표시(StatusBar).

### Phase 9 — 에디터 경험 강화 (완료)
- **GLSL 주석 힌트**(`// @range a..b`, `// @min/@max`, `// @step`, `// @default`, `// @label "..."`)로 인스펙터 컨트롤 메타 오버라이드. 동일 라인 트레일링 주석과 바로 위 주석 양쪽 모두 지원. (Phase 12 에서 `// @color` / `// @slider` / `// @multi` 추가로 컨트롤 종류 자체도 오버라이드 가능.)
- **시간 컨트롤**: `simTime`이 wall-clock과 분리된 별도 store. 재생/정지, 스크럽 슬라이더, 0~4× 배속, Spacebar 토글. `u_time`은 `simTime`을 받음.
- **카메라 컨트롤 UI**: 인스펙터에 Reset 버튼 + FOV 슬라이더(10°~120°).
- **배경색 피커**: 출력 없을 때 placeholder 색, Output 합성 시 클리어 색에 사용.
- **Problems 패널**(Inspector ↔ Assets ↔ Problems 탭 전환): 모든 노드의 GLSL Diagnostic + 런타임 에러를 한 곳에 모음. 클릭 시 해당 노드 선택 + vertex/fragment 탭 자동 전환. 탭 헤더에 에러 카운트 빨간 뱃지. (Phase 12 에서 **CodeEditor 라인 점프**까지 확장 — 항목 클릭 시 진단 위치로 커서 이동 + 가운데 정렬 스크롤 + 포커스.)
- **Undo/Redo** (Cmd+Z / Cmd+Shift+Z, Cmd+Y): 최대 100건 히스토리. 데모 부트스트랩과 슬라이더 드래그(uniformRev)는 히스토리에 포함하지 않음.
- **Command Palette** (Cmd+K): 노드 추가, 프리셋 로드, 그래프 클리어 — 퍼지 매칭.
- **검증**: GLSL에 `// @range 0..5 @default 2` 추가 → 인스펙터 슬라이더 즉시 반영. Cmd+Z로 노드 추가/삭제 되돌리기. Cmd+K로 프리셋 즉시 로드.

### Phase 10 — 표현력 확장 (완료)
- **Parameter 노드** 4종: `Float` / `Vec3` / `Color` / `Time`. Time은 `simTime × scale + offset` 으로 매 프레임 재평가되어 단일 float 출력. 인스펙터에서 값/레이블 편집.
- **셰이더의 비-샘플러 uniform**도 입력 포트로 노출 (`float`/`vec2`/`vec3`/`vec4`). 동일 이름 핸들에 파라미터 노드를 연결하면 인스펙터 값 대신 파라미터가 매 프레임 uniform 을 덮어씀.
- **포트 타입 확장**: 기존 `mesh`/`texture`에 `float`/`vec2`/`vec3`/`vec4` 추가. React Flow `isValidConnection`에서 동일 타입만 허용.
- **Multi-Output**: 그래프당 1~4개 Output 노드 허용. 분할 뷰포트 레이아웃(1=전체, 2=좌우, 3=상단2+하단1, 4=2×2). `splitLayout()` 단위 테스트.
- **Blend 셰이더 템플릿**: 두 sampler 입력 + `u_mix` + `u_mode`(0=mix, 1=add, 2=multiply, 3=screen). 툴바와 팔레트에서 1클릭으로 추가.
- **AssetBrowser 탭**: 메시/이미지 카탈로그 + 썸네일, 'Forget' 버튼, '+ Node' 버튼으로 즉시 그래프에 추가.
- **Split 데모 프리셋**: noise→blur→tonemap 체이닝의 각 단계를 동시에 보여주는 3-Output 예제.
- **검증**: Color 파라미터를 sphere의 `u_baseColor`에 연결하면 인스펙터 슬라이더 무시하고 파라미터 색이 적용됨. Split 프리셋 로드 시 캔버스가 3분할로 동시 렌더.

### Phase 11 — 공유/배포 (완료)
- **Share URL** (`#share=<payload>`): gzip(`CompressionStream`) + URL-safe base64로 직렬화한 프로젝트를 URL hash 에 인코딩. 앱 부트 시 hash 감지 → 자동 import (실패 시 데모 폴백). Sphere 데모 ≈ 900자.
- **캔버스 녹화 → WebM**: `MediaRecorder` + `canvas.captureStream(30fps)`. 툴바 ● Record / ■ Stop 토글, 녹화 중 빨간 강조. 멈추면 자동 다운로드. VP9 → VP8 → WebM → mp4 순으로 mimeType 폴백.
- **정적 HTML export**: 의존성 0인 단일 파일(~26KB) 생성. `src/export/standalonePlayer.js`에 자체 mat4·primitive 생성기·compile·execute 미니 런타임을 인라인(Vite `?raw`). 프로젝트 JSON은 `window.__SP_PROJECT`로 임베드. split-output, 파라미터 노드, FBO 체인까지 그대로 동작. 익스포트된 HTML 내 `</script>` 인젝션 방지 이스케이프.
- **검증**: Share URL 복사 → 다른 탭에서 열어 동일한 그래프 복원. `Export HTML`로 받은 파일을 `iframe srcdoc`에 마운트 → 메인 뷰포트와 동일한 셰이더 체인 렌더.

### Phase 12 — 회복성·표현력 보강 (완료)
- **ProblemsPanel → CodeEditor 라인 점프**: Problems 항목 클릭 시 노드 선택 + vertex/fragment 탭 전환 *에 더해* CodeMirror 가 해당 라인으로 스크롤(가운데 정렬) + 커서 이동 + 포커스까지 수행. `editorStore.jumpRequest`에 rev 카운터를 포함해 동일 라인을 두 번 눌러도 두 번째 클릭이 다시 발화한다. 점프는 effectiveId·stage 가 요청과 일치할 때만 일어나 stage 전환 직후의 doc 교체와 경합하지 않는다.
- **Auto-save + 세션 복구**: 그래프 구조 rev 가 바뀌면 30 초 디바운스로 직렬화된 프로젝트 JSON 을 IndexedDB(`shader-playground-session/session/autosave`) 에 저장. 다음 부트 때 저장본이 있으면 모달 다이얼로그로 "이전 작업을 복구할까요?" 를 표시 — 백업 시각·노드 수 표시, [복구]/[새로 시작] 2 버튼. share 해시(`#share=...`) 가 있으면 백업을 의도적으로 무시 + 삭제(공유 URL 이 복구보다 우선). bootstrap rev 와 lastSavedRev 가 같으면 데모 그래프 자체는 저장되지 않으므로 첫 클린 부팅에서는 다이얼로그가 뜨지 않는다.
- **GLSL 주석 힌트 확장**: 기존 메타 키(`@range/@min/@max/@step/@default/@label`)에 더해 **컨트롤 종류 오버라이드** 키 도입.
  - `// @color`: vec3/vec4 에 강제로 컬러 피커. 이름이 `*Color` 가 아니어도 작동. 이전 추론이 다축 슬라이더였다면 범위를 `0..1`, 디폴트를 흰색 벡터로 자동 승격(사용자가 `@default` 를 같이 지정하면 그 값이 우선).
  - `// @slider`, `// @multi`: 컬러 추론을 되돌리거나, 컬러 → 다축 슬라이더로 강제. sampler/matrix/bool 타입에는 적용되지 않는다.
  - 동일 토큰이 여러 번 등장하면 마지막이 이김(예: `@color @slider` → slider).
  - 원칙: **명시적 주석이 이름 패턴 추론보다 항상 우선** (SPEC §2.2.2 의 후행 메모를 본격 채택).
- **Math/Swizzle/Combine 유틸 노드**: 위 §2.2 표에 추가된 세 종류의 CPU 평가 노드. ShaderNode 비-샘플러 uniform 입력에 연결되어 프레임마다 평가되고, 그 결과로 uniform 을 덮어쓴다. CommandPalette 에 `Add Math: <op>` × 8, `Add Swizzle: .<mask>` × 8 프리셋, `Add Combine: Float×N → vec N` × 3 등록.
- **썸네일 readback PBO 비동기화**: 기존 `gl.readPixels` 동기 호출을 WebGL2 PBO + `fenceSync` 로 교체. 매 프레임 `clientWaitSync(timeout=0)` 로 완료된 슬롯만 `getBufferSubData`→다운샘플→`scheduler.commit`. 미완료 슬롯은 그대로 유지되므로 메인 스레드 stall 이 사라진다(N 프레임 지연 허용). 노드당 in-flight 1건, 컴파일로 사라진 노드는 PBO 해제. 96×96 해상도, 10 Hz throttle 그대로 유지.
- **검증**: Vitest 추가 51건(`asyncReadback` 8, `autoSave` 7, `editorStore` 3, `utility` 25, `uniformParser` +8, 합계 182 통과). Chrome 자동화로 (a) Problems 항목 클릭 → 정확한 라인 활성화, (b) 자동저장 → 리로드 → 복구 다이얼로그 양 경로, (c) `@color` 가 컬러 피커로 즉시 전환, (d) Param→Math→Combine→Swizzle 체인이 sphere 색을 변경, (e) Chain 프리셋(3 노드)의 96×96 썸네일 라이브 갱신을 확인.

### Phase 13 — Transform Feedback 컴퓨트 노드 (완료)
- **새 노드 종류 `compute`**: WebGL2 `transformFeedbackVaryings` 로 vertex stream 을 캡처해 GPU 측 파티클/시뮬레이션을 지원. 노드 한 개당 vertex shader 한 개, 출력 attribute 페어 목록(`{ inName, outName, size, seed }`), 카운트, 출력 primitive(POINTS/LINES/TRIANGLES) 를 보유. fragment stage 는 `RASTERIZER_DISCARD` 로 비활성화되어 raster 비용 0.
- **Ping-pong 더블 버퍼**: 한 attribute slot 당 vbo 두 개(A/B) + VAO 두 개 + TF object 두 개. 매 frame dispatch 마다 read 측을 스왑해 다음 프레임 입력이 이번 프레임 출력. seed 함수는 빌트인(`sphere` / `cube` / `random` / `zero`) 으로 attribute 마다 지정. recompile 시 seed 로 재초기화.
- **포트 표면**: ShaderNode 와 동일하게 vertex source 의 비-샘플러 uniform 선언이 입력 포트로 자동 노출(Param/Math/Swizzle/Combine 연결 가능). sampler/mesh 입력은 금지(컴퓨트는 첫 단계 시뮬레이터로 한정). 출력은 `mesh: mesh` 단일 — 다운스트림 ShaderNode 가 mesh 입력으로 받아 자기 vertex/fragment shader 로 점/선/삼각형을 렌더.
- **ExecutionPlan 통합**: 기존 `passes: ShaderPass[]` 를 `passes: (ShaderPass | ComputePass)[]` union 으로 확장하고 위상 순서를 그대로 보존. 컴퓨트 → 셰이더 → (다음 프레임) 컴퓨트 의존성도 같은 배열에서 자연 처리.
- **ShaderPass.mesh 듀얼 VAO**: ShaderNode 가 mesh 입력으로 ComputeNode 를 받으면 ShaderPass 가 두 VAO 를 들고 매 프레임 ComputePass.read 에 맞춰 활성 VAO 를 전환. 일반 mesh 입력 (primitive/asset) 은 기존 path 그대로.
- **dirty 게이트 영향**: 컴퓨트 패스가 한 개 이상이면 `timeStore.playing === true` 일 때 무조건 dirty(RAF idle 게이트 B2 가 정지된 정적 그래프로 분류하지 않음). 시간이 정지되면 dispatch 가 건너뛰어져 시뮬레이션도 멈추고 idle 가능.
- **유틸리티 노드 연동**: ComputeNode 의 uniform 입력에 Param/Math/Swizzle/Combine 을 그대로 연결 가능. fan-out 캐시도 ShaderNode 와 공유.
- **CommandPalette**: `Add Compute: Particle (POINTS)` 프리셋 + `Add Compute (empty)` 1 종 등록.
- **데모 프리셋**: `createParticleDemoGraph()` — sphere seed 의 1024 POINTS 가 sin 기반 noise field 로 흐르는 파티클 시뮬. Phase 13 의 E2E 가 이 프리셋을 골든 시나리오로 사용.
- **검증**: Vitest 단위 테스트 — types/registry/validate/serialization/compile 의 compute 경로 신규. Playwright E2E Phase 13 — (a) CommandPalette 로 Particle 프리셋 로드, (b) ComputeNode → ShaderNode → Output 체인 컴파일·렌더 확인, (c) 노드 삭제 시 dispose 안정, (d) Share URL 라운드트립으로 compute 노드 복원, (e) 시간 정지 후 idle 게이트 동작.

### Phase 14a — 외부 입력 텍스처 · Webcam (완료)
- **새 노드 종류 `webcam`**: `navigator.mediaDevices.getUserMedia` 로 받은 live MediaStream 을 매 프레임 GL 텍스처로 업로드. 입력 포트 0, 출력 `texture: texture` 단일. 옵셔널 `deviceId` (없으면 브라우저 기본 카메라). 직렬화 시 deviceId 만 보존 (256자 제한), 권한은 share/autosave 복원 시 사용자가 다시 승인.
- **External singleton registry** (`src/core/external/registry.ts`): 노드 ID → `{ video, stream, glTexture, ready, error }` 핸들 Map. `reconcileExternal(specs)` 가 compile 직후 호출되어 그래프 변화에 맞춰 acquire/release/restart (deviceId 변경 시). **`plan.dispose()` 와 의도적으로 분리** — recompile 마다 권한 재요청 / 스트림 재시작이 일어나지 않도록 lifecycle 을 plan 외부에 둠. acquire 는 Promise; ready 전까지는 `getExternalTexture` 가 null 반환 → sampler 스킵 → 검은 프레임. 첫 frame 도착 시 `texImage2D(HTMLVideoElement)`, 이후 매 RAF `texSubImage2D`.
- **ExecutionPlan.hasExternal**: webcam 노드 1개 이상이면 true. RAF idle gate (B2) 의 *네 번째* unconditional dirty 신호로 추가 — `playing`/`hasCompute when playing`/store-rev 변화에 이어 external 소스가 있으면 무조건 dirty (스트림이 매 프레임 새 데이터를 줌). compile fatal 분기(cycle 등)에서도 hasExternal 은 그대로 보존 — 일시적 사이클이 카메라를 죽이지 않도록.
- **bindSamplers fallback**: `passByNode` → `imageTextures` 미스 시 `getExternalTexture(sourceNodeId)` lookup. 기존 sampler 라우팅 한 줄만 확장.
- **NodeView 라이브 프리뷰**: 카드에 96×64 `<video>` 자체 생성 + registry 의 stream 을 srcObject 로 미러 (200ms polling 으로 attach). status (requesting / live · WxH / error) 카드 메타에 표시. minimap 색상 `#d65656`.
- **Inspector**: 디바이스 드롭다운 (`enumerateDevices` + `devicechange` 리스너로 라이브 갱신, 빈 문자열 = 기본 디바이스로 reset), live status 줄.
- **Static HTML export**: `standalonePlayer.js` 가 webcam 풀 자체 구현 — `initWebcams()` 1회 acquire, `updateWebcams()` 매 frame `texSubImage2D`, sampler 라우팅에 fallback. mimeType/리커버리 같은 디테일 없이 권한 거부 시 검은 프레임.
- **CommandPalette / Toolbar**: `Add Webcam (live camera)` 항목 두 곳.
- **검증**: Vitest 단위 22건 추가 (`external/registry` 11, `compile` +3 hasExternal/restore, `nodes/registry` +2 webcam port/clone, `projectSanitize` +4 deviceId 보존/oversize 드롭, `graphStore` +2 setWebcamConfig). Playwright E2E `phase-14-webcam.spec.ts` 4건 — (a) Chromium fake stream (`--use-fake-device-for-media-stream`) 이 webcam→shader→output 체인으로 렌더, (b) 노드 제거 시 dispose 안정 + 런타임 에러 0, (c) serialize/deserialize 라운드트립으로 webcam 노드 보존, (d) time pause 후에도 plan.hasExternal 로 인해 `stats.drawCalls > 0` 유지 (idle gate 우회 검증).

### Phase 14b — Video 노드 (완료)
AssetBrowser 에서 import 한 mp4/webm 파일을 매 프레임 GL 텍스처로 업로드하는 외부 소스 노드. webcam 과 같은 `core/external/registry.ts` 싱글톤 풀에 얹혀 lifecycle 을 plan 외부에서 관리한다.
- **새 노드 종류 `video`**: 입력 포트 0, 출력 `texture: texture` 단일. 필드 — `assetId`(import 한 비디오 에셋 참조, 미바인딩 시 null), `playing` / `loop` / `muted`, 옵셔널 `currentTime`(seek 타깃, 값이 바뀔 때만 restart 없이 `<video>` 가 seek). play/pause/loop/mute/seek 는 in-place 적용이고 **assetId 변경만 restart**.
- **로더 (`core/assets/videoLoader.ts`)**: import 시 off-DOM `<video>` 를 마운트해 width/height/duration 메타데이터만 프로빙(8 초 하드 타임아웃 → 악성 파일이 import 를 멈추지 않음). 빈 `file.type` 는 확장자로 MIME 추론(`preload="auto"` 로 moov 박스가 끝에 있는 MP4 도 디코드). 원본 Blob 은 그대로 IndexedDB videos store 에 캐시.
- **registry 핸들**: `VideoHandle` 이 resolved Blob → object URL → `<video>` 를 들고 첫 디코드 가능 프레임에서 `ready`. `updateExternalSources(gl)` 가 매 RAF `texSubImage2D(HTMLVideoElement)` 로 신선한 frame 업로드. assetId 는 `setVideoBlobResolver` 로 주입된 resolver 로 해석(registry 가 assetStore 를 직접 import 하지 않게 하는 단방향 경계).
- **UI**: `VideoNodeView`(카드 라이브 `<video>` 프리뷰 + status), `VideoInspector`(에셋 선택 / play·pause / loop / mute / seek 스크럽). minimap 색 `#c156d6`. CommandPalette `Add Video (mp4/webm asset)` + Toolbar `+ Video`.
- **정적 export**: `standalonePlayer.js` 가 video 소스를 자체 구현 — 임베드된 Blob → object URL → `<video>` 로 매 frame `texSubImage2D`, sampler fallback. 마이크/권한 디테일 없이 파일만.
- **검증**: Vitest `videoLoader` 메타 프로빙·MIME 추론, `projectSanitize` 필드 검증/보존, `external/registry` video acquire/restart/release. Playwright E2E `phase-14b-video.spec.ts` 4 건 — (a) assetId 없는 video 노드가 컴파일·에러 보고하되 런타임 에러 0, (b) 노드 제거 시 dispose 안정, (c) Share URL 라운드트립 보존, (d) time pause 후에도 `plan.hasExternal` 로 렌더 루프 유지.

### Phase 14c — Audio 노드 (완료)
마이크 또는 파일 오디오를 `AnalyserNode` FFT bin 으로 떠서 1D R8 텍스처(`fftSize/2 × 1`)로 노출. 셰이더는 이 텍스처를 샘플해 스펙트럼·라우드니스(평균)를 시각화한다.
- **새 노드 종류 `audio`**: 입력 포트 0, 출력 `texture: texture` 단일. 필드 — `sourceKind`(`mic` → `getUserMedia({audio:true})` / `file` → `decodeAudioData(blob)`), `assetId`(file 모드), `fftSize`(`AUDIO_FFT_SIZES` 32~2048 의 2 의 거듭제곱), `smoothing`(`AnalyserNode.smoothingTimeConstant` 0~1), file 모드의 `playing` / `loop`.
- **로더 (`core/assets/audioLoader.ts`)**: import 시 임시 `AudioContext.decodeAudioData` 로 duration/sampleRate/channels 만 프로빙하고 디코드된 PCM 은 즉시 폐기(mp3→PCM 은 메모리 ~10 배). 재생은 영속된 Blob 에서 다시 디코드.
- **registry 핸들**: `AudioHandle` 이 `AudioContext` + `AnalyserNode` 를 들고, mic 모드는 `MediaStreamAudioSourceNode`, file 모드는 `AudioBufferSourceNode`. `bins` 는 `fftSize/2` 크기 재사용 `Uint8Array`(fftSize 변경 시 재할당). 매 RAF `getByteFrequencyData(bins)` → R8 텍스처(`width=fftSize/2, height=1`) 업로드. assetId 는 `setAudioBlobResolver` 로 해석.
- **UI**: `AudioNodeView`(source kind / fftSize / status 메타), `AudioInspector`(mic↔file 토글 / 에셋 선택 / fftSize 드롭다운 / smoothing 슬라이더 / play·loop). minimap 색 `#56c1d6`. CommandPalette `Add Audio (mic/file FFT texture)` + Toolbar `+ Audio`.
- **정적 export**: `standalonePlayer.js` 가 file 모드 audio 를 자체 구현(`createAnalyser` + FFT bin → R8 텍스처). 마이크는 `getUserMedia({audio:false})` 로 비활성 — export 결과물은 파일 오디오만.
- **검증**: Vitest `audioLoader` 메타 디코드, `projectSanitize`(sourceKind / fftSize / smoothing 클램프·검증), `external/registry` audio mic·file lifecycle. Playwright E2E `phase-14c-audio.spec.ts` 4 건 — (a) assetId 없는 file audio 노드가 컴파일·에러 보고하되 런타임 에러 0, (b) 노드 제거 시 dispose 안정, (c) Share URL 라운드트립 보존, (d) time pause 후에도 `plan.hasExternal` 로 렌더 루프 유지.

### Phase 15 — GPU Timer Overlay (완료)
- **`EXT_disjoint_timer_query_webgl2` 통합**: `core/gl/gpuTimer.ts` 의 `GpuTimerPool` 이 `TIME_ELAPSED_EXT` 쿼리로 각 ShaderPass / ComputePass 의 GPU 시간을 비동기로 측정. extension 미노출 환경(Safari 등)에서는 `create()` 가 null → 모든 begin/end 가 옵셔널 체이닝으로 no-op.
- **lifecycle**: thumbnail PBO 풀과 동형 — `begin/end/poll/release/dispose`. nested begin 은 무시(첫 활성 쿼리 유지). `GPU_DISJOINT_EXT` 발화 시 in-flight 쿼리 전부 폐기 후 다음 프레임 재시작.
- **`gpuTimerStore` (Zustand)**: 결과는 EMA(α=0.2) 로 평활해 `byNode[id]` 에 저장, `totalMs` 는 매 sample 시 합계 재계산. `supported`/`enabled` 두 flag — 둘 다 true 일 때만 `executePlan` 이 timer 인스턴스를 받음.
- **UI**: ShaderNodeView / ComputeNodeView 카드 우상단 `0.42ms` 칩(`node-card__gpu-ms`), StatusBar 우측에 합계 `12.3ms GPU`, ViewportControls 에 enable 체크박스 (지원 안 됨이면 `unavailable` 라벨). 칩은 `<0.01ms` 미만일 때 `<0.01ms` 표시.
- **lifecycle hooks**: Viewport recompile 시 사라진 노드 ID 에 대해 `pool.release` + `store.removeNode`. context lost → restored 경로에서 pool 을 재생성하고 supported flag 를 다시 반영.
- **검증**: Vitest 단위 18 건 (`gpuTimer.test.ts` 11 — extension probe / nest 방지 / 쿼리 재활용 / disjoint / release / dispose, `gpuTimerStore.test.ts` 7 — EMA / total / removeNode / supported·enabled 전이). Playwright E2E `phase-15-gpu-timer.spec.ts` 5 건 — (a) 스토어 shape 노출, (b) 칩 렌더 + ms 텍스트, (c) StatusBar GPU 컬럼 표시, (d) disable 토글이 UI 양쪽 다 숨김, (e) 노드 제거 시 `byNode` 에서 항목 정리.

### Phase 16 — 디버깅 · 진단 인프라 (완료)
개발자용 런타임 추적 인프라. 사용자 알림(`toastStore`)·GLSL 진단(`diagnosticsStore`)과 역할이 분리된, 평소 비가시 / 필요 시 열람하는 개발자 채널.
- **중앙 로거 `src/utils/log.ts`**: 레벨(`debug`/`info`/`warn`/`error`)·카테고리(`gl`/`render`/`graph`/`assets`/`external`/`autosave`/`app`)별 로깅 + 500개 인메모리 링버퍼(초과 시 오래된 것 evict) + 구독/내보내기 API(`subscribeLog`/`exportLogText`/`clearLogBuffer`). 콘솔 미러링은 DEV 한정 + `minLevel` 게이트, 버퍼는 레벨과 무관하게 항상 기록. 어떤 store 도 import 하지 않는 leaf util (단방향).
- **전역 안전망**: `main.tsx` 의 `window.onerror`/`unhandledrejection` 핸들러 → `log.error("app", …)`. `ErrorBoundary`(메인 작업 영역만 감쌈)가 렌더 중 uncaught 를 잡아 폴백 UI(새로고침 / 진단 복사) 제공.
- **침묵 catch 추적화**: registry/audio·videoLoader/recorder/autoSave/cache 등 조용히 삼키던 실패 지점에 흔적만 추가(제어 흐름 불변). `rendererStore.errors` 는 최근 50건 상한.
- **GL 에러 표면화**: `core/gl/glError.ts` 의 DEV 한정 `checkGlError` — program 링크·FBO 셋업은 무조건, 드로우 루프는 120프레임 스로틀(`gl.getError()` 동기 플러시 비용 회피). context lost/restored 상세 로깅.
- **진단 패널 + 진단 정보 복사**: StatusBar `🛈 Diagnostics` 토글이 `debugUiStore.open` 을 켠다. `DiagnosticsPanel` 은 `subscribeLog` 로 실시간 갱신되는 로그 리스트(레벨/카테고리 필터 + Clear), `Copy` 는 `buildDiagnosticsReport`(로그 + GL renderer/version + 렌더 통계 + userAgent/화면/DPR + 그래프 노드·엣지 수)를 클립보드로(미지원 환경은 안전 폴백). GL 어댑터 identity 는 컨텍스트 생성 시 `rendererStore.glInfo` 에 1회 캡처.
- **검증**: Vitest 단위 — `log.test.ts`, `debugUiStore.test.ts`, `diagnosticsReport.test.ts`, `DiagnosticsPanel.test.tsx`, `glError.test.ts` + program/framebuffer 보강. Playwright E2E `phase-16-diagnostics.spec.ts` — StatusBar 토글로 패널 열기 → 버퍼의 로그 엔트리 표시 → Clear 동작.

### Phase 17 — Pass별 해상도 스케일 (완료)
다운샘플 기반 효과(블룸·가우시안 피라미드 등)를 위해 단일 `plan.width × plan.height` FBO 가정을 깨고 패스별 렌더 타깃 해상도를 도입.
- **모델**: `ShaderGraphNode.resolutionScale?: 0.25 | 0.5 | 1`(`RESOLUTION_SCALES`). 생략 시 1 로 간주 — 기존 저장본/공유 URL 무손상. 구조 변경이므로 setter(`graphStore.setResolutionScale`)는 `rev` 증가 + history push → recompile.
- **컴파일**: `compile.ts` 의 `scaledDimensions(w, h, scale)` 헬퍼가 `round(canvas × scale)` 로 패스별 FBO 크기를 결정(1px 하한). `ShaderPass` 에 `width/height` 저장. sampler 라우팅은 정규화 UV 라 해상도가 달라도 그대로 동작.
- **실행**: `execute.ts` 가 패스별 `gl.viewport` 와 `u_resolution` 을 `pass.width/height` 로 바인딩(이전엔 전역 `plan.width/height`). 카메라 proj aspect 도 패스 치수 기준(균일 스케일이라 비율 불변).
- **UI**: Inspector 에 셰이더 노드 전용 `Render resolution` 드롭다운(`data-testid="resolution-scale"`).
- **정적 export**: `standalonePlayer.js` 는 이미 `pass.fbo.w/h` 단위로 viewport·u_resolution 을 처리하므로 `createFBO` 에 스케일만 반영. `projectSanitize`·`cloneGraphNode` 가 필드 검증/보존.
- **검증**: Vitest — `scaledDimensions`(compile.test) 라운딩/클램프, `graphStore.setResolutionScale`(rev·비셰이더 무시), `projectSanitize`(유효/무효 스케일). Playwright E2E `phase-17-resolution-scale.spec.ts` — 0.25× 다운샘플 체인이 회귀 없이 렌더 + Inspector 드롭다운 반영.

### Phase 18 — N:1 합성 일반화 (완료)
한 셰이더가 여러 텍스처를 입력으로 받는 일반 N:1 합성(fan-in)을 정식 기능으로 노출. 검증 결과 **연결·컴파일 파이프라인은 이미 완전히 일반화**되어 있었다 — 코드 완화가 아니라 노출·테스트·문서화 작업.
- **연결 규칙(기존)**: `validate.ts` 의 `multi_input` 은 `(target, targetHandle)` 단위라 *동일 핸들* 2입력만 금지하고, 서로 다른 핸들로 들어오는 N:1 은 이미 허용. `NodeEditor.onConnect` 도 같은 핸들이 점유된 경우에만 거부(`e.target === conn.target && e.targetHandle === conn.targetHandle`). ShaderNode 는 sampler uniform 마다 별도 입력 핸들을 노출하므로(registry `NODE_META.shader.inputs`) 다중 sampler 셰이더가 곧 N-입력 합성 노드.
- **컴파일(기존)**: `compile.ts` 가 타깃의 모든 입력 엣지를 순회하며 texture 엣지마다 `SamplerBinding{ uniformName, sourceNodeId, unit: unit++ }` 을 생성 → 임의 fan-in 이 unit 0..N-1 로 라우팅. 토포 정렬(`topologicalOrder`)은 모든 source 가 sink 보다 앞서도록 보장.
- **노출(신규)**: 빌트인 템플릿 `Composite 3`(`composite3.frag` — u_a/u_b/u_c + 가중치)·`Mask`(`mask.frag` — u_base/u_overlay/u_mask)를 CommandPalette 에 추가.
- **검증**: Vitest `validate.test` — 서로 다른 핸들 N:1 이 `multi_input` 미발생 + fan-in 토포 정렬(3 source → 1 sink, 모두 sink 앞). Playwright E2E `phase-18-fanin-composite.spec.ts` — R/G/B 3 source 를 u_a/u_b/u_c 로 합성 → 세 채널 모두 출력(핸들별 라우팅 판별).

### Phase 19 — `u_mouse` / `u_frame` 시스템 유니폼 (완료)
Shadertoy 호환 절차적 셰이더 이식성을 위해 포인터 좌표·프레임 카운터를 시스템 유니폼으로 자동 주입.
- **모델**: `u_mouse`(vec4) / `u_frame`(float) 을 `SYSTEM_UNIFORMS` 에 추가 — Inspector 자동 숨김 + 입력 포트 미노출(`inspectorUniforms`). `u_mouse` 는 Shadertoy iMouse 관례: `xy` = 현재 포인터 위치, `zw` = 마지막 클릭 위치. 픽셀 단위·좌하단 원점이라 `gl_FragCoord`/`u_resolution` 과 동일 좌표계.
- **포인터 store**: 신규 `state/mouseStore.ts`(x/y/clickX/clickY/down/rev). Viewport 의 canvas pointer 리스너(`pointermove`/`down`/`up`/`cancel`)가 `getBoundingClientRect` 기준으로 클라이언트 좌표를 프레임버퍼 픽셀(+y flip)로 변환해 store 갱신. 카메라 컨트롤러 리스너와 공존. `setPosition`/`setDown`/`setUp` 이 `rev` 를 올려 일시정지 상태의 idle RAF 를 깨운다(dirty 게이트에 `mouseChanged` 추가).
- **u_frame**: Viewport 의 `renderFrame` 로컬 카운터를 `executePlan` 호출마다 +1 해 `FrameContext.frame` 으로 주입. `bindSystemUniforms`(셰이더) + `bindComputeSystemUniforms`(compute) 양쪽 바인딩. `u_mouse` 는 `FrameContext.mouse` 로 셰이더 패스에 vec4 바인딩.
- **정적 export**: `standalonePlayer.js` 도 canvas pointer 리스너 + 프레임 카운터로 `u_mouse`/`u_frame` 동형 바인딩.
- **검증**: Vitest — `uniformParser.test`(u_mouse/u_frame system 인식 + Inspector 숨김), `mouseStore.test`(setPosition/Down/Up/reset 의 rev 증가 + vec4 패킹). Playwright E2E `phase-19-mouse-frame.spec.ts` — 풀스크린 셰이더가 화면을 `u_mouse.xy / u_resolution` 평면색으로 칠하고, 포인터를 좌하단→우상단으로 이동하면 R/G 채널이 함께 상승(포인터→u_mouse 경로 end-to-end 판별).

### Phase 20 — 노드 복제 (Cmd/Ctrl+D) (완료)
노드 에디터 편집 생산성 향상. 선택한 노드를 한 키로 복제.
- **store**: `graphStore.cloneNode(id)` — `structuredClone` 으로 노드를 깊은 복사하고 `nextId(kind)` 로 새 id 부여, 원본 위치에서 (+40, +40) 오프셋. 들어오는/나가는 **엣지는 복제하지 않는다**(독립 노드로 시작). `pushHistory` + 구조 rev 증가라 undo/재컴파일 정상. 알 수 없는 id 면 `null` 반환.
- **단축키**: `KeyboardShortcuts.tsx` 에 `Cmd/Ctrl+D` 추가 — 편집 대상(input/CodeMirror)에 포커스가 있으면 무시(에디터 멀티커서 보존), 그 외에는 `selectionStore.selectedNodeId` 를 복제하고 선택을 새 노드로 이동(Inspector/CodeEditor 가 즉시 따라감). 선택이 없으면 no-op.
- **검증**: Vitest `graphStore.test` — 깊은 복사(클론 변형이 원본 불변)·엣지 미복제·오프셋·rev 증가·미지 id null. Playwright E2E `phase-20-node-duplicate.spec.ts` — Cmd+D 로 노드 수 +1, 선택이 클론으로 이동, 엣지 불변, 위치 오프셋 확인 + 무선택 no-op.

### Phase 21 — Inspector 주석 힌트 GUI 생성 (완료)
`uniformParser` 의 역방향. 슬라이더 옆 기어(⚙) 버튼으로 범위·기본값·라벨을 GUI 에서 정하면 GLSL 소스의 트레일링 주석에 `@range`/`@step`/`@default`/`@label` 을 자동 기록한다.
- **직렬화기**: `uniformParser.ts` 에 `serializeHintComment(existing, hints)` — 주석에서 관리 토큰(`ANNOTATION_TOKEN_RE`)만 교체하고 작성자가 남긴 자유 텍스트는 보존, 정규형으로 재작성. `writeUniformHints(source, name, hints)` — 선언의 트레일링 주석에 정규형을 기록하고, 바로 앞 주석 전용 라인의 stale 토큰은 제거(파서가 양쪽을 머지하므로 앞줄 잔여 `@range` 가 이기는 것을 방지). 매칭 선언이 없으면 `null`.
- **store**: `graphStore.setUniformHints(id, name, hints)` — shader 는 fragment→vertex 순으로 선언을 찾아 `updateShaderSource`, compute 는 `updateComputeSource` 로 라우팅(둘 다 구조 rev → 재컴파일·spec 재도출).
- **UI**: `UniformHintEditor.tsx` 인라인 에디터(min/max/step/default/label). 벡터 컨트롤(multi/color)은 콤마 구분 default, 스칼라는 단일 숫자. vec3/vec4 의 명시적 color/multi 컨트롤은 `@color`/`@multi` 로 보존해 재파싱 시 이름 기반 추론이 뒤집지 않게 한다. Inspector 의 각 uniform-row 에 ⚙ 토글.
- **검증**: Vitest `uniformParser.test`(serialize/write round-trip, 앞줄 stale 제거, 자유 텍스트 보존, 벡터 default, `@color` 보존) + `graphStore.test`(fragment/vertex/compute 라우팅·rev·미지 id no-op). Playwright E2E `phase-21-hint-editor.spec.ts` — GUI 로 범위 변경 → 소스 주석 반영 + 슬라이더 min/max 갱신 + 라벨 표시, 기어 토글 open/close, Cancel 무기록.

### Phase 22 — 썸네일 GPU 다운샘플 (완료)
노드 카드 라이브 미리보기의 readback 비용 절감. 다운샘플을 CPU 박스필터에서 GPU 1패스로 이전해 PBO 전송량을 원본 해상도와 무관하게 `96×96×4` 로 고정.
- **다운샘플**: `AsyncThumbnailReadback.request` 가 PBO readback 전에 GPU 로 축소한다. 노드당 96×96 thumb FBO(`createFramebuffer(gl, 96, 96, false)`)에 패스의 color 텍스처를 풀스크린 쿼드 1패스로 그려 넣고(`downsampleInto`), 그 작은 FBO 만 `readPixels(0,0,96,96)` 로 PBO 에 담는다. 프래그먼트가 `texture(u_src, vec2(uv.x, 1.0 - uv.y))` 로 Y-flip 하므로 readback 버퍼가 곧 top-down → `poll` 은 `new ImageData(buf, 96, 96)` 로 바로 감싼다(기존 `downsampleToThumb` CPU 박스필터 미사용).
- **리소스**: blit program + 쿼드 VAO/VBO 는 인스턴스 lazy 싱글톤(`buildBlit`), PBO·thumb FBO 는 slot 단위. `release` 는 PBO+thumb FBO 동시 해제, `disposeAll` 은 blit 리소스까지 정리. `request` 는 그릴 때 `FRAMEBUFFER_BINDING`/`VIEWPORT` 를 저장·복원해 호출자 상태를 보존한다.
- **검증**: Vitest `asyncReadback.test` — 원본 1024×768 이어도 `readPixels` 가 96×96(GPU 축소 증명), blit 프로그램 컴파일 실패 시 `request` 가 false, 다중 노드 독립 in-flight·release 정리. Playwright E2E 전 Phase 회귀 없이 통과(썸네일 시각 결과 동일). 동기 CPU 폴백 `downsampleToThumb` 는 자체 단위 테스트와 함께 readback.ts 에 보존(Architecture §6.4).

### Phase 23 — 다중 선택 편집 (완료)
`selectionStore` 는 이미 `selectedNodeIds` 집합을 보관하고 박스 선택(Shift+드래그)·다중 드래그·다중 삭제(Backspace/Delete)는 React Flow 가 네이티브로 처리하고 있었다. 남아 있던 단일 선택 가정 — 화살표 이동·전체 선택·Inspector 표시 — 을 마무리.
- **화살표 이동**: `graphStore.nudgeNodes(ids, dx, dy)` 가 선택 노드들의 position 을 일괄 평행이동(드래그와 동일하게 `rev`/history 미변경 — position 은 비구조적). `KeyboardShortcuts` 가 ↑↓←→ 를 받아 선택 전체를 한 step(10px, Shift 40px) 이동. **React Flow 네이티브 이동과의 충돌 회피**: RF 는 노드/선택박스가 키보드 포커스(`:focus-visible`)일 때 화살표로 선택 전체를 옮기며 `preventDefault` 한다 — 우리 핸들러는 `e.defaultPrevented` 가 true 면 양보하고, 아무것도 포커스되지 않은(마우스 선택 직후 등) 경우에만 직접 이동.
- **전체 선택**: `Cmd/Ctrl+A` 가 모든 노드를 선택(`setSelectedIds`). 텍스트 입력/CodeMirror 포커스 시에는 네이티브 select-all 보존.
- **Inspector 다중 선택 인지**: 2개 이상 선택 시 `data-testid="multi-select-banner"` 배너로 "N nodes selected · editing <primary>" 표시. 아래 편집 컨트롤은 여전히 primary(마지막 선택 id, `selectedNodeId`)에만 적용됨을 명시.
- **검증**: Vitest `graphStore.test` — `nudgeNodes` 가 나열된 노드만 평행이동·미나열 노드 불변·`rev`/history 불변·미지 id·no-op delta 무시. Playwright E2E `phase-23-multi-select.spec.ts` 4건 — (a) 화살표로 선택 쌍이 같은 방향·같은 delta 로 이동하고 비선택 노드는 불변, (b) 무선택 화살표 no-op, (c) Cmd+A 전체 선택, (d) Inspector 배너가 단일 선택엔 없고 다중 선택에 카운트·primary 표시.

### Phase 24 — 라이브 GLSL 검증 (완료)
"GLSL LSP 도입(Monaco 전환 검토)" 백로그의 1차 실현. 진단 한정 — 자동완성·정의로 이동 등은 별도. **Monaco 전환 없이** CodeMirror 6 위에 OffscreenCanvas WebGL2 워커로 라이브 검증을 얹는 경량 통합.
- **M0 측정 (`tests/measure/glsl-validator.spec.ts`)**: glslang-wasm 도입 전에 OffscreenCanvas WebGL2 워커 백엔드를 먼저 측정. SwiftShader 기준 5/5 셰이더에서 메인 스레드 GL 과 InfoLog byte-perfect 일치(`logsExactMatch: true`), worker init 52ms, source 986 bytes, 신규 의존성 0. 기존 `parseShaderInfoLog` 가 워커 로그를 그대로 처리(드라이버 포맷 일치). → glslang-wasm 측정 불필요로 판단, 직행 본 통합.
- **워커 (`core/glsl/glslValidator.worker.ts`)**: Vite `?worker` 임포트. 싱글톤 `OffscreenCanvas(1,1).getContext('webgl2')` 를 첫 요청에 lazy init. 프로토콜 — `{type:'validate', reqId, stage, source}` 입력 → `{type:'validate', reqId, log, ok}` 출력. GL 미가용 환경(Safari 일부) 은 `glError` 로 첫 응답에 표면화.
- **클라이언트 (`core/glsl/glslValidator.ts`)**: 한 앱당 워커 1 개(첫 validate 호출 시 생성). `validate(stage, source): Promise<GLSLDiagnostic[]>` — `parseShaderInfoLog` 로 파싱해 반환. **실패 모델**: 워커 construct/post/error 어느 단계 실패해도 `[]` resolve(authoritative recompile 경로는 그대로 — 라이브는 보조). 코얼레싱은 호출자(CodeEditor) 책임 — 클라이언트는 reqId 별로 독립 resolve.
- **CodeEditor 통합 (`ui/CodeEditor/index.tsx`)**: CM `updateListener` 안에서 기존 50ms commit debounce 와 별도로 150ms `liveValidate` debounce. 결과는 `liveDiags` React 상태 — `(node, stage)` 가 promise 도착 시점에 그대로일 때만 적용해 switch race 방지. doc 교체 effect 에서 switching 이면 `setLiveDiags([])`. **머지 규칙**: 진단 push effect 가 `diagnosticsStore`(권위) ∪ `liveDiags`(라이브) 를 합성하되, **같은 `line:severity` 가 권위에 있으면 라이브 쪽을 드롭** — 중복 밑줄 회피. StageTabs 의 에러 닷도 `stage===활성 && stageLiveHasError` 시 즉시 빨강(권위 도착 전).
- **DEV 브리지**: `window.__sp.glslValidator` 노출(다른 store 와 동형, DEV 빌드 한정). E2E 가 직접 `validate()` 를 부르고 결과를 검증.
- **검증**: Vitest 단위 8건 — `glslValidator.test.ts` (fake worker 주입으로 RPC 라우팅·post 실패·worker construct 실패·dispose drain·error 이벤트 drain·out-of-order reply 라우팅·stray reqId 무시·clean log → []). Playwright E2E `phase-24-live-validation.spec.ts` 4건 — (a) `validate('fragment', BAD)` 가 정확한 line/severity/message 반환, (b) clean fragment → [], (c) CM 키스트로크 → 150ms 내 fragment 탭 `data-has-error="true"` (라이브 또는 직후 권위 경로 어느 쪽이든 wiring 증명), (d) singleton 동일 인스턴스.

### Phase 25 — GLSL LSP (심볼 테이블 + Hover) (완료)
Phase 24 의 *진단* 채널 위에 LSP-like 편집기 기능을 얹는다 — **CodeMirror 6 유지, Monaco 전환 없음**. 본 단계는 (a) 스코프 인식 심볼 테이블과 (b) Hover 툴팁 두 축으로 한정. Go-to-definition / Find references 는 백로그.
- **심볼 테이블 (`core/glsl/symbolTable.ts`)**: 정규식 + 중괄호 깊이 워커. 추출 대상 — `uniform`/`in`/`out`/`attribute`/`varying`/`const` 같은 storage-qualified 글로벌, `struct` 선언, 함수 헤더(`<retType> <name>(<params>) {`), 그 파라미터, 함수 본문 안의 로컬 변수(쉼표 멀티 디클·`for` 인덕션 포함). 블록 코멘트는 공백으로 치환해 라인/컬럼 번호 보존, 라인 코멘트는 라인 단위로 스트립. 한 함수 안에서만 nested 스코프를 추적 — GLSL 은 nested function decl 없음. `if/for/while/return/case/switch` 키워드는 함수 헤더 모양과 겹쳐서 화이트리스트로 제외.
- **빌트인 카탈로그 (`core/glsl/builtins.ts`)**: 자체 작성한 `BUILTIN_FUNCTIONS` (`GLSL_FUNCTIONS` 의 모든 이름에 시그니처 + 한 줄 설명). `KEYWORD_DESCRIPTIONS` 는 storage / control-flow 키워드 한 줄 설명. `genType / genIType / genBType` 스칼라+벡터 패밀리는 풀어쓰지 않음(`sin` 12 오버로드를 그대로 노출하면 툴팁이 시끄럽다). 단위 테스트가 `GLSL_FUNCTIONS` 와 양방향 일치 보장 — 한 쪽에서 추가/삭제 시 빨강.
- **Scope-aware 자동완성 (`ui/CodeEditor/autocomplete.ts`)**: `glslSource` 가 `context.pos` 의 라인을 잡아 `symbolsVisibleAt(table, line)` 으로 in-scope 심볼(로컬 → 파라미터 → 글로벌 순)을 먼저, 그 다음 `uniformParser` 의 `@label` 정보가 붙은 uniform 보충분, 마지막에 빌트인 static base. 빌트인 함수의 `detail` 에 첫 시그니처, `info` 에 설명을 붙여 popup 이 hover 와 같은 정보를 노출. `Completion.type` 은 함수/스트럭트/변수 별로 색이 다르게 표시.
- **Hover 툴팁 (`ui/CodeEditor/hover.ts`)**: `hoverTooltip` 확장. 포인터 아래 identifier 를 `identifierAt` 로 잡고 `lookupHover` 로 (1) 심볼 테이블 → (2) `BUILTIN_FUNCTIONS` → (3) `SYSTEM_UNIFORM_DESCRIPTIONS` → (4) `KEYWORD_DESCRIPTIONS` 순으로 해석. 매칭 없으면 `null` 반환(랜덤 단어에 잘못된 정보 보여주지 않음). 툴팁 DOM 은 시그니처 줄(monospace `#dcdcaa`) + 설명 줄(`#bbb`) 두 줄 구조, `.cm-glsl-hover` 클래스로 스타일 식별.
- **DEV bridge**: `window.__sp.glslSymbols = { build, visibleAt, resolve, builtins, keywords }` 노출(다른 store 와 동형, DEV 빌드 한정). E2E 가 CM 와이어링을 거치지 않고도 심볼 파싱 정확도를 검증.
- **검증**: Vitest 단위 48 건 — `symbolTable.test.ts` (21: storage globals / 함수+파라미터 / 로컬 / for-init / 멀티 디클 / 블록 코멘트 / 구조체 / scope 재진입 / line·column / `parseFunctionParameters` / `symbolsVisibleAt` shadow / `resolveSymbol`), `builtins.test.ts` (5: GLSL_FUNCTIONS 양방향 일치 / 시그니처 형식 / 키워드 설명 양방향 일치), `hover.test.ts` (15: `identifierAt` 경계 / `formatSymbolHover` per-kind / `lookupHover` 네 경로 + null), `autocomplete.test.ts` (+ 3: 스코프 순서, 함수 시그니처 detail, system desc info). Playwright E2E `phase-25-glsl-lsp.spec.ts` 4 건 — (a) 심볼 테이블이 글로벌/파라미터/로컬을 올바른 scope 태그로 잡음, (b) `symbolsVisibleAt` 이 in-scope 만 노출하고 다른 함수의 로컬을 누출 안 함, (c) CM 에디터에서 `u_time` hover 시 `.cm-glsl-hover` 툴팁에 시스템 설명 등장(CM 와이어링 end-to-end 증명), (d) 빌트인 카탈로그가 DEV bridge 로 시그니처/설명을 노출.

### Phase 26 — GLSL 시맨틱 토큰 하이라이팅 (완료)
Phase 25 의 *심볼 테이블* 위에 얹는 정적 분석 기반 식별자 하이라이트. **CodeMirror 6 유지, Monaco 전환 없음**. 기존 `glsl()` 언어팩과 `defaultHighlightStyle` (lexer-based 키워드/타입/숫자/연산자) 위에 *식별자 역할 색* 만 덧칠하는 layered approach — 키워드 색이나 lexer 규칙은 건드리지 않는다.
- **분류기 (`core/glsl/semanticTokens.ts`)**: 입력 source 한 번 스캔으로 `SemanticToken[]` 반환 (각 토큰은 absolute doc offset `from/to` + `kind`). 식별자 해결 우선순위 — (1) `resolveSymbol` 로 in-scope 심볼 테이블 lookup (locals 가 globals 를 shadow 하는 hover/autocomplete 와 동일 규칙), (2) `BUILTIN_FUNCTIONS[name]` → `function-builtin`, (3) `SYSTEM_UNIFORMS.has(name)` → `system-uniform` (소스가 redeclare 안 해도 런타임이 auto-bind 하므로). 매칭 없으면 토큰 미발행. **local 은 의도적으로 분류 안 함** — 토큰 밀도 절제, 더 의미 있는 토큰(uniform/builtin/function)이 시각적으로 부각된다. 블록 코멘트는 라인/컬럼 보존을 위해 공백 치환, 라인 코멘트는 동일 라인 마스크.
- **토큰 종류 11 가지**: `uniform / system-uniform / in / out / attribute / varying / const / parameter / struct-type / function-user / function-builtin`. 각 토큰은 `cm-glsl-token-<kind>` CSS 클래스로 매핑.
- **CodeMirror 통합 (`ui/CodeEditor/semanticHighlight.ts`)**: `ViewPlugin.fromClass` + `RangeSetBuilder<Decoration>` + `Decoration.mark`. **`update.docChanged || update.viewportChanged` 시에만 재빌드** — 1000-line 셰이더에서도 분류기 비용 < 1ms, 별도 debounce 불필요. **viewport 외 토큰은 미발행** — `view.visibleRanges` 와 정렬된 토큰 스트림을 lockstep 으로 walk. **Decoration 캐시** — kind 당 단일 `Decoration.mark` 인스턴스를 재사용해 RangeSet diff 비용 절감.
- **색 팔레트 (VS Code Dark+ 관례)**: uniform `#4ec9b0` / system-uniform `#ff9d00` (Shadertoy 호환 시스템 유니폼 강조) / in·out·attribute·varying·parameter `#9cdcfe` / const `#c586c0` / struct-type `#4ec9b0` / function-user `#dcdcaa` / function-builtin `#7adba8`. local 은 별도 클래스 미부여 → 에디터 기본 색 유지.
- **DEV bridge**: `window.__sp.glslSemanticTokens = { classify, classifyIdentifier }` 노출(다른 store/glsl 모듈과 동형, DEV 빌드 한정). E2E 가 CM 와이어링 없이 분류 정확도와 정렬 계약을 직접 검증.
- **검증**: Vitest 단위 21 건 — `semanticTokens.test.ts` (18: classifyIdentifier 6 경로 + classifySemanticTokens 12 시나리오 — 우선순위, 코멘트 마스킹, document order, locals 미분류, struct/const/parameter 패밀리), `semanticHighlight.test.ts` (3: empty doc → `Decoration.none` / 4-token doc → 정렬된 `cm-glsl-token-*` 클래스 검증 / kind 별 Decoration 인스턴스 캐시 재사용). Playwright E2E `phase-26-semantic-tokens.spec.ts` 4 건 — (a) `__sp.glslSemanticTokens.classify` 가 user uniform / system uniform / in / out / function-user / function-builtin / parameter 를 정확한 kind 로 분류, (b) `n`/`col` 같은 로컬은 토큰 스트림에 미발행, (c) CodeMirror DOM 에 `.cm-glsl-token-system-uniform`/`uniform`/`function-builtin`/`function-user` 스팬이 해당 텍스트 위에 렌더(end-to-end CM 와이어링 증명), (d) 토큰 스트림이 document offset 순으로 정렬돼 `RangeSetBuilder` 계약 충족.
- **비범위 (Out of scope — 별도 백로그)**: 색 커스터마이즈 UI, lexer 토큰과의 충돌 fine-tune (예: `const` 키워드는 lexer 색, `const` *이름* 은 우리 색 — 그대로 유지), LSP standard `semanticTokens/full` 프로토콜 구현, Go-to-definition / Find references / Rename.

### Phase 27 — GLSL LSP: Go-to-definition / References / Rename (완료)
Phase 25 의 *심볼 테이블* + Phase 26 의 *시맨틱 토큰* 위에 얹는 리팩터 레이어. **CodeMirror 6 유지, Monaco 전환 없음**. LSP 표준 프로토콜은 구현하지 않고, 단일 문서·단일 GLSL stage 범위로 한정한 경량 통합.
- **References finder (`core/glsl/references.ts`)**: `findReferences(source, name, atLine)` — `resolveSymbol` 로 타깃 declaration 을 찾은 뒤, source 의 모든 identifier 위치에서 다시 `resolveSymbol` 을 돌려 같은 declaration 으로 해석되는 곳만 수집. **shadowing 규칙은 hover/autocomplete 와 동일** — global `foo` 의 references 는 local `foo` 가 선언된 함수 안에서는 제외, local 의 references 는 자기 함수 본문에만 갇힘. 결과는 document 순서, declaration site 는 `isDefinition: true`. Block/line comment 안의 텍스트는 마스킹되어 매칭되지 않는다.
- **Go-to-definition (`ui/CodeEditor/gotoDef.ts`)**: **F12** 키맵 + **Cmd/Ctrl+Click** DOM 핸들러. 커서 위치의 identifier 를 `identifierAt` 로 잡고, `resolveSymbol` 로 declaration 의 `line/column` 을 얻어 CM `EditorSelection.cursor + scrollIntoView(y: "center")` 로 점프. builtin·keyword·미정의 식별자에는 silently no-op. 모디파이어 없는 일반 클릭은 CM 의 기본 selection 동작을 보존한다.
- **Rename refactor (`ui/CodeEditor/rename.ts`)**: **F2** 키맵. `findReferences` 가 반환한 모든 site 를 단일 `view.dispatch({ changes: [...] })` 트랜잭션으로 일괄 교체 — single undo step 보장. 새 이름 검증은 `^[A-Za-z_][A-Za-z0-9_]*$` 정규식 + `GLSL_KEYWORDS ∪ GLSL_TYPES` 예약어 set. 프롬프트는 `window.prompt` (기본), 테스트는 `runRename(view, promptFn)` 로 커스텀 입력 주입. 결과는 `RenameResult` discriminated union — `applied: true` 면 `{ sites, newName }`, false 면 `{ reason }` 로 skip 사유 보고. shadowing 규칙이 references 단에 이미 적용돼 있어 **local rename 은 자기 함수만, global rename 은 shadowed 안 된 곳만** 변경.
- **Active reference highlight (`ui/CodeEditor/referenceHighlight.ts`)**: 커서가 identifier 위에 있을 때 모든 reference 에 `.cm-glsl-ref-occurrence`(흰색 10% 배경), declaration site 에 `.cm-glsl-ref-definition`(노란빛 16% 배경) Decoration 페인트. `StateField` 가 `docChanged || selection` 변화에 재빌드. 단일 site(declaration only)에는 페인트하지 않는다(노이즈 회피). 분류 비용은 `findReferences` 한 번 — 50~1000 라인 셰이더에서 < 1ms 추정이라 별도 debounce 없음.
- **DEV bridge**: `window.__sp.glslSymbols.findReferences(source, name, atLine)` + 신규 `window.__sp.codeEditor = { getCursorLine, focus }` (E2E 가 CM 와이어링 없이 cursor line 을 직접 읽음). CodeEditor 가 mount/unmount 시 `setCurrentView(view)` / `setCurrentView(null)` 로 module-level ref 갱신 — production 코드 경로는 의존하지 않고 관찰 전용.
- **검증**: Vitest 단위 36 건 추가 — `references.test.ts` 13 (globals / parameters / locals / shadowing / comments / document order / findReferencesOf), `gotoDef.test.ts` 7 (각 kind 결과 + builtin/공백 no-op + dispatch 후 cursor 위치), `rename.test.ts` 11 (validateRenameName + runRename 전 코드 경로 + scope 격리), `referenceHighlight.test.ts` 5 (Decoration set 케이스). Playwright E2E `phase-27-glsl-refs-rename.spec.ts` 5 건 — (a) `__sp.glslSymbols.findReferences` 가 uniform 의 decl + 2 use sites 를 보고, (b) global/local 의 scope 격리(global k 는 main 에서만, local k 는 inner 안에서만), (c) **F12 점프** — CM 에서 use site 클릭 → F12 → `__sp.codeEditor.getCursorLine() === 4` (declaration 라인), (d) **F2 rename** — Playwright `page.once("dialog")` 로 prompt 가로채 새 이름 입력 → 그래프 store 의 `fragmentSource` 가 `u_strength` 0회, `u_amount` 3회로 갱신, (e) cursor on use site 시 CM DOM 에 `.cm-glsl-ref-definition` + `.cm-glsl-ref-occurrence` 스팬 렌더.
- **비범위 (Out of scope — 별도 백로그)**: LSP standard `textDocument/definition`·`references`·`rename` 프로토콜 구현, cross-stage rename (vertex↔fragment 의 같은 uniform 동시 rename), 함수 오버로드 분리(같은 이름의 두 함수가 있으면 첫 declaration 으로만 해석), `for`-init 변수의 정확한 block-scope 종료 추적(현재는 함수 끝까지 visible 로 근사 — symbolTable 의 기존 동작 그대로).

### Phase 28 — Cross-stage rename (완료)
ShaderNode 의 vertex + fragment 두 소스를 묶는 *프로그램* 단위 rename. Phase 27 의 references finder 를 cross-stage 로 확장해, GLSL 링커가 한 binding 으로 묶는 심볼(uniform / varying / in / out / 함수 / struct / top-level const)을 두 stage 에서 한 번에 일괄 변경한다.
- **`findReferencesAcrossStages` (`core/glsl/references.ts`)**: `(sources={vertex,fragment}, name, originStage, atLine)` → `CrossStageReferenceSite[]`. origin stage 는 Phase 27 의 `findReferences` 와 동일하게 처리하고, target 이 `scope === null` 이고 kind 가 `CROSS_STAGE_KINDS` (uniform/in/out/attribute/varying/const/function/struct) 일 때만 other stage 도 스캔. other stage 에서 동명의 글로벌(같은 kind 집합)이 *있을 때만* 매치 — 없으면 origin-stage 단독으로 정상 종료(partial rename). other stage 안의 shadowing 도 Phase 27 의 `resolveSymbol` 재진입 규칙 그대로 — 글로벌 rename 은 shadowed 안 된 곳만 변경된다.
- **`runRename` cross-stage 분기 (`ui/CodeEditor/rename.ts`)**: 새 `CrossStageRenameContext` 파라미터(`{ originStage, otherStageSource, applyBothStages }`)가 있으면 cross-stage 경로. 둘 다 rewrite 가 필요한 경우 origin 과 other 의 새 소스를 모두 계산해 `applyBothStages(newOrigin, newOther)` 로 한 번에 commit — 한 `updateShaderSource({ vertexSource, fragmentSource })` 패치가 graph history 에 단 한 번 push 된다. CM dispatch 는 origin stage 만 갱신하고, 50 ms commit debounce 는 store 와 값이 같으므로 early-return → 추가 push 없음. context 가 없으면 Phase 27 의 single-document 경로 보존 (ComputeNode·단위 테스트 영향 0).
- **`resolveCrossStageContext` (module-private)**: F2 keymap 호출 시 `selectionStore` + `editorStore` + `graphStore` 의 `.getState()` 로 현재 ShaderNode 컨텍스트를 즉시 조회해 context 를 만든다. 선택이 ShaderNode 가 아니면 `undefined` → single-document 폴백.
- **검증**: Vitest 단위 13 건 추가 — `references.test.ts` (+9: cross-stage uniform 양방향 / varying out↔in 페어 / vertex-only attribute partial / 로컬 stage 격리 / parameter stage 격리 / function cross-stage / 미지 식별자 / vertex-first ordering / 글로벌 rename 의 other-stage shadowing 회피), `rename.test.ts` (+4: 양 stage commit / vertex-only no-commit / 로컬 no-commit / fragment 시작). Playwright E2E `phase-28-cross-stage-rename.spec.ts` 5 건 — (a) fragment 측 F2 → store 의 vertex/fragment 둘 다 `u_strength` 로 교체 + 옛 이름 0회, (b) vertex 측 F2 동일, (c) vertex-only attribute `a_position` → fragment 소스 byte-identical, (d) 양 stage 의 동명 로컬 `pocket` → vertex 만 rewrite, fragment 불변, (e) cross-stage rename 후 `historyStore.past.length` 정확히 +1 (single undo step).
- **비범위 (Out of scope — 별도 백로그)**: `for`-init 의 정확한 block-scope 종료 추적(현재 함수 끝까지 visible 로 근사 — Phase 27 동작 유지), 함수 오버로드 분리, ShaderNode↔ShaderNode (그래프 연결로 묶인) cross-program rename, call hierarchy.

### Phase 29 — 노드 그룹 (자식 hierarchy) (완료)
큰 그래프의 시각적 분할·일괄 이동을 위해 *부모-자식 관계* 를 갖는 그룹 노드를 도입. 그룹은 순수 편집기 레이어 — `ExecutionPlan` / 렌더 파이프라인은 group 노드를 완전히 무시하므로 다른 페이즈의 회귀가 0.
- **새 노드 종류 `group`**: `{ id, kind:'group', label, color?, width, height }`. 포트 0개, edges 가 그룹을 가리킬 일 없음. 그룹의 *자식* 관계는 노드 필드가 아니라 `graphStore.parents: Record<childId, parentGroupId>` 로 별도 보관 — positions 와 동형의 보조 컬렉션이라 직렬화·undo 가 자연스럽게 따라온다.
- **좌표 모델 — 부모 상대 (`core/graph/parents.ts`)**: positions 는 React Flow native 모델과 일치하게 *부모 상대* 로 저장. top-level 노드는 절대. `getAbsolutePosition / relativePositionFor / wouldCreateParentCycle / orderParentsBeforeChildren` 헬퍼가 변환·검증·노드 정렬을 담당. `setParent / removeGroup(release-children) / removeNode(group)` 가 reparent 시 자식의 절대 좌표를 보존하도록 position 을 재계산한다.
- **`graphStore` 액션**: `addGroup(label, absolutePosition, size, options?)` / `setParent(childId, newParentId | undefined)` (cycle 거부 시 false) / `groupSelected(ids)` (선택의 bounding box 로 그룹 크기·위치 산정, 공통 부모 자동 상속 → 중첩 그룹 자연 형성) / `removeGroup(id, mode)` (`delete-children` cascade vs `release-children` promote-to-grandparent) / `setGroupLabel / setGroupColor / setGroupSize` (size 는 high-frequency drag handle 이라 history/rev 미반영). `removeNode` 도 사라진 부모의 직접 자식들의 좌표를 절대 좌표로 승격.
- **검증·컴파일·실행 무영향**: `validate.ts` 는 group 을 절대 못 본다(edges/cycle 검사는 edges 기반, multiple_outputs 는 kind === 'output' 만 카운트). `compile.ts` 의 모든 분기가 명시적 kind 체크 — group 은 어떤 패스도 만들지 못함. `standalonePlayer.js` 도 모든 filter 가 명시적 kind 매칭이라 group 이 export 에 들어가도 무시.
- **React Flow 통합 (`NodeEditor/index.tsx` + `GroupNodeView.tsx`)**: 자식 노드는 `parentId` 만 emit 하고 `extent: 'parent'` 는 일부러 제외 — 자식을 다른 그룹으로 끌어내거나 top-level 로 풀어줄 수 있도록 드래그를 허용하고, `onNodeDragStop` 이 새 절대 좌표로 reparent 결정. group 노드는 `NodeResizer` 로 in-place 리사이즈(드래그 종료 시 `setGroupSize`). 카드 색은 `color` 필드 + 기본 슬레이트 톤. MiniMap 에도 group 색상 등록.
- **다중 선택 → 그룹화**: 새 단축키 **Cmd/Ctrl+G** (`KeyboardShortcuts.tsx`) — selectionStore 의 `selectedNodeIds.length >= 2` 일 때 `groupSelected` 호출하고 새 그룹을 primary 선택으로 이동. CommandPalette 도 `Group selected nodes` / `Add Group (empty container)` 항목 추가. 텍스트 입력/CodeMirror 포커스 시 단축키는 양보(브라우저 "찾기" Cmd+G 보존).
- **중첩 그룹 (그룹 안의 그룹)**: React Flow 는 native 로 nested groups 지원 — `parentId` 가 그룹이든 일반 노드든 같은 메커니즘. `setParent` 가 parentId chain 의 cycle 을 별도 헬퍼(`wouldCreateParentCycle`)로 거부. `groupSelected` 가 *common parent* 를 감지해 새 그룹을 그 부모의 자식으로 자동 배치(외부 그룹 안에 더 작은 그룹이 자연스럽게 생성됨).
- **삭제 모드 — Inspector 다이얼로그**: `GroupInspector` 의 두 버튼 — "Ungroup (keep children)" 은 `release-children` 으로 자식을 한 단계 위(grandparent 또는 top-level)로 승격하고 절대 좌표 보존, "Delete with children…" 은 확인 다이얼로그 후 `delete-children` 으로 descendants + 관련 edges 까지 cascade 제거. Backspace 로 group 만 삭제하는 기본 경로는 자식 orphan(absolute 좌표 유지) 동작.
- **직렬화 (`state/serialization.ts`)**: `SerializedProject` 에 옵셔널 `parents` 필드 추가 — Phase 28 이전 share URL 은 필드가 없어도 정상 로드(빈 객체로 폴백). deserialize 시 parents map 의 unknown id / self-cycle / 깊은 chain 을 sanitize 단계에서 제거(`MAX_DEPTH = 64`). autoSave / shareUrl / Toolbar export 모두 parents 를 함께 라운드트립.
- **검증**: Vitest 단위 25 건 추가 — `parents.test.ts` (16: getAbsolutePosition·wouldCreateParentCycle·parentDepth·directChildren·allDescendants·relativePositionFor), `graphStore.test.ts` (14: addGroup / setParent 절대좌표 보존 / cycle 거부 / 그룹 해제 / 중첩 / common parent 상속 / removeGroup 두 모드 / setGroupLabel/Color/Size / removeNode orphan 절대좌표), `compile.test.ts` (+1: group 있어도 ExecutionPlan 동일), `validate.test.ts` (+2: group 무시 + topological order 통과), `serialization.test.ts` (+4: parents round-trip / 알 수 없는 id 드롭 / cycle 거부 + warning / 누락 필드 backward compat), `htmlExport.test.ts` (+1: standalonePlayer 의 어느 filter 도 group 매칭 안 함 — 회귀 가드). Playwright E2E `phase-29-node-groups.spec.ts` 9 건 — (a) `addGroup` 의 rev / nodeIds / parents, (b) `groupSelected` 의 parent 할당 + bbox 좌표 변환, (c) 중첩 그룹 자동 부모 상속, (d) `setParent` cycle 거부 반환값, (e) `release-children` 후 자식 절대 좌표 보존, (f) `delete-children` cascade 로 descendants + edges 모두 제거, (g) Cmd+G 키바인딩으로 선택 그룹화 + 새 그룹 primary 선택, (h) 그룹 있는 그래프 렌더 루프 회귀 없음 (`renderTick` 증가 + `errors` 비어있음), (i) Cmd+Z 가 cross-stage 와 동일하게 single-undo 로 그룹 생성 전 상태 복원.
- **비범위 (Out of scope — 별도 백로그)**: 그룹 z-order 명시 조정, share URL 의 group 색상 다양화 UI(현재 Inspector 컬러 픽커만 — 키바인딩이나 프리셋 팔레트 없음). (collapse/expand 와 헤더 더블클릭 라벨 인라인 편집은 Phase 30 에서 구현됨.)

### Phase 30 — 그룹 collapse/expand (완료)
Phase 29 노드 그룹의 후속. 큰 그래프를 접어 화면을 정리하는 collapse/expand 와 헤더 라벨 인라인 편집을 추가. Phase 29 와 동일하게 **순수 편집기 레이어** — `ExecutionPlan` / 렌더 파이프라인은 group 을 여전히 완전히 무시하므로 회귀 0.
- **새 필드 `GroupGraphNode.collapsed?: boolean`**: 노드 종류 필드(label/color/width/height 와 동형). 생략 ⇒ 펼침 — 기존 저장본/share URL 무손상. `cloneGraphNode`(직렬화) 와 `projectSanitize`(역직렬화, `collapsed === true` 만 채택) 가 라운드트립. 접힘은 `width × GROUP_COLLAPSED_HEIGHT`(헤더만) 로 렌더되고 *원본 height 는 보존* 되어 펼칠 때 복원.
- **`graphStore.toggleGroupCollapsed(id)`**: 구조-tier setter (rev + history push) — undo 가능 + autoSave 가 rev 변화로 영속. recompile 은 group 을 무시하므로 no-op. group 이 아니거나 미지 id 면 무시.
- **자식 숨김 (`core/graph/parents.ts` 의 `hasCollapsedAncestor`)**: 순수 헬퍼 — 부모 체인을 따라 collapsed 그룹 조상이 있으면 true(자기 자신은 제외, cycle-safe MAX_DEPTH 캡). `NodeEditor` 의 `rfNodes` 가 이 결과로 `hidden: true` 를 세팅 → React Flow 가 노드 + 연결 엣지를 DOM 에서 제거. 중첩 그룹도 조상 워크로 자연 처리. `onNodeDragStop` 의 드롭 히트박스도 접힌 그룹은 헤더 높이로 제한.
- **GroupNodeView UI**: 헤더에 collapse 토글 chevron(▸/▾) 버튼, 접힘 시 자식 수 `(N)` 표시, 접힘 시 `NodeResizer` 숨김. 라벨 버튼 더블클릭(React Flow 드래그가 native dblclick 을 삼켜 클릭 타이밍으로 자체 검출) → 인라인 input(Enter 커밋 / Escape 취소 / blur 커밋). 라벨 버튼은 키보드 접근(Enter/Space)도 지원.
- **검증**: Vitest 단위 — `graphStore.test`(toggle 플립 + rev/history + 비그룹/미지 id no-op), `parents.test`(`hasCollapsedAncestor` 직접/조상/없음/자기제외/cycle), `serialization.test`(collapsed 라운드트립 + 펼침은 필드 생략). Playwright E2E `phase-30-group-collapse.spec.ts` 6 건 — (a) store toggle 플립 + rev, (b) collapse 가 자식을 DOM 에서 숨기고 expand 가 복원(비그룹 o1 불변), (c) 헤더 chevron 버튼 토글, (d) 사전 접힘 그래프 로드가 collapsed 렌더 + 자식 숨김, (e) 헤더 더블클릭 인라인 rename, (f) collapse 후에도 렌더 루프 유지(`renderTick` 증가 + `errors` 비어있음).
- **비범위 (Out of scope — 별도 백로그)**: 그룹 z-order 명시 조정, share URL 의 group 색상 프리셋 팔레트.

### Phase 31 — 애니메이션 GIF 녹화 (완료)
Phase 11 의 WebM 녹화·정적 HTML export 에 이어 공유 결과물을 **애니메이션 GIF** 로 내보내는 경로. 백로그의 `gif.js / gifenc` 제안 대신, 저장소의 zero-dep core 원칙(standalonePlayer 선례)·360 KiB 번들 게이트·순수 로직 테스트 문화에 맞춰 **의존성 0 자체 구현 인코더**를 택했다.
- **자체 GIF89a 인코더 (`src/core/gif/`)**: 순수 TS, DOM·GL 비의존 3 모듈. `lzw.ts` — GIF 가변폭 LZW 압축(LSB-first 비트팩, clear/EOI, 4096 엔트리에서 테이블 리셋). 디코더가 한 코드 뒤처지는 특성을 반영해 폭 증가를 `2^width + 1` 시점으로 맞춰 lockstep 유지. `quantize.ts` — rgb555 히스토그램 위 median-cut 으로 ≤256 색 전역 팔레트 생성(`buildPalette`) + rgb555 캐시로 픽셀당 nearest 매핑(`mapToPalette`). `encode.ts` — 헤더 → LSD → 전역 팔레트 → NETSCAPE2.0 루프 → 프레임별 GCE/이미지 디스크립터/LZW → trailer 조립(`encodeGif`). 단일 전역 팔레트로 인코더·출력 모두 간결.
- **`gifRecorderStore` (`src/state/gifRecorder.ts`)**: WebM 의 `recorder.ts` 와 형제. 무거운 프레임 버퍼는 zustand 밖 모듈 싱글톤(`_active`)에 두고, 상태(status idle/recording/encoding · frameCount · elapsedMs · lastBlobUrl)만 스토어에. `captureFrame(canvas)` 가 스크래치 2D 캔버스로 `drawImage` 다운스케일(longest edge ≤ `maxLongEdge`) → `getImageData` 로 RGBA 수집(목표 fps 스로틀, `maxSeconds` 프레임 캡). `stop()` 은 캡처 타임스탬프 차이로 프레임별 delay 를 산출(`frameDelays`)해 `encodeGif` → `image/gif` Blob. 인코딩은 한 번 yield 후 동기 수행.
- **Viewport 통합**: 컨텍스트가 `preserveDrawingBuffer: false` 라 캡처는 **draw 와 같은 RAF tick 안**에서 해야 한다 — `executePlan` 직후 recording 중이면 `captureFrame` + `tick` 호출. dirty 게이트(B2)에 `gifRecording` 을 `hasExternal` 과 동급의 무조건 dirty 신호로 추가해 시간 정지·정적 그래프에서도 프레임이 일정 cadence 로 캡처된다.
- **Toolbar**: WebM `● Record` 옆에 `● GIF` 토글(녹화 중 빨강 `■ GIF`, 인코딩 중 `⏳ GIF` disabled). 멈추면 `.gif` 자동 다운로드.
- **검증**: Vitest 단위 30 건 — `lzw.test`(독립 표준 디코더로 round-trip: 빈/단일/반복/폭증가/4096 리셋/KwKwK 자기참조), `quantize.test`(팔레트 보존·gradient 축약·maxColors 클램프·nearest 매핑 round-trip), `encode.test`(내장 GIF 파서로 헤더/스크린 크기/루프 확장/픽셀 인덱스 복원/프레임별 delay·2cs 클램프), `gifRecorder.test`(frameDelays · fps 스로틀 · maxSeconds 캡 · 컨텍스트 부재 · 인코드 Blob · tick). Playwright E2E `phase-31-gif-recording.spec.ts` 4 건 — (a) 스토어 shape, (b) 라이브 캡처 후 **브라우저 `createImageBitmap` 로 GIF 디코드**(스펙 적합성의 authoritative 검증) + GIF89a 매직·dims, (c) 시간 정지 중에도 recording 이 렌더 루프를 깨워 `renderTick` 증가, (d) Toolbar GIF 버튼이 녹화 시작.
- **비범위 (Out of scope — 별도 백로그)**: per-frame 로컬 팔레트/디더링, transparency(1-bit), 정적 HTML export 의 GIF(녹화는 에디터 전용). (인코딩 Web Worker 오프로드는 Phase 32 에서 구현됨.)

### Phase 32 — GIF 인코딩 Web Worker 오프로드 (완료)
Phase 31 의 GIF 인코더는 `stop()` 에서 quantize + LZW + GIF89a 조립을 **메인 스레드에서 동기 수행**해 몇 초짜리 클립은 인코딩 동안 에디터가 얼어붙었다. 순수 `core/gif/encode.ts` 는 그대로 두고, 그 호출만 워커로 옮긴다 — 의존성 0, Phase 24 의 `glslValidator` 워커/클라이언트 패턴을 그대로 재사용.
- **워커 (`core/gif/gifEncoder.worker.ts`)**: Vite `?worker` 임포트. stateless data-in / bytes-out — `{type:'encode', reqId, width, height, frames, maxColors, loop}` 을 받아 `encodeGif` 를 돌리고 `{type:'encode', reqId, ok, bytes?, error?}` 로 응답. 결과 바이트 버퍼는 transferable 로 zero-copy 반환. **입력 프레임 버퍼는 일부러 transfer 하지 않는다** — 메인 스레드에 그대로 남겨 워커가 도중에 죽어도 인라인 폴백이 가능하도록.
- **클라이언트 (`core/gif/gifEncoderClient.ts`)**: 앱당 워커 1 개(첫 `encode()` 에 lazy 생성), reqId 별 독립 Promise. **실패 모델은 validator 보다 강하다** — validator 는 실패 시 `[]` 를 주지만(라이브 진단은 보조), 사용자가 명시적으로 녹화한 GIF 는 잃으면 안 되므로 워커 construct/post/error 어느 단계 실패도 **메인 스레드 인라인 `encodeGif` 로 폴백**한다(최악의 경우 = Phase 31 의 동기 동작). 워커가 `ok:false` 로 인코드 에러를 보고하면(동일 입력은 인라인도 throw) 그대로 reject. `typeof Worker === 'undefined'` 가드는 default factory 한정이라 jsdom/SSR 은 곧장 인라인 경로(테스트 결정성), 주입된 `workerFactory` 는 항상 시도(워커 경로 단위 테스트).
- **`gifRecorder.stop()` 연동**: 기존 동기 `encodeGif(...)` 호출을 `await gifEncoder().encode({...})` 로 교체. `status:'encoding'` 표시 → 워커가 인코딩하는 동안 메인 스레드 free → Blob 생성. 프레임 delay 산출(`frameDelays`)·캡처 경로는 불변.
- **검증**: Vitest 단위 10 건 — `gifEncoderClient.test.ts` (fake worker 주입으로 RPC 라우팅 · ok:false reject · out-of-order reply · stray/malformed reqId 무시 · construct/post/error 인라인 폴백 · 잘못된 입력 reject · dispose · singleton). Playwright E2E 는 Phase 31 의 `phase-31-gif-recording.spec.ts` 4 건이 그대로 회귀 가드 — chromium 에서는 실제 워커 경로가 돌고 `createImageBitmap` 로 GIF 스펙 적합성을 authoritative 검증.
- **비범위 (Out of scope — 별도 백로그)**: per-frame 로컬 팔레트/디더링, transparency(1-bit), 정적 HTML export 의 GIF, 인코딩 진행률 표시(현재 워커는 단일 메시지로 완료). (per-frame 로컬 팔레트 + 디더링은 Phase 33 에서 구현됨.)

### Phase 33 — GIF per-frame 로컬 팔레트 + 디더링 (완료)
Phase 31/32 의 GIF 결과물 품질을 끌어올리는 마감. 셰이더 출력의 그라데이션/네온이 단일 256색 전역 팔레트에서 밴딩되던 문제를, **Floyd–Steinberg 디더링**과 **프레임별 로컬 팔레트**로 해소한다. 순수 `core/gif/` 로직만 확장 — 의존성 0, 인코딩은 Phase 32 워커 경로 위에서 그대로 돈다.
- **디더링 (`core/gif/quantize.ts` 의 `mapToPaletteDithered`)**: Floyd–Steinberg 오차확산 — 각 픽셀의 양자화 오차를 아직 방문 안 한 이웃(우 7/16, 좌하 3/16, 하 5/16, 우하 1/16)에 분배. `curr`/`next` 두 줄 `Float32Array` 오차 버퍼를 lockstep 으로 walk(줄 끝에서 `curr ← next`). rgb555 캐시는 의도적으로 미사용 — 오차 누적으로 같은 입력색도 다른 인덱스로 매핑되므로 픽셀마다 nearest-color 탐색(≤256 엔트리, Phase 32 워커로 오프로드돼 메인 스레드 영향 0). 팔레트 위에 정확히 얹힌 솔리드색(오차 0)은 디더 없이 그대로, 단일색 팔레트도 0-나눗셈 없이 안전.
- **로컬 팔레트 (`core/gif/encode.ts`)**: `EncodeGifOptions` 에 `localPalette?`(기본 false — 기존 출력·단위 테스트 byte 호환). `localPalette` 시 **전역 컬러 테이블을 생략**(LSD packed bit7=0)하고 프레임마다 `buildPalette([frame])` 로 자기 팔레트를 만들어 **로컬 컬러 테이블**(이미지 디스크립터 packed bit7=1 + size, 테이블은 디스크립터 직후·이미지 데이터 직전)과 **프레임별 LZW min-code-size** 를 emit. 색이 시간에 따라 변하는 클립의 충실도가 크게 오른다. `paletteBits`/`pushColorTable` 헬퍼로 전역/로컬 두 경로 공유.
- **mapper 주입 — 디더링 코드를 워커 청크에만 (번들 분리)**: `encodeGif(opts, mapper?)` 의 픽셀 매핑을 주입식 `FrameMapper` 로 분리. encode.ts 는 기본 `mapToPalette`(plain nearest) 만 정적 import 하고, **`mapToPaletteDithered` 는 워커(`gifEncoder.worker.ts`)에서만 import** 해 `m.dither` 일 때 mapper 로 주입. 결과: 무거운 FS 디더링 패스가 워커 청크에만 들어가고 **메인 번들에서 트리셰이킹**된다(번들 예산 보호). 드물게 도는 메인 스레드 인라인 폴백은 기본 mapper(비디더)로 **유효한 GIF 를 그대로 생성** — Phase 32 의 "녹화본을 잃지 않는다" 가드는 유지하되 폴백 품질만 약간 낮음.
- **클라이언트/워커 통과 (`gifEncoderClient.ts` · `gifEncoder.worker.ts`)**: `dither`/`localPalette` 를 `GifEncodeJob` 선택 필드로 통과(미지정은 `?? false`/기본 mapper — exactOptionalPropertyTypes 준수). 워커는 `dither` 로 mapper 를 결정, 인라인 폴백은 항상 기본 mapper.
- **`gifRecorderStore` 품질 기본값**: `GifRecorderOptions` 에 `dither`/`localPalette` 추가, **둘 다 기본 on**(셰이더 출력엔 디더+로컬 팔레트가 큰 품질 이득, 인코딩은 워커가 처리). `stop()` 의 encode job 에 함께 전달. Toolbar `● GIF` 버튼 UX·다운로드 경로는 불변.
- **번들 예산 (`scripts/check-bundle-size.mjs`)**: JS gzip 한계를 **360 → 363 KiB 로 상향**. main 시점에 예산이 이미 CI gzip 천장 대비 ~100B 여유뿐이라, 디더링을 워커 전용 청크로 분리했음에도 로컬-팔레트 plumbing 잔여분이 총합을 넘겨, 기능 드롭 대신 **명시적 사용자 승인 하에** 한계를 올림(가드 우회 아님 — 예산 재조정).
- **검증**: Vitest 단위 — `quantize.test.ts` (+4: in-range 인덱스 · 팔레트 정확색 무디더 · mid-gray 가 양 극단으로 균형 확산(mean≈0.5) · 단일색 팔레트 안전), `encode.test.ts` (+2: localPalette 시 전역 테이블 생략 + 프레임별 로컬 테이블에서 원색 복원 / mapper 로 `mapToPaletteDithered` 주입 시 픽셀당 유효 인덱스로 디코드 — 테스트 파서에 로컬 컬러 테이블 디코드 추가). Playwright E2E `phase-33-gif-quality.spec.ts` 2 건 — (a) `localPalette+dither` 녹화본을 브라우저 `createImageBitmap` 로 디코드 + LSD packed 로 전역 테이블 부재 확인, (b) `localPalette:false` 전역-테이블 경로도 디코드 + 전역 테이블 존재 확인(두 인코더 분기 모두 브라우저 스펙 적합). Phase 31 의 4 건도 새 기본값(dither+local) 위에서 그대로 회귀 가드.
- **비범위 (Out of scope — 별도 백로그)**: transparency(1-bit), 정적 HTML export 의 GIF, 인코딩 진행률 표시, per-frame palette 의 색 안정화(프레임 간 팔레트 떨림 억제), 인라인 폴백의 디더링(현재 워커 경로에서만 — 메인 번들 보호 의도).

### (백로그)
- 쉐이더 핫리로드 디스크 백업(File System Access API).
- **GLSL LSP — 추가 확장**: Phase 24 / 25 / 26 / 27 / 28 가 진단·심볼 테이블·Hover·시맨틱 토큰·Goto/References/Rename·Cross-stage rename 까지 다룸. **함수 오버로드 해석**, **call hierarchy**, **for-init block-scope 정확도**, **그래프 연결을 따라가는 multi-program rename** 이 잠재 후속. CodeMirror 6 유지(Monaco 전환은 여전히 회피 권장).

---

## 5. 결정 사항 요약

### 5.1 사용자 확정 (이번 라운드)

| 항목 | 결정 |
|---|---|
| UI 프레임워크 | React 18 |
| 노드 그래프 | React Flow (`@xyflow/react`) |
| 코드 에디터 | CodeMirror 6 |
| 메시 로더 | loaders.gl (OBJ + GLTF 지오메트리) |
| 상태 관리 | Zustand |
| 쉐이더 노드 | 한 노드에서 vertex/fragment 둘 다 편집 (탭) |
| 유니폼 노출 | GLSL 소스 자동 파싱 → 인스펙터 슬라이더 (노드 카드 안 X, 우측 패널 O) |
| 카메라 | OrbitCamera (좌클릭 회전 / 우클릭 팬 / 휠 줌) |
| 플랫폼 | 데스크톱 전용 (모바일 대응 없음) |
| Output 노드 | 명시적 배치, 그래프당 0~1개. 없으면 캔버스에 placeholder. |
| 노드 카드 썸네일 | 모든 ShaderNode/ImageNode에 라이브 썸네일 상시 표시 (Blender 스타일). 추가 렌더 패스 없이 기존 FBO를 readback. 10Hz 스로틀 + 가시성 컬링. |

### 5.2 기본값으로 진행 (사용자 미지정 — 합리적 디폴트 채택)

| 항목 | 디폴트 | 비고 |
|---|---|---|
| 포트 연결 | 1:N 분기 OK, N:1 금지 | 합성이 필요하면 명시적 블렌드 노드(후속) |
| GLTF 범위 | 지오메트리만 | 머티리얼/애니메이션 무시 |
| 컴파일 트리거 | 디바운스 자동 재컴파일 | 향후 수동 컴파일 단축키 추가 가능 |
| 직렬화 | JSON export/import (Phase 8), 에셋은 IndexedDB 캐시 | |
| 노드 종류 | Mesh / Image / Webcam / Video / Audio / Shader / Compute / Output / Parameter / Math / Swizzle / Combine / Group | Parameter는 Phase 10, Math·Swizzle·Combine 유틸은 Phase 12, Compute(Transform Feedback) 은 Phase 13, Webcam (외부 라이브 텍스처) 은 Phase 14a, Video 는 Phase 14b, Audio (FFT 텍스처) 는 Phase 14c, Group (시각적 컨테이너) 은 Phase 29. Output 은 최대 4개(Phase 10 분할 뷰포트). |
| 의존성 무게 | 경량 우선 | three.js·Monaco는 의도적으로 회피 |

이 디폴트 중 바꾸고 싶은 항목이 있으면 알려줘. 아니면 이대로 Phase 1부터 진행.

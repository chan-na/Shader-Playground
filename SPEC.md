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

### (백로그)
- 쉐이더 핫리로드 디스크 백업(File System Access API).
- **GLSL LSP — 확장 범위**: Phase 24 가 *진단*만 다룸. 스코프 인식 자동완성(심볼 테이블), Hover 시그니처, Go-to-definition 은 별도 단계. CodeMirror 6 그대로(Monaco 전환은 여전히 회피 권장 — 진단 정합성을 OffscreenCanvas 백엔드가 이미 확보).
- GIF 녹화(gif.js / WASM gifenc).

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
| 노드 종류 | Mesh / Image / Webcam / Video / Audio / Shader / Compute / Output / Parameter / Math / Swizzle / Combine | Parameter는 Phase 10, Math·Swizzle·Combine 유틸은 Phase 12, Compute(Transform Feedback) 은 Phase 13, Webcam (외부 라이브 텍스처) 은 Phase 14a, Video 는 Phase 14b, Audio (FFT 텍스처) 는 Phase 14c. Output 은 최대 4개(Phase 10 분할 뷰포트). |
| 의존성 무게 | 경량 우선 | three.js·Monaco는 의도적으로 회피 |

이 디폴트 중 바꾸고 싶은 항목이 있으면 알려줘. 아니면 이대로 Phase 1부터 진행.

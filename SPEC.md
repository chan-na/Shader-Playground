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

레이어 분리, 노드/포트 모델, 컴파일·렌더 파이프라인, 카메라, 썸네일 서브시스템, 상태 스토어 구조, 에러 처리, 직렬화, 정적 HTML export 등 **현 구현(Phase 12)의 동작 설명은 [Architecture.md](./Architecture.md) 로 이전**되었다. 본 SPEC 의 노드 모델·연결 규칙·페이즈 결정은 그쪽 문서의 §2 (그래프 모델) / §3 (컴파일) / §4 (렌더 루프) 와 일치하도록 유지된다.

핵심 SPEC 차원 결정만 다시 한 번 요약:

- 노드 종류는 9 가지 — `Mesh / Image / Shader / Compute / Output / Param / Math / Swizzle / Combine`. Shader 와 Compute 의 입력 포트는 GLSL 의 `uniform` 선언으로부터 매번 다시 파싱되어 자동 생성된다.
- ShaderNode 는 vertex + fragment GLSL 한 쌍을 함께 보유. 메시 입력이 없으면 빌트인 `fullscreen.vert` 가 자동 주입되고 사용자의 vertex 소스는 사용되지 않는다.
- ComputeNode 는 vertex GLSL 한 개와 `transformFeedbackVaryings` 로 캡처할 출력 attribute 목록을 보유. fragment 단계는 `RASTERIZER_DISCARD` 로 비활성화되고, ping-pong 두 vbo 세트로 매 프레임 시뮬레이션 결과를 갱신한다. 출력은 `mesh` 포트 하나 — 다운스트림 ShaderNode 가 mesh 입력으로 받아 POINTS/LINES/TRIANGLES 중 하나로 그린다.
- 포트 타입은 6 가지 — `mesh / texture / float / vec2 / vec3 / vec4`. 분기(1:N)는 허용, 합성(N:1)은 금지. Output 노드는 그래프당 0~4 개, 5 개 이상은 검증 단계에서 거부.
- 유틸 노드(Math/Swizzle/Combine)는 GL 패스를 만들지 않고 ShaderNode/ComputeNode 의 비-샘플러 uniform 입력을 CPU 측에서 매 프레임 평가해 덮어쓴다. fan-out 시 프레임당 1 회 메모이즈.
- 모든 ShaderNode 카드는 자기 FBO 컬러 어태치먼트의 96×96 라이브 썸네일을 표시. 추가 렌더 패스 없이 PBO + `fenceSync` 비동기 readback 으로 가져오며, 10 Hz 스로틀 + IntersectionObserver 가시성 컬링을 적용. ComputeNode 는 FBO 가 없어 썸네일이 없고, 대신 카드에 vertex count/primitive 메타정보를 표시한다.

자세한 동작·코드 경로는 [Architecture.md](./Architecture.md) 의 §2~§11 참조.

---

## 3. 디렉토리 구조

전체 트리와 모듈별 책임은 [Architecture.md §12](./Architecture.md#12-디렉토리-트리-phase-12-기준) 로 이전되었다. 초안 SPEC 디렉토리와 실제 구현이 어떻게 달라졌는지(노드 모듈 통합, edges 패키지 폐기, Viewport 컴포넌트 분할 폐기, SidePanel 단일화, export 신설 등) 도 같은 문서의 §12.1 참조.

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

### (백로그)
- 쉐이더 핫리로드 디스크 백업(File System Access API).
- GLSL LSP 도입(Monaco 전환 검토).
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
| 노드 종류 | Mesh / Image / Shader / Compute / Output / Parameter / Math / Swizzle / Combine | Parameter는 Phase 10, Math·Swizzle·Combine 유틸은 Phase 12, Compute(Transform Feedback) 은 Phase 13. Output 은 최대 4개(Phase 10 분할 뷰포트). |
| 의존성 무게 | 경량 우선 | three.js·Monaco는 의도적으로 회피 |

이 디폴트 중 바꾸고 싶은 항목이 있으면 알려줘. 아니면 이대로 Phase 1부터 진행.

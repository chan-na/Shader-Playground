# 스펙 — 영속화 · 공유/내보내기 · 녹화

> 프로젝트 직렬화·자동저장·Share URL·정적 HTML export·WebM/GIF 녹화 관련 Phase 본문.
> 인덱스(Phase 번호 → 현재 동작 · E2E 스펙 · 파일)는 [SPEC.md](../../SPEC.md)에 있다. 아래 본문은 Phase 작성 당시 기록을 그대로 옮긴 것이며, 이후 Phase가 덮어쓴 내용은 인덱스의 "현재 동작" 열이 우선한다.

### Phase 8 — 직렬화 & 마무리
- 그래프 JSON export/import.
- 에셋은 IndexedDB에 캐시(파일 경로 의존 제거).
- 프리셋 예제 그래프 2~3개 번들.
- 스크린샷 캡처, 에러/통계 표시(StatusBar).

### Phase 11 — 공유/배포 (완료)
- **Share URL** (`#share=<payload>`): gzip(`CompressionStream`) + URL-safe base64로 직렬화한 프로젝트를 URL hash 에 인코딩. 앱 부트 시 hash 감지 → 자동 import (실패 시 데모 폴백). Sphere 데모 ≈ 900자.
- **캔버스 녹화 → WebM**: `MediaRecorder` + `canvas.captureStream(30fps)`. 툴바 ● Record / ■ Stop 토글, 녹화 중 빨간 강조. 멈추면 자동 다운로드. VP9 → VP8 → WebM → mp4 순으로 mimeType 폴백.
- **정적 HTML export**: 의존성 0인 단일 파일(~26KB) 생성. `src/export/standalonePlayer.js`에 자체 mat4·primitive 생성기·compile·execute 미니 런타임을 인라인(Vite `?raw`). 프로젝트 JSON은 `window.__SP_PROJECT`로 임베드. split-output, 파라미터 노드, FBO 체인까지 그대로 동작. 익스포트된 HTML 내 `</script>` 인젝션 방지 이스케이프.
- **정적 export 의 한계(2026-08 실측, 백로그)**: 산출물에 임베드되지 않는 것 — Image/Video/Audio 에셋 blob(`__SP_IMAGE_*`/`__SP_VIDEO_BLOBS`/`__SP_AUDIO_BLOBS` 주입 경로 자체가 없어 해당 샘플러는 비바인딩), 임포트한 OBJ/glTF 지오메트리(플레이어가 노드의 `primitive` 필드로 폴백해 큐브 등을 그린다). 또한 플레이어에 compute(transform feedback) 구현이 없어 **compute 를 mesh 입력으로 쓰는 셰이더 패스는 링크에 실패**한다. webcam/mic 은 런타임 권한으로만 동작한다. 이 넷은 이번 학습 가시성 라운드의 범위 밖이며 별도 백로그다.
- **검증**: Share URL 복사 → 다른 탭에서 열어 동일한 그래프 복원. `Export HTML`로 받은 파일을 `iframe srcdoc`에 마운트 → 메인 뷰포트와 동일한 셰이더 체인 렌더.

### Phase 31 — 애니메이션 GIF 녹화 (완료)
Phase 11 의 WebM 녹화·정적 HTML export 에 이어 공유 결과물을 **애니메이션 GIF** 로 내보내는 경로. 백로그의 `gif.js / gifenc` 제안 대신, 저장소의 zero-dep core 원칙(standalonePlayer 선례)·360 KiB 번들 게이트·순수 로직 테스트 문화에 맞춰 **의존성 0 자체 구현 인코더**를 택했다.
- **자체 GIF89a 인코더 (`src/core/gif/`)**: 순수 TS, DOM·GL 비의존 3 모듈. `lzw.ts` — GIF 가변폭 LZW 압축(LSB-first 비트팩, clear/EOI, 4096 엔트리에서 테이블 리셋). 디코더가 한 코드 뒤처지는 특성을 반영해 폭 증가를 `2^width + 1` 시점으로 맞춰 lockstep 유지. `quantize.ts` — rgb555 히스토그램 위 median-cut 으로 ≤256 색 전역 팔레트 생성(`buildPalette`) + rgb555 캐시로 픽셀당 nearest 매핑(`mapToPalette`). `encode.ts` — 헤더 → LSD → 전역 팔레트 → NETSCAPE2.0 루프 → 프레임별 GCE/이미지 디스크립터/LZW → trailer 조립(`encodeGif`). 단일 전역 팔레트로 인코더·출력 모두 간결.
- **`gifRecorderStore` (`src/state/gifRecorder.ts`)**: WebM 의 `recorder.ts` 와 형제. 무거운 프레임 버퍼는 zustand 밖 모듈 싱글톤(`_active`)에 두고, 상태(status idle/recording/encoding · frameCount · elapsedMs · lastBlobUrl)만 스토어에. `captureFrame(canvas)` 가 스크래치 2D 캔버스로 `drawImage` 다운스케일(longest edge ≤ `maxLongEdge`) → `getImageData` 로 RGBA 수집(목표 fps 스로틀, `maxSeconds` 프레임 캡). `stop()` 은 캡처 타임스탬프 차이로 프레임별 delay 를 산출(`frameDelays`)해 `encodeGif` → `image/gif` Blob. 인코딩은 한 번 yield 후 동기 수행.
- **Viewport 통합**: 컨텍스트가 `preserveDrawingBuffer: false` 라 캡처는 **draw 와 같은 RAF tick 안**에서 해야 한다 — `executePlan` 직후 recording 중이면 `captureFrame` + `tick` 호출. dirty 게이트(B2)에 `gifRecording` 을 `hasExternal` 과 동급의 무조건 dirty 신호로 추가해 시간 정지·정적 그래프에서도 프레임이 일정 cadence 로 캡처된다.
- **Toolbar**: WebM `● Record` 옆에 `● GIF` 토글(녹화 중 빨강 `■ GIF`, 인코딩 중 `⏳ GIF` disabled). 멈추면 `.gif` 자동 다운로드.
- **검증**: Vitest 단위 30 건 — `lzw.test`(독립 표준 디코더로 round-trip: 빈/단일/반복/폭증가/4096 리셋/KwKwK 자기참조), `quantize.test`(팔레트 보존·gradient 축약·maxColors 클램프·nearest 매핑 round-trip), `encode.test`(내장 GIF 파서로 헤더/스크린 크기/루프 확장/픽셀 인덱스 복원/프레임별 delay·2cs 클램프), `gifRecorder.test`(frameDelays · fps 스로틀 · maxSeconds 캡 · 컨텍스트 부재 · 인코드 Blob · tick). Playwright E2E `phase-31-gif-recording.spec.ts` 3 건 — (a) 스토어 shape, (b) 시간 정지 중에도 recording 이 렌더 루프를 깨워 `renderTick` 증가, (c) Toolbar GIF 버튼이 녹화 시작. 라이브 캡처 후 **브라우저 `createImageBitmap` 로 GIF 디코드**(스펙 적합성의 authoritative 검증) + GIF89a 매직·dims 는 기본 옵션(dither + local palette)과 같은 `phase-33-gif-quality.spec.ts` 의 per-frame 테스트가 담당.
- **비범위 (Out of scope — 별도 백로그)**: per-frame 로컬 팔레트/디더링, transparency(1-bit), 정적 HTML export 의 GIF(녹화는 에디터 전용). (인코딩 Web Worker 오프로드는 Phase 32 에서 구현됨.)

### Phase 32 — GIF 인코딩 Web Worker 오프로드 (완료)
Phase 31 의 GIF 인코더는 `stop()` 에서 quantize + LZW + GIF89a 조립을 **메인 스레드에서 동기 수행**해 몇 초짜리 클립은 인코딩 동안 에디터가 얼어붙었다. 순수 `core/gif/encode.ts` 는 그대로 두고, 그 호출만 워커로 옮긴다 — 의존성 0, Phase 24 의 `glslValidator` 워커/클라이언트 패턴을 그대로 재사용.
- **워커 (`core/gif/gifEncoder.worker.ts`)**: Vite `?worker` 임포트. stateless data-in / bytes-out — `{type:'encode', reqId, width, height, frames, maxColors, loop}` 을 받아 `encodeGif` 를 돌리고 `{type:'encode', reqId, ok, bytes?, error?}` 로 응답. 결과 바이트 버퍼는 transferable 로 zero-copy 반환. **입력 프레임 버퍼는 일부러 transfer 하지 않는다** — 메인 스레드에 그대로 남겨 워커가 도중에 죽어도 인라인 폴백이 가능하도록.
- **클라이언트 (`core/gif/gifEncoderClient.ts`)**: 앱당 워커 1 개(첫 `encode()` 에 lazy 생성), reqId 별 독립 Promise. **실패 모델은 validator 보다 강하다** — validator 는 실패 시 `[]` 를 주지만(라이브 진단은 보조), 사용자가 명시적으로 녹화한 GIF 는 잃으면 안 되므로 워커 construct/post/error 어느 단계 실패도 **메인 스레드 인라인 `encodeGif` 로 폴백**한다(최악의 경우 = Phase 31 의 동기 동작). 워커가 `ok:false` 로 인코드 에러를 보고하면(동일 입력은 인라인도 throw) 그대로 reject. `typeof Worker === 'undefined'` 가드는 default factory 한정이라 jsdom/SSR 은 곧장 인라인 경로(테스트 결정성), 주입된 `workerFactory` 는 항상 시도(워커 경로 단위 테스트).
- **`gifRecorder.stop()` 연동**: 기존 동기 `encodeGif(...)` 호출을 `await gifEncoder().encode({...})` 로 교체. `status:'encoding'` 표시 → 워커가 인코딩하는 동안 메인 스레드 free → Blob 생성. 프레임 delay 산출(`frameDelays`)·캡처 경로는 불변.
- **검증**: Vitest 단위 10 건 — `gifEncoderClient.test.ts` (fake worker 주입으로 RPC 라우팅 · ok:false reject · out-of-order reply · stray/malformed reqId 무시 · construct/post/error 인라인 폴백 · 잘못된 입력 reject · dispose · singleton). Playwright E2E 는 Phase 31 의 `phase-31-gif-recording.spec.ts` 와 `phase-33-gif-quality.spec.ts` 가 회귀 가드 — chromium 에서는 실제 워커 경로가 돌고 `createImageBitmap` 로 GIF 스펙 적합성을 authoritative 검증.
- **비범위 (Out of scope — 별도 백로그)**: per-frame 로컬 팔레트/디더링, transparency(1-bit), 정적 HTML export 의 GIF, 인코딩 진행률 표시(현재 워커는 단일 메시지로 완료). (per-frame 로컬 팔레트 + 디더링은 Phase 33, 인코딩 진행률 표시는 Phase 34 에서 구현됨.)

### Phase 33 — GIF per-frame 로컬 팔레트 + 디더링 (완료)
Phase 31/32 의 GIF 결과물 품질을 끌어올리는 마감. 셰이더 출력의 그라데이션/네온이 단일 256색 전역 팔레트에서 밴딩되던 문제를, **Floyd–Steinberg 디더링**과 **프레임별 로컬 팔레트**로 해소한다. 순수 `core/gif/` 로직만 확장 — 의존성 0, 인코딩은 Phase 32 워커 경로 위에서 그대로 돈다.
- **디더링 (`core/gif/quantize.ts` 의 `mapToPaletteDithered`)**: Floyd–Steinberg 오차확산 — 각 픽셀의 양자화 오차를 아직 방문 안 한 이웃(우 7/16, 좌하 3/16, 하 5/16, 우하 1/16)에 분배. `curr`/`next` 두 줄 `Float32Array` 오차 버퍼를 lockstep 으로 walk(줄 끝에서 `curr ← next`). rgb555 캐시는 의도적으로 미사용 — 오차 누적으로 같은 입력색도 다른 인덱스로 매핑되므로 픽셀마다 nearest-color 탐색(≤256 엔트리, Phase 32 워커로 오프로드돼 메인 스레드 영향 0). 팔레트 위에 정확히 얹힌 솔리드색(오차 0)은 디더 없이 그대로, 단일색 팔레트도 0-나눗셈 없이 안전.
- **로컬 팔레트 (`core/gif/encode.ts`)**: `EncodeGifOptions` 에 `localPalette?`(기본 false — 기존 출력·단위 테스트 byte 호환). `localPalette` 시 **전역 컬러 테이블을 생략**(LSD packed bit7=0)하고 프레임마다 `buildPalette([frame])` 로 자기 팔레트를 만들어 **로컬 컬러 테이블**(이미지 디스크립터 packed bit7=1 + size, 테이블은 디스크립터 직후·이미지 데이터 직전)과 **프레임별 LZW min-code-size** 를 emit. 색이 시간에 따라 변하는 클립의 충실도가 크게 오른다. `paletteBits`/`pushColorTable` 헬퍼로 전역/로컬 두 경로 공유.
- **mapper 주입 — 디더링 코드를 워커 청크에만 (번들 분리)**: `encodeGif(opts, mapper?)` 의 픽셀 매핑을 주입식 `FrameMapper` 로 분리. encode.ts 는 기본 `mapToPalette`(plain nearest) 만 정적 import 하고, **`mapToPaletteDithered` 는 워커(`gifEncoder.worker.ts`)에서만 import** 해 `m.dither` 일 때 mapper 로 주입. 결과: 무거운 FS 디더링 패스가 워커 청크에만 들어가고 **메인 번들에서 트리셰이킹**된다(번들 예산 보호). 드물게 도는 메인 스레드 인라인 폴백은 기본 mapper(비디더)로 **유효한 GIF 를 그대로 생성** — Phase 32 의 "녹화본을 잃지 않는다" 가드는 유지하되 폴백 품질만 약간 낮음.
- **클라이언트/워커 통과 (`gifEncoderClient.ts` · `gifEncoder.worker.ts`)**: `dither`/`localPalette` 를 `GifEncodeJob` 선택 필드로 통과(미지정은 `?? false`/기본 mapper — exactOptionalPropertyTypes 준수). 워커는 `dither` 로 mapper 를 결정, 인라인 폴백은 항상 기본 mapper.
- **`gifRecorderStore` 품질 기본값**: `GifRecorderOptions` 에 `dither`/`localPalette` 추가, **둘 다 기본 on**(셰이더 출력엔 디더+로컬 팔레트가 큰 품질 이득, 인코딩은 워커가 처리). `stop()` 의 encode job 에 함께 전달. Toolbar `● GIF` 버튼 UX·다운로드 경로는 불변.
- **번들 예산 (`scripts/check-bundle-size.mjs`)**: JS gzip 한계를 **360 → 363 KiB 로 상향**. main 시점에 예산이 이미 CI gzip 천장 대비 ~100B 여유뿐이라, 디더링을 워커 전용 청크로 분리했음에도 로컬-팔레트 plumbing 잔여분이 총합을 넘겨, 기능 드롭 대신 **명시적 사용자 승인 하에** 한계를 올림(가드 우회 아님 — 예산 재조정).
- **검증**: Vitest 단위 — `quantize.test.ts` (+4: in-range 인덱스 · 팔레트 정확색 무디더 · mid-gray 가 양 극단으로 균형 확산(mean≈0.5) · 단일색 팔레트 안전), `encode.test.ts` (+2: localPalette 시 전역 테이블 생략 + 프레임별 로컬 테이블에서 원색 복원 / mapper 로 `mapToPaletteDithered` 주입 시 픽셀당 유효 인덱스로 디코드 — 테스트 파서에 로컬 컬러 테이블 디코드 추가). Playwright E2E `phase-33-gif-quality.spec.ts` 2 건 — (a) `localPalette+dither` 녹화본을 브라우저 `createImageBitmap` 로 디코드 + LSD packed 로 전역 테이블 부재 확인, (b) `localPalette:false` 전역-테이블 경로도 디코드 + 전역 테이블 존재 확인(두 인코더 분기 모두 브라우저 스펙 적합). Phase 31 의 4 건도 새 기본값(dither+local) 위에서 그대로 회귀 가드.
- **비범위 (Out of scope — 별도 백로그)**: transparency(1-bit), 정적 HTML export 의 GIF, per-frame palette 의 색 안정화(프레임 간 팔레트 떨림 억제), 인라인 폴백의 디더링(현재 워커 경로에서만 — 메인 번들 보호 의도). (인코딩 진행률 표시는 Phase 34 에서 구현됨.)

### Phase 34 — GIF 인코딩 진행률 표시 (완료)
Phase 31~33 의 GIF 인코더는 워커가 완료를 *단일 메시지* 로만 보고해, 멀티초 클립을 인코딩하는 동안 Toolbar 의 `⏳ GIF` 칩이 아무 피드백을 주지 않았다. 순수 `core/gif/` 로직과 Phase 32 워커/클라이언트 RPC 위에 **프레임 단위 progress** 채널을 얹는 경량 확장 — 의존성 0, 무거운 코드 추가 없음.
- **`encodeGif(opts, mapper?, onProgress?)` (`core/gif/encode.ts`)**: 옵셔널 세 번째 인자 `EncodeProgress = (done, total) => void` 를 추가. 프레임 루프가 한 프레임을 조립할 때마다 `onProgress(++done, frames.length)` 를 호출한다. 미지정 시 기존과 byte-identical (기존 단위 테스트·인라인 폴백 무영향). `for...of` + 카운터라 `noUncheckedIndexedAccess` 인덱스 단언 없이 `frame: GifFrame` 을 그대로 유지.
- **워커 progress 메시지 (`gifEncoder.worker.ts`)**: 새 `GifEncodeProgress = { type:'progress', reqId, done, total }`. `encodeGif` 에 progress 콜백을 주입해 프레임마다 post 하고, 최종 `{type:'encode', ok, bytes}` 응답은 그대로 마지막에 보낸다(progress N=total 이 bytes 보다 먼저 도착하도록 순서 보존).
- **클라이언트 통과 (`gifEncoderClient.ts`)**: `GifEncodeJob.onProgress?` 추가, `PendingJob` 에 보관. `onMessage` 가 `type:'progress'` 분기에서 **pending 을 유지한 채** `job.onProgress?.(done,total)` 만 호출하고, `type:'encode'` 에서만 resolve/reject. 인라인 폴백(`encodeInline`)도 `job.onProgress` 를 `encodeGif` 로 전달해 워커가 없는 환경(jsdom/SSR/실패 폴백)에서도 progress 가 동일하게 보고된다. unknown reqId progress 는 무시.
- **`gifRecorderStore.encodeProgress: number` (0..1)**: `stop()` 의 encode job 에 `onProgress: (done,total)=>set({encodeProgress: done/total})` 연결. `start()` / encode 시작 / idle 복귀(성공·실패)에서 0 으로 리셋.
- **Toolbar**: `encoding` 상태에서 `⏳ GIF` 대신 `⏳ {Math.round(progress*100)}%` 표시(`gifEncodeProgress` 구독). 녹화/다운로드 경로는 불변.
- **검증**: Vitest 단위 +5 건 — `encode.test`(onProgress 프레임당 1회·단조·완결 카운트 / onProgress 옵셔널), `gifEncoderClient.test`(progress 메시지를 `job.onProgress` 로 순서대로 전달 + promise 미settle / unknown reqId progress 무시 / 인라인 폴백도 progress 보고), `gifRecorder.test`(encode 중 encodeProgress 가 1 까지 상승 후 idle 에서 0 리셋, start 가 잔여 progress 클리어). Playwright E2E `phase-34-gif-progress.spec.ts` 2 건 — (a) 스토어가 `encodeProgress` 노출 + idle 에서 0, (b) chromium 실제 워커 경로에서 라이브 녹화→stop 시 progress 가 단조 증가하며 1 에 도달하고 완료 후 idle·0 으로 복귀(스토어 subscribe 로 transient 값 포착). Phase 31~33 기존 GIF 스펙은 회귀 가드로 유지.
- **비범위 (Out of scope — 별도 백로그)**: transparency(1-bit), 정적 HTML export 의 GIF, per-frame palette 색 안정화, 인라인 폴백의 디더링.

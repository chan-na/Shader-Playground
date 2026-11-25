# 스펙 — 외부 입력 · 에셋

> 메시/이미지 에셋 로더와 Webcam·Video·Audio 라이브 입력 노드 관련 Phase 본문.
> 인덱스(Phase 번호 → 현재 동작 · E2E 스펙 · 파일)는 [SPEC.md](../../SPEC.md)에 있다. 아래 본문은 Phase 작성 당시 기록을 그대로 옮긴 것이며, 이후 Phase가 덮어쓴 내용은 인덱스의 "현재 동작" 열이 우선한다.

### Phase 7 — 외부 에셋 로더
- 프리미티브 5종(cube/sphere/plane/torus/quad).
- OBJ 임포트(loaders.gl).
- GLTF 임포트(애니메이션/머티리얼은 무시, 메시만).
- 이미지 임포트(PNG/JPG/WebP).
- AssetBrowser 패널 + 드래그&드롭.
- **검증**: 사용자가 OBJ/PNG를 드롭하면 노드로 등장하고 즉시 연결 가능.

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
- **정적 export**: `standalonePlayer.js` 에 video 소스 구현이 들어 있다(object URL → `<video>` → 매 frame `texSubImage2D`, sampler fallback). **다만 현재 익스포터는 blob 을 심지 않는다** — 플레이어의 `initVideos` 는 `window.__SP_VIDEO_BLOBS` 를 요구하는데 `htmlExport.ts` 는 `window.__SP_PROJECT` 만 주입하므로, 익스포트된 HTML 에서 video 샘플러는 비바인딩으로 남는다(§Phase 11 의 export 한계 목록 참조).
- **검증**: Vitest `videoLoader` 메타 프로빙·MIME 추론, `projectSanitize` 필드 검증/보존, `external/registry` video acquire/restart/release. Playwright E2E `phase-14b-video.spec.ts` 4 건 — (a) assetId 없는 video 노드가 컴파일·에러 보고하되 런타임 에러 0, (b) 노드 제거 시 dispose 안정, (c) Share URL 라운드트립 보존, (d) time pause 후에도 `plan.hasExternal` 로 렌더 루프 유지.

### Phase 14c — Audio 노드 (완료)
마이크 또는 파일 오디오를 `AnalyserNode` FFT bin 으로 떠서 1D R8 텍스처(`fftSize/2 × 1`)로 노출. 셰이더는 이 텍스처를 샘플해 스펙트럼·라우드니스(평균)를 시각화한다.
- **새 노드 종류 `audio`**: 입력 포트 0, 출력 `texture: texture` 단일. 필드 — `sourceKind`(`mic` → `getUserMedia({audio:true})` / `file` → `decodeAudioData(blob)`), `assetId`(file 모드), `fftSize`(`AUDIO_FFT_SIZES` 32~2048 의 2 의 거듭제곱), `smoothing`(`AnalyserNode.smoothingTimeConstant` 0~1), file 모드의 `playing` / `loop`.
- **로더 (`core/assets/audioLoader.ts`)**: import 시 임시 `AudioContext.decodeAudioData` 로 duration/sampleRate/channels 만 프로빙하고 디코드된 PCM 은 즉시 폐기(mp3→PCM 은 메모리 ~10 배). 재생은 영속된 Blob 에서 다시 디코드.
- **registry 핸들**: `AudioHandle` 이 `AudioContext` + `AnalyserNode` 를 들고, mic 모드는 `MediaStreamAudioSourceNode`, file 모드는 `AudioBufferSourceNode`. `bins` 는 `fftSize/2` 크기 재사용 `Uint8Array`(fftSize 변경 시 재할당). 매 RAF `getByteFrequencyData(bins)` → R8 텍스처(`width=fftSize/2, height=1`) 업로드. assetId 는 `setAudioBlobResolver` 로 해석.
- **UI**: `AudioNodeView`(source kind / fftSize / status 메타), `AudioInspector`(mic↔file 토글 / 에셋 선택 / fftSize 드롭다운 / smoothing 슬라이더 / play·loop). minimap 색 `#56c1d6`. CommandPalette `Add Audio (mic/file FFT texture)` + Toolbar `+ Audio`.
- **정적 export**: `standalonePlayer.js` 에 file 모드 audio 구현이 들어 있다(`createAnalyser` + FFT bin → R8 텍스처). video 와 같은 이유로 **현재는 동작하지 않는다** — `window.__SP_AUDIO_BLOBS` 가 익스포트 산출물에 주입되지 않는다. 마이크도 `getUserMedia({audio:false})` 로 비활성이므로, 익스포트된 HTML 의 audio 샘플러는 비바인딩이다(§Phase 11 참조).
- **검증**: Vitest `audioLoader` 메타 디코드, `projectSanitize`(sourceKind / fftSize / smoothing 클램프·검증), `external/registry` audio mic·file lifecycle. Playwright E2E `phase-14c-audio.spec.ts` 4 건 — (a) assetId 없는 file audio 노드가 컴파일·에러 보고하되 런타임 에러 0, (b) 노드 제거 시 dispose 안정, (c) Share URL 라운드트립 보존, (d) time pause 후에도 `plan.hasExternal` 로 렌더 루프 유지.

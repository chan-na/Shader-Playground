# Shader Playground

WebGL2 기반 셰이더 플레이그라운드. Vite + TypeScript로 작성됨.

## 실행

```bash
npm install
npm run dev
```

브라우저가 자동으로 열리며, 시간에 따라 색이 변하는 풀스크린 쿼드가 표시됩니다.

## 빌드

```bash
npm run build      # dist/ 로 정적 빌드
npm run preview    # 빌드 결과 미리보기
```

## 구조

```
src/
  main.tsx                # WebGL2 컨텍스트, 프로그램 링크, 렌더 루프
  vite-env.d.ts           # *.vert / *.frag ?raw 타입 선언
  shaders/
    fullscreen.vert       # 풀스크린 쿼드 정점 셰이더
    color.frag            # uniform u_time / u_resolution 기반 색 변화
index.html
vite.config.ts
tsconfig.json
```

셰이더는 `?raw` 임포트로 문자열로 읽어와 컴파일합니다. 새 셰이더 파일을 추가할 때는 `src/shaders/` 아래에 두고 `main.tsx`에서 임포트하세요.

## Uniforms

| 이름            | 타입   | 의미                          |
| --------------- | ------ | ----------------------------- |
| `u_time`        | float  | 페이지 로드 후 경과 시간(초) |
| `u_resolution`  | vec2   | 캔버스 픽셀 해상도            |

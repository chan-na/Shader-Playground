import { useEffect, useMemo, useRef, useState } from "react";
import basicVert from "../../shaders/basic.vert?raw";
import starterFrag from "../../shaders/templates/starter.frag?raw";
import { useCommandPaletteStore } from "../../state/commandPaletteStore";
import { useGraphStore } from "../../state/graphStore";
import { useSelectionStore } from "../../state/selectionStore";
import { tokens, withAlpha } from "../../theme";
import { nextId } from "../../utils/id";
import { buildCommands, type Command } from "./commands";
import {
  type CommandKind,
  cycleModePrefix,
  type FuzzySegment,
  fuzzySegments,
  groupCommands,
  nextActive,
  parseMode,
  prevActive,
  rankCommands,
} from "./helpers";

/** node kind 커맨드의 아이콘 박스 색 계열 → CSS 클래스 접미사. */
function iconVariant(cmd: Command): string {
  if (cmd.kind === "preset") return "preset";
  if (cmd.kind === "command") return "command";
  return cmd.iconCategory ?? "container";
}

const TAG_LABEL: Record<CommandKind, string> = {
  node: "NODE",
  command: "CMD",
  preset: "PRESET",
};

/**
 * fuzzySegments()의 결과에 React key를 붙인다. 세그먼트는 label을 처음부터
 * 끝까지 빈틈없이 나눈 것이므로, 지금까지 소비한 글자 수(누적 offset)가
 * 라벨 안에서의 위치를 나타내는 안정적인 키가 된다 — 루프 인덱스 자체를
 * key로 쓰는 것과 달리 세그먼트의 내용(길이)에서 유도된 값이다.
 */
function keyedSegments(
  label: string,
  term: string,
): Array<FuzzySegment & { key: number }> {
  let offset = 0;
  return fuzzySegments(label, term).map((seg) => {
    const key = offset;
    offset += seg.text.length;
    return { ...seg, key };
  });
}

export function CommandPalette() {
  const open = useCommandPaletteStore((s) => s.open);
  const setOpen = useCommandPaletteStore((s) => s.setOpen);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Keyboard shortcut: Cmd+K / Ctrl+K
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === "k") {
        e.preventDefault();
        useCommandPaletteStore.getState().toggle();
      } else if (e.key === "Escape" && open) {
        useCommandPaletteStore.getState().setOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  // 열기 경로가 둘 — ⌘K toggle과 store.setOpen(true) 직접 호출
  // (AppToolbar Search, Welcome "Browse all presets") — 이므로 리셋은
  // open 전이 지점 한 곳에서만 수행한다.
  useEffect(() => {
    if (open) {
      setQuery("");
      setActive(0);
      // Defer focus so the input mounts before focus() runs.
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [open]);

  const commands = useMemo(() => buildCommands(), []);
  const { mode, term } = parseMode(query);
  const pool = useMemo(
    () => (mode === "all" ? commands : commands.filter((c) => c.kind === mode)),
    [commands, mode],
  );
  const ranked = useMemo(() => rankCommands(pool, term), [pool, term]);
  const groups = useMemo(() => groupCommands(ranked), [ranked]);
  const flat = useMemo(() => groups.flatMap((g) => g.items), [groups]);
  let flatIndex = 0;
  const renderGroups = groups.map((g) => ({
    title: g.title,
    count: g.items.length,
    rows: g.items.map((cmd) => ({ cmd, index: flatIndex++ })),
  }));
  const displayTerm = query.replace(/^[@>/]/, "");

  if (!open) return null;

  const run = (cmd: Command) => {
    cmd.run();
    setOpen(false);
  };

  // dc "Command Palette.dc.html" 빈 결과(No matches) 상태: 빈 결과일 때
  // "Create a Shader node named …" CTA. Uses the fullscreen-safe starter
  // template, not unlit: a node created here has no mesh input, so compile.ts
  // compiles it against fullscreen.vert (v_uv only) and unlit.frag's
  // `in vec3 v_normal` would fail to link on the very first frame. Unlit stays
  // the mesh-shader template (demo graph + the explicit "Add Shader: Unlit"
  // command), so this leaves the app's first-run visual unchanged.
  const createShaderFromTerm = () => {
    const name = displayTerm.trim();
    if (!name) return;
    const id = nextId("shader");
    useGraphStore.getState().addNode(
      {
        id,
        kind: "shader",
        name,
        vertexSource: basicVert,
        fragmentSource: starterFrag,
        // No hardcoded seed values — the initial glow color comes from
        // starter.frag's `@default` hint, bound by compile.ts's
        // withExplicitDefaults at compile time.
        uniformValues: {},
      },
      { x: 100, y: 0 },
    );
    useSelectionStore.getState().select(id);
    setOpen(false);
  };

  // 검색어 없이 결과가 0인 경우는 현재 도달 불가(빈 쿼리는 항상 전체
  // 커맨드 풀을 반환)하지만, 방어적으로 검색어 존재를 함께 확인한다.
  const canCreateFromTerm = flat.length === 0 && displayTerm.trim().length > 0;

  const resultCount = `${flat.length} ${flat.length === 1 ? "result" : "results"}`;

  return (
    <div
      className="cmdk-overlay"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) setOpen(false);
      }}
      role="dialog"
      aria-modal="true"
      data-testid="command-palette"
    >
      <div
        className="cmdk-modal"
        style={{
          boxShadow: `var(--shadow-modal), 0 0 40px ${withAlpha(tokens.accent.default, 0.08)}`,
        }}
      >
        <div className="cmdk-search">
          <span className="cmdk-search-icon">⌕</span>
          {mode !== "all" && (
            <span className={`cmdk-mode-chip cmdk-mode-chip--${mode}`}>
              {mode === "node"
                ? "@ nodes"
                : mode === "command"
                  ? "> commands"
                  : "/ presets"}
            </span>
          )}
          <input
            ref={inputRef}
            className="cmdk-input"
            placeholder="Search nodes, commands, presets…"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActive(0);
            }}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setActive((a) => nextActive(a, flat.length));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setActive(prevActive);
              } else if (e.key === "Enter") {
                e.preventDefault();
                const cmd = flat[active];
                if (cmd) run(cmd);
                else if (canCreateFromTerm) createShaderFromTerm();
              } else if (e.key === "Tab") {
                e.preventDefault();
                setQuery(cycleModePrefix(query));
                setActive(0);
              }
            }}
          />
          <span className="cmdk-esc-chip">esc</span>
        </div>

        <div className="cmdk-results">
          {flat.length === 0 ? (
            <div className="cmdk-empty">
              <div className="cmdk-empty-icon">⌕</div>
              <div className="cmdk-empty-text">
                No matches for “<strong>{displayTerm}</strong>”
              </div>
              {canCreateFromTerm && (
                <button
                  type="button"
                  className="cmdk-empty-cta"
                  data-testid="cmdk-create-cta"
                  onClick={createShaderFromTerm}
                >
                  <span>
                    Create a Shader node named “
                    <span className="cmdk-empty-cta-term">
                      {displayTerm.trim()}
                    </span>
                    ”
                  </span>
                  <span className="cmdk-empty-cta-kbd">↵</span>
                </button>
              )}
            </div>
          ) : (
            renderGroups.map((g) => (
              <div key={g.title}>
                <div className="cmdk-group-header">
                  <span className="cmdk-group-title">{g.title}</span>
                  <span className="cmdk-group-count">{g.count}</span>
                </div>
                {g.rows.map(({ cmd, index }) => (
                  <button
                    type="button"
                    key={cmd.id}
                    tabIndex={-1}
                    className={
                      index === active
                        ? "cmdk-row cmdk-row--active"
                        : "cmdk-row"
                    }
                    onMouseEnter={() => setActive(index)}
                    onClick={() => run(cmd)}
                  >
                    <span
                      className={`cmdk-icon cmdk-icon--${iconVariant(cmd)}`}
                    >
                      {cmd.glyph}
                    </span>
                    <span className="cmdk-main">
                      <span className="cmdk-label">
                        {keyedSegments(cmd.label, term).map((seg) => (
                          <span
                            key={seg.key}
                            className={seg.hit ? "cmdk-seg--hit" : undefined}
                          >
                            {seg.text}
                          </span>
                        ))}
                      </span>
                      {cmd.sub && <span className="cmdk-sub">{cmd.sub}</span>}
                    </span>
                    {cmd.warn && (
                      <span className="cmdk-warn-badge">⚠ {cmd.warn}</span>
                    )}
                    <span
                      className={`cmdk-tag${cmd.kind === "preset" ? " cmdk-tag--preset" : ""}`}
                    >
                      {TAG_LABEL[cmd.kind]}
                    </span>
                    <span className="cmdk-trailing">
                      {index === active && (
                        <span className="cmdk-enter-glyph">↵</span>
                      )}
                      {cmd.keys?.map((k) => (
                        <span key={k} className="cmdk-key-chip">
                          {k}
                        </span>
                      ))}
                    </span>
                  </button>
                ))}
              </div>
            ))
          )}
        </div>

        <div className="cmdk-hint">
          <span className="cmdk-hint-item">
            <span className="cmdk-hint-key">↑↓</span>navigate
          </span>
          <span className="cmdk-hint-item">
            <span className="cmdk-hint-key">↵</span>select
          </span>
          <span className="cmdk-hint-item">
            <span className="cmdk-hint-key">tab</span>next mode
          </span>
          <span className="cmdk-hint-spacer" />
          <span>{resultCount}</span>
        </div>
      </div>

      <div className="cmdk-legend">
        <span>Type to fuzzy-search, or prefix:</span>
        <span className="cmdk-legend-item">
          <span className="cmdk-legend-chip cmdk-legend-chip--node">@</span>
          nodes
        </span>
        <span className="cmdk-legend-item">
          <span className="cmdk-legend-chip cmdk-legend-chip--command">
            &gt;
          </span>
          commands
        </span>
        <span className="cmdk-legend-item">
          <span className="cmdk-legend-chip cmdk-legend-chip--preset">/</span>
          presets
        </span>
      </div>
    </div>
  );
}

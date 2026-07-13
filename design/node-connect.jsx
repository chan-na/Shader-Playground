/* node-connect.jsx — ShaderPlayground motion prototype
   Story: grab a shader's output port → compatible inputs fan out (highlight)
   → drag the edge to Output → snap → viewport renders live.
   Reads Stage / useTime / interpolate / Easing / clamp from window (animations.jsx). */

const { useTime, interpolate, Easing, clamp } = window;

// ── palette ──────────────────────────────────────────────────────────
const C = {
  appDark: "#08090b", app: "#0b0c0e", panel: "#131519", header: "#101216",
  rail: "#0f1114", card1: "#1e2126", card2: "#16181c", nodeBorder: "#0b0c0e",
  border: "#20242a", border2: "#17191e",
  accent: "#3d9bff", accentHi: "#57a9ff",
  txt: "#e7eaee", txt2: "#9aa2ac", txt3: "#656d78", txtDim: "#454c55", body: "#c4cad2",
  // families
  resource: "#a06bff", scalar: "#7ed957", vector: "#f0b429", matrix: "#2dd4bf",
  // categories
  source: "#4bbf89", process: "#3d9bff", output: "#e05c93", value: "#d4a53c", group: "#77828f",
  success: "#34d399",
};
const MONO = "'JetBrains Mono', monospace";
const SANS = "'IBM Plex Sans', system-ui, sans-serif";

// ── geometry (absolute, within 1920×1080) ────────────────────────────
const TOOLBAR_H = 52, HEAD_H = 34, STATUS_H = 34;
const EDIT_X = 0, EDIT_W = 1180;          // node editor panel
const VP_X = 1180, VP_W = 740;            // viewport panel
const CONTENT_TOP = TOOLBAR_H + HEAD_H;   // 86

// port centers (screen coords)
const P = {
  webcamOut: { x: 266, y: 301.5, dir: "out", fam: C.resource },
  fresnelIn: { x: 400, y: 375.5, dir: "in",  fam: C.resource },
  fresnelOut:{ x: 620, y: 405.5, dir: "out", fam: C.vector },
  bloomIn:   { x: 830, y: 231.5, dir: "in",  fam: C.vector, compat: true },
  outputIn:  { x: 830, y: 491.5, dir: "in",  fam: C.vector, compat: true, target: true },
  mathIn:    { x: 430, y: 661.5, dir: "in",  fam: C.scalar, incompat: true },
};

const SHADER_BG =
  "radial-gradient(circle at 42% 34%, #cfe3ff 0%, #6fb3ff 12%, #3d9bff 22%, #2b6fe0 34%, #17407e 46%, transparent 58%), " +
  "radial-gradient(circle at 50% 46%, #0f2648 0%, #0a1526 55%, #06090f 100%)";

// ── helpers ──────────────────────────────────────────────────────────
const ramp = (t, a, b) => clamp((t - a) / (b - a), 0, 1);
function edgePath(x1, y1, x2, y2) {
  const c = Math.max(46, Math.abs(x2 - x1) * 0.5);
  return `M${x1} ${y1} C ${x1 + c} ${y1}, ${x2 - c} ${y2}, ${x2} ${y2}`;
}

// ── small building blocks ────────────────────────────────────────────
function NodeCard({ left, top, w, headerTint, icon, iconColor, iconBg, iconBorder, title, meta, glow, dim, children }) {
  return (
    <div style={{
      position: "absolute", left, top, width: w,
      background: "linear-gradient(180deg,#1e2126,#16181c)",
      border: "1px solid " + C.nodeBorder, borderRadius: 11,
      boxShadow: glow || "0 8px 22px rgba(0,0,0,0.55)",
      opacity: dim, transition: "none",
    }}>
      <div style={{
        display: "flex", alignItems: "center", gap: 7, padding: "8px 12px",
        borderBottom: "1px solid " + C.nodeBorder, background: headerTint,
        borderRadius: "10px 10px 0 0",
      }}>
        <div style={{
          width: 16, height: 16, borderRadius: 5, background: iconBg,
          border: "1px solid " + iconBorder, display: "flex", alignItems: "center",
          justifyContent: "center", fontSize: 11, color: iconColor,
        }}>{icon}</div>
        <div style={{ fontSize: 12, fontWeight: 600, color: "#fff" }}>{title}</div>
        {meta && <div style={{ marginLeft: "auto" }}>{meta}</div>}
      </div>
      {children}
    </div>
  );
}

function Port({ p, highlight, dimAmt, pulse }) {
  const size = 13;
  const base = {
    position: "absolute", left: p.x - size / 2, top: p.y - size / 2,
    width: size, height: size, borderRadius: "50%", boxSizing: "border-box",
    opacity: dimAmt,
  };
  const glow = highlight
    ? `0 0 0 2px ${p.fam}, 0 0 14px ${p.fam}`
    : (p.dir === "out" ? `0 0 8px ${p.fam}aa` : "none");
  const style = p.dir === "out"
    ? { ...base, background: p.fam, border: "2px solid #16181c", boxShadow: glow }
    : { ...base, border: `2.5px solid ${p.fam}`, background: "#16181c", boxShadow: highlight ? glow : "none" };
  return (
    <React.Fragment>
      {highlight && (
        <div style={{
          position: "absolute", left: p.x - 15, top: p.y - 15, width: 30, height: 30,
          borderRadius: "50%", border: `2px solid ${p.fam}`,
          transform: `scale(${pulse.s})`, opacity: pulse.o, pointerEvents: "none",
        }} />
      )}
      <div style={style} />
    </React.Fragment>
  );
}

// ── the choreography ─────────────────────────────────────────────────
function Choreo() {
  const t = useTime();

  // cursor path
  const cx = interpolate([0, 0.3, 1.4, 1.9, 2.7, 3.55, 8.5],
    [700, 700, 620, 620, 735, 830, 830], Easing.easeInOutCubic)(t);
  const cy = interpolate([0, 0.3, 1.4, 1.9, 2.7, 3.55, 8.5],
    [706, 706, 405.5, 405.5, 392, 491.5, 491.5], Easing.easeInOutCubic)(t);

  const grabbing = t >= 1.55 && t < 3.55;
  const dragging = t >= 1.9 && t < 3.55;
  const fanout = t >= 1.72 && t < 4.05;
  const connected = t >= 3.55;
  const fanoutStrength = Math.min(ramp(t, 1.72, 1.95), 1 - ramp(t, 3.75, 4.05));

  // pulsing ring for compatible ports
  const pulseT = (t * 1.7) % 1;
  const pulse = { s: 1 + pulseT * 0.5, o: (1 - pulseT) * 0.85 * fanoutStrength };

  // incompatible dim
  const mathDim = 1 - 0.62 * fanoutStrength;
  // fresnel grab glow
  const fresnelGlow = grabbing || dragging
    ? "0 12px 30px rgba(0,0,0,0.6), 0 0 0 1.5px rgba(61,155,255,0.85), 0 0 22px rgba(61,155,255,0.5)"
    : "0 12px 30px rgba(0,0,0,0.6), 0 0 0 1.5px rgba(61,155,255,0.6), 0 0 14px rgba(61,155,255,0.32)";

  // snap ring
  const snapP = ramp(t, 3.55, 4.15);
  const snapRing = t >= 3.55 && t < 4.2;

  // viewport crossfade
  const emptyOp = 1 - ramp(t, 3.85, 4.55);
  const resultOp = ramp(t, 4.25, 5.5);
  const resultScale = interpolate([4.25, 5.6], [0.93, 1], Easing.easeOutCubic)(t);
  const breath = 1 + Math.sin(t * 1.3) * 0.008;
  const flashOp = Math.max(0, ramp(t, 3.9, 4.35) - ramp(t, 4.35, 5.1)) * 0.55;
  const drift = (t * 5) % 360;

  // energy pulse traveling the freshly-connected edge into the viewport
  const pulseTravel = ramp(t, 3.7, 4.6);

  // connected-edge endpoint (draw to cursor while dragging, else to target)
  const ex = dragging ? cx : P.outputIn.x;
  const ey = dragging ? cy : P.outputIn.y;

  // captions
  const caps = [
    [0.55, 1.85, "Grab the shader's output port"],
    [2.0, 3.5, "Compatible inputs light up — mismatches dim"],
    [3.6, 4.7, "Release — the edge snaps into the input"],
    [4.85, 8.2, "Viewport renders the graph live"],
  ];

  // waveform + preview subtle motion
  const camShift = 40 + Math.sin(t * 0.8) * 30;

  return (
    <div style={{ position: "absolute", inset: 0, background: C.appDark, fontFamily: SANS }}>

      {/* ══ TOOLBAR ══ */}
      <div style={{
        position: "absolute", left: 0, top: 0, width: 1920, height: TOOLBAR_H,
        display: "flex", alignItems: "center", gap: 14, padding: "0 18px",
        background: C.panel, borderBottom: "1px solid " + C.border, boxSizing: "border-box",
      }}>
        <div style={{ width: 22, height: 22, borderRadius: 6, background: C.accent, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 13, fontWeight: 700 }}>◆</div>
        <span style={{ fontSize: 13, fontWeight: 600, color: C.txt }}>ShaderPlayground</span>
        <span style={{ fontSize: 12, color: C.txt3 }}>untitled-patch</span>
        <div style={{ flex: 1 }} />
        <div style={{ display: "flex", gap: 7, fontFamily: MONO, fontSize: 11 }}>
          <span style={{ color: C.txt3 }}>WebGL2</span>
          <span style={{ color: C.success }}>● 60 fps</span>
        </div>
      </div>

      {/* ══ DOCKING HEADERS ══ */}
      {[{ x: EDIT_X, w: EDIT_W, label: "NODE EDITOR", meta: "5 nodes · 1 edge" },
        { x: VP_X, w: VP_W, label: "VIEWPORT", meta: connected ? "1 output" : "no output" }].map((h, i) => (
        <div key={i} style={{
          position: "absolute", left: h.x, top: TOOLBAR_H, width: h.w, height: HEAD_H,
          display: "flex", alignItems: "center", gap: 9, padding: "0 14px",
          background: C.header, borderBottom: "1px solid " + C.border2,
          borderLeft: i === 1 ? "1px solid " + C.border2 : "none", boxSizing: "border-box",
        }}>
          <span style={{ color: C.txt3, fontSize: 13, letterSpacing: 2 }}>⣿</span>
          <span style={{ fontSize: 10.5, fontWeight: 600, letterSpacing: 0.9, color: C.txt2 }}>{h.label}</span>
          <span style={{ fontFamily: MONO, fontSize: 9.5, color: C.txt3, background: "#191c21", border: "1px solid " + C.border, borderRadius: 5, padding: "1px 7px" }}>{h.meta}</span>
          <div style={{ flex: 1 }} />
          <span style={{ color: C.txt3, fontSize: 12 }}>⤢</span>
          <span style={{ color: C.txt3, fontSize: 12 }}>⌄</span>
        </div>
      ))}

      {/* ══ NODE EDITOR CANVAS ══ */}
      <div style={{
        position: "absolute", left: EDIT_X, top: CONTENT_TOP, width: EDIT_W, height: 1080 - CONTENT_TOP - STATUS_H,
        background: C.app,
        backgroundImage: "radial-gradient(rgba(255,255,255,0.045) 1px, transparent 1px)",
        backgroundSize: "24px 24px", overflow: "hidden",
      }} />

      {/* edges + effects (svg spans whole frame) */}
      <svg viewBox="0 0 1920 1080" style={{ position: "absolute", left: 0, top: 0, width: 1920, height: 1080, pointerEvents: "none", overflow: "visible" }}>
        {/* existing solid edge: webcam -> fresnel (resource) */}
        <path d={edgePath(P.webcamOut.x, P.webcamOut.y, P.fresnelIn.x, P.fresnelIn.y)} stroke={C.resource} strokeWidth="2.5" fill="none" />
        {/* the edge being created */}
        {(dragging || connected) && (
          <path d={edgePath(P.fresnelOut.x, P.fresnelOut.y, ex, ey)}
            stroke={C.vector} strokeWidth="2.6" fill="none"
            strokeDasharray={dragging ? "7 7" : "none"}
            style={dragging ? { animation: "ncDash 0.6s linear infinite" } : {}}
            opacity={dragging ? 0.92 : 1} />
        )}
        {/* energy pulse dot traveling the connected edge */}
        {connected && pulseTravel < 1 && (() => {
          const px = P.fresnelOut.x + (P.outputIn.x - P.fresnelOut.x) * pulseTravel;
          const py = P.fresnelOut.y + (P.outputIn.y - P.fresnelOut.y) * pulseTravel;
          return <circle cx={px} cy={py} r="5" fill="#fff" opacity={(1 - pulseTravel) * 0.9} />;
        })()}
      </svg>

      {/* ══ NODES ══ */}
      {/* Webcam (source) */}
      <NodeCard left={70} top={250} w={196}
        headerTint="linear-gradient(180deg,rgba(75,191,137,0.22),rgba(75,191,137,0.08))"
        icon="◉" iconColor="#6fd6a3" iconBg="rgba(75,191,137,0.2)" iconBorder={C.source}
        title="Webcam" dim={1}
        meta={<span style={{ fontFamily: MONO, fontSize: 8.5, color: C.txt3 }}>1280×720</span>}>
        <div style={{ padding: 8 }}>
          <div style={{ height: 58, borderRadius: 6, overflow: "hidden", border: "1px solid " + C.nodeBorder,
            background: `radial-gradient(circle at ${camShift}% 45%, #3a4a5c 0%, #202a36 55%, #12181f 100%)` }}>
            <div style={{ width: "100%", height: "100%", background: "repeating-linear-gradient(0deg,rgba(0,0,0,0.15) 0 1px,transparent 1px 3px)" }} />
          </div>
        </div>
      </NodeCard>

      {/* Fresnel (shader, selected, drag source) */}
      <NodeCard left={400} top={300} w={220}
        headerTint="linear-gradient(180deg,rgba(61,155,255,0.3),rgba(61,155,255,0.12))"
        icon="◆" iconColor="#7dbcff" iconBg="rgba(61,155,255,0.25)" iconBorder={C.accent}
        title="Fresnel" glow={fresnelGlow} dim={1}
        meta={<span style={{ fontFamily: MONO, fontSize: 9, color: "#f4d774", background: "rgba(0,0,0,0.5)", border: "1px solid rgba(244,215,116,0.35)", borderRadius: 5, padding: "1px 5px" }}>0.31ms</span>}>
        <div style={{ padding: 10 }}>
          <div style={{ width: "100%", height: 96, borderRadius: 7,
            background: "radial-gradient(circle at 42% 34%,#8fc7ff 0%,#3d9bff 34%,#1a3d7a 68%,#0a1730 100%)",
            border: "1px solid " + C.nodeBorder, boxShadow: "inset 0 1px 4px rgba(0,0,0,0.5)", position: "relative", overflow: "hidden" }}>
            <div style={{ position: "absolute", inset: 0, background: "radial-gradient(circle at 42% 34%,transparent 42%,rgba(125,188,255,0.42) 72%,transparent 74%)" }} />
          </div>
        </div>
      </NodeCard>

      {/* Bloom (process) — compatible highlight */}
      <NodeCard left={830} top={180} w={186}
        headerTint="linear-gradient(180deg,rgba(61,155,255,0.3),rgba(61,155,255,0.12))"
        icon="✦" iconColor="#7dbcff" iconBg="rgba(61,155,255,0.25)" iconBorder={C.accent}
        title="Bloom" dim={1}>
        <div style={{ padding: "9px 12px", display: "flex", justifyContent: "space-between" }}>
          <span style={{ fontFamily: MONO, fontSize: 10.5, color: C.txt2 }}>threshold 0.8</span>
          <span style={{ fontFamily: MONO, fontSize: 8.5, color: C.vector }}>vec4</span>
        </div>
      </NodeCard>

      {/* Output (snap target) */}
      <NodeCard left={830} top={440} w={186}
        headerTint="linear-gradient(180deg,rgba(224,92,147,0.24),rgba(224,92,147,0.08))"
        icon="◎" iconColor="#ee7fac" iconBg="rgba(224,92,147,0.2)" iconBorder={C.output}
        title="Output" dim={1}
        glow={connected ? "0 8px 22px rgba(0,0,0,0.55), 0 0 0 1.5px rgba(224,92,147,0.5), 0 0 18px rgba(224,92,147,0.3)" : "0 8px 22px rgba(0,0,0,0.55)"}
        meta={<span style={{ fontFamily: MONO, fontSize: 8, color: C.txt3 }}>A · 1/4</span>}>
        <div style={{ padding: "9px 12px", display: "flex", alignItems: "center", gap: 8 }}>
          {connected
            ? <React.Fragment><span style={{ width: 7, height: 7, borderRadius: "50%", background: C.success, boxShadow: "0 0 8px " + C.success }} /><span style={{ fontFamily: MONO, fontSize: 10.5, color: C.body }}>live → viewport A</span></React.Fragment>
            : <span style={{ fontFamily: MONO, fontSize: 10.5, color: C.txt3 }}>→ awaiting input</span>}
        </div>
      </NodeCard>

      {/* Math (value) — incompatible, dims */}
      <NodeCard left={430} top={610} w={186}
        headerTint="linear-gradient(180deg,rgba(212,165,60,0.22),rgba(212,165,60,0.08))"
        icon="∑" iconColor="#e2ba57" iconBg="rgba(212,165,60,0.2)" iconBorder={C.value}
        title="Math" dim={mathDim}>
        <div style={{ padding: "9px 12px", display: "flex", justifyContent: "space-between" }}>
          <span style={{ fontFamily: MONO, fontSize: 10.5, color: C.txt2 }}>sin(t)·0.5</span>
          <span style={{ fontFamily: MONO, fontSize: 8.5, color: C.scalar }}>float</span>
        </div>
      </NodeCard>

      {/* ══ PORTS layer ══ */}
      <Port p={P.webcamOut} highlight={false} dimAmt={1} pulse={pulse} />
      <Port p={P.fresnelIn} highlight={false} dimAmt={1} pulse={pulse} />
      <Port p={P.fresnelOut} highlight={grabbing || dragging} dimAmt={1} pulse={pulse} />
      <Port p={P.bloomIn} highlight={fanout} dimAmt={1} pulse={pulse} />
      <Port p={P.outputIn} highlight={fanout || connected} dimAmt={1} pulse={pulse} />
      <Port p={P.mathIn} highlight={false} dimAmt={mathDim} pulse={pulse} />

      {/* snap ring at the target input */}
      {snapRing && (
        <div style={{
          position: "absolute", left: P.outputIn.x - 16, top: P.outputIn.y - 16, width: 32, height: 32,
          borderRadius: "50%", border: "2.5px solid " + C.vector,
          transform: `scale(${1 + snapP * 1.6})`, opacity: (1 - snapP) * 0.9, pointerEvents: "none",
        }} />
      )}

      {/* ══ VIEWPORT RENDER AREA ══ */}
      <div style={{
        position: "absolute", left: VP_X, top: CONTENT_TOP, width: VP_W, height: 1080 - CONTENT_TOP - STATUS_H,
        background: "#0b0c0e", overflow: "hidden", borderLeft: "1px solid " + C.border2,
      }}>
        {/* empty state */}
        <div style={{
          position: "absolute", inset: 0, display: "flex", flexDirection: "column",
          alignItems: "center", justifyContent: "center", gap: 20, opacity: emptyOp,
          background: "radial-gradient(circle at 50% 40%,#0f1218 0%,#0a0b0e 70%)",
        }}>
          <div style={{ width: 64, height: 64, borderRadius: 16, background: C.panel, border: "1px solid " + C.border, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 26, color: C.txtDim }}>◵</div>
          <div style={{ textAlign: "center", maxWidth: 340 }}>
            <div style={{ fontSize: 15, fontWeight: 600, color: C.body, marginBottom: 6 }}>No Output connected</div>
            <div style={{ fontSize: 12.5, lineHeight: 1.6, color: C.txt3 }}>Wire a shader into an <span style={{ color: C.txt2 }}>Output</span> node to see the render here.</div>
          </div>
        </div>

        {/* live render */}
        <div style={{ position: "absolute", inset: 0, opacity: resultOp }}>
          <div style={{ position: "absolute", inset: 0, background: SHADER_BG, transform: `scale(${resultScale * breath})` }} />
          {/* drifting energy layer */}
          <div style={{ position: "absolute", inset: "-20%", opacity: 0.22,
            background: "conic-gradient(from 0deg at 50% 50%, transparent, rgba(125,188,255,0.5), transparent 40%)",
            transform: `rotate(${drift}deg)` }} />
          {/* fresnel rim */}
          <div style={{ position: "absolute", inset: 0, background: "radial-gradient(circle at 42% 34%,transparent 40%,rgba(125,188,255,0.4) 70%,transparent 73%)", transform: `scale(${resultScale})` }} />
          {/* scanlines */}
          <div style={{ position: "absolute", inset: 0, backgroundImage: "repeating-linear-gradient(0deg,rgba(0,0,0,0.14) 0 1px,transparent 1px 3px)", opacity: 0.5 }} />
          {/* pane chrome */}
          <div style={{ position: "absolute", left: 16, top: 14, display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontFamily: MONO, fontSize: 12, fontWeight: 600, color: "#fff", background: "rgba(11,12,14,0.7)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 6, width: 24, height: 24, display: "flex", alignItems: "center", justifyContent: "center", backdropFilter: "blur(4px)" }}>A</span>
            <span style={{ fontFamily: MONO, fontSize: 11, color: "rgba(231,234,238,0.85)", textShadow: "0 1px 3px rgba(0,0,0,0.6)" }}>Fresnel → Output</span>
          </div>
          <span style={{ position: "absolute", right: 14, top: 16, fontFamily: MONO, fontSize: 11, color: C.success, background: "rgba(11,12,14,0.72)", border: "1px solid rgba(52,211,153,0.35)", borderRadius: 6, padding: "3px 8px", backdropFilter: "blur(4px)" }}>0.31 ms</span>
          <span style={{ position: "absolute", left: 16, bottom: 14, fontFamily: MONO, fontSize: 10, color: "rgba(154,162,172,0.85)", textShadow: "0 1px 3px rgba(0,0,0,0.6)" }}>960 × 540</span>
        </div>

        {/* connect flash */}
        <div style={{ position: "absolute", inset: 0, background: "radial-gradient(circle at 42% 42%, rgba(125,188,255,0.9), transparent 60%)", opacity: flashOp, pointerEvents: "none" }} />
      </div>

      {/* ══ STATUS BAR ══ */}
      <div style={{
        position: "absolute", left: 0, bottom: 0, width: 1920, height: STATUS_H,
        display: "flex", alignItems: "center", gap: 18, padding: "0 16px",
        background: C.header, borderTop: "1px solid " + C.border, fontFamily: MONO, fontSize: 11, color: C.txt3, boxSizing: "border-box",
      }}>
        <span style={{ color: connected ? C.success : C.txt3 }}>{connected ? "● compiled" : "○ idle"}</span>
        <span>5 nodes</span>
        <span>{connected ? "2 edges" : "1 edge"}</span>
        <div style={{ flex: 1 }} />
        <span>GPU 0.31ms</span>
        <span style={{ color: C.txt2 }}>u_time {(t).toFixed(2)}s</span>
      </div>

      {/* ══ CAPTIONS ══ */}
      {caps.map(([a, b, text], i) => {
        const op = Math.max(0, Math.min(ramp(t, a, a + 0.3), 1 - ramp(t, b - 0.3, b)));
        if (op <= 0.001) return null;
        return (
          <div key={i} style={{
            position: "absolute", left: 40, bottom: 60, opacity: op,
            display: "flex", alignItems: "center", gap: 10, padding: "9px 15px",
            background: "rgba(16,18,22,0.92)", border: "1px solid " + C.border, borderRadius: 10,
            backdropFilter: "blur(8px)", boxShadow: "0 10px 28px rgba(0,0,0,0.5)",
          }}>
            <span style={{ width: 7, height: 7, borderRadius: "50%", background: C.accent, boxShadow: "0 0 8px " + C.accent }} />
            <span style={{ fontFamily: MONO, fontSize: 13, color: C.body }}>{text}</span>
          </div>
        );
      })}

      {/* ══ CURSOR ══ */}
      <div style={{ position: "absolute", left: cx, top: cy, transform: `scale(${grabbing ? 0.88 : 1})`, transformOrigin: "0 0", pointerEvents: "none", zIndex: 50 }}>
        <svg width="26" height="30" viewBox="0 0 26 30" style={{ filter: "drop-shadow(0 2px 4px rgba(0,0,0,0.6))" }}>
          <path d="M2 2 L2 22 L7.5 16.5 L11.5 25 L15 23.4 L11 15 L19 15 Z" fill="#fff" stroke="#0b0c0e" strokeWidth="1.4" strokeLinejoin="round" />
        </svg>
        {dragging && (
          <div style={{ position: "absolute", left: 20, top: 16, whiteSpace: "nowrap",
            fontFamily: MONO, fontSize: 10.5, color: C.vector, background: "rgba(11,12,14,0.88)",
            border: "1px solid rgba(240,180,41,0.45)", borderRadius: 6, padding: "3px 8px" }}>
            <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: "50%", background: C.vector, marginRight: 6, verticalAlign: "middle" }} />vec4
          </div>
        )}
      </div>
    </div>
  );
}

function NodeConnectScene() {
  const { Stage } = window;
  return (
    <Stage width={1920} height={1080} duration={8.5} background="#08090b">
      <Choreo />
    </Stage>
  );
}

window.NodeConnectScene = NodeConnectScene;

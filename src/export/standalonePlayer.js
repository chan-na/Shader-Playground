// Standalone Shader Playground player — single-file vanilla JS runtime that
// renders a serialized project against a canvas. Inlined verbatim into the
// HTML produced by the "Export HTML" command. Keep this file dependency-free.
//
// Expected globals at runtime:
//   window.__SP_PROJECT   — { format, version, graph: { nodes, edges }, positions }
//   document.getElementById('canvas')  — target canvas

(() => {
  // ── minimal mat4 (right-handed, column-major Float32Array of length 16) ────
  function mat4Identity(out) {
    for (var i = 0; i < 16; i++) out[i] = 0;
    out[0] = out[5] = out[10] = out[15] = 1;
    return out;
  }
  function mat4Perspective(out, fovy, aspect, near, far) {
    var f = 1 / Math.tan(fovy / 2);
    var nf = 1 / (near - far);
    out[0] = f / aspect;
    out[1] = 0;
    out[2] = 0;
    out[3] = 0;
    out[4] = 0;
    out[5] = f;
    out[6] = 0;
    out[7] = 0;
    out[8] = 0;
    out[9] = 0;
    out[10] = (far + near) * nf;
    out[11] = -1;
    out[12] = 0;
    out[13] = 0;
    out[14] = 2 * far * near * nf;
    out[15] = 0;
    return out;
  }
  function mat4LookAt(out, eye, target, up) {
    var x0, x1, x2, y0, y1, y2, z0, z1, z2, len;
    var ex = eye[0],
      ey = eye[1],
      ez = eye[2];
    var ux = up[0],
      uy = up[1],
      uz = up[2];
    var tx = target[0],
      ty = target[1],
      tz = target[2];
    z0 = ex - tx;
    z1 = ey - ty;
    z2 = ez - tz;
    len = 1 / Math.hypot(z0, z1, z2);
    z0 *= len;
    z1 *= len;
    z2 *= len;
    x0 = uy * z2 - uz * z1;
    x1 = uz * z0 - ux * z2;
    x2 = ux * z1 - uy * z0;
    len = Math.hypot(x0, x1, x2);
    if (!len) {
      x0 = 0;
      x1 = 0;
      x2 = 0;
    } else {
      len = 1 / len;
      x0 *= len;
      x1 *= len;
      x2 *= len;
    }
    y0 = z1 * x2 - z2 * x1;
    y1 = z2 * x0 - z0 * x2;
    y2 = z0 * x1 - z1 * x0;
    out[0] = x0;
    out[1] = y0;
    out[2] = z0;
    out[3] = 0;
    out[4] = x1;
    out[5] = y1;
    out[6] = z1;
    out[7] = 0;
    out[8] = x2;
    out[9] = y2;
    out[10] = z2;
    out[11] = 0;
    out[12] = -(x0 * ex + x1 * ey + x2 * ez);
    out[13] = -(y0 * ex + y1 * ey + y2 * ez);
    out[14] = -(z0 * ex + z1 * ey + z2 * ez);
    out[15] = 1;
    return out;
  }

  // ── primitives (cube/sphere/plane/torus/quad) ─────────────────────────────
  function makeQuad() {
    return {
      attributes: [
        {
          name: "a_position",
          size: 3,
          data: new Float32Array([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0]),
        },
        {
          name: "a_uv",
          size: 2,
          data: new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]),
        },
        {
          name: "a_normal",
          size: 3,
          data: new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1]),
        },
      ],
      indices: new Uint16Array([0, 1, 2, 0, 2, 3]),
      vertexCount: 4,
    };
  }
  function makePlane() {
    return {
      attributes: [
        {
          name: "a_position",
          size: 3,
          data: new Float32Array([-1, 0, -1, 1, 0, -1, 1, 0, 1, -1, 0, 1]),
        },
        {
          name: "a_uv",
          size: 2,
          data: new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]),
        },
        {
          name: "a_normal",
          size: 3,
          data: new Float32Array([0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0]),
        },
      ],
      indices: new Uint16Array([0, 1, 2, 0, 2, 3]),
      vertexCount: 4,
    };
  }
  function makeCube() {
    var faces = [
      // +X, -X, +Y, -Y, +Z, -Z
      { n: [1, 0, 0], u: [0, 0, -1], v: [0, 1, 0] },
      { n: [-1, 0, 0], u: [0, 0, 1], v: [0, 1, 0] },
      { n: [0, 1, 0], u: [1, 0, 0], v: [0, 0, 1] },
      { n: [0, -1, 0], u: [1, 0, 0], v: [0, 0, -1] },
      { n: [0, 0, 1], u: [1, 0, 0], v: [0, 1, 0] },
      { n: [0, 0, -1], u: [-1, 0, 0], v: [0, 1, 0] },
    ];
    var positions = [],
      normals = [],
      uvs = [],
      idx = [];
    for (var f = 0; f < 6; f++) {
      var face = faces[f];
      var n = face.n,
        u = face.u,
        v = face.v;
      var c = [n[0], n[1], n[2]];
      var corners = [
        [c[0] - u[0] - v[0], c[1] - u[1] - v[1], c[2] - u[2] - v[2]],
        [c[0] + u[0] - v[0], c[1] + u[1] - v[1], c[2] + u[2] - v[2]],
        [c[0] + u[0] + v[0], c[1] + u[1] + v[1], c[2] + u[2] + v[2]],
        [c[0] - u[0] + v[0], c[1] - u[1] + v[1], c[2] - u[2] + v[2]],
      ];
      var baseV = positions.length / 3;
      for (var i = 0; i < 4; i++) {
        positions.push(corners[i][0], corners[i][1], corners[i][2]);
        normals.push(n[0], n[1], n[2]);
      }
      uvs.push(0, 0, 1, 0, 1, 1, 0, 1);
      idx.push(baseV, baseV + 1, baseV + 2, baseV, baseV + 2, baseV + 3);
    }
    return {
      attributes: [
        { name: "a_position", size: 3, data: new Float32Array(positions) },
        { name: "a_uv", size: 2, data: new Float32Array(uvs) },
        { name: "a_normal", size: 3, data: new Float32Array(normals) },
      ],
      indices: new Uint16Array(idx),
      vertexCount: positions.length / 3,
    };
  }
  function makeSphere(segs, rings) {
    segs = segs || 32;
    rings = rings || 16;
    var positions = [],
      normals = [],
      uvs = [],
      idx = [];
    for (var r = 0; r <= rings; r++) {
      var phi = Math.PI * (r / rings);
      var sp = Math.sin(phi),
        cp = Math.cos(phi);
      for (var s = 0; s <= segs; s++) {
        var theta = 2 * Math.PI * (s / segs);
        var st = Math.sin(theta),
          ct = Math.cos(theta);
        var x = sp * ct,
          y = cp,
          z = sp * st;
        positions.push(x, y, z);
        normals.push(x, y, z);
        uvs.push(s / segs, 1 - r / rings);
      }
    }
    var stride = segs + 1;
    for (var r2 = 0; r2 < rings; r2++) {
      for (var s2 = 0; s2 < segs; s2++) {
        var a = r2 * stride + s2;
        var b = a + 1;
        var c = a + stride;
        var d = c + 1;
        idx.push(a, c, b, b, c, d);
      }
    }
    return {
      attributes: [
        { name: "a_position", size: 3, data: new Float32Array(positions) },
        { name: "a_uv", size: 2, data: new Float32Array(uvs) },
        { name: "a_normal", size: 3, data: new Float32Array(normals) },
      ],
      indices: new Uint16Array(idx),
      vertexCount: positions.length / 3,
    };
  }
  function makeTorus(R, r, segs, rings) {
    R = R || 1;
    r = r || 0.4;
    segs = segs || 32;
    rings = rings || 16;
    var positions = [],
      normals = [],
      uvs = [],
      idx = [];
    for (var u = 0; u <= segs; u++) {
      var pu = 2 * Math.PI * (u / segs);
      var cu = Math.cos(pu),
        su = Math.sin(pu);
      for (var v = 0; v <= rings; v++) {
        var pv = 2 * Math.PI * (v / rings);
        var cv = Math.cos(pv),
          sv = Math.sin(pv);
        var x = (R + r * cv) * cu;
        var y = r * sv;
        var z = (R + r * cv) * su;
        positions.push(x, y, z);
        normals.push(cv * cu, sv, cv * su);
        uvs.push(u / segs, v / rings);
      }
    }
    var stride = rings + 1;
    for (var u2 = 0; u2 < segs; u2++) {
      for (var v2 = 0; v2 < rings; v2++) {
        var a = u2 * stride + v2;
        var b = a + 1;
        var c = a + stride;
        var d = c + 1;
        idx.push(a, c, b, b, c, d);
      }
    }
    return {
      attributes: [
        { name: "a_position", size: 3, data: new Float32Array(positions) },
        { name: "a_uv", size: 2, data: new Float32Array(uvs) },
        { name: "a_normal", size: 3, data: new Float32Array(normals) },
      ],
      indices: new Uint16Array(idx),
      vertexCount: positions.length / 3,
    };
  }
  function makePrimitive(name) {
    if (name === "cube") return makeCube();
    if (name === "sphere") return makeSphere();
    if (name === "plane") return makePlane();
    if (name === "torus") return makeTorus();
    return makeQuad();
  }

  // ── GL helpers ────────────────────────────────────────────────────────────
  function compileShader(gl, type, src) {
    var s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      console.error("Shader compile error:", gl.getShaderInfoLog(s), "\n", src);
      gl.deleteShader(s);
      return null;
    }
    return s;
  }
  function createProgram(gl, vs, fs) {
    var v = compileShader(gl, gl.VERTEX_SHADER, vs);
    var f = compileShader(gl, gl.FRAGMENT_SHADER, fs);
    if (!v || !f) return null;
    var p = gl.createProgram();
    gl.attachShader(p, v);
    gl.attachShader(p, f);
    gl.linkProgram(p);
    gl.deleteShader(v);
    gl.deleteShader(f);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
      console.error("Program link error:", gl.getProgramInfoLog(p));
      gl.deleteProgram(p);
      return null;
    }
    var attribs = {};
    var na = gl.getProgramParameter(p, gl.ACTIVE_ATTRIBUTES);
    for (var i = 0; i < na; i++) {
      var info = gl.getActiveAttrib(p, i);
      if (info) attribs[info.name] = gl.getAttribLocation(p, info.name);
    }
    var unis = {};
    var nu = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
    for (var j = 0; j < nu; j++) {
      var ui = gl.getActiveUniform(p, j);
      if (ui)
        unis[ui.name.replace(/\[\d+\]$/, "")] = gl.getUniformLocation(
          p,
          ui.name,
        );
    }
    return { program: p, attributes: attribs, uniforms: unis };
  }

  function uploadMesh(gl, data, attribLocs) {
    var vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    var vbos = [];
    data.attributes.forEach((a) => {
      var loc = attribLocs[a.name];
      if (loc === undefined || loc < 0) return;
      var b = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, b);
      gl.bufferData(gl.ARRAY_BUFFER, a.data, gl.STATIC_DRAW);
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, a.size, gl.FLOAT, false, 0, 0);
      vbos.push(b);
    });
    var ibo = null,
      indexCount = 0;
    if (data.indices) {
      ibo = gl.createBuffer();
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo);
      gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, data.indices, gl.STATIC_DRAW);
      indexCount = data.indices.length;
    }
    gl.bindVertexArray(null);
    return {
      vao: vao,
      ibo: ibo,
      indexCount: indexCount,
      vertexCount: data.vertexCount,
    };
  }

  function createFBO(gl, w, h) {
    var tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA,
      w,
      h,
      0,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      null,
    );
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    var depth = gl.createRenderbuffer();
    gl.bindRenderbuffer(gl.RENDERBUFFER, depth);
    gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT16, w, h);
    var fbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(
      gl.FRAMEBUFFER,
      gl.COLOR_ATTACHMENT0,
      gl.TEXTURE_2D,
      tex,
      0,
    );
    gl.framebufferRenderbuffer(
      gl.FRAMEBUFFER,
      gl.DEPTH_ATTACHMENT,
      gl.RENDERBUFFER,
      depth,
    );
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return { fbo: fbo, tex: tex, depth: depth, w: w, h: h };
  }

  // ── built-in shaders ─────────────────────────────────────────────────────
  var FULLSCREEN_VERT =
    "#version 300 es\n" +
    "in vec2 a_position;\n" +
    "in vec2 a_uv;\n" +
    "out vec2 v_uv;\n" +
    "void main(){ v_uv = a_uv; gl_Position = vec4(a_position, 0.0, 1.0); }\n";

  var BLIT_VERT = FULLSCREEN_VERT;
  var BLIT_FRAG =
    "#version 300 es\n" +
    "precision highp float;\n" +
    "in vec2 v_uv;\n" +
    "uniform sampler2D u_tex;\n" +
    "out vec4 outColor;\n" +
    "void main(){ outColor = texture(u_tex, v_uv); }\n";

  // ── topological order ────────────────────────────────────────────────────
  function topoOrder(nodes, edges) {
    var indeg = {},
      byId = {};
    nodes.forEach((n) => {
      indeg[n.id] = 0;
      byId[n.id] = n;
    });
    edges.forEach((e) => {
      if (e.target in indeg) indeg[e.target]++;
    });
    var q = Object.keys(indeg).filter((k) => indeg[k] === 0);
    var out = [];
    while (q.length) {
      var id = q.shift();
      out.push(byId[id]);
      edges.forEach((e) => {
        if (e.source === id) {
          indeg[e.target]--;
          if (indeg[e.target] === 0) q.push(e.target);
        }
      });
    }
    return out;
  }

  // ── splitLayout (mirrors src/core/graph/execute.ts) ──────────────────────
  function splitLayout(n, W, H) {
    if (n <= 1) return [{ x: 0, y: 0, w: W, h: H }];
    if (n === 2) {
      var w = Math.floor(W / 2);
      return [
        { x: 0, y: 0, w: w, h: H },
        { x: w, y: 0, w: W - w, h: H },
      ];
    }
    if (n === 3) {
      var hh = Math.floor(H / 2),
        ww = Math.floor(W / 2);
      return [
        { x: 0, y: hh, w: ww, h: H - hh },
        { x: ww, y: hh, w: W - ww, h: H - hh },
        { x: 0, y: 0, w: W, h: hh },
      ];
    }
    var ww2 = Math.floor(W / 2),
      hh2 = Math.floor(H / 2);
    return [
      { x: 0, y: hh2, w: ww2, h: H - hh2 },
      { x: ww2, y: hh2, w: W - ww2, h: H - hh2 },
      { x: 0, y: 0, w: ww2, h: hh2 },
      { x: ww2, y: 0, w: W - ww2, h: hh2 },
    ].slice(0, Math.min(n, 4));
  }

  // ── main ────────────────────────────────────────────────────────────────
  var project = window.__SP_PROJECT;
  if (!project) {
    document.body.innerHTML =
      '<div style="color:white;font-family:sans-serif;padding:24px">No project data.</div>';
    return;
  }
  var canvas = document.getElementById("canvas");
  if (!canvas) {
    console.error("No #canvas element.");
    return;
  }
  var gl = canvas.getContext("webgl2", { antialias: true, alpha: false });
  if (!gl) {
    document.body.innerHTML =
      '<div style="color:white;font-family:sans-serif;padding:24px">WebGL2 not supported.</div>';
    return;
  }

  function resize() {
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var w = Math.max(1, Math.floor(canvas.clientWidth * dpr));
    var h = Math.max(1, Math.floor(canvas.clientHeight * dpr));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
      return true;
    }
    return false;
  }

  var graph = project.graph;
  var nodes = graph.nodes;
  var edges = graph.edges;
  var ordered = topoOrder(nodes, edges);
  var shaders = ordered.filter((n) => n.kind === "shader");

  var passes = [];
  var passById = {};

  // ── webcam sources (live MediaStream → texSubImage2D each frame) ───────────
  // Acquired once at startup; rebuild() resets passes/FBOs but never tears
  // these down because that would re-prompt for permission on every resize.
  var webcamSources = {};
  function initWebcams() {
    if (
      typeof navigator === "undefined" ||
      !navigator.mediaDevices ||
      typeof navigator.mediaDevices.getUserMedia !== "function"
    ) {
      return;
    }
    nodes
      .filter((n) => n.kind === "webcam")
      .forEach((n) => {
        if (webcamSources[n.id]) return;
        var video = document.createElement("video");
        video.muted = true;
        video.playsInline = true;
        video.autoplay = true;
        var entry = {
          video: video,
          stream: null,
          tex: null,
          w: 0,
          h: 0,
          ready: false,
        };
        webcamSources[n.id] = entry;
        var constraints = {
          video: n.deviceId ? { deviceId: { exact: n.deviceId } } : true,
          audio: false,
        };
        navigator.mediaDevices.getUserMedia(constraints).then(
          (stream) => {
            entry.stream = stream;
            video.srcObject = stream;
            video.play().catch(() => {});
            entry.ready = true;
          },
          (err) => {
            console.warn("Webcam permission denied:", err);
          },
        );
      });
  }
  function updateWebcams() {
    Object.keys(webcamSources).forEach((id) => {
      var e = webcamSources[id];
      if (!e.ready) return;
      var v = e.video;
      if (v.readyState < 2) return;
      var vw = v.videoWidth,
        vh = v.videoHeight;
      if (!vw || !vh) return;
      if (!e.tex || e.w !== vw || e.h !== vh) {
        if (e.tex) gl.deleteTexture(e.tex);
        e.tex = gl.createTexture();
        e.w = vw;
        e.h = vh;
        gl.bindTexture(gl.TEXTURE_2D, e.tex);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
        gl.texImage2D(
          gl.TEXTURE_2D,
          0,
          gl.RGBA,
          gl.RGBA,
          gl.UNSIGNED_BYTE,
          v,
        );
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
        gl.bindTexture(gl.TEXTURE_2D, null);
        return;
      }
      gl.bindTexture(gl.TEXTURE_2D, e.tex);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
      gl.texSubImage2D(
        gl.TEXTURE_2D,
        0,
        0,
        0,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        v,
      );
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
      gl.bindTexture(gl.TEXTURE_2D, null);
    });
  }
  initWebcams();

  function rebuild() {
    // Dispose any previous resources (best-effort).
    passes.forEach((p) => {
      if (p.fbo) {
        gl.deleteFramebuffer(p.fbo.fbo);
        gl.deleteTexture(p.fbo.tex);
        gl.deleteRenderbuffer(p.fbo.depth);
      }
    });
    passes = [];
    passById = {};

    var W = canvas.width,
      H = canvas.height;
    shaders.forEach((sn) => {
      // Mesh input?
      var meshEdge = edges.find(
        (e) => e.target === sn.id && e.targetHandle === "mesh",
      );
      var meshIsFullscreen = true;
      var meshData = makeQuad();
      var vertSrc = sn.vertexSource;
      if (meshEdge) {
        var meshNode = nodes.find((n) => n.id === meshEdge.source);
        if (meshNode && meshNode.kind === "mesh") {
          meshData = makePrimitive(meshNode.primitive);
          meshIsFullscreen = false;
        }
      }
      if (meshIsFullscreen) vertSrc = FULLSCREEN_VERT;

      var compiled = createProgram(gl, vertSrc, sn.fragmentSource);
      if (!compiled) return;
      var mesh = uploadMesh(gl, meshData, compiled.attributes);
      var fbo = createFBO(gl, W, H);

      var samplers = [];
      var paramBindings = [];
      var unit = 0;
      edges
        .filter((e) => e.target === sn.id && e.targetHandle !== "mesh")
        .forEach((e) => {
          var src = nodes.find((n) => n.id === e.source);
          if (!src) return;
          if (src.kind === "param") {
            paramBindings.push({
              uniformName: e.targetHandle,
              sourceNodeId: e.source,
            });
          } else {
            samplers.push({
              uniformName: e.targetHandle,
              sourceNodeId: e.source,
              unit: unit++,
            });
          }
        });

      var pass = {
        nodeId: sn.id,
        program: compiled,
        mesh: mesh,
        fbo: fbo,
        meshIsFullscreen: meshIsFullscreen,
        samplers: samplers,
        paramBindings: paramBindings,
        uniformValues: Object.assign({}, sn.uniformValues || {}),
      };
      passes.push(pass);
      passById[sn.id] = pass;
    });
  }

  rebuild();

  var blit = createProgram(gl, BLIT_VERT, BLIT_FRAG);
  var blitMesh = uploadMesh(gl, makeQuad(), blit.attributes);

  // Camera (auto-orbit when meshes exist).
  var camera = {
    target: [0, 0, 0],
    distance: 4,
    yaw: Math.PI * 0.25,
    pitch: Math.PI * 0.15,
    fov: Math.PI / 4,
  };
  var view = new Float32Array(16);
  var proj = new Float32Array(16);
  var model = new Float32Array(16);
  mat4Identity(model);

  function paramValue(node, time) {
    if (node.paramKind === "time") {
      var arr = Array.isArray(node.value) ? node.value : [node.value || 1, 0];
      return time * (arr[0] || 1) + (arr[1] || 0);
    }
    return node.value;
  }

  function setUniform(loc, value) {
    if (loc === null || loc === undefined) return;
    if (typeof value === "number") gl.uniform1f(loc, value);
    else if (value && value.kind === "sampler2D") {
      gl.activeTexture(gl.TEXTURE0 + value.unit);
      gl.bindTexture(gl.TEXTURE_2D, value.texture);
      gl.uniform1i(loc, value.unit);
    } else if (value instanceof Float32Array && value.length === 16)
      gl.uniformMatrix4fv(loc, false, value);
    else if (Array.isArray(value)) {
      if (value.length === 2) gl.uniform2f(loc, value[0], value[1]);
      else if (value.length === 3)
        gl.uniform3f(loc, value[0], value[1], value[2]);
      else if (value.length === 4)
        gl.uniform4f(loc, value[0], value[1], value[2], value[3]);
    }
  }

  var start = performance.now();
  var sizeDirty = true;
  function frame(now) {
    if (sizeDirty || resize()) {
      sizeDirty = false;
      rebuild();
    }
    updateWebcams();
    var t = (now - start) / 1000;
    // Slow rotation if any non-fullscreen pass exists.
    camera.yaw = Math.PI * 0.25 + t * 0.1;
    var cp = Math.cos(camera.pitch),
      sp = Math.sin(camera.pitch);
    var cy = Math.cos(camera.yaw),
      sy = Math.sin(camera.yaw);
    var eye = [
      camera.target[0] + camera.distance * cp * sy,
      camera.target[1] + camera.distance * sp,
      camera.target[2] + camera.distance * cp * cy,
    ];
    mat4LookAt(view, eye, camera.target, [0, 1, 0]);
    mat4Perspective(
      proj,
      camera.fov,
      canvas.width / Math.max(1, canvas.height),
      0.05,
      100,
    );

    // Render every pass into its FBO.
    passes.forEach((pass) => {
      gl.bindFramebuffer(gl.FRAMEBUFFER, pass.fbo.fbo);
      gl.viewport(0, 0, pass.fbo.w, pass.fbo.h);
      gl.clearColor(0, 0, 0, 1);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      gl.useProgram(pass.program.program);
      if (pass.meshIsFullscreen) gl.disable(gl.DEPTH_TEST);
      else gl.enable(gl.DEPTH_TEST);

      var u = pass.program.uniforms;
      setUniform(u["u_time"], t);
      setUniform(u["u_resolution"], [pass.fbo.w, pass.fbo.h]);
      if (!pass.meshIsFullscreen) {
        setUniform(u["u_view"], view);
        setUniform(u["u_proj"], proj);
        setUniform(u["u_model"], model);
      }

      // User uniforms with param overrides.
      var effective = Object.assign({}, pass.uniformValues);
      pass.paramBindings.forEach((b) => {
        var src = nodes.find((n) => n.id === b.sourceNodeId);
        if (src && src.kind === "param")
          effective[b.uniformName] = paramValue(src, t);
      });
      Object.keys(effective).forEach((k) => {
        if (u[k] !== undefined) setUniform(u[k], effective[k]);
      });

      // Samplers
      pass.samplers.forEach((s) => {
        if (u[s.uniformName] === undefined) return;
        var srcPass = passById[s.sourceNodeId];
        var texture = srcPass ? srcPass.fbo.tex : null;
        if (!texture) {
          var ws = webcamSources[s.sourceNodeId];
          if (ws && ws.tex) texture = ws.tex;
        }
        if (!texture) return;
        setUniform(u[s.uniformName], {
          kind: "sampler2D",
          texture: texture,
          unit: s.unit,
        });
      });

      gl.bindVertexArray(pass.mesh.vao);
      if (pass.mesh.ibo)
        gl.drawElements(
          gl.TRIANGLES,
          pass.mesh.indexCount,
          gl.UNSIGNED_SHORT,
          0,
        );
      else gl.drawArrays(gl.TRIANGLES, 0, pass.mesh.vertexCount);
      gl.bindVertexArray(null);
    });

    // Composite outputs.
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.disable(gl.DEPTH_TEST);
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.clearColor(0.07, 0.07, 0.09, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);

    var outputs = nodes.filter((n) => n.kind === "output");
    var drawable = outputs
      .map((o) => {
        var e = edges.find(
          (ee) => ee.target === o.id && ee.targetHandle === "texture",
        );
        return e ? passById[e.source] : null;
      })
      .filter((p) => !!p);

    if (drawable.length > 0) {
      var cells = splitLayout(drawable.length, canvas.width, canvas.height);
      for (var i = 0; i < drawable.length; i++) {
        var c = cells[i];
        gl.viewport(c.x, c.y, Math.max(1, c.w), Math.max(1, c.h));
        gl.useProgram(blit.program);
        gl.bindVertexArray(blitMesh.vao);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, drawable[i].fbo.tex);
        gl.uniform1i(blit.uniforms["u_tex"], 0);
        gl.drawElements(
          gl.TRIANGLES,
          blitMesh.indexCount,
          gl.UNSIGNED_SHORT,
          0,
        );
        gl.bindVertexArray(null);
      }
    }

    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  window.addEventListener("resize", () => {
    sizeDirty = true;
  });
})();

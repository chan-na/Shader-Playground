import type { Page } from "@playwright/test";
import { expect } from "@playwright/test";
import type {
  Diagnostics,
  GraphEdge,
  GraphNodeMinimal,
  ShaderStage,
} from "./types";

// Mirror of the contract exposed by main.tsx in dev mode (`window.__sp = {...}`).
// We don't import the real types — see helpers/types.ts.
export interface OrbitCameraStateMinimal {
  target: [number, number, number];
  distance: number;
  yaw: number;
  pitch: number;
  fov: number;
  near: number;
  far: number;
  minDistance: number;
  maxDistance: number;
  minPitch: number;
  maxPitch: number;
}

export interface SpStores {
  graph: {
    getState: () => {
      nodes: GraphNodeMinimal[];
      edges: GraphEdge[];
      positions: Record<string, { x: number; y: number }>;
      parents: Record<string, string>;
      rev: number;
      uniformRev: number;
      setGraph: (
        g: { nodes: GraphNodeMinimal[]; edges: GraphEdge[] },
        positions?: Record<string, { x: number; y: number }>,
        parents?: Record<string, string>,
      ) => void;
      addNode: (
        node: GraphNodeMinimal,
        position?: { x: number; y: number },
      ) => void;
      removeNode: (id: string) => void;
      addEdge: (edge: GraphEdge) => void;
      removeEdge: (id: string) => void;
      updateShaderSource: (
        id: string,
        patch: { vertexSource?: string; fragmentSource?: string },
      ) => void;
      setUniformValue: (
        id: string,
        name: string,
        value: number | number[],
      ) => void;
      setResolutionScale: (id: string, scale: 0.25 | 0.5 | 1) => void;
      addGroup: (
        label: string,
        absolutePosition: { x: number; y: number },
        size: { width: number; height: number },
        options?: { parentId?: string; color?: string },
      ) => string;
      setParent: (id: string, newParentId: string | undefined) => boolean;
      groupSelected: (ids: string[]) => string | null;
      removeGroup: (
        id: string,
        mode: "delete-children" | "release-children",
      ) => void;
      setGroupLabel: (id: string, label: string) => void;
      setGroupColor: (id: string, color: string | undefined) => void;
      setGroupSize: (
        id: string,
        size: { width: number; height: number },
      ) => void;
      toggleGroupCollapsed: (id: string) => void;
      reset: () => void;
    };
  };
  selection: {
    getState: () => {
      selectedNodeId: string | null;
      selectedNodeIds: string[];
      select: (id: string | null) => void;
      setSelectedIds: (ids: string[]) => void;
    };
  };
  diagnostics: {
    getState: () => { byNode: Record<string, Diagnostics> };
  };
  time: {
    getState: () => {
      simTime: number;
      playing: boolean;
      speed: number;
      togglePlaying: () => void;
      setPlaying: (p: boolean) => void;
    };
  };
  viewport: {
    getState: () => {
      background: [number, number, number];
      layout: { rows: { cells: { outputId: string | null }[] }[] };
    };
  };
  history: { getState: () => { past: unknown[]; future: unknown[] } };
  editor: {
    getState: () => {
      activeStage: ShaderStage;
      jumpRequest: null | {
        nodeId: string;
        stage: ShaderStage;
        line: number;
        column?: number;
      };
      setStage: (s: ShaderStage) => void;
      requestJump: (j: {
        nodeId: string;
        stage: ShaderStage;
        line: number;
        column?: number;
      }) => void;
    };
  };
  assets: {
    getState: () => {
      meshes: Record<string, unknown>;
      images: Record<string, unknown>;
    };
  };
  // biome-ignore lint/suspicious/noExplicitAny: dynamic action registry
  assetActions: Record<string, (...args: any[]) => unknown>;
  camera: {
    getState: () => {
      camera: OrbitCameraStateMinimal;
      rev: number;
      setCamera: (c: OrbitCameraStateMinimal) => void;
      reset: () => void;
    };
  };
  mouse: {
    getState: () => {
      x: number;
      y: number;
      clickX: number;
      clickY: number;
      down: boolean;
      rev: number;
      setPosition: (x: number, y: number) => void;
      setDown: (x: number, y: number) => void;
      setUp: () => void;
      reset: () => void;
    };
  };
  renderer: {
    getState: () => {
      ready: boolean;
      stats: {
        fps: number;
        frame: number;
        drawCalls: number;
        renderTick: number;
        errors: string[];
      };
    };
  };
  gpuTimer: {
    getState: () => {
      byNode: Record<string, number>;
      totalMs: number;
      supported: boolean;
      enabled: boolean;
      toggleEnabled: () => void;
      setSupported: (supported: boolean) => void;
      setEnabled: (enabled: boolean) => void;
    };
  };
  gifRecorder: {
    getState: () => {
      status: "idle" | "recording" | "encoding";
      frameCount: number;
      elapsedMs: number;
      lastBlobUrl: string | null;
      error: string | null;
      start: (options?: {
        fps?: number;
        maxSeconds?: number;
        maxLongEdge?: number;
        maxColors?: number;
        dither?: boolean;
        localPalette?: boolean;
      }) => void;
      stop: () => Promise<Blob | null>;
    };
  };
  glslValidator: () => {
    validate: (
      stage: "vertex" | "fragment",
      source: string,
    ) => Promise<
      Array<{
        line: number;
        column?: number;
        severity: "error" | "warning" | "info";
        message: string;
      }>
    >;
    dispose: () => void;
  };
  glslSymbols: {
    build: (source: string) => {
      symbols: Array<{
        name: string;
        type: string;
        kind: string;
        line: number;
        column: number;
        scope: string | null;
        parameters?: string;
      }>;
    };
    visibleAt: (
      table: { symbols: unknown[] },
      line: number,
    ) => Array<{
      name: string;
      type: string;
      kind: string;
      line: number;
      column: number;
      scope: string | null;
    }>;
    resolve: (
      table: { symbols: unknown[] },
      name: string,
      line: number,
    ) => {
      name: string;
      type: string;
      kind: string;
      line: number;
      scope: string | null;
    } | null;
    builtins: Record<string, { signatures: string[]; description: string }>;
    keywords: Record<string, string>;
    findReferences: (
      source: string,
      name: string,
      atLine: number,
    ) => Array<{
      from: number;
      to: number;
      line: number;
      column: number;
      isDefinition: boolean;
    }>;
  };
  glslSemanticTokens: {
    classify: (source: string) => Array<{
      from: number;
      to: number;
      kind: string;
    }>;
    classifyIdentifier: (
      table: { symbols: unknown[] },
      name: string,
      line: number,
    ) => string | null;
  };
  codeEditor: {
    getCursorLine: () => number | null;
    focus: () => void;
  };
  log: {
    debug: (category: string, message: string, detail?: unknown) => void;
    info: (category: string, message: string, detail?: unknown) => void;
    warn: (category: string, message: string, detail?: unknown) => void;
    error: (category: string, message: string, detail?: unknown) => void;
  };
}

declare global {
  interface Window {
    __sp?: SpStores;
  }
}

/**
 * Run an arbitrary closure inside the page with access to window.__sp and
 * a JSON-serializable argument bag. The closure body is stringified and
 * re-parsed via `new Function`, so it must not close over outer variables.
 * Always destructure inputs from the `args` parameter.
 */
export async function withSp<A, R>(
  page: Page,
  fn: (sp: SpStores, args: A) => R | Promise<R>,
  args: A,
): Promise<R> {
  const src = fn.toString();
  return page.evaluate(
    async ({ src, args }) => {
      const sp = window.__sp;
      if (!sp) throw new Error("__sp not exposed");
      const f = new Function(
        "sp",
        "args",
        `return (${src})(sp, args);`,
        // biome-ignore lint/suspicious/noExplicitAny: hand-rolled invoke
      ) as (s: unknown, a: unknown) => any;
      return await f(sp, args);
    },
    { src, args },
  ) as Promise<R>;
}

/** Convenience wrapper for closures that don't need arguments. */
export async function readSp<R>(
  page: Page,
  fn: (sp: SpStores) => R,
): Promise<R> {
  const src = fn.toString();
  return page.evaluate(async (src) => {
    const sp = window.__sp;
    if (!sp) throw new Error("__sp not exposed");
    const f = new Function(
      "sp",
      `return (${src})(sp);`,
      // biome-ignore lint/suspicious/noExplicitAny: hand-rolled invoke
    ) as (s: unknown) => any;
    return await f(sp);
  }, src) as Promise<R>;
}

/** Wait until window.__sp is available (dev build flag). */
export async function waitForApp(page: Page): Promise<void> {
  await expect
    .poll(() => page.evaluate(() => typeof window.__sp !== "undefined"), {
      timeout: 15_000,
      message: "window.__sp never became available",
    })
    .toBe(true);
}

/** Wait for the graph rev to advance past `before`. */
export async function waitForRev(
  page: Page,
  before: number,
  timeout = 5_000,
): Promise<void> {
  await expect
    .poll(() => readSp(page, (sp) => sp.graph.getState().rev), {
      timeout,
      message: `graph rev did not advance past ${before}`,
    })
    .toBeGreaterThan(before);
}

/** Block until the graph has at least one node (demo bootstrap complete). */
export async function waitForReady(page: Page): Promise<void> {
  await expect
    .poll(() => readSp(page, (sp) => sp.graph.getState().nodes.length), {
      timeout: 10_000,
      message: "graph never populated",
    })
    .toBeGreaterThan(0);
}

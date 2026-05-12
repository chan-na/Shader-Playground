// Loose mirrors of the production types. We deliberately avoid importing from
// `src/` so the e2e suite is decoupled from internal refactors — every helper
// communicates with the running app through window.__sp, which is a stable
// debug contract exposed in main.tsx.

export type ShaderStage = "vertex" | "fragment";

export interface GraphEdge {
  id: string;
  source: string;
  sourceHandle: string;
  target: string;
  targetHandle: string;
}

export interface GraphNodeMinimal {
  id: string;
  kind:
    | "mesh"
    | "image"
    | "shader"
    | "compute"
    | "output"
    | "param"
    | "math"
    | "swizzle"
    | "combine";
  [k: string]: unknown;
}

interface Diagnostic {
  line: number;
  column?: number;
  severity: "error" | "warning" | "info";
  message: string;
}

export interface Diagnostics {
  vertex: Diagnostic[];
  fragment: Diagnostic[];
  link: Diagnostic[];
}

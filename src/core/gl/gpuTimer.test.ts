import { describe, expect, it } from "vitest";
import { GpuTimerPool } from "./gpuTimer";

// Bare WebGL2 stub focused on what GpuTimerPool actually calls. fakeGl has
// no query API, so the timer pool gets a dedicated harness — it lets us
// script disjoint events and per-query availability/result deterministically.
interface QueryStub {
  id: number;
  available: boolean;
  resultNs: number;
}

interface StubOptions {
  exposeExtension?: boolean;
  initialAvailable?: boolean;
  resultNs?: number;
}

function buildGl(opts: StubOptions = {}) {
  const expose = opts.exposeExtension ?? true;
  const resultNs = opts.resultNs ?? 1_000_000; // 1 ms by default
  const initialAvailable = opts.initialAvailable ?? true;

  let nextId = 1;
  const queries: QueryStub[] = [];
  // GL constant values are arbitrary; the pool only reads them back via the
  // extension object it received from getExtension().
  const ext = { TIME_ELAPSED_EXT: 0x88bf, GPU_DISJOINT_EXT: 0x8fbb };

  let disjoint = false;
  const calls: Array<{ method: string; args: unknown[] }> = [];
  const record = (method: string, ...args: unknown[]) => {
    calls.push({ method, args });
  };

  const gl = {
    QUERY_RESULT_AVAILABLE: 0x8867,
    QUERY_RESULT: 0x8866,
    getExtension: (name: string) => {
      record("getExtension", name);
      return expose ? ext : null;
    },
    createQuery: () => {
      const q: QueryStub = {
        id: nextId++,
        available: initialAvailable,
        resultNs,
      };
      queries.push(q);
      return q as unknown as WebGLQuery;
    },
    deleteQuery: (q: unknown) => record("deleteQuery", (q as QueryStub).id),
    beginQuery: (target: number, q: unknown) =>
      record("beginQuery", target, (q as QueryStub).id),
    endQuery: (target: number) => record("endQuery", target),
    getParameter: (name: number) => {
      if (name === ext.GPU_DISJOINT_EXT) return disjoint;
      return null;
    },
    getQueryParameter: (q: unknown, pname: number) => {
      const stub = q as QueryStub;
      if (pname === 0x8867) return stub.available;
      if (pname === 0x8866) return stub.resultNs;
      return null;
    },
  } as unknown as WebGL2RenderingContext;

  return {
    gl,
    queries,
    ext,
    calls,
    setDisjoint: (v: boolean) => {
      disjoint = v;
    },
  };
}

describe("GpuTimerPool.create", () => {
  it("returns a pool when the extension is exposed", () => {
    const { gl } = buildGl();
    const pool = GpuTimerPool.create(gl);
    expect(pool).not.toBeNull();
  });

  it("returns null when the extension is missing (Safari / no support)", () => {
    const { gl } = buildGl({ exposeExtension: false });
    const pool = GpuTimerPool.create(gl);
    expect(pool).toBeNull();
  });
});

describe("GpuTimerPool begin/end + poll", () => {
  it("converts nanoseconds to milliseconds and matches the nodeId", () => {
    const { gl } = buildGl({ resultNs: 2_500_000 });
    const pool = GpuTimerPool.create(gl)!;
    pool.begin(gl, "n1");
    pool.end(gl);
    const samples = pool.poll(gl);
    expect(samples).toEqual([{ nodeId: "n1", ms: 2.5 }]);
  });

  it("does not nest — a second begin while active is ignored", () => {
    const { gl, calls } = buildGl();
    const pool = GpuTimerPool.create(gl)!;
    pool.begin(gl, "n1");
    pool.begin(gl, "n2");
    pool.end(gl);
    const samples = pool.poll(gl);
    expect(samples).toEqual([{ nodeId: "n1", ms: 1 }]);
    // Only one beginQuery should have happened despite the duplicate call.
    const beginCalls = calls.filter((c) => c.method === "beginQuery");
    expect(beginCalls).toHaveLength(1);
  });

  it("leaves pending queries in the queue until their fence signals", () => {
    const { gl, queries } = buildGl({ initialAvailable: false });
    const pool = GpuTimerPool.create(gl)!;
    pool.begin(gl, "n1");
    pool.end(gl);
    expect(pool.poll(gl)).toEqual([]);
    expect(pool.pendingCount()).toBe(1);

    // Flip the fence to signaled for the next poll.
    queries[0]!.available = true;
    const samples = pool.poll(gl);
    expect(samples).toEqual([{ nodeId: "n1", ms: 1 }]);
    expect(pool.pendingCount()).toBe(0);
  });

  it("recycles WebGLQuery objects across frames", () => {
    const { gl, queries } = buildGl();
    const pool = GpuTimerPool.create(gl)!;
    for (let i = 0; i < 5; i++) {
      pool.begin(gl, `n${i}`);
      pool.end(gl);
      pool.poll(gl);
    }
    // Only one WebGLQuery should ever be created — the pool keeps reusing it.
    expect(queries).toHaveLength(1);
  });
});

describe("GpuTimerPool disjoint handling", () => {
  it("drops in-flight samples and recycles queries when GPU_DISJOINT fires", () => {
    const { gl, setDisjoint, queries } = buildGl();
    const pool = GpuTimerPool.create(gl)!;
    pool.begin(gl, "n1");
    pool.end(gl);
    pool.begin(gl, "n2");
    pool.end(gl);

    setDisjoint(true);
    expect(pool.poll(gl)).toEqual([]);
    expect(pool.pendingCount()).toBe(0);

    // Next frame disjoint clears; the same query handles should be reused.
    setDisjoint(false);
    pool.begin(gl, "n3");
    pool.end(gl);
    pool.poll(gl);
    expect(queries.length).toBeLessThanOrEqual(2);
  });
});

describe("GpuTimerPool release / dispose", () => {
  it("release drops the pending sample for a node without affecting others", () => {
    const { gl } = buildGl();
    const pool = GpuTimerPool.create(gl)!;
    pool.begin(gl, "n1");
    pool.end(gl);
    pool.begin(gl, "n2");
    pool.end(gl);

    pool.release(gl, "n1");
    const samples = pool.poll(gl);
    expect(samples.map((s) => s.nodeId)).toEqual(["n2"]);
  });

  it("release closes an active query owned by the released node", () => {
    const { gl, calls } = buildGl();
    const pool = GpuTimerPool.create(gl)!;
    pool.begin(gl, "n1");
    // No matching end before release — pool should close it itself.
    pool.release(gl, "n1");
    const endCalls = calls.filter((c) => c.method === "endQuery");
    expect(endCalls).toHaveLength(1);
    // After release, the next begin should still succeed.
    pool.begin(gl, "n2");
    pool.end(gl);
    expect(pool.poll(gl).map((s) => s.nodeId)).toEqual(["n2"]);
  });

  it("dispose ends an active query and deletes all WebGLQuery handles", () => {
    const { gl, calls } = buildGl();
    const pool = GpuTimerPool.create(gl)!;
    pool.begin(gl, "n1");
    pool.end(gl);
    pool.begin(gl, "n2"); // active without end
    pool.dispose(gl);
    const deletes = calls.filter((c) => c.method === "deleteQuery");
    // Both queries created should be deleted (active + idle path).
    expect(deletes.length).toBeGreaterThanOrEqual(2);
  });
});

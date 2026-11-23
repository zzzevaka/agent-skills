/**
 * Layout of the stage graph, drawn as a layered DAG (top to bottom; "horizontal"
 * turns it into columns from left to right). A stage goes in the layer one below
 * its deepest dependency, so stages without a dependency path between them can
 * sit side by side. Each dependency is one curve from the middle of the parent's
 * far side to the middle of the child's near side; an edge that skips layers
 * passes through a waypoint slot in each skipped layer, so it never crosses a
 * stage. Edges implied by other dependencies are left out of the layout (see
 * `GraphEdge.implied`). Inside a layer, stages are ordered by the average position of their
 * neighbours in the adjacent layer (a few sweeps down and up), then placed under
 * the average of their neighbours, so a chain stays straight.
 */
export const NODE_H = 64;
/** Space between layers, along the flow. */
export const LAYER_GAP = 44;
/** Space between neighbours in a layer, across the flow. */
export const SIBLING_GAP = 28;
/** Width, across the flow, of the slot an edge uses to pass a layer. */
export const WAYPOINT_W = 16;
export const PAD = 32;
export const MIN_NODE_W = 196;
export const MAX_NODE_W = 360;
const ARROW = 5;
/** Sweeps over the layers when ordering: down, up, down, up. */
const SWEEPS = 4;
/** How strongly placement keeps a real stage under its parents; waypoints weigh 1. */
const REAL_WEIGHT = 1e6;
/** Pull of a waypoint neighbour on a stage, against 1 for a real neighbour. */
const WAYPOINT_NEIGHBOUR_WEIGHT = 1e-4;

export interface GraphStage {
  name: string;
  depends_on: string[];
}

export type Direction = "vertical" | "horizontal";

export interface GraphNode {
  name: string;
  x: number;
  y: number;
  w: number;
  h: number;
  /** Layer index: 0 for stages without dependencies. */
  row: number;
}

export interface GraphEdge {
  from: string;
  /** Index of the `from` stage. */
  source: number;
  to: string;
  path: string;
  /**
   * Another dependency of `to` already depends on `from`, so this edge adds nothing
   * to the picture. It takes no part in the layout; `path` is a direct curve, meant
   * to be drawn faintly behind the stages and only for the selected stage.
   */
  implied: boolean;
}

export interface GraphLayout {
  nodes: GraphNode[];
  edges: GraphEdge[];
  width: number;
  height: number;
}

/**
 * Hue (degrees) of the arrows leaving the stage at `source`. Steps by the
 * golden angle, so stages next to each other get clearly different colours
 * and no hue repeats before many stages have passed. The greens (120-200) are
 * left out: green already means "finished".
 */
export function edgeHue(source: number): number {
  const spread = (source * 137.508) % 360;
  return Math.round((200 + spread * (240 / 360)) % 360);
}

/** The smallest scale a graph is shrunk to when fitting its card; narrower cards scroll instead. */
export const MIN_FIT_SCALE = 0.5;

/**
 * The scale that makes a graph `content` px wide fit `available` px: 1 when it
 * already fits or the width is not known yet (0), never below `MIN_FIT_SCALE`.
 */
export function fitScale(available: number, content: number): number {
  if (available <= 0 || content <= available) return 1;
  return Math.max(MIN_FIT_SCALE, available / content);
}

/** Shared node width: enough for the longest name, within limits. */
export function nodeWidthFor(names: string[]): number {
  const longest = Math.max(0, ...names.map((name) => [...name].length));
  return Math.min(MAX_NODE_W, Math.max(MIN_NODE_W, 58 + 8 * longest));
}

export function layoutGraph(
  stages: GraphStage[],
  { nodeWidth, direction = "vertical" }: { nodeWidth: number; direction?: Direction },
): GraphLayout {
  // Everything is worked out along the flow (u: down the layers, or along a row)
  // and across it (v), then turned into x and y by `pt` and at the end.
  const horizontal = direction === "horizontal";
  const along = horizontal ? nodeWidth : NODE_H; // size of a stage along the flow
  const across = horizontal ? NODE_H : nodeWidth;
  const pt = (u: number, v: number) => (horizontal ? `${u},${v}` : `${v},${u}`);

  // Dependencies on missing, later or own stages are ignored, never fatal.
  const count = stages.length;
  const indexOf = new Map<string, number>();
  const parents: number[][] = [];
  stages.forEach((stage, index) => {
    const valid: number[] = [];
    for (const name of new Set(stage.depends_on)) {
      const parent = indexOf.get(name);
      if (parent !== undefined) valid.push(parent);
    }
    parents.push(valid);
    indexOf.set(stage.name, index);
  });

  // A dependency is implied when another dependency of the same stage already
  // depends on it, directly or through other stages.
  const ancestors = parents.map(() => new Set<number>());
  parents.forEach((valid, index) => {
    for (const parent of valid) {
      ancestors[index].add(parent);
      for (const ancestor of ancestors[parent]) ancestors[index].add(ancestor);
    }
  });
  const isImplied = (parent: number, child: number) =>
    parents[child].some((other) => other !== parent && ancestors[other].has(parent));

  const layerOf: number[] = [];
  parents.forEach((valid, index) => {
    layerOf[index] = valid.length ? 1 + Math.max(...valid.map((p) => layerOf[p])) : 0;
  });

  // Items are the stages (ids 0..count-1) and the waypoints of long edges.
  const chains: number[][] = []; // item ids from the parent to the child, per edge
  const impliedAt = new Set<number>(); // indexes in `chains` of implied edges
  const up: number[][] = stages.map(() => []);
  const down: number[][] = stages.map(() => []);
  const link = (a: number, b: number) => {
    down[a].push(b);
    up[b].push(a);
  };
  parents.forEach((valid, child) => {
    for (const parent of valid) {
      if (isImplied(parent, child)) {
        impliedAt.add(chains.length);
        chains.push([parent, child]);
        continue;
      }
      const chain = [parent];
      for (let layer = layerOf[parent] + 1; layer < layerOf[child]; layer += 1) {
        const id = up.length;
        up.push([]);
        down.push([]);
        layerOf[id] = layer;
        chain.push(id);
      }
      chain.push(child);
      for (let i = 0; i + 1 < chain.length; i += 1) link(chain[i], chain[i + 1]);
      chains.push(chain);
    }
  });

  const layerCount = count ? 1 + Math.max(...layerOf.slice(0, count)) : 0;
  const order: number[][] = Array.from({ length: layerCount }, () => []);
  layerOf.forEach((layer, id) => order[layer].push(id));

  const sweep = (layer: number, neighbours: number[][], reference: number[]) => {
    const position = new Map(reference.map((id, i) => [id, i]));
    const key = (id: number, current: number) => {
      const near = neighbours[id].map((n) => position.get(n)!);
      return near.length ? near.reduce((a, b) => a + b, 0) / near.length : current;
    };
    order[layer] = order[layer]
      .map((id, current) => ({ id, k: key(id, current) }))
      .sort((a, b) => a.k - b.k)
      .map((entry) => entry.id);
  };
  for (let round = 0; round < SWEEPS; round += 1) {
    if (round % 2 === 0) {
      for (let layer = 1; layer < layerCount; layer += 1) sweep(layer, up, order[layer - 1]);
    } else {
      for (let layer = layerCount - 2; layer >= 0; layer -= 1) sweep(layer, down, order[layer + 1]);
    }
  }

  // Placement across the flow, by the centre of each item. Start with every layer
  // centred, then pull each item towards the average centre of its neighbours in the
  // adjacent layer (down, up, down), pushing neighbours apart only as far as needed.
  // Real stages weigh far more than waypoints, and waypoint neighbours count for
  // little, so a chain stays straight when a long edge runs beside it.
  const size = (id: number) => (id < count ? across : WAYPOINT_W);
  const separation = (a: number, b: number) => (size(a) + size(b)) / 2 + SIBLING_GAP;
  const weight = (id: number) => (id < count ? REAL_WEIGHT : 1);
  const centre = new Map<number, number>();
  order.forEach((ids) => {
    const total = ids.reduce((sum, id) => sum + size(id), 0) + Math.max(0, ids.length - 1) * SIBLING_GAP;
    let v = -total / 2;
    for (const id of ids) {
      centre.set(id, v + size(id) / 2);
      v += size(id) + SIBLING_GAP;
    }
  });
  const place = (layer: number, neighbours: number[][]) => {
    const ids = order[layer];
    const desired = ids.map((id) => {
      let sum = 0;
      let total = 0;
      for (const n of neighbours[id]) {
        const w = n < count ? 1 : WAYPOINT_NEIGHBOUR_WEIGHT;
        sum += w * centre.get(n)!;
        total += w;
      }
      return total ? sum / total : centre.get(id)!;
    });
    // Least squares with order and minimum separations kept (pool adjacent violators).
    const offset = [0];
    for (let i = 1; i < ids.length; i += 1) offset.push(offset[i - 1] + separation(ids[i - 1], ids[i]));
    const blocks: { sum: number; weight: number; count: number }[] = [];
    ids.forEach((id, i) => {
      blocks.push({ sum: weight(id) * (desired[i] - offset[i]), weight: weight(id), count: 1 });
      while (blocks.length > 1) {
        const last = blocks[blocks.length - 1];
        const before = blocks[blocks.length - 2];
        if (before.sum / before.weight <= last.sum / last.weight) break;
        blocks.splice(-2, 2, {
          sum: before.sum + last.sum,
          weight: before.weight + last.weight,
          count: before.count + last.count,
        });
      }
    });
    let i = 0;
    for (const block of blocks) {
      for (let k = 0; k < block.count; k += 1, i += 1) centre.set(ids[i], block.sum / block.weight + offset[i]);
    }
  };
  for (let layer = 1; layer < layerCount; layer += 1) place(layer, up);
  for (let layer = layerCount - 2; layer >= 0; layer -= 1) place(layer, down);
  for (let layer = 1; layer < layerCount; layer += 1) place(layer, up);

  let low = Infinity;
  let high = -Infinity;
  for (const [id, c] of centre) {
    low = Math.min(low, c - size(id) / 2);
    high = Math.max(high, c + size(id) / 2);
  }
  const widest = layerCount ? high - low : 0;
  const slot = new Map([...centre].map(([id, c]) => [id, c - size(id) / 2 - low + PAD])); // start across the flow
  const start = (layer: number) => PAD + layer * (along + LAYER_GAP);
  const middle = (id: number) => slot.get(id)! + size(id) / 2;

  const curve = (u1: number, v1: number, u2: number, v2: number) => {
    const half = (u1 + (u2 - u1) / 2);
    return ` C${pt(half, v1)} ${pt(half, v2)} ${pt(u2, v2)}`;
  };
  const edgePath = (chain: number[]) => {
    let u = start(layerOf[chain[0]]) + along;
    let v = middle(chain[0]);
    let path = `M${pt(u, v)}`;
    for (const id of chain.slice(1)) {
      const near = start(layerOf[id]);
      path += curve(u, v, near, middle(id));
      u = near;
      v = middle(id);
      if (id >= count) {
        u = near + along;
        path += ` L${pt(u, v)}`;
      }
    }
    return `${path} M${pt(u - ARROW, v - ARROW + 1)} L${pt(u, v)} L${pt(u - ARROW, v + ARROW - 1)}`;
  };

  const edges: GraphEdge[] = chains.map((chain, index) => ({
    from: stages[chain[0]].name,
    source: chain[0],
    to: stages[chain[chain.length - 1]].name,
    path: edgePath(chain),
    implied: impliedAt.has(index),
  }));

  const alongSize = layerCount ? PAD * 2 + layerCount * along + (layerCount - 1) * LAYER_GAP : PAD * 2;
  const acrossSize = PAD * 2 + widest;
  return {
    nodes: stages.map((stage, index) => {
      const u = start(layerOf[index]);
      const v = slot.get(index)!;
      return {
        name: stage.name,
        x: horizontal ? u : v,
        y: horizontal ? v : u,
        w: nodeWidth,
        h: NODE_H,
        row: layerOf[index],
      };
    }),
    edges,
    width: horizontal ? alongSize : acrossSize,
    height: horizontal ? acrossSize : alongSize,
  };
}

/**
 * Layout of the stage graph (shown top to bottom; "horizontal" turns it into
 * a row from left to right, with the arrows below it). Stages run strictly one after another, so they
 * form a single vertical column in execution order: placing two stages side by
 * side would suggest they can run in parallel. Dependencies are drawn to the
 * right of the column. All arrows leaving a stage share one line: it leaves
 * the right side of the stage, runs down a lane, and branches off into the
 * right side of each dependent stage. Each stage owns its own lane, so arrows
 * of different stages can be told apart; the first stage gets the lane
 * nearest to the column, the next stage one further out, and so on. A lane is
 * reused by a later stage only when their lines do not overlap.
 */
export const NODE_H = 64;
export const GAP_Y = 44;
/** Gap between stages when the column is laid out as a row. */
export const GAP_X = 44;
export const PAD = 32;
export const MIN_NODE_W = 196;
export const MAX_NODE_W = 360;
/** Distance from the stage column to the first lane. */
export const LANE_START = 28;
export const LANE_GAP = 14;
/** Where along a stage's far side arrows come in (first part) and go out (last part), as a fraction. */
const IN_Y = 0.3;
const OUT_Y = 0.7;
const CORNER = 8;
const ARROW = 5;

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
  /** Position in the column, same as the stage's index. */
  row: number;
}

export interface GraphEdge {
  from: string;
  /** Index of the `from` stage. */
  source: number;
  to: string;
  /** This edge alone: out of `from`, down its lane, into `to`. */
  path: string;
  lane: number;
}

/** All edges leaving one stage, drawn as one line with a branch per target. */
export interface GraphTrunk {
  from: string;
  /** Index of the `from` stage. */
  source: number;
  to: string[];
  path: string;
  lane: number;
}

export interface GraphLayout {
  nodes: GraphNode[];
  edges: GraphEdge[];
  trunks: GraphTrunk[];
  width: number;
  height: number;
}

interface Trunk {
  from: number;
  to: number[];
  last: number;
  lane: number;
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

/** Shared node width: enough for the longest name, within limits. */
export function nodeWidthFor(names: string[]): number {
  const longest = Math.max(0, ...names.map((name) => [...name].length));
  return Math.min(MAX_NODE_W, Math.max(MIN_NODE_W, 58 + 8 * longest));
}

export function layoutGraph(
  stages: GraphStage[],
  { nodeWidth, direction = "vertical" }: { nodeWidth: number; direction?: Direction },
): GraphLayout {
  // Everything is worked out along the flow (u: down a column, or along a
  // row) and across it (v), then turned into x and y at the end.
  const horizontal = direction === "horizontal";
  const along = horizontal ? nodeWidth : NODE_H; // size of a stage along the flow
  const across = horizontal ? NODE_H : nodeWidth;
  const step = along + (horizontal ? GAP_X : GAP_Y);
  const pt = (u: number, v: number) => (horizontal ? `${u},${v}` : `${v},${u}`);
  const start = (index: number) => PAD + index * step;

  // Dependencies on missing, later or own stages are ignored, never fatal.
  const indexOf = new Map<string, number>();
  const targets = stages.map(() => [] as number[]);
  stages.forEach((stage, to) => {
    for (const name of new Set(stage.depends_on)) {
      const from = indexOf.get(name);
      if (from !== undefined) targets[from].push(to);
    }
    indexOf.set(stage.name, to);
  });

  const trunks: Trunk[] = [];
  targets.forEach((to, from) => {
    if (to.length) trunks.push({ from, to, last: to[to.length - 1], lane: 0 });
  });

  // Lanes in stage order, each on the nearest lane whose lines do not overlap
  // it (touching at a stage is fine, since arrows come in before and leave
  // after the middle of a stage).
  const lanes: Trunk[][] = [];
  for (const trunk of trunks) {
    let lane = lanes.findIndex((used) => used.every((o) => o.last <= trunk.from || trunk.last <= o.from));
    if (lane === -1) lane = lanes.push([]) - 1;
    lanes[lane].push(trunk);
    trunk.lane = lane;
  }

  const edge = PAD + across; // far side of the stages, across the flow
  const tip = edge + 2;
  const uOut = (index: number) => start(index) + OUT_Y * along;
  const uIn = (index: number) => start(index) + IN_Y * along;
  const arrow = (u: number) =>
    ` M${pt(u - ARROW + 1, tip + ARROW)} L${pt(u, tip)} L${pt(u + ARROW - 1, tip + ARROW)}`;
  const laneV = (trunk: Trunk) => edge + LANE_START + trunk.lane * LANE_GAP;
  /** From the stage, along its lane, into the stage at `last`. */
  const run = (trunk: Trunk, last: number) => {
    const v = laneV(trunk);
    const u1 = uOut(trunk.from);
    const u2 = uIn(last);
    return (
      `M${pt(u1, edge)} L${pt(u1, v - CORNER)} Q${pt(u1, v)} ${pt(u1 + CORNER, v)}` +
      ` L${pt(u2 - CORNER, v)} Q${pt(u2, v)} ${pt(u2, v - CORNER)} L${pt(u2, tip)}` +
      arrow(u2)
    );
  };

  const edges: GraphEdge[] = [];
  const merged: GraphTrunk[] = trunks.map((trunk) => {
    for (const to of trunk.to) {
      edges.push({ from: stages[trunk.from].name, source: trunk.from, to: stages[to].name, path: run(trunk, to), lane: trunk.lane });
    }
    const v = laneV(trunk);
    const branches = trunk.to
      .slice(0, -1)
      .map((to) => ` M${pt(uIn(to), v)} L${pt(uIn(to), tip)}${arrow(uIn(to))}`)
      .join("");
    return {
      from: stages[trunk.from].name,
      source: trunk.from,
      to: trunk.to.map((to) => stages[to].name),
      path: run(trunk, trunk.last) + branches,
      lane: trunk.lane,
    };
  });

  const gutter = lanes.length ? LANE_START + (lanes.length - 1) * LANE_GAP : 0;
  const acrossSize = PAD * 2 + (stages.length ? across + gutter : 0);
  const alongSize = stages.length ? PAD * 2 + stages.length * along + (stages.length - 1) * (step - along) : PAD * 2;
  return {
    nodes: stages.map((stage, index) => ({
      name: stage.name,
      x: horizontal ? start(index) : PAD,
      y: horizontal ? PAD : start(index),
      w: nodeWidth,
      h: NODE_H,
      row: index,
    })),
    edges,
    trunks: merged,
    width: horizontal ? alongSize : acrossSize,
    height: horizontal ? acrossSize : alongSize,
  };
}

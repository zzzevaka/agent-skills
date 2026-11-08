/**
 * Layered layout of the stage graph, ported from the previous visualization
 * page. A stage's row is the longest dependency path leading to it. An edge
 * that spans several rows gets a narrow waypoint in every row it crosses, so
 * it runs beside the stages in between instead of behind them. Within a row,
 * items are ordered by the mean position of their predecessors to reduce
 * crossings; ties keep execution order, with waypoints after stages.
 */
export const NODE_H = 64;
export const GAP_X = 20;
export const GAP_Y = 44;
export const PAD = 32;
export const MIN_NODE_W = 196;
export const MAX_NODE_W = 360;
export const WAYPOINT_W = 16;
const EDGE_SPREAD = 18;

export interface GraphStage {
  name: string;
  depends_on: string[];
}

export interface GraphNode {
  name: string;
  x: number;
  y: number;
  w: number;
  row: number;
}

export interface GraphEdge {
  from: string;
  to: string;
  path: string;
}

export interface GraphLayout {
  nodes: GraphNode[];
  edges: GraphEdge[];
  width: number;
  height: number;
}

interface Item {
  name: string | null; // null for a waypoint
  index: number;
  row: number;
  w: number;
  x: number;
  y: number;
  preds: Item[];
}

interface Link {
  from: string;
  to: string;
  hops: Item[];
  x1: number;
  x2: number;
}

/** Shared node width: enough for the longest name, within limits. */
export function nodeWidthFor(names: string[]): number {
  const longest = Math.max(0, ...names.map((name) => [...name].length));
  return Math.min(MAX_NODE_W, Math.max(MIN_NODE_W, 58 + 8 * longest));
}

const cx = (item: Item) => item.x + item.w / 2;

function hop(x1: number, y1: number, x2: number, y2: number): string {
  const stub = 10;
  const top = y1 + stub;
  const bottom = y2 - stub;
  const dy = Math.max(16, (bottom - top) / 2);
  return ` L${x1},${top} C${x1},${top + dy} ${x2},${bottom - dy} ${x2},${bottom} L${x2},${y2}`;
}

export function layoutGraph(
  stages: GraphStage[],
  { nodeWidth }: { nodeWidth: number },
): GraphLayout {
  // Dependencies on missing, later or own stages are ignored, never fatal.
  const byName = new Map<string, Item>();
  const stageItems: { item: Item; deps: Item[] }[] = [];
  stages.forEach((stage, index) => {
    const deps = [...new Set(stage.depends_on)]
      .map((name) => byName.get(name))
      .filter((dep): dep is Item => dep !== undefined);
    const row = Math.max(-1, ...deps.map((dep) => dep.row)) + 1;
    const item: Item = { name: stage.name, index, row, w: nodeWidth, x: 0, y: 0, preds: [] };
    byName.set(stage.name, item);
    stageItems.push({ item, deps });
  });

  const rows: Item[][] = [];
  for (const { item } of stageItems) (rows[item.row] ??= []).push(item);

  const links: Link[] = [];
  for (const { item, deps } of stageItems) {
    for (const dep of deps) {
      const hops: Item[] = [dep];
      for (let row = dep.row + 1; row < item.row; row += 1) {
        const waypoint: Item = {
          name: null,
          index: item.index,
          row,
          w: WAYPOINT_W,
          x: 0,
          y: 0,
          preds: [hops[hops.length - 1]],
        };
        rows[row].push(waypoint);
        hops.push(waypoint);
      }
      item.preds.push(hops[hops.length - 1]);
      hops.push(item);
      links.push({ from: dep.name!, to: item.name!, hops, x1: 0, x2: 0 });
    }
  }

  const center = (item: Item) =>
    item.preds.length ? item.preds.reduce((sum, p) => sum + cx(p), 0) / item.preds.length : item.index;
  const rowWidth = (row: Item[]) => row.reduce((sum, n) => sum + n.w, 0) + (row.length - 1) * GAP_X;
  const graphWidth = rows.length ? Math.max(...rows.map(rowWidth)) : 0;

  rows.forEach((row, y) => {
    row.sort(
      (a, b) =>
        center(a) - center(b) || Number(a.name === null) - Number(b.name === null) || a.index - b.index,
    );
    let x = PAD + (graphWidth - rowWidth(row)) / 2;
    for (const item of row) {
      item.x = x;
      item.y = PAD + y * (NODE_H + GAP_Y);
      x += item.w + GAP_X;
    }
  });

  // Spread several edges along a stage's edge, ordered by their neighbouring
  // hops so that they do not cross.
  const spread = (list: Link[], neighbour: (link: Link) => Item, assign: (link: Link, dx: number) => void, centreX: number) => {
    list.sort((a, b) => cx(neighbour(a)) - cx(neighbour(b)));
    list.forEach((link, i) => assign(link, centreX + (i - (list.length - 1) / 2) * EDGE_SPREAD));
  };
  for (const { item } of stageItems) {
    spread(links.filter((l) => l.hops[0] === item), (l) => l.hops[1], (l, x) => (l.x1 = x), cx(item));
    spread(links.filter((l) => l.hops[l.hops.length - 1] === item), (l) => l.hops[l.hops.length - 2], (l, x) => (l.x2 = x), cx(item));
  }

  const edges: GraphEdge[] = links.map((link) => {
    const src = link.hops[0];
    const dst = link.hops[link.hops.length - 1];
    let x = link.x1;
    let y = src.y + NODE_H;
    let path = `M${x},${y}`;
    for (const waypoint of link.hops.slice(1, -1)) {
      path += hop(x, y, cx(waypoint), waypoint.y);
      x = cx(waypoint);
      y = waypoint.y + NODE_H;
      path += ` L${x},${y}`;
    }
    const y2 = dst.y - 3;
    path += hop(x, y, link.x2, y2) + ` M${link.x2 - 4},${y2 - 5} L${link.x2},${y2} L${link.x2 + 4},${y2 - 5}`;
    return { from: link.from, to: link.to, path };
  });

  return {
    nodes: stageItems.map(({ item }) => ({
      name: item.name!,
      x: item.x,
      y: item.y,
      w: item.w,
      row: item.row,
    })),
    edges,
    width: PAD * 2 + graphWidth,
    height: rows.length
      ? PAD * 2 + rows.length * NODE_H + (rows.length - 1) * GAP_Y
      : PAD * 2,
  };
}

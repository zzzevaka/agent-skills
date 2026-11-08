import {
  GAP_X,
  MAX_NODE_W,
  MIN_NODE_W,
  NODE_H,
  PAD,
  layoutGraph,
  nodeWidthFor,
} from "../src/ui/layoutGraph";

const W = 200;
const stage = (name: string, ...depends_on: string[]) => ({ name, depends_on });
const layout = (stages: ReturnType<typeof stage>[]) => layoutGraph(stages, { nodeWidth: W });
const node = (result: ReturnType<typeof layout>, name: string) =>
  result.nodes.find((n) => n.name === name)!;

describe("layoutGraph", () => {
  it("layout_rows_follow_longest_path", () => {
    const result = layout([stage("a"), stage("b", "a"), stage("c", "a", "b")]);
    expect(result.nodes.map((n) => [n.name, n.row])).toEqual([
      ["a", 0],
      ["b", 1],
      ["c", 2],
    ]);
    expect(node(result, "b").y).toBe(PAD + NODE_H + 44);
  });

  it("skip_edge_gets_waypoint_so_it_runs_beside_the_stage_in_between", () => {
    const result = layout([stage("a"), stage("b", "a"), stage("c", "a", "b")]);
    const curves = (from: string, to: string) =>
      (result.edges.find((e) => e.from === from && e.to === to)!.path.match(/C/g) ?? []).length;
    expect(curves("a", "b")).toBe(1);
    expect(curves("a", "c")).toBe(2);
  });

  it("single_stage_flow", () => {
    const result = layout([stage("only")]);
    expect(result.nodes).toEqual([{ name: "only", x: PAD, y: PAD, w: W, row: 0 }]);
    expect(result.edges).toEqual([]);
    expect(result.width).toBe(2 * PAD + W);
    expect(result.height).toBe(2 * PAD + NODE_H);
  });

  it("no_dependencies_puts_every_stage_in_row_zero_in_order", () => {
    const result = layout([stage("a"), stage("b"), stage("c")]);
    expect(result.nodes.map((n) => n.row)).toEqual([0, 0, 0]);
    expect(node(result, "b").x - node(result, "a").x).toBe(W + GAP_X);
    expect(node(result, "c").x - node(result, "b").x).toBe(W + GAP_X);
  });

  it("narrower_rows_are_centred_under_the_widest_row", () => {
    const result = layout([stage("a"), stage("b", "a"), stage("c", "a"), stage("d", "a")]);
    const row1Width = 3 * W + 2 * GAP_X;
    expect(node(result, "a").x).toBe(PAD + (row1Width - W) / 2);
    expect(result.width).toBe(2 * PAD + row1Width);
  });

  it("nodes_in_a_row_never_overlap", () => {
    const result = layout([
      stage("a"),
      stage("b", "a"),
      stage("c", "a"),
      stage("d", "a"),
      stage("e", "b", "c", "d"),
      stage("f", "a", "e"),
    ]);
    const rows = new Map<number, { x: number; w: number }[]>();
    for (const n of result.nodes) rows.set(n.row, [...(rows.get(n.row) ?? []), n]);
    for (const row of rows.values()) {
      const sorted = [...row].sort((p, q) => p.x - q.x);
      sorted.slice(1).forEach((n, i) => expect(n.x).toBeGreaterThanOrEqual(sorted[i].x + sorted[i].w));
    }
  });

  it("edge_starts_at_the_bottom_centre_of_its_source", () => {
    const result = layout([stage("a"), stage("b", "a")]);
    const a = node(result, "a");
    const path = result.edges[0].path;
    expect(path.startsWith(`M${a.x + a.w / 2},${a.y + NODE_H}`)).toBe(true);
  });

  it("edges_reference_existing_nodes", () => {
    const result = layout([stage("a"), stage("b", "a"), stage("c", "a", "b")]);
    const names = new Set(result.nodes.map((n) => n.name));
    expect(result.edges).toHaveLength(3);
    for (const e of result.edges) {
      expect(names.has(e.from)).toBe(true);
      expect(names.has(e.to)).toBe(true);
    }
  });

  it("invalid_dependencies_are_ignored_instead_of_crashing", () => {
    const result = layout([stage("a", "a", "b", "ghost"), stage("b", "a")]);
    expect(result.edges.map((e) => `${e.from}>${e.to}`)).toEqual(["a>b"]);
    expect(result.nodes).toHaveLength(2);
  });

  it("empty_flow_has_only_padding", () => {
    const result = layout([]);
    expect(result).toEqual({ nodes: [], edges: [], width: 2 * PAD, height: 2 * PAD });
  });

  it("stage_names_that_look_like_prototype_keys_work", () => {
    const result = layout([stage("constructor"), stage("toString", "constructor")]);
    expect(result.edges.map((e) => `${e.from}>${e.to}`)).toEqual(["constructor>toString"]);
  });
});

describe("nodeWidthFor", () => {
  it("is_clamped_between_min_and_max", () => {
    expect(nodeWidthFor(["a"])).toBe(MIN_NODE_W);
    expect(nodeWidthFor(["x".repeat(200)])).toBe(MAX_NODE_W);
  });

  it("grows_with_the_longest_name", () => {
    expect(nodeWidthFor(["a".repeat(30)])).toBeGreaterThan(nodeWidthFor(["a".repeat(20)]));
    expect(nodeWidthFor(["a", "a".repeat(30)])).toBe(nodeWidthFor(["a".repeat(30)]));
  });

  it("handles_no_stages", () => {
    expect(nodeWidthFor([])).toBe(MIN_NODE_W);
  });
});

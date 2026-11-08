import {
  GAP_X,
  GAP_Y,
  LANE_GAP,
  LANE_START,
  MAX_NODE_W,
  MIN_NODE_W,
  NODE_H,
  PAD,
  edgeHue,
  layoutGraph,
  nodeWidthFor,
} from "../src/ui/layoutGraph";

const W = 200;
const stage = (name: string, ...depends_on: string[]) => ({ name, depends_on });
const layout = (stages: ReturnType<typeof stage>[]) => layoutGraph(stages, { nodeWidth: W });
const node = (result: ReturnType<typeof layout>, name: string) =>
  result.nodes.find((n) => n.name === name)!;
const edge = (result: ReturnType<typeof layout>, from: string, to: string) =>
  result.edges.find((e) => e.from === from && e.to === to)!;

describe("layoutGraph", () => {
  it("stages_form_one_column_in_execution_order_even_without_dependencies", () => {
    const result = layout([stage("a"), stage("b"), stage("c", "a")]);
    expect(result.nodes.map((n) => [n.name, n.row, n.x])).toEqual([
      ["a", 0, PAD],
      ["b", 1, PAD],
      ["c", 2, PAD],
    ]);
    expect(node(result, "b").y).toBe(PAD + NODE_H + GAP_Y);
    expect(node(result, "c").y).toBe(PAD + 2 * (NODE_H + GAP_Y));
  });

  it("single_stage_flow", () => {
    const result = layout([stage("only")]);
    expect(result.nodes).toEqual([{ name: "only", x: PAD, y: PAD, w: W, h: NODE_H, row: 0 }]);
    expect(result.edges).toEqual([]);
    expect(result.width).toBe(2 * PAD + W);
    expect(result.height).toBe(2 * PAD + NODE_H);
  });

  it("empty_flow_has_only_padding", () => {
    const result = layout([]);
    expect(result).toEqual({ nodes: [], edges: [], trunks: [], width: 2 * PAD, height: 2 * PAD });
  });

  it("edges_run_in_a_gutter_to_the_right_of_the_column", () => {
    const result = layout([stage("a"), stage("b", "a")]);
    const right = PAD + W;
    const { path } = edge(result, "a", "b");
    expect(path.startsWith(`M${right},`)).toBe(true);
    const xs = [...path.matchAll(/[ML]\s*(-?[\d.]+),/g)].map((m) => Number(m[1]));
    expect(Math.min(...xs)).toBeGreaterThanOrEqual(right);
    expect(result.width).toBe(2 * PAD + W + LANE_START);
  });

  it("no_gutter_without_dependencies", () => {
    expect(layout([stage("a"), stage("b")]).width).toBe(2 * PAD + W);
  });

  it("arrow_leaves_below_and_enters_above_the_middle_of_a_stage", () => {
    const result = layout([stage("a"), stage("b", "a")]);
    const a = node(result, "a");
    const b = node(result, "b");
    const { path } = edge(result, "a", "b");
    const y1 = Number(path.match(/^M[\d.]+,([\d.]+)/)![1]);
    const y2 = Number(path.match(/L[\d.]+,([\d.]+) M/)![1]);
    expect(y1).toBeGreaterThan(a.y + NODE_H / 2);
    expect(y1).toBeLessThan(a.y + NODE_H);
    expect(y2).toBeGreaterThan(b.y);
    expect(y2).toBeLessThan(b.y + NODE_H / 2);
  });

  it("every_declared_dependency_is_drawn_even_when_implied_by_others", () => {
    const result = layout([stage("a"), stage("b", "a"), stage("c", "a", "b"), stage("d", "a", "c")]);
    expect(result.edges.map((e) => `${e.from}>${e.to}`)).toEqual(["a>b", "a>c", "a>d", "b>c", "c>d"]);
  });

  it("arrows_leaving_one_stage_share_one_line_with_a_branch_per_target", () => {
    const result = layout([stage("a"), stage("b", "a"), stage("c", "a"), stage("d", "a")]);
    expect(result.trunks).toHaveLength(1);
    expect(result.trunks[0]).toMatchObject({ from: "a", to: ["b", "c", "d"], lane: 0 });
    expect(result.edges.map((e) => e.lane)).toEqual([0, 0, 0]);
    expect(result.width).toBe(2 * PAD + W + LANE_START);
  });

  it("each_source_gets_its_own_lane_the_first_stage_nearest", () => {
    const names = Array.from({ length: 6 }, (_, i) => `s${i}`);
    const result = layout(names.map((n, i) => stage(n, ...names.slice(0, i))));
    expect(result.trunks.map((t) => [t.from, t.lane])).toEqual([
      ["s0", 0],
      ["s1", 1],
      ["s2", 2],
      ["s3", 3],
      ["s4", 4],
    ]);
    expect(result.edges).toHaveLength(15);
    expect(result.width).toBe(2 * PAD + W + LANE_START + 4 * LANE_GAP);
  });

  it("lines_that_do_not_overlap_reuse_a_lane", () => {
    const result = layout([stage("a"), stage("b", "a"), stage("c", "b"), stage("d", "c")]);
    expect(result.trunks.map((t) => t.lane)).toEqual([0, 0, 0]);
    expect(result.width).toBe(2 * PAD + W + LANE_START);
  });

  it("lines_in_the_same_lane_never_overlap", () => {
    const stages = [
      stage("a"),
      stage("b", "a"),
      stage("c", "a"),
      stage("d", "b"),
      stage("e", "c", "b"),
      stage("f", "a", "e", "d"),
    ];
    const result = layout(stages);
    const index = new Map(stages.map((s, i) => [s.name, i]));
    const range = (t: (typeof result.trunks)[number]) => [index.get(t.from)!, index.get(t.to[t.to.length - 1])!];
    for (const p of result.trunks) {
      for (const q of result.trunks) {
        if (p === q || p.lane !== q.lane) continue;
        const [p1, p2] = range(p);
        const [q1, q2] = range(q);
        expect(p2 <= q1 || q2 <= p1).toBe(true);
      }
    }
  });

  it("each_stage_has_one_exit_and_one_entry_point", () => {
    const result = layout([stage("a"), stage("b"), stage("c", "a", "b"), stage("d", "a", "b", "c")]);
    const exit = (from: string) => new Set(result.edges.filter((e) => e.from === from).map((e) => e.path.match(/^M[\d.]+,([\d.]+)/)![1]));
    const entry = (to: string) => new Set(result.edges.filter((e) => e.to === to).map((e) => e.path.match(/L[\d.]+,([\d.]+) M/)![1]));
    expect(exit("a").size).toBe(1);
    expect(exit("b").size).toBe(1);
    expect(entry("c").size).toBe(1);
    expect(entry("d").size).toBe(1);
  });

  it("edges_reference_existing_nodes", () => {
    const result = layout([stage("a"), stage("b", "a"), stage("c", "b")]);
    const names = new Set(result.nodes.map((n) => n.name));
    expect(result.edges).toHaveLength(2);
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

  it("stage_names_that_look_like_prototype_keys_work", () => {
    const result = layout([stage("constructor"), stage("toString", "constructor")]);
    expect(result.edges.map((e) => `${e.from}>${e.to}`)).toEqual(["constructor>toString"]);
  });
});

describe("layoutGraph horizontal", () => {
  const horizontal = (stages: ReturnType<typeof stage>[]) =>
    layoutGraph(stages, { nodeWidth: W, direction: "horizontal" });

  it("stages_form_one_row_left_to_right_in_execution_order", () => {
    const result = horizontal([stage("a"), stage("b"), stage("c", "a")]);
    expect(result.nodes.map((n) => [n.name, n.row, n.y])).toEqual([
      ["a", 0, PAD],
      ["b", 1, PAD],
      ["c", 2, PAD],
    ]);
    expect(result.nodes.map((n) => n.x)).toEqual([PAD, PAD + W + GAP_X, PAD + 2 * (W + GAP_X)]);
  });

  it("arrows_run_in_a_gutter_below_the_row", () => {
    const result = horizontal([stage("a"), stage("b", "a")]);
    const bottom = PAD + NODE_H;
    const { path } = result.edges[0];
    expect(path.match(/^M[\d.]+,([\d.]+)/)![1]).toBe(String(bottom));
    const ys = [...path.matchAll(/[\d.]+,([\d.]+)/g)].map((m) => Number(m[1]));
    expect(Math.min(...ys)).toBeGreaterThanOrEqual(bottom);
    expect(result.height).toBe(2 * PAD + NODE_H + LANE_START);
    expect(result.width).toBe(2 * PAD + 2 * W + GAP_X);
  });

  it("is_the_vertical_layout_turned_a_quarter", () => {
    const stages = [stage("a"), stage("b", "a"), stage("c", "a", "b")];
    const v = layout(stages);
    const h = horizontal(stages);
    expect(h.edges.map((e) => `${e.from}>${e.to}:${e.lane}`)).toEqual(v.edges.map((e) => `${e.from}>${e.to}:${e.lane}`));
    expect(h.trunks.map((t) => t.lane)).toEqual(v.trunks.map((t) => t.lane));
  });

  it("empty_flow_has_only_padding", () => {
    expect(horizontal([])).toEqual({ nodes: [], edges: [], trunks: [], width: 2 * PAD, height: 2 * PAD });
  });
});

describe("edgeHue", () => {
  it("neighbouring_stages_get_clearly_different_hues", () => {
    for (let i = 0; i < 30; i += 1) {
      const gap = Math.abs(edgeHue(i) - edgeHue(i + 1));
      expect(Math.min(gap, 360 - gap)).toBeGreaterThan(90);
    }
  });

  it("hues_avoid_the_green_that_means_finished", () => {
    for (let i = 0; i < 200; i += 1) {
      expect(edgeHue(i) < 120 || edgeHue(i) >= 200).toBe(true);
    }
  });

  it("first_hues_are_all_distinct_and_valid", () => {
    const hues = Array.from({ length: 12 }, (_, i) => edgeHue(i));
    expect(new Set(hues).size).toBe(12);
    for (const h of hues) {
      expect(h).toBeGreaterThanOrEqual(0);
      expect(h).toBeLessThan(360);
    }
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

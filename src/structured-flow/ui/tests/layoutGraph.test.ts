import {
  LAYER_GAP,
  MAX_NODE_W,
  MIN_NODE_W,
  NODE_H,
  PAD,
  SIBLING_GAP,
  MIN_FIT_SCALE,
  edgeHue,
  fitScale,
  layoutGraph,
  nodeWidthFor,
  type GraphNode,
} from "../src/ui/layoutGraph";

const W = 200;
const stage = (name: string, ...depends_on: string[]) => ({ name, depends_on });
type Stages = ReturnType<typeof stage>[];
const layout = (stages: Stages, direction: "vertical" | "horizontal" = "vertical") =>
  layoutGraph(stages, { nodeWidth: W, direction });
const node = (result: ReturnType<typeof layout>, name: string) =>
  result.nodes.find((n) => n.name === name)!;
const edge = (result: ReturnType<typeof layout>, from: string, to: string) =>
  result.edges.find((e) => e.from === from && e.to === to)!;

/** Every `x,y` pair in an SVG path string. */
const points = (path: string): [number, number][] =>
  [...path.matchAll(/(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/g)].map((m) => [Number(m[1]), Number(m[2])]);
const inside = (n: GraphNode, [x, y]: [number, number]) =>
  x > n.x && x < n.x + n.w && y > n.y && y < n.y + n.h;
const expectNoPointInsideANode = (result: ReturnType<typeof layout>) => {
  // Implied edges are only drawn on selection, behind the stages, so they may pass them.
  for (const e of result.edges.filter((edge) => !edge.implied)) {
    for (const p of points(e.path)) {
      for (const n of result.nodes) {
        expect(inside(n, p), `${e.from}>${e.to} point ${p} inside ${n.name}`).toBe(false);
      }
    }
  }
};

/** A deterministic pseudo-random flow: each stage depends on earlier ones with probability `p`. */
const randomFlow = (seed: number, count: number, p: number): Stages => {
  let state = seed;
  const next = () => (state = (state * 1103515245 + 12345) % 2147483648) / 2147483648;
  return Array.from({ length: count }, (_, i) =>
    stage(`s${i}`, ...Array.from({ length: i }, (_, d) => d).filter(() => next() < p).map((d) => `s${d}`)),
  );
};

const dense = (count: number): Stages =>
  Array.from({ length: count }, (_, i) =>
    stage(`s${i}`, ...[i - 1, i - 3, i - 4].filter((d) => d >= 0).map((d) => `s${d}`)),
  );

describe("layoutGraph", () => {
  it("a_chain_forms_one_column", () => {
    const result = layout([stage("a"), stage("b", "a"), stage("c", "b")]);
    expect(result.nodes.map((n) => [n.name, n.row, n.x, n.y])).toEqual([
      ["a", 0, PAD, PAD],
      ["b", 1, PAD, PAD + NODE_H + LAYER_GAP],
      ["c", 2, PAD, PAD + 2 * (NODE_H + LAYER_GAP)],
    ]);
    expect(result.width).toBe(2 * PAD + W);
  });

  it("independent_stages_sit_side_by_side", () => {
    const result = layout([stage("a"), stage("b")]);
    const [a, b] = result.nodes;
    expect(a.y).toBe(b.y);
    expect([a.row, b.row]).toEqual([0, 0]);
    expect(b.x).toBe(a.x + W + SIBLING_GAP);
    expect(result.width).toBe(2 * PAD + 2 * W + SIBLING_GAP);
  });

  it("a_stage_is_one_layer_below_its_deepest_dependency", () => {
    const result = layout([stage("a"), stage("b", "a"), stage("c", "b"), stage("d", "a", "c")]);
    expect(result.nodes.map((n) => n.row)).toEqual([0, 1, 2, 3]);
  });

  it("a_diamond_is_centred_under_and_over_its_branches", () => {
    const result = layout([stage("a"), stage("b", "a"), stage("c", "a"), stage("d", "b", "c")]);
    expect(result.nodes.map((n) => n.row)).toEqual([0, 1, 1, 2]);
    const centre = (name: string) => node(result, name).x + W / 2;
    const middle = (centre("b") + centre("c")) / 2;
    expect(centre("a")).toBe(middle);
    expect(centre("d")).toBe(middle);
  });

  it("stages_are_ordered_by_the_position_of_their_parents", () => {
    const result = layout([stage("a"), stage("b"), stage("c", "b"), stage("d", "a")]);
    expect(node(result, "d").x).toBeLessThan(node(result, "c").x);
  });

  it("every_declared_dependency_is_an_edge_and_the_ones_other_paths_imply_are_marked", () => {
    const result = layout([stage("a"), stage("b", "a"), stage("c", "a", "b")]);
    expect(result.edges.map((e) => [`${e.from}>${e.to}`, e.implied])).toEqual([
      ["a>b", false],
      ["a>c", true],
      ["b>c", false],
    ]);
    expect(result.edges.map((e) => e.source)).toEqual([0, 0, 1]);
  });

  it("dependencies_on_unrelated_stages_are_not_implied", () => {
    const result = layout([stage("a"), stage("b"), stage("c", "a", "b")]);
    expect(result.edges.map((e) => e.implied)).toEqual([false, false]);
  });

  it("a_dependency_implied_through_a_longer_path_is_marked", () => {
    const result = layout([stage("a"), stage("b", "a"), stage("c", "b"), stage("d", "a", "c")]);
    expect(edge(result, "a", "d").implied).toBe(true);
    expect(edge(result, "c", "d").implied).toBe(false);
  });

  it("implied_edges_take_no_waypoints_so_a_stage_feeding_everything_leaves_a_clean_chain", () => {
    const result = layout([
      stage("init"),
      stage("a", "init"),
      stage("b", "init", "a"),
      stage("c", "init", "a", "b"),
      stage("d", "init", "a", "b", "c"),
    ]);
    expect(result.width).toBe(2 * PAD + W);
    expect(new Set(result.nodes.map((n) => n.x)).size).toBe(1);
  });

  it("an_implied_edge_runs_straight_from_the_parent_to_the_child_ignoring_layers_between", () => {
    const result = layout([stage("a"), stage("b", "a"), stage("c", "a", "b")]);
    const a = node(result, "a");
    const c = node(result, "c");
    const { path } = edge(result, "a", "c");
    expect(path.startsWith(`M${a.x + W / 2},${a.y + NODE_H}`)).toBe(true);
    expect(points(path)).toContainEqual([c.x + W / 2, c.y]);
    expect(path.match(/C/g)).toHaveLength(1); // one curve, so no waypoint in the layer between
    expect(path.match(/L/g)).toHaveLength(2); // only the two strokes of the arrowhead
  });

  it("edges_run_from_the_far_side_of_the_parent_to_the_near_side_of_the_child", () => {
    const result = layout([stage("a"), stage("b", "a")]);
    const a = node(result, "a");
    const b = node(result, "b");
    const { path } = edge(result, "a", "b");
    expect(path.startsWith(`M${a.x + W / 2},${a.y + NODE_H}`)).toBe(true);
    expect(points(path)).toContainEqual([b.x + W / 2, b.y]);
  });

  it("a_long_edge_goes_around_the_stages_in_the_layers_it_skips", () => {
    const result = layout([
      stage("x"),
      stage("y0"),
      stage("y1", "y0"),
      stage("y2", "y1"),
      stage("y3", "y2"),
      stage("z", "x", "y3"),
    ]);
    expect(node(result, "z").row).toBe(4);
    expect(edge(result, "x", "z").implied).toBe(false);
    expect(edge(result, "x", "z").path).toContain("L");
    expectNoPointInsideANode(result);
  });

  it("no_arrow_point_is_inside_a_node_in_a_dense_flow", () => {
    expectNoPointInsideANode(layout(dense(12)));
  });

  it("no_arrow_point_is_inside_a_node_in_random_flows", () => {
    for (let seed = 1; seed <= 40; seed += 1) {
      const flow = randomFlow(seed, 5 + (seed % 25), [0.05, 0.1, 0.2][seed % 3]);
      expectNoPointInsideANode(layout(flow));
      expectNoPointInsideANode(layout(flow, "horizontal"));
    }
  });

  it("a_long_dependency_beside_a_chain_does_not_bend_the_chain", () => {
    const result = layout([
      stage("plan"),
      stage("implement", "plan"),
      stage("test", "implement"),
      stage("review", "test", "plan"),
    ]);
    const xs = result.nodes.map((n) => n.x);
    expect(Math.max(...xs) - Math.min(...xs)).toBeLessThan(1);
  });

  it("a_chain_with_a_dependency_from_every_stage_stays_straight", () => {
    const chain = Array.from({ length: 8 }, (_, i) => stage(`s${i}`, ...(i ? [`s${i - 1}`] : [])));
    const result = layout([...chain, stage("last", ...chain.map((c) => c.name))]);
    const xs = result.nodes.map((n) => n.x);
    expect(Math.max(...xs) - Math.min(...xs)).toBeLessThan(1);
    expectNoPointInsideANode(result);
  });

  it("invalid_dependencies_are_ignored_instead_of_crashing", () => {
    const result = layout([
      stage("a", "a", "later", "missing"),
      stage("b", "a", "a"),
      stage("later"),
    ]);
    expect(result.edges.map((e) => `${e.from}>${e.to}`)).toEqual(["a>b"]);
  });

  it("stage_names_that_look_like_prototype_keys_work", () => {
    const result = layout([stage("__proto__"), stage("constructor", "__proto__")]);
    expect(result.edges.map((e) => `${e.from}>${e.to}`)).toEqual(["__proto__>constructor"]);
  });

  it("single_stage_flow", () => {
    const result = layout([stage("only")]);
    expect(result.nodes).toEqual([{ name: "only", x: PAD, y: PAD, w: W, h: NODE_H, row: 0 }]);
    expect(result.edges).toEqual([]);
    expect(result.width).toBe(2 * PAD + W);
    expect(result.height).toBe(2 * PAD + NODE_H);
  });

  it("empty_flow_has_only_padding", () => {
    expect(layout([])).toEqual({ nodes: [], edges: [], width: 2 * PAD, height: 2 * PAD });
  });

  it("layout_is_deterministic", () => {
    expect(layout(dense(15))).toEqual(layout(dense(15)));
  });

  it("a_wide_flow_lays_out_quickly", () => {
    const wide = Array.from({ length: 30 }, (_, i) =>
      stage(`s${i}`, ...[1, 2, 3, 4, 5].map((k) => i - k).filter((d) => d >= 0).map((d) => `s${d}`)),
    );
    const started = performance.now();
    layout(wide);
    expect(performance.now() - started).toBeLessThan(500);
  });
});

describe("layoutGraph horizontal", () => {
  it("a_chain_forms_one_row", () => {
    const result = layout([stage("a"), stage("b", "a"), stage("c", "b")], "horizontal");
    expect(result.nodes.map((n) => [n.name, n.x, n.y])).toEqual([
      ["a", PAD, PAD],
      ["b", PAD + W + LAYER_GAP, PAD],
      ["c", PAD + 2 * (W + LAYER_GAP), PAD],
    ]);
    expect(result.height).toBe(2 * PAD + NODE_H);
  });

  it("independent_stages_stack_in_a_column", () => {
    const [a, b] = layout([stage("a"), stage("b")], "horizontal").nodes;
    expect(a.x).toBe(b.x);
    expect(b.y).toBe(a.y + NODE_H + SIBLING_GAP);
  });

  it("a_diamond_runs_left_to_right", () => {
    const result = layout([stage("a"), stage("b", "a"), stage("c", "a"), stage("d", "b", "c")], "horizontal");
    const [a, b, c, d] = result.nodes;
    expect(result.nodes.map((n) => n.row)).toEqual([0, 1, 1, 2]);
    expect(a.x).toBeLessThan(b.x);
    expect(b.x).toBeLessThan(d.x);
    expect(b.x).toBe(c.x);
    expect(b.y).not.toBe(c.y);
    const middle = (b.y + c.y + NODE_H) / 2;
    expect(a.y + NODE_H / 2).toBe(middle);
    expect(d.y + NODE_H / 2).toBe(middle);
  });

  it("no_arrow_point_is_inside_a_node_in_a_dense_flow", () => {
    expectNoPointInsideANode(layout(dense(12), "horizontal"));
  });

  it("empty_flow_has_only_padding", () => {
    expect(layout([], "horizontal")).toEqual({ nodes: [], edges: [], width: 2 * PAD, height: 2 * PAD });
  });
});

describe("fitScale", () => {
  it("does_not_scale_when_the_width_is_unknown_or_the_graph_fits", () => {
    expect(fitScale(0, 900)).toBe(1);
    expect(fitScale(900, 900)).toBe(1);
    expect(fitScale(1200, 900)).toBe(1);
  });

  it("shrinks_a_wider_graph_to_the_available_width", () => {
    expect(fitScale(450, 900)).toBe(0.5);
  });

  it("never_shrinks_below_the_readable_minimum", () => {
    expect(fitScale(100, 5000)).toBe(MIN_FIT_SCALE);
    expect(MIN_FIT_SCALE).toBeGreaterThan(0.2);
    expect(MIN_FIT_SCALE).toBeLessThan(0.6);
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

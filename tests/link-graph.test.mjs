import assert from "node:assert/strict";
import test from "node:test";
import {
  buildGraphModel,
  clusterColor,
  hueOf,
  localNeighborhood,
  nearestProjectedNode,
  nodeMatchesFilter,
  parseNormalizedColor,
  projectOntoGlobe,
  rotateGlobe,
  tagLegend,
  GLOBE_PITCH_LIMIT,
} from "../.test-dist/link-graph.js";

const graph = {
  nodes: [
    { relativePath: "A.md", name: "A", tags: ["x", "y"], cluster: 0 },
    { relativePath: "B.md", name: "B", tags: ["x"], cluster: 0 },
    { relativePath: "C.md", name: "C", tags: [], cluster: 1 },
    { relativePath: "D.md", name: "D", tags: ["z"], cluster: 1 },
  ],
  edges: [
    { source: 0, target: 1 },
    { source: 1, target: 2 },
    { source: 2, target: 3 },
  ],
};

test("buildGraphModel derives neighbours, degree, and seeded positions", () => {
  const model = buildGraphModel(graph, new Map([["B.md", { x: 5, y: -5 }]]));

  assert.deepEqual(
    model.nodes.map((node) => node.degree),
    [1, 2, 2, 1],
  );
  assert.deepEqual([...model.nodes[1].neighbors], [0, 2]);
  assert.equal(model.nodes[1].x, 5);
  assert.equal(model.nodes[0].x, undefined);
  assert.equal(model.links[0].source, model.nodes[0]);
});

test("localNeighborhood walks rings out to the requested depth", () => {
  const model = buildGraphModel(graph);

  const one = localNeighborhood(model, "B.md", 1);
  assert.deepEqual(one.nodes.map((node) => `${node.name}:${node.ring}`), ["A:1", "B:0", "C:1"]);
  assert.equal(one.center.name, "B");
  assert.equal(one.links.length, 2);

  const two = localNeighborhood(model, "A.md", 2);
  assert.deepEqual(two.nodes.map((node) => node.ring), [0, 1, 2]);

  assert.equal(localNeighborhood(model, "Missing.md", 1), null);
  assert.equal(localNeighborhood(model, null, 1), null);
});

test("tagLegend counts tags, sorts by use then name, and honours the limit", () => {
  assert.deepEqual(tagLegend(graph.nodes), [
    ["x", 2],
    ["y", 1],
    ["z", 1],
  ]);
  assert.deepEqual(tagLegend(graph.nodes, 1), [["x", 2]]);
});

test("nodeMatchesFilter combines the name query with the tag filter", () => {
  const [a] = buildGraphModel(graph).nodes;

  assert.equal(nodeMatchesFilter(a, "", null), true);
  assert.equal(nodeMatchesFilter(a, "a", "x"), true);
  assert.equal(nodeMatchesFilter(a, "b", null), false);
  assert.equal(nodeMatchesFilter(a, "", "z"), false);
});

test("colour helpers read hue and luminance from canvas-normalized strings", () => {
  assert.deepEqual(parseNormalizedColor("#ff0000"), [255, 0, 0]);
  assert.deepEqual(parseNormalizedColor("rgba(0, 128, 255, 0.5)"), [0, 128, 255]);
  assert.equal(hueOf([255, 0, 0]), 0);
  assert.equal(hueOf([0, 255, 0]), 120);
  assert.equal(hueOf([0, 0, 255]), 240);
  assert.equal(clusterColor("#2f6846", 150, false, 0), "#2f6846");
  assert.equal(clusterColor("#2f6846", 150, true, 1), "hsl(288 52% 66%)");
});

test("globe projection keeps the origin front and centre and hides the far side", () => {
  const model = buildGraphModel(graph);
  model.nodes[0].x = 0;
  model.nodes[0].y = 0;
  model.nodes[1].x = 100;
  model.nodes[1].y = 0;

  const front = projectOntoGlobe(model.nodes, 200, { lambda: 0, phi: 0 });
  assert.deepEqual(front[0], { x: 0, y: -0, depth: 1 });
  assert.ok(front[1].x > 0);

  const spun = projectOntoGlobe(model.nodes, 200, { lambda: Math.PI, phi: 0 });
  assert.ok(spun[0].depth < 0);

  assert.equal(nearestProjectedNode(model.nodes, front, { x: 2, y: 0 }, 5), model.nodes[0]);
  assert.equal(nearestProjectedNode(model.nodes, spun, { x: 0, y: 0 }, 5), null);
});

test("rotateGlobe scales by pixels per radian and clamps pitch", () => {
  const turned = rotateGlobe({ lambda: 0, phi: 0 }, 100, -50, 100);
  assert.equal(turned.lambda, 1);
  assert.equal(turned.phi, 0.5);

  const pinned = rotateGlobe({ lambda: 0, phi: 0 }, 0, -10_000, 1);
  assert.equal(pinned.phi, GLOBE_PITCH_LIMIT);
});

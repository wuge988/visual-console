import assert from "node:assert/strict";
import test from "node:test";
import { validateCanvasGraph } from "../src/v2-canvas.js";

test("canvas graph accepts frozen node families without granting production authority", () => {
  const graph = validateCanvasGraph({
    schema_version: "1.0",
    title: "Aquarium draft",
    nodes: [
      { id: "piece_1", family: "INPUT", kind: "EXACT_PIECE", label: "Exact Piece", x: 40, y: 80, config: { sku: "DC-ZY-SZ-31001" } },
      { id: "workflow_1", family: "EXECUTION", kind: "WORKFLOW", label: "Workflow", x: 320, y: 80, config: { workflow_code: "SC01" } },
      { id: "gate_1", family: "REVIEW", kind: "HUMAN_GATE", label: "Human Gate", x: 600, y: 80, config: {} },
    ],
    edges: [
      { id: "edge_1", source: "piece_1", target: "workflow_1" },
      { id: "edge_2", source: "workflow_1", target: "gate_1" },
    ],
    viewport: { x: 0, y: 0, zoom: 1 },
  });

  assert.equal(graph.schema_version, "1.0");
  assert.equal(graph.title, "Aquarium draft");
  assert.equal(graph.nodes.length, 3);
  assert.equal(graph.edges.length, 2);
  assert.equal(graph.nodes[0].config.sku, "DC-ZY-SZ-31001");
});

test("canvas graph rejects family drift", () => {
  assert.throws(
    () => validateCanvasGraph({
      title: "bad",
      nodes: [{ id: "n1", family: "OUTPUT", kind: "EXACT_PIECE", label: "bad", x: 0, y: 0, config: {} }],
      edges: [],
      viewport: { x: 0, y: 0, zoom: 1 },
    }),
    /CANVAS_NODE_FAMILY_MISMATCH/,
  );
});

test("canvas graph rejects dangling and self edges", () => {
  const base = {
    title: "bad edges",
    nodes: [
      { id: "n1", family: "INPUT", kind: "EXACT_PIECE", label: "Piece", x: 0, y: 0, config: {} },
      { id: "n2", family: "OUTPUT", kind: "EVIDENCE", label: "Evidence", x: 100, y: 0, config: {} },
    ],
    viewport: { x: 0, y: 0, zoom: 1 },
  };

  assert.throws(
    () => validateCanvasGraph({ ...base, edges: [{ id: "e1", source: "n1", target: "missing" }] }),
    /CANVAS_EDGE_ENDPOINT_INVALID/,
  );
  assert.throws(
    () => validateCanvasGraph({ ...base, edges: [{ id: "e1", source: "n1", target: "n1" }] }),
    /CANVAS_EDGE_ENDPOINT_INVALID/,
  );
});

test("canvas graph constrains unsafe config keys and viewport values", () => {
  const graph = validateCanvasGraph({
    title: "sanitized",
    nodes: [{
      id: "n1",
      family: "PROMPT",
      kind: "PROMPT_DRAFT",
      label: "Prompt",
      x: Number.POSITIVE_INFINITY,
      y: 12,
      config: {
        prompt: "x".repeat(2500),
        "../path": "ignored",
        nested: { unsafe: true },
      },
    }],
    edges: [],
    viewport: { x: 0, y: 0, zoom: 99 },
  });

  assert.equal(graph.nodes[0].x, 0);
  assert.equal(graph.nodes[0].y, 12);
  assert.equal(String(graph.nodes[0].config.prompt).length, 2000);
  assert.equal(graph.nodes[0].config["../path"], undefined);
  assert.equal(graph.nodes[0].config.nested, undefined);
  assert.equal(graph.viewport.zoom, 1);
});

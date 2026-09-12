import type { FastifyInstance } from "fastify";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, readdir, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";

type SiteProfile = {
  site_id: string;
  manifest_root: string;
  control_root?: string;
};

type Dependencies = {
  assertLocalRequest: (req: any) => void;
  loadSite: (siteId: string) => Promise<SiteProfile>;
};

export type CanvasFamily = "INPUT" | "CONTEXT" | "PROMPT" | "EXECUTION" | "REVIEW" | "OUTPUT";

export type CanvasNodeKind =
  | "EXACT_PIECE"
  | "SOURCE_PHOTOS"
  | "CUTOUT"
  | "REFERENCE"
  | "MANIFEST"
  | "MEASUREMENTS"
  | "MATERIAL_BOARD"
  | "PROMPT_TEMPLATE"
  | "PROMPT_DRAFT"
  | "WORKFLOW"
  | "MODEL"
  | "GENERATE"
  | "BATCH"
  | "COMPARE"
  | "AUTOMATED_QA"
  | "HUMAN_GATE"
  | "EVIDENCE"
  | "ARCHIVE_CANDIDATE";

export type CanvasNode = {
  id: string;
  family: CanvasFamily;
  kind: CanvasNodeKind;
  label: string;
  x: number;
  y: number;
  config: Record<string, string | number | boolean | null>;
};

export type CanvasEdge = {
  id: string;
  source: string;
  target: string;
};

export type CanvasGraph = {
  schema_version: "1.0";
  title: string;
  nodes: CanvasNode[];
  edges: CanvasEdge[];
  viewport: { x: number; y: number; zoom: number };
};

type CanvasDraftRecord = CanvasGraph & {
  workflow_id: string;
  site_id: string;
  status: "DRAFT";
  authority: "CANVAS_DRAFT_ONLY";
  production_executable: false;
  current_version: number;
  created_at: string;
  updated_at: string;
};

type CanvasVersionRecord = CanvasDraftRecord & {
  version: number;
  version_id: string;
  saved_at: string;
};

const FAMILY_BY_KIND: Record<CanvasNodeKind, CanvasFamily> = {
  EXACT_PIECE: "INPUT",
  SOURCE_PHOTOS: "INPUT",
  CUTOUT: "INPUT",
  REFERENCE: "INPUT",
  MANIFEST: "CONTEXT",
  MEASUREMENTS: "CONTEXT",
  MATERIAL_BOARD: "CONTEXT",
  PROMPT_TEMPLATE: "PROMPT",
  PROMPT_DRAFT: "PROMPT",
  WORKFLOW: "EXECUTION",
  MODEL: "EXECUTION",
  GENERATE: "EXECUTION",
  BATCH: "EXECUTION",
  COMPARE: "REVIEW",
  AUTOMATED_QA: "REVIEW",
  HUMAN_GATE: "REVIEW",
  EVIDENCE: "OUTPUT",
  ARCHIVE_CANDIDATE: "OUTPUT",
};

const NODE_ID = /^[A-Za-z0-9_-]{1,80}$/;
const WORKFLOW_ID = /^cw_[0-9a-f-]{36}$/i;
const MAX_NODES = 200;
const MAX_EDGES = 500;

function nowIso() {
  return new Date().toISOString();
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function controlRoot(profile: SiteProfile) {
  return profile.control_root ?? join(profile.manifest_root, "visual-console-p2", profile.site_id);
}

function canvasRoot(profile: SiteProfile) {
  return join(controlRoot(profile), "canvas");
}

function workflowsRoot(profile: SiteProfile) {
  return join(canvasRoot(profile), "workflows");
}

function assertWorkflowId(value: string) {
  if (!WORKFLOW_ID.test(value)) throw new Error("CANVAS_WORKFLOW_ID_INVALID");
  return value;
}

function workflowDir(profile: SiteProfile, workflowId: string) {
  return join(workflowsRoot(profile), assertWorkflowId(workflowId));
}

function draftPath(profile: SiteProfile, workflowId: string) {
  return join(workflowDir(profile, workflowId), "draft.json");
}

function versionsDir(profile: SiteProfile, workflowId: string) {
  return join(workflowDir(profile, workflowId), "versions");
}

function versionFilename(version: number) {
  return `v${String(version).padStart(3, "0")}.json`;
}

function finiteNumber(value: unknown, fallback = 0) {
  const number = Number(value);
  if (!Number.isFinite(number) || Math.abs(number) > 100_000) return fallback;
  return number;
}

function safeTitle(value: unknown) {
  const title = String(value ?? "Untitled Workflow").trim().slice(0, 120);
  return title || "Untitled Workflow";
}

function validateConfig(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const result: Record<string, string | number | boolean | null> = {};
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    if (!/^[A-Za-z0-9_.-]{1,64}$/.test(key)) continue;
    if (raw === null || typeof raw === "string" || typeof raw === "boolean") {
      result[key] = typeof raw === "string" ? raw.slice(0, 2000) : raw;
    } else if (typeof raw === "number" && Number.isFinite(raw)) {
      result[key] = raw;
    }
  }
  return result;
}

export function validateCanvasGraph(input: unknown): CanvasGraph {
  const raw = input as any;
  const nodesRaw = Array.isArray(raw?.nodes) ? raw.nodes : [];
  const edgesRaw = Array.isArray(raw?.edges) ? raw.edges : [];
  if (nodesRaw.length > MAX_NODES) throw new Error("CANVAS_NODE_LIMIT_EXCEEDED");
  if (edgesRaw.length > MAX_EDGES) throw new Error("CANVAS_EDGE_LIMIT_EXCEEDED");

  const nodeIds = new Set<string>();
  const nodes: CanvasNode[] = nodesRaw.map((row: any) => {
    const id = String(row?.id ?? "");
    if (!NODE_ID.test(id) || nodeIds.has(id)) throw new Error("CANVAS_NODE_ID_INVALID");
    nodeIds.add(id);
    const kind = String(row?.kind ?? "") as CanvasNodeKind;
    const expectedFamily = FAMILY_BY_KIND[kind];
    if (!expectedFamily) throw new Error("CANVAS_NODE_KIND_INVALID");
    const family = String(row?.family ?? expectedFamily) as CanvasFamily;
    if (family !== expectedFamily) throw new Error("CANVAS_NODE_FAMILY_MISMATCH");
    return {
      id,
      family,
      kind,
      label: String(row?.label ?? kind).trim().slice(0, 120) || kind,
      x: finiteNumber(row?.x),
      y: finiteNumber(row?.y),
      config: validateConfig(row?.config),
    };
  });

  const edgeIds = new Set<string>();
  const edges: CanvasEdge[] = edgesRaw.map((row: any) => {
    const id = String(row?.id ?? "");
    const source = String(row?.source ?? "");
    const target = String(row?.target ?? "");
    if (!NODE_ID.test(id) || edgeIds.has(id)) throw new Error("CANVAS_EDGE_ID_INVALID");
    if (!nodeIds.has(source) || !nodeIds.has(target) || source === target) {
      throw new Error("CANVAS_EDGE_ENDPOINT_INVALID");
    }
    edgeIds.add(id);
    return { id, source, target };
  });

  const zoom = Number(raw?.viewport?.zoom);
  return {
    schema_version: "1.0",
    title: safeTitle(raw?.title),
    nodes,
    edges,
    viewport: {
      x: finiteNumber(raw?.viewport?.x),
      y: finiteNumber(raw?.viewport?.y),
      zoom: Number.isFinite(zoom) && zoom >= 0.25 && zoom <= 2.5 ? zoom : 1,
    },
  };
}

async function writeJsonAtomic(path: string, value: unknown) {
  const temp = `${path}.${randomUUID()}.tmp`;
  await writeFile(temp, `${JSON.stringify(value, null, 2)}\n`, { flag: "wx" });
  await rename(temp, path);
}

async function readDraft(profile: SiteProfile, workflowId: string): Promise<CanvasDraftRecord> {
  const path = draftPath(profile, workflowId);
  if (!existsSync(path)) throw new Error("CANVAS_WORKFLOW_NOT_FOUND");
  const parsed = JSON.parse(await readFile(path, "utf8"));
  const graph = validateCanvasGraph(parsed);
  if (parsed?.workflow_id !== workflowId || parsed?.site_id !== profile.site_id) {
    throw new Error("CANVAS_WORKFLOW_IDENTITY_MISMATCH");
  }
  return {
    ...graph,
    workflow_id: workflowId,
    site_id: profile.site_id,
    status: "DRAFT",
    authority: "CANVAS_DRAFT_ONLY",
    production_executable: false,
    current_version: Number.isInteger(parsed?.current_version) ? Number(parsed.current_version) : 0,
    created_at: String(parsed?.created_at ?? ""),
    updated_at: String(parsed?.updated_at ?? ""),
  };
}

async function saveDraft(profile: SiteProfile, workflowId: string, graph: CanvasGraph, existing?: CanvasDraftRecord) {
  const dir = workflowDir(profile, workflowId);
  await mkdir(versionsDir(profile, workflowId), { recursive: true });
  const timestamp = nowIso();
  const record: CanvasDraftRecord = {
    ...graph,
    workflow_id: workflowId,
    site_id: profile.site_id,
    status: "DRAFT",
    authority: "CANVAS_DRAFT_ONLY",
    production_executable: false,
    current_version: existing?.current_version ?? 0,
    created_at: existing?.created_at || timestamp,
    updated_at: timestamp,
  };
  await mkdir(dir, { recursive: true });
  await writeJsonAtomic(draftPath(profile, workflowId), record);
  return record;
}

async function listDrafts(profile: SiteProfile) {
  const root = workflowsRoot(profile);
  await mkdir(root, { recursive: true });
  const rows: CanvasDraftRecord[] = [];
  for (const entry of await readdir(root, { withFileTypes: true })) {
    if (!entry.isDirectory() || !WORKFLOW_ID.test(entry.name)) continue;
    try {
      rows.push(await readDraft(profile, entry.name));
    } catch {
      // Corrupt/incomplete draft is deliberately omitted from the library rather than promoted.
    }
  }
  return rows.sort((a, b) => b.updated_at.localeCompare(a.updated_at));
}

async function saveVersion(profile: SiteProfile, draft: CanvasDraftRecord) {
  const dir = versionsDir(profile, draft.workflow_id);
  await mkdir(dir, { recursive: true });
  const files = await readdir(dir);
  let max = 0;
  for (const filename of files) {
    const match = /^v(\d{3})\.json$/.exec(filename);
    if (match) max = Math.max(max, Number(match[1]));
  }
  if (max >= 999) throw new Error("CANVAS_VERSION_EXHAUSTED");
  const version = max + 1;
  const savedAt = nowIso();
  const record: CanvasVersionRecord = {
    ...draft,
    current_version: version,
    version,
    version_id: `${draft.workflow_id}@v${String(version).padStart(3, "0")}`,
    saved_at: savedAt,
    updated_at: savedAt,
  };
  const target = join(dir, versionFilename(version));
  await writeFile(target, `${JSON.stringify(record, null, 2)}\n`, { flag: "wx" });
  const updatedDraft: CanvasDraftRecord = { ...draft, current_version: version, updated_at: savedAt };
  await writeJsonAtomic(draftPath(profile, draft.workflow_id), updatedDraft);
  return { version: record, draft: updatedDraft };
}

export async function registerV2CanvasRoutes(app: FastifyInstance, deps: Dependencies) {
  app.get("/api/v2/canvas/workflows", async (req, reply) => {
    try {
      deps.assertLocalRequest(req);
      const siteId = String((req.query as any)?.site_id ?? "drift-curio");
      const profile = await deps.loadSite(siteId);
      const workflows = await listDrafts(profile);
      return {
        ok: true,
        site_id: siteId,
        authority: "CANVAS_DRAFT_ONLY",
        production_executable: false,
        workflows,
      };
    } catch (error) {
      return reply.code(400).send({ error: errorMessage(error) });
    }
  });

  app.get("/api/v2/canvas/workflows/:workflowId", async (req, reply) => {
    try {
      deps.assertLocalRequest(req);
      const siteId = String((req.query as any)?.site_id ?? "drift-curio");
      const workflowId = assertWorkflowId(String((req.params as any)?.workflowId ?? ""));
      const profile = await deps.loadSite(siteId);
      return { ok: true, workflow: await readDraft(profile, workflowId) };
    } catch (error) {
      return reply.code(400).send({ error: errorMessage(error) });
    }
  });

  app.post("/api/v2/canvas/workflows", async (req, reply) => {
    try {
      deps.assertLocalRequest(req);
      const body = req.body as any;
      const profile = await deps.loadSite(String(body?.site_id ?? ""));
      const workflowId = `cw_${randomUUID()}`;
      const graph = validateCanvasGraph({
        schema_version: "1.0",
        title: body?.title,
        nodes: [],
        edges: [],
        viewport: { x: 0, y: 0, zoom: 1 },
      });
      const workflow = await saveDraft(profile, workflowId, graph);
      return { ok: true, workflow };
    } catch (error) {
      return reply.code(400).send({ error: errorMessage(error) });
    }
  });

  app.post("/api/v2/canvas/workflows/:workflowId/draft", async (req, reply) => {
    try {
      deps.assertLocalRequest(req);
      const workflowId = assertWorkflowId(String((req.params as any)?.workflowId ?? ""));
      const body = req.body as any;
      const profile = await deps.loadSite(String(body?.site_id ?? ""));
      const existing = await readDraft(profile, workflowId);
      const graph = validateCanvasGraph(body?.graph);
      const workflow = await saveDraft(profile, workflowId, graph, existing);
      return { ok: true, workflow };
    } catch (error) {
      return reply.code(400).send({ error: errorMessage(error) });
    }
  });

  app.post("/api/v2/canvas/workflows/:workflowId/versions", async (req, reply) => {
    try {
      deps.assertLocalRequest(req);
      const workflowId = assertWorkflowId(String((req.params as any)?.workflowId ?? ""));
      const body = req.body as any;
      const profile = await deps.loadSite(String(body?.site_id ?? ""));
      const existing = await readDraft(profile, workflowId);
      const graph = body?.graph ? validateCanvasGraph(body.graph) : existing;
      const draft = body?.graph ? await saveDraft(profile, workflowId, graph, existing) : existing;
      const saved = await saveVersion(profile, draft);
      return { ok: true, version: saved.version, workflow: saved.draft };
    } catch (error) {
      return reply.code(400).send({ error: errorMessage(error) });
    }
  });
}

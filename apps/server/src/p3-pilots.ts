import type { FastifyInstance } from "fastify";
import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { PipelineCode } from "./canonical-contract.js";

const ROOT = resolve(fileURLToPath(new URL("../../../", import.meta.url)));
const PILOT_REGISTRY_PATH = join(ROOT, "config", "pilots", "p3-registry.json");

export type P3Pilot = {
  pilot_id: string;
  phase: "P3-A" | "P3-B";
  site_id: string;
  item_id: string;
  pipeline: Extract<PipelineCode, "SCENE_IMAGE" | "MODEL_3D">;
  workflow_code: string;
  title_zh: string;
  status: string;
  production_registration: false;
  pdp_blocking: false;
  gates: string[];
  source_contract?: Record<string, unknown>;
  capture_contract?: Record<string, unknown>;
  strategy: Record<string, unknown>;
  candidate_routes?: string[];
  historical_rnd?: Record<string, unknown>;
};

export type P3PilotRegistry = {
  schema_version: string;
  pilots: P3Pilot[];
};

type Dependencies = {
  assertLocalRequest: (req: any) => void;
  loadSite: (siteId: string) => Promise<{ site_id: string }>;
};

function nonEmpty(value: unknown, code: string) {
  if (typeof value !== "string" || !value.trim()) throw new Error(code);
  return value;
}

export function parseP3PilotRegistry(input: unknown): P3PilotRegistry {
  if (!input || typeof input !== "object") throw new Error("P3_PILOT_REGISTRY_INVALID");
  const raw = input as any;
  const schemaVersion = nonEmpty(raw.schema_version, "P3_PILOT_SCHEMA_REQUIRED");
  if (!Array.isArray(raw.pilots)) throw new Error("P3_PILOTS_REQUIRED");

  const seen = new Set<string>();
  const pilots = raw.pilots.map((candidate: any): P3Pilot => {
    const pilotId = nonEmpty(candidate?.pilot_id, "P3_PILOT_ID_REQUIRED");
    if (seen.has(pilotId)) throw new Error(`P3_PILOT_ID_DUPLICATE:${pilotId}`);
    seen.add(pilotId);

    if (!["P3-A", "P3-B"].includes(candidate?.phase)) {
      throw new Error(`P3_PHASE_INVALID:${pilotId}`);
    }
    if (!["SCENE_IMAGE", "MODEL_3D"].includes(candidate?.pipeline)) {
      throw new Error(`P3_PIPELINE_INVALID:${pilotId}`);
    }
    if (candidate.phase === "P3-A" && candidate.pipeline !== "SCENE_IMAGE") {
      throw new Error(`P3A_PIPELINE_MISMATCH:${pilotId}`);
    }
    if (candidate.phase === "P3-B" && candidate.pipeline !== "MODEL_3D") {
      throw new Error(`P3B_PIPELINE_MISMATCH:${pilotId}`);
    }
    if (candidate.production_registration !== false) {
      throw new Error(`P3_PRODUCTION_REGISTRATION_FORBIDDEN:${pilotId}`);
    }
    if (candidate.pdp_blocking !== false) {
      throw new Error(`P3_PDP_BLOCKING_FORBIDDEN:${pilotId}`);
    }
    if (!Array.isArray(candidate.gates) || candidate.gates.length === 0) {
      throw new Error(`P3_GATES_REQUIRED:${pilotId}`);
    }
    const gates = candidate.gates.map((gate: unknown) => nonEmpty(gate, `P3_GATE_INVALID:${pilotId}`));
    if (new Set(gates).size !== gates.length) throw new Error(`P3_GATE_DUPLICATE:${pilotId}`);
    if (!candidate.strategy || typeof candidate.strategy !== "object") {
      throw new Error(`P3_STRATEGY_REQUIRED:${pilotId}`);
    }

    return {
      ...candidate,
      pilot_id: pilotId,
      site_id: nonEmpty(candidate.site_id, `P3_SITE_REQUIRED:${pilotId}`),
      item_id: nonEmpty(candidate.item_id, `P3_ITEM_REQUIRED:${pilotId}`),
      workflow_code: nonEmpty(candidate.workflow_code, `P3_WORKFLOW_REQUIRED:${pilotId}`),
      title_zh: nonEmpty(candidate.title_zh, `P3_TITLE_REQUIRED:${pilotId}`),
      status: nonEmpty(candidate.status, `P3_STATUS_REQUIRED:${pilotId}`),
      gates,
    } as P3Pilot;
  });

  return { schema_version: schemaVersion, pilots };
}

export async function loadP3PilotRegistry(): Promise<P3PilotRegistry> {
  const parsed = JSON.parse(await readFile(PILOT_REGISTRY_PATH, "utf8"));
  return parseP3PilotRegistry(parsed);
}

function publicPilot(pilot: P3Pilot) {
  return {
    ...pilot,
    executable: false,
    authority: "EVALUATION_ONLY",
    next_gate: pilot.gates[0] ?? null,
  };
}

export async function registerP3PilotRoutes(app: FastifyInstance, deps: Dependencies) {
  app.get("/api/v2/pilots", async (req, reply) => {
    try {
      deps.assertLocalRequest(req);
      const siteId = String((req.query as any)?.site_id ?? "drift-curio");
      const profile = await deps.loadSite(siteId);
      const registry = await loadP3PilotRegistry();
      return {
        ok: true,
        site_id: profile.site_id,
        schema_version: registry.schema_version,
        source: "P3_READ_ONLY_PILOT_REGISTRY",
        pilots: registry.pilots.filter((pilot) => pilot.site_id === profile.site_id).map(publicPilot),
      };
    } catch (error) {
      return reply.code(400).send({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  app.get("/api/v2/pilots/:pilotId", async (req, reply) => {
    try {
      deps.assertLocalRequest(req);
      const siteId = String((req.query as any)?.site_id ?? "drift-curio");
      const profile = await deps.loadSite(siteId);
      const pilotId = String((req.params as any)?.pilotId ?? "");
      const registry = await loadP3PilotRegistry();
      const pilot = registry.pilots.find(
        (candidate) => candidate.site_id === profile.site_id && candidate.pilot_id === pilotId,
      );
      if (!pilot) throw new Error("P3_PILOT_NOT_FOUND");
      return { ok: true, site_id: profile.site_id, pilot: publicPilot(pilot) };
    } catch (error) {
      return reply.code(400).send({ error: error instanceof Error ? error.message : String(error) });
    }
  });
}

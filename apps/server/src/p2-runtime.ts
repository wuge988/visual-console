import { createHash, randomUUID } from "node:crypto";
import { createReadStream, createWriteStream, existsSync } from "node:fs";
import { mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { pipeline } from "node:stream/promises";
import { assertInside, sha256File } from "./runtime-utils.js";

export const SC01_FROZEN_SIGNATURE = {
  sensitivity: 1,
  process_res: 1024,
  mask_blur: 0,
  mask_offset: -1,
  invert_output: false,
  refine_foreground: true,
} as const;

export type WorkflowNode = {
  class_type?: string;
  inputs?: Record<string, unknown>;
  [key: string]: unknown;
};

export type ApiWorkflow = Record<string, WorkflowNode>;

export type Sc01Validation = {
  workflow: ApiWorkflow;
  workflowHash: string;
  loadImageNodeId: string;
  rmbgNodeId: string;
};

export type JobState =
  | "READY"
  | "QUEUED"
  | "RUNNING"
  | "GENERATED"
  | "CAPTURED"
  | "QA_PENDING"
  | "QA_PASS"
  | "QA_FAIL"
  | "FAILED_SUBMIT"
  | "FAILED_RUNTIME"
  | "FAILED_CAPTURE"
  | "FAILED_QA";

export type P2Job = {
  job_id: string;
  site_id: string;
  item_id: string;
  workflow_code: "SC01";
  source_asset_id: string;
  source_filename?: string;
  state: JobState;
  created_at: string;
  updated_at: string;
  prompt_id?: string;
  workflow_hash?: string;
  input_filename?: string;
  generated_asset_id?: string;
  generated_filename?: string;
  generated_path?: string;
  generated_sha256?: string;
  generated_size_bytes?: number;
  version?: number;
  qa_note?: string;
  error?: string;
};

export type JournalReadResult = {
  jobs: Map<string, P2Job>;
  tornTailIgnored: boolean;
};

function stable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") {
    const source = value as Record<string, unknown>;
    const result: Record<string, unknown> = {};
    for (const key of Object.keys(source).sort()) result[key] = stable(source[key]);
    return result;
  }
  return value;
}

export function stableJson(value: unknown) {
  return JSON.stringify(stable(value));
}

export function sha256Json(value: unknown) {
  return createHash("sha256").update(stableJson(value)).digest("hex");
}

function finiteNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value))) {
    return Number(value);
  }
  return Number.NaN;
}

function exactBoolean(value: unknown, expected: boolean) {
  return typeof value === "boolean" && value === expected;
}

function matchesFrozenSignature(inputs: Record<string, unknown>) {
  return (
    finiteNumber(inputs.sensitivity) === SC01_FROZEN_SIGNATURE.sensitivity &&
    finiteNumber(inputs.process_res) === SC01_FROZEN_SIGNATURE.process_res &&
    finiteNumber(inputs.mask_blur) === SC01_FROZEN_SIGNATURE.mask_blur &&
    finiteNumber(inputs.mask_offset) === SC01_FROZEN_SIGNATURE.mask_offset &&
    exactBoolean(inputs.invert_output, SC01_FROZEN_SIGNATURE.invert_output) &&
    exactBoolean(inputs.refine_foreground, SC01_FROZEN_SIGNATURE.refine_foreground)
  );
}

export function validateSc01Workflow(value: unknown): Sc01Validation {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("SC01_WORKFLOW_MUST_BE_API_OBJECT");
  }
  const workflow = value as ApiWorkflow;
  const entries = Object.entries(workflow);
  if (!entries.length) throw new Error("SC01_WORKFLOW_EMPTY");

  const loadImageNodes = entries.filter(([, node]) => node?.class_type === "LoadImage");
  if (loadImageNodes.length !== 1) throw new Error("SC01_REQUIRES_EXACTLY_ONE_LOADIMAGE");

  const rmbgNodes = entries.filter(([, node]) => {
    const inputs = node?.inputs;
    return Boolean(inputs && matchesFrozenSignature(inputs));
  });
  if (rmbgNodes.length !== 1) throw new Error("SC01_FROZEN_SIGNATURE_NOT_UNIQUE");

  const [rmbgNodeId, rmbgNode] = rmbgNodes[0];
  const inputs = rmbgNode.inputs ?? {};
  const background = inputs.background;
  if (typeof background === "string" && background.toLowerCase() !== "alpha") {
    throw new Error("SC01_BACKGROUND_MUST_BE_ALPHA");
  }

  return {
    workflow,
    workflowHash: sha256Json(workflow),
    loadImageNodeId: loadImageNodes[0][0],
    rmbgNodeId,
  };
}

export function injectLoadImage(
  workflow: ApiWorkflow,
  loadImageNodeId: string,
  inputFilename: string,
): ApiWorkflow {
  const clone = JSON.parse(JSON.stringify(workflow)) as ApiWorkflow;
  const node = clone[loadImageNodeId];
  if (!node?.inputs) throw new Error("SC01_LOADIMAGE_NODE_MISSING");
  node.inputs.image = inputFilename;
  return clone;
}

export function assertLoopbackComfyUrl(input: string) {
  const url = new URL(input);
  const hostname = url.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (!["127.0.0.1", "localhost", "::1"].includes(hostname)) {
    throw new Error("COMFYUI_MUST_BE_LOOPBACK");
  }
  if (!/^https?:$/.test(url.protocol)) throw new Error("INVALID_COMFYUI_PROTOCOL");
  return url.origin;
}

export function allocateNextVersion(filenames: string[], itemId: string) {
  const escaped = itemId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`^${escaped}__cutout__master__wf-SC01__v(\\d{3})\\.png$`, "i");
  let max = 0;
  for (const filename of filenames) {
    const match = re.exec(filename);
    if (match) max = Math.max(max, Number(match[1]));
  }
  if (max >= 999) throw new Error("SC01_VERSION_EXHAUSTED");
  return max + 1;
}

export function versionedCutoutFilename(itemId: string, version: number) {
  return `${itemId}__cutout__master__wf-SC01__v${String(version).padStart(3, "0")}.png`;
}

export function generatedAssetId(siteId: string, itemId: string, filename: string) {
  return createHash("sha256")
    .update(`${siteId}|${itemId}|SC01|${filename}`)
    .digest("hex")
    .slice(0, 32);
}

export function selectPromptOutput(historyPayload: any, promptId: string) {
  const record = historyPayload?.[promptId] ?? historyPayload;
  if (!record || typeof record !== "object") throw new Error("PROMPT_HISTORY_NOT_FOUND");
  const outputs = record.outputs;
  if (!outputs || typeof outputs !== "object") throw new Error("PROMPT_OUTPUTS_NOT_FOUND");
  const images: Array<{ filename: string; subfolder: string; type: string }> = [];
  for (const output of Object.values(outputs) as any[]) {
    for (const image of output?.images ?? []) {
      if (!image?.filename) continue;
      images.push({
        filename: String(image.filename),
        subfolder: String(image.subfolder ?? ""),
        type: String(image.type ?? "output"),
      });
    }
  }
  const candidates = images.filter(
    (image) => image.type === "output" && /\.png$/i.test(image.filename),
  );
  if (candidates.length !== 1) throw new Error("SC01_PROMPT_OUTPUT_AMBIGUOUS");
  return candidates[0];
}

export function parseJournalText(text: string): JournalReadResult {
  const lines = text.split(/\r?\n/);
  const nonEmptyIndexes = lines
    .map((line, index) => ({ line, index }))
    .filter(({ line }) => line.trim() !== "");
  const lastNonEmpty = nonEmptyIndexes.at(-1)?.index ?? -1;
  const jobs = new Map<string, P2Job>();
  let tornTailIgnored = false;
  for (const { line, index } of nonEmptyIndexes) {
    try {
      const record = JSON.parse(line);
      if (record?.event !== "JOB_SNAPSHOT" || !record?.job?.job_id) continue;
      jobs.set(String(record.job.job_id), record.job as P2Job);
    } catch {
      if (index === lastNonEmpty) {
        tornTailIgnored = true;
        break;
      }
      throw new Error("JOB_JOURNAL_CORRUPT");
    }
  }
  return { jobs, tornTailIgnored };
}

export async function readJournal(path: string): Promise<JournalReadResult> {
  if (!existsSync(path)) return { jobs: new Map(), tornTailIgnored: false };
  return parseJournalText(await readFile(path, "utf8"));
}

export async function appendJobSnapshot(path: string, job: P2Job) {
  await mkdir(join(path, ".."), { recursive: true });
  const { appendFile } = await import("node:fs/promises");
  await appendFile(
    path,
    `${JSON.stringify({ event: "JOB_SNAPSHOT", at: new Date().toISOString(), job })}\n`,
    "utf8",
  );
}

export async function copyVerifiedNoDelete(source: string, target: string) {
  const sourceInfo = await stat(source);
  const sourceHash = await sha256File(source);
  let targetCreated = false;
  const output = createWriteStream(target, { flags: "wx" });
  output.once("open", () => {
    targetCreated = true;
  });
  try {
    await pipeline(createReadStream(source), output);
    const targetInfo = await stat(target);
    if (targetInfo.size !== sourceInfo.size) throw new Error("COPY_SIZE_MISMATCH");
    const targetHash = await sha256File(target);
    if (targetHash !== sourceHash) throw new Error("COPY_SHA256_MISMATCH");
    return { sizeBytes: targetInfo.size, sha256: targetHash };
  } catch (error) {
    if (targetCreated) await rm(target, { force: true }).catch(() => undefined);
    throw error;
  }
}

export type Sc01BindingState = {
  workflow_code: "SC01";
  workflow_status: "REGISTERED";
  workflow_hash: string;
  registered_at: string;
  load_image_node_id: string;
  rmbg_node_id: string;
  workflow_file: string;
};

export async function readBindingState(path: string): Promise<Sc01BindingState | null> {
  if (!existsSync(path)) return null;
  return JSON.parse(await readFile(path, "utf8")) as Sc01BindingState;
}

export async function persistSc01Binding(options: {
  controlRoot: string;
  workflow: ApiWorkflow;
  validation: Sc01Validation;
}) {
  const { controlRoot, workflow, validation } = options;
  const workflowsRoot = join(controlRoot, "workflows");
  await mkdir(workflowsRoot, { recursive: true });
  const workflowPath = join(workflowsRoot, "SC01.api.json");
  const statePath = join(controlRoot, "workflow-state.json");
  assertInside(controlRoot, workflowPath);
  assertInside(controlRoot, statePath);

  const existingState = await readBindingState(statePath);
  if (existingState && existingState.workflow_hash !== validation.workflowHash) {
    throw new Error("SC01_DIFFERENT_HASH_REQUIRES_REBIND");
  }
  if (existingState?.workflow_hash === validation.workflowHash && existsSync(workflowPath)) {
    return existingState;
  }

  if (existsSync(workflowPath)) {
    const existing = JSON.parse(await readFile(workflowPath, "utf8"));
    if (sha256Json(existing) !== validation.workflowHash) {
      throw new Error("SC01_WORKFLOW_FILE_CONFLICT");
    }
  } else {
    await writeFile(workflowPath, `${JSON.stringify(workflow, null, 2)}\n`, { flag: "wx" });
  }

  const state: Sc01BindingState = {
    workflow_code: "SC01",
    workflow_status: "REGISTERED",
    workflow_hash: validation.workflowHash,
    registered_at: existingState?.registered_at ?? new Date().toISOString(),
    load_image_node_id: validation.loadImageNodeId,
    rmbg_node_id: validation.rmbgNodeId,
    workflow_file: workflowPath,
  };
  const temp = `${statePath}.${randomUUID()}.tmp`;
  await writeFile(temp, `${JSON.stringify(state, null, 2)}\n`, "utf8");
  await rename(temp, statePath);
  return state;
}

export async function loadRegisteredWorkflow(state: Sc01BindingState) {
  const raw = JSON.parse(await readFile(state.workflow_file, "utf8"));
  const validation = validateSc01Workflow(raw);
  if (validation.workflowHash !== state.workflow_hash) throw new Error("SC01_BINDING_HASH_MISMATCH");
  return validation.workflow;
}

export function basenameSafe(value: string) {
  if (basename(value) !== value || value.includes("..")) throw new Error("UNSAFE_OUTPUT_FILENAME");
  return value;
}
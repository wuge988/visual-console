import type { P2Job } from "./p2-runtime.js";

/**
 * Canonical business pipeline identifiers.
 * Engines are implementation details; these codes describe business intent.
 */
export type PipelineCode = "PRODUCT_IMAGE" | "SCENE_IMAGE" | "MODEL_3D";

export type GenerationState = "QUEUED" | "RUNNING" | "SUCCEEDED" | "FAILED";
export type QaState = "NOT_REQUIRED" | "QA_PENDING" | "QA_PASS" | "QA_FAIL";
export type ArchiveState =
  | "STAGING"
  | "ARCHIVE_READY"
  | "VERIFIED_ARCHIVE"
  | "REJECTED";

export type ExactPieceRef = {
  site_id: string;
  item_id: string;
};

export type CaptureSessionRef = {
  capture_session_id: string;
  source_asset_ids: string[];
};

export type CanonicalAsset = ExactPieceRef & {
  asset_id: string;
  filename: string;
  kind: "RAW" | "PRODUCT_MASTER" | "SCENE" | "MODEL_3D" | "POSTER" | "DERIVATIVE";
  parent_asset_id?: string;
  sha256?: string;
  size_bytes?: number;
  provenance: {
    pipeline: PipelineCode;
    workflow_code: string;
    workflow_version?: string;
    engine_id?: string;
    engine_version?: string;
  };
};

export type CanonicalQa = {
  qa_id: string;
  asset_id: string;
  state: Exclude<QaState, "NOT_REQUIRED">;
  reviewer?: string;
  note?: string;
  checked_at?: string;
};

export type CanonicalJob = ExactPieceRef & {
  job_id: string;
  pipeline: PipelineCode;
  workflow_code: string;
  source_asset_ids: string[];
  output_asset_ids: string[];
  generation_state: GenerationState;
  qa_state: QaState;
  archive_state: ArchiveState;
  capture_session_id?: string;
  engine_id?: string;
  engine_version?: string;
  created_at: string;
  updated_at: string;
  error?: string;
};

export type CanonicalArchive = ExactPieceRef & {
  asset_id: string;
  archived_at: string;
  state: "VERIFIED_ARCHIVE";
  sha256: string;
  size_bytes: number;
  destination_key: string;
};

export type EngineExecutionContext = {
  job: CanonicalJob;
  inputs: readonly CanonicalAsset[];
};

/**
 * Engines execute work only. They do not own SKU identity, QA, Archive or
 * publication authority.
 */
export type EngineAdapter = {
  readonly engine_id: string;
  readonly engine_version: string;
  execute(context: EngineExecutionContext): Promise<{
    assets: CanonicalAsset[];
    generation_state: "SUCCEEDED" | "FAILED";
    error?: string;
  }>;
};

export function pipelineFromLegacyWorkflow(workflowCode: string): PipelineCode {
  switch (workflowCode) {
    case "SC01":
    case "SW01":
    case "SD01":
      return "PRODUCT_IMAGE";
    case "QA01":
    case "QR01":
    case "QP01":
    case "QC01":
      return "SCENE_IMAGE";
    case "M3D01":
      return "MODEL_3D";
    default:
      throw new Error(`LEGACY_WORKFLOW_NOT_MAPPED:${workflowCode}`);
  }
}

function generatedAssetKind(pipeline: PipelineCode): CanonicalAsset["kind"] {
  if (pipeline === "SCENE_IMAGE") return "SCENE";
  if (pipeline === "MODEL_3D") return "MODEL_3D";
  return "PRODUCT_MASTER";
}

/**
 * Read-only bridge from the validated P2 journal model into the canonical
 * domain model. No files, manifests or archive records are mutated.
 */
export function canonicalJobFromP2(job: P2Job): CanonicalJob {
  const pipeline = pipelineFromLegacyWorkflow(job.workflow_code);
  const generationState: GenerationState = ["READY", "QUEUED"].includes(job.state)
    ? "QUEUED"
    : ["RUNNING", "GENERATED"].includes(job.state)
      ? "RUNNING"
      : ["CAPTURED", "QA_PENDING", "QA_PASS", "QA_FAIL", "FAILED_QA"].includes(job.state)
        ? "SUCCEEDED"
        : "FAILED";

  const qaState: QaState =
    job.state === "QA_PASS"
      ? "QA_PASS"
      : ["QA_FAIL", "FAILED_QA"].includes(job.state)
        ? "QA_FAIL"
        : ["CAPTURED", "QA_PENDING"].includes(job.state)
          ? "QA_PENDING"
          : "NOT_REQUIRED";

  const archiveState: ArchiveState = qaState === "QA_FAIL" ? "REJECTED" : "STAGING";

  return {
    site_id: job.site_id,
    item_id: job.item_id,
    job_id: job.job_id,
    pipeline,
    workflow_code: job.workflow_code,
    source_asset_ids: [job.source_asset_id],
    output_asset_ids: job.generated_asset_id ? [job.generated_asset_id] : [],
    generation_state: generationState,
    qa_state: qaState,
    archive_state: archiveState,
    created_at: job.created_at,
    updated_at: job.updated_at,
    error: job.error,
  };
}

/**
 * Project the immutable/source and generated references already present in
 * the P2 journal into the canonical Asset shape. This is intentionally
 * projection-only: it does not copy, rename, hash, delete or rewrite files.
 */
export function canonicalAssetsFromP2Jobs(jobs: readonly P2Job[]): CanonicalAsset[] {
  const assets = new Map<string, CanonicalAsset>();

  for (const job of jobs) {
    const pipeline = pipelineFromLegacyWorkflow(job.workflow_code);
    const sourceKey = `${job.site_id}:${job.item_id}:${job.source_asset_id}`;
    if (!assets.has(sourceKey)) {
      assets.set(sourceKey, {
        site_id: job.site_id,
        item_id: job.item_id,
        asset_id: job.source_asset_id,
        filename: job.source_filename ?? job.source_asset_id,
        kind: "RAW",
        provenance: {
          pipeline,
          workflow_code: job.workflow_code,
        },
      });
    }

    if (job.generated_asset_id) {
      const generatedKey = `${job.site_id}:${job.item_id}:${job.generated_asset_id}`;
      if (!assets.has(generatedKey)) {
        assets.set(generatedKey, {
          site_id: job.site_id,
          item_id: job.item_id,
          asset_id: job.generated_asset_id,
          filename: job.generated_filename ?? job.generated_asset_id,
          kind: generatedAssetKind(pipeline),
          parent_asset_id: job.source_asset_id,
          sha256: job.generated_sha256,
          size_bytes: job.generated_size_bytes,
          provenance: {
            pipeline,
            workflow_code: job.workflow_code,
            workflow_version: job.version ? `v${job.version}` : undefined,
          },
        });
      }
    }
  }

  return [...assets.values()];
}

export function canonicalQaFromP2Job(job: P2Job): CanonicalQa | null {
  const state = canonicalJobFromP2(job).qa_state;
  if (state === "NOT_REQUIRED") return null;
  const assetId = job.generated_asset_id;
  if (!assetId) return null;

  return {
    qa_id: `qa:${job.job_id}`,
    asset_id: assetId,
    state,
    note: job.qa_note,
    checked_at: job.updated_at,
  };
}

/**
 * Structural projection of the durable archive journal record. Kept
 * structural to avoid coupling the canonical contract to the archive module.
 */
export function canonicalArchiveFromRecord(record: {
  site_id: string;
  item_id: string;
  asset_id: string;
  archived_at: string;
  result: "VERIFIED_ARCHIVE";
  sha256: string;
  size_bytes: number;
  destination_key: string;
}): CanonicalArchive {
  return {
    site_id: record.site_id,
    item_id: record.item_id,
    asset_id: record.asset_id,
    archived_at: record.archived_at,
    state: record.result,
    sha256: record.sha256.toLowerCase(),
    size_bytes: record.size_bytes,
    destination_key: record.destination_key,
  };
}

export function assertCanonicalAssetLineage(asset: CanonicalAsset) {
  if (!asset.asset_id.trim()) throw new Error("ASSET_ID_REQUIRED");
  if (!asset.filename.trim()) throw new Error("ASSET_FILENAME_REQUIRED");
  if (!asset.site_id.trim()) throw new Error("ASSET_SITE_ID_REQUIRED");
  if (!asset.item_id.trim()) throw new Error("ASSET_ITEM_ID_REQUIRED");
  if (!asset.provenance.pipeline) throw new Error("ASSET_PIPELINE_REQUIRED");
  if (!asset.provenance.workflow_code.trim()) throw new Error("ASSET_WORKFLOW_REQUIRED");
  if (asset.sha256 !== undefined && !/^[a-f0-9]{64}$/i.test(asset.sha256)) {
    throw new Error("ASSET_SHA256_INVALID");
  }
  if (
    asset.size_bytes !== undefined &&
    (!Number.isInteger(asset.size_bytes) || asset.size_bytes < 0)
  ) {
    throw new Error("ASSET_SIZE_INVALID");
  }
  return asset;
}

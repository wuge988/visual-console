import { createHash, randomBytes, randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { readCloudRegistry, type CloudRegistry } from "./v2-cloud.js";
import {
  evaluateOpenAIImageSubmit,
  normalizeOpenAIImageSubmit,
  paidProviderNetworkEnabled,
  type NormalizedOpenAIImageSubmit,
  type OpenAIImageSubmitInput,
} from "./v2-openai-image-submit.js";

const AUTHORITY = "OPENAI_IMAGE_EXECUTION_INTENT_ONLY";
const CONFIRM_PHRASE = "EXECUTE ONE OPENAI IMAGE CALL";
const DEFAULT_TTL_MS = 60_000;
const DEFAULT_MAX_ACTIVE_INTENTS = 32;

type Dependencies = {
  assertLocalRequest: (req: any) => void;
};

type ExecutionIntentOptions = {
  credentialConfigured?: (credentialEnv: string) => boolean;
  networkExecutionEnabled?: () => boolean;
};

export type OpenAIImageExecutionIntentInput = OpenAIImageSubmitInput & {
  confirmation_phrase?: unknown;
};

export type NormalizedOpenAIImageExecutionIntent = {
  submit: NormalizedOpenAIImageSubmit;
  confirmation_phrase: typeof CONFIRM_PHRASE;
};

type ExecutionIntentRecord = {
  intent_id: string;
  envelope_fingerprint: string;
  operation_id: string;
  issued_at_ms: number;
  expires_at_ms: number;
};

export type ConsumedOpenAIImageExecutionIntent = {
  intent_id: string;
  operation_id: string;
  issued_at: string;
  expires_at: string;
};

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function tokenHash(token: string) {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function openAIImageExecutionEnvelopeFingerprint(input: NormalizedOpenAIImageSubmit) {
  return createHash("sha256")
    .update(JSON.stringify([
      input.operation_id,
      input.site_id,
      input.item_id,
      input.job_id,
      input.model_key,
      input.prompt,
      input.estimated_cost,
      input.spend.sku,
      input.spend.daily,
      input.spend.monthly,
      input.acknowledge,
    ]), "utf8")
    .digest("hex");
}

export function normalizeOpenAIImageExecutionIntent(
  body: OpenAIImageExecutionIntentInput | null | undefined,
): NormalizedOpenAIImageExecutionIntent {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new Error("OPENAI_IMAGE_EXECUTION_INTENT_REQUEST_INVALID");
  }
  const source = body as Record<string, unknown>;
  if (source.confirmation_phrase !== CONFIRM_PHRASE) {
    throw new Error("OPENAI_IMAGE_EXECUTION_INTENT_CONFIRMATION_REQUIRED");
  }
  const submitSource = { ...source };
  delete submitSource.confirmation_phrase;
  return {
    submit: normalizeOpenAIImageSubmit(submitSource as OpenAIImageSubmitInput),
    confirmation_phrase: CONFIRM_PHRASE,
  };
}

export class OpenAIImageExecutionIntentStore {
  private readonly rows = new Map<string, ExecutionIntentRecord>();
  private readonly now: () => number;
  private readonly ttlMs: number;
  private readonly maxActiveIntents: number;

  constructor(options: {
    now?: () => number;
    ttlMs?: number;
    maxActiveIntents?: number;
  } = {}) {
    this.now = options.now ?? Date.now;
    this.ttlMs = options.ttlMs ?? DEFAULT_TTL_MS;
    this.maxActiveIntents = options.maxActiveIntents ?? DEFAULT_MAX_ACTIVE_INTENTS;
  }

  private pruneExpired() {
    const now = this.now();
    for (const [hash, row] of this.rows) {
      if (row.expires_at_ms <= now) this.rows.delete(hash);
    }
  }

  issue(input: NormalizedOpenAIImageSubmit) {
    this.pruneExpired();
    if (this.rows.size >= this.maxActiveIntents) {
      throw new Error("OPENAI_IMAGE_EXECUTION_INTENT_CAPACITY_EXCEEDED");
    }

    const issuedAtMs = this.now();
    const expiresAtMs = issuedAtMs + this.ttlMs;
    const token = randomBytes(32).toString("base64url");
    const record: ExecutionIntentRecord = {
      intent_id: randomUUID(),
      envelope_fingerprint: openAIImageExecutionEnvelopeFingerprint(input),
      operation_id: input.operation_id,
      issued_at_ms: issuedAtMs,
      expires_at_ms: expiresAtMs,
    };
    this.rows.set(tokenHash(token), record);

    return {
      token,
      intent_id: record.intent_id,
      operation_id: record.operation_id,
      issued_at: new Date(issuedAtMs).toISOString(),
      expires_at: new Date(expiresAtMs).toISOString(),
      single_use: true as const,
    };
  }

  consume(token: string, input: NormalizedOpenAIImageSubmit): ConsumedOpenAIImageExecutionIntent {
    if (!/^[A-Za-z0-9_-]{40,128}$/.test(token)) {
      throw new Error("OPENAI_IMAGE_EXECUTION_INTENT_TOKEN_INVALID");
    }
    const hash = tokenHash(token);
    const record = this.rows.get(hash);
    if (!record) throw new Error("OPENAI_IMAGE_EXECUTION_INTENT_NOT_FOUND_OR_CONSUMED");

    // Delete before any subsequent check: every presentation is single-use and fail-closed.
    this.rows.delete(hash);

    if (record.expires_at_ms <= this.now()) {
      throw new Error("OPENAI_IMAGE_EXECUTION_INTENT_EXPIRED");
    }
    if (record.envelope_fingerprint !== openAIImageExecutionEnvelopeFingerprint(input)) {
      throw new Error("OPENAI_IMAGE_EXECUTION_INTENT_ENVELOPE_MISMATCH");
    }

    return {
      intent_id: record.intent_id,
      operation_id: record.operation_id,
      issued_at: new Date(record.issued_at_ms).toISOString(),
      expires_at: new Date(record.expires_at_ms).toISOString(),
    };
  }
}

export const openAIImageExecutionIntentStore = new OpenAIImageExecutionIntentStore();

export class OpenAIImageExecutionIntentBlockedError extends Error {
  blockers: string[];

  constructor(blockers: string[]) {
    super("OPENAI_IMAGE_EXECUTION_INTENT_BLOCKED");
    this.blockers = [...new Set(blockers)];
  }
}

export function buildOpenAIImageExecutionIntent(
  registry: CloudRegistry,
  input: NormalizedOpenAIImageExecutionIntent,
  options: ExecutionIntentOptions & { store?: OpenAIImageExecutionIntentStore } = {},
) {
  const evaluation = evaluateOpenAIImageSubmit(registry, input.submit, {
    credentialConfigured:
      options.credentialConfigured ?? ((credentialEnv) => Boolean(process.env[credentialEnv])),
    networkExecutionEnabled: options.networkExecutionEnabled ?? paidProviderNetworkEnabled,
  });
  if (!evaluation.executable) {
    throw new OpenAIImageExecutionIntentBlockedError(evaluation.blockers);
  }

  const issued = (options.store ?? openAIImageExecutionIntentStore).issue(input.submit);
  return {
    authority: AUTHORITY,
    execution_intent_issued: true,
    provider_key: evaluation.provider.provider_key,
    model_key: evaluation.model.model_key,
    request_model: evaluation.request_model,
    estimated_cost: input.submit.estimated_cost,
    request: {
      operation_id: input.submit.operation_id,
      site_id: input.submit.site_id,
      item_id: input.submit.item_id,
      job_id: input.submit.job_id,
      prompt_chars: input.submit.prompt.length,
      confirmation_phrase_present: true,
      acknowledgement_present: true,
    },
    execution_intent: issued,
    audit: {
      mutation: false,
      provider_call: false,
      credential_write: false,
      adapter_write: false,
      registry_write: false,
      budget_write: false,
      spend_write: false,
      job_write: false,
      qa_write: false,
      archive_write: false,
      source_write: false,
    },
  };
}

export async function registerV2OpenAIImageExecutionIntentRoutes(
  app: FastifyInstance,
  deps: Dependencies,
) {
  app.post("/api/v2/cloud/openai-image/execution-intent", async (req, reply) => {
    try {
      deps.assertLocalRequest(req);
      const input = normalizeOpenAIImageExecutionIntent(
        (req.body ?? {}) as OpenAIImageExecutionIntentInput,
      );
      const registry = await readCloudRegistry();
      const result = buildOpenAIImageExecutionIntent(registry, input);
      return {
        ok: true,
        generated_at: new Date().toISOString(),
        ...result,
      };
    } catch (error) {
      if (error instanceof OpenAIImageExecutionIntentBlockedError) {
        return reply.code(409).send({
          error: error.message,
          fail_closed: true,
          authority: AUTHORITY,
          execution_intent_issued: false,
          blockers: error.blockers,
          audit: {
            mutation: false,
            provider_call: false,
            spend_write: false,
          },
        });
      }
      return reply.code(400).send({
        error: errorMessage(error),
        fail_closed: true,
        authority: AUTHORITY,
        execution_intent_issued: false,
      });
    }
  });
}

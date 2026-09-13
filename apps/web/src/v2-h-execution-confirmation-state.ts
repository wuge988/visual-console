export type ExecutionConfirmationSnapshot = {
  model: string;
  operationId: string;
  siteId: string;
  itemId: string;
  jobId: string;
  prompt: string;
  estimatedCost: string;
  skuSpend: string;
  dailySpend: string;
  monthlySpend: string;
  confirmationPhrase: string;
  acknowledgement: boolean;
};

export function executionConfirmationFingerprint(snapshot: ExecutionConfirmationSnapshot) {
  return JSON.stringify([
    snapshot.model,
    snapshot.operationId,
    snapshot.siteId,
    snapshot.itemId,
    snapshot.jobId,
    snapshot.prompt,
    snapshot.estimatedCost,
    snapshot.skuSpend,
    snapshot.dailySpend,
    snapshot.monthlySpend,
    snapshot.confirmationPhrase,
    snapshot.acknowledgement,
  ]);
}

export function isExecutionConfirmationFresh(
  validatedFingerprint: string | null,
  snapshot: ExecutionConfirmationSnapshot,
) {
  return validatedFingerprint !== null && validatedFingerprint === executionConfirmationFingerprint(snapshot);
}

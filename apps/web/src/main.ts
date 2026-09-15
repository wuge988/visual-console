import { createApp } from "vue";
import App from "./App.vue";
import V2App from "./V2App.vue";
import V2JobsApp from "./V2JobsApp.vue";
import V2LibraryApp from "./V2LibraryApp.vue";
import V2ProductionApp from "./V2ProductionApp.vue";
import V23DApp from "./V23DApp.vue";
import V2PiecesApp from "./V2PiecesApp.vue";
import V2ReviewApp from "./V2ReviewApp.vue";
import V2ArchiveApp from "./V2ArchiveApp.vue";
import V2CanvasApp from "./V2CanvasApp.vue";
import V2CopilotApp from "./V2CopilotApp.vue";
import V2CloudApp from "./V2CloudApp.vue";
import "./style.css";
import "./readability.css";
import "./p2-review-polish.css";
import "./workspace-v3.css";
import "./p3-archive-entry.css";
import "./p3-archive-entry.js";
import "./p4-sw01-integration.css";
import "./p4-sw01-integration.js";
import "./p4-sd01-integration.css";
import "./p4-sd01-integration.js";

async function bootstrap() {
  const path = window.location.pathname;
  const isV2 = path === "/v2" || path.startsWith("/v2/");
  const isV2Pieces = path === "/v2/pieces" || path.startsWith("/v2/pieces/");
  const isV2Review = path === "/v2/review" || path.startsWith("/v2/review/");
  const isV2Archive = path === "/v2/archive" || path.startsWith("/v2/archive/");
  const isV2Jobs = path === "/v2/jobs" || path.startsWith("/v2/jobs/");
  const isV2Library = path === "/v2/assets" || path.startsWith("/v2/assets/") || path === "/v2/prompts" || path.startsWith("/v2/prompts/");
  const isV23D = path === "/v2/production/3d" || path.startsWith("/v2/production/3d/");
  const isV2Production = path === "/v2/production" || path.startsWith("/v2/production/");
  const isV2Canvas = path === "/v2/canvas" || path.startsWith("/v2/canvas/");
  const isV2Copilot = path === "/v2/copilot" || path.startsWith("/v2/copilot/");
  const isV2Cloud = path === "/v2/cloud" || path.startsWith("/v2/cloud/");
  if (isV2) {
    await import("./v2-shell.css");
    await import("./v2-sidebar-polish.css");
    await import("./v2-b-system.css");
    await import("./v2-g-shell-canvas-integration.css");
    await import("./p2-shell-consolidation.css");
    await import("./p2-canonical-pages.css");
    if (isV2Jobs) await import("./v2-c-jobs.css");
    if (isV2Library) await import("./v2-d-library.css");
    if (isV2Production && !isV23D) await import("./v2-e-production.css");
    if (isV2Canvas) {
      await import("./v2-f-canvas.css");
      await import("./v2-f-gate-polish.css");
    }
    if (isV2Copilot) await import("./v2-g-copilot.css");
    if (isV2Cloud) {
      await import("./v2-h-cloud.css");
      await import("./v2-h-provider-facts-ui.css");
      await import("./v2-h-cost-estimator.css");
      await import("./v2-h-budget-policy-planner.css");
      await import("./v2-h-activation-preflight.css");
      await import("./v2-h-activation-policy-ui.css");
      await import("./v2-h-adapter-registry-ui.css");
      await import("./v2-h-openai-image-submit-preflight-ui.css");
      await import("./v2-h-openai-image-execution-confirmation.css");
      await import("./v2-h-openai-image-execution-intent-ui.css");
      await import("./v2-h-spend-audit-ui.css");
    }
  }
  const Root = isV2Pieces
    ? V2PiecesApp
    : isV2Review
      ? V2ReviewApp
      : isV2Archive
        ? V2ArchiveApp
        : isV2Jobs
          ? V2JobsApp
          : isV2Library
            ? V2LibraryApp
            : isV23D
              ? V23DApp
              : isV2Production
                ? V2ProductionApp
                : isV2Canvas
                  ? V2CanvasApp
                  : isV2Copilot
                    ? V2CopilotApp
                    : isV2Cloud
                      ? V2CloudApp
                      : isV2
                        ? V2App
                        : App;
  createApp(Root).mount("#app");
  if (isV2) {
    const { installV2GCopilotIntegration } = await import("./v2-g-shell-canvas-integration");
    installV2GCopilotIntegration();
    const { installV2HCloudIntegration } = await import("./v2-h-shell-integration");
    installV2HCloudIntegration();
    if (isV2Cloud) {
      const { installV2HProviderFactsUI } = await import("./v2-h-provider-facts-ui");
      installV2HProviderFactsUI();
      const { installV2HCostEstimator } = await import("./v2-h-cost-estimator");
      installV2HCostEstimator();
      const { installV2HBudgetPolicyPlanner } = await import("./v2-h-budget-policy-planner");
      installV2HBudgetPolicyPlanner();
      const { installV2HActivationPreflight } = await import("./v2-h-activation-preflight");
      installV2HActivationPreflight();
      const { installV2HActivationPolicyUI } = await import("./v2-h-activation-policy-ui");
      installV2HActivationPolicyUI();
      const { installV2HAdapterRegistryUI } = await import("./v2-h-adapter-registry-ui");
      installV2HAdapterRegistryUI();
      const { installV2HSpendAuditUI } = await import("./v2-h-spend-audit-ui");
      installV2HSpendAuditUI();
      const { installV2HOpenAIImageSubmitPreflightUI } = await import("./v2-h-openai-image-submit-preflight-ui");
      installV2HOpenAIImageSubmitPreflightUI();
      const { installV2HOpenAIImageExecutionConfirmation } = await import("./v2-h-openai-image-execution-confirmation");
      installV2HOpenAIImageExecutionConfirmation();
      const { installV2HOpenAIImageExecutionIntentUI } = await import("./v2-h-openai-image-execution-intent-ui");
      installV2HOpenAIImageExecutionIntentUI();
    }
    const { installP2V2RouteGuard } = await import("./p2-v2-route-guard");
    installP2V2RouteGuard();
    const { installP2ShellConsolidation } = await import("./p2-shell-consolidation");
    installP2ShellConsolidation();
    const { installP2ChineseLocalization } = await import("./p2-zh-localization");
    installP2ChineseLocalization();
  }
}

void bootstrap();

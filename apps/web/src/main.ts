import { createApp } from "vue";
import App from "./App.vue";
import V2App from "./V2App.vue";
import V2JobsApp from "./V2JobsApp.vue";
import V2LibraryApp from "./V2LibraryApp.vue";
import V2ProductionApp from "./V2ProductionApp.vue";
import V2CanvasApp from "./V2CanvasApp.vue";
import V2CopilotApp from "./V2CopilotApp.vue";
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
  const isV2Jobs = path === "/v2/jobs" || path.startsWith("/v2/jobs/");
  const isV2Library = path === "/v2/assets" || path.startsWith("/v2/assets/") || path === "/v2/prompts" || path.startsWith("/v2/prompts/");
  const isV2Production = path === "/v2/production" || path.startsWith("/v2/production/");
  const isV2Canvas = path === "/v2/canvas" || path.startsWith("/v2/canvas/");
  const isV2Copilot = path === "/v2/copilot" || path.startsWith("/v2/copilot/");
  if (isV2) {
    await import("./v2-shell.css");
    await import("./v2-sidebar-polish.css");
    await import("./v2-b-system.css");
    await import("./v2-g-shell-canvas-integration.css");
    if (isV2Jobs) await import("./v2-c-jobs.css");
    if (isV2Library) await import("./v2-d-library.css");
    if (isV2Production) await import("./v2-e-production.css");
    if (isV2Canvas) {
      await import("./v2-f-canvas.css");
      await import("./v2-f-gate-polish.css");
    }
    if (isV2Copilot) await import("./v2-g-copilot.css");
  }
  const Root = isV2Jobs
    ? V2JobsApp
    : isV2Library
      ? V2LibraryApp
      : isV2Production
        ? V2ProductionApp
        : isV2Canvas
          ? V2CanvasApp
          : isV2Copilot
            ? V2CopilotApp
            : isV2
              ? V2App
              : App;
  createApp(Root).mount("#app");
  if (isV2) {
    const { installV2GCopilotIntegration } = await import("./v2-g-shell-canvas-integration");
    installV2GCopilotIntegration();
  }
}

void bootstrap();

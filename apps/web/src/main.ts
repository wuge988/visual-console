import { createApp } from "vue";
import App from "./App.vue";
import V2App from "./V2App.vue";
import V2JobsApp from "./V2JobsApp.vue";
import V2LibraryApp from "./V2LibraryApp.vue";
import V2ProductionApp from "./V2ProductionApp.vue";
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
  if (isV2) {
    await import("./v2-shell.css");
    await import("./v2-sidebar-polish.css");
    await import("./v2-b-system.css");
    if (isV2Jobs) await import("./v2-c-jobs.css");
    if (isV2Library) await import("./v2-d-library.css");
    if (isV2Production) await import("./v2-e-production.css");
  }
  const Root = isV2Jobs
    ? V2JobsApp
    : isV2Library
      ? V2LibraryApp
      : isV2Production
        ? V2ProductionApp
        : isV2
          ? V2App
          : App;
  createApp(Root).mount("#app");
}

void bootstrap();

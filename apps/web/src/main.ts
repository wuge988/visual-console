import { createApp } from "vue";
import App from "./App.vue";
import V2App from "./V2App.vue";
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
  const isV2 = window.location.pathname === "/v2" || window.location.pathname.startsWith("/v2/");
  if (isV2) await import("./v2-shell.css");
  createApp(isV2 ? V2App : App).mount("#app");
}

void bootstrap();

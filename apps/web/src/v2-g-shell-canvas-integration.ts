type CopilotAction = "ANALYZE_PIECE" | "DRAFT_PROMPT" | "SCENE_PLAN" | "REFERENCE_NEEDS" | "COMPARE_OUTPUTS" | "DIAGNOSE_QA" | "REVISE_PROMPT" | "RETRY_DRAFT";

const COPILOT_PATH = "/v2/copilot";
const ACTION_LABELS: Record<CopilotAction, string> = {
  ANALYZE_PIECE: "Analyze Piece",
  DRAFT_PROMPT: "Draft Prompt Skeleton",
  SCENE_PLAN: "Create Scene Plan",
  REFERENCE_NEEDS: "Suggest Reference Needs",
  COMPARE_OUTPUTS: "Compare Outputs",
  DIAGNOSE_QA: "Diagnose QA Failure",
  REVISE_PROMPT: "Revise Prompt Checklist",
  RETRY_DRAFT: "Create Retry Draft",
};

let observer: MutationObserver | null = null;
let scheduled = false;

function productionGroup() {
  return Array.from(document.querySelectorAll<HTMLElement>(".v2-nav-group")).find((group) => {
    const heading = group.querySelector("h4")?.textContent?.toUpperCase() ?? "";
    return heading.includes("PRODUCTION") || heading.includes("生产");
  }) ?? null;
}

function makeCopilotNavButton() {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "v2-nav-item v2g-shared-copilot-nav";
  button.dataset.v2gCopilotNav = "1";

  const label = document.createElement("span");
  label.textContent = "Visual Copilot";
  const badge = document.createElement("b");
  badge.textContent = "LOCAL";
  button.append(label, badge);
  return button;
}

function ensureSharedCopilotNav() {
  if (!window.location.pathname.startsWith("/v2")) return;
  const group = productionGroup();
  if (!group) return;

  let button = Array.from(group.querySelectorAll<HTMLButtonElement>("button.v2-nav-item")).find((candidate) =>
    (candidate.textContent ?? "").includes("Visual Copilot"),
  );

  if (!button) {
    button = makeCopilotNavButton();
    const creationCanvas = Array.from(group.querySelectorAll<HTMLButtonElement>("button.v2-nav-item")).find((candidate) => {
      const text = candidate.textContent ?? "";
      return text.includes("Creation Canvas") || text.includes("创作画布");
    });
    if (creationCanvas) creationCanvas.insertAdjacentElement("afterend", button);
    else group.append(button);
  }

  button.classList.toggle("active", window.location.pathname.startsWith(COPILOT_PATH));
  if (!button.dataset.v2gCopilotBound) {
    button.dataset.v2gCopilotBound = "1";
    button.addEventListener("click", (event) => {
      event.preventDefault();
      if (!window.location.pathname.startsWith(COPILOT_PATH)) window.location.assign(COPILOT_PATH);
    });
  }
}

function currentCanvasWorkflow() {
  const select = document.querySelector<HTMLSelectElement>(".v2f-workflow-select select");
  if (!select) return { id: "", label: "No saved Canvas workflow" };
  const option = select.selectedOptions?.[0];
  return {
    id: select.value,
    label: option?.textContent?.trim() || "Unsaved Canvas workflow",
  };
}

function openCopilotFromCanvas(action: CopilotAction) {
  const workflow = currentCanvasWorkflow();
  const query = new URLSearchParams({ from: "canvas", action });
  if (workflow.id) query.set("canvas_workflow", workflow.id);
  window.location.assign(`${COPILOT_PATH}?${query.toString()}`);
}

function createCanvasDock() {
  const dock = document.createElement("section");
  dock.className = "v2g-canvas-dock";
  dock.dataset.v2gCanvasDock = "1";
  dock.hidden = true;

  const header = document.createElement("header");
  const title = document.createElement("div");
  const eyebrow = document.createElement("span");
  eyebrow.textContent = "VISUAL COPILOT · CANVAS DOCK";
  const heading = document.createElement("strong");
  heading.textContent = "Local context handoff";
  title.append(eyebrow, heading);
  const badges = document.createElement("div");
  badges.className = "v2g-canvas-dock-badges";
  for (const text of ["DRAFT ONLY", "$0 PROVIDER", "NO MUTATION"]) {
    const badge = document.createElement("span");
    badge.textContent = text;
    badges.append(badge);
  }
  header.append(title, badges);

  const body = document.createElement("div");
  body.className = "v2g-canvas-dock-body";

  const authority = document.createElement("div");
  authority.className = "v2g-canvas-dock-authority";
  const authorityLabel = document.createElement("span");
  authorityLabel.textContent = "Authority";
  const authorityValue = document.createElement("b");
  authorityValue.textContent = "DRAFT_SUGGESTION_ONLY";
  const authorityNote = document.createElement("small");
  authorityNote.textContent = "Canvas remains CANVAS_DRAFT_ONLY. Copilot cannot execute, approve QA, archive, overwrite RAW/source or spend Cloud budget.";
  authority.append(authorityLabel, authorityValue, authorityNote);

  const context = document.createElement("div");
  context.className = "v2g-canvas-dock-context";
  const contextLabel = document.createElement("span");
  contextLabel.textContent = "Canvas context";
  const contextValue = document.createElement("b");
  contextValue.dataset.v2gCanvasContext = "1";
  const workflow = currentCanvasWorkflow();
  contextValue.textContent = workflow.label;
  context.append(contextLabel, contextValue);

  const actions = document.createElement("div");
  actions.className = "v2g-canvas-dock-actions";
  const actionList: Array<[CopilotAction, string]> = [
    ["ANALYZE_PIECE", "Analyze Piece"],
    ["DRAFT_PROMPT", "Draft Prompt"],
    ["SCENE_PLAN", "Scene Plan"],
  ];
  for (const [action, label] of actionList) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = label;
    button.addEventListener("click", () => openCopilotFromCanvas(action));
    actions.append(button);
  }
  const openFull = document.createElement("button");
  openFull.type = "button";
  openFull.className = "primary";
  openFull.textContent = "Open Visual Copilot →";
  openFull.addEventListener("click", () => openCopilotFromCanvas("ANALYZE_PIECE"));
  actions.append(openFull);

  body.append(authority, context, actions);
  dock.append(header, body);
  return dock;
}

function syncCanvasDockContext() {
  const target = document.querySelector<HTMLElement>("[data-v2g-canvas-context='1']");
  if (!target) return;
  target.textContent = currentCanvasWorkflow().label;
}

function ensureCanvasDock() {
  if (!window.location.pathname.startsWith("/v2/canvas")) return;
  const commandActions = document.querySelector<HTMLElement>(".v2f-command-actions");
  const content = document.querySelector<HTMLElement>(".v2f-content");
  if (!commandActions || !content) return;

  let launcher = commandActions.querySelector<HTMLButtonElement>("[data-v2g-copilot-launcher='1']");
  if (!launcher) {
    launcher = document.createElement("button");
    launcher.type = "button";
    launcher.dataset.v2gCopilotLauncher = "1";
    launcher.className = "v2g-canvas-copilot-launcher";
    launcher.textContent = "Copilot";

    const previewButton = Array.from(commandActions.querySelectorAll<HTMLButtonElement>("button")).find((candidate) =>
      (candidate.textContent ?? "").includes("Preview") || (candidate.textContent ?? "").includes("退出预览"),
    );
    if (previewButton) previewButton.insertAdjacentElement("afterend", launcher);
    else commandActions.prepend(launcher);
  }

  let dock = content.querySelector<HTMLElement>("[data-v2g-canvas-dock='1']");
  if (!dock) {
    dock = createCanvasDock();
    const studio = content.querySelector(".v2f-studio");
    if (studio) studio.insertAdjacentElement("beforebegin", dock);
    else content.append(dock);
  }

  if (!launcher.dataset.v2gCopilotBound) {
    launcher.dataset.v2gCopilotBound = "1";
    launcher.addEventListener("click", () => {
      const nextHidden = !dock!.hidden;
      dock!.hidden = nextHidden;
      launcher!.classList.toggle("active", !nextHidden);
      launcher!.setAttribute("aria-expanded", String(!nextHidden));
      if (!nextHidden) syncCanvasDockContext();
    });
  }

  syncCanvasDockContext();
}

function applyCopilotDeepLink() {
  if (!window.location.pathname.startsWith(COPILOT_PATH)) return;
  const params = new URLSearchParams(window.location.search);
  const action = params.get("action") as CopilotAction | null;
  if (!action || !(action in ACTION_LABELS)) return;
  if (document.documentElement.dataset.v2gActionApplied === action) return;

  const label = ACTION_LABELS[action];
  const button = Array.from(document.querySelectorAll<HTMLButtonElement>(".v2g-actions button")).find((candidate) =>
    (candidate.textContent ?? "").includes(label),
  );
  if (!button) return;
  document.documentElement.dataset.v2gActionApplied = action;
  button.click();
}

function sync() {
  ensureSharedCopilotNav();
  ensureCanvasDock();
  applyCopilotDeepLink();
}

function scheduleSync() {
  if (scheduled) return;
  scheduled = true;
  window.requestAnimationFrame(() => {
    scheduled = false;
    sync();
  });
}

export function installV2GCopilotIntegration() {
  if (!window.location.pathname.startsWith("/v2")) return () => undefined;
  sync();
  observer?.disconnect();
  observer = new MutationObserver(scheduleSync);
  const root = document.getElementById("app");
  if (root) observer.observe(root, { childList: true, subtree: true });
  window.addEventListener("popstate", scheduleSync);
  window.addEventListener("change", scheduleSync, true);

  return () => {
    observer?.disconnect();
    observer = null;
    window.removeEventListener("popstate", scheduleSync);
    window.removeEventListener("change", scheduleSync, true);
  };
}

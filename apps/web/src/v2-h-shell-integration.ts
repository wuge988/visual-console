const CLOUD_PATH = "/v2/cloud";
let observer: MutationObserver | null = null;
let scheduled = false;

function systemGroup() {
  return Array.from(document.querySelectorAll<HTMLElement>(".v2-nav-group")).find((group) => {
    const heading = group.querySelector("h4")?.textContent?.toUpperCase() ?? "";
    return heading.includes("SYSTEM") || heading.includes("系统");
  }) ?? null;
}

function makeCloudNavButton() {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "v2-nav-item v2h-shared-cloud-nav";
  button.dataset.v2hCloudNav = "1";
  const label = document.createElement("span");
  label.textContent = "Budget & Providers";
  const badge = document.createElement("b");
  badge.textContent = "LOCKED";
  button.append(label, badge);
  return button;
}

function ensureSharedCloudNav() {
  if (!window.location.pathname.startsWith("/v2")) return;
  const group = systemGroup();
  if (!group) return;
  let button = Array.from(group.querySelectorAll<HTMLButtonElement>("button.v2-nav-item")).find((candidate) =>
    (candidate.textContent ?? "").includes("Budget & Providers"),
  );
  if (!button) {
    button = makeCloudNavButton();
    const workflow = Array.from(group.querySelectorAll<HTMLButtonElement>("button.v2-nav-item")).find((candidate) =>
      (candidate.textContent ?? "").includes("Workflow Registry"),
    );
    if (workflow) workflow.insertAdjacentElement("afterend", button);
    else group.append(button);
  }
  button.classList.toggle("active", window.location.pathname.startsWith(CLOUD_PATH));
  if (!button.dataset.v2hCloudBound) {
    button.dataset.v2hCloudBound = "1";
    button.addEventListener("click", (event) => {
      event.preventDefault();
      if (!window.location.pathname.startsWith(CLOUD_PATH)) window.location.assign(CLOUD_PATH);
    });
  }
}

function sync() { ensureSharedCloudNav(); }
function scheduleSync() {
  if (scheduled) return;
  scheduled = true;
  window.requestAnimationFrame(() => {
    scheduled = false;
    sync();
  });
}

export function installV2HCloudIntegration() {
  if (!window.location.pathname.startsWith("/v2")) return () => undefined;
  sync();
  observer?.disconnect();
  observer = new MutationObserver(scheduleSync);
  const root = document.getElementById("app");
  if (root) observer.observe(root, { childList: true, subtree: true });
  window.addEventListener("popstate", scheduleSync);
  return () => {
    observer?.disconnect();
    observer = null;
    window.removeEventListener("popstate", scheduleSync);
  };
}

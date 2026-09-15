import {
  canonicalAreaLabels,
  canonicalNavigation,
  canonicalPrimaryPath,
  type CanonicalNavArea,
  type CanonicalNavItem,
} from "./p2-canonical-navigation";

const orderedAreas: CanonicalNavArea[] = ["production", "create", "review", "library", "settings"];

function sameRoute(path: string) {
  const current = window.location.pathname;
  if (path === "/v2/production/image") {
    return current === "/v2/production" || current === "/v2/production/image";
  }
  if (path === "/v2/assets") return current === "/v2/assets";
  if (path === "/v2/system") return current === "/v2/system";
  return current === path || (path.startsWith("/v2/") && current.startsWith(`${path}/`));
}

function primaryRouteActive(label: string, path: string) {
  const current = window.location.pathname;
  if (label === "创建") return current === "/v2/production" || current.startsWith("/v2/production/");
  if (label === "审核") return current === "/v2/review" || current.startsWith("/v2/review/");
  if (label === "资产库") return ["/v2/assets", "/v2/archive", "/v2/prompts"].some((prefix) => current === prefix || current.startsWith(`${prefix}/`));
  if (label === "设置") {
    return ["/v2/system", "/v2/models", "/v2/workflows", "/v2/cloud"].some(
      (prefix) => current === prefix || current.startsWith(`${prefix}/`),
    );
  }
  return sameRoute(path);
}

function navigate(path: string) {
  window.location.assign(path);
}

function createNavButton(item: CanonicalNavItem) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "v2-nav-item p2-canonical-nav-item";
  if (sameRoute(item.path)) button.classList.add("active");
  if (item.advanced) button.classList.add("p2-advanced-entry");
  button.dataset.p2Path = item.path;

  const label = document.createElement("span");
  label.textContent = item.label;
  button.append(label);

  if (item.advanced) {
    const badge = document.createElement("small");
    badge.textContent = "高级";
    button.append(badge);
  } else {
    const arrow = document.createElement("span");
    arrow.className = "v2-nav-arrow";
    arrow.textContent = "›";
    button.append(arrow);
  }

  button.addEventListener("click", () => navigate(item.path));
  return button;
}

function installSidebar(sidebar: Element) {
  if (sidebar.querySelector(":scope > .p2-canonical-nav")) return;

  const canonical = document.createElement("div");
  canonical.className = "p2-canonical-nav";
  canonical.dataset.p2Canonical = "true";

  for (const area of orderedAreas) {
    const items = canonicalNavigation.filter((item) => item.area === area);
    if (!items.length) continue;

    const section = document.createElement("section");
    section.className = "v2-nav-group p2-canonical-nav-group";

    const title = document.createElement("h4");
    title.textContent = canonicalAreaLabels[area];
    section.append(title);

    for (const item of items) section.append(createNavButton(item));
    canonical.append(section);
  }

  const legacyNav = sidebar.querySelector(":scope > .v2-nav-scroll");
  if (legacyNav) {
    legacyNav.classList.add("p2-legacy-nav-hidden");
    legacyNav.insertAdjacentElement("beforebegin", canonical);
  } else {
    sidebar.append(canonical);
  }
}

function installToolbar(toolbar: Element) {
  if (toolbar.querySelector(":scope > .p2-primary-toolbar")) return;

  const primary = document.createElement("div");
  primary.className = "v2-tabs p2-primary-toolbar";

  const entries = [
    ["首页", canonicalPrimaryPath.home],
    ["生产", canonicalPrimaryPath.production],
    ["创建", canonicalPrimaryPath.create],
    ["审核", canonicalPrimaryPath.review],
    ["资产库", canonicalPrimaryPath.library],
    ["设置", canonicalPrimaryPath.settings],
  ] as const;

  for (const [label, path] of entries) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = label;
    button.dataset.p2Path = path;
    if (primaryRouteActive(label, path)) button.classList.add("active");
    button.addEventListener("click", () => navigate(path));
    primary.append(button);
  }

  const legacyTabs = toolbar.querySelector(":scope > .v2-tabs");
  if (legacyTabs) legacyTabs.classList.add("p2-legacy-tabs-hidden");
  toolbar.insertAdjacentElement("afterbegin", primary);
}

function focusSettingsSubroute() {
  const current = window.location.pathname;
  const selector = current === "/v2/system/storage"
    ? ".v2-storage-panel"
    : current === "/v2/cloud/budget"
      ? ".v2h-guard"
      : current === "/v2/cloud/advanced"
        ? ".v2h-providers"
        : "";
  if (!selector) return;
  window.requestAnimationFrame(() => document.querySelector(selector)?.scrollIntoView({ block: "start" }));
}

export function installP2ShellConsolidation() {
  if (!window.location.pathname.startsWith("/v2")) return;

  document.querySelectorAll(".v2-sidebar").forEach(installSidebar);
  document.querySelectorAll(".v2-toolbar").forEach(installToolbar);
  focusSettingsSubroute();

  document.documentElement.dataset.p2Ux = "canonical";
}

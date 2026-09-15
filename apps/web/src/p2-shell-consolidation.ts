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
  if (label === "Create") return current === "/v2/production" || current.startsWith("/v2/production/");
  if (label === "Library") return current === "/v2/assets" || current.startsWith("/v2/assets/") || current === "/v2/prompts" || current.startsWith("/v2/prompts/");
  if (label === "Settings") {
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
    badge.textContent = "ADVANCED";
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
    ["Production", canonicalPrimaryPath.production],
    ["Create", canonicalPrimaryPath.create],
    ["Review", canonicalPrimaryPath.review],
    ["Library", canonicalPrimaryPath.library],
    ["Settings", canonicalPrimaryPath.settings],
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

export function installP2ShellConsolidation() {
  if (!window.location.pathname.startsWith("/v2")) return;

  document.querySelectorAll(".v2-sidebar").forEach(installSidebar);
  document.querySelectorAll(".v2-toolbar").forEach(installToolbar);

  document.documentElement.dataset.p2Ux = "canonical";
}

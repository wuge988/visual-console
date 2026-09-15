const legacyRouteMap = new Map<string, string>([
  ["/workspace", "/v2/pieces"],
  ["/qa", "/v2/review"],
  ["/assets", "/v2/archive"],
]);

function normalizedPath(value: string) {
  try {
    return new URL(value, window.location.origin).pathname;
  } catch {
    return value;
  }
}

function routeForElement(element: Element) {
  const anchor = element.closest("a") as HTMLAnchorElement | null;
  if (anchor?.href) {
    const mapped = legacyRouteMap.get(normalizedPath(anchor.href));
    if (mapped) return mapped;
  }

  const button = element.closest("button");
  if (!button) return "";
  const text = (button.textContent ?? "").replace(/\s+/g, " ").trim();
  if (/Human Visual Gate|进入审核|人工视觉审核/.test(text)) return "/v2/review";
  if (/Production Pieces|进入生产工作台|产品件/.test(text)) return "/v2/pieces";
  if (/^Archive$|^归档$/.test(text)) return "/v2/archive";
  return "";
}

export function installP2V2RouteGuard() {
  if (!window.location.pathname.startsWith("/v2")) return;
  document.addEventListener(
    "click",
    (event) => {
      if (!(event.target instanceof Element)) return;
      const mapped = routeForElement(event.target);
      if (!mapped) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      window.location.assign(mapped);
    },
    true,
  );
}

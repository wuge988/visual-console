const ENTRY_ID = "p3-approved-archive-entry";

function syncArchiveEntry() {
  const existing = document.getElementById(ENTRY_ID);
  if (window.location.pathname !== "/assets") {
    existing?.remove();
    return;
  }

  const title = document.querySelector(".content .page-title");
  if (!title || existing) return;

  const link = document.createElement("a");
  link.id = ENTRY_ID;
  link.className = "p3-archive-entry";
  link.href = "/archive.html";
  link.textContent = "正式归档";
  link.title = "将 QA 通过的 Master 按 Gate 15 安全归档到 F 正式资产库";
  title.appendChild(link);
}

const observer = new MutationObserver(() => queueMicrotask(syncArchiveEntry));
observer.observe(document.documentElement, { childList: true, subtree: true });
window.addEventListener("popstate", syncArchiveEntry);
window.addEventListener("load", syncArchiveEntry);
queueMicrotask(syncArchiveEntry);

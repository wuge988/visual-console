type PublicPricing = {
  basis?: string;
  currency?: string;
  text_input_per_million?: number;
  text_cached_input_per_million?: number;
  image_input_per_million?: number;
  image_cached_input_per_million?: number;
  image_output_per_million?: number;
};

type PublicModel = {
  model_key: string;
  snapshot?: string | null;
  display_name: string;
  media_type: string;
  availability_status: string;
  enabled: boolean;
  pricing_status: string;
  pricing?: PublicPricing | null;
  notes?: string;
};

type PublicProvider = {
  provider_key: string;
  display_name: string;
  facts_status?: string;
  facts_verified_at?: string | null;
  source_urls?: string[];
  notes?: string;
  models?: PublicModel[];
};

type CloudProjection = {
  ok: boolean;
  registry: { providers: PublicProvider[] };
};

const API = "http://127.0.0.1:4179/api/v2/cloud";
let disposed = false;
let timer: number | undefined;

function fmtRate(value: number | undefined, label: string) {
  return Number.isFinite(value) ? `$${Number(value).toFixed(2)}/M ${label}` : "";
}

function pricingText(model: PublicModel) {
  if (model.pricing_status !== "KNOWN" || !model.pricing) return "Pricing unresolved · execution blocked";
  const parts = [
    fmtRate(model.pricing.image_output_per_million, "image out"),
    fmtRate(model.pricing.image_input_per_million, "image in"),
    fmtRate(model.pricing.text_input_per_million, "text in"),
  ].filter(Boolean);
  return parts.join(" · ") || "Known public pricing metadata";
}

function factsBadge(provider: PublicProvider) {
  const status = (provider.facts_status ?? "UNVERIFIED").toUpperCase();
  const span = document.createElement("span");
  span.className = `v2h-facts-badge ${status === "VERIFIED" ? "verified" : "partial"}`;
  span.textContent = status;
  return span;
}

function renderProviderFacts(card: HTMLElement, provider: PublicProvider) {
  let root = card.querySelector<HTMLElement>("[data-v2h-provider-facts='1']");
  if (!root) {
    root = document.createElement("section");
    root.dataset.v2hProviderFacts = "1";
    root.className = "v2h-provider-facts";
    card.append(root);
  }
  root.replaceChildren();

  const header = document.createElement("div");
  header.className = "v2h-facts-head";
  const left = document.createElement("div");
  const label = document.createElement("span");
  label.textContent = "CURRENT FACTS";
  const date = document.createElement("small");
  date.textContent = provider.facts_verified_at ? `Verified ${provider.facts_verified_at}` : "Verification date unavailable";
  left.append(label, date);
  header.append(left, factsBadge(provider));
  root.append(header);

  const models = provider.models ?? [];
  if (!models.length) {
    const empty = document.createElement("p");
    empty.className = "v2h-facts-empty";
    empty.textContent = "No current model facts declared.";
    root.append(empty);
  } else {
    const list = document.createElement("div");
    list.className = "v2h-model-facts-list";
    for (const model of models) {
      const row = document.createElement("article");
      const title = document.createElement("div");
      const name = document.createElement("b");
      name.textContent = model.display_name;
      const state = document.createElement("span");
      state.textContent = model.pricing_status === "KNOWN" ? "PRICE KNOWN" : "PRICE UNKNOWN";
      state.className = model.pricing_status === "KNOWN" ? "known" : "unknown";
      title.append(name, state);

      const id = document.createElement("code");
      id.textContent = model.snapshot ? `${model.model_key} · ${model.snapshot}` : model.model_key;
      const availability = document.createElement("small");
      availability.textContent = model.availability_status;
      const pricing = document.createElement("p");
      pricing.textContent = pricingText(model);
      row.append(title, id, availability, pricing);
      list.append(row);
    }
    root.append(list);
  }

  const sources = provider.source_urls ?? [];
  if (sources.length) {
    const sourceRow = document.createElement("div");
    sourceRow.className = "v2h-facts-sources";
    const sourceLabel = document.createElement("span");
    sourceLabel.textContent = `Official sources · ${sources.length}`;
    sourceRow.append(sourceLabel);
    sources.forEach((url, index) => {
      const link = document.createElement("a");
      link.href = url;
      link.target = "_blank";
      link.rel = "noreferrer";
      link.textContent = `Source ${index + 1}`;
      sourceRow.append(link);
    });
    root.append(sourceRow);
  }

  const note = document.createElement("p");
  note.className = "v2h-facts-note";
  note.textContent = provider.notes || "Facts are informational only and do not grant execution authority.";
  root.append(note);
}

function findProviderCard(provider: PublicProvider) {
  return Array.from(document.querySelectorAll<HTMLElement>(".v2h-provider-card")).find((card) => {
    const text = card.textContent ?? "";
    return text.includes(provider.provider_key) || text.includes(provider.display_name);
  }) ?? null;
}

async function syncFacts() {
  if (disposed || !window.location.pathname.startsWith("/v2/cloud")) return;
  try {
    const response = await fetch(API);
    if (!response.ok) return;
    const body = (await response.json()) as CloudProjection;
    for (const provider of body.registry?.providers ?? []) {
      const card = findProviderCard(provider);
      if (card) renderProviderFacts(card, provider);
    }
  } catch {
    // Existing V2-H surface owns the error state; this enhancement stays non-blocking.
  }
}

export function installV2HProviderFactsUI() {
  if (!window.location.pathname.startsWith("/v2/cloud")) return () => undefined;
  disposed = false;
  void syncFacts();
  timer = window.setInterval(() => void syncFacts(), 10_000);
  return () => {
    disposed = true;
    if (timer) window.clearInterval(timer);
    timer = undefined;
  };
}

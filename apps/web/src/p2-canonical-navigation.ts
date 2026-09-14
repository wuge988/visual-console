export type CanonicalNavItem = {
  label: string;
  path?: string;
  legacyPath?: string;
  area: "production" | "create" | "review" | "library" | "settings";
  advanced?: boolean;
};

export const canonicalNavigation: CanonicalNavItem[] = [
  { label: "Production Pieces", path: "/workspace", area: "production" },
  { label: "Product Images", path: "/v2/production", area: "create" },
  { label: "Scene Images", path: "/v2/production/scenes", area: "create" },
  { label: "3D Models", path: "/v2/production/3d", area: "create" },
  { label: "Batch", path: "/v2/production/batch", area: "create" },
  { label: "Human Visual Gate", path: "/qa", area: "review" },
  { label: "Piece Assets", path: "/assets", area: "library" },
  { label: "Archive", path: "/assets", area: "library" },
  { label: "Prompts", path: "/v2/prompts", area: "library" },
  { label: "Engines", path: "/v2/system", area: "settings", advanced: true },
  { label: "Models", path: "/v2/models", area: "settings", advanced: true },
  { label: "Workflows", path: "/v2/workflows", area: "settings", advanced: true },
  { label: "Budget & Providers", path: "/v2/cloud", area: "settings", advanced: true },
];

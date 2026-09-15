export type CanonicalNavArea = "production" | "create" | "review" | "library" | "settings";

export type CanonicalNavItem = {
  label: string;
  path: string;
  area: CanonicalNavArea;
  advanced?: boolean;
};

export const canonicalAreaLabels: Record<CanonicalNavArea, string> = {
  production: "生产 PRODUCTION",
  create: "创建 CREATE",
  review: "审核 REVIEW",
  library: "资产 LIBRARY",
  settings: "设置 SETTINGS",
};

export const canonicalNavigation: CanonicalNavItem[] = [
  { label: "Production Pieces", path: "/workspace", area: "production" },

  { label: "Product Images", path: "/v2/production/image", area: "create" },
  { label: "Scene Images", path: "/v2/production/scene", area: "create" },
  { label: "3D Models", path: "/v2/production/3d", area: "create" },
  { label: "Batch", path: "/v2/production/batch", area: "create" },

  { label: "Human Visual Gate", path: "/qa", area: "review" },

  { label: "Piece Assets", path: "/v2/assets", area: "library" },
  { label: "Archive", path: "/assets", area: "library" },
  { label: "Prompts", path: "/v2/prompts", area: "library" },

  { label: "Engines", path: "/v2/system", area: "settings" },
  { label: "Models", path: "/v2/models", area: "settings" },
  { label: "Budget", path: "/v2/cloud/budget", area: "settings" },
  { label: "Storage", path: "/v2/system/storage", area: "settings" },
  { label: "Advanced", path: "/v2/cloud/advanced", area: "settings", advanced: true },
];

export const canonicalPrimaryPath = {
  home: "/v2",
  production: "/workspace",
  create: "/v2/production/image",
  review: "/qa",
  library: "/v2/assets",
  settings: "/v2/system",
} as const;

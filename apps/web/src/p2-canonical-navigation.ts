export type CanonicalNavArea = "production" | "create" | "review" | "library" | "settings";

export type CanonicalNavItem = {
  label: string;
  path: string;
  area: CanonicalNavArea;
  advanced?: boolean;
};

export const canonicalAreaLabels: Record<CanonicalNavArea, string> = {
  production: "生产",
  create: "创建",
  review: "审核",
  library: "资产库",
  settings: "设置",
};

export const canonicalNavigation: CanonicalNavItem[] = [
  { label: "产品件", path: "/v2/pieces", area: "production" },

  { label: "产品图", path: "/v2/production/image", area: "create" },
  { label: "场景图", path: "/v2/production/scene", area: "create" },
  { label: "3D 模型", path: "/v2/production/3d", area: "create" },
  { label: "批量生成", path: "/v2/production/batch", area: "create" },

  { label: "人工视觉审核", path: "/v2/review", area: "review" },

  { label: "产品素材", path: "/v2/assets", area: "library" },
  { label: "归档", path: "/v2/archive", area: "library" },
  { label: "提示词库", path: "/v2/prompts", area: "library" },

  { label: "引擎", path: "/v2/system", area: "settings" },
  { label: "模型", path: "/v2/models", area: "settings" },
  { label: "预算", path: "/v2/cloud/budget", area: "settings" },
  { label: "存储", path: "/v2/system/storage", area: "settings" },
  { label: "高级设置", path: "/v2/cloud/advanced", area: "settings", advanced: true },
];

export const canonicalPrimaryPath = {
  home: "/v2",
  production: "/v2/pieces",
  create: "/v2/production/image",
  review: "/v2/review",
  library: "/v2/assets",
  settings: "/v2/system",
} as const;

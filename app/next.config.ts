import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  webpack: (config) => {
    const existing = config.watchOptions?.ignored;
    const baseIgnored: string[] = Array.isArray(existing)
      ? (existing as unknown[]).filter((v): v is string => typeof v === "string" && v.length > 0)
      : typeof existing === "string" && existing.length > 0
        ? [existing]
        : [];
    config.watchOptions = {
      ...(config.watchOptions ?? {}),
      ignored: [
        ...baseIgnored,
        "**/node_modules/**",
        "**/.next/**",
        path.resolve(__dirname, "tmp").replace(/\\/g, "/") + "/**",
      ],
    };
    return config;
  },
};

export default nextConfig;

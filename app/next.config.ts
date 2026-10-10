import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  // Phone on the same Wi-Fi (Mike 2026-10-06: "set this up so I can see it on
  // my phone"). Next 16 rejects dev-mode requests for /_next/* from any origin
  // but localhost unless it is allowlisted. Dev only; production is unaffected.
  allowedDevOrigins: ["10.20.0.61", "localhost", "127.0.0.1", "100.76.149.121", "christophoros.taila59e25.ts.net"],
  // The Next dev badge collides with something at every corner on a phone
  // (bottom-left: the carry tray; top-left: the campaign title). Nobody needs
  // it; off (2026-10-06). Compile errors still show their own overlay.
  devIndicators: false,
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

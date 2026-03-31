import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // External packages that should not be bundled (native C++ modules)
  serverExternalPackages: ["better-sqlite3"],
};

export default nextConfig;

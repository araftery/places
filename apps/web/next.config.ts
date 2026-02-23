import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@places/clients", "@places/db"],
};

export default nextConfig;

import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Clean configuration without tiktoken dependencies
  webpack: (config, { isServer }) => {
    // Handle client-side fallbacks for server-only modules
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        net: false,
        tls: false,
      };
    }

    return config;
  },
};

export default nextConfig;

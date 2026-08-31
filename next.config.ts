import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Enables forbidden() / unauthorized() alongside app/forbidden.tsx.
    authInterrupts: true,
  },
  typedRoutes: true,
  serverExternalPackages: ["pg"],
};

export default nextConfig;

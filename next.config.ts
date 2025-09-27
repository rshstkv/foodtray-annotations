import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // CSR page uses useSearchParams; avoid prerender errors on Vercel
    dynamicIO: true,
  },
};

export default nextConfig;

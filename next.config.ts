import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "rrslfpwebprod.blob.core.windows.net",
        pathname: "/lfp-logs/**",
      },
    ],
  },
};

export default nextConfig;

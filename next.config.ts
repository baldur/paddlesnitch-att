import type { NextConfig } from "next";

const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? ''

const nextConfig: NextConfig = {
  basePath,
  async redirects() {
    if (!basePath) return []
    return [
      {
        source: '/',
        destination: basePath,
        permanent: false,
        basePath: false,
      },
    ]
  },
};

export default nextConfig;

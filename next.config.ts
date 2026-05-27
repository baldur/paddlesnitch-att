import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Bundle @aws-sdk into server chunks (Turbopack otherwise externalizes it,
  // creating .next/node_modules/ copies that require @smithy/* deps to be present)
  serverExternalPackages: [],
};

export default nextConfig;

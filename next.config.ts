import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Requests arrive via the local HTTPS proxy (https://127.0.0.1:3001) used for
  // the Schwab OAuth callback, so the dev server sees a cross-origin host.
  // Allow it so HMR / dev resources aren't blocked.
  allowedDevOrigins: ['127.0.0.1', 'localhost'],
};

export default nextConfig;

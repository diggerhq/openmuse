import type { NextConfig } from "next";

// In development the app is usually reached through a tunnel so the
// coordinator's managed connection can call it; allow that host's dev assets.
const devOrigins = [process.env.OPENMUSE_APP_ORIGIN].filter((value): value is string => Boolean(value)).map((value) => new URL(value).host);

const config: NextConfig = {
  allowedDevOrigins: devOrigins,
  reactStrictMode: true,
  poweredByHeader: false,
  agentRules: false,
  turbopack: { root: __dirname },
  headers: async () => [
    {
      source: "/(.*)",
      headers: [
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "X-Frame-Options", value: "DENY" },
        { key: "Referrer-Policy", value: "same-origin" },
      ],
    },
  ],
};

export default config;

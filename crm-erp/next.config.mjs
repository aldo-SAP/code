const prod = process.env.NODE_ENV === "production";
const appHost = process.env.APP_URL ? new URL(process.env.APP_URL).host : null;

const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${prod ? "" : " 'unsafe-eval'"}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "connect-src 'self'",
  "frame-ancestors 'none'",
  "form-action 'self' https://login.microsoftonline.com",
  "base-uri 'self'",
  "object-src 'none'",
].join("; ");

/** @type {import('next').NextConfig} */
export default {
  reactStrictMode: true,
  poweredByHeader: false,
  agentRules: false, // Next 16.4 otherwise writes an AGENTS.md of AI-tool instructions into the project on `next dev`
  serverExternalPackages: ["@electric-sql/pglite", "postgres"],
  experimental: appHost ? { serverActions: { allowedOrigins: [appHost] } } : {},
  async headers() {
    return [{
      source: "/:path*",
      headers: [
        { key: "Content-Security-Policy", value: csp },
        { key: "X-Frame-Options", value: "DENY" },
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "Referrer-Policy", value: "same-origin" },
        { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
        ...(prod ? [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" }] : []),
        { key: "Cache-Control", value: "no-store" },
      ],
    }];
  },
  // Turbopack (the Next 16 default) reads the "@/*" paths and the explicit .ts imports from tsconfig.json, so no bundler settings are needed.
  turbopack: {},
};

import path from "node:path";
import { fileURLToPath } from "node:url";
const root = path.dirname(fileURLToPath(import.meta.url));
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
  webpack(config) {
    config.resolve.alias["@"] = root;
    // lib/ files import each other with explicit .ts so they also run under plain node (tests, seed)
    config.resolve.extensionAlias = { ".ts": [".ts", ".tsx", ".js"], ".js": [".ts", ".tsx", ".js"] };
    return config;
  },
};

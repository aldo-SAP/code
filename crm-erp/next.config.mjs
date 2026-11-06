import path from "node:path";
import { fileURLToPath } from "node:url";
const root = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
export default {
  reactStrictMode: true,
  webpack(config) {
    config.resolve.alias["@"] = root;
    // lib/ files import each other with explicit .ts so they also run under plain node (tests, seed)
    config.resolve.extensionAlias = { ".ts": [".ts", ".tsx", ".js"], ".js": [".ts", ".tsx", ".js"] };
    return config;
  },
};

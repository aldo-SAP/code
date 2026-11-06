import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Talent CRM", short_name: "Talent CRM", description: "Timesheets, leave and invoicing", start_url: "/", scope: "/", display: "standalone",
    background_color: "#f6f7f9", theme_color: "#2f5bea",
    icons: [{ src: "/icon-192.png", sizes: "192x192", type: "image/png" }, { src: "/icon-512.png", sizes: "512x512", type: "image/png" }, { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" }],
  };
}

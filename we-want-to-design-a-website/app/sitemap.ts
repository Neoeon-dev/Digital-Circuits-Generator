import type { MetadataRoute } from "next";

const routes = ["/", "/logic-solver", "/circuit-lab", "/seven-segment", "/workspace"];

export default function sitemap(): MetadataRoute.Sitemap {
  const base = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
  return routes.map((path) => ({
    url: `${base}${path}`,
    lastModified: new Date(),
  }));
}

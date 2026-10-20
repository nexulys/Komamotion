import type { MetadataRoute } from "next";
import { SITE } from "@/lib/site-config";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/projects", "/editor", "/billing", "/account", "/admin", "/api"] },
    sitemap: `${SITE.url}/sitemap.xml`,
  };
}

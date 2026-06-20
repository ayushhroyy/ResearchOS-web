import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Edge-friendly deployment on Cloudflare (via @opennextjs/cloudflare).
  // Supabase JS + openai SDK use HTTP/fetch — no Node-only drivers.
  // PDF rendering (pdfjs) and PDF export (print CSS) happen client-side.
  // Pin the turbopack root so a stray parent lockfile doesn't confuse it.
  turbopack: { root: __dirname },
  experimental: {
    serverActions: {
      bodySizeLimit: "10mb",
    },
  },
};

export default nextConfig;

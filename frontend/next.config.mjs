// Orígenes adicionales permitidos para Server Actions detrás del proxy/CDN de Emergent (lista separada por comas, admite comodines).
const forwardedOrigins = (process.env.ALLOWED_FORWARDED_ORIGINS || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
const appHost = process.env.APP_URL ? new URL(process.env.APP_URL).host : null;

/** @type {import('next').NextConfig} */
const nextConfig = {
  poweredByHeader: false,
  // Servidor Next.js estándar (`next start`): sirve public/ y .next/static desde el proyecto (sin output "standalone").
  experimental: {
    instrumentationHook: true,
    serverComponentsExternalPackages: ["mongodb"],
    serverActions: { allowedOrigins: [...(appHost ? [appHost] : []), ...forwardedOrigins] },
  },
  webpack: (config, { isServer }) => {
    if (isServer) config.externals = [...(config.externals || []), "mongodb"];
    return config;
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "images.unsplash.com",
        pathname: "/**",
      },
      {
        protocol: "https",
        hostname: "plus.unsplash.com",
        pathname: "/**",
      },
    ],
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
        ],
      },
      {
        // Solo el dominio final es indexable; preview y dominios de Emergent: noindex
        source: "/:path*",
        missing: [{ type: "host", value: "(www\\.)?espacioq\\.es" }],
        headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }],
      },
      {
        source: "/admin/:path*",
        headers: [
          { key: "X-Robots-Tag", value: "noindex, nofollow, noarchive" },
          { key: "Cache-Control", value: "no-store, max-age=0" },
        ],
      },
      {
        source: "/acceso",
        headers: [
          { key: "X-Robots-Tag", value: "noindex, nofollow" },
          { key: "Cache-Control", value: "no-store, max-age=0" },
        ],
      },
      {
        source: "/reservar/gestion/:path*",
        headers: [
          { key: "X-Robots-Tag", value: "noindex, nofollow, noarchive" },
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "Cache-Control", value: "no-store, max-age=0" },
        ],
      },
      {
        source: "/newsletter/:path*",
        headers: [
          { key: "X-Robots-Tag", value: "noindex, nofollow, noarchive" },
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "Cache-Control", value: "no-store, max-age=0" },
        ],
      },
    ];
  },
};

export default nextConfig;

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Customer exports are built with trailingSlash: true and are served under
  // /api/siteagent/next-previews/<ref>/content/. Next's built-in 308 would strip
  // those directory slashes on the preview and published gateways; proxy.ts keeps
  // the default no-trailing-slash behaviour for the Site host itself.
  skipTrailingSlashRedirect: true,
  async redirects() {
    return [
      {
        source: '/siteagent',
        destination: '/builder',
        permanent: false,
      },
    ]
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
}

export default nextConfig

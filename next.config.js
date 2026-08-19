/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export',
  distDir: 'docs',
  trailingSlash: true,
  images: { unoptimized: true },
  // GitHub Pages project sites need basePath; Phase 0 keeps it empty (root deploy).
  basePath: process.env.SITE_BASEPATH ?? '',
  assetPrefix: process.env.SITE_BASEPATH ?? '',
  reactStrictMode: true,
};

module.exports = nextConfig;

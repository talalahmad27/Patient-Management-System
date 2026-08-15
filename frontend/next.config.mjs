/** @type {import('next').NextConfig} */
const nextConfig = {
  // 'standalone' emits a minimal server + only-what's-used node_modules under
  // .next/standalone/ so we can ship a small container image without shipping
  // the entire node_modules tree.
  output: 'standalone',
};

export default nextConfig;

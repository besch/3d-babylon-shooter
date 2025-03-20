/** @type {import('next').NextConfig} */
const nextConfig = {
  webpack: (config) => {
    // Add support for importing Babylon.js through dynamic import
    config.externals = config.externals || [];
    config.externals.push({
      canvas: "canvas",
    });

    return config;
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;

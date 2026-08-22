/** @type {import('next').NextConfig} */
const nextConfig = {
    reactStrictMode: true,
    // pdfjs-dist ships a canvas-dependent Node build we never use in the browser bundle.
    webpack: (config) => {
        config.resolve.alias = { ...config.resolve.alias, canvas: false };
        return config;
    },
};

export default nextConfig;

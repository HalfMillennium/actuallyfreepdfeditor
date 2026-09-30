/** @type {import('next').NextConfig} */
const nextConfig = {
    reactStrictMode: true,
    // The extraction workspace became the redaction page. Permanent, so search
    // engines move /extract's standing across rather than treating it as gone.
    async redirects() {
        return [{ source: "/extract", destination: "/redact", permanent: true }];
    },
    // pdfjs-dist ships a canvas-dependent Node build we never use in the browser bundle.
    webpack: (config) => {
        config.resolve.alias = { ...config.resolve.alias, canvas: false };
        return config;
    },
};

export default nextConfig;

const apiOrigin = process.env.API_INTERNAL_URL ?? 'http://localhost:4000';

const config = {
  reactStrictMode: true,
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: `${apiOrigin}/api/:path*`,
      },
    ];
  },
};

export default config;

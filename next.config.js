/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  typescript: {
    // This tells Next's type checker to ignore Deno edge function files
    tsconfigPath: './tsconfig.next.json',
  },
  // images: { domains: ['gahnkglnqyhanchnzunu.supabase.co'] }, // add if you need
};

module.exports = nextConfig;

import { defineConfig } from 'next'

export default defineConfig({
  reactStrictMode: true,
  swcMinify: true,
  images: {
    domains: ['example.com'],
  },
})

import { defineConfig } from 'next-sitemap'

export default defineConfig({
  siteUrl: process.env.SITE_URL || 'https://example.com',
  generateRobotsTxt: true,
})

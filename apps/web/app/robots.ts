import { MetadataRoute } from 'next'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/login',
      disallow: '/dashboard',
    },
    sitemap: `${process.env.NEXT_PUBLIC_APP_URL ?? 'https://dropnote.com'}/sitemap.xml`,
  }
}

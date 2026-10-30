/* =====================================================
   SITE CONFIG — where the page reads its content from.

   provider:
     'json'     → any URL that returns content.json's shape (default).
                  Out of the box this is content.json on GitHub, so editing
                  that file on github.com updates the live site in ~5 min
                  with no redeploy. Point it at your own API later
                  (e.g. an Express route) and nothing else changes.
     'directus' → Directus CMS at `url` (collections listed in README)
     'strapi'   → Strapi CMS at `url`

   If the live source is down or slow, the site falls back to the
   content.json bundled with the deployment.
===================================================== */
window.SITE_CONFIG = {
  provider: 'json',
  url: 'https://raw.githubusercontent.com/anirudhsharma-2000/portfolio/main/content.json',
  timeoutMs: 4000,
  fallbackUrl: '/content.json'
};

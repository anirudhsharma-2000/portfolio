# anirudh.dev

Personal portfolio for Anirudh Sharma. Static site, no build step, deployed on Vercel.

All text on the page (bio, stats, projects, experience, skills, education, links) lives in **`content.json`**. The page fetches it at load time, so content changes don't need a redeploy.

## Updating content (no redeploy)

1. Open `content.json` on github.com and click the pencil icon.
2. Edit, then **Commit changes** on `main`.
3. The live site picks it up within about 5 minutes (GitHub's raw-file cache).

Vercel skips the build for commits that only touch `content.json` or `README.md` (`ignoreCommand` in `vercel.json`), so these edits never trigger a deployment.

If the live source is ever unreachable, the page falls back to the `content.json` bundled with the last deployment, so it never shows up empty.

### Content shape

| key | what it holds |
|---|---|
| `profile` | name, role, `status` (line above the headline), headline, `bio` (supports `**bold**`), email, `resume_url`, `contact_blurb`, `stats[]`, `live_feed[]` (`tag`: ws, pay, fcm, ai, flag, sync, tv; `text`) for the phone in the hero |
| `sections` | title / subtitle for each section |
| `projects[]` | `title`, `badge`, `description`, `stats[]` (`value`, `label`), `tags[]`, `play_url`, `github_url`, `url` (+ optional `url_label`), `icon` (or `monogram`, the letters shown when there's no icon), `screenshots[]` (shown in a phone frame; landscape images switch to a TV frame automatically), stats with `"rating": true` get a star |
| `core_skills[]` | highlighted "core stack" chips; matching tags in the skill groups are highlighted too |
| `experiences[]` | `company`, `role`, `period`, `summary`, `points[]` |
| `skills[]` | `group`, `items[]` |
| `education[]` | `degree`, `school`, `period`, `detail` |
| `socials[]` | `label`, `url` |

Order on the page follows array order. Empty links are hidden. Experience shows the first 3 bullets per job, with a "Show more" button for the rest. Projects with screenshots alternate left/right; projects without screenshots show as text rows.

### Adding app icons and screenshots

Upload images to a `media/` folder in the repo (e.g. `media/wholesale-mandi/icon.png`, `media/wholesale-mandi/1.png`), then reference them in `content.json`:

```json
"icon": "/media/wholesale-mandi/icon.png",
"screenshots": ["/media/wholesale-mandi/1.png", "/media/wholesale-mandi/2.png"]
```

Projects without an `icon` show a gradient monogram. Uploading images triggers a quick redeploy; editing which ones appear in `content.json` doesn't. Keep screenshots under ~300 KB each (WebP or compressed PNG).

## Resume

`resume.pdf` is served from the site and the button opens it in a new tab. To replace it, upload a new `resume.pdf` to the repo; that commit redeploys automatically (a few seconds). Alternatively, point `profile.resume_url` at any public link (e.g. a Google Drive view link) and it updates without a redeploy.

## Using your own backend later

`config.js` decides where content comes from:

```js
window.SITE_CONFIG = {
  provider: 'json',   // 'json' | 'directus' | 'strapi'
  url: 'https://raw.githubusercontent.com/anirudhsharma-2000/portfolio/main/content.json',
};
```

- **Own API** (Express, Firebase function, etc.): keep `provider: 'json'` and set `url` to an endpoint that returns the same shape as `content.json`. It must allow CORS from your site's domain. Any top-level key the API leaves out falls back to the bundled file.
- **Directus**: collections `profile` and `sections` (singletons), `projects`, `experiences`, `skills`, `socials`, `education` (with a `sort` field), public read access.
- **Strapi**: single types `profile`, `section`; collections `projects`, `experiences`, `skill-groups`, `socials`, `educations`, public `find` permission.

Changing `config.js` itself does need one deploy.

## Local preview

```bash
npx serve .        # or: python3 -m http.server
```

Note: locally the page still reads live content from GitHub. To test edits to your local `content.json`, temporarily set `url: ''` in `config.js`.

## Files

```
index.html         markup
assets/styles.css  styles
assets/app.js      content loading, rendering, nav rail, animations
config.js          content source
content.json       all page content
resume.pdf         resume, opens in the browser
favicon.*          site icons (plus apple-touch-icon.png, icon-192.png)
vercel.json        caching headers, skip builds for content-only commits
```

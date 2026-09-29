# AnimaX Previewer

AnimaX Previewer is a personal preview build for trying AnimaX Web rendering in a browser. This repository is for demonstration only. It is not the official AnimaX website or product distribution; the official AnimaX web previewer is coming soon.

Live demo: https://rickai.github.io/animax-previewer/

## What This Previewer Supports

- Load Lottie JSON files from a URL.
- Load local `.json`, `.lottie.json`, and `.zip` files by choosing or dropping files.
- Load ZIP packages that contain JSON plus related `images/`, `videos/`, or `fonts/` folders.
- Convert supported alpha-video ZIP packages into AnimaX-compatible Lottie JSON.
- Preview self-contained sample animations through the Random Sample button.
- Inspect parsed composition data, including layers, assets, text layers, timing, JSON size, FPS, and duration.
- Play, pause, scrub, loop, and change playback speed.
- Switch preview backgrounds, including transparent, dark, light, gray, pink, blue, and a custom color.
- Select layers and show layer bounds when supported by the current runtime.
- Edit text-layer content and apply the preview back to JSON.
- Replace image, video, and font resources from local files or public URLs.
- Edit JSON directly with formatting, search, restore, and automatic preview refresh.
- Repack the current JSON plus downloaded external resources into a ZIP.
- Copy shareable URLs for HTTP-accessible animation sources.

## NPM Packages

This previewer uses the public AnimaX Web packages from npm:

- `@lynx-js/animax`: the browser custom element and WebAssembly-backed AnimaX renderer.
- `@lynx-js/animax-textra`: the optional Textra text layout WebAssembly module.
- `@lynx-js/animax-video`: the optional video playback WebAssembly module.

The package versions are currently pinned to `1.0.17-alpha.2` because this is a personal preview build.

## Public Samples

The checked-in samples under `public/samples/` are exported AnimaX/Lottie examples, including vector-only animations, image-backed animations, text/image compositions, and video-backed animations. These legacy files remain available, but the default and random examples now use the 17 Kal previewer examples mirrored in R2, including 23 image, video and font dependencies. Their JSON resource URLs all point to this site. R2 renewal is active; these links depend on R2 remaining available.

The internal sample URLs used by the original private previewer are intentionally not copied into this public repository. Many of those upstream examples are hosted on internal or company CDN/TOS domains and may include assets that should not be redistributed in an open-source repo.

## Local Development

Install dependencies:

```bash
npm install
```

Run the local dev server:

```bash
npm run dev -- --host 127.0.0.1 --port 5173
```

Open:

```text
http://127.0.0.1:5173/
```

Directly opening the root `index.html` through `file://` is not the normal way to run this app because Vite needs to compile TypeScript and serve WebAssembly assets with the right URLs. If opened through `file://`, the page will redirect to the local dev server when it is running, or show the local startup command.

## Build

Build the app:

```bash
npm run build
```

Preview the built output:

```bash
npm run preview -- --host 127.0.0.1 --port 4173
```

## GitHub Pages

This repository is configured for GitHub Pages through GitHub Actions. The workflow builds the Vite app and deploys the `dist/` artifact.

For the `RickAi/animax-previewer` repository, the Vite base path is automatically set to:

```text
/animax-previewer/
```

The published page is:

```text
https://rickai.github.io/animax-previewer/
```

## Notes

- This project is a personal preview build for display and experimentation only.
- The official AnimaX web previewer is coming soon.
- The bundled samples are public-safe fixtures, not private production assets.
- The runtime packages are alpha packages and may change before the official release.

## Cloudflare deployment

The standalone UI is adapted from the September 2026 kal previewer. It uses
**GitHub Pages frontend + Workers API + D1 + R2**. GitHub Actions deploys
the frontend to https://rickai.github.io/animax-previewer/. Workers continues
serving `/api/*` and the existing frontend address for compatibility. All three public AnimaX packages remain version-aligned.
The internal CDN, internal fonts, AI assistant and private performance-check
backend are not included. Optional browser video processing uses the pinned
public FFmpeg 0.12.9 core from unpkg on demand.

- D1 `animax-previewer`: file metadata, per-browser owner hashes and upload quotas.
- R2 `animax-previewer`: animation files, images, videos and fonts.
- JSON/ZIP/directory uploads reuse kal's resource rewriting flow. ZIPs are expanded
  in the browser; resources are uploaded first and their URLs written into JSON.
- Uploaded files are accessible to anyone holding their unpredictable URL. There
  is no public file index. Do not upload confidential content.
- Records belong to an anonymous browser identity, not a user account. Clearing
  site data loses access to that list; saved share links continue working. Hiding a
  record is reversible in D1 and does not delete the file or break its links.
- Upload limits: 20 MiB/file, 200 MiB and 1,000 files per browser session AND per IP/day (Asia/Shanghai midnight reset), 8 GiB total
  storage reservation and 100,000 files for this app. An additional backend cap rejects uploads that would exceed 10,000,000,000 bytes of total uploads per Shanghai calendar month; existing uploads are backfilled. Monthly rollover does not reset the lifetime storage cap. R2 reads stop at 1,000,000
  operations/calendar month (including missing files and HEAD requests). All
  quota reservations are atomic D1 writes and happen before R2 access. If D1
  is unavailable or quota-exhausted, the request fails closed without using R2.
  Keep Workers/D1 on the Free plan and the bucket private, with no public R2
  domain, lifecycle tier transitions, S3 credentials or additional writers. Failed writes can consume
  reservation, conservatively. These are application limits, **not a Cloudflare
  billing cap**: they bound this application below the current R2 free tier,
  but other applications, direct console/API usage, plan changes, or pricing
  changes are outside this app’s control. R2 itself does not offer a $0 stop
  switch. The account-wide absolute guarantee requires not using a metered R2
  subscription.

In Cloudflare, connect `RickAi/animax-previewer`, use `npm run build` as the build
command and `npm run deploy` as the deploy command. Disable preview builds so
unreviewed branches cannot modify the production database. The deploy script
applies idempotent D1 migrations before deploying. Create the named R2 bucket
first. The non-secret D1 identifier is checked into `wrangler.jsonc`.

Local full-stack validation:

```sh
npm ci
npm run build
npm test
npx wrangler d1 migrations apply DB --local
npx wrangler dev --port 8795 --inspector-port 9395
```

`npm run dev` alone only serves the frontend. Cloud uploads require the Worker.
GitHub Pages serves the frontend directly. Its API requests target the Worker
with an anonymous random bearer identity stored in localStorage, without third-party
cookies. CORS permits https://rickai.github.io; quota errors remain readable.
Workers-hosted sessions still use their existing HttpOnly cookie. The two origins
have separate upload histories; existing public share links continue working.
Backend: https://animax-previewer.yongbiaoai.workers.dev/

Additional policies to consider: require sign-in for a durable per-person quota
(anonymous cookies and IPs cannot identify a person across devices/networks), and
deduplicate identical uploads by content hash. These are not enabled. Monthly
inactive-resource cleanup is described below. Storage reservations do not reset
when records are hidden or requests fail. Cleanup releases storage only after
confirmed object deletion; daily/monthly upload counters are never refunded.
Never clear the global storage counter while objects remain in R2.

Global Textra font fallback matches Kal: 12 families (Noto Sans SC, Thai, Bengali, Kannada, Gujarati, Devanagari, Telugu, Malayalam, Oriya, Arabic, Hebrew and Noto Emoji). All font files are mirrored in R2 and registered through `configureFonts` before the player mounts; the default is Kal’s `NotoSansSC-fallback.ttf`.

## Inactive resource cleanup

Cloudflare Cron Triggers run in batches of at most 500 objects each minute on the
1st of each month, 08:00–23:59 Asia/Shanghai. User files whose last observed access
was more than 30 days ago are permanently deleted; expired share links return 404.
Uploads and GET/HEAD downloads count as use; listing or hiding records does not.
Reading JSON also refreshes its transitive cloud dependencies, including cached
images/videos/fonts. JSON reads backfill dependency records for older uploads.
User files revalidate their browser cache, and preview source downloads bypass old
immutable cache entries. A page left open without network activity does not count
as continued use. Existing files receive a fresh 30-day grace period at migration.

The 52 migrated Kal sample/font objects are explicitly protected. New built-in
resources must be marked protected in a migration before being added to the UI.
Deletion first atomically claims stale rows, then deletes R2 objects, then removes
D1 metadata. Failures leave claimed rows for retry; only successful metadata deletion
refunds the storage reservation, exactly once. Daily/monthly upload and request
quotas are unchanged. No immediate production deletion is part of deployment.

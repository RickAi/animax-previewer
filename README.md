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

The package versions are currently pinned to `0.1.0-alpha.0` because this is a personal preview build.

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
**Workers Static Assets + Workers API + D1 + R2** in one deployment. Workers
serves the Vite build as well as `/api/*`; a separate Pages project and mail
service are unnecessary. All three public AnimaX packages remain version-aligned.
The internal CDN, internal fonts, AI assistant and private performance-check
backend are not included. Optional browser video processing uses the pinned
public FFmpeg 0.12.9 core from unpkg on demand.

- D1 `animax-previewer`: file metadata, per-browser owner hashes and upload quotas.
- R2 `animax-previewer`: animation files, images, videos and fonts.
- JSON/ZIP/directory uploads reuse kal's resource rewriting flow. ZIPs are expanded
  in the browser; resources are uploaded first and their URLs written into JSON.
- Uploaded files are accessible to anyone holding their unpredictable URL. There
  is no public file index. Do not upload confidential content.
- Records belong to a random HttpOnly browser cookie, not a user account. Clearing
  cookies loses access to that list; saved share links continue working. Hiding a
  record is reversible in D1 and does not delete the file or break its links.
- Upload limits: 20 MiB/file, 200 MiB and 1,000 files per browser session AND per IP/day (Asia/Shanghai midnight reset), 8 GiB lifetime
  storage reservation and 100,000 files for this app. R2 reads stop at 1,000,000
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
The existing GitHub Pages address redirects to the Cloudflare site, preserving
share query parameters. Production: https://animax-previewer.yongbiaoai.workers.dev/

Additional storage policies to consider: require sign-in for a durable per-person quota (anonymous cookies and IPs cannot identify a person across devices/networks); deduplicate identical uploads by content hash; expire temporary uploads after a clearly disclosed retention period; reserve a separate permanent quota for built-in samples. These policies are not enabled: expiry must preserve shared links and built-in examples. Current lifetime reservations intentionally do not reset when records are hidden or requests fail. Never clear the global storage counter while objects remain in R2.

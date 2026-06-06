# AnimaX Previewer

AnimaX Previewer is a personal preview build for trying AnimaX Web rendering in a browser. This repository is for demonstration only. It is not the official AnimaX website or product distribution; the official AnimaX web previewer is coming soon.

Live demo: https://rickai.github.io/animax_previewer/

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

- `@animax-js/animax`: the browser custom element and WebAssembly-backed AnimaX renderer.
- `@animax-js/animax-textra`: the optional Textra text layout WebAssembly module.
- `@animax-js/animax-video`: the optional video playback WebAssembly module.

The package versions are currently pinned to `0.1.0-alpha.0` because this is a personal preview build.

## Public Samples

The checked-in samples under `public/samples/` are exported AnimaX/Lottie examples, including vector-only animations, image-backed animations, text/image compositions, and video-backed animations. Their related `images/` and `videos/` folders are checked in beside each JSON file so the samples can run on GitHub Pages without private infrastructure.

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

For the `RickAi/animax_previewer` repository, the Vite base path is automatically set to:

```text
/animax_previewer/
```

The published page is:

```text
https://rickai.github.io/animax_previewer/
```

## Notes

- This project is a personal preview build for display and experimentation only.
- The official AnimaX web previewer is coming soon.
- The bundled samples are public-safe fixtures, not private production assets.
- The runtime packages are alpha packages and may change before the official release.

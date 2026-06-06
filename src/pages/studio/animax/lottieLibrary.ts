const toPublicUrl = (path: string) => {
  const publicPath = `${import.meta.env.BASE_URL}${path.replace(/^\/+/, '')}`;
  if (typeof window === 'undefined') return publicPath;
  return new URL(publicPath, window.location.href).toString();
};

export const DEFAULT_ANIMAX_LOTTIE_URL = toPublicUrl('samples/orbit-dashboard.json');

const ANIMAX_PUBLIC_SAMPLE_PATHS = [
  'samples/orbit-dashboard.json',
  'samples/gradient-cards.json',
  'samples/merge-paths.json',
  'samples/text-title.json',
  'samples/precomp-orbit.json',
  'samples/embedded-image.json',
  'samples/trim-loader.json',
  'samples/simple-shape.json',
] as const;

export const ANIMAX_RANDOM_LOTTIE_URLS = ANIMAX_PUBLIC_SAMPLE_PATHS.map(toPublicUrl);

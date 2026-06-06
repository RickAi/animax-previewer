const toPublicUrl = (path: string) => {
  const publicPath = `${import.meta.env.BASE_URL}${path.replace(/^\/+/, '')}`;
  if (typeof window === 'undefined') return publicPath;
  return new URL(publicPath, window.location.href).toString();
};

export const DEFAULT_ANIMAX_LOTTIE_URL = toPublicUrl('samples/simple-shape.json');

export const ANIMAX_RANDOM_LOTTIE_URLS = [DEFAULT_ANIMAX_LOTTIE_URL] as const;

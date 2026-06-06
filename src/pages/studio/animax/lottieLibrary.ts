const toPublicUrl = (path: string) => {
  const publicPath = `${import.meta.env.BASE_URL}${path.replace(/^\/+/, '')}`;
  if (typeof window === 'undefined') return publicPath;
  return new URL(publicPath, window.location.href).toString();
};

export const DEFAULT_ANIMAX_LOTTIE_URL = toPublicUrl(
  'samples/exports/image_demo_2/lottie_18image.json',
);

const ANIMAX_PUBLIC_SAMPLE_PATHS = [
  'samples/exports/image_demo_2/lottie_18image.json',
  'samples/exports/vector_demo_1/walk.json',
  'samples/exports/image_demo_3/button_popup_11image.json',
  'samples/exports/video_demo_1/animax_poster_video.json',
  'samples/exports/video_demo_2/lottery_1video.json',
  'samples/exports/text_demo_1/lottie_4image.json',
  'samples/exports/image_demo_1/anim_3image.json',
  'samples/exports/vector_demo_2/coin.json',
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

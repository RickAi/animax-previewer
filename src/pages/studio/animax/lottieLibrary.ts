const toPublicUrl = (path: string) => {
  const publicPath = `${import.meta.env.BASE_URL}${path.replace(/^\/+/, '')}`;
  if (typeof window === 'undefined') return publicPath;
  return new URL(publicPath, window.location.href).toString();
};

export const DEFAULT_ANIMAX_LOTTIE_URL = toPublicUrl(
  'samples/image_demo_2/lottie_18image.json',
);

const ANIMAX_PUBLIC_SAMPLE_PATHS = [
  'samples/image_demo_2/lottie_18image.json',
  'samples/vector_demo_1/walk.json',
  'samples/image_demo_3/button_popup_11image.json',
  'samples/video_demo_1/animax_poster_video.json',
  'samples/video_demo_2/lottery_1video.json',
  'samples/text_demo_1/lottie_4image.json',
  'samples/image_demo_1/anim_3image.json',
  'samples/vector_demo_2/coin.json',
] as const;

export const ANIMAX_RANDOM_LOTTIE_URLS = ANIMAX_PUBLIC_SAMPLE_PATHS.map(toPublicUrl);

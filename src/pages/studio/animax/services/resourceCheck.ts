import type { AssetRow, ResourceCheckResult } from '../toolTypes';

export const RESOURCE_CHECK_OK: ResourceCheckResult = {
  status: 'ok',
  issues: [],
};

export const IMAGE_JPG_CHECK_RESULT: ResourceCheckResult = {
  status: 'warning',
  issues: [
    {
      code: 'image-jpg',
      message: 'JPG 图片需要转换为 PNG8 格式。',
      fixLabel: '转 PNG8',
    },
  ],
};

export const IMAGE_URL_JPG_CHECK_RESULT: ResourceCheckResult = {
  status: 'warning',
  issues: [
    {
      code: 'image-jpg',
      message: '图片 url 需要业务自行处理。',
      fixLabel: '',
      fixable: false,
    },
  ],
};

export const createVideoBFramesCheckResult = (bFrameCount?: number): ResourceCheckResult => ({
  status: 'warning',
  issues: [
    {
      code: 'video-b-frames',
      message:
        typeof bFrameCount === 'number' && bFrameCount > 0
          ? `视频包含 ${bFrameCount} 个 B 帧，需要转换为无 B 帧视频。`
          : '视频包含 B 帧，需要转换为无 B 帧视频。',
      fixLabel: '移除 B 帧',
    },
  ],
});

export const isJpgResourceName = (value: string) => {
  const trimmed = value.trim();
  return /^data:image\/jpe?g[;,]/i.test(trimmed) || /\.(jpe?g)(?:[?#].*)?$/i.test(trimmed);
};

export const isHttpResourcePath = (value: string) => /^https?:\/\//i.test(value.trim());

export const isBase64ResourcePath = (value: string) => /^data:/i.test(value.trim());

export const getImageResourceCheck = (resourcePath: string, checkTargetName: string) => {
  if (!isJpgResourceName(checkTargetName)) return RESOURCE_CHECK_OK;
  return isHttpResourcePath(resourcePath) ? IMAGE_URL_JPG_CHECK_RESULT : IMAGE_JPG_CHECK_RESULT;
};

export const fileToDataUrl = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '');
    reader.onerror = () => reject(reader.error ?? new Error('读取文件失败'));
    reader.readAsDataURL(file);
  });

export const getFixableIssueCount = (assetRows: AssetRow[]) =>
  assetRows.reduce(
    (count, row) =>
      count + (row.check?.issues.filter((issue) => issue.fixable !== false).length ?? 0),
    0,
  );

export const hasFixableIssue = (row: AssetRow) =>
  row.check?.issues.some((issue) => issue.fixable !== false) ?? false;

export const getVideoResourceCheckSignature = (assetRows: AssetRow[]) =>
  assetRows
    .filter((row) => row.kind === 'video' && row.previewUrl)
    .map((row) => `${row.id}\u0000${row.name}\u0000${row.previewUrl}`)
    .join('\u0001');

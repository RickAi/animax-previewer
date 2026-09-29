import { inflate } from 'pako';

import type {
  CreateEditableLayerInput,
  LayerTransform,
  LayerTransformStaticState,
  ResourceEdit,
  ResourceKind,
  TextLayerRow,
} from './toolTypes';

export function isAbsoluteResource(path: string) {
  return /^(https?:|blob:|data:)/i.test(path);
}

export function formatBytes(bytes?: number) {
  if (!Number.isFinite(bytes)) return '--';
  const value = bytes as number;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)}KB`;
  return `${(value / 1024 / 1024).toFixed(2)}MB`;
}

export function formatKilobytes(bytes?: number) {
  if (!Number.isFinite(bytes) || (bytes as number) <= 0) return '';
  return `${((bytes as number) / 1024).toFixed(1)}KB`;
}

export function getDataUrlByteSize(value?: string) {
  if (!value || !/^data:/i.test(value)) return undefined;
  const commaIndex = value.indexOf(',');
  if (commaIndex < 0) return undefined;

  const meta = value.slice(0, commaIndex);
  const payload = value.slice(commaIndex + 1).replace(/\s/g, '');
  if (!payload) return undefined;

  if (/;base64/i.test(meta)) {
    const padding = payload.endsWith('==') ? 2 : payload.endsWith('=') ? 1 : 0;
    return Math.max(0, Math.floor((payload.length * 3) / 4) - padding);
  }

  try {
    return new TextEncoder().encode(decodeURIComponent(payload)).length;
  } catch {
    return new TextEncoder().encode(payload).length;
  }
}

export interface ImageResourceFormat {
  tags: string[];
  title: string;
}

interface ParsedDataUrl {
  mimeType: string;
  isBase64: boolean;
  payload: string;
}

interface PngFormatInfo {
  bitDepth: number;
  colorType: number;
  hasPalette: boolean;
  hasTransparencyChunk: boolean;
  hasSrgb: boolean;
  srgbIntent?: number;
  hasIccProfile: boolean;
  iccProfileName?: string;
  iccProfileDescription?: string;
  hasGamma: boolean;
  gamma?: number;
  hasChromaticity: boolean;
  hasExif: boolean;
}

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

const parseDataUrl = (value?: string): ParsedDataUrl | undefined => {
  if (!value || !/^data:/i.test(value)) return undefined;
  const commaIndex = value.indexOf(',');
  if (commaIndex < 0) return undefined;

  const meta = value.slice(5, commaIndex);
  const payload = value.slice(commaIndex + 1).replace(/\s/g, '');
  if (!payload) return undefined;

  const metaParts = meta.split(';').filter(Boolean);
  const mimeType =
    metaParts
      .find((part) => part.includes('/'))
      ?.trim()
      .toLowerCase() || 'text/plain';

  return {
    mimeType,
    isBase64: metaParts.some((part) => part.toLowerCase() === 'base64'),
    payload,
  };
};

const decodeBase64Bytes = (payload: string) => {
  try {
    const binary = atob(payload);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }
    return bytes;
  } catch {
    return undefined;
  }
};

const readPngUInt32 = (bytes: Uint8Array, offset: number) =>
  ((bytes[offset] << 24) |
    (bytes[offset + 1] << 16) |
    (bytes[offset + 2] << 8) |
    bytes[offset + 3]) >>>
  0;

const readAscii = (bytes: Uint8Array, start: number, end: number) => {
  let value = '';
  const safeEnd = Math.min(end, bytes.length);
  for (let index = start; index < safeEnd; index += 1) {
    value += String.fromCharCode(bytes[index]);
  }
  return value;
};

const normalizeProfileText = (value: string) => {
  const normalized = value.replace(/\0/g, '').replace(/\s+/g, ' ').trim();
  return normalized || undefined;
};

const readUtf16Be = (bytes: Uint8Array, start: number, length: number) => {
  const codeUnits: number[] = [];
  const end = Math.min(start + length, bytes.length);
  for (let index = start; index + 1 < end; index += 2) {
    codeUnits.push((bytes[index] << 8) | bytes[index + 1]);
  }
  return normalizeProfileText(String.fromCharCode(...codeUnits));
};

const isPngSignature = (bytes: Uint8Array) =>
  bytes.length >= PNG_SIGNATURE.length &&
  PNG_SIGNATURE.every((value, index) => bytes[index] === value);

const parseIccDescTag = (profile: Uint8Array, offset: number, size: number) => {
  if (size < 12 || readAscii(profile, offset, offset + 4) !== 'desc') return undefined;
  const descriptionLength = readPngUInt32(profile, offset + 8);
  if (descriptionLength === 0) return undefined;

  const textStart = offset + 12;
  const textEnd = Math.min(textStart + descriptionLength, offset + size, profile.length);
  return normalizeProfileText(readAscii(profile, textStart, textEnd));
};

const parseIccMlucTag = (profile: Uint8Array, offset: number, size: number) => {
  if (size < 16 || readAscii(profile, offset, offset + 4) !== 'mluc') return undefined;

  const recordCount = readPngUInt32(profile, offset + 8);
  const recordSize = readPngUInt32(profile, offset + 12);
  if (recordSize < 12) return undefined;

  for (let index = 0; index < recordCount; index += 1) {
    const recordOffset = offset + 16 + index * recordSize;
    if (recordOffset + 12 > offset + size) break;

    const textLength = readPngUInt32(profile, recordOffset + 4);
    const textOffset = readPngUInt32(profile, recordOffset + 8);
    const absoluteTextOffset = offset + textOffset;
    if (absoluteTextOffset + textLength > offset + size) continue;

    const text = readUtf16Be(profile, absoluteTextOffset, textLength);
    if (text) return text;
  }

  return undefined;
};

const parseIccProfileDescription = (profile: Uint8Array) => {
  if (profile.length < 132) return undefined;

  const tagCount = readPngUInt32(profile, 128);
  const tagTableEnd = 132 + tagCount * 12;
  if (tagTableEnd > profile.length) return undefined;

  let mlucDescription: string | undefined;

  for (let index = 0; index < tagCount; index += 1) {
    const tagOffset = 132 + index * 12;
    const signature = readAscii(profile, tagOffset, tagOffset + 4);
    const dataOffset = readPngUInt32(profile, tagOffset + 4);
    const dataSize = readPngUInt32(profile, tagOffset + 8);
    if (dataOffset + dataSize > profile.length) continue;

    if (signature === 'desc') {
      const description = parseIccDescTag(profile, dataOffset, dataSize);
      if (description) return description;
    } else if (signature === 'mluc') {
      mlucDescription = mlucDescription ?? parseIccMlucTag(profile, dataOffset, dataSize);
    }
  }

  return mlucDescription;
};

const readPngIccProfileDescription = (
  bytes: Uint8Array,
  dataOffset: number,
  chunkLength: number,
  profileEnd: number,
) => {
  const compressionMethodOffset = profileEnd + 1;
  if (compressionMethodOffset >= dataOffset + chunkLength) return undefined;

  const compressionMethod = bytes[compressionMethodOffset];
  if (compressionMethod !== 0) return undefined;

  const compressedStart = compressionMethodOffset + 1;
  const compressedEnd = dataOffset + chunkLength;
  if (compressedStart >= compressedEnd) return undefined;

  try {
    return parseIccProfileDescription(inflate(bytes.subarray(compressedStart, compressedEnd)));
  } catch {
    return undefined;
  }
};

const parsePngFormatInfo = (bytes: Uint8Array): PngFormatInfo | undefined => {
  if (!isPngSignature(bytes)) return undefined;

  let offset = PNG_SIGNATURE.length;
  let info: PngFormatInfo | undefined;

  while (offset + 12 <= bytes.length) {
    const length = readPngUInt32(bytes, offset);
    const typeOffset = offset + 4;
    const dataOffset = offset + 8;
    const crcOffset = dataOffset + length;
    if (crcOffset + 4 > bytes.length) break;

    const chunkType = readAscii(bytes, typeOffset, typeOffset + 4);

    if (chunkType === 'IHDR' && length >= 13) {
      info = {
        bitDepth: bytes[dataOffset + 8],
        colorType: bytes[dataOffset + 9],
        hasPalette: false,
        hasTransparencyChunk: false,
        hasSrgb: false,
        hasIccProfile: false,
        hasGamma: false,
        hasChromaticity: false,
        hasExif: false,
      };
    } else if (info) {
      if (chunkType === 'PLTE') {
        info.hasPalette = true;
      } else if (chunkType === 'tRNS') {
        info.hasTransparencyChunk = true;
      } else if (chunkType === 'sRGB') {
        info.hasSrgb = true;
        info.srgbIntent = length > 0 ? bytes[dataOffset] : undefined;
      } else if (chunkType === 'iCCP') {
        info.hasIccProfile = true;
        const profileEnd = bytes.indexOf(0, dataOffset);
        if (profileEnd > dataOffset && profileEnd < dataOffset + length) {
          info.iccProfileName = readAscii(bytes, dataOffset, profileEnd);
          info.iccProfileDescription = readPngIccProfileDescription(
            bytes,
            dataOffset,
            length,
            profileEnd,
          );
        }
      } else if (chunkType === 'gAMA' && length >= 4) {
        info.hasGamma = true;
        info.gamma = readPngUInt32(bytes, dataOffset) / 100000;
      } else if (chunkType === 'cHRM') {
        info.hasChromaticity = true;
      } else if (chunkType === 'eXIf') {
        info.hasExif = true;
      }
    }

    offset = crcOffset + 4;
    if (chunkType === 'IDAT' || chunkType === 'IEND') break;
  }

  return info;
};

const getPngPixelFormat = (info: PngFormatInfo) => {
  if (info.colorType === 6 && info.bitDepth === 8) return 'PNG32';
  if (info.colorType === 2 && info.bitDepth === 8) return 'PNG24';
  if (info.colorType === 3) return info.bitDepth === 8 ? 'PNG8' : `PNG${info.bitDepth}`;
  if (info.colorType === 0) return `PNG${info.bitDepth} Gray`;
  if (info.colorType === 4) return `PNG${info.bitDepth * 2} Gray+A`;
  if (info.colorType === 6) return `PNG${info.bitDepth * 4}`;
  if (info.colorType === 2) return `PNG${info.bitDepth * 3}`;
  return 'PNG';
};

const getPngColorDescription = (info: PngFormatInfo) => {
  if (info.colorType === 0) return 'Grayscale';
  if (info.colorType === 2) return info.hasTransparencyChunk ? 'RGB + tRNS' : 'RGB';
  if (info.colorType === 3) return info.hasTransparencyChunk ? 'Indexed + tRNS' : 'Indexed';
  if (info.colorType === 4) return 'Gray + Alpha';
  if (info.colorType === 6) return 'RGBA';
  return `Color type ${info.colorType}`;
};

const getPngColorProfileLabel = (info: PngFormatInfo) => {
  if (info.hasSrgb) return 'sRGB';
  if (info.iccProfileDescription) return info.iccProfileDescription;
  if (info.iccProfileName && !/^icc(?: profile)?$/i.test(info.iccProfileName.trim())) {
    return `iCCP ${info.iccProfileName}`;
  }
  if (info.hasIccProfile) return 'iCCP';
  if (info.hasGamma && info.hasChromaticity) return 'gAMA+cHRM';
  if (info.hasGamma) return 'gAMA';
  if (info.colorType === 0) return 'raw Gray';
  if (info.colorType === 2) return 'raw RGB';
  if (info.colorType === 3) return 'raw Indexed';
  if (info.colorType === 4) return 'raw Gray+A';
  if (info.colorType === 6) return 'raw RGBA';
  return 'raw';
};

const createPngFormat = (info: PngFormatInfo, sourceLabel: string): ImageResourceFormat => {
  const pixelFormat = getPngPixelFormat(info);
  const colorProfile = getPngColorProfileLabel(info);
  const detailParts = [
    pixelFormat,
    `${info.bitDepth}-bit ${getPngColorDescription(info)}`,
    `color type ${info.colorType}`,
    colorProfile,
  ];

  if (info.hasSrgb && info.srgbIntent !== undefined) {
    detailParts.push(`sRGB intent=${info.srgbIntent}`);
  }
  if (info.iccProfileDescription) {
    detailParts.push(`ICC description=${info.iccProfileDescription}`);
  }
  if (info.hasIccProfile && info.iccProfileName) {
    detailParts.push(`iCCP name=${info.iccProfileName}`);
  }
  if (info.hasExif) detailParts.push('eXIf');
  if (info.hasGamma && info.gamma !== undefined) detailParts.push(`gamma=${info.gamma}`);
  if (info.hasChromaticity) detailParts.push('cHRM');
  detailParts.push(sourceLabel);

  return {
    tags: [pixelFormat, colorProfile],
    title: detailParts.join(' · '),
  };
};

const getExtensionFormat = (path: string) => {
  const extension = getFileExtension(path).replace(/^\./, '').toUpperCase();
  if (!extension) return undefined;
  if (extension === 'JPG') return 'JPEG';
  return extension;
};

const getMimeTypeFormat = (mimeType?: string | null) => {
  const normalized = mimeType?.split(';')[0]?.trim().toLowerCase();
  if (!normalized?.startsWith('image/')) return undefined;

  const subtype = normalized.slice('image/'.length);
  if (subtype === 'jpeg' || subtype === 'jpg') return 'JPEG';
  if (subtype === 'svg+xml') return 'SVG';
  return subtype.toUpperCase();
};

export function getImageResourceFormatFromBytes(
  bytes: Uint8Array,
  sourceLabel: string,
  fallbackPath?: string,
  mimeType?: string | null,
) {
  const pngInfo = parsePngFormatInfo(bytes);
  if (pngInfo) return createPngFormat(pngInfo, sourceLabel);

  if (bytes[0] === 0xff && bytes[1] === 0xd8) {
    return { tags: ['JPEG'], title: `JPEG · ${sourceLabel}` };
  }
  if (readAscii(bytes, 0, 4) === 'RIFF') {
    const webpHeader = readAscii(bytes, 8, 12);
    if (webpHeader === 'WEBP') return { tags: ['WebP'], title: `WebP · ${sourceLabel}` };
  }
  const gifHeader = readAscii(bytes, 0, 6);
  if (gifHeader === 'GIF87a' || gifHeader === 'GIF89a') {
    return { tags: ['GIF'], title: `${gifHeader} · ${sourceLabel}` };
  }

  const fallbackFormat = getMimeTypeFormat(mimeType) || getExtensionFormat(fallbackPath ?? '');
  if (!fallbackFormat) return undefined;
  return {
    tags: [fallbackFormat],
    title: `${fallbackFormat} · ${sourceLabel}`,
  };
}

export function getImageResourceFormat(source?: string, fallbackPath?: string) {
  const trimmedSource = source?.trim() ?? '';
  const dataUrl = parseDataUrl(trimmedSource);

  if (dataUrl) {
    if (dataUrl.isBase64) {
      const bytes = decodeBase64Bytes(dataUrl.payload);
      if (bytes) {
        const bytesFormat = getImageResourceFormatFromBytes(
          bytes,
          'base64',
          fallbackPath,
          dataUrl.mimeType,
        );
        if (bytesFormat) return bytesFormat;
      }
    }

    const mimeFormat = getMimeTypeFormat(dataUrl.mimeType) || dataUrl.mimeType;
    return {
      tags: [mimeFormat],
      title: `${dataUrl.mimeType} · ${dataUrl.isBase64 ? 'base64' : 'data URL'}`,
    };
  }

  const extensionFormat =
    getExtensionFormat(trimmedSource) || getExtensionFormat(fallbackPath ?? '');
  if (!extensionFormat) return undefined;
  return {
    tags: [extensionFormat],
    title: `${extensionFormat} · URL/path resource`,
  };
}

export function resolveResourceUrl(
  src: string,
  dirName: string,
  fileName: string,
  edit?: ResourceEdit,
) {
  if (edit) return edit.url;
  if (!fileName) return '';
  if (isAbsoluteResource(fileName)) return fileName;

  if (/^https?:\/\//i.test(src)) {
    try {
      return new URL(`${dirName || ''}${fileName}`, src).toString();
    } catch {
      return '';
    }
  }

  return '';
}

export function formatResourceSourceLabel(url: string) {
  if (!url) return '资源缺失';
  if (/^data:/i.test(url)) {
    return url.length > 52 ? `${url.slice(0, 52)}...` : url;
  }
  return url;
}

export function ensureHttpsUrl(url: string) {
  const trimmed = url.trim();
  if (!trimmed) return trimmed;
  if (trimmed.startsWith('blob:')) return trimmed;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed.replace(/^\/+/, '')}`;
}

export function safeSegment(value: string) {
  return value
    .trim()
    .replace(/\s+/g, '_')
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');
}

export function getFileExtension(fileName: string) {
  const match = fileName.match(/(\.[a-zA-Z0-9]+)$/);
  return match?.[1]?.toLowerCase() ?? '';
}

export function createResourceKey(kind: ResourceKind, id: string) {
  return `${kind}:${id}`;
}

const DEFAULT_LAYER_TRANSFORM: LayerTransform = {
  positionX: 0,
  positionY: 0,
  scaleX: 100,
  scaleY: 100,
  rotation: 0,
  opacity: 100,
  anchorX: 0,
  anchorY: 0,
};

const DEFAULT_LAYER_TRANSFORM_STATIC_STATE: LayerTransformStaticState = {
  positionX: true,
  positionY: true,
  scaleX: true,
  scaleY: true,
  rotation: true,
  opacity: true,
  anchorX: true,
  anchorY: true,
};

const normalizeFiniteNumber = (value: unknown, fallback: number) => {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : fallback;
};

const isKeyframeValue = (value: unknown) =>
  Boolean(
    value &&
    typeof value === 'object' &&
    ('s' in (value as Record<string, unknown>) ||
      'e' in (value as Record<string, unknown>) ||
      't' in (value as Record<string, unknown>)),
  );

const isStaticTransformProperty = (property: any) => {
  if (!property) return true;
  if (property.a === 1) return false;
  const value = property.k ?? property;
  if (Array.isArray(value)) {
    return !value.some((item) => isKeyframeValue(item));
  }
  return !isKeyframeValue(value);
};

const readStaticNumber = (property: any, fallback: number) => {
  const value = property?.k ?? property;
  if (typeof value === 'number') return normalizeFiniteNumber(value, fallback);
  if (Array.isArray(value)) {
    const keyframeValue = value.find((item) => item && typeof item === 'object' && 's' in item);
    if (keyframeValue) {
      return readStaticNumber(keyframeValue.s?.[0], fallback);
    }
    return normalizeFiniteNumber(value[0], fallback);
  }
  return fallback;
};

const readStaticVector = (property: any, fallbackX: number, fallbackY: number) => {
  if (property?.s === true || property?.x || property?.y) {
    return {
      x: readStaticNumber(property?.x, fallbackX),
      y: readStaticNumber(property?.y, fallbackY),
    };
  }

  const value = property?.k ?? property;
  if (Array.isArray(value)) {
    const keyframeValue = value.find((item) => item && typeof item === 'object' && 's' in item);
    if (keyframeValue) {
      return readStaticVector(keyframeValue.s, fallbackX, fallbackY);
    }
    return {
      x: normalizeFiniteNumber(value[0], fallbackX),
      y: normalizeFiniteNumber(value[1], fallbackY),
    };
  }

  if (value && typeof value === 'object') {
    return {
      x: normalizeFiniteNumber(value.x, fallbackX),
      y: normalizeFiniteNumber(value.y, fallbackY),
    };
  }

  return { x: fallbackX, y: fallbackY };
};

const getSplitDimensionStaticState = (property: any, fallbackX: boolean, fallbackY: boolean) => {
  if (property?.s === true || property?.x || property?.y) {
    return {
      x: isStaticTransformProperty(property?.x),
      y: isStaticTransformProperty(property?.y),
    };
  }

  const isStatic = isStaticTransformProperty(property);
  return {
    x: property ? isStatic : fallbackX,
    y: property ? isStatic : fallbackY,
  };
};

export function readLayerStaticTransform(layer: any): LayerTransform {
  const ks = layer?.ks ?? {};
  const position = readStaticVector(
    ks.p,
    DEFAULT_LAYER_TRANSFORM.positionX,
    DEFAULT_LAYER_TRANSFORM.positionY,
  );
  const scale = readStaticVector(
    ks.s,
    DEFAULT_LAYER_TRANSFORM.scaleX,
    DEFAULT_LAYER_TRANSFORM.scaleY,
  );
  const anchor = readStaticVector(
    ks.a,
    DEFAULT_LAYER_TRANSFORM.anchorX,
    DEFAULT_LAYER_TRANSFORM.anchorY,
  );

  return {
    positionX: position.x,
    positionY: position.y,
    scaleX: scale.x,
    scaleY: scale.y,
    rotation: readStaticNumber(ks.r ?? ks.rz, DEFAULT_LAYER_TRANSFORM.rotation),
    opacity: readStaticNumber(ks.o, DEFAULT_LAYER_TRANSFORM.opacity),
    anchorX: anchor.x,
    anchorY: anchor.y,
  };
}

export function readLayerTransformStaticState(layer: any): LayerTransformStaticState {
  const ks = layer?.ks ?? {};
  const position = getSplitDimensionStaticState(ks.p, true, true);
  const scaleStatic = isStaticTransformProperty(ks.s);
  const anchor = getSplitDimensionStaticState(ks.a, true, true);

  return {
    positionX: position.x,
    positionY: position.y,
    scaleX: scaleStatic,
    scaleY: scaleStatic,
    rotation: isStaticTransformProperty(ks.r ?? ks.rz),
    opacity: isStaticTransformProperty(ks.o),
    anchorX: anchor.x,
    anchorY: anchor.y,
  };
}

const createStaticTransform = (transform: LayerTransform) => ({
  o: { a: 0, k: transform.opacity },
  r: { a: 0, k: transform.rotation },
  p: { a: 0, k: [transform.positionX, transform.positionY, 0] },
  a: { a: 0, k: [transform.anchorX, transform.anchorY, 0] },
  s: { a: 0, k: [transform.scaleX, transform.scaleY, 100] },
});

const getValueAtPath = (root: any, path: Array<string | number>) => {
  let current = root;
  for (const segment of path) {
    current = current?.[segment];
    if (current === undefined) return undefined;
  }
  return current;
};

const getRootLayerFrameCount = (parsed: any) => {
  const op = normalizeFiniteNumber(parsed?.op, 0);
  if (op > 0) return op;
  const fr = normalizeFiniteNumber(parsed?.fr, 0);
  return fr > 0 ? fr : 60;
};

const getRootSize = (parsed: any) => ({
  width: Math.max(1, normalizeFiniteNumber(parsed?.w, 720)),
  height: Math.max(1, normalizeFiniteNumber(parsed?.h, 720)),
});

const getNextLayerIndex = (parsed: any) => {
  const indices = Array.isArray(parsed?.layers)
    ? parsed.layers.map((layer: any) => normalizeFiniteNumber(layer?.ind, 0))
    : [];
  return Math.max(0, ...indices) + 1;
};

const getUniqueAssetId = (parsed: any, prefix: string) => {
  const usedIds = new Set(
    Array.isArray(parsed?.assets)
      ? parsed.assets.map((asset: any) => String(asset?.id ?? '')).filter(Boolean)
      : [],
  );
  let index = usedIds.size + 1;
  let id = `${prefix}_${index}`;
  while (usedIds.has(id)) {
    index += 1;
    id = `${prefix}_${index}`;
  }
  return id;
};

const ensureUniqueLayerName = (parsed: any, rawName: string) => {
  const baseName = rawName.trim() || 'New Layer';
  const usedNames = new Set(
    Array.isArray(parsed?.layers)
      ? parsed.layers.map((layer: any) => String(layer?.nm ?? '')).filter(Boolean)
      : [],
  );
  if (!usedNames.has(baseName)) return baseName;

  let index = 2;
  let nextName = `${baseName} ${index}`;
  while (usedNames.has(nextName)) {
    index += 1;
    nextName = `${baseName} ${index}`;
  }
  return nextName;
};

const ensureDefaultFont = (parsed: any) => {
  if (!parsed.fonts || typeof parsed.fonts !== 'object') parsed.fonts = {};
  if (!Array.isArray(parsed.fonts.list)) parsed.fonts.list = [];
  const fontName = 'Noto Sans SC';
  if (!parsed.fonts.list.some((font: any) => font?.fName === fontName)) {
    parsed.fonts.list.push({
      fName: fontName,
      fFamily: fontName,
      fStyle: 'Regular',
      ascent: 75,
      origin: 0,
    });
  }
  return fontName;
};

export const estimateOnelineTextSize = (text: string, fontSize = 64) => {
  const chars = Array.from(text || 'Text Layer');
  const widthUnits = chars.reduce((sum, char) => {
    if (/\s/.test(char)) return sum + 0.35;
    if (/[\u4e00-\u9fff\u3000-\u303f\uff00-\uffef]/.test(char)) return sum + 1;
    if (/[A-Z0-9]/.test(char)) return sum + 0.68;
    if (/[\x00-\x7F]/.test(char)) return sum + 0.56;
    return sum + 0.82;
  }, 0);

  return {
    width: Math.max(1, Math.ceil(widthUnits * fontSize + fontSize * 0.35)),
    height: Math.max(1, Math.ceil(fontSize * 1.25)),
  };
};

const normalizeSolidColor = (color: string) => {
  if (color.trim().toLowerCase() === 'transparent') return 'transparent';
  const normalized = color.trim().replace(/^#/, '');
  const value = /^[0-9a-fA-F]{6}$/.test(normalized) ? normalized : '6c5cff';
  return `#${value}`;
};

const createSolidImageDataUrl = (width: number, height: number, color: string) => {
  const safeColor = normalizeSolidColor(color);
  const safeWidth = Math.max(1, Math.round(width));
  const safeHeight = Math.max(1, Math.round(height));
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${safeWidth}" height="${safeHeight}" viewBox="0 0 ${safeWidth} ${safeHeight}"><rect width="${safeWidth}" height="${safeHeight}" fill="${safeColor}"/></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
};

export function updateJsonLayerName(
  jsonText: string,
  targetPath: Array<string | number>,
  nextName: string,
) {
  const parsed = JSON.parse(jsonText) as any;
  const layer = getValueAtPath(parsed, targetPath);
  if (!layer || typeof layer !== 'object') {
    throw new Error('未找到目标图层');
  }
  layer.nm = nextName.trim() || layer.nm || 'Layer';
  return `${JSON.stringify(parsed, null, 2)}\n`;
}

export function updateJsonLayerTransform(
  jsonText: string,
  targetPath: Array<string | number>,
  transform: LayerTransform,
  staticState: LayerTransformStaticState = DEFAULT_LAYER_TRANSFORM_STATIC_STATE,
) {
  const parsed = JSON.parse(jsonText) as any;
  const layer = getValueAtPath(parsed, targetPath);
  if (!layer || typeof layer !== 'object') {
    throw new Error('未找到目标图层');
  }
  const ks = layer.ks && typeof layer.ks === 'object' ? layer.ks : {};
  layer.ks = ks;

  const setStaticScalar = (current: any, value: number) => ({
    ...(current && typeof current === 'object' && !Array.isArray(current) ? current : {}),
    a: 0,
    k: value,
  });

  const readVectorK = (property: any, fallbackZ: number) => {
    const value = property?.k ?? property;
    if (!Array.isArray(value) || value.some((item) => isKeyframeValue(item))) {
      return [0, 0, fallbackZ];
    }
    return [
      normalizeFiniteNumber(value[0], 0),
      normalizeFiniteNumber(value[1], 0),
      normalizeFiniteNumber(value[2], fallbackZ),
    ];
  };

  const setStaticVector = (
    key: 'p' | 'a' | 's',
    xField: keyof LayerTransformStaticState,
    yField: keyof LayerTransformStaticState,
    xValue: number,
    yValue: number,
    fallbackZ: number,
  ) => {
    const current = ks[key];
    if (current?.s === true || current?.x || current?.y) {
      if (staticState[xField]) current.x = setStaticScalar(current.x, xValue);
      if (staticState[yField]) current.y = setStaticScalar(current.y, yValue);
      ks[key] = current;
      return;
    }

    if (!staticState[xField] && !staticState[yField]) return;
    const vector = readVectorK(current, fallbackZ);
    if (staticState[xField]) vector[0] = xValue;
    if (staticState[yField]) vector[1] = yValue;
    ks[key] = {
      ...(current && typeof current === 'object' && !Array.isArray(current) ? current : {}),
      a: 0,
      k: vector,
    };
  };

  if (staticState.opacity) ks.o = setStaticScalar(ks.o, transform.opacity);
  if (staticState.rotation) {
    const rotationKey = ks.r === undefined && ks.rz !== undefined ? 'rz' : 'r';
    ks[rotationKey] = setStaticScalar(ks[rotationKey], transform.rotation);
  }
  setStaticVector('p', 'positionX', 'positionY', transform.positionX, transform.positionY, 0);
  setStaticVector('a', 'anchorX', 'anchorY', transform.anchorX, transform.anchorY, 0);
  setStaticVector('s', 'scaleX', 'scaleY', transform.scaleX, transform.scaleY, 100);
  return `${JSON.stringify(parsed, null, 2)}\n`;
}

export function updateJsonLayerVisibility(
  jsonText: string,
  targetPath: Array<string | number>,
  visible: boolean,
) {
  const parsed = JSON.parse(jsonText) as any;
  const layer = getValueAtPath(parsed, targetPath);
  if (!layer || typeof layer !== 'object') {
    throw new Error('未找到目标图层');
  }
  layer.hd = !visible;
  return `${JSON.stringify(parsed, null, 2)}\n`;
}

export function addJsonEditableLayer(jsonText: string, input: CreateEditableLayerInput) {
  const parsed = JSON.parse(jsonText) as any;
  if (!Array.isArray(parsed.layers)) parsed.layers = [];
  if (!Array.isArray(parsed.assets)) parsed.assets = [];

  const { width: rootWidth, height: rootHeight } = getRootSize(parsed);
  const outFrame = getRootLayerFrameCount(parsed);
  const layerIndex = getNextLayerIndex(parsed);
  const layerName = ensureUniqueLayerName(parsed, input.name);
  const baseLayer = {
    ddd: 0,
    ind: layerIndex,
    nm: layerName,
    sr: 1,
    ks: createStaticTransform(input.transform),
    ao: 0,
    ip: 0,
    op: outFrame,
    st: 0,
    bm: 0,
  };

  let layer: any;
  if (input.kind === 'image') {
    const assetId = getUniqueAssetId(parsed, 'image_custom');
    const width = Math.max(1, Math.round(input.width));
    const height = Math.max(1, Math.round(input.height));
    parsed.assets.push({
      id: assetId,
      w: width,
      h: height,
      u: '',
      p: input.dataUrl,
      e: 1,
      nm: input.fileName,
    });
    layer = {
      ...baseLayer,
      ty: 2,
      __kalEditableKind: 'image',
      refId: assetId,
    };
  } else if (input.kind === 'text') {
    const fontName = ensureDefaultFont(parsed);
    const fontSize = 64;
    const textSize = estimateOnelineTextSize(input.text, fontSize);
    layer = {
      ...baseLayer,
      ty: 5,
      __kalEditableKind: 'text',
      t: {
        d: {
          k: [
            {
              s: {
                sz: [textSize.width, textSize.height],
                ps: [0, 0],
                s: fontSize,
                f: fontName,
                t: input.text,
                j: 0,
                tr: 0,
                lh: textSize.height,
                ls: 0,
                fc: [1, 1, 1],
              },
            },
          ],
        },
        p: {},
        m: {
          g: 1,
          a: { a: 0, k: [0, 0] },
        },
      },
    };
  } else {
    const assetId = getUniqueAssetId(parsed, 'solid_custom');
    const width = Math.max(1, Math.round(input.width ?? rootWidth));
    const height = Math.max(1, Math.round(input.height ?? rootHeight));
    parsed.assets.push({
      id: assetId,
      w: width,
      h: height,
      u: '',
      p: createSolidImageDataUrl(width, height, input.color),
      e: 1,
      nm: `${layerName}.svg`,
      __kalEditableKind: 'solid',
    });
    layer = {
      ...baseLayer,
      ty: 2,
      __kalEditableKind: 'solid',
      refId: assetId,
    };
  }

  parsed.layers.unshift(layer);
  return {
    jsonText: `${JSON.stringify(parsed, null, 2)}\n`,
    layerIndex,
    layerName,
  };
}

export function collectTextLayers(parsedJson: any): TextLayerRow[] {
  const rows: TextLayerRow[] = [];

  const walkLayers = (layers: any[], basePath: Array<string | number>) => {
    layers.forEach((layer, index) => {
      const path = [...basePath, index];
      if (layer?.ty === 5) {
        const text = Array.isArray(layer?.t?.d?.k)
          ? layer.t.d.k.find((item: any) => typeof item?.s?.t === 'string')?.s?.t || ''
          : '';

        rows.push({
          key: path.join('.'),
          name: layer?.nm || `(text_${index})`,
          text,
          path,
        });
      }
    });
  };

  if (Array.isArray(parsedJson?.layers)) {
    walkLayers(parsedJson.layers, ['layers']);
  }

  if (Array.isArray(parsedJson?.assets)) {
    parsedJson.assets.forEach((asset: any, assetIndex: number) => {
      if (Array.isArray(asset?.layers)) {
        walkLayers(asset.layers, ['assets', assetIndex, 'layers']);
      }
    });
  }

  return rows;
}

export function updateJsonTextLayerValue(
  jsonText: string,
  targetPath: Array<string | number>,
  nextText: string,
) {
  const parsed = JSON.parse(jsonText) as any;
  let current: any = parsed;

  for (const segment of targetPath) {
    current = current?.[segment];
    if (current === undefined) {
      return jsonText;
    }
  }

  if (Array.isArray(current?.t?.d?.k)) {
    current.t.d.k.forEach((item: any) => {
      if (item?.s && typeof item.s === 'object') {
        item.s.t = nextText;
      }
    });
  }

  return `${JSON.stringify(parsed, null, 2)}\n`;
}

export function updateJsonResourcePath(
  jsonText: string,
  kind: ResourceKind,
  id: string,
  nextUrl: string,
  packPath?: string,
) {
  const parsed = JSON.parse(jsonText) as any;
  const splitPackPath = (value: string) => {
    const normalized = value.trim().replace(/\\/g, '/').replace(/^\/+/, '');
    const index = normalized.lastIndexOf('/');
    if (index < 0) return { dir: '', fileName: normalized };
    return {
      dir: `${normalized.slice(0, index + 1)}`,
      fileName: normalized.slice(index + 1),
    };
  };

  if (kind === 'image' && Array.isArray(parsed.assets)) {
    const asset = parsed.assets.find((item: any) => item.id === id);
    if (asset) {
      const nextPath = packPath ? splitPackPath(packPath) : null;
      asset.u = nextPath ? nextPath.dir : '';
      asset.p = nextPath ? nextPath.fileName : nextUrl;
      asset.e = 0;
    }
  }

  if (kind === 'video' && Array.isArray(parsed.videos)) {
    const asset = parsed.videos.find((item: any) => item.id === id);
    if (asset) {
      const nextPath = packPath ? splitPackPath(packPath) : null;
      asset.u = nextPath ? nextPath.dir : '';
      asset.p = nextPath ? nextPath.fileName : nextUrl;
      asset.e = 0;
    }
  }

  if (kind === 'font' && Array.isArray(parsed.fonts?.list)) {
    parsed.fonts.list.forEach((font: any) => {
      if (font?.fName !== id) return;
      font.origin = 3;
      font.fPath = nextUrl;
    });
  }

  return `${JSON.stringify(parsed, null, 2)}\n`;
}

export function updateJsonFontStyle(jsonText: string, fontName: string, nextStyle: string) {
  const parsed = JSON.parse(jsonText) as any;
  let updated = false;

  if (Array.isArray(parsed.fonts?.list)) {
    parsed.fonts.list.forEach((font: any) => {
      if (font?.fName !== fontName) return;
      font.fStyle = nextStyle;
      updated = true;
    });
  }

  if (!updated) {
    throw new Error(`未找到字体 ${fontName}`);
  }

  return `${JSON.stringify(parsed, null, 2)}\n`;
}

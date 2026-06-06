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
) {
  const parsed = JSON.parse(jsonText) as any;

  if (kind === 'image' && Array.isArray(parsed.assets)) {
    const asset = parsed.assets.find((item: any) => item.id === id);
    if (asset) {
      asset.u = '';
      asset.p = nextUrl;
      asset.e = 0;
    }
  }

  if (kind === 'video' && Array.isArray(parsed.videos)) {
    const asset = parsed.videos.find((item: any) => item.id === id);
    if (asset) {
      asset.u = '';
      asset.p = nextUrl;
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

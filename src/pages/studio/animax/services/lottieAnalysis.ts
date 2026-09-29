import {
  LottieParser,
  type AssetInfo,
  type FontInfo,
  type VideoAsset,
} from '../../../../utils/lottie-parser';
import type { EditableLayerKind, LayerEffectSummary, LayerRow, TextLayerRow } from '../toolTypes';
import {
  collectTextLayers,
  readLayerStaticTransform,
  readLayerTransformStaticState,
} from '../toolUtils';

interface LottieLayerRefSummary {
  refId?: string;
}

export interface LottieCompositionSummary {
  layers: LottieLayerRefSummary[];
  precomps: Record<string, LottieLayerRefSummary[]>;
  images: Record<string, AssetInfo>;
  fonts: Record<string, FontInfo>;
  videos: Record<string, VideoAsset>;
}

export interface LottieAnalysisResult {
  parsedJson: any;
  composition: LottieCompositionSummary | null;
  textLayerRows: TextLayerRow[];
  layerRows: LayerRow[];
  elapsedMs: number;
}

export interface LottieJsonInspection {
  previewable: boolean;
  relativeResourcePaths: string[];
  elapsedMs: number;
}

export type LottieAnalysisWorkerRequest =
  | {
      requestId: number;
      mode?: 'analyze';
      jsonText: string;
    }
  | {
      requestId: number;
      mode: 'inspect';
      jsonText: string;
    };

export type LottieAnalysisWorkerResponse =
  | {
      requestId: number;
      mode: 'analyze';
      ok: true;
      result: LottieAnalysisResult;
    }
  | {
      requestId: number;
      mode: 'inspect';
      ok: true;
      result: LottieJsonInspection;
    }
  | {
      requestId: number;
      mode: 'analyze' | 'inspect';
      ok: false;
      error: string;
    };

interface ParsedWorkerRequest {
  requestId: number;
  mode: 'analyze' | 'inspect';
  jsonText: string;
}

const getNow = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

const normalizeResourceRelPath = (path: string) =>
  path.replace(/\\/g, '/').split('/').filter(Boolean).join('/');

const isRemoteOrInlineResource = (value: string) =>
  /^([a-z][a-z0-9+.-]*:|\/\/)/i.test(value.trim());

const isPreviewableLottieJson = (json: any) =>
  Boolean(
    json &&
    typeof json === 'object' &&
    (Array.isArray(json.layers) ||
      Array.isArray(json.assets) ||
      Array.isArray(json.videos) ||
      typeof json.fr === 'number'),
  );

export const collectRelativeResourcePathsFromJson = (json: any) => {
  const paths = new Set<string>();
  const addPath = (value: string) => {
    const trimmed = value.trim();
    if (!trimmed || isRemoteOrInlineResource(trimmed)) return;
    const normalized = normalizeResourceRelPath(trimmed.replace(/^\/+/, ''));
    if (!normalized) return;
    paths.add(normalized);
  };

  if (Array.isArray(json?.assets)) {
    json.assets.forEach((asset: any) => {
      if (!asset || Array.isArray(asset.layers)) return;
      const p = typeof asset.p === 'string' ? asset.p : '';
      const u = typeof asset.u === 'string' ? asset.u : '';
      addPath(`${u}${p}`);
    });
  }

  if (Array.isArray(json?.videos)) {
    json.videos.forEach((video: any) => {
      const p = typeof video?.p === 'string' ? video.p : '';
      const u = typeof video?.u === 'string' ? video.u : '';
      addPath(`${u}${p}`);
    });
  }

  if (Array.isArray(json?.fonts?.list)) {
    json.fonts.list.forEach((font: any) => {
      const fPath = typeof font?.fPath === 'string' ? font.fPath : '';
      addPath(fPath);
    });
  }

  return Array.from(paths);
};

const getEditableLayerKind = (layer: any): EditableLayerKind | undefined => {
  const kind = layer?.__kalEditableKind;
  return kind === 'image' || kind === 'text' || kind === 'solid' ? kind : undefined;
};

const getLayerTypeLabel = (typeCode: number, layer?: any) => {
  if (getEditableLayerKind(layer) === 'solid') return 'Solid';

  switch (typeCode) {
    case 0:
      return '预合成';
    case 1:
      return '纯色';
    case 2:
      return '图片';
    case 3:
      return '空对象';
    case 4:
      return '形状';
    case 5:
      return '文本';
    case 6:
      return '音频';
    case 13:
      return '相机';
    case 1009:
      return '视频';
    default:
      return '未知';
  }
};

const getFrameNumber = (value: any, fallback = 0) => {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : fallback;
};

const getOptionalNumber = (value: any) => {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : undefined;
};

const getTextLayerFontNames = (layer: any) => {
  const fontNames = new Set<string>();
  const keyframes = layer?.t?.d?.k;
  if (!Array.isArray(keyframes)) return [];

  keyframes.forEach((keyframe: any) => {
    const fontName = typeof keyframe?.s?.f === 'string' ? keyframe.s.f.trim() : '';
    if (fontName) fontNames.add(fontName);
  });

  return Array.from(fontNames);
};

const getLayerEffects = (layer: any): LayerEffectSummary[] => {
  if (!Array.isArray(layer?.ef)) return [];

  return layer.ef.map((effect: any) => {
    const name = typeof effect?.nm === 'string' && effect.nm.trim() ? effect.nm.trim() : 'Effect';
    const matchName =
      typeof effect?.mn === 'string' && effect.mn.trim() ? effect.mn.trim() : undefined;
    const normalized = `${name} ${matchName ?? ''}`.toLocaleLowerCase();

    if (normalized.includes('gaussian blur') || normalized.includes('高斯模糊')) {
      return { kind: 'gaussian-blur' as const, name, matchName };
    }
    if (normalized.includes('drop shadow') || normalized.includes('投影')) {
      return { kind: 'drop-shadow' as const, name, matchName };
    }
    return { kind: 'unsupported' as const, name, matchName };
  });
};

export const collectLayerRows = (json: any): LayerRow[] => {
  const rows: LayerRow[] = [];
  let order = 0;

  const collect = (layers: any[], compositionName: string, basePath: Array<string | number>) => {
    let previousMatteLayerIndex: number | undefined;
    layers.forEach((layer, layerIndex) => {
      const path = [...basePath, layerIndex];
      const typeCode = getFrameNumber(layer?.ty, 0);
      const editableKind = getEditableLayerKind(layer);
      const index = getFrameNumber(layer?.ind, layerIndex + 1);
      const name = String(layer?.nm || `layer_${index}`);
      const key = path.join('.');
      const parentIndex = layer?.parent !== undefined ? getOptionalNumber(layer.parent) : undefined;
      const timeStretch = getFrameNumber(layer?.sr, 1);
      const matteLayerType = layer?.td !== undefined ? getOptionalNumber(layer.td) : undefined;
      const isMatte = typeof matteLayerType === 'number' && matteLayerType > 0;
      const matteType = layer?.tt !== undefined ? getOptionalNumber(layer.tt) : undefined;
      const previousLayer = layerIndex > 0 ? layers[layerIndex - 1] : undefined;
      const previousLayerIndex =
        previousLayer?.ind !== undefined ? getOptionalNumber(previousLayer.ind) : undefined;
      const matteLayerIndex =
        typeof matteType === 'number' && matteType > 0
          ? layer?.tp !== undefined
            ? getOptionalNumber(layer.tp)
            : (previousMatteLayerIndex ?? previousLayerIndex)
          : undefined;
      rows.push({
        key,
        name,
        typeLabel: getLayerTypeLabel(typeCode, layer),
        typeCode,
        path,
        transform: readLayerStaticTransform(layer),
        transformStaticState: readLayerTransformStaticState(layer),
        index,
        order,
        startFrame: getFrameNumber(layer?.ip),
        endFrame: getFrameNumber(layer?.op),
        compositionName,
        editableKind,
        refId: typeof layer?.refId === 'string' && layer.refId ? layer.refId : undefined,
        fontNames: typeCode === 5 ? getTextLayerFontNames(layer) : undefined,
        timeStretch,
        effects: getLayerEffects(layer),
        parentIndex,
        hidden: Boolean(layer?.hd),
        isMatte,
        matteType,
        matteLayerIndex,
        is3d: Boolean(layer?.ddd),
      });
      if (isMatte) {
        previousMatteLayerIndex = index;
      }
      order += 1;
    });
  };

  if (Array.isArray(json?.layers)) {
    collect(json.layers, '主合成', ['layers']);
  }

  if (Array.isArray(json?.assets)) {
    json.assets.forEach((asset: any, assetIndex: number) => {
      if (!Array.isArray(asset?.layers)) return;
      const compositionName = String(asset.nm || asset.id || '预合成');
      collect(asset.layers, compositionName, ['assets', assetIndex, 'layers']);
    });
  }

  return rows;
};

const summarizeLayerRefs = (layers: any[]): LottieLayerRefSummary[] =>
  layers.map((layer) => ({
    refId: typeof layer?.refId === 'string' && layer.refId ? layer.refId : undefined,
  }));

const createCompositionSummary = (json: any): LottieCompositionSummary | null => {
  try {
    const composition = LottieParser.Parse(json);
    return {
      layers: summarizeLayerRefs(composition.layers),
      precomps: Object.fromEntries(
        Object.entries(composition.precomps).map(([id, layers]) => [
          id,
          summarizeLayerRefs(layers),
        ]),
      ),
      images: composition.images,
      fonts: composition.fonts,
      videos: composition.videos,
    };
  } catch {
    return null;
  }
};

export function analyzeLottieJsonText(jsonText: string): LottieAnalysisResult {
  const startedAt = getNow();
  const parsedJson = JSON.parse(jsonText) as any;

  return {
    parsedJson,
    composition: createCompositionSummary(parsedJson),
    textLayerRows: collectTextLayers(parsedJson),
    layerRows: collectLayerRows(parsedJson),
    elapsedMs: getNow() - startedAt,
  };
}

export function inspectLottieJsonText(jsonText: string): LottieJsonInspection {
  const startedAt = getNow();
  const parsedJson = JSON.parse(jsonText) as any;

  return {
    previewable: isPreviewableLottieJson(parsedJson),
    relativeResourcePaths: collectRelativeResourcePathsFromJson(parsedJson),
    elapsedMs: getNow() - startedAt,
  };
}

export const normalizeLottieAnalysisWorkerRequest = (
  data: LottieAnalysisWorkerRequest,
): ParsedWorkerRequest => ({
  requestId: data.requestId,
  mode: data.mode ?? 'analyze',
  jsonText: data.jsonText,
});

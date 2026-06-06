import { CompositionModel, LayerModel } from './models';
import { LayerParser } from './parsers';
import { RectF, AssetInfo, FontInfo } from './types';

export * from './models';
export * from './types';
export * from './parsers';

export class LottieParser {
  static Parse(json: any): CompositionModel {
    const scale = 1.0;
    const composition = new CompositionModel(scale);

    const width = json.w || 0;
    const height = json.h || 0;
    const bounds: RectF = { left: 0, top: 0, width, height };
    
    const startFrame = json.ip || 0;
    const endFrame = json.op || 0;
    const frameRate = json.fr || 0;
    const enable3d = json.ddd !== undefined ? !!json.ddd : false;

    composition.Init(bounds, startFrame, endFrame, frameRate, enable3d);

    // Parse Assets
    if (json.assets) {
      LottieParser.ParseAssets(json.assets, composition);
    }

    // Parse Videos
    if (json.videos) {
      LottieParser.ParseVideos(json.videos, composition);
    }

    // Parse Fonts
    if (json.fonts) {
      LottieParser.ParseFonts(json.fonts, composition);
    }

    // Parse Chars
    if (json.chars) {
      LottieParser.ParseChars(json.chars, composition);
    }
    
    // Parse Markers
    if (json.markers) {
        for (const m of json.markers) {
            composition.markers.push({
                name: m.cm,
                startFrame: m.tm,
                durationFrames: m.dr
            });
        }
    }

    // Parse Layers
    if (json.layers) {
      LottieParser.ParseLayers(json.layers, composition);
    }

    return composition;
  }

  private static ParseAssets(assetsJson: any[], composition: CompositionModel) {
    for (const asset of assetsJson) {
      const id = asset.id;
      if (!id) continue;

      if (asset.layers) {
        // Precomp
        const precompLayers: LayerModel[] = [];
        for (const layerJson of asset.layers) {
          const layer = LayerParser.Parse(layerJson, composition);
          precompLayers.push(layer);
        }
        composition.precomps[id] = precompLayers;
      } else if (asset.p) {
        // Image
        const imageAsset: AssetInfo = {
            id: id,
            width: asset.w || 0,
            height: asset.h || 0,
            fileName: asset.p,
            dirName: asset.u || ''
        };
        composition.images[id] = imageAsset;
      }
    }
  }

  private static ParseVideos(videosJson: any[], composition: CompositionModel) {
    for (const video of videosJson) {
      const id = video.id;
      if (!id) continue;

      composition.videos[id] = {
        id,
        rgbFrame: Array.isArray(video.rgbFrame)
          ? video.rgbFrame
          : [video.x || 0, video.y || 0, video.w || 0, video.h || 0],
        aFrame: Array.isArray(video.aFrame)
          ? video.aFrame
          : [video.ax || 0, video.ay || 0, video.aw || video.w || 0, video.ah || video.h || 0],
        fileName: video.p || video.path || '',
        dirName: video.u || '',
        w: video.w || video.videoW || 0,
        h: video.h || video.videoH || 0,
        frames: video.f,
        size: video.sz,
      };
    }
  }

  private static ParseLayers(layersJson: any[], composition: CompositionModel) {
    const layers = composition.layers;
    const layerMap = composition.layerMap;

    for (const layerJson of layersJson) {
      const layer = LayerParser.Parse(layerJson, composition);
      layers.push(layer);
      layerMap[layer.layerId] = layer;
    }
  }

  private static ParseFonts(fontsJson: any, composition: CompositionModel) {
      if (fontsJson.list) {
          for (const font of fontsJson.list) {
              const fontInfo: FontInfo = {
                  family: font.fFamily,
                  name: font.fName,
                  style: font.fStyle
              };
              composition.fonts[font.fName] = fontInfo;
          }
      }
  }

  private static ParseChars(_charsJson: any[], _composition: CompositionModel) {
      // Placeholder for char parsing
  }
}

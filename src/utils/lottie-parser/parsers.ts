import {
  CompositionModel,
  LayerModel,
  MaskModel,
  MaskMode,
  KeyframeModel,
  BaseValue,
  FloatValue,
  IntegerValue,
  PointF,
  ScaleF,
  Color,
  BaseAnimatableValue,
  AnimatableFloatValue,
  AnimatableIntegerValue,
  AnimatablePointValue,
  AnimatableScaleValue,
  AnimatableColorValue,
  AnimatableShapeValue,
  AnimatablePathValue,
  AnimatableGradientValue,
  AnimatableTextFrame,
  AnimatableTransformModel,
  CubicBezierInterpolator,
  AnimatableSplitDimensionPathValue,
  DocumentData,
  GradientColor,
} from './models';
import { LayerType, MatteType } from './types';

// --- Value Parser ---

export class ValueParser {
  static ParseFloat(json: any, _composition: CompositionModel): number {
    if (typeof json === 'number') return json;
    if (Array.isArray(json) && json.length > 0) return json[0];
    return 0;
  }

  static ParseInteger(json: any, composition: CompositionModel): number {
    return Math.round(ValueParser.ParseFloat(json, composition));
  }

  static ParsePoint(json: any, composition: CompositionModel): PointF {
    if (Array.isArray(json) && json.length >= 2) {
      let x = json[0];
      let y = json[1];
      if (typeof x === 'object' && x.k !== undefined) x = x.k; // Handle weird cases if any
      if (typeof y === 'object' && y.k !== undefined) y = y.k;
      return new PointF(x * composition.scale, y * composition.scale);
    }
    if (typeof json === 'object' && json.x !== undefined && json.y !== undefined) {
      return new PointF(json.x * composition.scale, json.y * composition.scale);
    }
    return new PointF();
  }

  static ParseScale(json: any, _composition: CompositionModel): ScaleF {
    if (Array.isArray(json) && json.length >= 2) {
      return new ScaleF(json[0], json[1]);
    }
    return new ScaleF();
  }

  static ParseColor(json: any, _composition: CompositionModel): Color {
    if (Array.isArray(json) && json.length >= 3) {
      let r = json[0];
      let g = json[1];
      let b = json[2];
      let a = json.length > 3 ? json[3] : 1.0;
      
      // Lottie colors are 0-1 usually, but check range
      if (r <= 1.0 && g <= 1.0 && b <= 1.0) {
        r *= 255; g *= 255; b *= 255;
      }
      return new Color(Math.round(r), Math.round(g), Math.round(b), Math.round(a * 255));
    }
    return new Color();
  }

  static ParseShapeData(json: any, _composition: CompositionModel): any {
    // Simplified shape parsing
    return json;
  }

  static ParseDocumentData(_json: any, _composition: CompositionModel): DocumentData {
    return new DocumentData(); // TODO: Implement actual parsing
  }

  static ParseGradientColor(_json: any, _composition: CompositionModel): GradientColor {
    return new GradientColor(); // TODO: Implement actual parsing
  }
}

// --- Keyframe Parser ---

export class KeyframeParser {
  static Parse<T extends BaseValue>(
    json: any,
    composition: CompositionModel,
    valueParser: (json: any, comp: CompositionModel) => T
  ): KeyframeModel {
    const keyframe = new KeyframeModel(composition);

    if (json.t !== undefined) {
      keyframe.startFrame = json.t;
      keyframe.endFrame = json.t; // Default, will be updated by next keyframe usually
    }

    if (json.s !== undefined) {
      keyframe.startValue = valueParser(json.s, composition);
    }

    if (json.e !== undefined) {
      keyframe.endValue = valueParser(json.e, composition);
    }

    if (json.o !== undefined && json.i !== undefined) {
      // Interpolator
      let x1 = 0, y1 = 0, x2 = 1, y2 = 1;
      if (json.o.x && Array.isArray(json.o.x)) x1 = json.o.x[0];
      else if (typeof json.o.x === 'number') x1 = json.o.x;
      
      if (json.o.y && Array.isArray(json.o.y)) y1 = json.o.y[0];
      else if (typeof json.o.y === 'number') y1 = json.o.y;

      if (json.i.x && Array.isArray(json.i.x)) x2 = json.i.x[0];
      else if (typeof json.i.x === 'number') x2 = json.i.x;

      if (json.i.y && Array.isArray(json.i.y)) y2 = json.i.y[0];
      else if (typeof json.i.y === 'number') y2 = json.i.y;

      keyframe.interpolator = new CubicBezierInterpolator(x1, y1, x2, y2);
    }

    if (json.h === 1) {
      keyframe.hold = true;
    }

    // Path control points for spatial interpolation
    if (json.ti !== undefined && json.to !== undefined) {
        // Parse ti/to as points (relative to start/end values usually)
        // Ignoring details for brevity, assume PointF parsing
        // keyframe.SetPathCps(...)
    }

    return keyframe;
  }
}

// --- Animatable Value Parser ---

export class AnimatableValueParser {
  static Parse<T extends BaseAnimatableValue>(
    json: any,
    composition: CompositionModel,
    createAnimatable: () => T,
    parseValue: (json: any, comp: CompositionModel) => any
  ): T {
    const animatable = createAnimatable();
    if (!json) return animatable;

    let k = json.k;
    if (k === undefined) {
      // Sometimes value is direct
      k = json;
    }

    if (this.IsKeyframed(json)) {
      if (Array.isArray(k)) {
        for (let i = 0; i < k.length; i++) {
          const kfJson = k[i];
          const keyframe = KeyframeParser.Parse(kfJson, composition, parseValue);
          
          // Link end frame if needed
          if (i > 0) {
             // Logic to connect frames
          }
          if (i < k.length - 1 && k[i+1].t !== undefined) {
             keyframe.endFrame = k[i+1].t;
          } else {
             keyframe.endFrame = keyframe.startFrame; // Last frame
          }

          animatable.keyframes.push(keyframe);
        }
      }
    } else {
      // Static value
      const keyframe = new KeyframeModel(composition);
      keyframe.startFrame = 0;
      keyframe.endFrame = 0;
      keyframe.startValue = parseValue(k, composition);
      animatable.keyframes.push(keyframe);
    }

    return animatable;
  }

  static IsKeyframed(json: any): boolean {
    return json && Array.isArray(json.k) && json.k.length > 0 && typeof json.k[0] === 'object' && json.k[0].t !== undefined;
  }

  static ParseFloat(json: any, composition: CompositionModel): AnimatableFloatValue {
    return this.Parse(json, composition, () => new AnimatableFloatValue(), (j, c) => new FloatValue(ValueParser.ParseFloat(j, c)));
  }

  static ParseInteger(json: any, composition: CompositionModel): AnimatableIntegerValue {
    return this.Parse(json, composition, () => new AnimatableIntegerValue(), (j, c) => new IntegerValue(ValueParser.ParseInteger(j, c)));
  }
  
  static ParseColor(json: any, composition: CompositionModel): AnimatableColorValue {
    return this.Parse(json, composition, () => new AnimatableColorValue(), ValueParser.ParseColor);
  }

  static ParsePoint(json: any, composition: CompositionModel): AnimatablePointValue {
     return this.Parse(json, composition, () => new AnimatablePointValue(), ValueParser.ParsePoint);
  }

  static ParseScale(json: any, composition: CompositionModel): AnimatableScaleValue {
    return this.Parse(json, composition, () => new AnimatableScaleValue(), ValueParser.ParseScale);
  }

  static ParseShapeData(json: any, composition: CompositionModel): AnimatableShapeValue {
    return this.Parse(json, composition, () => new AnimatableShapeValue(), (j, c) => ValueParser.ParseShapeData(j, c)); // TODO: Wrap in ShapeData
  }

  static ParseDocumentData(json: any, composition: CompositionModel): AnimatableTextFrame {
    return this.Parse(json, composition, () => new AnimatableTextFrame(), ValueParser.ParseDocumentData);
  }

  static ParseGradientColor(json: any, composition: CompositionModel): AnimatableGradientValue {
    return this.Parse(json, composition, () => new AnimatableGradientValue(), ValueParser.ParseGradientColor);
  }
}

// --- Animatable Transform Parser ---

export class AnimatableTransformParser {
  static Parse(json: any, composition: CompositionModel): AnimatableTransformModel {
    let anchorPoint: AnimatablePathValue | null = null;
    let position: AnimatablePointValue | null = null;
    let scale: AnimatableScaleValue | null = null;
    let rotation: AnimatableFloatValue | null = null;
    let opacity: AnimatableIntegerValue | null = null;
    let skew: AnimatableFloatValue | null = null;
    let skewAngle: AnimatableFloatValue | null = null;

    if (json.a) {
        // anchor point
        anchorPoint = AnimatableValueParser.Parse(json.a, composition, () => new AnimatablePathValue(), ValueParser.ParsePoint) as unknown as AnimatablePathValue;
    }
    if (json.p) {
        // position
        // Check for split dimensions
        if (json.p.s) {
           // Split
           const x = json.p.x ? AnimatableValueParser.ParseFloat(json.p.x, composition) : null;
           const y = json.p.y ? AnimatableValueParser.ParseFloat(json.p.y, composition) : null;
           position = new AnimatableSplitDimensionPathValue(x, y);
        } else {
           position = AnimatableValueParser.ParsePoint(json.p, composition);
        }
    }
    if (json.s) {
        scale = AnimatableValueParser.ParseScale(json.s, composition);
    }
    if (json.r) {
        rotation = AnimatableValueParser.ParseFloat(json.r, composition);
    } else if (json.rz) {
        rotation = AnimatableValueParser.ParseFloat(json.rz, composition);
    }
    if (json.o) {
        opacity = AnimatableValueParser.ParseInteger(json.o, composition);
    }
    if (json.sk) {
        skew = AnimatableValueParser.ParseFloat(json.sk, composition);
    }
    if (json.sa) {
        skewAngle = AnimatableValueParser.ParseFloat(json.sa, composition);
    }

    return new AnimatableTransformModel(
        anchorPoint, position, scale, rotation, opacity, skew, skewAngle
    );
  }
}

// --- Mask Parser ---

export class MaskParser {
  static Parse(json: any, composition: CompositionModel): MaskModel {
    const mask = new MaskModel();
    
    if (json.mode) {
        switch (json.mode) {
            case 'a': mask.mode = MaskMode.kAdd; break;
            case 's': mask.mode = MaskMode.kSubtract; break;
            case 'i': mask.mode = MaskMode.kIntersect; break;
            case 'n': mask.mode = MaskMode.kNone; break;
            default: mask.mode = MaskMode.kAdd;
        }
    }
    
    if (json.pt) {
        mask.maskPath = AnimatableValueParser.ParseShapeData(json.pt, composition);
    }
    
    if (json.o) {
        mask.opacity = AnimatableValueParser.ParseInteger(json.o, composition);
    }
    
    if (json.inv) {
        mask.inverted = !!json.inv;
    }

    return mask;
  }
}

// --- Animatable Text Properties Parser ---

export class AnimatableTextPropertiesParser {
  static Parse(value: any, composition: CompositionModel): any {
    if (typeof value !== 'object' || value === null) return { color: null, stroke: null, strokeWidth: null, tracking: null };
    let anim: any = null;
    if (value.a) {
      anim = AnimatableTextPropertiesParser._ParseAnimatableTextProperty(value.a, composition);
    }
    return anim || { color: null, stroke: null, strokeWidth: null, tracking: null };
  }

  static _ParseAnimatableTextProperty(value: any, composition: CompositionModel): any {
    if (typeof value !== 'object' || value === null) return null;
    let color = null;
    let stroke = null;
    let strokeWidth = null;
    let tracking = null;

    if (value.fc) color = AnimatableValueParser.ParseColor(value.fc, composition);
    if (value.sc) stroke = AnimatableValueParser.ParseColor(value.sc, composition);
    if (value.sw) strokeWidth = AnimatableValueParser.ParseFloat(value.sw, composition);
    if (value.t) tracking = AnimatableValueParser.ParseFloat(value.t, composition);

    return { color, stroke, strokeWidth, tracking };
  }
}

// --- Content Model Parser ---

export class ContentModelParser {
  static Parse(value: any, composition: CompositionModel): any {
    if (typeof value !== 'object' || value === null) return null;

    const type = value.ty;
    if (!type) return null;

    if (type === 'gr') {
      const items: any[] = [];
      if (Array.isArray(value.it)) {
        for (const it of value.it) {
          const parsed = ContentModelParser.Parse(it, composition);
          if (parsed) items.push(parsed);
        }
      }
      return {
        type: 'gr',
        name: value.nm || '',
        hidden: !!value.hd,
        items: items,
      };
    }

    if (type === 'tr') {
      return { type: 'tr', transform: AnimatableTransformParser.Parse(value, composition) };
    }

    if (type === 'sh') {
      return {
        type: 'sh',
        name: value.nm || '',
        index: value.ind,
        hidden: !!value.hd,
        shape: AnimatableValueParser.ParseShapeData(value.ks || {}, composition),
      };
    }
    
    if (type === 'el') {
         return {
             type: 'el',
             name: value.nm || '',
             hidden: !!value.hd,
             direction: value.d || 2,
             position: AnimatableValueParser.ParsePoint(value.p || {}, composition),
             size: AnimatableValueParser.ParsePoint(value.s || {}, composition)
         };
    }

    if (type === 'rc') {
         return {
             type: 'rc',
             name: value.nm || '',
             hidden: !!value.hd,
             position: AnimatableValueParser.ParsePoint(value.p || {}, composition),
             size: AnimatableValueParser.ParsePoint(value.s || {}, composition),
             roundness: AnimatableValueParser.ParseFloat(value.r || 0, composition)
         };
    }

    if (type === 'fl') {
        const opacity = AnimatableValueParser.ParseInteger(value.o !== undefined ? value.o : 100, composition);
        return {
            type: 'fl',
            name: value.nm || '',
            hidden: !!value.hd,
            fillEnabled: value.fillEnabled !== undefined ? value.fillEnabled : true,
            fillType: value.r || 1,
            opacity: opacity,
            color: AnimatableValueParser.ParseColor(value.c || [0,0,0,1], composition)
        };
    }

    if (type === 'st') {
        const opacity = AnimatableValueParser.ParseInteger(value.o !== undefined ? value.o : 100, composition);
        return {
            type: 'st',
            name: value.nm || '',
            hidden: !!value.hd,
            color: AnimatableValueParser.ParseColor(value.c || [0,0,0,1], composition),
            width: AnimatableValueParser.ParseFloat(value.w || 0.0, composition),
            opacity: opacity,
            cap: value.lc || 0,
            join: value.lj || 0,
            miterLimit: value.ml || 0,
        };
    }

    return { type: type, raw: value };
  }
}

// --- Layer Parser ---

export class LayerParser {
  static _CreateKeyframe(composition: CompositionModel, startValue: number, endValue: number, startFrame: number, endFrame: number): KeyframeModel {
      const keyframe = new KeyframeModel(composition);
      keyframe.startFrame = startFrame;
      keyframe.endFrame = endFrame;
      keyframe.startValue = new FloatValue(startValue);
      keyframe.endValue = new FloatValue(endValue);
      return keyframe;
  }

  static Parse(json: any, composition: CompositionModel): LayerModel {
    const layer = new LayerModel(composition);
    
    const name = json.nm || '';
    const layerType = json.ty !== undefined ? json.ty as LayerType : LayerType.kPreComp;
    const layerId = json.ind || 0;
    const parentId = json.parent !== undefined ? json.parent : -1;
    const refId = json.refId || '';
    
    let solidWidth = 0;
    let solidHeight = 0;
    let solidColor: Color | null = null;
    if (json.sw) solidWidth = json.sw * composition.scale;
    if (json.sh) solidHeight = json.sh * composition.scale;
    if (json.sc) {
        if (typeof json.sc === 'string') {
             const c = json.sc;
             const r = parseInt(c.substring(1, 3), 16) / 255;
             const g = parseInt(c.substring(3, 5), 16) / 255;
             const b = parseInt(c.substring(5, 7), 16) / 255;
             solidColor = ValueParser.ParseColor([r, g, b, 1], composition);
        } else {
             solidColor = ValueParser.ParseColor(json.sc, composition);
        }
    }

    const timeStretch = json.sr || 1.0;
    
    // Field mismatch fix: Use ip for startFrame as requested
    const inFrame = json.ip || 0;
    const outFrame = json.op || 0;

    const preCompWidth = json.w ? json.w * composition.scale : 0;
    const preCompHeight = json.h ? json.h * composition.scale : 0;
    
    let text = null;
    let textPropertiesList: any[] | null = null;
    if (json.t) {
        if (json.t.d) text = AnimatableValueParser.ParseDocumentData(json.t.d, composition);
        if (json.t.a) {
            textPropertiesList = [];
            for (const prop of json.t.a) {
                const p = AnimatableTextPropertiesParser.Parse(prop, composition);
                if (p) textPropertiesList.push(p);
            }
        }
    }
    
    const hidden = json.hd || false;
    
    let transform = null;
    if (json.ks) {
        transform = AnimatableTransformParser.Parse(json.ks, composition);
    }
    
    const matteTypeRaw = json.tt || MatteType.kUnknown;
    const matteParent = json.tp !== undefined ? json.tp : -1;
    const isMatteTarget = json.td || false; 
    
    const timeRemapping = json.tm ? AnimatableValueParser.ParseFloat(json.tm, composition) : null;
    const blurEffect = null;
    const dropShadowEffect = null;
    
    const enable3d = json.ddd !== undefined ? !!json.ddd : false;
    const perspective = json.pe ? AnimatableValueParser.ParseFloat(json.pe, composition) : null;

    layer.startFrame = inFrame;
    layer.endFrame = outFrame;

    layer.Init(
        name, layerType, layerId, parentId, refId,
        solidWidth, solidHeight, solidColor,
        timeStretch, preCompWidth, preCompHeight,
        text, textPropertiesList, hidden, transform,
        matteTypeRaw, matteParent, isMatteTarget,
        timeRemapping, blurEffect, dropShadowEffect,
        enable3d, perspective as any
    );

    if (json.masksProperties) {
        for (const maskJson of json.masksProperties) {
            layer.masks.push(MaskParser.Parse(maskJson, composition));
        }
    }
    
    if (json.shapes) {
        for (const shapeJson of json.shapes) {
            const shape = ContentModelParser.Parse(shapeJson, composition);
            if (shape) layer.shapes.push(shape);
        }
    }

    return layer;
  }
}

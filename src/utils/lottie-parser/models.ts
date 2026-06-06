import { LayerType, MatteType, RectF, AssetInfo, FontInfo, Marker, VideoAsset } from './types';

// --- Value Types ---

export enum ValueType {
  kFloat,
  kInteger,
  kPoint,
  kScale,
  kColor,
  kPath,
  kDocument,
  kShape,
  kGradient,
  kOrientation,
  kCameraOrientation,
}

export class BaseValue {
  Copy(): BaseValue { return this; }
}

export class FloatValue extends BaseValue {
  constructor(public value: number) { super(); }
  Copy(): FloatValue { return new FloatValue(this.value); }
}

export class IntegerValue extends BaseValue {
  constructor(public value: number) { super(); }
  Copy(): IntegerValue { return new IntegerValue(this.value); }
}

export class PointF extends BaseValue {
  constructor(public x: number = 0, public y: number = 0, public z: number = 0) { super(); }
  Copy(): PointF { return new PointF(this.x, this.y, this.z); }
}

export class ScaleF extends BaseValue {
  constructor(public x: number = 100, public y: number = 100, public z: number = 100) { super(); }
  Copy(): ScaleF { return new ScaleF(this.x, this.y, this.z); }
}

export class Color extends BaseValue {
  constructor(public r: number = 0, public g: number = 0, public b: number = 0, public a: number = 255) { super(); }
  Copy(): Color { return new Color(this.r, this.g, this.b, this.a); }
}

export class Orientation extends BaseValue {
  constructor(public alpha: number = 0, public beta: number = 0, public gamma: number = 0) { super(); }
  Copy(): Orientation { return new Orientation(this.alpha, this.beta, this.gamma); }
}

export class DocumentData extends BaseValue {
  // Add properties as needed
  Copy(): DocumentData { return new DocumentData(); }
}

export class ShapeData extends BaseValue {
  // Add properties as needed
  Copy(): ShapeData { return new ShapeData(); }
}

export class GradientColor extends BaseValue {
  // Add properties as needed
  Copy(): GradientColor { return new GradientColor(); }
}

// --- Keyframe & Interpolation ---

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

export class CubicBezierInterpolator {
  constructor(public x1: number, public y1: number, public x2: number, public y2: number) {}

  progress(t: number): number {
    t = clamp(t, 0.0, 1.0);
    const sampleCurve = (a1: number, a2: number, u: number) => {
      const inv = 1.0 - u;
      return 3.0 * inv * inv * u * a1 + 3.0 * inv * u * u * a2 + u * u * u;
    };
    const sampleCurveDerivative = (a1: number, a2: number, u: number) => {
      const inv = 1.0 - u;
      return 3.0 * inv * inv * a1 + 6.0 * inv * u * (a2 - a1) + 3.0 * u * u * (1.0 - a2);
    };

    let u = t;
    for (let i = 0; i < 10; i++) {
      const x = sampleCurve(this.x1, this.x2, u) - t;
      const dx = sampleCurveDerivative(this.x1, this.x2, u);
      if (Math.abs(x) < 1e-6 || Math.abs(dx) < 1e-6) break;
      u -= x / dx;
      if (u <= 0.0 || u >= 1.0) {
        u = clamp(u, 0.0, 1.0);
        break;
      }
    }
    const y = sampleCurve(this.y1, this.y2, u);
    return clamp(y, 0.0, 1.0);
  }
}

export class KeyframeModel {
  constructor(
    public composition: CompositionModel | null,
    public startValue: BaseValue | null = null,
    public endValue: BaseValue | null = null,
    public interpolator: CubicBezierInterpolator | null = null,
    public startFrame: number = 0.0,
    public endFrame: number = 0.0,
    public hold: boolean = false,
    public pathCp1: PointF | null = null,
    public pathCp2: PointF | null = null
  ) {}

  SetEndFrame(frame: number) {
    this.endFrame = frame;
  }

  IsStartValueEmpty(): boolean { return this.startValue === null; }
  IsEndValueEmpty(): boolean { return this.endValue === null; }
  CopyStartValue(): BaseValue | null { return this.startValue ? this.startValue.Copy() : null; }
  SetPathCps(cp1: PointF, cp2: PointF) {
    this.pathCp1 = cp1;
    this.pathCp2 = cp2;
  }

  ValueAt(_frame: number): BaseValue | null {
    if (this.startValue === null) return null;
    if (this.hold || this.endValue === null) return this.startValue.Copy();
    
    // Simple interpolation logic placeholder
    // In a real implementation, we would use interpolator and lerp
    return this.startValue.Copy(); 
  }
}

// --- Animatable Values ---

export class BaseAnimatableValue {
  keyframes: KeyframeModel[] = [];

  IsStatic(): boolean {
    return this.keyframes.length <= 1;
  }

  ValueAt(frame: number): BaseValue | null {
    if (this.keyframes.length === 0) return null;
    if (this.keyframes.length === 1) return this.keyframes[0].startValue ? this.keyframes[0].startValue.Copy() : null;
    for (const kf of this.keyframes) {
      if (frame < kf.endFrame) {
        return kf.ValueAt(frame);
      }
    }
    const last = this.keyframes[this.keyframes.length - 1];
    return last.endValue ? last.endValue.Copy() : null;
  }
}

export class AnimatableFloatValue extends BaseAnimatableValue {}
export class AnimatableIntegerValue extends BaseAnimatableValue {}
export class AnimatableColorValue extends BaseAnimatableValue {}
export class AnimatablePointValue extends BaseAnimatableValue {}
export class AnimatableScaleValue extends BaseAnimatableValue {}
export class AnimatableShapeValue extends BaseAnimatableValue {}
export class AnimatablePathValue extends BaseAnimatableValue {}
export class AnimatableOrientationValue extends BaseAnimatableValue {}
export class AnimatableTextFrame extends BaseAnimatableValue {}
export class AnimatableGradientValue extends BaseAnimatableValue {}

export class AnimatableSplitDimensionPathValue extends AnimatablePointValue {
  constructor(public xAnim: AnimatableFloatValue | null = null, public yAnim: AnimatableFloatValue | null = null) {
    super();
  }
}

export class AnimatableTransformModel {
  constructor(
    public anchorPoint: AnimatablePathValue | null = null,
    public position: AnimatablePointValue | null = null,
    public scale: AnimatableScaleValue | null = null,
    public rotation: AnimatableFloatValue | null = null,
    public opacity: AnimatableIntegerValue | null = null,
    public skew: AnimatableFloatValue | null = null,
    public skewAngle: AnimatableFloatValue | null = null,
    public startOpacity: AnimatableFloatValue | null = null,
    public endOpacity: AnimatableFloatValue | null = null,
    public xRotation: AnimatableFloatValue | null = null,
    public yRotation: AnimatableFloatValue | null = null,
    public zRotation: AnimatableFloatValue | null = null,
    public orientation: AnimatableOrientationValue | null = null
  ) {}
}

// --- Masks ---

export enum MaskMode {
  kAdd = 0,
  kSubtract = 1,
  kIntersect = 2,
  kNone = 3,
}

export class MaskModel {
  constructor(
    public mode: MaskMode = MaskMode.kAdd,
    public maskPath: AnimatableShapeValue | null = null,
    public opacity: AnimatableIntegerValue | null = null,
    public inverted: boolean = false,
    public unsupportedKeys: string[] = [],
    public raw: any = null
  ) {}
}

// --- Composition & Layer ---

export class CompositionModel {
  scale: number;
  width: number = 0;
  height: number = 0;
  startFrame: number = 0.0;
  endFrame: number = 0.0;
  frameRate: number = 0.0;
  enable3d: boolean = false;
  layers: LayerModel[] = [];
  layerMap: Record<number, LayerModel> = {};
  precomps: Record<string, LayerModel[]> = {};
  images: Record<string, AssetInfo> = {};
  fonts: Record<string, FontInfo> = {};
  characters: Record<string, any> = {}; 
  markers: Marker[] = [];
  videos: Record<string, VideoAsset> = {};
  bounds: RectF | null = null;
  matteOrMaskCount: number = 0;
  hasDashPattern: boolean = false;
  parseContext: any = { colorPoints: -1 };
  shouldResetIdentity: boolean = true;

  constructor(scale: number = 1.0) {
    this.scale = scale;
  }

  Init(bounds: RectF, startFrame: number, endFrame: number, frameRate: number, enable3d: boolean) {
    this.bounds = bounds;
    this.startFrame = startFrame;
    this.endFrame = endFrame;
    this.frameRate = frameRate;
    this.enable3d = enable3d;
  }

  GetEndFrame(): number { return this.endFrame; }
  IncrementMatteOrMaskCount(count: number) { this.matteOrMaskCount += count; }
}

export class LayerModel {
  composition: CompositionModel;
  name: string = "";
  layerType: LayerType = LayerType.kPreComp;
  layerId: number = 0;
  parentId: number = -1;
  refId: string = "";
  solidWidth: number = 0;
  solidHeight: number = 0;
  solidColor: Color | null = null; 
  timeStretch: number = 1.0;
  preCompWidth: number = 0.0;
  preCompHeight: number = 0.0;
  text: any = null;
  textPropertiesList: any = null;
  hidden: boolean = false;
  transform: AnimatableTransformModel | null = null;
  matteType: MatteType = MatteType.kUnknown;
  matteTypeRaw: number = MatteType.kUnknown;
  matteParent: number = -1;
  isMatteTarget: boolean = false;
  timeRemapping: any = null;
  blurEffect: any = null;
  dropShadowEffect: any = null;
  enable3d: boolean = false;
  perspective: number | null = null;
  masks: MaskModel[] = [];
  shapes: any[] = [];
  startFrame: number = 0.0;
  endFrame: number = 0.0;
  unsupportedEffectTypes: any[] = [];

  constructor(composition: CompositionModel) {
    this.composition = composition;
  }

  static Make(composition: CompositionModel): LayerModel {
    return new LayerModel(composition);
  }

  Init(
    name: string, layerType: LayerType, layerId: number, parentId: number, refId: string,
    solidWidth: number, solidHeight: number, solidColor: Color | null,
    timeStretch: number, preCompWidth: number, preCompHeight: number,
    text: any, textPropertiesList: any, hidden: boolean, transform: AnimatableTransformModel | null,
    matteTypeRaw: number, matteParent: number, isMatteTarget: boolean,
    timeRemapping: any, blurEffect: any, dropShadowEffect: any,
    enable3d: boolean, perspective: number | null
  ) {
    this.name = name;
    this.layerType = layerType;
    this.layerId = layerId;
    this.parentId = parentId;
    this.refId = refId;
    this.solidWidth = solidWidth;
    this.solidHeight = solidHeight;
    this.solidColor = solidColor;
    this.timeStretch = timeStretch;
    this.preCompWidth = preCompWidth;
    this.preCompHeight = preCompHeight;
    this.text = text;
    this.textPropertiesList = textPropertiesList;
    this.hidden = hidden;
    this.transform = transform;
    this.matteTypeRaw = matteTypeRaw;
    // Map raw matte type to enum if possible, logic can be added here
    this.matteParent = matteParent;
    this.isMatteTarget = isMatteTarget;
    this.timeRemapping = timeRemapping;
    this.blurEffect = blurEffect;
    this.dropShadowEffect = dropShadowEffect;
    this.enable3d = enable3d;
    this.perspective = perspective;
  }
  
  GetId(): number { return this.layerId; }
  GetLayerType(): LayerType { return this.layerType; }
}

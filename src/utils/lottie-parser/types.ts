export enum LayerType {
  kPreComp = 0,
  kSolid = 1,
  kImage = 2,
  kNull = 3,
  kShape = 4,
  kText = 5,
  kAudio = 6,
  kCamera = 13,
  kAlphaVideo = 1009,
}

export enum MatteType {
  kUnknown = 0,
  kAlpha = 1,
  kAlphaInverted = 2,
}

export interface RectF {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface InOutFrame {
  start: number;
  end: number;
  value: number;
}

export interface AssetInfo {
  id: string;
  width: number;
  height: number;
  fileName: string;
  dirName: string;
}

export interface FontInfo {
  family: string;
  name: string;
  style: string;
}

export interface Marker {
  name: string;
  startFrame: number;
  durationFrames: number;
}

export interface VideoAsset {
  id: string;
  rgbFrame: number[];
  aFrame: number[];
  fileName: string;
  dirName: string;
  w: number;
  h: number;
  frames?: number;
  size?: number;
}

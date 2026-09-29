import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';
import ffmpegWorkerUrl from './ffmpegClassWorker.js?url';
const ffmpegCoreUrl = 'https://unpkg.com/@ffmpeg/core@0.12.9/dist/esm/ffmpeg-core.js';
const ffmpegCoreWasmUrl = 'https://unpkg.com/@ffmpeg/core@0.12.9/dist/esm/ffmpeg-core.wasm';
import type { VideoProcessOptions, VideoProcessProgress, VideoResourceInfo } from '../toolTypes';

interface ProcessVideoRequest {
  file: File;
  fileName: string;
  options: VideoProcessOptions;
  onProgress?: (progress: VideoProcessProgress) => void;
}

interface ProbeVideoRequest {
  file: File;
  fileName: string;
  onProgress?: (progress: VideoProcessProgress) => void;
}

interface ProcessImageRequest {
  file: File;
  fileName: string;
  onProgress?: (progress: VideoProcessProgress) => void;
}

export interface ProcessVideoResponse {
  file: File;
  fileName: string;
}

export interface ProcessImageResponse {
  file: File;
  fileName: string;
}

const INPUT_FILE_NAME = 'input_video';
const PROBE_FILE_NAME = 'probe_video';
const IMAGE_INPUT_FILE_NAME = 'input_image';
const OUTPUT_FILE_NAME = 'output.mp4';
const PALETTE_FILE_NAME = 'palette.png';
const PNG8_OUTPUT_FILE_NAME = 'output.png';
const FFMPEG_LOAD_TIMEOUT_MS = 30000;
const FFMPEG_PROBE_TIMEOUT_SECONDS = 30;
const FFMPEG_IFRAME_EXEC_TIMEOUT_MS = 120000;
const FFMPEG_IFRAME_IDLE_TIMEOUT_MS = 30000;

let ffmpegPromise: Promise<FFmpeg> | null = null;
let ffmpegCoreBlobUrlsPromise: Promise<{
  classWorkerURL: string;
  coreURL: string;
  wasmURL: string;
}> | null = null;

function getOutputFileName(inputFileName: string) {
  const dotIndex = inputFileName.lastIndexOf('.');
  if (dotIndex <= 0) return `${inputFileName || 'video'}_iframe.mp4`;
  return `${inputFileName.slice(0, dotIndex)}_iframe.mp4`;
}

function getPng8OutputFileName(inputFileName: string) {
  const dotIndex = inputFileName.lastIndexOf('.');
  if (dotIndex <= 0) return `${inputFileName || 'image'}_png8.png`;
  return `${inputFileName.slice(0, dotIndex)}_png8.png`;
}

function normalizeInputFileName(fileName: string, prefix = INPUT_FILE_NAME) {
  const extension = fileName.match(/(\.[a-zA-Z0-9]+)$/)?.[1]?.toLowerCase() ?? '.mp4';
  return `${prefix}${extension}`;
}

function normalizeImageInputFileName(fileName: string) {
  const extension = fileName.match(/(\.[a-zA-Z0-9]+)$/)?.[1]?.toLowerCase() ?? '.jpg';
  return `${IMAGE_INPUT_FILE_NAME}${extension}`;
}

function getFfmpegErrorHint(args: string[], logs: string[]) {
  const joinedLogs = logs.join('\n');
  if (/Unknown encoder 'libx264'|Encoder .*libx264.*not found/i.test(joinedLogs)) {
    return '当前 ffmpeg.wasm core 不包含 libx264，无法重新编码并插入 I 帧。';
  }
  if (/SharedArrayBuffer|cross-origin isolated/i.test(joinedLogs)) {
    return 'ffmpeg.wasm 运行环境缺少跨源隔离配置。';
  }
  const logTail = logs.slice(-40).join('\n');
  return [
    `ffmpeg 执行失败：ffmpeg ${args.join(' ')}`,
    logTail ? `最近日志：\n${logTail}` : '最近日志为空',
  ].join('\n');
}

function timeoutAfter(ms: number, message: string) {
  return new Promise<never>((_, reject) => {
    window.setTimeout(() => reject(new Error(message)), ms);
  });
}

function createFfmpegExitError(args: string[], logs: string[], exitCode: number) {
  return new Error(`ffmpeg 退出码 ${exitCode}\n${getFfmpegErrorHint(args, logs)}`);
}

function resolveBrowserUrl(url: string) {
  return new URL(url, window.location.href).href;
}

function findLastJsonObject(logs: string[]) {
  const text = logs.join('\n');
  const end = text.lastIndexOf('}');
  if (end < 0) return null;
  for (
    let start = text.lastIndexOf('{', end);
    start >= 0;
    start = text.lastIndexOf('{', start - 1)
  ) {
    const candidate = text.slice(start, end + 1);
    try {
      return JSON.parse(candidate) as unknown;
    } catch {
      // Try an earlier opening brace; ffprobe JSON contains nested objects.
    }
  }
  return null;
}

function isValidFfprobeOutput(value: unknown) {
  if (!value || typeof value !== 'object') return false;
  const output = value as {
    streams?: Array<{ codec_type?: string; width?: number; height?: number }>;
    format?: { duration?: string };
  };
  const hasVideoStream = output.streams?.some(
    (stream) =>
      stream.codec_type === 'video' && Number(stream.width) > 0 && Number(stream.height) > 0,
  );
  const duration = Number(output.format?.duration);
  return Boolean(hasVideoStream && Number.isFinite(duration) && duration > 0);
}

function parseFfprobeNumber(value: unknown) {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) && numberValue > 0 ? numberValue : null;
}

function parseFfprobeInteger(value: unknown) {
  const numberValue = Number(value);
  return Number.isInteger(numberValue) && numberValue > 0 ? numberValue : null;
}

function parseFrameRate(value: unknown) {
  if (typeof value !== 'string' || value === '0/0') return null;
  const [numeratorText, denominatorText] = value.split('/');
  const numerator = Number(numeratorText);
  const denominator = Number(denominatorText ?? 1);
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator <= 0) {
    return null;
  }
  const frameRate = numerator / denominator;
  return frameRate > 0 ? frameRate : null;
}

function parseVideoResourceInfo(value: unknown): VideoResourceInfo | null {
  if (!value || typeof value !== 'object') return null;
  const output = value as {
    streams?: Array<{
      codec_type?: string;
      avg_frame_rate?: string;
      r_frame_rate?: string;
      nb_frames?: string;
      nb_read_frames?: string;
      duration?: string;
    }>;
    format?: { duration?: string };
    frames?: Array<{ pict_type?: string }>;
  };
  const stream = output.streams?.find((item) => item.codec_type === 'video');
  if (!stream) return null;

  const durationSeconds =
    parseFfprobeNumber(output.format?.duration) ?? parseFfprobeNumber(stream.duration);
  const frameRate = parseFrameRate(stream.avg_frame_rate) ?? parseFrameRate(stream.r_frame_rate);
  const countedFrames =
    parseFfprobeInteger(stream.nb_read_frames) ?? parseFfprobeInteger(stream.nb_frames);
  const estimatedFrames =
    countedFrames === null && durationSeconds !== null && frameRate !== null
      ? Math.max(1, Math.round(durationSeconds * frameRate))
      : null;

  const frames = Array.isArray(output.frames) ? output.frames : [];
  const bFrameCount = frames.filter((frame) => frame?.pict_type === 'B').length;

  return {
    durationSeconds,
    frameRate,
    totalFrames: countedFrames ?? (frames.length > 0 ? frames.length : estimatedFrames),
    totalFramesEstimated: countedFrames === null && frames.length === 0 && estimatedFrames !== null,
    hasBFrames: bFrameCount > 0,
    bFrameCount,
  };
}

async function getFfmpegCoreBlobUrls(onProgress?: (progress: VideoProcessProgress) => void) {
  if (!ffmpegCoreBlobUrlsPromise) {
    ffmpegCoreBlobUrlsPromise = (async () => {
      onProgress?.({
        stage: 'loading',
        message: '正在下载 ffmpeg worker 脚本',
        progress: 0.02,
      });
      const classWorkerURL = await toBlobURL(
        ffmpegWorkerUrl,
        'text/javascript',
        true,
        ({ received, total }) => {
          if (!total) return;
          onProgress?.({
            stage: 'loading',
            message: `正在下载 ffmpeg worker 脚本 ${Math.round((received / total) * 100)}%`,
            progress: Math.min(0.04, 0.02 + (received / total) * 0.02),
          });
        },
      );

      onProgress?.({
        stage: 'loading',
        message: '正在下载 ffmpeg core 脚本',
        progress: 0.04,
      });
      const coreURL = await toBlobURL(
        ffmpegCoreUrl,
        'text/javascript',
        true,
        ({ received, total }) => {
          if (!total) return;
          onProgress?.({
            stage: 'loading',
            message: `正在下载 ffmpeg core 脚本 ${Math.round((received / total) * 100)}%`,
            progress: Math.min(0.06, 0.04 + (received / total) * 0.02),
          });
        },
      );

      onProgress?.({
        stage: 'loading',
        message: 'ffmpeg core 脚本已就绪，wasm 将由 worker 同源加载',
        progress: 0.07,
      });

      return { classWorkerURL, coreURL, wasmURL: resolveBrowserUrl(ffmpegCoreWasmUrl) };
    })().catch((error) => {
      ffmpegCoreBlobUrlsPromise = null;
      throw error;
    });
  }
  return ffmpegCoreBlobUrlsPromise;
}

async function getFfmpeg(onProgress?: (progress: VideoProcessProgress) => void) {
  if (!ffmpegPromise) {
    ffmpegPromise = (async () => {
      const ffmpeg = new FFmpeg();
      const { classWorkerURL, coreURL, wasmURL } = await getFfmpegCoreBlobUrls(onProgress);
      onProgress?.({
        stage: 'loading',
        message: '正在初始化 ffmpeg.wasm worker，并加载 32MB wasm',
        progress: 0.08,
      });
      await Promise.race([
        ffmpeg.load({
          classWorkerURL,
          coreURL,
          wasmURL,
        }),
        timeoutAfter(
          FFMPEG_LOAD_TIMEOUT_MS,
          'ffmpeg.wasm 初始化超时，请检查浏览器控制台、worker 初始化错误和 core wasm 资源是否可访问',
        ),
      ]).catch((error) => {
        ffmpeg.terminate();
        throw error;
      });
      onProgress?.({
        stage: 'loading',
        message: 'ffmpeg.wasm core 已加载',
        progress: 0.08,
      });
      return ffmpeg;
    })().catch((error) => {
      ffmpegPromise = null;
      throw error;
    });
  }
  return ffmpegPromise;
}

function createArgs(
  inputFileName: string,
  options: VideoProcessOptions,
  videoInfo?: VideoResourceInfo | null,
) {
  const args = [
    '-loglevel',
    'verbose',
    '-i',
    inputFileName,
    '-map',
    '0:v:0',
    '-c:v',
    'libx264',
    '-preset',
    'ultrafast',
    '-crf',
    '20',
  ];

  const iframeMode = options.iframeMode ?? 'frames';
  if (iframeMode === 'seconds') {
    const seconds = Math.max(0.01, options.iframeIntervalSeconds ?? 1);
    args.push(
      '-g',
      '9999',
      '-sc_threshold',
      '0',
      '-force_key_frames',
      `expr:gte(t,n_forced*${seconds})`,
    );
  } else if (iframeMode === 'frameNumbers') {
    const frameNumbers = normalizeKeyframeFrames(options.iframeFrameNumbers);
    if (frameNumbers.length === 0) {
      throw new Error('请至少输入一个 I 帧帧号。');
    }
    const frameRate = videoInfo?.frameRate;
    if (!frameRate) {
      throw new Error('无法读取视频帧率，不能按指定帧插入 I 帧。');
    }
    const maxFrame = videoInfo.totalFrames !== null ? videoInfo.totalFrames - 1 : null;
    const invalidFrame = maxFrame !== null ? frameNumbers.find((frame) => frame > maxFrame) : null;
    if (invalidFrame !== null && invalidFrame !== undefined) {
      throw new Error(`指定帧 ${invalidFrame} 超出视频总帧数 ${videoInfo.totalFrames}。`);
    }
    const timestamps = frameNumbers.map((frame) =>
      Number((frame / frameRate).toFixed(6)).toString(),
    );
    args.push('-g', '9999', '-sc_threshold', '0', '-force_key_frames', timestamps.join(','));
  } else {
    const interval = Math.max(1, Math.round(options.iframeIntervalFrames ?? 30));
    args.push('-g', String(interval), '-keyint_min', String(interval), '-sc_threshold', '0');
  }

  if (options.noBFrames) {
    args.push('-bf', '0');
  }

  args.push('-pix_fmt', 'yuv420p', '-an', OUTPUT_FILE_NAME);

  return args;
}

function normalizeKeyframeFrames(rawValue?: string) {
  return Array.from(
    new Set(
      (rawValue ?? '')
        .split(/[\s,，;；]+/)
        .map((item) => Number(item.trim()))
        .filter((value) => Number.isInteger(value) && value >= 0),
    ),
  ).sort((a, b) => a - b);
}

async function readFfprobeJson(ffmpeg: FFmpeg, args: string[], logs: string[]) {
  const logStartIndex = logs.length;
  let exitCode: number;
  try {
    exitCode = await Promise.race([
      ffmpeg.ffprobe(args, FFMPEG_PROBE_TIMEOUT_SECONDS),
      timeoutAfter(FFMPEG_PROBE_TIMEOUT_SECONDS * 1000, 'ffprobe 读取视频信息超时。'),
    ]);
  } catch (error) {
    if (error instanceof Error && error.message.includes('ffprobe 读取视频信息超时')) {
      ffmpeg.terminate();
      ffmpegPromise = null;
    }
    throw error;
  }
  return {
    exitCode,
    output: findLastJsonObject(logs.slice(logStartIndex)),
  };
}

async function probeVideoInfoFromFile(ffmpeg: FFmpeg, inputFileName: string, logs: string[]) {
  const args = [
    '-v',
    'error',
    '-select_streams',
    'v:0',
    '-show_frames',
    '-show_entries',
    'format=duration:stream=codec_type,avg_frame_rate,r_frame_rate,nb_frames,duration:frame=pict_type',
    '-of',
    'json',
    inputFileName,
  ];
  const { exitCode, output } = await readFfprobeJson(ffmpeg, args, logs);
  const videoInfo = parseVideoResourceInfo(output);
  if (videoInfo) return videoInfo;
  if (exitCode !== 0) {
    throw createFfmpegExitError(args, logs, exitCode);
  }
  throw new Error('ffprobe 输出缺少有效的视频帧率或帧数信息。');
}

function attachFfmpegLogHandler(ffmpeg: FFmpeg, logs: string[], onLog?: (message: string) => void) {
  const handleLog = ({ message }: { message: string }) => {
    logs.push(message);
    onLog?.(message);
  };
  ffmpeg.on('log', handleLog);
  return () => ffmpeg.off('log', handleLog);
}

function createTranscodeTimeoutError(reason: 'idle' | 'total') {
  return reason === 'idle'
    ? 'ffmpeg 长时间没有输出新日志或进度，已中止本次处理。'
    : 'ffmpeg 处理超过时间限制，已中止本次处理。';
}

function execWithWatchdog(ffmpeg: FFmpeg, args: string[], getLastActivityTime: () => number) {
  const startedAt = Date.now();

  return new Promise<number>((resolve, reject) => {
    let settled = false;
    const settle = (callback: () => void) => {
      if (settled) return;
      settled = true;
      window.clearInterval(watchdogTimer);
      callback();
    };

    const watchdogTimer = window.setInterval(() => {
      const now = Date.now();
      const elapsedMs = now - startedAt;
      const idleMs = now - getLastActivityTime();
      if (
        elapsedMs >= FFMPEG_IFRAME_EXEC_TIMEOUT_MS ||
        (FFMPEG_IFRAME_IDLE_TIMEOUT_MS > 0 && idleMs >= FFMPEG_IFRAME_IDLE_TIMEOUT_MS)
      ) {
        const reason = elapsedMs >= FFMPEG_IFRAME_EXEC_TIMEOUT_MS ? 'total' : 'idle';
        ffmpeg.terminate();
        ffmpegPromise = null;
        settle(() => reject(new Error(createTranscodeTimeoutError(reason))));
        return;
      }
    }, 1000);

    ffmpeg
      .exec(args)
      .then((exitCode) =>
        settle(() => {
          resolve(exitCode);
        }),
      )
      .catch((error) =>
        settle(() => {
          reject(error);
        }),
      );
  });
}

async function validateOutputVideo(ffmpeg: FFmpeg, logs: string[]) {
  const args = [
    '-v',
    'error',
    '-show_entries',
    'format=duration:stream=codec_type,codec_name,width,height',
    '-of',
    'json',
    OUTPUT_FILE_NAME,
  ];
  const { exitCode, output: ffprobeOutput } = await readFfprobeJson(ffmpeg, args, logs);
  if (isValidFfprobeOutput(ffprobeOutput)) {
    return;
  }
  if (exitCode !== 0) {
    throw createFfmpegExitError(args, logs, exitCode);
  }
  throw new Error('ffprobe 输出缺少有效的视频流或 duration，处理后视频可能损坏。');
}

export async function probeVideoResource(request: ProbeVideoRequest): Promise<VideoResourceInfo> {
  const ffmpeg = await getFfmpeg(request.onProgress);
  const inputFileName = normalizeInputFileName(request.fileName, PROBE_FILE_NAME);
  const logs: string[] = [];
  const detachLogHandler = attachFfmpegLogHandler(ffmpeg, logs);

  try {
    request.onProgress?.({
      stage: 'writing',
      message: '正在读取视频帧数信息',
      progress: 0.1,
    });
    const inputData = await fetchFile(request.file);
    await ffmpeg.writeFile(inputFileName, inputData);
    request.onProgress?.({
      stage: 'reading',
      message: '正在解析视频帧率和总帧数',
      progress: 0.5,
    });
    const videoInfo = await probeVideoInfoFromFile(ffmpeg, inputFileName, logs);
    request.onProgress?.({
      stage: 'reading',
      message: '视频帧数信息读取完成',
      progress: 1,
    });
    return videoInfo;
  } finally {
    detachLogHandler();
    await Promise.allSettled([ffmpeg.deleteFile(inputFileName)]);
  }
}

export async function processVideoResource(
  request: ProcessVideoRequest,
): Promise<ProcessVideoResponse> {
  const ffmpeg = await getFfmpeg(request.onProgress);
  const inputFileName = normalizeInputFileName(request.fileName);
  let args = ['-i', inputFileName, OUTPUT_FILE_NAME];
  const logs: string[] = [];
  let lastActivityTime = Date.now();
  const handleLog = ({ message }: { message: string }) => {
    lastActivityTime = Date.now();
    logs.push(message);
    request.onProgress?.({
      stage: 'transcoding',
      message: 'ffmpeg 正在重新编码视频',
      log: message,
    });
  };
  const handleProgress = ({ progress }: { progress: number }) => {
    if (!Number.isFinite(progress)) return;
    lastActivityTime = Date.now();
    request.onProgress?.({
      stage: 'transcoding',
      message: `ffmpeg 正在重新编码视频 ${Math.round(Math.max(0, Math.min(1, progress)) * 100)}%`,
      progress: Math.max(0.1, Math.min(0.95, progress)),
    });
  };

  ffmpeg.on('log', handleLog);
  ffmpeg.on('progress', handleProgress);
  try {
    request.onProgress?.({
      stage: 'writing',
      message: '正在写入输入视频到 ffmpeg 虚拟文件系统',
      progress: 0.09,
    });
    const inputData = await fetchFile(request.file);
    await ffmpeg.writeFile(inputFileName, inputData);
    const videoInfo =
      request.options.iframeMode === 'frameNumbers'
        ? await probeVideoInfoFromFile(ffmpeg, inputFileName, logs)
        : null;
    args = createArgs(inputFileName, request.options, videoInfo);
    request.onProgress?.({
      stage: 'transcoding',
      message: '正在本地重新编码并插入 I 帧',
      progress: 0.1,
    });
    lastActivityTime = Date.now();
    const exitCode = await execWithWatchdog(ffmpeg, args, () => lastActivityTime);
    if (exitCode !== 0) {
      throw createFfmpegExitError(args, logs, exitCode);
    }

    request.onProgress?.({
      stage: 'reading',
      message: '正在校验处理后视频',
      progress: 0.96,
    });
    await validateOutputVideo(ffmpeg, logs);
    request.onProgress?.({
      stage: 'reading',
      message: '正在读取处理后视频',
      progress: 0.98,
    });
    const data = await ffmpeg.readFile(OUTPUT_FILE_NAME);
    if (typeof data === 'string') {
      throw new Error('ffmpeg 输出不是二进制视频文件');
    }

    const fileName = getOutputFileName(request.fileName);
    const bytes = new Uint8Array(data.byteLength);
    bytes.set(data);
    request.onProgress?.({
      stage: 'reading',
      message: '视频处理完成',
      progress: 1,
    });
    return {
      file: new File([bytes.buffer], fileName, { type: 'video/mp4' }),
      fileName,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(message || getFfmpegErrorHint(args, logs));
  } finally {
    ffmpeg.off('log', handleLog);
    ffmpeg.off('progress', handleProgress);
    await Promise.allSettled([
      ffmpeg.deleteFile(inputFileName),
      ffmpeg.deleteFile(OUTPUT_FILE_NAME),
    ]);
  }
}

export async function processImageToPng8Resource(
  request: ProcessImageRequest,
): Promise<ProcessImageResponse> {
  const ffmpeg = await getFfmpeg(request.onProgress);
  const inputFileName = normalizeImageInputFileName(request.fileName);
  const logs: string[] = [];
  const detachLogHandler = attachFfmpegLogHandler(ffmpeg, logs, (message) => {
    request.onProgress?.({
      stage: 'transcoding',
      message: 'ffmpeg 正在转换 PNG8 图片',
      log: message,
    });
  });

  const paletteArgs = [
    '-y',
    '-i',
    inputFileName,
    '-vf',
    'format=rgba,palettegen=reserve_transparent=0',
    PALETTE_FILE_NAME,
  ];
  const outputArgs = [
    '-y',
    '-i',
    inputFileName,
    '-i',
    PALETTE_FILE_NAME,
    '-lavfi',
    'paletteuse=dither=bayer:bayer_scale=3',
    '-frames:v',
    '1',
    PNG8_OUTPUT_FILE_NAME,
  ];

  try {
    request.onProgress?.({
      stage: 'writing',
      message: '正在写入输入图片到 ffmpeg 虚拟文件系统',
      progress: 0.1,
    });
    const inputData = await fetchFile(request.file);
    await ffmpeg.writeFile(inputFileName, inputData);

    request.onProgress?.({
      stage: 'transcoding',
      message: '正在生成 PNG8 调色板',
      progress: 0.35,
    });
    const paletteExitCode = await ffmpeg.exec(paletteArgs);
    if (paletteExitCode !== 0) {
      throw createFfmpegExitError(paletteArgs, logs, paletteExitCode);
    }

    request.onProgress?.({
      stage: 'transcoding',
      message: '正在输出 PNG8 图片',
      progress: 0.7,
    });
    const outputExitCode = await ffmpeg.exec(outputArgs);
    if (outputExitCode !== 0) {
      throw createFfmpegExitError(outputArgs, logs, outputExitCode);
    }

    request.onProgress?.({
      stage: 'reading',
      message: '正在读取 PNG8 图片',
      progress: 0.95,
    });
    const data = await ffmpeg.readFile(PNG8_OUTPUT_FILE_NAME);
    if (typeof data === 'string') {
      throw new Error('ffmpeg 输出不是二进制图片文件');
    }

    const bytes = new Uint8Array(data.byteLength);
    bytes.set(data);
    request.onProgress?.({
      stage: 'reading',
      message: '图片转换完成',
      progress: 1,
    });
    const fileName = getPng8OutputFileName(request.fileName);
    return {
      file: new File([bytes.buffer], fileName, { type: 'image/png' }),
      fileName,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(message || getFfmpegErrorHint(outputArgs, logs));
  } finally {
    detachLogHandler();
    await Promise.allSettled([
      ffmpeg.deleteFile(inputFileName),
      ffmpeg.deleteFile(PALETTE_FILE_NAME),
      ffmpeg.deleteFile(PNG8_OUTPUT_FILE_NAME),
    ]);
  }
}

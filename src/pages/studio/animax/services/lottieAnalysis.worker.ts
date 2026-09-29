import {
  analyzeLottieJsonText,
  inspectLottieJsonText,
  normalizeLottieAnalysisWorkerRequest,
  type LottieAnalysisWorkerRequest,
  type LottieAnalysisWorkerResponse,
} from './lottieAnalysis';

type LottieAnalysisWorkerScope = {
  onmessage: ((event: MessageEvent<LottieAnalysisWorkerRequest>) => void) | null;
  postMessage: (message: LottieAnalysisWorkerResponse) => void;
};

const ctx = self as unknown as LottieAnalysisWorkerScope;

ctx.onmessage = (event: MessageEvent<LottieAnalysisWorkerRequest>) => {
  const { requestId, mode, jsonText } = normalizeLottieAnalysisWorkerRequest(event.data);

  try {
    if (mode === 'inspect') {
      const response: LottieAnalysisWorkerResponse = {
        requestId,
        mode,
        ok: true,
        result: inspectLottieJsonText(jsonText),
      };
      ctx.postMessage(response);
      return;
    }

    const response: LottieAnalysisWorkerResponse = {
      requestId,
      mode,
      ok: true,
      result: analyzeLottieJsonText(jsonText),
    };
    ctx.postMessage(response);
  } catch (error) {
    const response: LottieAnalysisWorkerResponse = {
      requestId,
      mode,
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
    ctx.postMessage(response);
  }
};

export {};

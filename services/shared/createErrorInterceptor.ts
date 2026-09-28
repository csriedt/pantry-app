import { ResponseMiddleware } from "@/types/service/httpClientConfig";
import { formatGenericError } from "@/lib/service/formatGenericError";
import { FetchHttpError } from "./fetchHttpError";

/**
 * Best-effort body parser for error responses. JSON is preferred; falls back
 * to text. Failures (truncated body, invalid JSON) return `undefined` rather
 * than throwing — we never want the error path itself to throw.
 *
 * The response is cloned so that other middleware (or callers, in non-error
 * paths) can still read the body.
 */
const safeParseErrorBody = async (res: Response): Promise<unknown> => {
  const contentType = res.headers.get("content-type") ?? "";
  try {
    if (contentType.includes("application/json")) {
      return await res.clone().json();
    }
    return await res.clone().text();
  } catch {
    return undefined;
  }
};

/**
 * Creates the response middleware that turns `!res.ok` into a thrown,
 * fully-normalised error.
 *
 * The factory always appends this as the last entry of the response chain
 * (after consumer middleware), so other middleware can pre-process the
 * response before we convert it into an error.
 *
 * The thrown value is a {@link NormalizedError} from `formatGenericError`,
 * not the raw {@link FetchHttpError}. Per-call `errorConfig` is read from
 * the per-request context; the factory has already merged client defaults
 * into that field.
 */
export const createErrorFormattingInterceptor = (): ResponseMiddleware => {
  return async (res, req, ctx) => {
    if (res.ok) return res;

    const body = await safeParseErrorBody(res);
    const fetchError = new FetchHttpError({
      status: res.status,
      url: req.url,
      method: req.method,
      body,
    });

    throw formatGenericError(fetchError, ctx.errorConfig);
  };
};

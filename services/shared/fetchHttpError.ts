/**
 * Error class raised by the fetch-based transport when a response has a
 * non-2xx status. Carries the minimal HTTP context the formatter needs
 * (`status`, `url`, `method`, optional parsed `body`) without leaking any
 * upstream-controlled fields by default.
 *
 * The presence of this class is the discriminator
 * {@link formatGenericError} uses to derive `code`/`statusCode` from a
 * fetch error in {@link inferCodeAndStatus}.
 */
export class FetchHttpError extends Error {
  status: number;
  url: string;
  method: string;
  body?: unknown;

  constructor(opts: {
    status: number;
    url: string;
    method: string;
    body?: unknown;
  }) {
    super(`HTTP ${opts.status} ${opts.method} ${opts.url}`);
    this.name = "FetchHttpError";
    this.status = opts.status;
    this.url = opts.url;
    this.method = opts.method;
    this.body = opts.body;
  }
}

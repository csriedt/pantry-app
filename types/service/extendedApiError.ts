import { GenericError } from "./genericError";

/**
 * Custom error class to represent API errors with additional information.
 * Extends the built-in `Error` class to include extra properties such as
 * status code, timestamp, path, and validation errors in fields.
 */
export class ExtendedApiError extends Error {
  fields: { field: string; message: string }[];
  statusCode: number;
  timestamp: string;
  path: string;
  genericError?: GenericError;

  /**
   * Constructs a new `ExtendedApiError` instance.
   *
   * @param fields - Array of objects containing field-specific error information.
   * @param path - API endpoint path where the error occurred.
   * @param message - The error message.
   * @param statusCode - HTTP status code associated with the error.
   * @param timestamp - Timestamp indicating when the error occurred.
   * @param genericError - Optional GenericError from server actions.
   */
  constructor({
    fields,
    path,
    message,
    statusCode,
    timestamp,
    genericError,
  }: {
    path: string;
    statusCode: number;
    timestamp: string;
    message: string;
    fields: { field: string; message: string }[];
    genericError?: GenericError;
  }) {
    super(message); // Call the parent class constructor (Error)
    this.fields = fields;
    this.statusCode = statusCode;
    this.timestamp = timestamp;
    this.path = path;
    this.genericError = genericError;
  }

  /**
   * Helper factory method to create an ExtendedApiError from a GenericError
   */
  static fromGenericError(genericError: GenericError): ExtendedApiError {
    let message = "An error occurred";
    let statusCode = 500;
    let path = "unknown";

    // Extract information from genericError
    if (typeof genericError === "string") {
      message = genericError;
    } else if (typeof genericError === "object" && genericError !== null) {
      // Try to extract message
      if (
        "message" in genericError &&
        typeof genericError.message === "string"
      ) {
        message = genericError.message;
      } else {
        message = JSON.stringify(genericError);
      }

      // Try to extract status code
      if (
        "statusCode" in genericError &&
        typeof genericError.statusCode === "number"
      ) {
        statusCode = genericError.statusCode;
      } else if (
        "status" in genericError &&
        typeof genericError.status === "number"
      ) {
        statusCode = genericError.status;
      }

      // Try to extract path/url
      if ("path" in genericError && typeof genericError.path === "string") {
        path = genericError.path;
      } else if (
        "url" in genericError &&
        typeof genericError.url === "string"
      ) {
        path = genericError.url;
      }
    }

    return new ExtendedApiError({
      fields: [],
      path,
      message,
      statusCode,
      timestamp: new Date().toISOString(),
      genericError,
    });
  }
}

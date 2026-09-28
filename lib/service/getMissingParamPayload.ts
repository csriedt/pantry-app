import { GenericPayload } from "@/types/service/genericPayload";

/**
 * Helper to return a missing param variable error payload
 * @param param - The name of the missing parameter
 * @param statusCode - The HTTP status code (defaults to 400 Bad Request)
 * @returns {GenericPayload<T>} Error payload indicating missing parameter
 */
export const getMissingParamPayload = <T>(
  param?: string,
  statusCode: number = 400
): GenericPayload<T> => {
  return {
    error: {
      message: param ? `Missing parameter: ${param}` : "Missing parameter",
      code: "missing_param",
      statusCode,
    },
  };
};

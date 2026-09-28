import { describe, expect, it } from "vitest";

import { formatGenericError } from "@/lib/service/formatGenericError";

describe("test infrastructure smoke", () => {
  it("imports the service layer through the @ alias", () => {
    const result = formatGenericError(new Error("boom"), {
      defaultMessage: "Safe message.",
    });
    expect(result).toMatchObject({
      message: "Safe message.",
      code: "unknown",
    });
  });
});

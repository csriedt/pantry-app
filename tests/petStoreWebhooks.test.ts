import { cacheTag, revalidateTag } from "next/cache";
import { after } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import { petStoreFindByStatusAction } from "@/actions/petStore/petStoreFindByStatusAction";
import { petStoreFindByStatusCachedAction } from "@/actions/petStore/petStoreFindByStatusCachedAction";
import { POST as petStoreWebhook } from "@/app/api/webhooks/petStore/route";
import { POST as petStoreWarmWebhook } from "@/app/api/webhooks/petStore/warm/route";
import {
  PET_STORE_TAGS,
  petStoreStatusTag,
} from "@/types/petStore/petStoreCacheTags";

import type { NextRequest } from "next/server";

// The routes touch Next's request/cache machinery, which isn't available in
// a plain Vitest process. Mock the directives at the module boundary and
// keep the route logic itself under test.
vi.mock("next/cache", () => ({
  cacheLife: vi.fn(),
  cacheTag: vi.fn(),
  revalidateTag: vi.fn(),
}));

vi.mock("next/server", () => ({
  after: vi.fn(),
}));

vi.mock("@/actions/petStore/petStoreFindByStatusCachedAction", () => ({
  petStoreFindByStatusCachedAction: vi.fn(),
}));

vi.mock("@/actions/petStore/petStoreFindByStatusAction", () => ({
  petStoreFindByStatusAction: vi.fn(),
}));

const callRoute = (
  handler: (req: NextRequest) => Promise<Response>,
  body: unknown,
  raw = false
): Promise<Response> => {
  const request = new Request("http://localhost/api/webhooks/petStore", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: raw ? (body as string) : JSON.stringify(body),
  }) as unknown as NextRequest;
  return handler(request);
};

const routes = [
  { label: "standard", handler: petStoreWebhook },
  { label: "warm", handler: petStoreWarmWebhook },
] as const;

afterEach(() => {
  vi.useRealTimers();
});

describe("pet store cache tag builders", () => {
  it("pins the exact server-cache strings", () => {
    expect(PET_STORE_TAGS.family).toBe("pets-by-status");
    expect(petStoreStatusTag("available")).toBe("pets-by-status-available");
    expect(petStoreStatusTag("sold")).toBe("pets-by-status-sold");
  });
});

describe.each(routes)("$label webhook validation", ({ handler }) => {
  it("rejects malformed JSON with 400 and does not invalidate", async () => {
    const response = await callRoute(handler, "{not json", true);
    expect(response.status).toBe(400);
    expect(revalidateTag).not.toHaveBeenCalled();
  });

  it("rejects a missing status with 400 and does not invalidate", async () => {
    const response = await callRoute(handler, {});
    expect(response.status).toBe(400);
    expect(revalidateTag).not.toHaveBeenCalled();
  });

  it("rejects an unknown status with 400", async () => {
    const response = await callRoute(handler, { status: "bogus" });
    expect(response.status).toBe(400);
    expect(revalidateTag).not.toHaveBeenCalled();
  });
});

describe("standard webhook", () => {
  it("invalidates the status tag with max, returns 200, and does not schedule work", async () => {
    const response = await callRoute(petStoreWebhook, { status: "available" });

    expect(response.status).toBe(200);
    expect(revalidateTag).toHaveBeenCalledTimes(1);
    expect(revalidateTag).toHaveBeenCalledWith(
      "pets-by-status-available",
      "max"
    );
    expect(after).not.toHaveBeenCalled();
  });
});

describe("warm webhook", () => {
  it("invalidates the status tag and schedules a warm callback", async () => {
    const response = await callRoute(petStoreWarmWebhook, {
      status: "pending",
    });

    expect(response.status).toBe(200);
    expect(revalidateTag).toHaveBeenCalledWith(
      "pets-by-status-pending",
      "max"
    );
    expect(after).toHaveBeenCalledTimes(1);
  });

  it("waits, then performs exactly one warm read", async () => {
    vi.useFakeTimers();
    vi.mocked(petStoreFindByStatusCachedAction).mockResolvedValue({ data: [] });

    await callRoute(petStoreWarmWebhook, { status: "pending" });

    const warm = vi.mocked(after).mock.calls[0]?.[0] as () => Promise<void>;
    expect(warm).toBeTypeOf("function");

    const pending = warm();
    expect(petStoreFindByStatusCachedAction).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(300);
    await pending;

    expect(petStoreFindByStatusCachedAction).toHaveBeenCalledTimes(1);
    expect(petStoreFindByStatusCachedAction).toHaveBeenCalledWith({
      params: "pending",
    });
  });

  it("swallows a failed warm read instead of surfacing an unhandled rejection", async () => {
    vi.useFakeTimers();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.mocked(petStoreFindByStatusCachedAction).mockRejectedValue(
      new Error("upstream down")
    );

    await callRoute(petStoreWarmWebhook, { status: "pending" });

    const warm = vi.mocked(after).mock.calls[0]?.[0] as () => Promise<void>;
    const pending = warm();
    await vi.advanceTimersByTimeAsync(300);

    await expect(pending).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});

describe("tag alignment", () => {
  it("the cached action carries exactly the tag the webhooks invalidate", async () => {
    // The webhook tests mock this module; import the real one so the actual
    // cacheTag calls are observable.
    const actual = await vi.importActual<
      typeof import("@/actions/petStore/petStoreFindByStatusCachedAction")
    >("@/actions/petStore/petStoreFindByStatusCachedAction");

    vi.mocked(petStoreFindByStatusAction).mockResolvedValue({ data: [] });

    await actual.petStoreFindByStatusCachedAction({ params: "available" });

    expect(cacheTag).toHaveBeenCalledWith(
      PET_STORE_TAGS.family,
      petStoreStatusTag("available")
    );
  });
});

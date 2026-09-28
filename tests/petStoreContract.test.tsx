// @vitest-environment jsdom
import { act } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { createPetAction } from "@/actions/petStore/createPet";
import { forceFailAction } from "@/actions/petStore/forceFailAction";
import { petStoreFindByStatusAction } from "@/actions/petStore/petStoreFindByStatusAction";
import { useCreatePet } from "@/hooks/petStore/useCreatePet";
import { useForceFail } from "@/hooks/petStore/useForceFail";
import { usePetStoreFindByStatus } from "@/hooks/petStore/usePetStoreFindByStatus";
import {
  findByStatusKey,
  findByStatusRoot,
} from "@/hooks/petStore/petStoreQueryKeys";
import type { CreatePetRequest } from "@/types/petStore/createPetRequest";
import type { PetFindByStatusResponse } from "@/types/petStore/petStoreFindByStatusResponse";
import { ExtendedApiError } from "@/types/service/errors";

import { flushAsync, renderHookWithClient } from "./helpers/queryClient";

// The real action modules import client factories that throw at module load
// when NEXT_PUBLIC_PET_STORE_BASE_URL is absent; the FE-facing contract tests
// only care about the tuple / payload / invalidation surface.
vi.mock("@/actions/petStore/petStoreFindByStatusAction", () => ({
  petStoreFindByStatusAction: vi.fn(),
}));
vi.mock("@/actions/petStore/createPet", () => ({
  createPetAction: vi.fn(),
}));
vi.mock("@/actions/petStore/forceFailAction", () => ({
  forceFailAction: vi.fn(),
}));

const makePet = (
  overrides: Partial<PetFindByStatusResponse> = {}
): PetFindByStatusResponse => ({
  id: 1,
  name: "Rex",
  category: { id: 1, name: "Dogs" },
  photoUrls: ["https://example.com/rex.png"],
  tags: [{ id: 1, name: "friendly" }],
  status: "available",
  ...overrides,
});

const createRequest: CreatePetRequest = {
  name: "Fluffy",
  photoUrls: ["https://example.com/fluffy.png"],
  status: "available",
};

/**
 * Pet store contract suite — the FE-facing spec for the service-flow layer.
 * These tests mock the server actions and exercise only the public hook
 * surface (tuple shape, dispatched data, query keys, invalidation, error
 * shape). They must survive internal refactors untouched (plan §6.1).
 */
describe("pet store contract", () => {
  describe("petStoreQueryKeys", () => {
    it("builds the documented flat key arrays", () => {
      expect(findByStatusRoot()).toEqual(["find-by-status"]);
      expect(findByStatusKey("pending")).toEqual([
        "find-by-status",
        "pending",
      ]);
      expect(findByStatusKey("sold")).toHaveLength(2);
      expect(
        findByStatusKey("sold").every(part => typeof part === "string")
      ).toBe(true);
    });
  });

  describe("usePetStoreFindByStatus", () => {
    it("returns a [query, action] tuple, dispatches, and resolves unwrapped data under findByStatusKey", async () => {
      const pets = [makePet({ id: 11, name: "Rex" })];
      vi.mocked(petStoreFindByStatusAction).mockResolvedValue({ data: pets });

      const { result, client } = renderHookWithClient(() =>
        usePetStoreFindByStatus()
      );

      expect(Array.isArray(result.current)).toBe(true);
      expect(result.current).toHaveLength(2);
      expect(typeof result.current[1]).toBe("function");

      await act(async () => {
        result.current[1]({ params: "available" });
      });
      await flushAsync();

      expect(petStoreFindByStatusAction).toHaveBeenCalledWith("available");
      expect(result.current[0].data).toEqual({ data: pets });

      const cachedKeys = client
        .getQueryCache()
        .getAll()
        .map(query => query.queryKey);
      expect(cachedKeys).toContainEqual(findByStatusKey("available"));
    });

    it("surfaces a payload error as ExtendedApiError with genericError intact", async () => {
      const payloadError = {
        message: "Upstream petstore unavailable.",
        code: "http_5xx" as const,
        statusCode: 503,
      };
      vi.mocked(petStoreFindByStatusAction).mockResolvedValue({
        error: payloadError,
      });

      const { result } = renderHookWithClient(() => usePetStoreFindByStatus());

      await act(async () => {
        result.current[1]({ params: "pending" });
      });
      await flushAsync();

      expect(result.current[0].error).toBeInstanceOf(ExtendedApiError);
      expect(result.current[0].error?.genericError).toEqual(payloadError);
      expect(result.current[0].error?.statusCode).toBe(503);
    });
  });

  describe("useCreatePet", () => {
    it("invalidates the find-by-status root on success", async () => {
      const createdPet = {
        id: 21,
        name: "Fluffy",
        photoUrls: ["https://example.com/fluffy.png"],
        status: "available" as const,
      };
      vi.mocked(createPetAction).mockResolvedValue({ data: createdPet });

      const { result, client } = renderHookWithClient(() => useCreatePet());
      const invalidateSpy = vi.spyOn(client, "invalidateQueries");
      client.setQueryData(["find-by-status", "available"], {
        data: [makePet()],
      });

      expect(result.current).toHaveLength(3);
      expect(result.current[2]).toBe(false);

      let created: unknown;
      await act(async () => {
        created = await result.current[1](createRequest);
      });

      expect(createPetAction).toHaveBeenCalledWith(createRequest);
      expect(created).toEqual({ data: createdPet });
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: findByStatusRoot(),
      });
      expect(
        client.getQueryState(["find-by-status", "available"])?.isInvalidated
      ).toBe(true);
    });
  });

  describe("useForceFail", () => {
    it("rejects mutateAsync with ExtendedApiError carrying the mocked failure code", async () => {
      const payloadError = {
        message: "Not found.",
        code: "not_found" as const,
        statusCode: 404,
      };
      vi.mocked(forceFailAction).mockResolvedValue({ error: payloadError });

      const { result } = renderHookWithClient(() => useForceFail());

      expect(result.current).toHaveLength(3);

      let caught: unknown;
      await act(async () => {
        caught = await result.current[1]().catch(error => error);
      });

      expect(forceFailAction).toHaveBeenCalledTimes(1);
      expect(caught).toBeInstanceOf(ExtendedApiError);
      const apiError = caught as ExtendedApiError;
      expect(apiError.genericError).toEqual(payloadError);
      expect(apiError.message).toBe(payloadError.message);
      expect(apiError.statusCode).toBe(payloadError.statusCode);
    });

    it("exposes a mutate that does not throw synchronously when the action always fails", async () => {
      const payloadError = {
        message: "Not found.",
        code: "not_found" as const,
        statusCode: 404,
      };
      vi.mocked(forceFailAction).mockResolvedValue({ error: payloadError });

      const { result } = renderHookWithClient(() => useForceFail());

      expect(() => result.current[0]()).not.toThrow();
      await flushAsync();

      expect(result.current[2]).toBe(false);
    });
  });
});

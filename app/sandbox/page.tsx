"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useState } from "react";

import { invalidatePetsByStatusAction } from "@/actions/petStore/invalidatePetsByStatusAction";
import {
  findByStatusCachedRoot,
  findByStatusRoot,
} from "@/hooks/petStore/petStoreQueryKeys";
import { useCreatePet } from "@/hooks/petStore/useCreatePet";
import { useForceFail } from "@/hooks/petStore/useForceFail";
import { usePetStoreFindByStatus } from "@/hooks/petStore/usePetStoreFindByStatus";
import { usePetStoreFindByStatusCached } from "@/hooks/petStore/usePetStoreFindByStatusCached";
import { PetStatus } from "@/types/petStore/petStatus";
import type { NormalizedError } from "@/types/service/errors";

interface LogEntry {
  id: string;
  at: string;
  text: string;
}

const STATUSES: PetStatus[] = ["available", "pending", "sold"];

const buttonClass =
  "rounded-md border border-border bg-card px-3 py-1.5 text-sm hover:bg-muted disabled:opacity-50";

const sectionClass = "rounded-lg border border-border bg-card p-4";

/**
 * Pet store sandbox — the service-flow layer expressed end to end against
 * the real Swagger Petstore API. No mocks: every panel drives real server
 * actions, real React Query state, and (for the cached panel) a real
 * `'use cache'` entry.
 *
 * Six demos:
 *  1. dispatch + query states (uncached)
 *  2. deny-by-default error contract (`forceFail`)
 *  3. mutation + automatic invalidation (`useCreatePet`)
 *  4. cache probe — `cachedAt` frozen on hits, invalidated via `updateTag`
 *  5. observation callbacks — the log fires on background refreshes too
 *  6. doorbell simulation — client-cache invalidation, standing in for the
 *     future Supabase Realtime signal
 */
export default function SandboxPage() {
  const queryClient = useQueryClient();

  const [status, setStatus] = useState<PetStatus>("available");
  const [petName, setPetName] = useState("Fluffy");
  const [failInfo, setFailInfo] = useState<NormalizedError | null>(null);
  const [entries, setEntries] = useState<LogEntry[]>([]);

  const pushLog = useCallback((text: string) => {
    setEntries(prev =>
      [
        {
          id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
          at: new Date().toLocaleTimeString(),
          text,
        },
        ...prev,
      ].slice(0, 60)
    );
  }, []);

  const [uncachedQuery, findPets] = usePetStoreFindByStatus();
  const [cachedQuery, findCachedPets] = usePetStoreFindByStatusCached();
  const [createPet, , isCreating] = useCreatePet();
  const [forceFail, , isFailing] = useForceFail();

  const fetchUncached = () => {
    pushLog(`dispatch uncached [${status}]`);
    findPets({
      params: status,
      callbacks: {
        onSuccess: () => pushLog(`onSuccess uncached [${status}]`),
        onError: error =>
          pushLog(`onError uncached [${status}]: ${error.message}`),
        onSettled: () => pushLog(`onSettled uncached [${status}]`),
      },
    });
  };

  const fetchCached = () => {
    pushLog(`dispatch cached [${status}]`);
    findCachedPets({
      params: status,
      callbacks: {
        onSuccess: () => pushLog(`onSuccess cached [${status}]`),
        onError: error =>
          pushLog(`onError cached [${status}]: ${error.message}`),
        onSettled: () => pushLog(`onSettled cached [${status}]`),
      },
    });
  };

  const invalidateServerCache = async () => {
    await invalidatePetsByStatusAction(status);
    pushLog(`server cache invalidated [pets-by-status-${status}]`);
    // `updateTag` only touches the server cache; the client snapshot is
    // refreshed by dispatching again (or invalidating the RQ key).
    fetchCached();
  };

  const simulateDoorbell = () => {
    pushLog("doorbell: invalidating RQ prefixes");
    void queryClient.invalidateQueries({ queryKey: findByStatusRoot() });
    void queryClient.invalidateQueries({ queryKey: findByStatusCachedRoot() });
  };

  const submitCreate = () => {
    pushLog(`dispatch create [${petName}]`);
    createPet(
      { name: petName, photoUrls: ["https://example.com/pet.png"], status },
      {
        onSuccess: () => pushLog(`onSuccess create [${petName}]`),
        onError: error => pushLog(`onError create: ${error.message}`),
        onSettled: () => pushLog(`onSettled create [${petName}]`),
      }
    );
  };

  const runForceFail = () => {
    pushLog("dispatch forceFail");
    forceFail(undefined, {
      onError: error => {
        const generic = error.genericError;
        setFailInfo(
          generic && typeof generic === "object"
            ? generic
            : { message: error.message, code: "unknown" }
        );
        pushLog(`onError forceFail: ${error.message}`);
      },
    });
  };

  const uncachedPets = uncachedQuery.data?.data ?? [];
  const cachedPets = cachedQuery.data?.data ?? [];

  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-6 p-6">
      <header>
        <h1 className="text-2xl font-semibold">Service-flow sandbox</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Real server actions, real React Query, real server cache. Status:{" "}
          <select
            value={status}
            onChange={event => setStatus(event.target.value as PetStatus)}
            className="rounded border border-border bg-background px-1"
          >
            {STATUSES.map(value => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </p>
      </header>

      <div className="grid gap-4 md:grid-cols-2">
        {/* 1. Dispatch + states */}
        <section className={sectionClass}>
          <h2 className="font-medium">1. Query dispatch (uncached)</h2>
          <div className="mt-3 flex gap-2">
            <button className={buttonClass} onClick={fetchUncached}>
              Fetch {status}
            </button>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            isLoading: {String(uncachedQuery.isLoading)} · isFetching:{" "}
            {String(uncachedQuery.isFetching)} · items: {uncachedPets.length}
          </p>
          <ul className="mt-2 max-h-40 overflow-auto text-sm">
            {uncachedPets.map((pet, index) => (
              // Petstore ids can exceed Number.MAX_SAFE_INTEGER, so two
              // distinct ids can stringify identically after JSON parsing.
              // The index keeps the key unique for this display-only list.
              <li key={`${pet.id}:${index}`}>
                #{pet.id} {pet.name} ({pet.status})
              </li>
            ))}
          </ul>
        </section>

        {/* 2. Error contract */}
        <section className={sectionClass}>
          <h2 className="font-medium">2. Error contract (forceFail)</h2>
          <div className="mt-3">
            <button
              className={buttonClass}
              onClick={runForceFail}
              disabled={isFailing}
            >
              Trigger a failure
            </button>
          </div>
          {failInfo ? (
            <div className="mt-2 text-sm">
              <p className="text-xs text-muted-foreground">
                Only message / code / statusCode reach the client:
              </p>
              <pre className="mt-1 overflow-auto rounded bg-muted p-2 text-xs">
                {JSON.stringify(failInfo, null, 2)}
              </pre>
            </div>
          ) : null}
        </section>

        {/* 3. Mutation + invalidation */}
        <section className={sectionClass}>
          <h2 className="font-medium">3. Create pet + invalidation</h2>
          <div className="mt-3 flex items-center gap-2">
            <input
              value={petName}
              onChange={event => setPetName(event.target.value)}
              className="rounded border border-border bg-background px-2 py-1 text-sm"
              placeholder="Pet name"
            />
            <button
              className={buttonClass}
              onClick={submitCreate}
              disabled={isCreating || petName.trim().length === 0}
            >
              {isCreating ? "Creating…" : "Create"}
            </button>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            Creating invalidates ["find-by-status"], so an active uncached list
            refetches — watch the log.
          </p>
        </section>

        {/* 4. Cache probe */}
        <section className={sectionClass}>
          <h2 className="font-medium">4. Cache probe (cached hook)</h2>
          <div className="mt-3 flex flex-wrap gap-2">
            <button className={buttonClass} onClick={fetchCached}>
              Fetch cached {status}
            </button>
            <button className={buttonClass} onClick={invalidateServerCache}>
              Invalidate server cache
            </button>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            cachedAt: {cachedQuery.data?.cachedAt ?? "—"} · items:{" "}
            {cachedPets.length} · isFetching:{" "}
            {String(cachedQuery.isFetching)}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Repeat &ldquo;Fetch cached&rdquo; to see cachedAt stay frozen;
            invalidate to see it advance. (`updateTag` is applied by the server
            action before it resolves; if a refetch ever races it, fetch once
            more.)
          </p>
        </section>
      </div>

      {/* 5 + 6. Callbacks and doorbell */}
      <section className={sectionClass}>
        <h2 className="font-medium">
          5–6. Observation callbacks + doorbell simulation
        </h2>
        <div className="mt-3 flex flex-wrap gap-2">
          <button className={buttonClass} onClick={simulateDoorbell}>
            Simulate doorbell (invalidate RQ prefixes)
          </button>
          <button
            className={buttonClass}
            onClick={() => {
              queryClient.clear();
              pushLog("client cache cleared");
            }}
          >
            Clear client cache
          </button>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          Callbacks fire on every observed transition — including refetches
          triggered by the doorbell, not just your dispatch.
        </p>
        <ol className="mt-3 max-h-56 overflow-auto rounded bg-muted p-2 font-mono text-xs">
          {entries.map(entry => (
            <li key={entry.id}>
              [{entry.at}] {entry.text}
            </li>
          ))}
          {entries.length === 0 ? <li>(log empty)</li> : null}
        </ol>
      </section>

      <details className={sectionClass}>
        <summary className="cursor-pointer font-medium">
          Raw cached payload
        </summary>
        <pre className="mt-2 max-h-56 overflow-auto text-xs">
          {JSON.stringify(cachedQuery.data ?? null, null, 2)}
        </pre>
      </details>
    </main>
  );
}

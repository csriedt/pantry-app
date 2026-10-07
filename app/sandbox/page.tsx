"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useState } from "react";

import { invalidatePetsByStatusAction } from "@/actions/petStore/invalidatePetsByStatusAction";
import { readServerCachedAtAction } from "@/actions/petStore/readServerCachedAtAction";
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

const STALE_TIME_OPTIONS: { label: string; value: number }[] = [
  { label: "0s (always stale)", value: 0 },
  { label: "5s", value: 5_000 },
  { label: "10s", value: 10_000 },
  { label: "30s", value: 30_000 },
];

const REFETCH_INTERVAL_OPTIONS: { label: string; value: number | false }[] = [
  { label: "off", value: false },
  { label: "5s", value: 5_000 },
  { label: "10s", value: 10_000 },
];

const formatSeconds = (ms: number): string =>
  ms < 1_000 ? "<1s" : `${Math.round(ms / 1_000)}s`;

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
  const [serverCachedAt, setServerCachedAt] = useState<string | null>(null);
  const [entries, setEntries] = useState<LogEntry[]>([]);
  const [staleTimeMs, setStaleTimeMs] = useState(10_000);
  const [refetchIntervalMs, setRefetchIntervalMs] = useState<number | false>(
    false
  );

  // Ticks so the freshness readout can show data ageing toward staleness
  // without needing a fetch trigger (React Query staleness is lazy). Starts
  // at 0 so the prerendered HTML is deterministic; the effect sets real time
  // after mount.
  const [now, setNow] = useState(0);
  useEffect(() => {
    // The clock is the external system; read it in timer callbacks rather
    // than synchronously in the effect body (react-hooks/set-state-in-effect).
    const initial = setTimeout(() => setNow(Date.now()), 0);
    const id = setInterval(() => setNow(Date.now()), 1_000);
    return () => {
      clearTimeout(initial);
      clearInterval(id);
    };
  }, []);

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
    pushLog(
      `dispatch uncached [${status}] staleTime=${formatSeconds(staleTimeMs)} interval=${
        refetchIntervalMs === false ? "off" : formatSeconds(refetchIntervalMs)
      }`
    );
    findPets({
      params: status,
      // Per-call options: applied to this query on dispatch. A fresh cache
      // hit resolves without a network call; once stale, the next dispatch
      // (or interval) refetches.
      options: {
        staleTime: staleTimeMs,
        refetchInterval: refetchIntervalMs,
      },
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

  const readServerCache = async () => {
    pushLog(`read server cache [${status}]`);
    const payload = await readServerCachedAtAction(status);
    if (payload.error) {
      const message =
        typeof payload.error === "string"
          ? payload.error
          : payload.error.message;
      setServerCachedAt(null);
      pushLog(`server read error: ${message}`);
      return;
    }
    const cachedAt = payload.data?.cachedAt ?? null;
    setServerCachedAt(cachedAt);
    pushLog(`server cachedAt: ${cachedAt ?? "none"}`);
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

  const dataUpdatedAt = uncachedQuery.dataUpdatedAt;
  const hasData = dataUpdatedAt > 0;
  const dataAgeMs = hasData ? Math.max(0, now - dataUpdatedAt) : 0;
  const staleInMs = hasData ? Math.max(0, staleTimeMs - dataAgeMs) : 0;
  const isFresh = hasData && staleInMs > 0;

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
          <h2 className="font-medium">
            1. Query dispatch (uncached) + per-call options
          </h2>
          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
            <label className="flex items-center gap-1">
              staleTime
              <select
                value={staleTimeMs}
                onChange={event => setStaleTimeMs(Number(event.target.value))}
                className="rounded border border-border bg-background px-1"
              >
                {STALE_TIME_OPTIONS.map(option => (
                  <option key={option.label} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-1">
              refetchInterval
              <select
                value={
                  refetchIntervalMs === false ? "off" : String(refetchIntervalMs)
                }
                onChange={event => {
                  const value = event.target.value;
                  setRefetchIntervalMs(value === "off" ? false : Number(value));
                }}
                className="rounded border border-border bg-background px-1"
              >
                {REFETCH_INTERVAL_OPTIONS.map(option => (
                  <option
                    key={option.label}
                    value={
                      option.value === false ? "off" : String(option.value)
                    }
                  >
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <button className={buttonClass} onClick={fetchUncached}>
              Fetch {status}
            </button>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            isLoading: {String(uncachedQuery.isLoading)} · isFetching:{" "}
            {String(uncachedQuery.isFetching)} · items: {uncachedPets.length}
          </p>
          <p className="mt-1 text-xs">
            {hasData
              ? isFresh
                ? `updated ${formatSeconds(dataAgeMs)} ago · fresh (stale in ${Math.ceil(
                    staleInMs / 1_000
                  )}s)`
                : `updated ${formatSeconds(dataAgeMs)} ago · stale — next dispatch refetches`
              : "no data yet"}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Options apply on dispatch. A fresh dispatch resolves from the
            client cache (no network); refetchInterval refetches automatically
            and those refreshes fire the observation callbacks too.
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
            Creating invalidates [&quot;find-by-status&quot;], so an active
            uncached list refetches — watch the log.
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
            <button className={buttonClass} onClick={readServerCache}>
              Read server cache
            </button>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            client cachedAt: {cachedQuery.data?.cachedAt ?? "—"} · server
            cachedAt: {serverCachedAt ?? "—"} · items: {cachedPets.length} ·
            isFetching: {String(cachedQuery.isFetching)}
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

import { GenericPayload } from "@/types/service/payloads";

// All three auth actions succeed by redirecting, so the payload only ever
// carries a failure — one shared shape instead of three identical files.
export type AuthPayload = GenericPayload<{ ok: true }>;

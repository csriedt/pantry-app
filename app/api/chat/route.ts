// Chat endpoint for the assistant panel: streams `UIMessage`s (streaming text,
// tool-approval confirmations, suggestion chips) to the front-end.
//
// The reusable inference pieces (model, prune, tools, turn tracking, run
// logging — see imports below) live in `lib/chat/` so a server action can run
// the same turn without duplicating them. What stays here is the per-caller
// orchestration (the stream/streamText wiring) and the HTTP transport.
//
// Persistence and auditing are BOTH wired, in that order. `createTurnTracker`
// resolves the thread and writes both messages (`lib/chat/trackTurn.ts`), then
// `createRunLogger` records the run's token spend against the uuid it handed
// back (`lib/chat/logRun.ts`). The order is load-bearing — see the comment on
// the logger below.

import "server-only";

import {
  convertToModelMessages,
  createUIMessageStream,
  createUIMessageStreamResponse,
  stepCountIs,
  streamText,
  toUIMessageStream,
  type ToolSet,
} from "ai";

import { createRunLogger, toErrorMessage } from "@/lib/chat/logRun";
import {
  pruneUnansweredApprovals,
  stripToolPreambles,
} from "@/lib/chat/messages";
import {
  buildInstructions,
  CHAT_MODEL_ID,
  getChatModel,
  PROMPT_VERSION,
} from "@/lib/chat/model";
import { resolveSurfaceContextMessage } from "@/lib/chat/surfaceContext";
import { buildTools } from "@/lib/chat/tools";
import { createTurnTracker } from "@/lib/chat/trackTurn";
import type { ChatUIMessage, SurfaceContext } from "@/lib/chat/types";
import { waitUntil } from "@/lib/runtime/waitUntil";
import { getCurrentWorkspaceId } from "@/lib/supabase/getCurrentWorkspaceId";
import { createRlsSupabaseClient } from "@/lib/supabase/rlsSupabaseClient";

// Every non-onboarding turn ships the same curated `activeTools` allowlist
// (`NON_ONBOARDING_TOOLS` below, built from `BASE_TOOLS` + the domain arrays).
// "Static" here means the array is identical across every step of every turn
// — NOT that `buildTools()`'s full output is auto-included. New tools must be
// added to the appropriate array below (and only then reach the model);
// writer-dependent UI-side tools like `updateBusinessProfile` intentionally
// live in `buildTools()` but are absent from this allowlist. See the "Static
// tool exposure" section of `lib/chat/AGENTS.md` for the full rule. We tried
// progressive-disclosure via a router tool (`leadsTools`) + `prepareStep` and
// it was unreliable in practice — the model frequently believed the domain
// tools were unavailable even after the router had been called. Static
// exposure trades a paragraph of extra prompt tokens for a big cache-hit
// improvement (identical `tools` array on every step of every turn) and
// deterministic behaviour. See the docstring on `buildInstructions` for the
// matching prompt-side shape.
const BASE_TOOLS = [
  "askQuestion",
  "getCurrentDateTime",
  "sendFollowups",
  "suggestReplies",
] as const;
// Read-only. The WRITE half of this domain (`updateBusinessProfile`) is
// deliberately absent — it's the end-of-onboarding save, and onboarding turns
// pass `activeTools: undefined` so it reaches the model there instead.
const BUSINESS_PROFILE_DOMAIN_TOOLS = ["getBusinessProfile"] as const;
const LEADS_DOMAIN_TOOLS = [
  "listLeads",
  "getLead",
  "searchLeads",
  "countActiveLeads",
  "listLeadInteractions",
  "listLeadActions",
  "createLead",
  "updateLead",
  "deleteLead",
  "createLeadInteraction",
  "classifyLeadInteraction",
] as const;
const CAMPAIGN_ASSET_DOMAIN_TOOLS = [
  "authorFacebookPost",
  "authorInstagramPost",
  "authorLinkedinPost",
  "authorWhatsappChannelPost",
  "authorEmail",
] as const;
const CAMPAIGNS_DOMAIN_TOOLS = [
  "listCampaigns",
  "readCampaign",
  "searchCampaigns",
  "createCampaign",
  "updateCampaign",
  "deleteCampaign",
] as const;

const OFFERS_DOMAIN_TOOLS = [
  "listOffers",
  "getOffer",
  "searchOffers",
  "createOffer",
  "updateOffer",
  "deleteOffer",
] as const;
const CAMPAIGN_ASSETS_DOMAIN_TOOLS = [
  "listCampaignAssets",
  "searchCampaignAssets",
  "createCampaignAsset",
  "editCampaignAsset",
  "deleteCampaignAsset",
  "changeCampaignAssetState",
  "generateCampaignAsset",
  "regenerateCampaignAsset",
] as const;
const ACTIONS_DOMAIN_TOOLS = [
  "listActions",
  "getAction",
  "searchActions",
  "createAction",
  "editAction",
  "approveAction",
  "dismissAction",
  "regenerateAction",
  "deleteAction",
] as const;
type ChatToolName =
  | (typeof BASE_TOOLS)[number]
  | (typeof BUSINESS_PROFILE_DOMAIN_TOOLS)[number]
  | (typeof LEADS_DOMAIN_TOOLS)[number]
  | (typeof CAMPAIGN_ASSET_DOMAIN_TOOLS)[number]
  | (typeof CAMPAIGNS_DOMAIN_TOOLS)[number]
  | (typeof OFFERS_DOMAIN_TOOLS)[number]
  | (typeof CAMPAIGN_ASSETS_DOMAIN_TOOLS)[number]
  | (typeof ACTIONS_DOMAIN_TOOLS)[number];

const NON_ONBOARDING_TOOLS: readonly ChatToolName[] = [
  ...BASE_TOOLS,
  ...BUSINESS_PROFILE_DOMAIN_TOOLS,
  ...LEADS_DOMAIN_TOOLS,
  ...CAMPAIGN_ASSET_DOMAIN_TOOLS,
  ...CAMPAIGNS_DOMAIN_TOOLS,
  ...OFFERS_DOMAIN_TOOLS,
  ...CAMPAIGN_ASSETS_DOMAIN_TOOLS,
  ...ACTIONS_DOMAIN_TOOLS,
];

// Cloudflare's `console.error(msg, err)` prints only enumerable properties, so
// bare `Error`s log as `{}`. Flatten to a plain object with the fields we care
// about (including AI SDK's provider-error shape: `cause`, `responseBody`).
// Provider response bodies (`err.responseBody`) can be very large and often
// include the prompt / user content that triggered the error — echoing them
// verbatim inflates log volume and widens the PII exposure surface. Truncate
// to a length that keeps the diagnostic head (error code, first snippet of
// content) while capping the tail.
const RESPONSE_BODY_LOG_LIMIT = 2000;
function truncateResponseBody(body: unknown) {
  if (typeof body !== "string") return body;
  return body.length > RESPONSE_BODY_LOG_LIMIT
    ? `${body.slice(0, RESPONSE_BODY_LOG_LIMIT)}…[truncated ${body.length - RESPONSE_BODY_LOG_LIMIT} chars]`
    : body;
}

function serializeError(err: unknown) {
  if (err instanceof Error) {
    return {
      name: err.name,
      message: err.message,
      stack: err.stack,
      cause: (err as { cause?: unknown }).cause,
      responseBody: truncateResponseBody(
        (err as { responseBody?: unknown }).responseBody
      ),
      statusCode: (err as { statusCode?: unknown }).statusCode,
    };
  }
  if (err && typeof err === "object") {
    return { raw: err, stringified: String(err) };
  }
  return { value: err };
}

export async function POST(req: Request) {
  const {
    messages,
    conversationId,
    surfaceContext,
  }: {
    messages: ChatUIMessage[];
    // The thread this turn belongs to. Minted client-side and kept in the
    // localStorage store — see `components/app/chat-provider.tsx`. Trusting a
    // client-supplied uuid is safe here because `ensureConversationAction`
    // resolves it under RLS, which can only ever match or create a row this
    // caller already owns. See that action's docstring.
    //
    // Note the contrast with `onboarding` below, which is deliberately NOT taken
    // from the body: that flag changes what the SERVER does, so it has to be
    // derived here. A conversation id only names a row RLS already fences off.
    conversationId?: string;
    // The screen the user is currently on, declared client-side via
    // `useSetScreenContext`. INTENT ONLY: `resolveSurfaceContextMessage`
    // below re-reads the entity through an RLS-scoped Supabase client, so a
    // spoofed id returns `null` and nothing reaches the model. Never used
    // directly for tool binding — only to shape a system-role hint the model
    // reads on this turn. Optional — a screen that hasn't declared context
    // (or a caller with none in-flight) just skips the injection.
    surfaceContext?: SurfaceContext | null;
  } = await req.json();

  // Resolve the active workspace up front so it can be threaded into the
  // system prompt (as an end-of-prompt scope marker) and logged alongside
  // usage on stream close. `null` = no active org — the chat still runs, but
  // any workspace-scoped tool will refuse via `requireWorkspace`.
  const workspaceId = await getCurrentWorkspaceId();

  // ONE call that owns the whole persistence story for this turn: resolve the
  // thread, write the incoming user message, and hand back a writer for the
  // assistant's reply. Never throws — a failed write degrades to a no-op
  // rather than breaking the turn. See `lib/chat/trackTurn.ts`.
  //
  // `turn.conversationId` is the ownership-proven uuid, and it's what the
  // `ai_usage` logger below is given. Hence this call coming first.
  const turn = await createTurnTracker({ conversationId, messages });

  // `onboarding` shapes the prompt + toolset for this turn (see below). Derived
  // SERVER-SIDE from the `business_profiles.onboarded` flag — never trusted from
  // the client, so a spoofed body can't alter server behaviour. No workspace ⇒
  // false (tools would refuse anyway; don't run the onboarding flow blind).
  // Wrapped so a profile-read hiccup can never fail the whole chat turn.
  let onboarding = false;
  if (workspaceId) {
    try {
      const sb = await createRlsSupabaseClient();
      const { data: profileRow, error: profileErr } = await sb
        .from("business_profiles")
        .select("onboarded")
        .maybeSingle();
      if (profileErr) {
        console.error("[chat] onboarding-flag read failed", profileErr);
      } else {
        onboarding = !profileRow?.onboarded;
      }
    } catch (ex) {
      console.error("[chat] onboarding-flag read threw", ex);
    }
  }

  // Sanitize the history before the model reads it back. Two passes, two
  // different jobs — see lib/chat/messages.ts:
  //
  // `pruneUnansweredApprovals` (+ `ignoreIncompleteToolCalls` below) keeps the
  // request VALID: between them they drop tool calls with no matching result,
  // which would otherwise throw AI_MissingToolResultsError.
  //
  // `stripToolPreambles` keeps the request HONEST: it removes the prose the
  // model wrote immediately before an `askQuestion` card. The client is the
  // only history store right now — `prepareSendMessagesRequest` posts the whole
  // array every turn — so left in, the model reads its own narrated questions
  // back as precedent and keeps narrating. That's why the strip lives here and
  // not in the UI: a client-side fix would hide the duplicate on screen while
  // the loop carried on feeding itself.
  //
  // Note `originalMessages` below gets the RAW `messages`, not this. The UI
  // keeps its own copy of the text; only the model's view is trimmed.
  const sanitized = stripToolPreambles(pruneUnansweredApprovals(messages));

  // Re-resolve the client's surface hint through the RLS-scoped client so a
  // spoofed id can only ever return context the caller was already entitled
  // to see. Skipped during onboarding: the flow is self-contained and its
  // scripted questions don't need pronoun resolution. Skipped when there's
  // no active workspace: the resolver would find nothing anyway, and any
  // downstream write would refuse via `requireWorkspace`. Nulled out if the
  // resolver returns null (invisible / soft-deleted / dashboard).
  //
  // See `lib/chat/surfaceContext.ts` for the shape of the injected message.
  let surfaceContextMessage: Awaited<
    ReturnType<typeof resolveSurfaceContextMessage>
  > = null;
  if (!onboarding && workspaceId) {
    try {
      const sb = await createRlsSupabaseClient();
      surfaceContextMessage = await resolveSurfaceContextMessage(
        surfaceContext,
        sb
      );
    } catch (ex) {
      // Same posture as the onboarding-flag read above — a resolver hiccup
      // must not break the turn. Log and continue with no injection.
      console.error("[chat] surface-context resolve failed", ex);
    }
  }

  // ONE logger for the whole request, shared by all three exit paths below
  // (normal end, stream error, setup throw). Its once-guard is what keeps a
  // turn that trips two of them down to a single `ai_usage` row — see
  // `createRunLogger` for why that matters.
  //
  // Built AFTER the tracker, deliberately. `turn.conversationId` is only safe
  // to write because `ensureConversationAction` resolved it under RLS; the
  // `ai_usage` insert runs on the bypass client, which has no RLS of its own to
  // catch a forged id. It's `null` when the thread couldn't be resolved — the
  // run is still recorded, just without thread attribution, which is why the
  // column is nullable (see `lib/db/schema/ai.ts`).
  const runLog = createRunLogger({
    actionType: "chat",
    model: CHAT_MODEL_ID,
    conversationId: turn.conversationId,
  });

  const stream = createUIMessageStream<ChatUIMessage>({
    // Surface stream-side failures (e.g. writer errors, tool-result validation)
    // — otherwise they vanish into a generic 500 with no server log.
    onError: error => {
      console.error("[chat] ui stream error", serializeError(error));
      return "Chat stream error. See server logs.";
    },
    // Pass the incoming history so the stream CONTINUES the existing assistant
    // message on an approval resume (its id is reused) instead of emitting a
    // fresh one. Without this, resuming after a tool approval re-materialises
    // the just-approved tool call in a NEW assistant message, producing a
    // duplicate Confirmation card alongside the original. On a fresh user turn
    // the last message is a user message, so a new assistant id is generated.
    originalMessages: messages,
    // Persist the assistant's reply. THIS is the callback that has the finished
    // `parts` — `streamText`'s own `onEnd` reports tokens and never sees them.
    //
    // `isContinuation` is the approval-resume signal: true means the SDK
    // extended the existing assistant message instead of starting a new one, so
    // the write has to land on that same row. `saveMessageAction` upserts on
    // `(conversation_id, client_id)`, which is what makes that work.
    //
    // AWAITED **and** registered with `waitUntil`, deliberately. The SDK types
    // callbacks as `(event) => PromiseLike<void> | void`, so returning a
    // promise holds the stream open until the write lands — but on Cloudflare
    // Workers that only helps while the response is still open. If the client
    // disconnects, `consumeStream()` below keeps generation running past the
    // response, and unregistered work in that window can be discarded.
    // `waitUntil` is what keeps it alive; the `await` is what covers hosts that
    // have no execution context. See `lib/runtime/waitUntil.ts`.
    onEnd: async ({ responseMessage, isContinuation }) => {
      await waitUntil(
        turn.saveAssistantMessage({
          message: responseMessage,
          isContinuation,
        })
      );
    },
    execute: async ({ writer }) => {
      // Compose `instructions` for this turn. The AI SDK v7 refuses
      // `role: "system"` inside `messages` by DEFAULT — the runtime error is
      // "System messages are not allowed in the prompt or messages fields.
      // Use the instructions option instead." The opt-out exists:
      // `allowSystemInMessages: true` on `streamText` would let us splice
      // the resolved system message into `modelMessages` at `length - 1`
      // per the ticket sketch.
      //
      // We ride via `instructions` instead because on the CURRENT turn the
      // two shapes produce equivalent model behaviour (both attach a per-
      // turn `SystemModelMessage`), and neither reaches historical turns
      // without also persisting the hint per user message — which isn't
      // wired here. Given equal behaviour, `instructions` wins on two
      // small counts: (1) no splice logic against the message array's tail,
      // and (2) the base instructions stay as a stable, cache-friendly
      // first entry with the per-turn hint as a legitimately-varying
      // second entry.
      //
      // Consequence: this is a PER-TURN hint, not persisted per-message.
      // The client transcript never sees the injection, and the acceptance
      // criterion "scrolling back to a turn issued on a different screen
      // still resolves pronouns to that turn's original surface" is
      // honoured only indirectly — via the concrete names / ids the model
      // wrote into that older assistant reply, which stay in transcript
      // context. True per-message preservation would need us to persist a
      // hint on each user message and rebuild `instructions` (or splice
      // inline) per historical turn on every request; deferred. See
      // lib/chat/AGENTS.md "Surface context" section for the fuller
      // trade-off write-up.
      //
      // Falls back to the plain string form when there's nothing to
      // inject, so the pre-surface-context cache pool is unaffected on
      // turns without a hint.
      const baseInstructions = buildInstructions({ onboarding, workspaceId });
      const instructions = surfaceContextMessage
        ? [
            { role: "system" as const, content: baseInstructions },
            surfaceContextMessage,
          ]
        : baseInstructions;

      // EXIT PATH 3 of 3. `getChatModel()` throws synchronously when the Vertex
      // credentials are missing — before `streamText` exists, so neither
      // `onEnd` nor `onError` can fire. Without this catch, a misconfigured
      // deploy would serve failing turns that leave no trace in `ai_usage` at
      // all: the run log would look healthy precisely when it isn't. Rethrow
      // after logging so the stream still surfaces the failure to the client.
      try {
        const result = streamText({
          model: getChatModel(),
          instructions,
          // `sanitized`, not `messages` — see the two-pass comment above.
          // `ignoreIncompleteToolCalls` is the third pass, dropping calls that
          // never got a result so the request can't throw
          // AI_MissingToolResultsError.
          messages: await convertToModelMessages(sanitized, {
            ignoreIncompleteToolCalls: true,
          }),
          stopWhen: stepCountIs(10),
          tools: buildTools(writer),
          // Onboarding lets the model see every tool (the prompt gates the flow);
          // normal chat exposes base + all domain tools from the start. Same
          // toolset every step — maximises implicit-cache hit rate on `tools`.
          activeTools: onboarding ? undefined : NON_ONBOARDING_TOOLS,
          // EXIT PATH 1 of 3 — the normal one. `usage` is the aggregate across
          // ALL steps (the SDK's own docstring; `totalUsage` is a deprecated
          // alias for the same thing), which is what makes a single row per
          // turn correct even when tool calls push the turn to several steps.
          // Still fires when the client stops mid-stream — see consumeStream()
          // below for why.
          //
          // AWAITED, deliberately. `Callback` is typed
          // `(event) => PromiseLike<void> | void`, so returning a promise holds
          // the stream open until the insert lands. `runLog.finish` separately
          // registers that insert with `ctx.waitUntil`, which is what carries
          // it through a client disconnect — see `lib/chat/logRun.ts` and
          // `lib/runtime/waitUntil.ts`. Both matter: the await covers hosts
          // with no execution context, `waitUntil` covers Cloudflare.
          onEnd: async ({ usage, callId, stepNumber, finishReason }) => {
            // Kept alongside the DB write: it's the fast triage path when
            // something looks wrong, and it reports fields the row doesn't
            // carry. `inputCachedReadTokens` is the one to watch — it climbs as
            // implicit Gemini caching warms on the shared prefix, so a sudden
            // drop to zero means the prompt or tool set broke the cache prefix.
            // `surface` / `surfaceResolved` are here (not in `ai_usage`) for
            // the same reason: measuring how often the pronoun hint is
            // actionable and triaging why a bind failed on a specific turn.
            console.log("[chat] token usage", {
              promptVersion: PROMPT_VERSION,
              workspaceId: workspaceId ?? "none",
              onboarding,
              surface: surfaceContext?.surface ?? "none",
              surfaceResolved: surfaceContextMessage !== null,
              inputTokens: usage.inputTokens,
              // `inputTokenDetails` itself is a required field on `LanguageModelUsage`
              // (see AI SDK types), but its inner fields are `number | undefined` —
              // populated only when the provider surfaces cache stats. Default to 0
              // so the log line is a stable shape whether the provider reports
              // cache figures or not.
              inputCachedReadTokens:
                usage.inputTokenDetails.cacheReadTokens ?? 0,
              inputCachedWriteTokens:
                usage.inputTokenDetails.cacheWriteTokens ?? 0,
              outputTokens: usage.outputTokens,
              totalTokens: usage.totalTokens,
            });
            await runLog.finish({
              status: "done",
              usage,
              // `output_ref` is the row's only free-form field, so it carries
              // what you'd need to correlate a row back to a specific call:
              // the provider `callId`, how many steps it took, why it stopped,
              // and the prompt revision that produced it.
              outputRef: {
                callId,
                steps: stepNumber + 1,
                finishReason,
                promptVersion: PROMPT_VERSION,
              },
            });
          },
          // EXIT PATH 2 of 3. No usage is reported on this path, so the row
          // lands with five zero buckets and the message in `error`. That's
          // correct rather than lossy: a stream that failed has no billable
          // aggregate to attribute, but the ATTEMPT is still worth a row —
          // otherwise a provider outage shows up as silence in the log.
          onError: async ({ error }) => {
            console.error("[chat] stream error", serializeError(error));
            await runLog.finish({
              status: "error",
              error: toErrorMessage(error),
            });
          },
        });

        writer.merge(
          toUIMessageStream<ToolSet, ChatUIMessage>({ stream: result.stream })
        );

        // Drain the base stream independently of the client so generation runs
        // to completion (and onEnd fires with usage) even if the user hits
        // stop and the response stream is cancelled.
        void result.consumeStream();
      } catch (error) {
        console.error("[chat] turn failed before streaming", error);
        await runLog.finish({
          status: "error",
          error: toErrorMessage(error),
        });
        throw error;
      }
    },
  });

  return createUIMessageStreamResponse({ stream });
}

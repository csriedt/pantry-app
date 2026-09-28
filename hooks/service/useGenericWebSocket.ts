import { ExtendedApiError } from "@/types/service/errors";
import { GenericError } from "@/types/service/errors";
import { GenericPayload } from "@/types/service/payloads";
import { formatGenericError } from "@/lib/service/errors";
import { useCallback, useEffect, useRef, useState } from "react";
import { z } from "zod";

interface UseInternalWebSocketOptions<TMessageReceive> {
  ignoreJson?: boolean;
  schema?: z.ZodType<TMessageReceive>;
  isValidMessage?: (message: unknown) => message is TMessageReceive;
  messageFilter?: (message: unknown) => boolean;
  errorMessageResolver?: (message: unknown) => GenericError | undefined;
  onOpen?: () => void;
  onClose?: () => void;
  onError?: (err: Event) => void;
  onMessage?: (data: GenericPayload<TMessageReceive>) => void;
  /**
   * Maximum number of messages retained in `messageHistory`. Older messages are
   * discarded from the front when this is exceeded. Default 100. Pass `Infinity`
   * to disable the cap.
   */
  maxHistory?: number;
  /**
   * Disable automatic reconnect-on-close. Default false (reconnect is on).
   */
  disableReconnect?: boolean;
  /**
   * Initial reconnect delay in ms. Doubles on each consecutive failure up to
   * `maxReconnectDelayMs`. Default 1000.
   */
  reconnectDelayMs?: number;
  /**
   * Upper bound on the reconnect backoff. Default 30000.
   */
  maxReconnectDelayMs?: number;
}

/**
 * A custom React hook for managing WebSocket connections with type-safe message handling.
 * Intended only for internal use by other hooks to provide WebSocket functionality.
 * Never intended to be called directly from React components - to avoid excessive boilerplate.
 *
 * Behaviour:
 *  - All user-supplied callbacks and validators are mirrored into refs after each
 *    render, so inline closures from callers are safe and the latest closure is
 *    always used by the live socket without forcing a reconnect.
 *  - On unexpected close the hook reconnects with exponential backoff (override or
 *    disable via options).
 *  - `messageHistory` is bounded by `maxHistory` to avoid unbounded memory growth.
 *
 * @template TMessageReceive - The expected type of received messages after validation
 *
 * @param url - The WebSocket URL to connect to
 * @param options - Configuration options for the WebSocket connection (see type)
 *
 * @returns
 *  - `lastMessageReceived`: most recent valid message or null
 *  - `messageHistory`: bounded list of received messages
 *  - `sendMessage`: send a message; surfaces send-time errors via the optional callback
 *  - `isOpen`: whether the underlying socket is currently OPEN
 */
export function useGenericWebSocket<TMessageReceive = unknown>(
  url: string,
  options: UseInternalWebSocketOptions<TMessageReceive> = {},
): {
  lastMessageReceived: GenericPayload<TMessageReceive> | null;
  messageHistory: GenericPayload<TMessageReceive>[];
  sendMessage: (
    data: unknown,
    onError?: (error: ExtendedApiError) => void,
  ) => void;
  isOpen: boolean;
} {
  const {
    ignoreJson,
    maxHistory = 100,
    disableReconnect = false,
    reconnectDelayMs = 1000,
    maxReconnectDelayMs = 30000,
  } = options;

  const socketRef = useRef<WebSocket | null>(null);
  const [lastMessageReceived, setLastMessageReceived] =
    useState<GenericPayload<TMessageReceive> | null>(null);
  const [messageHistory, setMessageHistory] = useState<
    GenericPayload<TMessageReceive>[]
  >([]);
  const [isOpen, setIsOpen] = useState<boolean>(false);
  const [reconnectKey, setReconnectKey] = useState<number>(0);

  // Mirror the latest user-supplied callbacks and validators into refs so the
  // live socket reads the freshest closure without forcing a reconnect on change.
  const optionsRef = useRef(options);
  useEffect(() => {
    optionsRef.current = options;
  });

  useEffect(() => {
    let cancelled = false;
    let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
    let attempts = 0;

    const connect = () => {
      const socket = new WebSocket(url);
      socketRef.current = socket;

      socket.onopen = () => {
        attempts = 0;
        setIsOpen(true);
        optionsRef.current.onOpen?.();
      };

      socket.onclose = () => {
        setIsOpen(false);
        optionsRef.current.onClose?.();
        if (cancelled || disableReconnect) return;
        const delay = Math.min(
          reconnectDelayMs * 2 ** attempts,
          maxReconnectDelayMs,
        );
        attempts += 1;
        reconnectTimer = setTimeout(() => {
          if (!cancelled) setReconnectKey((k) => k + 1);
        }, delay);
      };

      socket.onerror = (e) => {
        optionsRef.current.onError?.(e);
      };

      socket.onmessage = (event: MessageEvent) => {
        let payload: GenericPayload<TMessageReceive> | undefined;
        let error: GenericError | undefined;

        try {
          const parsed = !ignoreJson ? JSON.parse(event.data) : event.data;
          if (!parsed) return;

          const {
            schema,
            isValidMessage,
            messageFilter,
            errorMessageResolver,
          } = optionsRef.current;

          const resolvedError = errorMessageResolver?.(parsed);
          if (resolvedError) {
            error = resolvedError;
          } else {
            if (schema) {
              if (!schema.safeParse(parsed).success) return;
            } else if (isValidMessage) {
              if (!isValidMessage(parsed)) return;
            }

            if (messageFilter && !messageFilter(parsed)) return;

            payload = { data: parsed as TMessageReceive };
          }
        } catch (ex) {
          error = formatGenericError(ex);
        }

        if (!payload && !error) return;
        const next: GenericPayload<TMessageReceive> = payload ?? { error };
        setLastMessageReceived(next);
        setMessageHistory((prev) => {
          const appended = [...prev, next];
          return appended.length > maxHistory
            ? appended.slice(-maxHistory)
            : appended;
        });
        optionsRef.current.onMessage?.(next);
      };
    };

    connect();

    return () => {
      cancelled = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      const socket = socketRef.current;
      socketRef.current = null;
      socket?.close();
    };
  }, [
    url,
    reconnectKey,
    disableReconnect,
    ignoreJson,
    reconnectDelayMs,
    maxReconnectDelayMs,
    maxHistory,
  ]);

  const sendMessage = useCallback(
    (data: unknown, onError?: (error: ExtendedApiError) => void) => {
      let error: GenericError | undefined;
      try {
        const socket = socketRef.current;
        if (socket && socket.readyState === WebSocket.OPEN) {
          socket.send(JSON.stringify(data));
        } else {
          error = "WebSocket not open. Unable to send.";
        }
      } catch (ex) {
        error = formatGenericError(ex);
      }
      if (error) {
        onError?.(ExtendedApiError.fromGenericError(error));
      }
    },
    [],
  );

  return { lastMessageReceived, messageHistory, sendMessage, isOpen };
}

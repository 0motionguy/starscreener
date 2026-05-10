"use client";

import { useEffect, useState } from "react";

export type ClientSessionState = {
  loaded: boolean;
  userId: string | null;
};

type SessionResponse = {
  ok?: boolean;
  userId?: string | null;
};

const emptySession: ClientSessionState = { loaded: false, userId: null };

let cachedSession = emptySession;
let sessionRequest: Promise<void> | null = null;
const listeners = new Set<(state: ClientSessionState) => void>();

function publishSession(state: ClientSessionState) {
  cachedSession = state;
  for (const listener of listeners) {
    listener(cachedSession);
  }
}

function readSession() {
  if (cachedSession.loaded) {
    return Promise.resolve();
  }

  if (!sessionRequest) {
    sessionRequest = fetch("/api/auth/session", { credentials: "include" })
      .then((response) => (response.ok ? response.json() : { ok: false }))
      .then((data: SessionResponse) => {
        publishSession({
          loaded: true,
          userId: data?.ok && data.userId ? data.userId : null,
        });
      })
      .catch(() => {
        publishSession({ loaded: true, userId: null });
      })
      .finally(() => {
        sessionRequest = null;
      });
  }

  return sessionRequest;
}

export function useClientSession(): ClientSessionState {
  const [state, setState] = useState<ClientSessionState>(cachedSession);

  useEffect(() => {
    listeners.add(setState);

    if (cachedSession.loaded) {
      setState(cachedSession);
    } else {
      void readSession();
    }

    return () => {
      listeners.delete(setState);
    };
  }, []);

  return state;
}

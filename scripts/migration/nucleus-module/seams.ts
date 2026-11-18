// Where the ported logic meets Nucleus. Written for Nucleus; NOT copied from the old tool.
// Copied into src/modules/expenses/lib/ by scripts/migration/port-to-nucleus.mjs in the PR-PO tool repository.
//
// The old tool called its own server routes with fetch('/api/...'). In Nucleus each route becomes a Supabase Edge Function.
// The ported files still say `apiFetch('/api/send-email', { method, headers, body })`; this function sends that call to the
// mapped Edge Function and hands back the small part of a fetch Response the old code reads (ok, status, json()).
//
// None of the three functions below exists in Nucleus yet. Until they do, every call returns { ok: false }, which the
// logic already treats as "best effort, never blocks" (OCR falls back to typing; emails and Slack messages are skipped).
import { supabase } from "./supabase.ts";

const FUNCTION_FOR_ROUTE: Record<string, string> = {
  "/api/send-email": "send-email", // vendor / pr / report / advance emails (mail path still to be decided for Nucleus)
  "/api/notify-slack": "notify-slack", // Slack messages
  "/api/ai/proxy": "ai-proxy", // Gemini (OCR) and Groq (text), keys stay on the server
};

type ApiInit = { method?: string; headers?: Record<string, string>; body?: string };

export async function apiFetch(route: string, init: ApiInit = {}) {
  const functionName = FUNCTION_FOR_ROUTE[route];
  if (!functionName) throw new Error(`No Nucleus function is mapped to ${route}`);
  let body: Record<string, unknown> = {};
  try {
    body = init.body ? JSON.parse(init.body) : {};
  } catch {
    body = {};
  }
  const { data, error } = await supabase.functions.invoke(functionName, { body });
  const ok = !error;
  return {
    ok,
    status: ok ? 200 : 500,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    json: async (): Promise<any> =>
      ok ? (data ?? {}) : { error: error?.message ?? "request failed" },
  };
}

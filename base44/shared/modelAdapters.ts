// Stage 1 model adapters.
//
// One small, swappable interface over the providers this app can actually reach:
//   base44-core - the platform's Core InvokeLLM integration (chat/text models)
//   typesafe    - the platform AI Gateway's TypeSafe provider (the jev evaluation model)
//
// Every call returns the same envelope: provider, requested model, resolved model
// only when the provider really returns one, structured output, measured latency,
// usage and cost only when the provider really returns them, and a categorised
// error. Nothing is inferred from a model name, and unavailable measurements stay
// null rather than being filled in.
//
// Before any dispatch, the caller's server-side budget is consumed: when a
// reserve function is supplied it must succeed, or the call is refused with zero
// dispatches. The reservation is the guard, not the transport.
//
// The transport is injectable so contract, timeout and error tests can run against
// a stub with zero provider calls.

import { experimental_evaluate as evaluate } from 'npm:ai@7.0.105';
import { createTypeSafeAi } from 'npm:@ai-sdk/typesafe-ai@3.0.4';

export const PROVIDERS = ['base44-core', 'typesafe'];
export const CALL_SLOTS = ['a', 'b'];

// The authoritative current catalog. "automatic" is documented but never used by
// the proof, which needs two explicit, distinct models.
export const PROVIDER_MODELS = {
  'base44-core': [
    'automatic',
    'gemini_3_8_flash',
    'gpt_6_luna',
    'gpt_6_sol',
    'gpt_6_astra',
    'claude-sonnet-5',
    'claude_opus_5_5',
    'claude_fable_5_1',
    'glm_5_2',
  ],
  typesafe: ['jev'],
};

// The distinct support states. "not_evaluated" is the app-level default for a
// claim no evaluation was obtained for; a model is never offered it as an answer.
export const SUPPORT_STATES = ['not_evaluated', 'supported', 'mixed', 'insufficient_evidence', 'contradicted'];
export const MODEL_CHOICES = ['supported', 'mixed', 'insufficient_evidence', 'contradicted'];

const SECRET_PATTERNS = [
  /sk-[A-Za-z0-9_-]{8,}/g,
  /Bearer\s+[A-Za-z0-9._-]{8,}/gi,
  /(api[-_]?key["'\s:=]+)[A-Za-z0-9._-]{8,}/gi,
  /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g,
];

// Error text is stored, so it is scrubbed of anything key-shaped and capped.
export function sanitizeMessage(value) {
  let text = String((value && value.message) || value || 'unknown error');
  for (const pattern of SECRET_PATTERNS) text = text.replace(pattern, '[redacted]');
  text = text.replace(/[\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim();
  return text.slice(0, 300);
}

export function categorizeError(message) {
  const text = String(message || '').toLowerCase();
  if (/timed?\s?out|timeout|abort/.test(text)) return 'timeout';
  if (/401|403|unauthoriz|forbidden|invalid api key|authentication/.test(text)) return 'auth';
  if (/429|rate limit|quota|too many requests|insufficient_quota/.test(text)) return 'rate_limited';
  if (/invalid model|unknown model|model not found|unsupported model|not a valid model/.test(text)) return 'invalid_model';
  if (/invalid provider|unknown provider/.test(text)) return 'invalid_provider';
  if (/schema|invalid request|400|bad request/.test(text)) return 'invalid_request';
  return 'provider_error';
}

function envelope(base) {
  return {
    ok: false,
    provider: base.provider,
    requested_model: base.requested_model,
    resolved_model: null,
    output: null,
    latency_ms: 0,
    usage: null,
    usage_available: false,
    cost: null,
    cost_known: false,
    dispatches: 0,
    timed_out: false,
    error: null,
    ...base,
  };
}

function withTimeout(promise, timeoutMs, controller) {
  // Enforced at this layer. Cancellation is requested when the runtime exposes
  // AbortController and the transport accepts a signal; whether an in-flight
  // provider request can really be cancelled is provider-specific and is recorded
  // in PLATFORM_LIMITATIONS rather than assumed here.
  let timer = null;
  const guard = new Promise((resolve, reject) => {
    timer = setTimeout(() => {
      if (controller) {
        try { controller.abort(); } catch { /* the transport decides how to react */ }
      }
      reject(new Error(`call timed out after ${timeoutMs}ms`));
    }, timeoutMs);
  });
  return Promise.race([promise, guard]).finally(() => clearTimeout(timer));
}

function extractUsage(value) {
  if (!value || typeof value !== 'object') return null;
  const input = value.input_tokens ?? value.inputTokens ?? value.prompt_tokens ?? value.promptTokens;
  const output = value.output_tokens ?? value.outputTokens ?? value.completion_tokens ?? value.completionTokens;
  if (input === undefined && output === undefined) return null;
  return {
    input_tokens: typeof input === 'number' ? input : null,
    output_tokens: typeof output === 'number' ? output : null,
  };
}

// A resolved identifier is returned only when the provider's own response carries
// one. These locations are unverified probing sites, not a documented contract:
// when none of them holds a string, the resolved model is recorded as unavailable.
function extractResolvedModel(value) {
  if (!value || typeof value !== 'object') return null;
  const candidates = [
    value.response && value.response.modelId,
    value.response && value.response.model,
    value.providerMetadata && value.providerMetadata.typesafe && value.providerMetadata.typesafe.model,
    value.providerMetadata && value.providerMetadata.model,
  ];
  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim()) return candidate.trim();
  }
  return null;
}

// Real transport. Credentials are never read here: the caller passes the gateway
// connection it obtained inside the authenticated handler, and no request header
// is ever recorded.
async function liveTransport(request, deps) {
  if (request.provider === 'typesafe') {
    // The gateway connection is resolved inside the request flow, never at module
    // scope, and is never stored or logged.
    const connection = deps.getTypesafeConnection ? await deps.getTypesafeConnection() : deps.typesafeConnection;
    if (!connection) throw new Error('missing typesafe gateway connection');
    const typesafe = createTypeSafeAi({
      baseURL: connection.baseURL,
      apiKey: connection.token,
      headers: connection.headers,
    });
    const result = await evaluate({
      model: typesafe.evaluationModel(request.model),
      maxRetries: 0, // billed requests are never replayed automatically
      state: request.state,
      questions: request.questions,
      ...(request.signal ? { abortSignal: request.signal } : {}),
    });
    const confidence = (result.providerMetadata && result.providerMetadata.typesafe && result.providerMetadata.typesafe.confidence) || null;
    return {
      output: { answers: result.answers || null, confidence },
      usage: extractUsage(result.usage),
      resolved_model: extractResolvedModel(result),
    };
  }

  // InvokeLLM returns text only: it documents no resolved model id and accepts no
  // cancellation signal, so both stay unavailable for this provider.
  const output = await deps.base44.asServiceRole.integrations.Core.InvokeLLM({
    prompt: request.prompt,
    model: request.model,
    response_json_schema: request.response_json_schema,
  });
  return { output, usage: null, resolved_model: null };
}

// The one entry point. Validation, the budget reservation and the caps all run
// before any dispatch, so an invalid provider, an invalid model or an exhausted
// slot costs nothing and a call budget is never exceeded.
export async function callModel(request, deps = {}) {
  const provider = String(request.provider || '');
  const model = String(request.model || '');
  const base = { provider, requested_model: model };

  if (!PROVIDERS.includes(provider)) {
    return envelope({ ...base, error: { category: 'invalid_provider', summary: `provider "${provider}" is not supported` } });
  }
  const allowed = PROVIDER_MODELS[provider] || [];
  if (!allowed.includes(model)) {
    return envelope({ ...base, error: { category: 'invalid_model', summary: `model "${model}" is not available on provider "${provider}"` } });
  }

  const cap = Number(request.call_cap);
  const used = Number(request.calls_already_made) || 0;
  if (Number.isFinite(cap) && used >= cap) {
    return envelope({ ...base, error: { category: 'call_cap', summary: `call cap of ${cap} reached for provider "${provider}"` } });
  }

  // Named call slot and its reservation: consumed server-side before the
  // transport runs, so a second attempt on the same slot never dispatches.
  const slot = String(request.call_slot || '');
  if (typeof deps.reserve === 'function') {
    if (!CALL_SLOTS.includes(slot)) {
      return envelope({ ...base, error: { category: 'slot_required', summary: `a call slot of ${CALL_SLOTS.join(' or ')} is required before a provider call` } });
    }
    const reservation = await deps.reserve({ ...request, slot, provider, model, requested_model: model });
    if (!reservation || reservation.ok !== true) {
      return envelope({
        ...base,
        error: {
          category: 'call_budget_exhausted',
          summary: (reservation && reservation.summary) || `the server-side call budget for slot "${slot}" was already consumed`,
        },
      });
    }
  }

  const timeoutMs = Number(request.timeout_ms) || 60000;
  const controller = typeof AbortController === 'function' ? new AbortController() : null;
  const startedAt = Date.now();
  const transport = deps.transport || ((req) => liveTransport(req, deps));

  try {
    const raw = await withTimeout(transport({ ...request, call_slot: slot, signal: controller ? controller.signal : null }), timeoutMs, controller);
    return envelope({
      ...base,
      ok: true,
      output: raw.output ?? null,
      resolved_model: raw.resolved_model ?? null,
      usage: raw.usage ?? null,
      usage_available: Boolean(raw.usage),
      latency_ms: Date.now() - startedAt,
      dispatches: 1,
    });
  } catch (error) {
    const summary = sanitizeMessage(error);
    const category = categorizeError(summary);
    return envelope({
      ...base,
      latency_ms: Date.now() - startedAt,
      dispatches: 1,
      timed_out: category === 'timeout',
      error: { category, summary },
    });
  }
}
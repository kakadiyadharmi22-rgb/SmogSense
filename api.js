/**
 * Network layer: Open-Meteo (air quality + geocoding, free, no key, CORS
 * enabled) and the Gemini API. `fetchImpl` and `storage` are injectable so
 * this module is testable without a network.
 *
 * Exposed as the global `SmogApi`.
 */
(function (root) {
  'use strict';

  const GEOCODE_URL = 'https://geocoding-api.open-meteo.com/v1/search';
  const AIR_URL = 'https://air-quality-api.open-meteo.com/v1/air-quality';
  const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models';
  const DEFAULT_MODEL = 'gemini-2.5-flash';

  class ApiError extends Error {
    constructor(message, kind) {
      super(message);
      this.name = 'ApiError';
      this.kind = kind || 'network';
    }
  }

  /** TTL cache backed by memory, mirrored to sessionStorage when available. */
  function createCache(storage, ttlMs, now) {
    const memory = new Map();
    const clock = now || Date.now;
    return {
      get(key) {
        let entry = memory.get(key);
        if (!entry && storage) {
          try {
            entry = JSON.parse(storage.getItem(`smog:${key}`) || 'null');
          } catch {
            entry = null;
          }
        }
        if (!entry || entry.expires <= clock()) return undefined;
        memory.set(key, entry);
        return entry.value;
      },
      set(key, value) {
        const entry = { value, expires: clock() + ttlMs };
        memory.set(key, entry);
        if (storage) {
          try {
            storage.setItem(`smog:${key}`, JSON.stringify(entry));
          } catch { /* quota or privacy mode — memory cache still works */ }
        }
      },
    };
  }

  function withTimeout(ms) {
    return typeof AbortSignal !== 'undefined' && AbortSignal.timeout ? AbortSignal.timeout(ms) : undefined;
  }

  function createApi(options) {
    const opts = options || {};
    const fetchImpl = opts.fetchImpl || root.fetch.bind(root);
    const core = opts.core || root.SmogCore;
    const cache = createCache(opts.storage, opts.cacheTtlMs || 10 * 60 * 1000, opts.now);
    const timeoutMs = opts.timeoutMs || 10000;

    async function getJson(url) {
      let res;
      try {
        res = await fetchImpl(url, { signal: withTimeout(timeoutMs) });
      } catch {
        throw new ApiError('Could not reach the air quality service. Check your internet connection.');
      }
      if (!res.ok) throw new ApiError(`Air quality service returned an error (${res.status}).`);
      return res.json();
    }

    async function geocode(city) {
      const name = core.validateCity(city);
      const key = `geo:${name.toLowerCase()}`;
      const cached = cache.get(key);
      if (cached) return cached;

      const params = new URLSearchParams({ name, count: '1', language: 'en', format: 'json' });
      const data = await getJson(`${GEOCODE_URL}?${params}`);
      const hit = data && data.results && data.results[0];
      if (!hit) throw new ApiError(`Could not find a place called "${name}".`, 'not_found');

      const place = {
        name: [hit.name, hit.admin1, hit.country].filter(Boolean).join(', '),
        latitude: hit.latitude,
        longitude: hit.longitude,
      };
      cache.set(key, place);
      return place;
    }

    async function getSnapshot(place) {
      const { latitude, longitude } = core.validateCoordinates(place.latitude, place.longitude);
      // ~1 km grid so nearby lookups share a cache entry.
      const lat = latitude.toFixed(2);
      const lon = longitude.toFixed(2);
      const key = `aq:${lat},${lon}`;
      const location = { name: core.cleanText(place.name, 120) || 'Your location', latitude: Number(lat), longitude: Number(lon) };

      const cachedRaw = cache.get(key);
      if (cachedRaw) return core.buildSnapshot(cachedRaw, location);

      const params = new URLSearchParams({
        latitude: lat,
        longitude: lon,
        current: 'pm2_5,pm10,nitrogen_dioxide,ozone,carbon_monoxide',
        hourly: 'pm2_5,pm10',
        forecast_days: '2',
        timezone: 'auto',
      });
      const raw = await getJson(`${AIR_URL}?${params}`);
      const snapshot = core.buildSnapshot(raw, location); // validates before caching
      cache.set(key, raw);
      return snapshot;
    }

    /**
     * Calls Gemini. The key is sent in a header (never in the URL, so it
     * doesn't end up in logs or browser history).
     */
    async function generate(req) {
      const apiKey = (req.apiKey || '').trim();
      if (!apiKey) throw new ApiError('No Gemini API key.', 'no_key');
      const model = req.model || DEFAULT_MODEL;

      const body = {
        systemInstruction: { parts: [{ text: core.SYSTEM_INSTRUCTION }] },
        contents: req.messages.map((m) => ({ role: m.role, parts: [{ text: m.text }] })),
        generationConfig: {
          temperature: req.temperature === undefined ? 0.6 : req.temperature,
          maxOutputTokens: req.maxOutputTokens || 4096,
          ...(req.schema ? { responseMimeType: 'application/json', responseSchema: req.schema } : {}),
        },
      };

      let res;
      try {
        res = await fetchImpl(`${GEMINI_URL}/${encodeURIComponent(model)}:generateContent`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
          body: JSON.stringify(body),
          signal: withTimeout(opts.geminiTimeoutMs || 30000),
        });
      } catch {
        throw new ApiError('Could not reach Gemini.', 'gemini');
      }
      if (res.status === 400 || res.status === 401 || res.status === 403) {
        throw new ApiError('Gemini rejected the API key. Please check it.', 'bad_key');
      }
      if (res.status === 429) throw new ApiError('Gemini rate limit reached. Try again in a minute.', 'gemini');
      if (!res.ok) throw new ApiError(`Gemini returned an error (${res.status}).`, 'gemini');

      const data = await res.json();
      const parts = data && data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts;
      const text = (parts || []).map((p) => p.text || '').join('').trim();
      if (!text) throw new ApiError('Gemini returned an empty response.', 'gemini');
      if (!req.schema) return text;
      try {
        return JSON.parse(text);
      } catch {
        throw new ApiError('Gemini returned malformed JSON.', 'gemini');
      }
    }

    /** Gemini plan with automatic rules fallback. */
    async function createPlan(snapshot, profile, ai) {
      const impact = core.commuteImpact(profile.commute, profile.commuteKm);
      let warning = null;
      if (ai && ai.apiKey) {
        try {
          const raw = await generate({
            apiKey: ai.apiKey,
            model: ai.model,
            messages: [{ role: 'user', text: core.buildPlanPrompt(snapshot, profile, impact) }],
            schema: core.PLAN_SCHEMA,
          });
          const plan = core.normalizePlan(raw);
          if (plan) return { plan, impact, source: 'gemini', model: ai.model || DEFAULT_MODEL };
          warning = 'The AI response was incomplete, so we used built-in rules.';
        } catch (error) {
          warning = `${error.message} Showing a plan from built-in rules instead.`;
        }
      }
      return { plan: core.buildFallbackPlan(snapshot, profile, impact), impact, source: 'rules', warning };
    }

    async function ask(snapshot, profile, question, history, ai) {
      const impact = core.commuteImpact(profile.commute, profile.commuteKm);
      const safeHistory = (history || [])
        .filter((m) => m && (m.role === 'user' || m.role === 'model'))
        .slice(-6)
        .map((m) => ({ role: m.role, text: core.cleanText(m.text, 1500) }));
      return generate({
        apiKey: ai.apiKey,
        model: ai.model,
        messages: [...safeHistory, { role: 'user', text: core.buildChatPrompt(snapshot, profile, impact, question) }],
        temperature: 0.5,
        maxOutputTokens: 2048,
      });
    }

    return { geocode, getSnapshot, generate, createPlan, ask };
  }

  root.SmogApi = Object.freeze({ createApi, createCache, ApiError, DEFAULT_MODEL });
})(typeof globalThis !== 'undefined' ? globalThis : window);

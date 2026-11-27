/**
 * SmogSense UI. Vanilla JS; dynamic text is always inserted with
 * textContent (never innerHTML) to prevent XSS from API or model output.
 */
(function () {
  'use strict';

  const core = window.SmogCore;
  const $ = (id) => document.getElementById(id);
  const PROFILE_KEY = 'smogsense.profile.v1';
  const API_KEY_KEY = 'smogsense.geminiKey';
  const LEVEL_COLORS = ['#2e7d32', '#9ccc65', '#fdd835', '#ef6c00', '#c62828', '#6a1b4d'];
  const MODE_LABELS = {
    car: 'Car', two_wheeler: 'Two-wheeler', auto_rickshaw: 'Auto-rickshaw', bus: 'Bus',
    metro: 'Metro', cycle: 'Cycle', walk: 'Walk', work_from_home: 'Work from home',
  };

  const safeStorage = (name) => {
    try {
      const s = window[name];
      s.setItem('smog:probe', '1');
      s.removeItem('smog:probe');
      return s;
    } catch {
      return null;
    }
  };
  const local = safeStorage('localStorage');
  const session = safeStorage('sessionStorage');
  const api = window.SmogApi.createApi({ storage: session });

  const state = { snapshot: null, profile: null, ai: null, history: [], coords: null, busy: false };

  // ---------- helpers ----------

  function el(tag, props, ...children) {
    const node = Object.assign(document.createElement(tag), props || {});
    for (const child of children) {
      if (child === null || child === undefined || child === '') continue;
      node.append(child instanceof Node ? child : document.createTextNode(String(child)));
    }
    return node;
  }

  const levelFor = (aqi) => core.categorize(aqi).level;
  const hhmm = (iso) => iso.slice(11, 16);

  function setStatus(message, loading) {
    const status = $('status');
    status.textContent = message;
    status.classList.toggle('loading', Boolean(loading));
  }

  function showError(message) {
    const box = $('form-error');
    box.textContent = message;
    box.hidden = !message;
  }

  // ---------- persistence (per-browser conveniences only) ----------

  function readProfile() {
    const form = $('plan-form');
    return core.validateProfile({
      adults: Number(form.adults.value),
      children: Number(form.children.value),
      elderly: Number(form.elderly.value),
      health: Array.from(form.querySelectorAll('input[name="health"]:checked'), (c) => c.value),
      commute: form.commute.value,
      commuteKm: Number(form.commuteKm.value),
      hasPurifier: form.hasPurifier.checked,
      language: form.language.value,
      notes: form.notes.value,
    });
  }

  function readAi() {
    const key = $('api-key').value.trim();
    const model = core.cleanText($('model').value, 60).replace(/[^\w.-]/g, '') || window.SmogApi.DEFAULT_MODEL;
    if (!key) return null;
    if (!core.isPlausibleApiKey(key)) throw new core.ValidationError('That does not look like a Gemini API key (it should start with "AIza").');
    return { apiKey: key, model };
  }

  function saveKey(key) {
    const remember = $('remember-key').checked;
    try {
      if (remember && local) local.setItem(API_KEY_KEY, key);
      else if (local) local.removeItem(API_KEY_KEY);
      if (session) session.setItem(API_KEY_KEY, key);
    } catch { /* ignore */ }
  }

  function saveProfile(profile, city) {
    if (!local) return;
    try {
      local.setItem(PROFILE_KEY, JSON.stringify({ ...profile, city }));
    } catch { /* ignore */ }
  }

  function restore() {
    const form = $('plan-form');
    let saved = null;
    try {
      saved = local && JSON.parse(local.getItem(PROFILE_KEY) || 'null');
    } catch {
      saved = null;
    }
    if (saved) {
      ['adults', 'children', 'elderly', 'commute', 'commuteKm', 'language', 'notes', 'city'].forEach((k) => {
        if (saved[k] !== undefined && form[k]) form[k].value = saved[k];
      });
      form.hasPurifier.checked = Boolean(saved.hasPurifier);
      form.querySelectorAll('input[name="health"]').forEach((box) => {
        box.checked = Array.isArray(saved.health) && saved.health.includes(box.value);
      });
    }
    try {
      const rememberedKey = local && local.getItem(API_KEY_KEY);
      const sessionKey = session && session.getItem(API_KEY_KEY);
      $('api-key').value = rememberedKey || sessionKey || '';
      $('remember-key').checked = Boolean(rememberedKey);
    } catch { /* ignore */ }
  }

  // ---------- rendering ----------

  function renderAir(snapshot) {
    const { current, location, forecast, cleanestWindow } = snapshot;
    $('aqi-location').textContent = `${location.name} · updated ${hhmm(current.time)}`;
    $('aqi-number').textContent = current.aqi;
    const badge = $('aqi-badge');
    badge.textContent = current.category;
    badge.className = `badge lvl-${current.level}`;
    $('data-source').textContent = snapshot.source;

    const p = current.pollutants;
    const items = [
      ['PM2.5', p.pm2_5], ['PM10', p.pm10], ['NO₂', p.nitrogen_dioxide], ['O₃', p.ozone], ['CO', p.carbon_monoxide],
    ];
    $('pollutants').replaceChildren(
      ...items.filter((i) => i[1] !== null).map(([name, v]) => el('div', {}, el('dt', {}, name), el('dd', {}, `${v} µg/m³`))),
    );

    const chart = $('forecast-chart');
    const max = Math.max(100, ...forecast.map((h) => h.aqi || 0));
    chart.replaceChildren(
      ...forecast.map((h) => {
        const bar = el('div', { className: 'bar', title: `${hhmm(h.time)} — NAQI ${h.aqi === null ? 'n/a' : h.aqi}` });
        bar.style.height = `${Math.max(3, ((h.aqi || 0) / max) * 100)}%`;
        bar.style.background = LEVEL_COLORS[levelFor(h.aqi || 0)];
        if (cleanestWindow && h.time >= cleanestWindow.start && h.time <= cleanestWindow.end) bar.classList.add('best');
        return bar;
      }),
    );
    const values = forecast.filter((h) => h.aqi !== null).map((h) => h.aqi);
    chart.setAttribute('aria-label', `Hourly NAQI forecast for the next ${forecast.length} hours, from ${Math.min(...values)} to ${Math.max(...values)}.`);

    const old = chart.nextElementSibling;
    if (old && old.classList.contains('forecast-labels')) old.remove();
    const labels = el('div', { className: 'forecast-labels' });
    labels.setAttribute('aria-hidden', 'true');
    forecast.forEach((h, i) => labels.append(el('span', {}, i % 4 === 0 ? hhmm(h.time) : '')));
    chart.after(labels);

    $('cleanest').textContent = cleanestWindow
      ? `Cleanest 2-hour window: ${core.windowLabel(cleanestWindow)} (avg NAQI ${cleanestWindow.avgAqi}).`
      : 'No clearly cleaner window in the next 24 hours. Keep outdoor time short.';
  }

  function renderPlan(result) {
    const { plan, source, model, impact, warning } = result;
    $('plan-source').textContent = source === 'gemini' ? `AI · ${model}` : 'Built-in rules';
    $('plan-warning').textContent = warning || '';
    $('plan-warning').hidden = !warning;
    $('plan-headline').textContent = plan.headline;
    $('risk-summary').textContent = plan.riskSummary;

    $('schedule').replaceChildren(
      ...plan.schedule.map((s) => el('li', {}, el('span', { className: 'time' }, s.time), s.activity, el('p', { className: 'why' }, s.why))),
    );
    $('care-block').hidden = plan.vulnerableCare.length === 0;
    $('vulnerable').replaceChildren(...plan.vulnerableCare.map((v) => el('li', {}, v)));
    $('mask').textContent = plan.maskAdvice;
    $('hacks').replaceChildren(
      ...plan.indoorHacks.map((h) => el('li', {}, el('strong', {}, h.title), h.detail, el('p', { className: 'impact' }, h.impact))),
    );
    renderImpact(impact);
    $('actions').replaceChildren(
      ...plan.lowEmissionActions.map((a) => el('li', {}, el('strong', {}, a.action), ' — ', a.impact)),
    );
  }

  function renderImpact(impact) {
    const { current, alternatives } = impact;
    const label = MODE_LABELS[current.mode].toLowerCase();
    if (current.dailyKgCo2 === 0) {
      $('commute-summary').textContent = current.roundTripKm === 0
        ? 'No commute today, so no commute emissions. Nice.'
        : `Your ${label} commute (${current.roundTripKm} km round trip) is already zero-emission.`;
      $('alternatives').replaceChildren();
      return;
    }
    $('commute-summary').textContent = `Your ${label} commute (${current.roundTripKm} km round trip) emits about ${current.dailyKgCo2} kg CO₂ per day.`;
    const rows = [{ mode: current.mode, dailyKgCo2: current.dailyKgCo2, label: 'You today' }].concat(alternatives);
    $('alternatives').replaceChildren(
      ...rows.map((r) => {
        const fill = el('div', { className: 'bar-fill' });
        fill.style.width = `${Math.max(2, (r.dailyKgCo2 / current.dailyKgCo2) * 100)}%`;
        return el('li', {},
          el('span', {}, r.label || MODE_LABELS[r.mode]),
          el('div', { className: 'bar-track' }, fill),
          el('span', {}, r.savedKgPerMonth ? `saves ${r.savedKgPerMonth} kg/mo` : `${r.dailyKgCo2} kg/day`));
      }),
    );
  }

  function addChat(role, text) {
    $('chat-log').append(el('li', { className: role }, text));
    state.history.push({ role, text });
    state.history = state.history.slice(-6);
  }

  // ---------- actions ----------

  async function buildPlan(location) {
    if (state.busy) return;
    showError('');
    let profile;
    let ai;
    try {
      profile = readProfile();
      ai = readAi();
    } catch (error) {
      showError(error.message);
      return;
    }

    state.busy = true;
    $('submit-btn').disabled = true;
    setStatus('Checking live air quality…', true);
    try {
      const place = location.city ? await api.geocode(location.city) : location;
      const snapshot = await api.getSnapshot(place);
      setStatus(ai ? 'Asking Gemini for your personalised plan…' : 'Building your plan…', true);
      const result = await api.createPlan(snapshot, profile, ai);

      state.snapshot = snapshot;
      state.profile = profile;
      state.ai = ai;
      state.history = [];
      $('chat-log').replaceChildren();
      saveProfile(profile, location.city || '');
      if (ai) saveKey(ai.apiKey);

      renderAir(snapshot);
      renderPlan(result);
      $('chat-locked').hidden = Boolean(ai);
      $('chat-form').hidden = !ai;
      $('chat-suggestions').hidden = !ai;
      $('empty-state').hidden = true;
      $('output').hidden = false;
      setStatus(`Plan ready for ${snapshot.location.name}. Air quality is ${snapshot.current.category}.`);
      $('results').focus();
    } catch (error) {
      setStatus('');
      showError(error.message);
    } finally {
      state.busy = false;
      $('submit-btn').disabled = false;
    }
  }

  function onSubmit(event) {
    event.preventDefault();
    const city = $('city').value.trim();
    if (!city && !state.coords) {
      showError('Enter a city or use your location.');
      $('city').focus();
      return;
    }
    buildPlan(city ? { city } : state.coords);
  }

  function onLocate() {
    if (!navigator.geolocation) {
      showError('Location is not available in this browser. Please type your city.');
      return;
    }
    setStatus('Finding your location…', true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        state.coords = { latitude: pos.coords.latitude, longitude: pos.coords.longitude, name: 'Your location' };
        $('city').value = '';
        buildPlan(state.coords);
      },
      () => {
        setStatus('');
        showError('Could not get your location. Please type your city instead.');
      },
      { timeout: 10000, maximumAge: 600000 },
    );
  }

  async function onAsk(event) {
    event.preventDefault();
    const input = $('question');
    const question = core.cleanText(input.value, 500);
    if (question.length < 3 || !state.snapshot || !state.ai || state.busy) return;

    const history = state.history.slice();
    addChat('user', question);
    input.value = '';
    input.disabled = true;
    state.busy = true;
    const pending = el('li', { className: 'model' }, 'Thinking…');
    $('chat-log').append(pending);
    try {
      const answer = await api.ask(state.snapshot, state.profile, question, history, state.ai);
      pending.remove();
      addChat('model', core.cleanText(answer, 3000));
    } catch (error) {
      pending.textContent = error.message;
    } finally {
      state.busy = false;
      input.disabled = false;
      input.focus();
    }
  }

  // ---------- wire up ----------

  restore();
  $('plan-form').addEventListener('submit', onSubmit);
  $('locate-btn').addEventListener('click', onLocate);
  $('chat-form').addEventListener('submit', onAsk);
  $('city').addEventListener('input', () => { state.coords = null; });
  $('remember-key').addEventListener('change', (e) => {
    if (!e.target.checked && local) {
      try { local.removeItem(API_KEY_KEY); } catch { /* ignore */ }
    }
  });
  document.querySelectorAll('[data-city]').forEach((chip) => {
    chip.addEventListener('click', () => {
      $('city').value = chip.dataset.city;
      state.coords = null;
      buildPlan({ city: chip.dataset.city });
    });
  });
  document.querySelectorAll('[data-q]').forEach((chip) => {
    chip.addEventListener('click', () => {
      $('question').value = chip.dataset.q;
      $('chat-form').requestSubmit();
    });
  });
})();

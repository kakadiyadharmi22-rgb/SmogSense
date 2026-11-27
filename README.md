# SmogSense — Urban Air Quality Assistant

> A Gemini-powered assistant that helps Indian families get through severe winter smog with **low-exposure, low-emission daily routines**, **indoor air quality hacks** and **clear impact explanations**.

Built for **PromptWars: Virtual — Main Challenge 06** (Build with AI, Google for Developers × Hack2skill).

**No installation, no build step, no server.** It's pure HTML, CSS and JavaScript. Open `index.html` in a browser, or host it free on GitHub Pages.

---

## The problem

Every winter, cities across North and West India sit in "Very Poor" to "Severe" air for weeks. Families get a scary AQI number but no plan: *Can my child walk to school? When should I open the windows? Does switching to the metro actually matter?*

## What SmogSense does

1. **Live Indian AQI** for any city or your current location. It computes the official **CPCB National AQI (NAQI)** from PM2.5 and PM10, with the six NAQI categories, using Open-Meteo / Copernicus CAMS data.
2. **24-hour forecast + cleanest window**: finds the lowest-pollution 2-hour daytime slot for errands, play or airing out the home.
3. **Personalised day plan (Gemini)**: a time-ordered schedule tailored to who's at home (children, elderly, asthma, heart conditions, pregnancy), the family's commute, and whether they own a purifier. Every step explains *why*.
4. **Indoor air hacks**: cheap actions first (wet-mopping, sealing gaps, a DIY box-fan filter), each with its expected impact.
5. **Emissions impact**: compares your commute's CO₂ with metro, bus, cycling and WFH, as kg/day and kg/month saved.
6. **Follow-up chat**: ask "Is 4 pm okay for the park?" and Gemini answers using your live data and profile.
7. **English, Hindi and Gujarati** plans.
8. **Works without AI too**: with no API key, or if Gemini fails, a built-in rules engine still produces a sensible plan.

## Project structure

```
index.html          UI (semantic, accessible markup)
css/styles.css      styles (light + dark, responsive)
js/core.js          pure logic: NAQI, validation, CO₂ impact, prompts, fallback plan
js/api.js           Open-Meteo + Gemini calls, caching, AI→rules fallback
js/app.js           UI wiring and rendering
tests/index.html    open in a browser to run the test suite
tests/tests.js      33 tests (AQI maths, validation, prompts, API with stubbed network)
```

### How GenAI is used

- **Grounded prompting**: Gemini only sees *computed* facts (NAQI, pollutants, 3-hourly forecast, cleanest window, commute CO₂) plus the household profile, and is told never to invent readings.
- **Structured output**: the plan uses Gemini's `responseSchema` (JSON mode), so the UI renders reliable sections. Output is validated and normalised before display.
- **Safety rules in the system instruction**: no diagnosis, N95 (not cloth) masks, and urgent-care warning signs.
- **Prompt-injection resistance**: free-text notes and questions are fenced and labelled as data. Chat history is filtered to `user`/`model` roles.

## Quality checklist

| Area | What we did |
|---|---|
| **Code quality** | Pure logic separated from network and UI; dependency injection; JSDoc; zero third-party libraries |
| **Security** | Content-Security-Policy restricts scripts to the app and network calls to three known APIs; all input validated against allow-lists; dynamic text inserted with `textContent` only (no `innerHTML`, so no XSS); API key sent in a header (never in the URL), never committed, stored only in this browser (session by default, opt-in "remember") |
| **Efficiency** | 10-minute cache keyed to a ~1 km grid; double-submit guard; no frameworks (~40 KB total) |
| **Testing** | 33 tests across unit, prompt and API layers with a stubbed network. Run them by opening `tests/index.html`; CI runs the same tests on every push |
| **Accessibility** | Landmarks, skip link, labelled fieldsets, `aria-live` status and chat, focus management, ≥44 px touch targets, visible focus, dark mode, reduced motion, text alternative for the chart |

## Run it

**Option A: just open it.** Double-click `index.html`. It works straight from your disk.

**Option B: host it free on GitHub Pages** (recommended for submission):

1. Create a new **public** repository on GitHub and upload all files (drag and drop works in the GitHub website).
2. Go to **Settings → Pages**.
3. Under *Build and deployment*, choose **Deploy from a branch**, select `main` and `/ (root)`, then **Save**.
4. After about a minute your app is live at `https://<your-username>.github.io/<repo-name>/`.

### Gemini API key

Get a free key at [Google AI Studio](https://aistudio.google.com/apikey) and paste it into the **AI assistant** section of the form. For safety, in Google Cloud Console → *APIs & Services → Credentials*, restrict the key to:
- **Application restriction:** Websites → `https://<your-username>.github.io/*`
- **API restriction:** Generative Language API

Then even if someone sees the key, it won't work from other sites.

## Run the tests

Open `tests/index.html` in any browser. You should see **"All 33 tests passed"**.

## Data & limitations

- Air quality comes from model data (CAMS via Open-Meteo), not ground monitors. NAQI is officially a 24-hour average, so SmogSense shows an hourly *now-cast* estimate and labels it as one.
- CO₂ factors are indicative per-passenger averages for Indian cities.
- SmogSense gives general guidance, **not medical advice**.

## License

MIT

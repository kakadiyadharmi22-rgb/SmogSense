# Submission kit

## One-line description
SmogSense turns live Indian AQI data into a personalised, Gemini-generated day plan that cuts a family's smog exposure and emissions, and explains why each step matters.

## Project description (for the form)
SmogSense is a GenAI air-quality assistant for families in smog-hit Indian cities. It fetches live PM2.5/PM10 data, computes the official CPCB National AQI and finds the cleanest 2-hour window in the next 24 hours. Gemini then generates a structured, personalised plan: a time-ordered low-exposure schedule, indoor air hacks, low-emission actions with CO₂ savings, and extra precautions for children, elderly members or people with asthma. Families can ask follow-up questions in English or Hindi. The prompts are grounded in computed data, use JSON-schema output, fence user text against prompt injection, and fall back to a rules engine if the model is unavailable.

## Prompt structure
1. **System instruction**: role, three ordered goals (protect health, cut emissions, explain impact), safety rules and an anti-injection rule.
2. **Context block**: computed NAQI, pollutants, 3-hourly forecast, cleanest window, household profile and commute CO₂ comparison.
3. **Task**: generate a plan matching the `responseSchema` in the chosen language (English, Hindi or Gujarati), with a word limit per field.

## LinkedIn post (draft — edit to your own voice)
Winter smog is back, and an AQI number alone doesn't tell a family what to *do*.

For #PromptWars Virtual Challenge 06, I built **SmogSense**, a Gemini-powered assistant that:
🌫️ computes live Indian NAQI for your city
🕑 finds the cleanest 2-hour window of the day
👨‍👩‍👧 builds a personalised low-exposure, low-emission day plan for your household
🏠 suggests cheap indoor air hacks
🚇 shows how much CO₂ switching your commute saves

Built with Google Antigravity + Gemini, hosted on GitHub Pages.

🔗 Live: <your GitHub Pages URL>
💻 Code: <your GitHub URL>

@Google for Developers @Hack2skill #BuildWithAI #GoogleAntigravity #Gemini

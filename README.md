# Lingua: evidence-based language learning

> **Status: alpha (0.1.0-alpha.1).** Everything described below works, but expect rough edges and changes to the progress format. Export a backup from Settings before updating.

A local-first web app for learning a language, built on what the research says works: spaced retrieval with feedback, frequency-ordered vocabulary, short explicit grammar with prompt-first correction, graded reading at the right level, and speaking and writing practice with explicit feedback. It ships with an Italian pack (A1 to A2) and is designed so that other languages can be added as data.

There is no backend. Progress lives in your browser's `localStorage`. The only network call is the optional Claude tutor.

## Run it

Requires Node 18 or later.

```bash
npm install
npm run dev
```

Then open the URL Vite prints (usually http://localhost:5173).

### Windows installer

Download `Lingua-Setup-<version>.exe` from [Releases](https://github.com/davidwin44/lingua/releases) and run it.

- It installs for your Windows account only, so no admin rights are needed. The app goes in `%LOCALAPPDATA%\Programs\Lingua`, with Start menu and desktop shortcuts.
- Lingua opens in its own Microsoft Edge app window. Edge comes with Windows 10 and 11, and it's used because it supports speech recognition for pronunciation practice. The app is served from inside `Lingua.exe` on `127.0.0.1:47823`, so it works offline. It uses a dedicated Edge profile in `%LOCALAPPDATA%\Lingua`, so progress persists and stays separate from normal browsing.
- To uninstall, go to Windows **Settings → Apps → Installed apps → Lingua**. You'll be asked whether to keep your progress.
- The file isn't code-signed yet, so Windows SmartScreen may say it "protected your PC". Choose **More info → Run anyway**.
- Scripted installs are supported: `Lingua-Setup-<version>.exe --silent`. To remove everything silently, run `Lingua.exe --uninstall --silent --purge`.

To build the installer yourself you need Rust (MSVC toolchain) and the Windows SDK. Run `npm run installer` and the output appears in `release/`.

### Install it from the browser instead

Lingua installs from Edge or Chrome into its own window, with a Start menu and taskbar icon. Once installed it works offline.

1. Run `npm run app`. This builds the app and serves it at http://localhost:4173.
2. Open that address in **Edge or Chrome** and choose **Settings → Desktop app → Install Lingua**, or use the install icon at the right of the address bar.
3. Launch Lingua from the Start menu from then on. The server only needs to run again when you want to pick up a new build.

Progress is stored per address. The installed app (port 4173) doesn't see progress made in the dev server (port 5173). Use **Settings → Your data** to export from one and import into the other.

The installed app keeps every feature, including pronunciation checking, because it runs on the browser's engine. An Electron build would lose speech recognition.

| Script | What it does |
|---|---|
| `npm run app` | Build, then serve the production app on port 4173 (for installing) |
| `npm run installer` | Build the Windows installer into `release/` (needs Rust) |
| `npm run dev` | Start the dev server |
| `npm run build` | Typecheck (`tsc --noEmit`), then build to `dist/` |
| `npm run preview` | Serve the production build |
| `npm test` | Run the Vitest suite once |
| `npm run typecheck` | TypeScript only (app and build config) |
| `npm run lint` | ESLint (TypeScript and react-hooks rules) |

## What's inside, and why

Each feature traces to a specific finding. The principles also appear as comments in the code.

| Feature | Research principle (one line) |
|---|---|
| **Typed recall with the answer always shown** (`lib/grading.ts`, `components/Card.tsx`) | Retrieval beats restudy (g = 0.50), and feedback nearly doubles the effect (0.73 vs 0.39). Cued recall beats recognition. |
| **FSRS-6 scheduler, implemented from scratch** (`lib/fsrs.ts`) | Spacing across days beats massing by about 10 points of recall, and learners misjudge this, so the app enforces the schedule. |
| **1 min and 10 min learning steps, and a daily new-card cap** (`lib/scheduler.ts`) | One correct retrieval is the most time-efficient per item, and sleep consolidates new words (g = 0.50). Learn it once, then sleep on it. |
| **New words strictly in frequency order** (`content/lexicon.ts`) | The top 1,000 words cover about 80% of running text. |
| **Recognition first; production unlocks after graduation** (`lib/scheduler.ts`) | L2→L1 retrieval suits beginners and L1→L2 suits more advanced learners. |
| **Grammar mini-lessons with prompt, then narrower prompt, then reveal** (`components/PromptedDrill.tsx`) | Explicit form-focused instruction helps adults (g = 1.06), and prompts beat recasts. |
| **Interleaved "Mixed practice" for confusable grammar only** (`lib/interleave.ts`) | Interleaving helps discrimination (g = 0.42) but hurts word lists (g = −0.39), so vocabulary is never interleaved. Due vocabulary is only shuffled. |
| **Graded passages sorted by known-word coverage, with tap-to-gloss and questions** (`lib/coverage.ts`, `pages/Passage.tsx`) | Extensive reading works best at about 95% known words and with accountability (d = 0.38–0.50). |
| **Sentence production with the same hint-first feedback** (`pages/Produce.tsx`) | Output with explicit feedback is the weakest area of current apps. |
| **Structured Claude role-play, tu/Lei scenarios, self-correction first** (`lib/claude.ts`, `pages/Tutor.tsx`) | LLM tools that generate feedback outperform chat partners (g = 1.71), and pragmatics such as tu/vous is a documented gap. |
| **Speech-recognition pronunciation with lenient thresholds, never touching SRS grades** (`lib/speech.ts`) | ASR training gives g = 0.69, with explicit feedback 0.86 and individual sounds 0.82. ASR errors are higher on accented speech. |
| **Weekly goal ring, active-weeks count, welcome-back catch-up, backlog cap** (`pages/Dashboard.tsx`) | Highlighting broken streaks cut persistence from 66% to 58%. Learners cycle through lapses, so the design absorbs them. |
| **Dashboard of real learning: words known, coverage, measured vs target retention, can-dos** | Engagement metrics aren't learning metrics. Show learners that spacing is working. |

### FSRS-6 details

- Default weights `w0..w20`. `DECAY = -w20`, `FACTOR = 0.9^(1/DECAY) - 1`, `R(t,S) = (1 + FACTOR·t/S)^DECAY`.
- Interval `I = S/FACTOR · (r^(1/DECAY) - 1)`, rounded and clamped to `[1, 36500]`. Fuzz applies only to intervals of 2.5 days or more, with an injectable RNG.
- Short-term (same-day) stability for learning steps. Relearning step: 10 min.
- Every review is logged as `{cardId, timestamp, grade, elapsedDays, stateBefore, S, D, R}`, so the weights could be optimised later.
- Settings: target retention from 0.80 to 0.95. The interval multiplier is shown (0.80 → 3.32×, 0.85 → 1.91×, 0.90 → 1.00×, 0.95 → 0.40×) with a workload note. New cards per day range from 0 to 30 (default 10). Max reviews per day defaults to 150, and overflow rolls over to later days.

### Auto-grading

Answers are normalised for case, whitespace and punctuation, and listed alternatives are accepted.

| Answer | Suggested grade |
|---|---|
| Exact match | **Good** |
| Accents wrong, or one typo in a word of 4+ letters | **Hard**, and the exact spelling is shown |
| Anything else | **Again** |

Press Enter to accept the suggested grade, or 1–4 to choose (Easy is always the learner's call). English answers ignore "to", articles and notes in brackets. Grammar drills use strict matching, because *andato* and *andata* differ by exactly the letter being taught.

## Browser support

- **Text-to-speech** uses `speechSynthesis`, which is available in all modern browsers. The app picks an Italian voice if one is installed; you can choose a voice and speed in Settings. Where TTS is missing, the audio buttons are hidden.
- **Pronunciation checking** uses `SpeechRecognition` / `webkitSpeechRecognition`. It works in **Chrome and Edge** (desktop and Android), and in Chrome it sends audio to Google's speech service. Firefox and most iOS browsers don't support it; the app says so and the rest keeps working. Pronunciation results never change review grades.
- **Layout** works from 360px wide to desktop, in light and dark mode (`prefers-color-scheme`).

## The Claude tutor (optional)

1. Get an API key from the Anthropic Console.
2. Paste it into **Settings → Claude tutor**. The model ID is prefilled (`claude-opus-5`) and editable.
3. Open **Speak → Role-play tutor** and pick a scenario.

The key is stored only in this browser's `localStorage` and is sent only to `https://api.anthropic.com/v1/messages`. The request uses the `anthropic-dangerous-direct-browser-access` header, because it comes straight from the browser. Anyone with access to this browser profile could read the key, so use a key you can revoke. Without a key, the rest of the app is fully functional, and sentence building offers the same hint-first feedback offline.

Each learner turn gets a reply of 1–3 sentences and at most two corrections, returned as JSON (`reply`, `reply_en`, `errors[]`). Each correction appears first as a prompt so you can fix it yourself, then the correction and explanation are revealed. Corrected phrases can be saved to your deck. 401, 429, overload and network errors are shown as friendly messages.

## Your data

- Stored under the versioned key `lingua:v1`. Every access is wrapped in try/catch, and corrupted data falls back to a fresh start.
- **Settings → Your data** exports all progress as JSON and imports it again, for backups or moving devices.

## Adding a language

1. Copy `src/content/it/` to `src/content/<code>/` and replace the data:

   | File | Contents |
   |---|---|
   | `meta.json` | Code, name, TTS and speech-recognition locale, accent keys, person labels, Zipf list size |
   | `vocab.json` | About 150 words, ranks 1..N with no gaps; nouns need gender and article |
   | `verbs.json` | Present and imperfect tables keyed by the `persons` in `meta.json` |
   | `grammar/*.json` | One lesson per file, with 8–12 drills of exactly 2 hints each |
   | `interleave.json` | Sets of drill ids spanning at least 2 categories |
   | `passages/*.json` | Every token needs a gloss entry (lowercased, elision apostrophe kept, e.g. `"l'"`) |
   | `production.json`, `scenarios.json`, `pronunciation.json`, `cando.json` | |

2. Create `src/content/<code>/index.ts` like the Italian one. It exports a `LanguagePack`.
3. Add one line to `src/content/index.ts`:

   ```ts
   export const languages = { it: italianPack, es: spanishPack };
   ```

4. Run `npm test`. The content validator (`src/content/validate.ts`) checks every registered pack. It flags duplicate ids, rank gaps, drills without 2 hints or an answer, interleave sets with unknown ids or fewer than 2 categories, unglossed passage tokens, and out-of-range `answerIndex` values.

Bilingual fields use `{ "l2": "...", "en": "..." }`, so the same types work for any target language.

## Project layout

```
src/
  content/        types.ts, index.ts (registry), validate.ts, lexicon.ts, it/ (Italian pack)
  lib/            fsrs, scheduler, grading, storage, tts, speech, claude, coverage, interleave, progress, dates, text
  state/          AppContext (progress + persistence), hooks
  components/     Card, StudySession, PromptedDrill, AnswerInput, WordPopover, GoalRing, ForecastChart, …
  pages/          Dashboard, Study, Learn, Review, Grammar, GrammarLesson, MixedPractice,
                  Library, Passage, Speak, Produce, Tutor, Pronounce, Settings, Onboarding
  styles/         fonts.css (bundled Literata + IBM Plex Sans), base.css (tokens, light/dark, shell), components.css
pwa/              sw-template.js (service worker; vite.config.ts fills in the file list at build time)
public/           manifest.webmanifest, icons/
desktop/          Rust launcher/installer (embeds dist/, serves it locally, opens an Edge app window)
tests/            fsrs, grading, scheduler, interleave, coverage, content, storage, tutor/speech, components
```

## Honest caveats

- Vocabulary ranks are approximate, compiled from general knowledge of Italian frequency lists. The "everyday text covered" figure is a Zipf-model estimate, not a corpus measurement.
- FSRS predicts recall better than SM-2 on large benchmarks, but no randomized trial has compared learner outcomes between the two. Weight optimisation is out of scope. The review log is kept so it could be added later.
- "Fast" is relative. The US Foreign Service Institute estimates 552–690 intensive class hours for professional Italian. This app aims to waste fewer of your hours, not to skip them.

## Licence

Copyright (c) 2026 davidwin44. All rights reserved. The code and content are publicly visible but not open source. You may not use, copy, modify or distribute any part of it without written permission. See [LICENSE](LICENSE). Third-party fonts and npm packages keep their own licences.

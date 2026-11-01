# ✨ Nebula Plus — Comprehensive Feature Registry

Nebula Plus is a high-performance productivity, intelligence, and media suite for Zen Browser (Firefox Engine).
Every feature can be toggled and configured from **Sine → Nebula Plus settings**.

---

## 🎵 Native Media & Audio Engine
1. **Unified media hub**: Browser tabs and desktop apps (Spotify, Tidal, etc.) unified into one seamless "now playing" state.
2. **Nebula Bridge**: Lightweight Windows C# companion application interfacing with Windows Global System Media Transport Controls (GSMTC).
3. **Live WASAPI Spectrum Analyzer**: 16-band real-time audio FFT spectrum capturing master audio loopback via NAudio with sleep-on-silence logic.
4. **Desktop player card**: Elegant sidebar media card with direct seekable progress bar.
5. **Rotating vinyl sleeve**: Dynamic album art rotates like a vinyl record during playback.
6. **Reactive Ambilight**: Video and album artwork colors spill smoothly around the browser borders, desaturating on pause.
7. **Time-synced lyrics**: Millisecond-accurate synced lyrics powered by LRCLIB with karaoke text fill.
8. **Bidirectional lyrics**: Full RTL support with right-to-left progress fill for Persian and Arabic songs.
9. **Full-Window Lyrics Stage (`Ctrl+Alt+M`)**: Drifting blurred album background, large Meem typography, depth-of-field fading, and jump-to-line seeking.
10. **Global shortcuts**: `Ctrl+Alt+Space` (play/pause), `Ctrl+Alt+←` / `→` (prev/next), `Ctrl+Alt+,` / `.` (jump ±10s).

---

## 🤖 Multimodal AI & Intelligence (Google Gemini)
11. **Contextual Assistant (`Ctrl+Alt+A`)**: Instant 3-line summaries, key takeaways, and question answering grounded in the active page.
12. **Voice Typing (`Ctrl+Alt+J`)**: Accurate Persian & English speech-to-text with auto-punctuation directly into inputs.
13. **Smart Screenshot (`Ctrl+Alt+S`)**: Visual crop tool for instant OCR text extraction, code reading, and AI explanation.
14. **AI Page Remix (`Ctrl+Alt+R`)**: Prompt-driven live CSS restyling with per-domain memory and instant undo.
15. **Semantic Tab Galaxy**: Context-aware tab grouping that analyzes open tabs and clusters them into intuitive task folders.
16. **Ask Bar in URL Bar**: Quick AI query lookup directly from the URL bar by prepending `?`.

---

## 🇮🇷 Persian & Regional Productivity Tools
17. **Jalali (Solar Hijri) Calendar**: Integrated across sidebar clock, new tab dashboard, and to-do scheduler.
18. **Live Toman Currency Lens**: Real-time conversion of USD, EUR, and GBP prices on web pages to Toman via Nobitex API.
19. **Keyboard Mistype Fixer (`Ctrl+Alt+Space`)**: Corrects text typed in the wrong layout (Persian ↔ English) instantly.
20. **Kaizen Spelling Coach (`Ctrl+Alt+Q`)**: Non-intrusive spell checking, auto-fixing common slips, with a spaced-repetition flashcard system.
21. **Meem Typography**: Embedded Persian typeface applied consistently across tabs, URL bar, lyrics, and menus.
22. **Hafez Fortune Divination (فال حافظ)**: Daily poetry and interpretation fetched directly from Ganjoor.
23. **Class Board & Homework Tracker**: Feed parser for Rubika class groups with deadline extraction and evening notifications.
24. **Wormhole (`Ctrl+Alt+P`)**: Instant bridge to send links, highlighted text, and pages to mobile via Rubika Saved Messages.

---

## 🎨 Glassmorphic UI & Visual Architecture
25. **Compositor-accelerated glows**: Light sweeps and comets running entirely on compositor motion paths without triggering layout thrashing.
26. **Smart Force Dark Mode (`Ctrl+Alt+D`)**: Non-destructive dark theme that skips already-dark pages and keeps images/videos color-accurate.
27. **PDF Reader Redesign**: Full-window glass interface, reading progress bar, floating dock, and dark mode for document canvas.
28. **Reader View 2.0**: Minimalist distraction-free typography with instant 3-line AI summary pill.
29. **Link X-Ray**: Quick preview tooltip showing destination meta information before clicking.
30. **Dynamic Time-of-day Tinting**: Gradual UI color warmth shift matching dawn, noon, sunset, and late night.

---

## 🏠 Interactive New Tab Dashboard (`newtab/`)
31. **GPU Entrance Choreography**: Digit drop-ins, light sweeps, center search unfolding, and tube-flicker neon link animations.
32. **Procedural Weather Simulation**: Real-time Open-Meteo weather physics canvas rendering rain, snow, and sunlight particles at 30 FPS.
33. **Handcrafted 3D Weather Art**: GPU-animated SVG illustrations reflecting the current meteorological state.
34. **Interactive Vinyl Player**: Desktop media playback card with animated vinyl extraction, progress bar, and synced lyrics.
35. **Persian NLP To-Do List**: Quick task input supporting natural language dates, priority tags, and reminders (`Ctrl+Alt+T`).
36. **Persistent Sticky Notes & Word Catcher**: Review vocabulary cards, track study streaks, and keep notes directly on the new tab.

---

## ⚡ Energy & Performance Optimization
37. **Auto-Lean Battery Throttle**: Detects battery state and drops canvas rendering to 24 FPS or full sleep when inactive.
38. **Memory Compaction Engine**: Shuts down dormant background tabs and flushes internal caches when the browser is idle.
39. **Hardware H.264 Preference**: Routes video decoding to hardware H.264, preventing battery-draining software AV1/VP9 decoding.
40. **Live Developer Hot-Reload (`scripts/install-dev.ps1`)**: Live-syncs changes to active Zen profile with zero restart friction.

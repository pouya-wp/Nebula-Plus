# ✨ Nebula Plus — Features

Nebula Plus is a personal fork of [Zen Nebula](https://github.com/JustAdumbPrsn/Zen-Nebula) (GPL-3.0).
Every feature can be toggled from Sine → Nebula Plus settings.

## 🎵 Music
1. Unified media hub: tabs and desktop apps (Spotify, etc.) appear as one "now playing"
2. Nebula Bridge: a local helper that reads Windows media sessions (`bridge/`)
3. Player card for desktop apps in the sidebar
4. Click the desktop card's progress bar to seek
5. Blurred album art behind the player
6. Album cover spins like vinyl while playing
7. Equalizer bars while playing
8. Album-color ambience across the whole browser
9. Alternative mode: ambience only around the player
10. The ambience fades and desaturates on pause
11. Orbiting glow around the playing card
12. Track-change island (click it to jump to the tab)
13. Shortcuts: Ctrl+Alt+Space play/pause, Ctrl+Alt+← / → previous/next
14. Ctrl+Alt+, / . jump ±10 seconds
15. Progress bar in the album color
16. Player rebuilt for Zen 1.23 media cards (the old Nebula styles clipped them)
17. Fixed Nebula's cover-art module polling forever on Zen 1.23

## 🎤 Lyrics
18. Time-synced lyrics (LRCLIB) under the player
19. Custom font, Meem by default
20. Custom size
21. 1, 3 or 5 visible lines
22. Karaoke fill on the current line
23. RTL-aware: Persian lines fill from right to left
24. Click a line to jump to it
25. Optional: show only while hovering the sidebar
26. Timing offset in milliseconds
27. Cleans up messy YouTube titles ("Artist - Song (Official Video)")
28. Ctrl+Alt+L toggles lyrics
29. Depth-of-field: distant lines blur and fade

## 🌙 Dark mode
30. One-click force-dark for every website
31. Animated sun ↔ moon button in the URL bar
32. Smart skip: sites that are already dark are detected and left alone
33. Right-click the button to skip or force the current site
34. A "never darken" site list
35. Sites with a native dark theme are asked for it first
36. Photos and videos keep their real colors
37. Ctrl+Alt+D

## ✨ Glow & motion
38. Orbiting comet glow on the active tab
39. Orbiting glow on the URL bar while typing
40. Glow color: Zen accent / album color / rainbow / white
41. Adjustable orbit speed
42. Adjustable glow thickness
43. Light sweep when hovering tabs
44. Shimmer on loading tabs
45. Tabs playing audio breathe softly
46. Tactile press animation on buttons and tabs
47. Glass edge highlights on floating surfaces
48. Optional film grain
49. Performance mode
50. Respects the OS "reduce motion" setting

## 🌊 Ambience
51. Time-of-day tint: dawn, day, sunset, night
52. Website color halo around the page
53. Custom UI font
54. Soft accent text selection on websites
55. Slim scrollbars on websites

## 🧭 Sidebar & islands
56. Sidebar clock (Meem)
57. Persian (Jalali) date under the clock
58. Download-finished island; click it to open the file
59. Island at the top or bottom

## 🛠️ Development
60. Live reload: CSS and scripts update in Zen on save (`nplus-dev-live`)

## Setup
```powershell
# close-and-relaunch install (links sine-mods\Nebula to this repo)
powershell -ExecutionPolicy Bypass -File scripts\install-dev.ps1
# build the bridge (needs .NET 10 SDK)
dotnet publish bridge -c Release -o bridge-dist
```

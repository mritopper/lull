# Lull

**Five quiet minutes at your desk to put the day down.**

**Try it:** https://mritopper.github.io/lull/ (open in the Meta Quest Browser, or preview on desktop)

Lull is a hands-first, seated mixed reality wind-down ritual for Meta Quest, built with the
[Immersive Web SDK](https://iwsdk.dev) (WebXR). It runs in the Meta Quest Browser with no
install and no controllers.

1. **Arrive.** Pinch the ember floating in front of you.
2. **Unload.** Six thoughts drift up around you ("Unanswered messages", "A decision I'm avoiding"…).
   Pinch one out of the air and carry it to one of three jars sitting on your *real* desk:
   **Tomorrow**, **Let it rest**, or **Not mine to carry**. Released thoughts become fireflies.
3. **Breathe.** A lantern appears between your hands. Open your hands to breathe in, bring them
   together to breathe out, following a 4-in / 6-out guide ring. Over five breaths your real room
   dims around you and a night sky fades in.
4. **Close.** Tonight becomes a star. Seven nights complete a constellation. Pinch the moon to say
   goodnight. Tomorrow, Lull welcomes you back with last night's "Tomorrow" thoughts waiting in their jar.

## Platform features used

| Feature | How Lull uses it |
| --- | --- |
| Hand tracking | Everything is pinch / carry / open-close hands. Controllers are never required. |
| Near + far pinch | Pinch a thought up close (grab) or from a distance (ray pinch, it flies to your hand). |
| Plane detection (scene understanding) | Finds a horizontal surface 18–95 cm below your eyes and within reach, and sets the jars on it. Falls back to a floating shelf when there is no desk. |
| Passthrough | The breathing phase gradually dims your actual room, so the space you live in "goes to sleep" with you. |
| Seated / FoV-aware layout | Everything is anchored to where you sit and kept within roughly ±30° and a two-foot reach. Lull re-centers if you sit down or turn to face your desk before starting. |
| Persistence | Nights, streaks, the constellation and tomorrow's thoughts are stored on-device (localStorage). |
| Accessibility | One raised hand is enough to breathe (raise and lower instead of open and close). Point-and-pinch filing for limited reach. Large, high-contrast text. |

## Run it

```bash
npm install
npm run dev        # IWSDK dev server with the IWER browser emulator
npm run build      # production build in dist/
```

Open the deployed page in the **Meta Quest Browser**, tap **Begin in headset**, sit at a desk, and
follow the ember. On a desktop browser, **Preview in browser** runs the same flow with a mouse.

## Project layout

```
src/lull-system.ts      the ritual: phases, desk detection, thoughts, jars, lantern, sky
src/lull-components.ts  ECS components (Mote, LullButton)
src/progress.ts         nightly progress, streaks, constellations (localStorage)
src/audio.ts            procedural Web Audio soundscape (pad, chimes, breath swell)
src/text.ts             canvas text labels and glow helpers (no external art assets)
tools/                  emulator demo driver + video recording helpers
```

All visuals and sound are generated in code. No third-party services, no network calls, no data
leaves the device.

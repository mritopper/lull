# Devpost submission draft: Lull

**Submission name:** Lull

**Tagline (≤140 chars):**
A five-minute, hands-only wind-down ritual: carry the day's thoughts into jars on your real desk, then breathe as your room goes dark.

**Track:** Productivity (habits tied to a recurring context: wind-down)
**Division:** New Experience
**Build link:** https://mritopper.github.io/lull/ (WebXR, open in Meta Quest Browser)
**Video:** (YouTube / Vimeo link)
**Target launch date:** Q1 2027 as a PWA on the Meta Horizon Store *(confirm before submitting)*

---

## Description (≈450 words)

### Inspiration
The hardest part of the day is often its last ten minutes. You close the laptop, but the
unanswered messages, the decision you're avoiding, the thing you said in a meeting keep running.
Journaling apps ask you to type. Meditation apps ask you to leave your room. I wanted something
that meets you where the day actually ends, sitting at your desk, and uses the one thing VR does
better than any phone: letting you physically *put something down*.

### What it does
Lull is a seated, hands-only ritual in mixed reality, about five minutes long.

1. **Pinch the ember.** No controllers, no menus.
2. **Unload.** Six thoughts drift up within arm's reach. Pinch one out of the air and carry it to one
   of three glass jars that Lull has placed on your real desk using plane detection:
   **Tomorrow**, **Let it rest**, or **Not mine to carry**. Released thoughts dissolve into fireflies.
3. **Breathe.** A lantern appears between your hands. Open your hands to breathe in, close them to
   breathe out, following a 4-in / 6-out ring. Over five breaths your actual room dims around you
   (passthrough) and a night sky fades in.
4. **Close.** Tonight becomes a star. Seven nights complete a constellation. Pinch the moon to say
   goodnight. The next evening, Lull greets you with "Welcome back, Night 2" and last night's
   "Tomorrow" thoughts still waiting in their jar.

### How I built it
Lull is built with Meta's Immersive Web SDK (WebXR, Three.js, ECS) and runs in the Meta Quest Browser.
- **Hands:** near-field pinch-grab plus far-field ray pinch (a pinched thought flies to your hand).
  Every button also accepts a pinch, a poke or a ray press.
- **Scene understanding:** WebXR plane detection finds a horizontal surface 18–95 cm below eye level
  and within reach, and the jars settle onto it. With no desk, they rest on a soft floating shelf.
- **Purposeful passthrough:** the room really does go dark as you breathe. The same scene with
  passthrough off would lose its point.
- **Seated, FoV-aware design:** everything sits within a two-foot radius and about ±30° of center.
  The layout re-centers if you sit down or turn before starting.
- **Zero assets:** all geometry, text and the soundscape (pad, chimes, breath swell) are procedural.
  No network calls, and progress is stored only on the device.

### Accessibility
Breathing works with one raised hand (raise and lower). Thoughts can be filed by point-and-pinch
instead of reaching. Text is large and high-contrast over passthrough.

### What's next
Persistent spatial anchors so the jars live on your desk between sessions, optional voice capture to
name your own thoughts, a morning companion mode that opens the Tomorrow jar, and packaging as a PWA
for the Meta Horizon Store.

---

## Hand interactions (optional field)
Lull is hands-only from cold start to goodbye. Pinching the ember teaches the one gesture you need.
You then pinch thoughts out of the air (near grab or distant ray pinch), carry them, and open your
fingers over a jar to let go. Breathing uses the distance between your hands, or one hand's height,
as the input, so your body *is* the controller. What excites me about VR is exactly this:
interfaces that feel like rituals instead of menus.

## Notes for judges
- Open the build link in the Meta Quest Browser and tap **Begin in headset** while seated at a desk or table.
- Works without a desk, too: the jars rest on a floating shelf.
- Desktop preview: **Preview in browser** runs the same flow with a mouse.
- The demo video was recorded in the Immersive Web SDK emulator (IWER) with its built-in living-room
  passthrough environment.

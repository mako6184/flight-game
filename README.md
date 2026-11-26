# flight-game

[![make.fun · best-flight-game-20261126-0057](https://make.fun/badge/best-flight-game-20261126-0057.svg)](https://make.fun/bounty/best-flight-game-20261126-0057?utm_source=github&utm_medium=readme&utm_campaign=best-flight-game-20261126-0057)
[![rank](https://make.fun/badge/best-flight-game-20261126-0057/mako6184/flight-game/rank.svg)](https://make.fun/bounty/best-flight-game-20261126-0057/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=best-flight-game-20261126-0057)
[![reward](https://make.fun/badge/best-flight-game-20261126-0057/mako6184/flight-game/reward.svg)](https://make.fun/bounty/best-flight-game-20261126-0057?utm_source=github&utm_medium=readme&utm_campaign=best-flight-game-20261126-0057)

**Skyline Run** — a valley flight trial in the browser. You fly a small prop plane down a winding green valley in a chase view: thread ten target rings for points (the closer to the centre, the more they pay), mind your fuel and your airspeed, then slow down and put the plane gently on the runway at the end of the course. Clip a hillside, stall it into the ground or arrive at the strip too fast and the run ends.

Everything is drawn with plain canvas 2D and a hand-rolled perspective projection — procedural hills, a river, patchwork fields, pine woods and snow-capped ridges, all generated from a seed. No images, no frameworks, no network requests: the game runs fully offline from its own files.

**How to play**

- **Fly:** ↑ / W dive, ↓ / S climb, ← → / A D bank — or hold the mouse on the canvas and steer with it
- **Power:** Shift for more throttle, Ctrl for less, or the mouse wheel — throttle burns fuel, so glide when you can
- **Rings:** the gold ring is next; thread its centre for bonus points
- **Land:** finish below about 95 kt, sink gently, wings level, on the strip
- **Pause:** P or Esc · **Start / restart:** Enter

The instrument panel is live: attitude indicator, airspeed, altitude and a heading gauge, plus a compass ribbon, fuel and throttle bars, score, ring count and timer. Engine hum, ring chimes and the stall warning are synthesized with WebAudio — no audio files.

## Run it

```sh
node serve.ts
```

then open http://localhost:8080 in desktop Chrome. (Any static file server pointed at `game/` works just as well.)

---

<sub>Entered on [make.fun](https://make.fun/?ref=mako6184&utm_source=github&utm_medium=readme&utm_campaign=best-flight-game-20261126-0057) · AI agents build software for cash rewards</sub>

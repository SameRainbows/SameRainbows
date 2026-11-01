# Ants on my contribution graph

The ants at the top of my profile are the real champion colony from [Formicai](https://github.com/SameRainbows/Formicai): generation 7 of the Phase 7 food-delivery curriculum. Each ant has a 16-unit recurrent neural network (678 evolved numbers in [`genome.json`](genome.json)). It senses pheromone, food odour, the nest and nearby ants, and decides how to turn, how fast to walk, and when to pick food up or put it down. Nothing in it was hand-programmed.

Every day a GitHub Action turns my contribution calendar into a world. Each day I contributed becomes food, as much as the number of contributions. Then 64 ants forage it for 300 simulated seconds. The result is played back at 5× speed. A day fades as the ants carry it away, and an ant carrying food shows a green crumb.

[`sim.mjs`](sim.mjs) is a JavaScript port of Formicai's C# world and controller, using float32 arithmetic like the original. On the original's recorded replay (seed 70000001) it starts with exactly the same ant positions and stays within a micrometre for the first 1,000 ticks. After that the runs drift apart, as chaotic systems do. Over the full run it delivers 33.8 food where the C# run delivered 37.4, in line with the champion's mean of 34 on held-out seeds.

```bash
GITHUB_TOKEN=... node ants/generate.mjs <github-login> dist
```

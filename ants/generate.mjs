// Turns a GitHub contribution calendar into a world of food and lets
// Formicai's evolved champion colony forage it. Writes two animated SVGs.
//
//   GITHUB_TOKEN=... node ants/generate.mjs <login> <out-dir>
//   node ants/generate.mjs --calendar contrib.json <out-dir>

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { World, Brain, phase7Config } from './sim.mjs';

const TICKS = 6000;          // 300 simulated seconds, the length of a Phase 7 trial
const FRAME_TICKS = 10;      // sample every half second of simulated time
const PLAY_SECONDS = 60;     // played back five times faster
const PITCH = 8;             // mm between calendar cells
const SCALE = 2;             // px per mm
const LEFT = 40;             // mm of ground between the nest and the first week

const themes = {
  light: { bg: '#ffffff', ground: '#f6f8fa', levels: ['#ebedf0', '#9be9a8', '#40c463', '#30a14e', '#216e39'], ant: '#24292f', nest: '#8c6d4f', nestHole: '#4a3726', text: '#57606a', food: '#2da44e' },
  dark: { bg: '#0d1117', ground: '#010409', levels: ['#161b22', '#0e4429', '#006d32', '#26a641', '#39d353'], ant: '#e6edf3', nest: '#8c6d4f', nestHole: '#2b2016', text: '#8b949e', food: '#39d353' },
};

async function loadCalendar(args) {
  if (args[0] === '--calendar') {
    const json = JSON.parse(readFileSync(args[1], 'utf8'));
    return { calendar: json.data.user.contributionsCollection.contributionCalendar, outDir: args[2] };
  }
  const [login, outDir] = args;
  const query = `query($login: String!) { user(login: $login) { contributionsCollection { contributionCalendar {
    totalContributions weeks { contributionDays { date contributionCount weekday } } } } } }`;
  const response = await fetch('https://api.github.com/graphql', {
    method: 'POST',
    headers: { Authorization: `bearer ${process.env.GITHUB_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables: { login } }),
  });
  const json = await response.json();
  if (!json.data) throw new Error(`GitHub API: ${JSON.stringify(json.errors ?? json)}`);
  return { calendar: json.data.user.contributionsCollection.contributionCalendar, outDir };
}

function level(count, max) {
  if (count === 0) return 0;
  return Math.min(4, 1 + Math.floor((count / max) * 4 - 1e-9));
}

function simulate(calendar) {
  const days = calendar.weeks.flatMap((w, week) => w.contributionDays.map((d) => ({ ...d, week })));
  const weeks = calendar.weeks.length;
  const width = LEFT + weeks * PITCH, height = 9 * PITCH;
  const config = {
    ...phase7Config,
    worldWidth: width, worldHeight: height,
    nestX: 18, nestY: height / 2,
    pheromoneColumns: Math.round(width / 4), pheromoneRows: Math.round(height / 4),
  };
  const cell = (d) => ({ x: LEFT + d.week * PITCH + PITCH / 2, y: PITCH + d.weekday * PITCH + PITCH / 2 });
  const food = days.filter((d) => d.contributionCount > 0)
    .map((d) => ({ ...cell(d), radius: PITCH * 0.3, amount: d.contributionCount, rate: 4, day: d }));

  // A new colony every day, the same colony all day.
  const seed = BigInt(Math.floor(Date.parse(days.at(-1).date) / 86400000));
  const world = new World(config, seed, food);
  const brain = new Brain(JSON.parse(readFileSync(new URL('./genome.json', import.meta.url), 'utf8')), config.antCount);

  const n = config.antCount, frames = [];
  const record = () => frames.push({
    x: Array.from(world.x), y: Array.from(world.y), loaded: Array.from(world.crop, (c) => c > 0),
    remaining: world.food.map((p) => p.remaining / p.amount), store: world.store,
  });
  record();
  for (let t = 1; t <= TICKS; t++) {
    world.step(brain.decide(world));
    if (t % FRAME_TICKS === 0) record();
  }
  return { days, config, food: world.food, frames, n, delivered: world.store, total: calendar.totalContributions, cell };
}

const r1 = (v) => Math.round(v * 10) / 10;

// keyTimes/values for a discrete animation, keeping only the frames where the value changes.
function steps(values, format) {
  const times = [], out = [];
  let last;
  values.forEach((v, i) => {
    const s = format(v);
    if (s !== last) { times.push(r1(i / (values.length - 1) * 1000) / 1000); out.push(s); last = s; }
  });
  if (times.at(-1) !== 1) { times.push(1); out.push(last); }
  return { keyTimes: times.join(';'), values: out.join(';') };
}

function render(sim, theme) {
  const t = themes[theme];
  const { config, frames, food, days, n, cell } = sim;
  const W = config.worldWidth * SCALE, H = config.worldHeight * SCALE, caption = 26;
  const max = Math.max(1, ...days.map((d) => d.contributionCount));
  const dur = `${PLAY_SECONDS}s`;
  const size = PITCH * 0.8 * SCALE, corner = 2;
  const out = [];
  out.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H + caption}" width="${W}" height="${H + caption}" role="img" aria-label="Ants from Formicai foraging my GitHub contributions">`);
  out.push(`<title>${n} evolved ants foraging a year of GitHub contributions</title>`);
  out.push(`<style>text{font:12px -apple-system,BlinkMacSystemFont,"Segoe UI",Helvetica,Arial,sans-serif;fill:${t.text}}@media (prefers-reduced-motion:reduce){.ants{display:none}}</style>`);
  out.push(`<defs><g id="a"><ellipse cx="-2.6" rx="2" ry="1.3"/><ellipse rx="1.3" ry="0.9"/><circle cx="2" r="1"/>` +
    `<path d="M-1 -2.6L0.6 0L-1 2.6M0.2 -2.8L0 0L0.2 2.8M1.6 -2.4L-0.4 0L1.6 2.4M2.6 -0.6L4 -1.8M2.6 0.6L4 1.8" fill="none" stroke-width="0.5" stroke="${t.ant}"/></g></defs>`);
  out.push(`<rect width="${W}" height="${H + caption}" rx="6" fill="${t.bg}"/>`);

  // The calendar: empty days, then food that fades as the colony carries it away.
  for (const d of days) {
    if (d.contributionCount > 0) continue;
    const c = cell(d);
    out.push(`<rect x="${r1(c.x * SCALE - size / 2)}" y="${r1(c.y * SCALE - size / 2)}" width="${r1(size)}" height="${r1(size)}" rx="${corner}" fill="${t.levels[0]}"/>`);
  }
  food.forEach((p, i) => {
    const c = cell(p.day);
    const x = r1(c.x * SCALE - size / 2), y = r1(c.y * SCALE - size / 2);
    const fade = steps(frames.map((fr) => fr.remaining[i]), (v) => String(Math.round((0.25 + 0.75 * v) * 20) / 20));
    out.push(`<rect x="${x}" y="${y}" width="${r1(size)}" height="${r1(size)}" rx="${corner}" fill="${t.levels[0]}"/>`);
    out.push(`<rect x="${x}" y="${y}" width="${r1(size)}" height="${r1(size)}" rx="${corner}" fill="${t.levels[level(p.day.contributionCount, max)]}">` +
      (fade.values.includes(';') ? `<animate attributeName="opacity" dur="${dur}" repeatCount="indefinite" calcMode="discrete" keyTimes="${fade.keyTimes}" values="${fade.values}"/>` : '') +
      `<title>${p.day.date}: ${p.day.contributionCount} contribution${p.day.contributionCount === 1 ? '' : 's'}</title></rect>`);
  });

  // The nest.
  const nx = config.nestX * SCALE, ny = config.nestY * SCALE, nr = config.nestRadius * SCALE;
  out.push(`<circle cx="${nx}" cy="${ny}" r="${r1(nr)}" fill="${t.nest}" opacity="0.35"/><circle cx="${nx}" cy="${ny}" r="${r1(nr * 0.28)}" fill="${t.nestHole}"/>`);

  // The ants: one path per ant, a food crumb that appears while it carries something.
  out.push(`<g class="ants" fill="${t.ant}"><animate attributeName="opacity" dur="${dur}" repeatCount="indefinite" keyTimes="0;0.015;0.985;1" values="0;1;1;0"/>`);
  for (let i = 0; i < n; i++) {
    const path = 'M' + frames.map((fr) => `${Math.round(fr.x[i] * SCALE * 10) / 10} ${Math.round(fr.y[i] * SCALE * 10) / 10}`).join('L');
    const crumb = steps(frames.map((fr) => fr.loaded[i]), (v) => (v ? '1' : '0'));
    out.push(`<g><animateMotion dur="${dur}" repeatCount="indefinite" rotate="auto" path="${path}"/>` +
      `<use href="#a"/>` +
      (crumb.values.includes('1') ? `<circle cx="4.2" r="1.5" fill="${t.food}" opacity="0"><animate attributeName="opacity" dur="${dur}" repeatCount="indefinite" calcMode="discrete" keyTimes="${crumb.keyTimes}" values="${crumb.values}"/></circle>` : '') +
      `</g>`);
  }
  out.push('</g>');

  const delivered = Math.round(sim.delivered);
  out.push(`<text x="12" y="${H + 17}">${n} ants with evolved neural brains from Formicai, foraging ${sim.total} contributions. Today's colony brought ${delivered} home.</text>`);
  out.push('</svg>');
  return out.join('\n');
}

const { calendar, outDir } = await loadCalendar(process.argv.slice(2));
const sim = simulate(calendar);
mkdirSync(outDir, { recursive: true });
for (const theme of Object.keys(themes)) {
  const svg = render(sim, theme);
  writeFileSync(`${outDir}/ants-${theme}.svg`, svg);
  console.log(`ants-${theme}.svg: ${(svg.length / 1024).toFixed(0)} KB`);
}
console.log(`delivered ${sim.delivered.toFixed(1)} of ${sim.total}`);

// A JavaScript port of Formicai's foraging world (AntSim.Core) and its
// recurrent neural controller (AntSim.Neural, architecture version 1).
// Arithmetic is rounded to float32 like the C# original.
// Source: https://github.com/SameRainbows/Formicai

const f = Math.fround;
const PI = f(Math.PI);
const TAU = f(Math.PI * 2);

export const defaultConfig = {
  antCount: 256,
  worldWidth: 800, worldHeight: 600,
  dt: 0.05,
  nestX: 120, nestY: 300, nestRadius: 18,
  interactionRadius: 3,
  maxEnergy: 1, maxCrop: 1,
  maxSpeed: 24, maxTurn: Math.PI * 2,
  basalCost: 0.00002, restingMultiplier: 0.35,
  moveCostPerMm: 0.00001,
  pheromoneCostPerUnit: 0.00005, pheromoneDepositPerSecond: 0.4,
  antennaForward: 2, antennaLateral: 1.5,
  odorSampleDistance: 5, sectorAngle: 0.65,
  foodOdorRange: 35, nestCueRange: 30,
  contactRadius: 5, maxContacts: 8,
  pheromoneColumns: 256, pheromoneRows: 192,
  pheromoneUpdateInterval: 4,
  pheromoneDiffusion: 0.2, pheromoneDecay: 0.01, maxPheromone: 10,
  spatialCell: 12,
};

// The Phase 6 / Phase 7 "full route" world the champion evolved in.
export const phase7Config = {
  ...defaultConfig,
  antCount: 64,
  worldWidth: 360, worldHeight: 240,
  nestX: 50, nestY: 120, nestRadius: 14,
  pheromoneColumns: 90, pheromoneRows: 60,
  foodOdorRange: 36, nestCueRange: 26,
  spatialCell: 10,
};

const MASK64 = (1n << 64n) - 1n;

class Pcg32 {
  constructor(seed, stream = 1n) {
    this.state = 0n;
    this.inc = ((BigInt(stream) << 1n) | 1n) & MASK64;
    this.nextUInt();
    this.state = (this.state + BigInt(seed)) & MASK64;
    this.nextUInt();
  }
  nextUInt() {
    const old = this.state;
    this.state = (old * 6364136223846793005n + this.inc) & MASK64;
    const xorShifted = Number((((old >> 18n) ^ old) >> 27n) & 0xffffffffn);
    const rot = Number(old >> 59n);
    return ((xorShifted >>> rot) | (xorShifted << ((-rot) & 31))) >>> 0;
  }
  nextSingle(min = 0, max = 1) {
    const unit = f((this.nextUInt() >>> 8) * f(1 / 16777216));
    return min === 0 && max === 1 ? unit : f(min + f(f(max - min) * unit));
  }
}

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const unit = (v) => (Number.isFinite(v) ? clamp(v, 0, 1) : 0);

export function normalizeAngle(a) {
  let n = f(f(a + PI) % TAU);
  if (n < 0) n = f(n + TAU);
  return f(n - PI);
}

export class World {
  constructor(config, seed, food) {
    this.c = config;
    this.food = food.map((p) => ({ ...p, remaining: p.amount }));
    this.tick = 0;
    this.store = 0;
    const n = config.antCount;
    this.x = new Float32Array(n); this.y = new Float32Array(n);
    this.heading = new Float32Array(n); this.energy = new Float32Array(n);
    this.crop = new Float32Array(n);
    this.lastDistance = new Float32Array(n); this.lastTurn = new Float32Array(n);
    this.lastLoaded = new Float32Array(n); this.lastUnloaded = new Float32Array(n);
    this.blocked = new Uint8Array(n);
    this.pheromone = new Float32Array(config.pheromoneColumns * config.pheromoneRows);
    this.pheromoneNext = new Float32Array(this.pheromone.length);
    this.cellColumns = Math.max(1, Math.ceil(f(config.worldWidth / config.spatialCell)));
    this.cellRows = Math.max(1, Math.ceil(f(config.worldHeight / config.spatialCell)));
    this.heads = new Int32Array(this.cellColumns * this.cellRows);
    this.next = new Int32Array(n);

    const random = new Pcg32(seed, 0xa17c0101n);
    for (let i = 0; i < n; i++) {
      const angle = random.nextSingle(0, TAU);
      const radius = f(f(f(Math.sqrt(random.nextSingle())) * f(config.nestRadius)) * f(0.8));
      this.x[i] = f(config.nestX + f(f(Math.cos(angle)) * radius));
      this.y[i] = f(config.nestY + f(f(Math.sin(angle)) * radius));
      this.heading[i] = random.nextSingle(-PI, PI);
      this.energy[i] = config.maxEnergy;
    }
    this.rebuildIndex();
  }

  cellOf(x, y) {
    const cs = this.c.spatialCell;
    const col = clamp(Math.trunc(x / cs), 0, this.cellColumns - 1);
    const row = clamp(Math.trunc(y / cs), 0, this.cellRows - 1);
    return row * this.cellColumns + col;
  }

  rebuildIndex() {
    this.heads.fill(-1); this.next.fill(-1);
    for (let id = this.x.length - 1; id >= 0; id--) {
      const cell = this.cellOf(this.x[id], this.y[id]);
      this.next[id] = this.heads[cell];
      this.heads[cell] = id;
    }
  }

  // Mirrors UniformSpatialIndex.QueryCircle with a results buffer of
  // min(antCount, maxContacts + 1) slots.
  countContacts(antId) {
    const c = this.c, x = this.x[antId], y = this.y[antId], r = c.contactRadius;
    const cs = c.spatialCell, limit = Math.min(c.antCount, c.maxContacts + 1);
    const c0 = clamp(Math.trunc(f(x - r) / cs), 0, this.cellColumns - 1);
    const c1 = clamp(Math.trunc(f(x + r) / cs), 0, this.cellColumns - 1);
    const r0 = clamp(Math.trunc(f(y - r) / cs), 0, this.cellRows - 1);
    const r1 = clamp(Math.trunc(f(y + r) / cs), 0, this.cellRows - 1);
    const r2 = f(r * r);
    let count = 0, nearby = 0, loaded = 0;
    for (let row = r0; row <= r1; row++) {
      for (let col = c0; col <= c1; col++) {
        let id = this.heads[row * this.cellColumns + col];
        while (id >= 0) {
          const dx = f(this.x[id] - x), dy = f(this.y[id] - y);
          if (f(f(dx * dx) + f(dy * dy)) <= r2) {
            if (count === limit) return [nearby, loaded];
            count++;
            if (id !== antId) {
              nearby++;
              if (this.crop[id] > 0.001) loaded++;
            }
          }
          id = this.next[id];
        }
      }
    }
    return [nearby, loaded];
  }

  pheromoneIndex(x, y) {
    const c = this.c;
    const col = clamp(Math.trunc(f(f(x / c.worldWidth) * c.pheromoneColumns)), 0, c.pheromoneColumns - 1);
    const row = clamp(Math.trunc(f(f(y / c.worldHeight) * c.pheromoneRows)), 0, c.pheromoneRows - 1);
    return row * c.pheromoneColumns + col;
  }

  samplePheromone(x, y) {
    return clamp(f(this.pheromone[this.pheromoneIndex(x, y)] / this.c.maxPheromone), 0, 1);
  }

  sampleFood(x, y, angle) {
    const c = this.c;
    const sx = f(x + f(f(Math.cos(angle)) * c.odorSampleDistance));
    const sy = f(y + f(f(Math.sin(angle)) * c.odorSampleDistance));
    let strongest = 0;
    for (const p of this.food) {
      if (p.remaining <= 0) continue;
      const dx = f(p.x - sx), dy = f(p.y - sy);
      const edge = Math.max(0, f(f(Math.sqrt(f(f(dx * dx) + f(dy * dy)))) - p.radius));
      if (edge >= c.foodOdorRange) continue;
      strongest = Math.max(strongest, f(1 - f(edge / c.foodOdorRange)));
    }
    return strongest;
  }

  sampleNest(x, y, angle) {
    const c = this.c;
    const sx = f(x + f(f(Math.cos(angle)) * c.odorSampleDistance));
    const sy = f(y + f(f(Math.sin(angle)) * c.odorSampleDistance));
    const dx = f(c.nestX - sx), dy = f(c.nestY - sy);
    const edge = Math.max(0, f(f(Math.sqrt(f(f(dx * dx) + f(dy * dy)))) - c.nestRadius));
    return edge >= c.nestCueRange ? 0 : f(1 - f(edge / c.nestCueRange));
  }

  // The 19 inputs of architecture version 1, already encoded.
  observe(id, out) {
    const c = this.c, x = this.x[id], y = this.y[id], h = this.heading[id];
    const fx = f(Math.cos(h)), fy = f(Math.sin(h));
    const lx = f(Math.cos(f(h - f(PI * 0.5)))), ly = f(Math.sin(f(h - f(PI * 0.5))));
    const bx = f(x + f(fx * c.antennaForward)), by = f(y + f(fy * c.antennaForward));
    const lat = c.antennaLateral, sa = f(c.sectorAngle);
    out[0] = this.samplePheromone(f(bx + f(lx * lat)), f(by + f(ly * lat)));
    out[1] = this.samplePheromone(bx, by);
    out[2] = this.samplePheromone(f(bx - f(lx * lat)), f(by - f(ly * lat)));
    out[3] = this.sampleFood(x, y, f(h - sa));
    out[4] = this.sampleFood(x, y, h);
    out[5] = this.sampleFood(x, y, f(h + sa));
    out[6] = this.sampleNest(x, y, f(h - sa));
    out[7] = this.sampleNest(x, y, h);
    out[8] = this.sampleNest(x, y, f(h + sa));
    out[9] = Math.max(out[7], Math.max(out[6], out[8]));
    const [nearby, loaded] = this.countContacts(id);
    out[10] = unit(f(nearby / c.maxContacts));
    out[11] = unit(f(loaded / c.maxContacts));
    out[12] = unit(f(this.energy[id] / c.maxEnergy));
    out[13] = unit(f(this.crop[id] / c.maxCrop));
    out[14] = unit(f(this.lastDistance[id] / f(f(c.maxSpeed) * f(c.dt))));
    out[15] = clamp(f(this.lastTurn[id] / f(f(c.maxTurn) * f(c.dt))), -1, 1);
    out[16] = unit(f(this.lastLoaded[id] / c.maxCrop));
    out[17] = unit(f(this.lastUnloaded[id] / c.maxCrop));
    out[18] = this.blocked[id] ? 1 : 0;
  }

  execute(id, intent) {
    const c = this.c, dt = f(c.dt);
    this.lastDistance[id] = 0; this.lastTurn[id] = 0;
    this.lastLoaded[id] = 0; this.lastUnloaded[id] = 0; this.blocked[id] = 0;
    let energy = this.energy[id];
    const resting = intent.rest;
    energy = Math.max(0, f(energy - f(f(f(c.basalCost) * dt) * (resting ? f(c.restingMultiplier) : 1))));
    let heading = this.heading[id];
    const previousHeading = heading;
    if (!resting && energy > 0) {
      heading = normalizeAngle(f(heading + f(f(f(clamp(intent.turn, -1, 1)) * f(c.maxTurn)) * dt)));
      let distance = f(f(f(clamp(intent.speed, 0, 1)) * f(c.maxSpeed)) * dt);
      if (c.moveCostPerMm > 0) distance = Math.min(distance, f(energy / f(c.moveCostPerMm)));
      const px = this.x[id], py = this.y[id];
      let x = f(px + f(f(Math.cos(heading)) * distance));
      let y = f(py + f(f(Math.sin(heading)) * distance));
      let blocked = false;
      if (x < 0 || x > c.worldWidth) { x = clamp(x, 0, c.worldWidth); heading = normalizeAngle(f(PI - heading)); blocked = true; }
      if (y < 0 || y > c.worldHeight) { y = clamp(y, 0, c.worldHeight); heading = normalizeAngle(-heading); blocked = true; }
      this.x[id] = x; this.y[id] = y;
      const dx = f(x - px), dy = f(y - py);
      const moved = f(Math.sqrt(f(f(dx * dx) + f(dy * dy))));
      energy = f(energy - f(moved * f(c.moveCostPerMm)));
      this.lastDistance[id] = moved;
      this.blocked[id] = blocked ? 1 : 0;
    }
    this.lastTurn[id] = normalizeAngle(f(heading - previousHeading));
    const deposit = clamp(intent.pheromone, 0, 1);
    if (deposit > 0 && energy > 0) {
      let amount = f(f(f(deposit) * f(c.pheromoneDepositPerSecond)) * dt);
      let cost = f(amount * f(c.pheromoneCostPerUnit));
      if (cost > energy && cost > 0) { amount = f(amount * f(energy / cost)); cost = energy; }
      energy = f(energy - cost);
      const index = this.pheromoneIndex(this.x[id], this.y[id]);
      this.pheromone[index] = Math.min(c.maxPheromone, f(this.pheromone[index] + amount));
      this.depositedAt = index;
    }
    this.heading[id] = heading;
    this.energy[id] = clamp(energy, 0, c.maxEnergy);
    if (intent.load && this.energy[id] > 0) this.lastLoaded[id] = this.tryLoad(id);
    if (intent.unload) this.lastUnloaded[id] = this.tryUnload(id);
  }

  tryLoad(id) {
    const c = this.c;
    const capacity = f(c.maxCrop - this.crop[id]);
    if (capacity <= 0) return 0;
    for (const p of this.food) {
      if (p.remaining <= 0) continue;
      const reach = f(p.radius + c.interactionRadius);
      const dx = f(p.x - this.x[id]), dy = f(p.y - this.y[id]);
      if (f(f(dx * dx) + f(dy * dy)) > f(reach * reach)) continue;
      const moved = Math.min(Math.min(f(f(p.rate) * f(c.dt)), capacity), p.remaining);
      p.remaining = f(p.remaining - moved);
      this.crop[id] = f(this.crop[id] + moved);
      p.taken = (p.taken || 0) + moved;
      return moved;
    }
    return 0;
  }

  tryUnload(id) {
    const c = this.c;
    const dx = f(c.nestX - this.x[id]), dy = f(c.nestY - this.y[id]);
    if (this.crop[id] <= 0 || f(f(dx * dx) + f(dy * dy)) > f(f(c.nestRadius) * f(c.nestRadius))) return 0;
    const moved = this.crop[id];
    this.store = f(this.store + moved);
    this.crop[id] = 0;
    return moved;
  }

  diffuse() {
    const c = this.c, cols = c.pheromoneColumns, rows = c.pheromoneRows;
    const elapsed = f(f(c.dt) * c.pheromoneUpdateInterval);
    const diffusion = f(f(c.pheromoneDiffusion) * elapsed);
    const retention = Math.max(0, f(1 - f(f(c.pheromoneDecay) * elapsed)));
    const cur = this.pheromone, nxt = this.pheromoneNext;
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const i = y * cols + x, center = cur[i];
        const sum = f(f(f(f(cur[y * cols + Math.max(0, x - 1)] + cur[y * cols + Math.min(cols - 1, x + 1)])
          + cur[Math.max(0, y - 1) * cols + x]) + cur[Math.min(rows - 1, y + 1) * cols + x]) - f(4 * center));
        nxt[i] = clamp(f(f(center + f(diffusion * sum)) * retention), 0, c.maxPheromone);
      }
    }
    this.pheromone = nxt; this.pheromoneNext = cur; cur.fill(0);
  }

  step(intents) {
    for (let id = 0; id < intents.length; id++) this.execute(id, intents[id]);
    this.tick++;
    if (this.tick % this.c.pheromoneUpdateInterval === 0) this.diffuse();
    this.rebuildIndex();
  }
}

export class Brain {
  constructor(genome, antCount) {
    const a = genome.Architecture;
    if (a.Version !== 1 || a.InputCount !== 19) throw new Error('Only architecture version 1 is ported.');
    this.a = a;
    this.p = Float32Array.from(genome.Parameters);
    this.hidden = new Float32Array(antCount * a.HiddenCount);
    this.input = new Float32Array(a.InputCount);
    this.nextHidden = new Float32Array(a.HiddenCount);
    this.raw = new Float32Array(a.OutputCount);
  }

  decide(world) {
    const n = world.x.length, intents = new Array(n);
    const observations = [];
    for (let id = 0; id < n; id++) {
      const o = new Float32Array(this.a.InputCount);
      world.observe(id, o);
      observations.push(o);
    }
    for (let id = 0; id < n; id++) intents[id] = this.decideFor(id, observations[id]);
    return intents;
  }

  decideFor(id, input) {
    const { a, p } = this, H = a.HiddenCount, I = a.InputCount, base = id * H;
    for (let h = 0; h < H; h++) {
      let sum = p[a.HiddenBiasOffset + h];
      const iw = a.InputWeightOffset + h * I;
      for (let i = 0; i < I; i++) sum = f(sum + f(input[i] * p[iw + i]));
      const rw = a.RecurrentWeightOffset + h * H;
      for (let k = 0; k < H; k++) sum = f(sum + f(this.hidden[base + k] * p[rw + k]));
      this.nextHidden[h] = f(Math.tanh(sum));
    }
    for (let o = 0; o < a.OutputCount; o++) {
      let sum = p[a.OutputBiasOffset + o];
      const ow = a.OutputWeightOffset + o * H;
      for (let h = 0; h < H; h++) sum = f(sum + f(this.nextHidden[h] * p[ow + h]));
      this.raw[o] = sum;
    }
    this.hidden.set(this.nextHidden, base);
    const sig = (v) => f(1 / (1 + Math.exp(-clamp(v, -20, 20))));
    return {
      turn: f(Math.tanh(this.raw[0])),
      speed: sig(this.raw[1]),
      pheromone: sig(this.raw[2]),
      load: sig(this.raw[3]) >= 0.5,
      unload: sig(this.raw[4]) >= 0.5,
      rest: sig(this.raw[5]) >= 0.5,
    };
  }
}

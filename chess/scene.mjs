// Draws the chess scene as pixel art, seen from about 75 degrees: the robot arm
// sits behind the board facing you, and replays its last move when you look.
// Every board square is the same scene cropped to that square, so the squares
// can be separate clickable images while the arm still moves across them.

export const S = 2;            // screen px per art px
export const FRAME = 4;        // board rim, art px
export const SQW = 20, SQH = 18;
export const TOP = 80;         // art px above the board for the robot
export const W = FRAME * 2 + SQW * 8;
export const H = TOP + FRAME + SQH * 8 + 6;
const FILES = 'abcdefgh';

const P = {
  wood: '#5b3e2b', woodDark: '#3a2619', woodEdge: '#2a1b11', grain: '#4e3424',
  light: '#ead5aa', dark: '#a8714b', lastLight: '#e3cf6f', lastDark: '#b99a45', check: '#d9534a',
  steel: '#7d8696', steelLight: '#a5aebb', steelDark: '#4b5260', black: '#2b2f38', orange: '#e07b39', orangeLight: '#ffb37a',
  screen: '#10141c', eye: '#7ee0ff', pick: '#f5d142', dot: '#2c8f3f',
  w: { o: '#3b3634', b: '#f3ede2', h: '#ffffff', s: '#cfc6b6' },
  k: { o: '#101014', b: '#3a3a46', h: '#62627a', s: '#26262e' },
};

export function squareBox(sq) {
  const f = FILES.indexOf(sq[0]), r = +sq[1];
  return { x: FRAME + f * SQW, y: TOP + FRAME + (8 - r) * SQH, w: SQW, h: SQH };
}
// Where a piece stands: the middle of its square, a little below centre.
export function baseOf(sq) {
  const b = squareBox(sq);
  return { x: b.x + SQW / 2, y: b.y + SQH - 4 };
}

// Pixel masks, 11 wide, top to bottom. Outline and shading are worked out from the mask.
const MASKS = {
  p: ['....###....', '...#####...', '...#####...', '...#####...', '....###....', '....###....', '...#####...',
    '...#####...', '..#######..', '.#########.', '.#########.', '###########'],
  r: ['..##.#.##..', '..#######..', '..#######..', '...#####...', '...#####...', '...#####...', '...#####...',
    '...#####...', '..#######..', '.#########.', '.#########.', '###########'],
  n: ['....#.#....', '...#####...', '..#######..', '.########..', '.###*####..', '..#.#####..', '....#####..',
    '...######..', '...#####...', '..#######..', '.#########.', '###########'],
  b: ['.....#.....', '....###....', '...#####...', '...##*##...', '...#####...', '....###....', '....###....',
    '...#####...', '...#####...', '..#######..', '.#########.', '###########'],
  q: ['.#..#.#..#.', '.##.###.##.', '..#######..', '..#######..', '...#####...', '....###....', '....###....',
    '...#####...', '...#####...', '..#######..', '.#########.', '###########'],
  k: ['.....#.....', '....###....', '.....#.....', '..#######..', '..#######..', '...#####...', '...#####...',
    '....###....', '...#####...', '...#####...', '..#######..', '.#########.', '###########'],
};

// Pixel art for one piece, drawn with its base centre at (0, 0).
function drawPiece(type, color) {
  const mask = MASKS[type], pal = color === 'w' ? P.w : P.k, n = mask.length;
  const at = (x, y) => (mask[y]?.[x] ?? '.') !== '.';
  const px = [];
  for (let y = 0; y < n; y++) {
    const row = mask[y];
    const first = row.search(/[#*]/), last = Math.max(row.lastIndexOf('#'), row.lastIndexOf('*'));
    for (let x = 0; x < 11; x++) {
      if (!at(x, y)) continue;
      const edge = !at(x - 1, y) || !at(x + 1, y) || !at(x, y - 1) || !at(x, y + 1);
      let c = edge || row[x] === '*' ? pal.o : x === first + 1 ? pal.h : x === last - 1 || y === n - 2 ? pal.s : pal.b;
      px.push([x - 5, y - n, c]);
    }
  }
  // One path per colour, one subpath per horizontal run, keeps the SVG small.
  const paths = {};
  for (let i = 0; i < px.length;) {
    let j = i;
    while (j + 1 < px.length && px[j + 1][1] === px[i][1] && px[j + 1][0] === px[j][0] + 1 && px[j + 1][2] === px[i][2]) j++;
    (paths[px[i][2]] ??= []).push(`M${px[i][0]} ${px[i][1]}h${j - i + 1}v1h-${j - i + 1}z`);
    i = j + 1;
  }
  return Object.entries(paths).map(([c, d]) => `<path fill="${c}" d="${d.join('')}"/>`).join('');
}

export const pieceHeight = (type) => MASKS[type].length;
const pieceId = (type, color) => `${color === 'w' ? 'w' : 'k'}${type}`;
const usePiece = (type, color, x, y) => `<use href="#${pieceId(type, color)}" x="${x}" y="${y}"/>`;

// The arm works in 3D: (x, y) on the table, z up. The 75 degree view shows
// height as a shift up the picture.
const TILT = 0.45;
const SHOULDER = { x: W / 2, y: 74, z: 42 };
const L1 = 86, L2 = 86;
const REST = { x: W / 2 + 36, y: 72 };
const project = (p) => ({ x: p.x, y: p.y - p.z * TILT });

function ik(t) {
  const dx = t.x - SHOULDER.x, dy = t.y - SHOULDER.y, dz = t.z - SHOULDER.z;
  const flat = Math.hypot(dx, dy), d = Math.min(L1 + L2 - 0.5, Math.max(6, Math.hypot(flat, dz)));
  const reach = Math.atan2(dz, flat), bend = Math.acos((L1 * L1 + d * d - L2 * L2) / (2 * L1 * d));
  const up = reach + bend, ux = flat ? dx / flat : 0, uy = flat ? dy / flat : 1;
  const elbow = { x: SHOULDER.x + ux * Math.cos(up) * L1, y: SHOULDER.y + uy * Math.cos(up) * L1, z: SHOULDER.z + Math.sin(up) * L1 };
  return { shoulder: project(SHOULDER), elbow: project(elbow), wrist: project(t) };
}

const ease = (k) => (k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2);
const r1 = (v) => Math.round(v * 10) / 10;

// The arm's replay of one move: reach, grip, lift, carry, lower, release, return.
function timeline(move) {
  if (!move) return null;
  const from = baseOf(move.from), to = baseOf(move.to);
  const hold = (p, lift) => ({ x: p.x, y: p.y, lift });
  const keys = [
    [0.0, hold(REST, 0), false], [0.6, hold(REST, 0), false],
    [1.6, hold(from, 12), false], [2.0, hold(from, 0), false], [2.25, hold(from, 0), true],
    [2.65, hold(from, 12), true], [3.9, hold(to, 12), true], [4.3, hold(to, 0), true],
    [4.5, hold(to, 0), false], [4.9, hold(to, 12), false], [6.0, hold(REST, 0), false],
  ];
  const dur = keys.at(-1)[0], samples = [];
  for (let t = 0; t <= dur + 1e-9; t += 0.1) {
    let i = 0;
    while (i < keys.length - 2 && keys[i + 1][0] <= t) i++;
    const [t0, a, carry] = keys[i], [t1, b] = keys[i + 1];
    const k = ease(Math.min(1, (t - t0) / (t1 - t0)));
    samples.push({ t, x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k, lift: a.lift + (b.lift - a.lift) * k, carry });
  }
  return { samples, dur, grip: 2.25, release: 4.5 };
}

const keyTimes = (samples, dur) => samples.map((s) => r1((s.t / dur) * 1000) / 1000).join(';');

function armSvg(tl, height) {
  // The wrist hovers just above the top of the piece it is holding.
  // Pieces are drawn upright, so height in the picture is height / TILT in the world.
  const wrist = (s) => ({ x: s.x, y: s.y, z: (height + 3 + s.lift) / TILT });
  const poses = (tl ? tl.samples : [{ ...REST, lift: 0 }]).map((s) => ik(wrist(s)));
  const kt = tl && keyTimes(tl.samples, tl.dur);
  const anim = (attr, vals, discrete) => tl
    ? `<animate attributeName="${attr}" dur="${tl.dur}s" fill="freeze"${discrete ? ' calcMode="discrete"' : ''} keyTimes="${kt}" values="${vals.join(';')}"/>`
    : '';
  const move = (pts) => tl
    ? `<animateTransform attributeName="transform" type="translate" dur="${tl.dur}s" fill="freeze" keyTimes="${kt}" values="${pts.map((p) => `${r1(p.x)} ${r1(p.y)}`).join(';')}"/>`
    : '';
  const first = poses[0];
  const segment = (a, b, width, color) =>
    `<line x1="${r1(first[a].x)}" y1="${r1(first[a].y)}" x2="${r1(first[b].x)}" y2="${r1(first[b].y)}" stroke="${color}" stroke-width="${width}" stroke-linecap="square">` +
    anim('x1', poses.map((p) => r1(p[a].x))) + anim('y1', poses.map((p) => r1(p[a].y))) +
    anim('x2', poses.map((p) => r1(p[b].x))) + anim('y2', poses.map((p) => r1(p[b].y))) + '</line>';
  const joint = (key, size, inner) =>
    `<g transform="translate(${r1(first[key].x)} ${r1(first[key].y)})">${move(poses.map((p) => p[key]))}` +
    `<rect x="${-size / 2}" y="${-size / 2}" width="${size}" height="${size}" fill="${P.orange}"/>` +
    `<rect x="${-size / 2 + 1}" y="${-size / 2 + 1}" width="${inner}" height="${inner}" fill="${P.orangeLight}"/></g>`;
  const open = tl ? tl.samples.map((s) => (s.carry ? 4 : 6)) : [6];
  const finger = (side) =>
    `<rect y="1" width="2" height="7" fill="${P.steelDark}" x="${side < 0 ? -open[0] : open[0] - 2}">` +
    anim('x', open.map((o) => (side < 0 ? -o : o - 2)), true) + '</rect>';
  const svg = segment('shoulder', 'elbow', 8, P.steelDark) + segment('shoulder', 'elbow', 4, P.steelLight) +
    segment('elbow', 'wrist', 6, P.steelDark) + segment('elbow', 'wrist', 2, P.steelLight) +
    joint('shoulder', 12, 4) + joint('elbow', 9, 3) +
    `<g transform="translate(${r1(first.wrist.x)} ${r1(first.wrist.y)})">${move(poses.map((p) => p.wrist))}` +
    `<rect x="-7" y="-3" width="14" height="5" fill="${P.black}"/><rect x="-3" y="-5" width="6" height="2" fill="${P.orange}"/>` +
    finger(-1) + finger(1) + '</g>';
  // Squares the arm never crosses can leave it out. Each segment is checked on its own.
  const swept = poses.flatMap((p) => [p.shoulder, p.elbow, p.wrist,
    ...[0.25, 0.5, 0.75].flatMap((k) => [lerp(p.shoulder, p.elbow, k), lerp(p.elbow, p.wrist, k)])]);
  return { svg, points: swept, pad: 9 };
}

const lerp = (a, b, k) => ({ x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k });

function robotBase(tl) {
  const cx = W / 2;
  const look = tl ? tl.samples.map((s) => `${r1((s.x - cx) / 40)} ${r1((s.y - 120) / 60)}`).join(';') : '0 0';
  const eyes = `<g>${tl ? `<animateTransform attributeName="transform" type="translate" dur="${tl.dur}s" fill="freeze" keyTimes="${keyTimes(tl.samples, tl.dur)}" values="${look}"/>` : ''}` +
    `<rect x="${cx - 7}" y="${TOP - 17}" width="3" height="5" fill="${P.eye}"><animate attributeName="height" values="5;5;1;5" keyTimes="0;0.94;0.97;1" dur="4.5s" repeatCount="indefinite"/></rect>` +
    `<rect x="${cx + 4}" y="${TOP - 17}" width="3" height="5" fill="${P.eye}"><animate attributeName="height" values="5;5;1;5" keyTimes="0;0.94;0.97;1" dur="4.5s" repeatCount="indefinite"/></rect></g>`;
  // A box on the table: top face for the shoulder, a little screen face on the front.
  return `<rect x="${cx - 30}" y="${TOP - 30}" width="60" height="8" fill="${P.steelLight}"/>` +
    `<rect x="${cx - 30}" y="${TOP - 22}" width="60" height="22" fill="${P.steel}"/>` +
    `<rect x="${cx - 30}" y="${TOP - 5}" width="60" height="3" fill="${P.orange}"/>` +
    `<rect x="${cx - 13}" y="${TOP - 20}" width="26" height="13" fill="${P.screen}"/>` + eyes +
    `<rect x="${cx + 21}" y="${TOP - 17}" width="2" height="2" fill="#5bd16b"><animate attributeName="opacity" values="1;0.2;1" dur="1.6s" repeatCount="indefinite"/></rect>`;
}

// Full scene as a list of drawing items in paint order. Each item knows the
// area it can cover, so a crop only carries the items that show in it.
// `marks` adds highlights for the move-picking pages.
export function scene(state, marks = {}) {
  const { board, last, check } = state;
  const tl = timeline(last);
  const items = [];
  const add = (svg, x, y, w, h, uses = []) => items.push({ svg, box: { x, y, w, h }, uses });
  const pieceItem = (svg, x, y, uses) => add(svg, x - 6, y - 16, 12, 18, uses);

  add(`<rect width="${W}" height="${TOP}" fill="${P.wood}"/>` +
    Array.from({ length: Math.ceil(TOP / 9) }, (_, i) => `<rect x="0" y="${3 + i * 9}" width="${W}" height="1" fill="${P.grain}"/>`).join(''), 0, 0, W, TOP);
  add(robotBase(tl), W / 2 - 30, TOP - 30, 60, 30);
  add(`<rect x="0" y="${TOP}" width="${W}" height="${H - TOP}" fill="${P.woodDark}"/><rect x="0" y="${H - 6}" width="${W}" height="6" fill="${P.woodEdge}"/>` +
    FILES.split('').map((f, i) => `<rect x="${FRAME + i * SQW + 9}" y="${H - 4}" width="2" height="2" fill="#7a5a40"/>`).join(''), 0, TOP, W, H - TOP);
  for (let r = 8; r >= 1; r--) {
    for (const f of FILES) {
      const sq = f + r, b = squareBox(sq), darkSq = (FILES.indexOf(f) + r) % 2 === 0;
      const isLast = last && (sq === last.from || sq === last.to);
      let fill = isLast ? (darkSq ? P.lastDark : P.lastLight) : darkSq ? P.dark : P.light;
      if (check === sq) fill = P.check;
      let svg = `<rect x="${b.x}" y="${b.y}" width="${SQW}" height="${SQH}" fill="${fill}"/>`;
      if (marks.selected === sq) svg += `<rect x="${b.x + 1}" y="${b.y + 1}" width="${SQW - 2}" height="${SQH - 2}" fill="none" stroke="${P.pick}" stroke-width="2"/>`;
      add(svg, b.x, b.y, SQW, SQH);
    }
  }

  // Pieces back to front, so nearer pieces overlap the ones behind them.
  for (let r = 8; r >= 1; r--) {
    for (const f of FILES) {
      const sq = f + r, base = baseOf(sq), mark = marks.targets?.[sq];
      if (mark === 'move') add(`<rect x="${base.x - 2}" y="${base.y - 6}" width="4" height="4" fill="${P.dot}" opacity="0.85"/>`, base.x - 2, base.y - 6, 4, 4);
      const pc = board[sq];
      if (pc && !(last && sq === last.to)) {
        pieceItem(`<rect x="${base.x - 5}" y="${base.y - 1}" width="11" height="2" fill="#000" opacity="0.25"/>` +
          usePiece(pc.type, pc.color, base.x, base.y), base.x, base.y, [pieceId(pc.type, pc.color)]);
      }
      if (last?.captured && sq === (last.captureSquare ?? last.to)) {
        const color = last.color === 'w' ? 'k' : 'w';
        pieceItem(`<g>${usePiece(last.captured, color, base.x, base.y)}<set attributeName="visibility" to="hidden" begin="${tl.release}s"/></g>`,
          base.x, base.y, [pieceId(last.captured, color)]);
      }
      if (mark === 'capture') add(`<rect x="${base.x - 8}" y="${base.y - 15}" width="16" height="16" fill="none" stroke="${P.dot}" stroke-width="2" opacity="0.9"/>`, base.x - 9, base.y - 16, 18, 18);
    }
  }

  // The piece the robot moved, carried by the arm.
  if (last) {
    const from = baseOf(last.from), to = baseOf(last.to);
    const at = (s, lifted) => (s.t < tl.grip ? from : s.t >= tl.release ? to : { x: s.x, y: s.y - (lifted ? s.lift : 0) });
    const kt = keyTimes(tl.samples, tl.dur);
    const path = (lifted) => tl.samples.map((s) => { const p = at(s, lifted); return `${r1(p.x)} ${r1(p.y)}`; }).join(';');
    const pts = tl.samples.map((s) => at(s, true)).concat(tl.samples.map((s) => at(s, false)));
    const box = bounds(pts, 0);
    items.push({
      svg: `<g><animateTransform attributeName="transform" type="translate" dur="${tl.dur}s" fill="freeze" keyTimes="${kt}" values="${path(false)}"/><rect x="-5" y="-1" width="11" height="2" fill="#000" opacity="0.25"/></g>` +
        `<g><animateTransform attributeName="transform" type="translate" dur="${tl.dur}s" fill="freeze" keyTimes="${kt}" values="${path(true)}"/>${usePiece(last.piece, last.color, 0, 0)}</g>`,
      box: { x: box.x - 6, y: box.y - 16, w: box.w + 12, h: box.h + 18 }, uses: [pieceId(last.piece, last.color)],
    });
  }
  const arm = armSvg(tl, pieceHeight(last?.piece ?? 'p'));
  items.push({ svg: arm.svg, points: arm.points, pad: arm.pad, uses: [] });
  return items;
}

function bounds(points, pad) {
  const xs = points.map((p) => p.x), ys = points.map((p) => p.y);
  const x = Math.min(...xs) - pad, y = Math.min(...ys) - pad;
  return { x, y, w: Math.max(...xs) + pad - x, h: Math.max(...ys) + pad - y };
}

const overlaps = (a, x, y, w, h) => a.x < x + w && a.x + a.w > x && a.y < y + h && a.y + a.h > y;

// One SVG cropped to a region of the scene, in screen pixels.
export function crop(items, x, y, w, h, label) {
  const shown = items.filter((it) => it.box
    ? overlaps(it.box, x, y, w, h)
    : it.points.some((p) => overlaps({ x: p.x - it.pad, y: p.y - it.pad, w: it.pad * 2, h: it.pad * 2 }, x, y, w, h)));
  const ids = [...new Set(shown.flatMap((it) => it.uses))];
  const defs = ids.length ? `<defs>${ids.map((id) => `<g id="${id}">${drawPiece(id.slice(1), id[0])}</g>`).join('')}</defs>` : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w * S}" height="${h * S}" viewBox="${x} ${y} ${w} ${h}" shape-rendering="crispEdges"${label ? ` role="img" aria-label="${label}"` : ''}>` +
    defs + shown.map((it) => it.svg).join('') + '</svg>';
}

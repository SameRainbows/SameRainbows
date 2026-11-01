// Writes the clickable board: one image per square inside a link, the robot
// above it, and a page per movable piece that shows where it can go.
//
//   node chess/render.mjs

import { mkdirSync, writeFileSync, readFileSync, rmSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { scene, crop, W, TOP, FRAME, SQW, SQH, S } from './scene.mjs';
import { load, view } from './state.mjs';

const REPO = 'SameRainbows/SameRainbows';
const ROOT = fileURLToPath(new URL('..', import.meta.url));
const FILES = 'abcdefgh';
const NAMES = { p: 'pawn', n: 'knight', b: 'bishop', r: 'rook', q: 'queen', k: 'king' };
const BOARD_Y = TOP + FRAME;

const region = (sq) => {
  const i = FILES.indexOf(sq[0]), r = +sq[1];
  const x = i === 0 ? 0 : FRAME + i * SQW;
  const w = SQW + (i === 0 || i === 7 ? FRAME : 0);
  return { x, y: BOARD_Y + (8 - r) * SQH, w, h: SQH };
};

// align="top" keeps rows flush: on the baseline, each row would sit above a gap.
const img = (src, w, h, alt) => `<img src="${src}" width="${w * S}" height="${h * S}" align="top" alt="${alt}">`;
const link = (href, inner) => `<a href="${href}">${inner}</a>`;

export function issueUrl(move, san) {
  const title = `chess: ${move}`;
  const body = `Press **Create** to play ${san}. The robot replies in about a minute, then closes this issue.`;
  return `https://github.com/${REPO}/issues/new?title=${encodeURIComponent(title)}&body=${encodeURIComponent(body)}`;
}

// Rows of square images. `href(sq)` gives each square's link, `src(sq)` its image.
function boardHtml(top, bottom, src, href, alt) {
  const rows = [];
  for (let r = 8; r >= 1; r--) {
    rows.push(FILES.split('').map((f) => {
      const sq = f + r, g = region(sq);
      return link(href(sq), img(src(sq), g.w, g.h, alt(sq)));
    }).join(''));
  }
  return `<p align="center">${img(top, W, BOARD_Y, 'The robot arm, behind the board')}<br>` +
    rows.join('<br>') + `<br>${img(bottom, W, 6, '')}</p>`;
}

export function render(state = load()) {
  const v = view(state);
  const { chess, board } = v;
  const tag = `g${state.game}m${state.moves.length}`;
  const base = `chess/board/${tag}`;
  const dir = `${ROOT}${base}`;

  // Only the current position is kept; old squares would just pile up.
  rmSync(`${ROOT}chess/board`, { recursive: true, force: true });
  mkdirSync(`${dir}/s`, { recursive: true });
  mkdirSync(`${dir}/pick`, { recursive: true });

  const items = scene(v);
  writeFileSync(`${dir}/top.svg`, crop(items, 0, 0, W, BOARD_Y));
  writeFileSync(`${dir}/bottom.svg`, crop(items, 0, BOARD_Y + 8 * SQH, W, 6));
  for (let r = 1; r <= 8; r++) for (const f of FILES) {
    const g = region(f + r);
    writeFileSync(`${dir}/s/${f + r}.svg`, crop(items, g.x, g.y, g.w, g.h));
  }

  const legal = chess.turn() === 'w' ? chess.moves({ verbose: true }) : [];
  const movable = [...new Set(legal.map((m) => m.from))];
  const alt = (sq) => (board[sq] ? `${sq}: ${board[sq].color === 'w' ? 'your' : "the robot's"} ${NAMES[board[sq].type]}` : sq);

  // A page per movable piece, with its targets marked.
  for (const from of movable) {
    const moves = legal.filter((m) => m.from === from && (!m.promotion || m.promotion === 'q'));
    const targets = Object.fromEntries(moves.map((m) => [m.to, m.captured ? 'capture' : 'move']));
    const marked = scene(v, { selected: from, targets });
    mkdirSync(`${dir}/pick/${from}`, { recursive: true });
    for (const sq of [from, ...Object.keys(targets)]) {
      const g = region(sq);
      writeFileSync(`${dir}/pick/${from}/${sq}.svg`, crop(marked, g.x, g.y, g.w, g.h));
    }
    const html = boardHtml('../top.svg', '../bottom.svg',
      (sq) => (sq === from || targets[sq] ? `${from}/${sq}.svg` : `../s/${sq}.svg`),
      (sq) => {
        const m = moves.find((x) => x.to === sq);
        if (m) return issueUrl(m.from + m.to + (m.promotion ?? ''), m.san);
        if (sq === from) return `https://github.com/${REPO.split('/')[0]}`;
        if (movable.includes(sq)) return `${sq}.md`;
        return '#';
      }, alt);
    writeFileSync(`${dir}/pick/${from}.md`,
      `<h3 align="center">Where should your ${NAMES[board[from].type]} on ${from} go?</h3>\n\n` +
      `<p align="center">Click a green square. GitHub opens an issue with your move filled in: press <b>Create</b> to play it.<br>` +
      `Click another of your pieces to pick it instead, or <a href="https://github.com/${REPO.split('/')[0]}">go back</a>.</p>\n\n${html}\n`);
  }

  const status = statusLines(state, chess, movable);
  const html = boardHtml(`${base}/top.svg`, `${base}/bottom.svg`, (sq) => `${base}/s/${sq}.svg`,
    (sq) => (movable.includes(sq) ? `${base}/pick/${sq}.md` : '#play-chess-against-my-robot'), alt);
  const section = `<!-- chess -->\n<h3 align="center" id="play-chess-against-my-robot">Play chess against my robot</h3>\n\n${html}\n\n` +
    `<p align="center">${status}</p>\n<!-- /chess -->`;

  const readmePath = `${ROOT}README.md`;
  const readme = readFileSync(readmePath, 'utf8');
  writeFileSync(readmePath, readme.replace(/<!-- chess -->[\s\S]*<!-- \/chess -->/, section));
  return { tag, files: readdirSync(`${dir}/s`).length };
}

function statusLines(state, chess, movable) {
  const lines = [];
  if (state.result) lines.push(state.result);
  if (state.last) lines.push(`The robot's last move: <b>${state.last.san}</b>.`);
  if (movable.length) lines.push(`You're white. <b>Click one of your pieces</b> to move it. The robot replies in about a minute.`);
  else lines.push('The robot is thinking.');
  const s = state.score;
  lines.push(`<sub>Game ${state.game} · move ${Math.floor(state.moves.length / 2) + 1} · visitors ${s.visitors}, robot ${s.robot}, draws ${s.draws}</sub>`);
  return lines.join('<br>');
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const out = render();
  console.log(`rendered ${out.tag}`);
}

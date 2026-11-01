// Game state on disk, and the view of it the scene draws.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { Chess } from 'chess.js';

export const STATE = new URL('./state.json', import.meta.url);

export function load() {
  if (!existsSync(STATE)) return fresh({ robot: 0, visitors: 0, draws: 0 }, 1);
  return JSON.parse(readFileSync(STATE, 'utf8'));
}

export function save(state) {
  writeFileSync(STATE, JSON.stringify(state, null, 2) + '\n');
}

export function fresh(score, game) {
  return { game, fen: new Chess().fen(), moves: [], last: null, score, result: null };
}

// Board as { square: { type, color } }, plus the robot's last move and any check.
export function view(state) {
  const chess = new Chess(state.fen);
  const board = {};
  for (const row of chess.board()) for (const sq of row) if (sq) board[sq.square] = { type: sq.type, color: sq.color };
  let check = null;
  if (chess.inCheck()) {
    const king = Object.entries(board).find(([, p]) => p.type === 'k' && p.color === chess.turn());
    check = king?.[0] ?? null;
  }
  return { board, last: state.last, check, chess };
}

// The robot's move as the scene needs it.
export function describe(move) {
  const captureSquare = move.flags.includes('e') ? move.to[0] + move.from[1] : move.to;
  return {
    from: move.from, to: move.to, san: move.san, color: move.color,
    piece: move.promotion ?? move.piece, captured: move.captured ?? null, captureSquare,
  };
}

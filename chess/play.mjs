// Plays one visitor move from an issue title, lets the robot reply, and
// re-renders the board. Writes the reply comment to chess/reply.md.
//
//   CHESS_TITLE="chess: e2e4" CHESS_AUTHOR=someone node chess/play.mjs

import { writeFileSync } from 'node:fs';
import { Chess } from 'chess.js';
import { chooseMove } from './engine.mjs';
import { load, save, fresh, describe } from './state.mjs';
import { render } from './render.mjs';

const title = process.env.CHESS_TITLE ?? '';
const author = process.env.CHESS_AUTHOR ?? 'someone';
const reply = (text) => writeFileSync(new URL('./reply.md', import.meta.url), text + '\n');

const match = title.trim().match(/^chess:\s*([a-h][1-8])([a-h][1-8])([qrbn])?$/i);
const state = load();
const chess = new Chess(state.fen);

if (!match) {
  reply("I couldn't read a move in this title. Go back to the board and click a piece, then a green square.");
  process.exit(0);
}
const [, from, to, promo] = match.map((s) => s?.toLowerCase());
let mine;
try {
  mine = chess.move({ from, to, promotion: promo ?? 'q' });
} catch {
  reply(`${from}${to} isn't a legal move in the current position. Someone may have moved first. Have another look at the board.`);
  process.exit(0);
}

state.moves.push({ san: mine.san, by: author });
state.result = null;
let message = `You played **${mine.san}**.`;

function finish(winner, how) {
  state.score[winner] += 1;
  const line = winner === 'visitors' ? `Visitors won game ${state.game} by ${how}.`
    : winner === 'robot' ? `The robot won game ${state.game} by ${how}.` : `Game ${state.game} was a draw (${how}).`;
  Object.assign(state, fresh(state.score, state.game + 1), { result: `${line} A new game has started.` });
  return line;
}

const ending = (c) => (c.isCheckmate() ? 'checkmate' : c.isStalemate() ? 'stalemate' : c.isThreefoldRepetition() ? 'repetition'
  : c.isInsufficientMaterial() ? 'insufficient material' : 'the fifty-move rule');

if (chess.isGameOver()) {
  message += ' ' + finish(chess.isCheckmate() ? 'visitors' : 'draws', ending(chess));
} else {
  const robot = chooseMove(chess);
  chess.move(robot);
  state.moves.push({ san: robot.san, by: 'robot' });
  message += ` The robot replied **${robot.san}**.`;
  if (chess.isGameOver()) {
    message += ' ' + finish(chess.isCheckmate() ? 'robot' : 'draws', ending(chess));
  } else {
    state.fen = chess.fen();
    state.last = describe(robot);
  }
}

save(state);
render(state);
reply(`${message}\n\nThe board on [the profile](https://github.com/SameRainbows) is updated. Your move again whenever you like.`);

# Chess against my robot

The board on my profile is a real game. You play white, and a pixel-art robot arm across the table plays black.

**How a move works:**

1. Click one of your pieces. A page opens showing where that piece can go.
2. Click a green square. GitHub opens a new issue with your move as its title.
3. Press **Create**. A GitHub Action checks your move, lets the robot think, and updates the board. Then it replies on your issue and closes it. This takes about a minute.

Everyone plays the same game, so you might be continuing someone else's.

When you come back to the profile, the arm replays its last move: it reaches over, picks up the piece and puts it down.

**How it's built:**

- GitHub doesn't allow scripts or clickable image maps on a profile, so each square is its own image inside a link.
- Every square is the same pixel-art scene cropped to that square. That's how the arm can move across separate images. The animation is plain SVG.
- The arm uses a little 3D inverse kinematics. The view is about 75° from the table, so the elbow rising off the table shows as a shift up the picture.
- The robot's brain is a small alpha-beta search, three moves deep, over material and piece-square tables. It's in [`engine.mjs`](engine.mjs). It's strong enough to punish a loose piece, but you can beat it.
- [`chess.js`](https://github.com/jhlywa/chess.js) handles the rules.

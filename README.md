# ChessLab

Personal chess.com analysis lab: in-depth stats, game review with move classifications (Stockfish 17.1 in the browser), puzzles generated from my own games, opening repertoire explorer and trainer, and a coach that finds weak spots.

Live: https://darthpotter007.github.io/chesslab/

All data (games, analyses, puzzles) stays in the browser's IndexedDB. The repo only holds the app.

- `index.html`, `vendor/`, `engine/`: the built site served by GitHub Pages
- `source/`: app sources (`src/*.js`, `app.css`, `template.html`) and the build script
- Opening names: lichess-org/chess-openings (CC0). Pieces: cburnett (CC BY-SA 3.0). Engine: Stockfish 17.1 lite (GPLv3) via stockfish.js.

# markdown-render-speed

[![make.fun · markdown-render-speed-02](https://make.fun/badge/markdown-render-speed-02.svg)](https://make.fun/bounty/markdown-render-speed-02?utm_source=github&utm_medium=readme&utm_campaign=markdown-render-speed-02)
[![rank](https://make.fun/badge/markdown-render-speed-02/rkaya57/markdown-render-speed/rank.svg)](https://make.fun/bounty/markdown-render-speed-02/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=markdown-render-speed-02)
[![reward](https://make.fun/badge/markdown-render-speed-02/rkaya57/markdown-render-speed/reward.svg)](https://make.fun/bounty/markdown-render-speed-02?utm_source=github&utm_medium=readme&utm_campaign=markdown-render-speed-02)

A faster drop-in for [marked](https://github.com/markedjs/marked) 18.1.3: `parse.js` is a specialised fork of marked
(default options, gfm on) that returns byte-identical HTML, and `main.ts` renders every case of `/input/cases.json`
into `/output/html.json`. Built by an AI agent for [make.fun](https://make.fun)'s
[“Make Markdown rendering faster”](https://make.fun/bounty/markdown-render-speed-02) bounty.

Run: `node main.ts` (Node 22, no dependencies).

License: MIT (`LICENSE`); marked's MIT license and notice are kept in `LICENSE-marked`.

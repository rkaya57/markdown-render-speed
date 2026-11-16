// Driver: render every case of <input>/cases.json with parse() and write <output>/html.json.
// In the sandbox the directories are /input and /output; the kit's process driver points
// MAKEFUN_INPUT_DIR / MAKEFUN_OUTPUT_DIR at stand-ins (they only locate files, never change output).
// Each result is JSON-encoded as soon as it is rendered, so the rope of pieces the renderer
// built dies young instead of surviving until one big JSON.stringify at the end; joining
// the encoded strings gives exactly the bytes JSON.stringify(array) would.
import { readFileSync, writeFileSync } from 'node:fs';
import { parse } from './parse.js';

type Case = { id: string; markdown: string };

const inDir = process.env.MAKEFUN_INPUT_DIR || '/input';
const outDir = process.env.MAKEFUN_OUTPUT_DIR || '/output';
const cases: Case[] = JSON.parse(readFileSync(inDir + '/cases.json', 'utf8'));
const n = cases.length;
const encoded: string[] = new Array(n);
for (let i = 0; i < n; i++) encoded[i] = JSON.stringify(parse(cases[i].markdown));
writeFileSync(outDir + '/html.json', '[' + encoded.join(',') + ']');

// Driver: render every case of /input/cases.json with parse() and write /output/html.json.
// Each result is JSON-encoded as soon as it is rendered, so the rope of pieces the renderer
// built dies young instead of surviving until one big JSON.stringify at the end; joining
// the encoded strings gives exactly the bytes JSON.stringify(array) would.
import { readFileSync, writeFileSync } from 'node:fs';
import { parse } from './parse.js';

type Case = { id: string; markdown: string };

const cases: Case[] = JSON.parse(readFileSync('/input/cases.json', 'utf8'));
const n = cases.length;
const encoded: string[] = new Array(n);
for (let i = 0; i < n; i++) encoded[i] = JSON.stringify(parse(cases[i].markdown));
writeFileSync('/output/html.json', '[' + encoded.join(',') + ']');

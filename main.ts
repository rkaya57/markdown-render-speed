// Driver: render every case of /input/cases.json with parse() and write /output/html.json.
// One read, one JSON.parse, one render loop, one JSON.stringify, one write.
import { readFileSync, writeFileSync } from 'node:fs';
import { parse } from './parse.js';

type Case = { id: string; markdown: string };

const cases: Case[] = JSON.parse(readFileSync('/input/cases.json', 'utf8'));
const n = cases.length;
const html: string[] = new Array(n);
for (let i = 0; i < n; i++) html[i] = parse(cases[i].markdown);
writeFileSync('/output/html.json', JSON.stringify(html));

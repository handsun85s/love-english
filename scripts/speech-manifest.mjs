import { LESSONS } from '../docs/content.js';
import { DELIVERY_ORDERS } from '../docs/playground.js';
import { AUDIO_FILES } from '../docs/audio-map.js';
import { writeFile, mkdir } from 'node:fs/promises';
const texts = [...new Set(LESSONS.flatMap(l => [...l.words.map(w=>w.text), l.phrase.en, ...l.story.map(s=>s.en)]).concat('Hello! I am happy to see you.', DELIVERY_ORDERS.flatMap(o=>[o.request,o.enFeedback])))];
// Keep published audio URLs stable so an old cached voice clip can never mean a new word.
let sequence=Math.max(0,...Object.values(AUDIO_FILES).map(file=>Number(file.match(/voice-(\d+)\.wav$/)?.[1]||0)));
const manifest=texts.map(text=>({text,file:AUDIO_FILES[text]?.split('/').pop()||`voice-${String(++sequence).padStart(2,'0')}.wav`}));
await mkdir(new URL('../docs/audio/',import.meta.url),{recursive:true});
await writeFile(new URL('./speech-manifest.json',import.meta.url),JSON.stringify(manifest,null,2));
await writeFile(new URL('../docs/audio-map.js',import.meta.url),`// Original course audio, synthesized with the system English voice.\nexport const AUDIO_FILES = ${JSON.stringify(Object.fromEntries(manifest.map(x=>[x.text,`./audio/${x.file}`])),null,2)};\n`);
console.log(`Prepared ${manifest.length} English audio clips.`);

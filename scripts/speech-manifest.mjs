import { LESSONS } from '../docs/content.js';
import { writeFile, mkdir } from 'node:fs/promises';
const texts = [...new Set(LESSONS.flatMap(l => [...l.words.map(w=>w.text), l.phrase.en, ...l.story.map(s=>s.en)]).concat('Hello! I am happy to see you.'))];
const manifest=texts.map((text,i)=>({text,file:`voice-${String(i+1).padStart(2,'0')}.wav`}));
await mkdir(new URL('../docs/audio/',import.meta.url),{recursive:true});
await writeFile(new URL('./speech-manifest.json',import.meta.url),JSON.stringify(manifest,null,2));
await writeFile(new URL('../docs/audio-map.js',import.meta.url),`// Original course audio, synthesized with the system English voice.\nexport const AUDIO_FILES = ${JSON.stringify(Object.fromEntries(manifest.map(x=>[x.text,`./audio/${x.file}`])),null,2)};\n`);
console.log(`Prepared ${manifest.length} English audio clips.`);

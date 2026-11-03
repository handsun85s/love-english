import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { LESSONS } from '../docs/content.js';
import { AUDIO_FILES } from '../docs/audio-map.js';

test('every course word, phrase, and story line has a nonempty English audio clip', async () => {
  const texts=LESSONS.flatMap(l=>[...l.words.map(w=>w.text),l.phrase.en,...l.story.map(s=>s.en)]);
  for(const text of texts){
    assert.ok(AUDIO_FILES[text],`Missing audio: ${text}`);
    const wav=await readFile(new URL(`../docs/${AUDIO_FILES[text]}`,import.meta.url));
    assert.equal(wav.toString('ascii',0,4),'RIFF');
    assert.equal(wav.toString('ascii',8,12),'WAVE');
    assert.ok(wav.byteLength>1000,`Empty clip: ${text}`);
    assert.ok(wav.some((value,i)=>i>100&&value>10),`Silent clip: ${text}`);
  }
});

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { test } from 'node:test';
import { contentSha256, sourceCommit, titles } from '../i18n/chameleol-time-attack.js';

const locales = ['ja','en','es','pt-BR','zh-Hans','fr','de','ko','ru','it','zh-Hant','id','tr','vi','th'];

test('Time Attack title export has a source commit, valid fingerprint and 58 complete title ranges', () => {
  assert.match(sourceCommit, /^[a-f0-9]{40}$/);
  assert.equal(contentSha256, createHash('sha256').update(JSON.stringify(titles)).digest('hex'));
  assert.equal(titles.length, 58);
  let min = 1500;
  for (let index = 0; index < titles.length; index++) {
    const {id, minCs, maxCs, labels} = titles[index];
    assert.equal(id, 'ta.title.' + String(index + 1).padStart(2, '0'));
    assert.equal(minCs, min);
    assert.equal(maxCs, Math.min(3500 + 1000 * index, 60000));
    assert.deepEqual(Object.keys(labels).sort(), [...locales].sort());
    assert.ok(Object.values(labels).every(label => typeof label === 'string' && label.trim() && label === label.normalize('NFC')));
    min = maxCs + 1;
  }
  assert.equal(titles[0].labels.ja, '神速のカメレオン');
  assert.equal(min, 60001);
});

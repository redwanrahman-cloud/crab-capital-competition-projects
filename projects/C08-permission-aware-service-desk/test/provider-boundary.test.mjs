import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {LlmClient} from '../vendor/runtime/llm.js';
import {selectTopRouter, selectPeerRouter} from '../vendor/runtime/engine.js';

const manifest = JSON.parse(await readFile(new URL('../agent-manifest.json', import.meta.url)));

test('real runtime refuses missing credentials and mock model before any provider contact', async () => {
  const originalFetch = globalThis.fetch;
  let contacts = 0;
  globalThis.fetch = async () => { contacts++; throw new Error('Unexpected provider contact'); };
  try {
    // Reserved .invalid destination and invented fixture key only. No real key is read.
    const request = {model:'approved-model-fixture', messages:[{role:'user', content:'Synthetic test'}], tools:[]};
    for (const apiKey of ['', 'demo']) {
      await assert.rejects(new LlmClient({baseUrl:'https://provider.invalid/v1', apiKey, mock:false}).chat(request), /provider key is required/);
    }
    await assert.rejects(new LlmClient({baseUrl:'https://provider.invalid/v1', apiKey:'invented-fixture-only', mock:false}).chat({...request, model:'mock-1'}), /model is required/);
    assert.equal(contacts, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('published mock-only site cannot silently upgrade to a provider; peers retain caller router', () => {
  assert.throws(() => selectTopRouter(manifest, '', 'invented-fixture-only', 'approved-model-fixture'), /publishes no AI provider route/);
  assert.throws(() => selectTopRouter(manifest, '', '', 'approved-model-fixture'), /publishes no AI provider route/);
  const caller = {baseUrl:'https://caller-router.invalid/v1', mock:false, apiKey:'invented-fixture-only'};
  assert.deepEqual(selectPeerRouter(caller), {baseUrl:caller.baseUrl, mock:false});
  assert.throws(() => selectPeerRouter({}), /no active LLM router/);
});

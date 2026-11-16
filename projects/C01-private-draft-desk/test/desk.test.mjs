import test from 'node:test';
import * as actualFirebaseAI from 'firebase/ai';
const { InferenceMode, InferenceSource } = actualFirebaseAI;
import assert from 'node:assert/strict';
import { DraftDesk, outgoingPrompt } from '../src/desk.mjs';
import { createFirebaseAdapter } from '../src/firebase-adapter.mjs';

test('installed Firebase SDK exports the strict-mode and source contract without initialization', () => {
  for (const name of ['getAI', 'getGenerativeModel', 'GoogleAIBackend']) {
    assert.equal(typeof actualFirebaseAI[name], 'function', name);
  }
  assert.equal(InferenceSource.ON_DEVICE, 'on_device');
  assert.equal(InferenceSource.IN_CLOUD, 'in_cloud');
  assert.equal(InferenceMode.ONLY_ON_DEVICE, 'only_on_device');
  assert.equal(InferenceMode.ONLY_IN_CLOUD, 'only_in_cloud');
});

// Messages, model responses, app objects and generation functions below are
// SYNTHETIC. InferenceMode/InferenceSource come from the installed real SDK.
function fixture(generate = async mode => ({ text: 'SYNTHETIC TEST OUTPUT', inferenceSource: mode === 'local' ? InferenceSource.ON_DEVICE : InferenceSource.IN_CLOUD })) {
  const calls = [];
  const desk = new DraftDesk({ inferenceSources: { local: InferenceSource.ON_DEVICE, cloud: InferenceSource.IN_CLOUD }, async generate(...args) { calls.push(args); return generate(...args); } });
  desk.preserveOriginal('SYNTHETIC customer private detail');
  desk.editExcerpt('SYNTHETIC selected excerpt');
  return { desk, calls };
}

test('unconfigured runtime rejects both approval and local inference', async () => {
  const desk = new DraftDesk();
  desk.preserveOriginal('SYNTHETIC message');
  desk.editExcerpt('SYNTHETIC excerpt');
  assert.throws(() => desk.approveCloud(), /unconfigured/);
  await assert.rejects(desk.rewriteLocal(), /unconfigured/);
  await assert.rejects(desk.sendApprovedExcerpt(), /explicitly approve/);
  assert.equal(desk.state.result, null);
});

test('local failure never calls cloud or returns a fake draft', async () => {
  const { desk, calls } = fixture(async () => { throw new Error('SYNTHETIC local unavailable'); });
  await assert.rejects(desk.rewriteLocal(), /local unavailable/);
  assert.deepEqual(calls.map(c => c[0]), ['local']);
  assert.equal(desk.state.result, null);
  assert.equal(desk.state.busy, false);
});

test('cloud requires deliberate approval and sends exact preview only once', async () => {
  const { desk, calls } = fixture();
  await assert.rejects(desk.sendApprovedExcerpt(), /explicitly approve/);
  assert.equal(calls.length, 0);
  const preview = desk.state.preview;
  desk.approveCloud();
  await desk.sendApprovedExcerpt();
  assert.deepEqual(calls, [['cloud', preview]]);
  assert.equal(preview, outgoingPrompt('SYNTHETIC selected excerpt'));
  assert.ok(!preview.includes('customer private detail'));
  await assert.rejects(desk.sendApprovedExcerpt(), /explicitly approve/);
});

test('draft edit invalidates approval even if excerpt stays the same', async () => {
  const { desk, calls } = fixture();
  desk.approveCloud();
  desk.editDraft('SYNTHETIC edited draft');
  await assert.rejects(desk.sendApprovedExcerpt(), /explicitly approve/);
  assert.equal(calls.length, 0);
});

test('excerpt edit then revert still needs a fresh approval', async () => {
  const { desk } = fixture();
  desk.approveCloud();
  desk.editExcerpt('SYNTHETIC changed');
  desk.editExcerpt('SYNTHETIC selected excerpt');
  await assert.rejects(desk.sendApprovedExcerpt(), /explicitly approve/);
});

test('original is immutable and responses do not overwrite edits', async () => {
  const { desk } = fixture();
  const original = desk.state.original;
  desk.editDraft('SYNTHETIC edited');
  await desk.rewriteLocal();
  assert.equal(desk.state.original, original);
  assert.equal(desk.state.draft, 'SYNTHETIC edited');
  assert.equal(desk.state.result.inferenceSource, InferenceSource.ON_DEVICE);
  assert.throws(() => desk.preserveOriginal('replacement'), /already preserved/);
});

test('cloud failure consumes approval; no silent retry', async () => {
  const { desk, calls } = fixture(async () => { throw new Error('SYNTHETIC provider failure'); });
  desk.approveCloud();
  await assert.rejects(desk.sendApprovedExcerpt(), /provider failure/);
  await assert.rejects(desk.sendApprovedExcerpt(), /explicitly approve/);
  assert.equal(calls.length, 1);
});

test('missing or wrong reported inference source is rejected', async () => {
  for (const inferenceSource of [undefined, InferenceSource.IN_CLOUD]) {
    const { desk } = fixture(async () => ({ text: 'SYNTHETIC', inferenceSource }));
    await assert.rejects(desk.rewriteLocal(), /execution mode/);
    assert.equal(desk.state.result, null);
  }
});

test('in-flight request blocks edits and duplicate provider calls', async () => {
  let finish;
  const { desk, calls } = fixture(() => new Promise(resolve => { finish = resolve; }));
  const pending = desk.rewriteLocal();
  assert.throws(() => desk.editDraft('edit'), /Wait/);
  assert.throws(() => desk.editExcerpt('edit'), /Wait/);
  await assert.rejects(desk.rewriteLocal(), /Wait/);
  finish({ text: 'SYNTHETIC', inferenceSource: InferenceSource.ON_DEVICE });
  await pending;
  assert.equal(calls.length, 1);
});

function syntheticSDK({ localFailure = false } = {}) {
  const modes = [], invocations = [];
  return { modes, invocations, sdk: {
    ...actualFirebaseAI, getAI: () => ({}), GoogleAIBackend: class {},
    getGenerativeModel: (_, options) => {
      modes.push(options);
      const isLocal = options.mode === InferenceMode.ONLY_ON_DEVICE;
      return {
        async initializeDeviceModel() { invocations.push('initialize-device'); if (localFailure) throw new Error('SYNTHETIC unavailable'); },
        async generateContent(prompt) { invocations.push({ mode: options.mode, prompt }); return { response: { text: () => 'SYNTHETIC OUTPUT', inferenceSource: isLocal ? InferenceSource.ON_DEVICE : InferenceSource.IN_CLOUD } }; }
      };
    }
  } };
}
const deviceEnvironment = () => ({ secure: true, languageModel: syntheticLanguageModel });
const syntheticLanguageModel = { availability: async () => 'available', create: async () => { throw Error('Synthetic SDK must not invoke a real device model'); } };

test('Firebase seam selects only strict modes and reports SDK source', async () => {
  const f = syntheticSDK();
  const adapter = await createFirebaseAdapter({ firebaseApp: {}, appCheckReady: true, cloudModel: 'SYNTHETIC-approved-model', sdk: f.sdk, deviceEnvironment });
  await adapter.initializeLocal();
  assert.deepEqual(f.modes, [{ mode: InferenceMode.ONLY_IN_CLOUD, inCloudParams: { model: 'SYNTHETIC-approved-model' } }, { mode: InferenceMode.ONLY_ON_DEVICE }]);
  assert.equal((await adapter.generate('local', 'SYNTHETIC local prompt')).inferenceSource, InferenceSource.ON_DEVICE);
  assert.equal((await adapter.generate('cloud', 'SYNTHETIC cloud prompt')).inferenceSource, InferenceSource.IN_CLOUD);
  assert.equal(f.invocations.filter(x => x === 'initialize-device').length, 1);
  await assert.rejects(adapter.generate('prefer', 'SYNTHETIC'), /Unknown/);
});

test('Firebase local initialization failure cannot invoke cloud generate', async () => {
  const f = syntheticSDK({ localFailure: true });
  const adapter = await createFirebaseAdapter({ firebaseApp: {}, appCheckReady: true, cloudModel: 'SYNTHETIC', sdk: f.sdk, deviceEnvironment });
  await assert.rejects(adapter.initializeLocal(), /unavailable/);
  await assert.rejects(adapter.generate('local', 'SYNTHETIC'), /unavailable/);
  assert.deepEqual(f.invocations, ['initialize-device']);
});

test('Firebase adapter refuses missing setup before loading SDK', async () => {
  await assert.rejects(createFirebaseAdapter(), /required/);
  await assert.rejects(createFirebaseAdapter({ firebaseApp: {}, appCheckReady: false, cloudModel: 'SYNTHETIC' }), /required/);
});

test('adapter rejects unexpected source values including former uppercase mistake', async () => {
  for (const source of ['ON_DEVICE', undefined, InferenceSource.IN_CLOUD]) {
    const f = syntheticSDK();
    f.sdk.getGenerativeModel = () => ({
      async initializeDeviceModel() {},
      async generateContent() { return { response: { inferenceSource: source, text: () => 'SYNTHETIC' } }; }
    });
    const adapter = await createFirebaseAdapter({ firebaseApp: {}, appCheckReady: true, cloudModel: 'SYNTHETIC', sdk: f.sdk, deviceEnvironment });
    await adapter.initializeLocal();
    await assert.rejects(adapter.generate('local', 'SYNTHETIC'), /Unexpected Firebase inference source/);
  }
});


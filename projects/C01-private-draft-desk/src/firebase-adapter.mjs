// Integration seam for a separately authorized setup. This module does not
// initialize Firebase or fetch SDK code when merely imported.
export async function createFirebaseAdapter({ firebaseApp, appCheckReady = false, cloudModel, sdk, onDeviceParams,
  deviceEnvironment = () => ({ secure: globalThis.isSecureContext === true, languageModel: (globalThis.window ?? globalThis).LanguageModel }) } = {}) {
  if (!firebaseApp || (cloudModel && appCheckReady !== true)) {
    throw new Error('Firebase app and, for cloud, authorized App Check setup and an approved cloud model are required.');
  }
  const { getAI, getGenerativeModel, GoogleAIBackend, InferenceMode, InferenceSource } = sdk ?? await import('firebase/ai');
  const ai = getAI(firebaseApp, { backend: new GoogleAIBackend() });
  // Firebase 13.3.0 can route ONLY_ON_DEVICE to cloud when its Chrome adapter
  // was not constructed. Never construct a local model without a proven API.
  const localOptions = { mode: InferenceMode.ONLY_ON_DEVICE, ...(onDeviceParams ? { onDeviceParams } : {}) };
  const cloud = cloudModel ? getGenerativeModel(ai, {
    mode: InferenceMode.ONLY_IN_CLOUD, inCloudParams: { model: cloudModel }
  }) : null;
  let local = null, capturedProvider = null, initialized = false;
  const unavailable = () => Object.assign(new Error('On-device runtime unavailable or changed. No draft was sent; initialize the device again explicitly.'), { code: 'desk/device-unavailable' });
  const provider = () => {
    const environment = deviceEnvironment(), p = environment?.languageModel;
    if (environment?.secure !== true || !p || typeof p.availability !== 'function' || typeof p.create !== 'function') throw unavailable();
    return p;
  };
  const availability = async (p, requireReady = false) => {
    const value = await p.availability(onDeviceParams?.createOptions ?? {
      expectedInputs: [{ type: 'text', languages: ['en'] }], expectedOutputs: [{ type: 'text', languages: ['en'] }]
    });
    if (provider() !== p || !['available', 'downloadable', 'downloading'].includes(value) || requireReady && value !== 'available') throw unavailable();
    return value;
  };
  const initializeLocal = async onProgress => {
    try {
      const p = provider();
      await availability(p);
      if (!initialized || capturedProvider !== p) {
        // Deliberately lazy: SDK captures LanguageModel at getGenerativeModel.
        local = getGenerativeModel(ai, localOptions); capturedProvider = p;
        await local.initializeDeviceModel(onProgress);
      }
      await availability(p, true); initialized = true;
    } catch (error) { initialized = false; local = null; capturedProvider = null; throw error; }
  };
  return Object.freeze({
    inferenceSources: Object.freeze({ local: InferenceSource.ON_DEVICE, cloud: InferenceSource.IN_CLOUD }),
    initializeLocal,
    async generate(mode, prompt) {
      if (mode !== 'local' && mode !== 'cloud') throw new Error('Unknown execution mode.');
      if (mode === 'local') {
        // Generation never initializes/downloads implicitly. A successful
        // explicit initialization and fresh readiness are both mandatory.
        if (!initialized || !local || provider() !== capturedProvider) throw unavailable();
        await availability(capturedProvider, true);
      }
      const model = mode === 'local' ? local : cloud;
      if (!model) throw new Error('Cloud is blocked until the approved model and valid App Check are configured.');
      const { response } = await model.generateContent(prompt);
      const expected = mode === 'local' ? InferenceSource.ON_DEVICE : InferenceSource.IN_CLOUD;
      if (response.inferenceSource !== expected) throw new Error('Unexpected Firebase inference source.');
      return { text: response.text(), inferenceSource: response.inferenceSource };
    }
  });
}

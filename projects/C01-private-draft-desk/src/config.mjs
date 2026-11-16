export function validateFirebaseConfig(input) {
  const keys = ['apiKey', 'authDomain', 'projectId', 'storageBucket', 'messagingSenderId', 'appId'];
  if (!input || keys.some(key => typeof input[key] !== 'string' || !input[key].trim()) || input.projectId !== 'crab-private-draft-desk' ||
      !/^1:\d+:web:[a-zA-Z0-9]+$/.test(input.appId) || !/^\d+$/.test(input.messagingSenderId) || input.appId.split(':')[1] !== input.messagingSenderId)
    throw new Error('The exact six-field Private Draft Desk Firebase web configuration is missing or invalid.');
  return Object.freeze(Object.fromEntries(keys.map(key => [key, input[key]])));
}

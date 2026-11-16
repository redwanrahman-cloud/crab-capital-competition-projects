export const INSTRUCTION = 'Rewrite this English support-message excerpt clearly and politely. Preserve facts; do not invent commitments. Return only the rewritten message.\n\nExcerpt:\n';

// This exact string is both previewed and passed to the provider.
export const outgoingPrompt = excerpt => INSTRUCTION + excerpt;

export class DraftDesk {
  #adapter;
  #original = null;
  #draft = '';
  #excerpt = '';
  #revision = 0;
  #approval = null;
  #busy = false;
  #result = null;

  constructor(adapter = null) { this.#adapter = adapter; }
  configure(adapter) {
    this.#editable();
    if (this.#adapter || !adapter || typeof adapter.generate !== 'function') throw new Error('Runtime can only be configured once per tab.');
    this.#adapter = adapter;
    this.#changed();
  }

  get state() {
    return Object.freeze({ original: this.#original, draft: this.#draft,
      excerpt: this.#excerpt, preview: outgoingPrompt(this.#excerpt),
      revision: this.#revision, approved: this.#approval === this.#revision,
      configured: this.#adapter !== null, cloudReady: this.#adapter?.cloudReady ?? this.#adapter !== null, busy: this.#busy,
      result: this.#result && Object.freeze({ ...this.#result }) });
  }

  #editable() { if (this.#busy) throw new Error('Wait for the current request to finish.'); }
  #changed() { this.#revision++; this.#approval = null; this.#result = null; }

  preserveOriginal(text) {
    this.#editable();
    if (this.#original !== null) throw new Error('Original already preserved. Reload to begin another draft.');
    if (!text.trim()) throw new Error('Enter a support message first.');
    this.#original = text;
    this.#draft = text;
    this.#changed();
  }

  editDraft(text) {
    this.#editable();
    if (this.#original === null) throw new Error('Preserve the original first.');
    if (text !== this.#draft) { this.#draft = text; this.#changed(); }
  }

  editExcerpt(text) {
    this.#editable();
    if (text !== this.#excerpt) { this.#excerpt = text; this.#changed(); }
  }

  approveCloud() {
    this.#editable();
    if (!this.#adapter) throw new Error('Runtime unconfigured. Cloud approval is unavailable.');
    if (this.#adapter.cloudReady === false) throw new Error('Cloud is blocked until App Check is configured.');
    if (this.#original === null || !this.#excerpt.trim()) throw new Error('Preserve a message and prepare a nonempty excerpt.');
    this.#approval = this.#revision;
  }

  revokeCloud() { this.#approval = null; }

  async #run(mode, prompt) {
    if (!this.#adapter) throw new Error('Runtime unconfigured. No inference request was sent.');
    this.#editable();
    this.#busy = true;
    this.#result = null;
    try {
      const result = await this.#adapter.generate(mode, prompt);
      const expected = this.#adapter.inferenceSources?.[mode];
      if (!expected || result.inferenceSource !== expected) throw new Error('Unexpected or missing SDK execution mode; result rejected.');
      if (typeof result.text !== 'string' || !result.text.trim()) throw new Error('No usable text returned.');
      this.#result = { text: result.text, inferenceSource: result.inferenceSource };
      return this.state.result;
    } finally { this.#busy = false; }
  }

  async rewriteLocal() {
    if (this.#original === null || !this.#draft.trim()) throw new Error('Preserve a nonempty message first.');
    // No cloud catch/fallback exists here.
    return this.#run('local', outgoingPrompt(this.#draft));
  }

  async sendApprovedExcerpt() {
    if (this.#approval !== this.#revision) throw new Error('Review the exact preview and explicitly approve this revision first.');
    this.#approval = null; // Approval is consumed even when the provider fails. No silent retry.
    return this.#run('cloud', outgoingPrompt(this.#excerpt));
  }
}

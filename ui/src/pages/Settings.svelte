<script lang="ts">
  // Settings (#/settings): who teaches. Claude Code by default; another agent CLI in the drawer (Codex, Gemini CLI,
  // opencode), reaching Aristotle over MCP; or Aristotle's own tutor on any OpenAI-compatible model API, hosted or
  // local. Also what writes glosses, answers on a passage and the chat. Saved to this install's settings.json
  // (server/settings.ts); the API key goes in and never comes back out whole.
  import { tutor } from '../lib/tutor.svelte.ts';
  import {
    type AgentId,
    AGENTS,
    type HelperEngine,
    type ModelInfo,
    PROVIDERS,
    type ProviderId,
    type SettingsBody,
    type SettingsView,
    type TutorEngine,
  } from '../../../shared/tutor.ts';

  /** What each choice is, in a line. */
  const ABOUT: Record<TutorEngine, string> = {
    'claude-code': 'On your Claude subscription, in the terminal drawer. It has the skills built in.',
    codex: "OpenAI's agent, in the terminal drawer. It reads the method through Aristotle's tools.",
    gemini: "Google's agent, in the terminal drawer. It reads the method through Aristotle's tools.",
    opencode: 'Any model opencode is set up with, local ones included, in the terminal drawer.',
    api: "Aristotle's own tutor on any OpenAI-compatible API: OpenAI, OpenRouter, or a model on your own machine or network.",
  };
  /** What to know about each provider before using it. */
  const HINT: Record<ProviderId, string> = {
    openrouter: 'One key for hundreds of models (openrouter.ai/keys). Pick one that takes tools.',
    openai: 'A key from platform.openai.com. Billed by OpenAI.',
    ollama:
      'Ollama gives models a small context by default, too small for the tutor: start it with OLLAMA_CONTEXT_LENGTH=64000 (or more). Pick a model that takes tools.',
    lmstudio: 'Start its server (Developer tab), load a model that takes tools, with a context of 32k or more.',
    llamacpp: 'Start llama-server with a context of 32k or more (-c 32768); its chat template must take tools.',
    custom: 'Any server that speaks the OpenAI Chat Completions API (vLLM: start it with --enable-auto-tool-choice).',
  };

  let view = $state<SettingsView | null>(null);
  let loadError = $state('');
  // The form, as edited; saved together.
  let engine = $state<TutorEngine>('claude-code');
  let helpers = $state<HelperEngine>('claude-code');
  let provider = $state<ProviderId>('openrouter');
  let baseUrl = $state('');
  let apiKey = $state('');
  let removeKey = $state(false);
  let model = $state('');
  let helperModel = $state('');
  let vision = $state(false);

  let models = $state<ModelInfo[]>([]);
  let modelsNote = $state('');
  let saving = $state(false);
  let message = $state<{ ok: boolean; text: string } | null>(null);

  const usesApi = $derived(engine === 'api' || helpers === 'api');
  const preset = $derived(PROVIDERS.find((p) => p.id === provider));
  const chosen = $derived(models.find((m) => m.id === model));
  const dirty = $derived(
    view !== null &&
      (engine !== view.tutor ||
        helpers !== view.helpers ||
        provider !== view.api.provider ||
        baseUrl !== view.api.baseUrl ||
        apiKey !== '' ||
        removeKey ||
        model !== view.api.model ||
        helperModel !== view.api.helperModel ||
        vision !== view.api.vision),
  );

  void load();

  async function load() {
    try {
      const res = await fetch('/api/settings');
      take((await res.json()) as SettingsView);
      if (view?.api.baseUrl) void loadModels();
    } catch {
      loadError = 'Could not read the settings.';
    }
  }

  /** The form, from what the server has. */
  function take(v: SettingsView) {
    view = v;
    engine = v.tutor;
    helpers = v.helpers;
    provider = v.api.provider;
    baseUrl = v.api.baseUrl;
    apiKey = '';
    removeKey = false;
    model = v.api.model;
    helperModel = v.api.helperModel;
    vision = v.api.vision;
  }

  async function loadModels() {
    modelsNote = 'Asking the API for its models…';
    try {
      const res = await fetch('/api/settings/models');
      const body = (await res.json()) as ModelInfo[] | { error: string };
      if (!Array.isArray(body)) throw new Error(body.error);
      models = body;
      modelsNote = body.length ? `${body.length} model${body.length === 1 ? '' : 's'} on offer.` : 'The API lists no models.';
      return true;
    } catch (err) {
      models = [];
      modelsNote = `Could not list the models: ${(err as Error).message}`;
      return false;
    }
  }

  function pickProvider(id: ProviderId) {
    const before = PROVIDERS.find((p) => p.id === provider);
    provider = id;
    const next = PROVIDERS.find((p) => p.id === id);
    // The usual address, unless one of his own was typed in.
    if (!baseUrl || baseUrl === before?.baseUrl) baseUrl = next?.baseUrl ?? '';
    models = [];
    modelsNote = '';
  }

  /** Picking a model the API describes sets whether it can see images. */
  function pickModel() {
    const info = models.find((m) => m.id === model);
    if (info?.vision !== undefined) vision = info.vision;
  }

  async function save() {
    if (!view) return;
    saving = true;
    message = null;
    const body: SettingsBody = { tutor: engine, helpers };
    if (usesApi || view.tutor === 'api') {
      body.api = { provider, baseUrl, model, helperModel, vision };
      if (removeKey) body.api.apiKey = '';
      else if (apiKey.trim()) body.api.apiKey = apiKey.trim();
    }
    try {
      const res = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const answer = (await res.json()) as SettingsView | { error: string };
      if ('error' in answer) {
        message = { ok: false, text: answer.error };
        return;
      }
      take(answer);
      let text = 'Saved.';
      if (usesApi && answer.api.baseUrl) {
        const reached = await loadModels();
        text = reached ? `Saved. ${modelsNote}` : `Saved, but ${modelsNote.charAt(0).toLowerCase()}${modelsNote.slice(1)}`;
        if (reached && answer.api.model && models.length && !models.some((m) => m.id === answer.api.model))
          text += ` It doesn't list "${answer.api.model}": check the name.`;
      }
      message = { ok: true, text };
    } catch {
      message = { ok: false, text: 'Could not save: is Aristotle running?' };
    } finally {
      saving = false;
    }
  }

  function installed(id: AgentId): boolean {
    return view?.agents.find((a) => a.id === id)?.installed ?? false;
  }
</script>

<div class="page settings">
  <header class="page-head">
    <h1 class="page-title">Settings</h1>
    <p class="page-lede">
      Who teaches. Whichever you choose works through the same tools and follows the same method, and your library stays exactly as it is.
    </p>
  </header>

  {#if loadError}
    <p class="error">{loadError}</p>
  {:else if view}
    <section class="block" aria-labelledby="who">
      <h2 id="who" class="section-title">The tutor</h2>
      <div class="choices" role="radiogroup" aria-labelledby="who">
        {#each AGENTS as a (a.id)}
          {@const there = installed(a.id)}
          <label class="choice" class:on={engine === a.id} class:missing={!there}>
            <input type="radio" name="engine" value={a.id} bind:group={engine} disabled={!there && engine !== a.id} />
            <span class="choice-body">
              <span class="choice-name"
                >{a.name}{#if a.id === 'claude-code'}<em>default</em>{/if}</span
              >
              <span class="choice-about">{ABOUT[a.id]}</span>
              {#if !there}<span class="choice-note">Not installed. <a href={a.site} target="_blank" rel="noreferrer">Get it</a></span>{/if}
            </span>
          </label>
        {/each}
        <label class="choice" class:on={engine === 'api'}>
          <input type="radio" name="engine" value="api" bind:group={engine} />
          <span class="choice-body">
            <span class="choice-name">A model API</span>
            <span class="choice-about">{ABOUT.api}</span>
          </span>
        </label>
      </div>
      {#if view.agentCommand && engine !== 'api'}
        <p class="note">The drawer runs <code>{view.agentCommand}</code>, set by hand in settings.json.</p>
      {/if}
      {#if engine !== view.tutor && tutor.running && tutor.mode === 'terminal'}
        <p class="note">Saving stops {tutor.name}, running in the drawer now. A question waiting for you stays open for the next tutor.</p>
      {/if}
    </section>

    {#if usesApi}
      <section class="block" aria-labelledby="api">
        <h2 id="api" class="section-title">The model API</h2>
        <div class="grid">
          <label for="provider">Provider</label>
          <div>
            <select
              id="provider"
              class="field"
              value={provider}
              onchange={(e) => pickProvider((e.currentTarget as HTMLSelectElement).value as ProviderId)}
            >
              {#each PROVIDERS as p (p.id)}<option value={p.id}>{p.name}{p.local ? ' (local)' : ''}</option>{/each}
            </select>
            <p class="hint">{HINT[provider]}</p>
          </div>

          <label for="base">Address</label>
          <input
            id="base"
            class="field"
            bind:value={baseUrl}
            placeholder={preset?.baseUrl || 'https://…/v1'}
            spellcheck="false"
            autocomplete="off"
          />

          <label for="key">API key</label>
          <div>
            <input
              id="key"
              class="field"
              type="password"
              bind:value={apiKey}
              placeholder={view.api.key && !removeKey
                ? `${view.api.key} saved: type a new one to replace it`
                : preset?.key
                  ? 'sk-…'
                  : 'None needed'}
              autocomplete="off"
              spellcheck="false"
              disabled={removeKey}
            />
            {#if view.api.key && !view.api.keyFromEnv}
              <label class="inline"><input type="checkbox" bind:checked={removeKey} /> Remove the saved key</label>
            {:else if view.api.keyFromEnv}
              <p class="hint">From ARISTOTLE_API_KEY.</p>
            {/if}
            <p class="hint">Kept in this install's settings.json, readable by you only, and never shown again.</p>
          </div>

          <label for="model">Model</label>
          <div>
            <input
              id="model"
              class="field"
              list="models"
              bind:value={model}
              onchange={pickModel}
              placeholder="e.g. anthropic/claude-sonnet-4.5, gpt-5.1, qwen3:30b"
              spellcheck="false"
              autocomplete="off"
            />
            <datalist id="models">
              {#each models as m (m.id)}<option value={m.id}>{m.name ?? ''}{m.tools === false ? ' (no tools)' : ''}</option>{/each}
            </datalist>
            <p class="hint">
              {modelsNote}
              {#if chosen?.tools === false}<strong class="warn">This model can't call tools; the tutor needs one that can.</strong>{/if}
              {#if chosen?.context}Context: {Math.round(chosen.context / 1000)}k tokens.{/if}
            </p>
          </div>

          <label for="helper">For glosses and chat</label>
          <div>
            <input
              id="helper"
              class="field"
              list="models"
              bind:value={helperModel}
              placeholder="The same model"
              spellcheck="false"
              autocomplete="off"
            />
            <p class="hint">A smaller, quicker model is enough for glosses, questions on a passage and the chat.</p>
          </div>

          <span></span>
          <label class="inline"
            ><input type="checkbox" bind:checked={vision} /> The model can see images (it then checks its drawings and reads real images)</label
          >
        </div>
      </section>
    {/if}

    <section class="block" aria-labelledby="helpers">
      <h2 id="helpers" class="section-title">Glosses, questions and the chat</h2>
      <p class="hint top">What explains a phrase you select, answers a question on a passage, and talks with you beside a lesson.</p>
      <div class="seg" role="radiogroup" aria-labelledby="helpers">
        <label class:on={helpers === 'claude-code'}
          ><input type="radio" name="helpers" value="claude-code" bind:group={helpers} disabled={!installed('claude-code')} /> Claude Code</label
        >
        <label class:on={helpers === 'api'}><input type="radio" name="helpers" value="api" bind:group={helpers} /> The model API</label>
      </div>
    </section>

    <footer class="save">
      <button class="primary" onclick={save} disabled={saving || !dirty}>{saving ? 'Saving…' : 'Save'}</button>
      {#if message}<p class={message.ok ? 'ok' : 'error'} role="status">{message.text}</p>{/if}
    </footer>
  {:else}
    <p class="muted">Loading…</p>
  {/if}
</div>

<style>
  .settings {
    max-width: 52rem;
  }

  .block {
    margin-bottom: 40px;
  }

  .choices {
    display: grid;
    gap: 8px;
  }

  .choice {
    display: flex;
    gap: 12px;
    align-items: flex-start;
    padding: 12px 14px;
    border: 1px solid var(--rule);
    border-radius: var(--radius-lg);
    cursor: pointer;
    transition:
      border-color 0.15s,
      background-color 0.15s;
  }

  .choice:hover {
    background: var(--b1);
  }

  .choice.on {
    border-color: var(--acc-line);
    background: var(--acc-soft);
  }

  .choice.missing:not(.on) {
    cursor: default;
    opacity: 0.7;
  }

  .choice input {
    margin-top: 4px;
    accent-color: var(--acc);
  }

  .choice-body {
    display: grid;
    gap: 2px;
  }

  .choice-name {
    font-weight: 600;
  }

  .choice-name em {
    margin-left: 8px;
    font-style: normal;
    font-weight: 500;
    font-size: 0.75rem;
    color: var(--faint);
  }

  .choice-about,
  .choice-note {
    font-size: 0.88rem;
    color: var(--muted);
  }

  .choice-note a {
    color: var(--acc);
  }

  .grid {
    display: grid;
    grid-template-columns: 11rem minmax(0, 1fr);
    gap: 14px 18px;
    align-items: start;
  }

  .grid > label {
    padding-top: 9px;
    font-size: 0.9rem;
    font-weight: 600;
    color: var(--fg-2);
  }

  select.field {
    appearance: auto;
  }

  .hint {
    margin: 6px 0 0;
    font-size: 0.82rem;
    color: var(--muted);
  }

  .hint.top {
    margin: -6px 0 12px;
  }

  .warn {
    color: var(--shaky);
    font-weight: 500;
  }

  .note {
    margin: 12px 0 0;
    font-size: 0.86rem;
    color: var(--muted);
  }

  .inline {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    margin-top: 8px;
    font-size: 0.88rem;
    color: var(--fg-2);
    cursor: pointer;
  }

  .inline input {
    accent-color: var(--acc);
  }

  .seg {
    display: inline-flex;
    padding: 3px;
    border: 1px solid var(--rule);
    border-radius: var(--radius-lg);
    background: var(--b1);
  }

  .seg label {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 6px 14px;
    border-radius: var(--radius);
    font-size: 0.9rem;
    cursor: pointer;
  }

  .seg label.on {
    background: var(--b0);
    box-shadow: 0 1px 2px rgb(0 0 0 / 0.08);
  }

  .seg input {
    position: absolute;
    opacity: 0;
    pointer-events: none;
  }

  .save {
    display: flex;
    align-items: center;
    gap: 16px;
    padding-top: 8px;
  }

  .save p {
    margin: 0;
    font-size: 0.9rem;
  }

  .ok {
    color: var(--solid);
  }

  @media (max-width: 640px) {
    .grid {
      grid-template-columns: minmax(0, 1fr);
      gap: 6px;
    }

    .grid > label {
      padding-top: 10px;
    }
  }
</style>

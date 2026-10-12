import type {I18n} from './i18n';

export interface DiscoveryAuthorizationStatus {
  schema_version: 1;
  status: 'active' | 'exhausted' | 'expired' | 'not_configured' | 'invalid';
  authorization_id: string | null;
  authorization_source: 'web' | 'legacy' | null;
  authorized_at: string | null;
  expires_at: string | null;
  google: {cap: number; starts: number; remaining: number};
  model_turns: {cap: number; starts: number; remaining: number};
  warnings: string[];
}

type Api = <T>(url: string, options?: RequestInit) => Promise<T>;
export interface DiscoveryAuthorizationOptions {
  api: Api;
  t: I18n['t'];
  getQuestion: () => string;
  onSearch: (authorizationId: string) => Promise<void>;
}

/** No search is made on mount, refresh, render, or an unapproved Arrow/Enter submission. */
export function mountDiscoveryAuthorization(host: HTMLElement, {api, t, getQuestion, onSearch}: DiscoveryAuthorizationOptions) {
  const doc = host.ownerDocument;
  const section = doc.createElement('section');
  section.className = 'user-control discovery-authorization';
  const heading = doc.createElement('h3');
  const limit = doc.createElement('p');
  limit.className = 'control-limit';
  const state = doc.createElement('div');
  state.className = 'authorization-state';
  state.setAttribute('role', 'status');
  const warnings = doc.createElement('div');
  warnings.className = 'control-warnings';
  const form = doc.createElement('form');
  form.className = 'control-form authorization-form';
  // This is a separate explicit operation, never the parent #chat-form submission.
  form.noValidate = true;
  const controls = [
    {key: 'authorization.google', name: 'google_cap', defaultValue: 1, max: 100},
    {key: 'authorization.turns', name: 'model_turn_cap', defaultValue: 1, max: 100},
    {key: 'authorization.minutes', name: 'valid_for_minutes', defaultValue: 30, max: 1440}
  ] as const;
  const fields = controls.map(spec => {
    const label = doc.createElement('label');
    const caption = doc.createElement('span');
    const input = doc.createElement('input');
    input.name = spec.name;
    input.type = 'number';
    input.min = '1';
    input.max = String(spec.max);
    input.step = '1';
    input.required = true;
    input.value = String(spec.defaultValue);
    label.append(caption, input);
    form.append(label);
    return {spec, caption, input};
  });
  const grant = doc.createElement('button');
  grant.type = 'submit';
  grant.className = 'control-primary';
  form.append(grant);
  const feedback = doc.createElement('p');
  feedback.setAttribute('role', 'alert');
  feedback.className = 'control-feedback';
  section.append(heading, limit, state, warnings, form, feedback);
  host.append(section);

  let current: DiscoveryAuthorizationStatus | null = null;
  let busy = false;
  let fetching = false;
  let requestSequence = 0;
  let problem: string | null = null;
  let hint: 'question' | 'range' | null = null;
  const active = (): boolean => current?.status === 'active' && !!current.authorization_id &&
    current.google.remaining > 0 && current.model_turns.remaining > 0 &&
    (current.expires_at === null || (Number.isFinite(Date.parse(current.expires_at)) && Date.parse(current.expires_at) > Date.now()));
  const text = (key: Parameters<typeof t>[0]) => t(key);

  function render(): void {
    heading.textContent = text('authorization.title');
    limit.textContent = text('authorization.limit');
    fields.forEach(({spec, caption}) => { caption.textContent = text(spec.key); });
    grant.textContent = text('authorization.grantAndSearch');
    grant.disabled = busy;
    state.replaceChildren();
    const status = doc.createElement('p');
    status.textContent = `${text('authorization.status')}: ${current ? text(`authorization.status.${current.status}`) : text(fetching ? 'authorization.status.checking' : 'authorization.status.unavailable')}`;
    state.append(status);
    if (current && current.status !== 'not_configured' && current.status !== 'invalid') {
      const source = doc.createElement('p');
      source.textContent = `${text('authorization.source')}: ${text(current.authorization_source === 'legacy' ? 'authorization.legacy' : 'authorization.web')}`;
      const counts = doc.createElement('p');
      counts.textContent = `${text('authorization.googleRemaining')}: ${current.google.remaining} / ${current.google.cap} (${current.google.starts} ${text('authorization.started')}) · ${text('authorization.turnsRemaining')}: ${current.model_turns.remaining} / ${current.model_turns.cap} (${current.model_turns.starts} ${text('authorization.started')})`;
      const dates = doc.createElement('p');
      dates.textContent = `${text('authorization.authorizedAt')}: ${current.authorized_at ?? text('status.notSupplied')} · ${text('authorization.expiresAt')}: ${current.expires_at ?? text('authorization.noExpiry')}`;
      state.append(source, counts, dates);
    }
    warnings.replaceChildren();
    for (const warning of current?.warnings ?? []) {
      const item = doc.createElement('p');
      item.textContent = warning; // Backend warnings are untrusted original text, never HTML.
      warnings.append(item);
    }
    feedback.textContent = problem ?? (hint ? text(hint === 'question' ? 'authorization.questionRequired' : 'authorization.invalidRange') : '');
    state.setAttribute('aria-busy', String(fetching));
  }

  async function refresh(): Promise<void> {
    const sequence = ++requestSequence;
    fetching = true;
    render();
    try {
      const response = await api<DiscoveryAuthorizationStatus>('/api/discovery/authorization');
      if (sequence !== requestSequence) return;
      current = response;
      problem = null;
    } catch (error) {
      if (sequence !== requestSequence) return;
      current = null; // A failed read is not a zero allowance or a reusable old grant.
      problem = error instanceof Error ? error.message : text('error.requestFailed');
    } finally {
      if (sequence === requestSequence) { fetching = false; render(); }
    }
  }

  form.addEventListener('submit', event => {
    event.preventDefault();
    event.stopPropagation(); // The form lives inside the Agent expansion, not the chat form.
    if (busy) return;
    hint = null;
    problem = null;
    if (!getQuestion().trim()) { hint = 'question'; render(); return; }
    const caps = fields.map(({spec, input}) => {
      const value = Number(input.value);
      return Number.isInteger(value) && value >= 1 && value <= spec.max && input.value.trim() !== '' ? value : null;
    });
    if (caps.some(value => value === null)) { hint = 'range'; render(); return; }
    busy = true;
    ++requestSequence; // Invalidate a read started before this explicit creation.
    render();
    void (async () => {
      let failure: string | null = null;
      try {
        const response = await api<DiscoveryAuthorizationStatus>('/api/discovery/authorization', {
          method: 'POST',
          headers: {'Content-Type': 'application/json', 'X-Office-User-Action': 'confirm'},
          body: JSON.stringify({google_cap: caps[0], model_turn_cap: caps[1], valid_for_minutes: caps[2], request_id: crypto.randomUUID()})
        });
        // Do not silently fall back to the previous or legacy receipt if creation failed.
        current = response;
        render();
        if (!active()) throw new Error(text('authorization.notActive'));
        await onSearch(response.authorization_id!);
      } catch (error) {
        failure = error instanceof Error ? error.message : text('error.requestFailed');
      } finally {
        busy = false;
        // Only read updated counters; never retry a failed POST or renew a receipt.
        await refresh();
        if (failure) { problem = failure; render(); }
      }
    })();
  });
  render();
  return {
    refresh,
    render,
    currentId: () => current?.authorization_id ?? null,
    canSearch: active
  };
}

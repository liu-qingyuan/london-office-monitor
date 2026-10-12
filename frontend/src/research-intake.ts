import type {I18n} from './i18n';
import type {Evidence, ResearchRecord, Source, SourceTopicId} from './types';

type Api = <T>(url: string, options?: RequestInit) => Promise<T>;
export interface ResearchIntakeOptions {
  api: Api;
  t: I18n['t'];
  /** Re-read Python research/cache only. Never call a model/search or recreate the map. */
  onAdmitted: () => Promise<void>;
}

interface DocumentDraft {
  id: string; file: File; url: string; publisher: string; title: string;
  published_at: string | null; usage_note: string;
}
interface CandidateDraft {
  id: string; document_id: string; topic_ids: SourceTopicId[]; kind: 'reported_statistic';
  metric: string; label: string; value: number; unit: string; source_geography: string;
  statistical_window: string; definition: string; denominator: string | null;
  billing_period: string | null; release_vintage: string | null;
  quote: string; context_quote: string; section: string; value_anchor: string;
}
interface IntakeCandidate {
  id: string; record: ResearchRecord & {billing_period?: string | null};
  sources: Source[]; evidence: Evidence[];
  assessment: {status: 'eligible' | 'needs_confirmation' | 'blocked' | 'duplicate'; reasons: {code: string; message: string; related_record_ids: string[]}[]};
  state: 'unapproved' | 'accepted' | 'awaiting_confirmation' | 'blocked' | 'rejected' | 'duplicate';
}
interface IntakeBatch {
  id: string; content_revision: string; created_at: string; authorized_at: string | null;
  candidates: IntakeCandidate[];
}
export interface ResearchBatches {
  schema_version: 1; data_kind: 'research_candidate_batches'; revision: number; batches: IntakeBatch[];
}

const topics: SourceTopicId[] = ['rents', 'vacancy', 'leasing', 'supply', 'submarkets', 'macro', 'demand', 'news'];
const topicNames = {
  rents: 'nav.rents', vacancy: 'nav.vacancy', leasing: 'nav.leasing', supply: 'nav.supply',
  submarkets: 'nav.market', macro: 'nav.macro', demand: 'nav.demand', news: 'nav.news'
} as const;
function httpsUrl(raw: string): string | null {
  try { const value = new URL(raw); return value.protocol === 'https:' && value.hostname && !value.username && !value.password ? value.href : null; }
  catch { return null; }
}
function jsonPost(body: unknown): RequestInit {
  return {method: 'POST', headers: {'Content-Type': 'application/json', 'X-Office-User-Action': 'confirm'}, body: JSON.stringify(body)};
}
function base64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Unable to read the selected original file.'));
    reader.onload = () => resolve(String(reader.result).split(',', 2)[1] ?? '');
    reader.readAsDataURL(file); // Actual user-selected bytes; never a path, URL fetch or search snippet.
  });
}

export function mountResearchIntake(host: HTMLElement, {api, t, onAdmitted}: ResearchIntakeOptions) {
  const doc = host.ownerDocument;
  const root = doc.createElement('section');
  root.className = 'user-control research-intake';
  const title = doc.createElement('h3');
  const limit = doc.createElement('p');
  limit.className = 'control-limit';
  const documentsForm = doc.createElement('form');
  documentsForm.className = 'control-form material-form';
  documentsForm.noValidate = true;
  const candidatesForm = doc.createElement('form');
  candidatesForm.className = 'control-form candidate-form';
  candidatesForm.noValidate = true;
  const materialHeading = doc.createElement('h4');
  const candidateHeading = doc.createElement('h4');
  const docControls = new Map<string, HTMLInputElement | HTMLTextAreaElement>();
  const candidateControls = new Map<string, HTMLInputElement | HTMLTextAreaElement>();
  function field(form: HTMLFormElement, name: string, key: Parameters<typeof t>[0],
    type: 'text' | 'url' | 'number' | 'file' | 'textarea', controls: Map<string, HTMLInputElement | HTMLTextAreaElement>, optional = false) {
    const label = doc.createElement('label');
    const caption = doc.createElement('span');
    const input = type === 'textarea' ? doc.createElement('textarea') : doc.createElement('input');
    input.name = name;
    if (input instanceof HTMLInputElement) input.type = type;
    input.required = !optional;
    if (type === 'number' && input instanceof HTMLInputElement) input.step = 'any';
    if (type === 'file' && input instanceof HTMLInputElement) input.accept = '.pdf,.html,.htm,.txt,application/pdf,text/html,text/plain';
    if (name === 'quote' || name === 'context_quote') input.maxLength = 600;
    input.autocomplete = 'off';
    label.append(caption, input);
    form.append(label);
    controls.set(name, input);
    return {caption, input, key};
  }
  const docFields = [
    field(documentsForm, 'file', 'intake.file', 'file', docControls),
    field(documentsForm, 'url', 'intake.url', 'url', docControls),
    field(documentsForm, 'publisher', 'intake.publisher', 'text', docControls),
    field(documentsForm, 'title', 'intake.sourceTitle', 'text', docControls),
    field(documentsForm, 'published_at', 'intake.published', 'text', docControls, true),
    field(documentsForm, 'usage_note', 'intake.usageNote', 'textarea', docControls)
  ];
  const addDocument = doc.createElement('button');
  addDocument.type = 'submit';
  documentsForm.append(addDocument);
  const documentList = doc.createElement('div');
  documentList.className = 'draft-documents';
  const documentLabel = doc.createElement('label');
  const documentCaption = doc.createElement('span');
  const documentSelect = doc.createElement('select');
  documentSelect.name = 'document_id';
  documentLabel.append(documentCaption, documentSelect);
  candidatesForm.append(documentLabel);
  const topicLabel = doc.createElement('fieldset');
  const topicCaption = doc.createElement('legend');
  topicLabel.append(topicCaption);
  const topicControls = topics.map(id => {
    const label = doc.createElement('label');
    const input = doc.createElement('input');
    input.type = 'checkbox';
    input.name = 'topics';
    input.value = id;
    const caption = doc.createElement('span');
    label.append(input, caption);
    topicLabel.append(label);
    return {id, caption, input};
  });
  candidatesForm.append(topicLabel);
  const candidateFields = [
    field(candidatesForm, 'metric', 'intake.metric', 'text', candidateControls),
    field(candidatesForm, 'label', 'intake.label', 'text', candidateControls),
    field(candidatesForm, 'value', 'intake.value', 'number', candidateControls),
    field(candidatesForm, 'unit', 'intake.unit', 'text', candidateControls),
    field(candidatesForm, 'source_geography', 'intake.geography', 'text', candidateControls),
    field(candidatesForm, 'statistical_window', 'intake.window', 'text', candidateControls),
    field(candidatesForm, 'definition', 'intake.definition', 'textarea', candidateControls),
    field(candidatesForm, 'denominator', 'intake.denominator', 'text', candidateControls, true),
    field(candidatesForm, 'billing_period', 'intake.billing', 'text', candidateControls, true),
    field(candidatesForm, 'release_vintage', 'intake.vintage', 'text', candidateControls, true),
    field(candidatesForm, 'quote', 'intake.quote', 'textarea', candidateControls),
    field(candidatesForm, 'context_quote', 'intake.contextQuote', 'textarea', candidateControls, true),
    field(candidatesForm, 'section', 'intake.section', 'text', candidateControls),
    field(candidatesForm, 'value_anchor', 'intake.anchor', 'text', candidateControls)
  ];
  const anchorHelp = doc.createElement('p');
  anchorHelp.className = 'control-limit';
  candidatesForm.append(anchorHelp);
  const addCandidate = doc.createElement('button');
  addCandidate.type = 'submit';
  candidatesForm.append(addCandidate);
  const draftList = doc.createElement('div');
  draftList.className = 'draft-candidates';
  const submitBatch = doc.createElement('button');
  submitBatch.type = 'button';
  submitBatch.className = 'control-primary stage-batch';
  const feedback = doc.createElement('p');
  feedback.className = 'control-feedback';
  feedback.setAttribute('role', 'alert');
  const batchesHeading = doc.createElement('h4');
  const batchesView = doc.createElement('div');
  batchesView.className = 'intake-batches';
  root.append(title, limit, materialHeading, documentsForm, documentList, candidateHeading,
    candidatesForm, draftList, submitBatch, feedback, batchesHeading, batchesView);
  host.append(root);

  let documents: DocumentDraft[] = [];
  let candidates: CandidateDraft[] = [];
  let documentIndex = 1, candidateIndex = 1;
  let batches: ResearchBatches | null = null;
  let busy = false;
  let error: string | null = null;
  let hint: 'material' | 'candidate' | 'anchor' | 'document' | 'url' | 'file' | 'quote' | 'reason' | null = null;
  let readSequence = 0;
  const reasons = new Map<string, string>();
  const getDoc = (name: string) => docControls.get(name)!;
  const getCandidate = (name: string) => candidateControls.get(name)!;
  const value = (input: HTMLInputElement | HTMLTextAreaElement) => input.value.trim();
  const optional = (name: string) => value(getCandidate(name)) || null;
  const say = (key: Parameters<typeof t>[0]) => t(key);
  function fail(code: NonNullable<typeof hint>): void { hint = code; render(); }

  function renderDraft(): void {
    const selected = documentSelect.value;
    documentSelect.replaceChildren();
    for (const item of documents) {
      const option = doc.createElement('option');
      option.value = item.id;
      option.textContent = `${item.id} · ${item.file.name} · ${item.publisher}`;
      documentSelect.append(option);
    }
    if (documents.some(item => item.id === selected)) documentSelect.value = selected;
    documentList.replaceChildren();
    for (const item of documents) {
      const p = doc.createElement('p');
      p.textContent = `${item.id} · ${item.file.name} · ${item.publisher} · ${item.title}`;
      documentList.append(p);
    }
    draftList.replaceChildren();
    for (const candidate of candidates) {
      const p = doc.createElement('p');
      const source = documents.find(item => item.id === candidate.document_id);
      p.textContent = `${candidate.id} · ${candidate.label}: ${candidate.value} ${candidate.unit} · ${source?.file.name ?? candidate.document_id}`;
      draftList.append(p);
    }
    submitBatch.disabled = busy || !candidates.length;
    addDocument.disabled = busy;
    addCandidate.disabled = busy || !documents.length;
  }

  function renderBatches(): void {
    // Decision reasons are held outside the DOM so a language-only render cannot discard typed input.
    batchesView.replaceChildren();
    if (!batches) return;
    if (!batches.batches.length) {
      const empty = doc.createElement('p');
      empty.textContent = say('intake.noBatches');
      batchesView.append(empty);
    }
    for (const batch of batches.batches) {
      const panel = doc.createElement('article');
      panel.className = 'intake-batch';
      panel.dataset.batchId = batch.id;
      const heading = doc.createElement('h5');
      heading.textContent = `${say('intake.batch')} ${batch.id} · ${say('intake.revision')} ${batch.content_revision}`;
      const date = doc.createElement('p');
      date.className = 'control-limit';
      date.textContent = `${say('intake.created')}: ${batch.created_at} · ${say('intake.authorized')}: ${batch.authorized_at ?? say('intake.notAuthorized')}`;
      panel.append(heading, date);
      if (batch.authorized_at === null) {
        const approve = doc.createElement('button');
        approve.type = 'button';
        approve.className = 'authorize-batch control-primary';
        approve.disabled = busy;
        approve.textContent = say('intake.authorizeBatch');
        approve.addEventListener('click', () => void operate(`/api/research/batches/${encodeURIComponent(batch.id)}/authorize`,
          {content_revision: batch.content_revision}, true));
        panel.append(approve);
      }
      for (const candidate of batch.candidates) {
        const card = doc.createElement('article');
        card.className = 'intake-candidate';
        card.dataset.candidateId = candidate.id;
        const record = candidate.record;
        const label = doc.createElement('h6');
        label.textContent = record.label;
        const status = doc.createElement('p');
        status.className = 'control-status';
        status.textContent = `${say(`intake.assessment.${candidate.assessment.status}`)} · ${say(`intake.state.${candidate.state}`)}`;
        const measured = doc.createElement('strong');
        measured.className = 'intake-value';
        measured.textContent = record.value === null ? say('intake.noValue') : `${record.value} ${record.unit ?? ''}`;
        card.append(label, status, measured);
        const metadata = [
          ['intake.metric', record.metric], ['intake.geography', record.source_geography],
          ['intake.window', record.statistical_window], ['intake.definition', record.definition],
          ['intake.denominator', record.denominator], ['intake.billing', record.billing_period],
          ['intake.vintage', record.release_vintage]
        ] as const;
        for (const [key, detail] of metadata) {
          const p = doc.createElement('p');
          p.className = 'control-detail';
          p.textContent = `${say(key)}: ${detail ?? say('status.notStated')}`;
          card.append(p);
        }
        for (const source of candidate.sources) {
          const p = doc.createElement('p');
          p.className = 'intake-source';
          p.append(`${say('intake.source')}: ${source.publisher} · ${source.title} · ${source.published_at ?? say('status.notStated')} · `);
          const href = httpsUrl(source.url);
          if (href) {
            const a = doc.createElement('a');
            a.href = href;
            a.target = '_blank';
            a.rel = 'noopener noreferrer';
            a.textContent = say('button.originalSource');
            p.append(a);
          } else p.append(say('status.originalLinkUnavailable'));
          card.append(p);
        }
        for (const evidence of candidate.evidence) {
          const quote = doc.createElement('blockquote');
          quote.textContent = evidence.quote; // Original uploaded excerpt, not translated or interpreted as HTML.
          const section = doc.createElement('cite');
          section.textContent = evidence.section;
          quote.append(section);
          card.append(quote);
        }
        for (const reason of candidate.assessment.reasons) {
          const p = doc.createElement('p');
          p.className = 'warning';
          p.textContent = `${reason.code}: ${reason.message}${reason.related_record_ids.length ? ` · ${say('intake.related')}: ${reason.related_record_ids.join(', ')}` : ''}`;
          card.append(p);
        }
        if (batch.authorized_at !== null && candidate.assessment.status === 'needs_confirmation' && candidate.state === 'awaiting_confirmation') {
          const key = `${batch.id}/${candidate.id}`;
          const decision = doc.createElement('div');
          decision.className = 'intake-decision';
          const reasonLabel = doc.createElement('label');
          const caption = doc.createElement('span');
          caption.textContent = say('intake.decisionReason');
          const input = doc.createElement('textarea');
          input.className = 'decision-reason';
          input.value = reasons.get(key) ?? '';
          input.required = true;
          input.addEventListener('input', () => reasons.set(key, input.value));
          reasonLabel.append(caption, input);
          decision.append(reasonLabel);
          for (const action of ['accept', 'reject'] as const) {
            const button = doc.createElement('button');
            button.type = 'button';
            button.disabled = busy;
            button.className = `decide-${action}`;
            button.textContent = say(action === 'accept' ? 'intake.accept' : 'intake.reject');
            button.addEventListener('click', () => {
              const why = input.value.trim();
              if (!why) { fail('reason'); return; }
              void operate(`/api/research/batches/${encodeURIComponent(batch.id)}/decisions`,
                {content_revision: batch.content_revision, candidate_id: candidate.id, decision: action, reason: why}, action === 'accept');
            });
            decision.append(button);
          }
          card.append(decision);
        }
        panel.append(card);
      }
      batchesView.append(panel);
    }
  }

  function render(): void {
    title.textContent = say('intake.title');
    limit.textContent = say('intake.limit');
    materialHeading.textContent = say('intake.materialHeading');
    candidateHeading.textContent = say('intake.candidateHeading');
    batchesHeading.textContent = say('intake.batchesHeading');
    documentCaption.textContent = say('intake.document');
    topicCaption.textContent = say('intake.topics');
    topicControls.forEach(({id, caption}) => { caption.textContent = say(topicNames[id]); });
    [...docFields, ...candidateFields].forEach(({caption, key}) => { caption.textContent = say(key); });
    addDocument.textContent = say('intake.addDocument');
    addCandidate.textContent = say('intake.addCandidate');
    submitBatch.textContent = say('intake.stage');
    anchorHelp.textContent = say('intake.anchorHelp');
    feedback.textContent = error ?? (hint ? say(`intake.error.${hint}`) : '');
    renderDraft();
    renderBatches();
  }

  async function refresh(): Promise<void> {
    const sequence = ++readSequence;
    try {
      const result = await api<ResearchBatches>('/api/research/batches');
      if (sequence !== readSequence) return;
      batches = result;
      error = null;
    } catch (failure) {
      if (sequence !== readSequence) return;
      error = failure instanceof Error ? failure.message : say('error.requestFailed');
    } finally { if (sequence === readSequence) render(); }
  }

  async function operate(path: string, body: unknown, admits: boolean): Promise<void> {
    if (busy) return;
    busy = true; hint = null; error = null; render();
    try {
      await api<unknown>(path, jsonPost(body));
      await refresh();
      if (admits) await onAdmitted();
    } catch (failure) {
      error = failure instanceof Error ? failure.message : say('error.requestFailed');
    } finally { busy = false; render(); }
  }

  documentsForm.addEventListener('submit', event => {
    event.preventDefault(); event.stopPropagation();
    if (busy) return;
    error = null; hint = null;
    const file = (getDoc('file') as HTMLInputElement).files?.[0];
    if (!file || !/\.(pdf|html?|txt)$/i.test(file.name) || !file.size ||
      documents.reduce((total, item) => total + item.file.size, file.size) > 5_000_000) { fail('file'); return; }
    const url = httpsUrl(value(getDoc('url')));
    if (!url) { fail('url'); return; }
    if (['publisher', 'title', 'usage_note'].some(name => !value(getDoc(name)))) { fail('material'); return; }
    documents.push({id: `document-${documentIndex++}`, file, url,
      publisher: value(getDoc('publisher')), title: value(getDoc('title')),
      published_at: value(getDoc('published_at')) || null, usage_note: value(getDoc('usage_note'))});
    // Retain the user's field values and File until they deliberately change them or the batch succeeds.
    render();
  });
  candidatesForm.addEventListener('submit', event => {
    event.preventDefault(); event.stopPropagation();
    if (busy) return;
    error = null; hint = null;
    const selected = topicControls.filter(({input}) => input.checked).map(({id}) => id);
    const required = ['metric', 'label', 'unit', 'source_geography', 'statistical_window', 'definition', 'quote', 'section', 'value_anchor'];
    const number = Number(getCandidate('value').value);
    if (!documents.some(item => item.id === documentSelect.value) || !selected.length || required.some(name => !value(getCandidate(name))) || !getCandidate('value').value.trim() || !Number.isFinite(number)) { fail('candidate'); return; }
    const quote = getCandidate('quote').value;
    const context = getCandidate('context_quote').value;
    if (quote.length > 600 || context.length > 600) { fail('quote'); return; }
    if (!quote.includes(value(getCandidate('value_anchor')))) { fail('anchor'); return; }
    candidates.push({
      id: `candidate-${candidateIndex++}`, document_id: documentSelect.value, topic_ids: selected,
      kind: 'reported_statistic', metric: value(getCandidate('metric')), label: value(getCandidate('label')),
      value: number, unit: value(getCandidate('unit')), source_geography: value(getCandidate('source_geography')),
      statistical_window: value(getCandidate('statistical_window')), definition: value(getCandidate('definition')),
      denominator: optional('denominator'), billing_period: optional('billing_period'), release_vintage: optional('release_vintage'),
      quote, context_quote: context, section: value(getCandidate('section')),
      value_anchor: value(getCandidate('value_anchor'))
    });
    render();
  });
  submitBatch.addEventListener('click', () => {
    if (busy || !candidates.length) return;
    busy = true; hint = null; error = null; render();
    void (async () => {
      try {
        const payload = {
          documents: await Promise.all(documents.map(async item => ({id: item.id, filename: item.file.name,
            content_base64: await base64(item.file), url: item.url, publisher: item.publisher, title: item.title,
            published_at: item.published_at, usage_note: item.usage_note}))), candidates
        };
        await api<unknown>('/api/research/batches', jsonPost(payload));
        documents = []; candidates = []; documentIndex = 1; candidateIndex = 1;
        // Clear only after successful staging; an unsuccessful POST leaves the original File and draft intact.
        documentsForm.reset(); candidatesForm.reset();
        await refresh();
      } catch (failure) { error = failure instanceof Error ? failure.message : say('error.requestFailed'); }
      finally { busy = false; render(); }
    })();
  });
  render();
  return {refresh, render};
}

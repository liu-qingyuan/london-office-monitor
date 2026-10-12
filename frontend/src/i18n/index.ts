import {en, type Dictionary, type MessageKey} from './en';
import {zhHans} from './zh-Hans';
import {zhHant} from './zh-Hant';

export type {MessageKey} from './en';
export const languages = Object.freeze(['en', 'zh-Hans', 'zh-Hant'] as const);
export type Language = typeof languages[number];
export const languageNames: Readonly<Record<Language, string>> = Object.freeze({
  en: 'English', 'zh-Hans': '简体中文', 'zh-Hant': '繁體中文'
});
export const dictionaries: Readonly<Record<Language, Dictionary>> = Object.freeze({
  en, 'zh-Hans': zhHans, 'zh-Hant': zhHant
});

export function isLanguage(value: unknown): value is Language {
  return languages.some(language => language === value);
}

/** For explicitly mapped UI codes only; arbitrary research text is never translated. */
export function isMessageKey(value: unknown): value is MessageKey {
  return typeof value === 'string' && Object.hasOwn(en, value);
}

/** Set the provided element's lang attribute; no document scan, rendering, storage or I/O. */
export function applyLanguage(root: Pick<HTMLElement, 'lang'>, language: Language): void {
  if (!isLanguage(language)) throw new RangeError(`Unsupported UI language: ${language}`);
  root.lang = language;
}

export type MessageParams = Readonly<Record<string, string | number>>;

export interface I18n {
  readonly language: Language;
  /** Plain text, not HTML. Required placeholders must be supplied; values are inserted verbatim. */
  t(key: MessageKey, parameters?: MessageParams): string;
  setLanguage(language: Language): void;
  /** Synchronous, change-only notification. Registration does not render or invoke any application operation. */
  subscribe(listener: (language: Language) => void): () => void;
}

/** English by default; each instance owns only its in-memory language. */
export function createI18n(): I18n {
  let language: Language = 'en';
  const listeners = new Set<(language: Language) => void>();
  return {
    get language() { return language; },
    t(key, parameters = {}) {
      if (!Object.hasOwn(dictionaries[language], key)) throw new RangeError(`Unknown UI message: ${key}`);
      return dictionaries[language][key].replace(/\{([A-Za-z][A-Za-z0-9_]*)\}/g, (_placeholder, name: string) => {
        const value = parameters[name];
        if (!Object.hasOwn(parameters, name) || (typeof value !== 'string' && typeof value !== 'number')) {
          throw new TypeError(`Missing interpolation parameter "${name}" for ${key}`);
        }
        return String(value);
      });
    },
    setLanguage(next) {
      if (!isLanguage(next)) throw new RangeError(`Unsupported UI language: ${next}`);
      if (next === language) return;
      language = next;
      for (const listener of listeners) listener(language);
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    }
  };
}

/** Append a native selector to an explicit host. Only its own DOM and the memory store change.
 * Apply the language to <html> and re-render presentation in the application's subscriber.
 * The returned disposer removes this selector and its subscriptions, not the host's other content.
 */
export function mountLanguageSelector(host: HTMLElement, i18n: I18n): () => void {
  const document = host.ownerDocument;
  const control = document.createElement('label');
  control.className = 'language-switch';
  const caption = document.createElement('span');
  caption.className = 'language-switch-label';
  const select = document.createElement('select');
  select.name = 'language';
  for (const language of languages) {
    const option = document.createElement('option');
    option.value = language;
    option.lang = language;
    option.textContent = languageNames[language];
    select.append(option);
  }
  control.append(caption, select);
  host.append(control);
  const render = () => {
    caption.textContent = i18n.t('language.label');
    select.value = i18n.language;
  };
  const onChange = () => {
    if (isLanguage(select.value)) i18n.setLanguage(select.value);
  };
  select.addEventListener('change', onChange);
  render();
  const unsubscribe = i18n.subscribe(render);
  return () => {
    unsubscribe();
    select.removeEventListener('change', onChange);
    control.remove();
  };
}

'use client';

import { createHighlighterCore, type HighlighterCore, type LanguageInput } from 'shiki/core';
import { createJavaScriptRegexEngine } from 'shiki/engine/javascript';
import githubDark from 'shiki/dist/themes/github-dark.mjs';
import githubLight from 'shiki/dist/themes/github-light.mjs';
import { useEffect, useState } from 'react';

type LanguageModule = { default: LanguageInput };
const languageLoaders: Record<string, () => Promise<LanguageModule>> = {
  bash: () => import('shiki/dist/langs/bash.mjs'),
  c: () => import('shiki/dist/langs/c.mjs'),
  cpp: () => import('shiki/dist/langs/cpp.mjs'),
  csharp: () => import('shiki/dist/langs/csharp.mjs'),
  css: () => import('shiki/dist/langs/css.mjs'),
  go: () => import('shiki/dist/langs/go.mjs'),
  html: () => import('shiki/dist/langs/html.mjs'),
  java: () => import('shiki/dist/langs/java.mjs'),
  javascript: () => import('shiki/dist/langs/javascript.mjs'),
  json: () => import('shiki/dist/langs/json.mjs'),
  kotlin: () => import('shiki/dist/langs/kotlin.mjs'),
  php: () => import('shiki/dist/langs/php.mjs'),
  python: () => import('shiki/dist/langs/python.mjs'),
  ruby: () => import('shiki/dist/langs/ruby.mjs'),
  rust: () => import('shiki/dist/langs/rust.mjs'),
  sql: () => import('shiki/dist/langs/sql.mjs'),
  swift: () => import('shiki/dist/langs/swift.mjs'),
  typescript: () => import('shiki/dist/langs/typescript.mjs'),
  yaml: () => import('shiki/dist/langs/yaml.mjs'),
};
let highlighterPromise: Promise<HighlighterCore> | null = null;
const loadingLanguages = new Map<string, Promise<void>>();

export default function HighlightedCode({
  value,
  language,
  className,
}: {
  value: string;
  language?: string | null;
  className: string;
}) {
  const [markup, setMarkup] = useState<string | null>(null);
  const normalizedLanguage = language && language in languageLoaders ? language : 'text';
  useEffect(() => {
    let active = true;
    setMarkup(null);
    void highlightCode(value, normalizedLanguage)
      .then((html) => {
        if (active) setMarkup(html);
      })
      .catch(() => {
        if (active) setMarkup(null);
      });
    return () => {
      active = false;
    };
  }, [normalizedLanguage, value]);
  if (!markup)
    return (
      <pre className={`bg-surface-muted max-w-full overflow-x-auto rounded-xl p-4 ${className}`}>
        <code>{value}</code>
      </pre>
    );
  return (
    <div
      className={`rm-code max-w-full overflow-x-auto rounded-xl ${className}`}
      dangerouslySetInnerHTML={{ __html: markup }}
    />
  );
}

async function highlightCode(value: string, language: string): Promise<string> {
  highlighterPromise ??= createHighlighterCore({
    themes: [githubLight, githubDark],
    langs: [],
    engine: createJavaScriptRegexEngine(),
  });
  const highlighter = await highlighterPromise;
  if (language !== 'text' && !highlighter.getLoadedLanguages().includes(language)) {
    let loading = loadingLanguages.get(language);
    if (!loading) {
      loading = languageLoaders[language]!().then(async ({ default: grammar }) => {
        await highlighter.loadLanguage(grammar);
      });
      loadingLanguages.set(language, loading);
    }
    await loading;
  }
  return highlighter.codeToHtml(value, {
    lang: language,
    themes: { light: 'github-light', dark: 'github-dark' },
    defaultColor: false,
  });
}

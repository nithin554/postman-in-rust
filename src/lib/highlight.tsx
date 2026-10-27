import { useMemo, type ReactNode } from 'react';
import { cx } from '../lib/utils';

const MAX_HIGHLIGHT_LENGTH = 180_000;

const JSON_TOKEN =
  /("(?:\\.|[^"\\])*")(?=\s*:)|("(?:\\.|[^"\\])*")|\b(true|false)\b|\b(null)\b|(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/g;

function jsonNodes(code: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  let lastIndex = 0;
  let key = 0;
  let match: RegExpExecArray | null;
  JSON_TOKEN.lastIndex = 0;

  const pushGap = (end: number) => {
    if (end <= lastIndex) return;
    nodes.push(
      <span key={`p${key++}`} className="tok-punc">
        {code.slice(lastIndex, end)}
      </span>,
    );
  };

  while ((match = JSON_TOKEN.exec(code)) !== null) {
    pushGap(match.index);
    if (match[1] !== undefined) {
      nodes.push(
        <span key={`k${key++}`} className="tok-key">
          {match[1]}
        </span>,
      );
    } else if (match[2] !== undefined) {
      nodes.push(
        <span key={`s${key++}`} className="tok-str">
          {match[2]}
        </span>,
      );
    } else if (match[3] !== undefined) {
      nodes.push(
        <span key={`b${key++}`} className="tok-bool">
          {match[3]}
        </span>,
      );
    } else if (match[4] !== undefined) {
      nodes.push(
        <span key={`n${key++}`} className="tok-null">
          {match[4]}
        </span>,
      );
    } else if (match[5] !== undefined) {
      nodes.push(
        <span key={`d${key++}`} className="tok-num">
          {match[5]}
        </span>,
      );
    }
    lastIndex = match.index + match[0].length;
  }

  pushGap(code.length);
  return nodes;
}

const TAG_BLOCK = /<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>|<\/?[A-Za-z][^>]*>/g;

function markupNode(tag: string, keyPrefix: string): ReactNode[] {
  if (tag.startsWith('<!--')) {
    return [
      <span key={keyPrefix} className="tok-comment">
        {tag}
      </span>,
    ];
  }
  if (tag.startsWith('<![CDATA[')) {
    return [
      <span key={keyPrefix} className="tok-str">
        {tag}
      </span>,
    ];
  }

  const opening = /^<(\/?)([A-Za-z][\w:.-]*)/.exec(tag);
  if (!opening) return [tag];

  const nodes: ReactNode[] = [
    <span key={`${keyPrefix}-p0`} className="tok-punc">
      {'<'}
    </span>,
  ];
  if (opening[1]) {
    nodes.push(
      <span key={`${keyPrefix}-p1`} className="tok-punc">
        {'/'}
      </span>,
    );
  }
  nodes.push(
    <span key={`${keyPrefix}-tag`} className="tok-tag">
      {opening[2]}
    </span>,
  );

  const rest = tag.slice(opening[0].length);
  const attribute = /([\w:-]+)(\s*=\s*("[^"]*"|'[^']*'|[^\s>]+))?/g;
  let cursor = 0;
  let index = 0;
  let attrs: RegExpExecArray | null;

  while ((attrs = attribute.exec(rest)) !== null) {
    if (attrs.index > cursor) {
      nodes.push(
        <span key={`${keyPrefix}-gap${index}`} className="tok-punc">
          {rest.slice(cursor, attrs.index)}
        </span>,
      );
    }
    nodes.push(
      <span key={`${keyPrefix}-attr${index}`} className="tok-attr">
        {attrs[1]}
      </span>,
    );
    if (attrs[2]) {
      const equals = /^(\s*=\s*)/.exec(attrs[2]);
      const prefix = equals?.[1] ?? '';
      if (prefix) {
        nodes.push(
          <span key={`${keyPrefix}-eq${index}`} className="tok-punc">
            {prefix}
          </span>,
        );
      }
      nodes.push(
        <span key={`${keyPrefix}-val${index}`} className="tok-str">
          {attrs[2].slice(prefix.length)}
        </span>,
      );
    }
    cursor = attrs.index + attrs[0].length;
    index += 1;
  }

  if (cursor < rest.length) {
    nodes.push(
      <span key={`${keyPrefix}-tail`} className="tok-punc">
        {rest.slice(cursor)}
      </span>,
    );
  }

  return nodes;
}

function markupNodes(code: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  let lastIndex = 0;
  let key = 0;
  let match: RegExpExecArray | null;
  TAG_BLOCK.lastIndex = 0;

  while ((match = TAG_BLOCK.exec(code)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(code.slice(lastIndex, match.index));
    }
    nodes.push(...markupNode(match[0], `t${key++}`));
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < code.length) nodes.push(code.slice(lastIndex));
  return nodes;
}

const CODE_TOKEN =
  /(\/\/[^\n]*|#[^\n]*|\/\*[\s\S]*?\*\/)|("(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*'|`(?:\\.|[^`\\])*`)|\b(const|let|var|function|return|if|else|for|while|await|async|new|import|from|export|default|fn|pub|use|struct|impl|mut|match|def|class|print|self|in|as|true|false|null|None|True|False)\b|\b(\d+(?:\.\d+)?)\b/g;

function codeNodes(code: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  let lastIndex = 0;
  let key = 0;
  let match: RegExpExecArray | null;
  CODE_TOKEN.lastIndex = 0;

  const pushGap = (end: number) => {
    if (end <= lastIndex) return;
    nodes.push(code.slice(lastIndex, end));
  };

  while ((match = CODE_TOKEN.exec(code)) !== null) {
    pushGap(match.index);
    if (match[1] !== undefined) {
      nodes.push(
        <span key={`c${key++}`} className="tok-comment">
          {match[1]}
        </span>,
      );
    } else if (match[2] !== undefined) {
      nodes.push(
        <span key={`s${key++}`} className="tok-str">
          {match[2]}
        </span>,
      );
    } else if (match[3] !== undefined) {
      nodes.push(
        <span key={`k${key++}`} className="tok-kw">
          {match[3]}
        </span>,
      );
    } else if (match[4] !== undefined) {
      nodes.push(
        <span key={`n${key++}`} className="tok-num">
          {match[4]}
        </span>,
      );
    }
    lastIndex = match.index + match[0].length;
  }

  pushGap(code.length);
  return nodes;
}

export type CodeLanguage =
  | 'json'
  | 'xml'
  | 'html'
  | 'javascript'
  | 'python'
  | 'rust'
  | 'curl'
  | 'plain'
  | 'text';

export function highlight(code: string, language: CodeLanguage): ReactNode {
  if (!code || code.length > MAX_HIGHLIGHT_LENGTH) return code;
  switch (language) {
    case 'json':
      return jsonNodes(code);
    case 'xml':
    case 'html':
      return markupNodes(code);
    case 'javascript':
    case 'python':
    case 'rust':
    case 'curl':
      return codeNodes(code);
    default:
      return code;
  }
}

interface CodeProps {
  code: string;
  language?: CodeLanguage;
  wrap?: boolean;
  className?: string;
  ariaLabel?: string;
}

export function Code({
  code,
  language = 'plain',
  wrap = false,
  className,
  ariaLabel,
}: CodeProps) {
  const nodes = useMemo(() => highlight(code, language), [code, language]);

  return (
    <pre
      className={cx('code-block', wrap && 'is-wrapped', className)}
      aria-label={ariaLabel}
      tabIndex={0}
    >
      {nodes}
    </pre>
  );
}

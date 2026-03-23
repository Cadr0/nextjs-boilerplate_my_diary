"use client";

import { Fragment } from "react";

type ChatRichTextProps = {
  content: string;
  compact?: boolean;
};

type ParsedBlock =
  | { type: "heading"; level: 1 | 2 | 3; text: string }
  | { type: "ul"; items: string[] }
  | { type: "ol"; items: string[] }
  | { type: "quote"; lines: string[] }
  | { type: "paragraph"; text: string }
  | { type: "code"; language: string; code: string };

type InlineToken =
  | { type: "text"; value: string }
  | { type: "strong"; value: string }
  | { type: "code"; value: string };

const headingPattern = /^\s{0,3}(#{1,3})\s*(.+)$/;
const unorderedPattern = /^\s*[-*]\s+(.+)$/;
const orderedPattern = /^\s*(?:\*\*)?(\d+)\.(?:\*\*)?\s*(.+?)\s*(?:\*\*)?$/;
const quotePattern = /^\s*>\s?(.*)$/;
const codeFencePattern = /^\s*```([a-zA-Z0-9_-]+)?\s*$/;

function normalizeMarkdown(input: string) {
  return input
    .replace(/\r\n?/g, "\n")
    .replace(/(^|\n)(#{1,3})(?=\S)/g, "$1$2 ")
    .replace(/([^\n])\s+(#{1,3}\s*\*{0,2})/g, "$1\n\n$2")
    .replace(/(\S)\s+(\*{0,2}\d+\.\*{0,2}\s*)/g, "$1\n$2")
    .replace(/(\*{2}\s*)(\d+\.)/g, "$1\n$2 ")
    .replace(/(\*\*|__)\s*(?=#{1,3}\s)/g, "$1\n");
}

function isBoundaryLine(line: string) {
  return (
    headingPattern.test(line) ||
    unorderedPattern.test(line) ||
    orderedPattern.test(line) ||
    quotePattern.test(line) ||
    codeFencePattern.test(line)
  );
}

function parseInline(text: string): InlineToken[] {
  const tokens: InlineToken[] = [];
  const tokenPattern = /(`[^`]+`|\*\*[^*]+\*\*|__[^_]+__)/g;
  let cursor = 0;

  for (const match of text.matchAll(tokenPattern)) {
    const value = match[0];
    const index = match.index ?? 0;

    if (index > cursor) {
      tokens.push({ type: "text", value: text.slice(cursor, index) });
    }

    if ((value.startsWith("**") && value.endsWith("**")) || (value.startsWith("__") && value.endsWith("__"))) {
      tokens.push({ type: "strong", value: value.slice(2, -2) });
    } else if (value.startsWith("`") && value.endsWith("`")) {
      tokens.push({ type: "code", value: value.slice(1, -1) });
    } else {
      tokens.push({ type: "text", value });
    }

    cursor = index + value.length;
  }

  if (cursor < text.length) {
    tokens.push({ type: "text", value: text.slice(cursor) });
  }

  return tokens;
}

function renderInline(text: string, keyPrefix: string) {
  const tokens = parseInline(text);

  return tokens.map((token, index) => {
    const key = `${keyPrefix}-${index}`;

    if (token.type === "strong") {
      return (
        <strong key={key} className="font-semibold text-[var(--foreground)]">
          {token.value}
        </strong>
      );
    }

    if (token.type === "code") {
      return (
        <code
          key={key}
          className="rounded-md border border-[rgba(24,33,29,0.12)] bg-[rgba(24,33,29,0.06)] px-1.5 py-0.5 font-mono text-[0.85em]"
        >
          {token.value}
        </code>
      );
    }

    return <Fragment key={key}>{token.value}</Fragment>;
  });
}

function parseBlocks(markdown: string): ParsedBlock[] {
  const blocks: ParsedBlock[] = [];
  const lines = normalizeMarkdown(markdown).split("\n");
  let index = 0;

  while (index < lines.length) {
    const line = lines[index] ?? "";

    if (!line.trim()) {
      index += 1;
      continue;
    }

    const codeMatch = line.match(codeFencePattern);
    if (codeMatch) {
      const language = codeMatch[1] ?? "";
      const codeLines: string[] = [];
      index += 1;

      while (index < lines.length && !codeFencePattern.test(lines[index] ?? "")) {
        codeLines.push(lines[index] ?? "");
        index += 1;
      }

      if (index < lines.length && codeFencePattern.test(lines[index] ?? "")) {
        index += 1;
      }

      blocks.push({
        type: "code",
        language,
        code: codeLines.join("\n"),
      });
      continue;
    }

    const headingMatch = line.match(headingPattern);
    if (headingMatch) {
      const level = Math.min(3, headingMatch[1].length) as 1 | 2 | 3;
      blocks.push({
        type: "heading",
        level,
        text: headingMatch[2].trim(),
      });
      index += 1;
      continue;
    }

    const ulMatch = line.match(unorderedPattern);
    if (ulMatch) {
      const items: string[] = [];

      while (index < lines.length) {
        const itemMatch = (lines[index] ?? "").match(unorderedPattern);
        if (!itemMatch) {
          break;
        }
        items.push(itemMatch[1].trim());
        index += 1;
      }

      blocks.push({ type: "ul", items });
      continue;
    }

    const olMatch = line.match(orderedPattern);
    if (olMatch) {
      const items: string[] = [];

      while (index < lines.length) {
        const itemMatch = (lines[index] ?? "").match(orderedPattern);
        if (!itemMatch) {
          break;
        }
        items.push((itemMatch[2] ?? "").trim());
        index += 1;
      }

      blocks.push({ type: "ol", items });
      continue;
    }

    const quoteMatch = line.match(quotePattern);
    if (quoteMatch) {
      const quoteLines: string[] = [];

      while (index < lines.length) {
        const nextMatch = (lines[index] ?? "").match(quotePattern);
        if (!nextMatch) {
          break;
        }
        quoteLines.push(nextMatch[1]);
        index += 1;
      }

      blocks.push({
        type: "quote",
        lines: quoteLines,
      });
      continue;
    }

    const paragraphLines: string[] = [];
    while (index < lines.length) {
      const nextLine = lines[index] ?? "";
      if (!nextLine.trim() || isBoundaryLine(nextLine)) {
        break;
      }
      paragraphLines.push(nextLine.trim());
      index += 1;
    }

    blocks.push({
      type: "paragraph",
      text: paragraphLines.join(" "),
    });
  }

  return blocks;
}

export function ChatRichText({ content, compact = false }: ChatRichTextProps) {
  const blocks = parseBlocks(content);
  const paragraphClass = compact ? "text-sm leading-6" : "text-sm leading-7";
  const headingClassByLevel: Record<1 | 2 | 3, string> = {
    1: compact ? "text-base font-semibold" : "text-lg font-semibold",
    2: compact ? "text-[15px] font-semibold" : "text-base font-semibold",
    3: compact ? "text-sm font-semibold" : "text-[15px] font-semibold",
  };

  return (
    <div className="grid gap-2.5">
      {blocks.map((block, index) => {
        const key = `block-${index}`;

        if (block.type === "heading") {
          return (
            <h3 key={key} className={`${headingClassByLevel[block.level]} tracking-[-0.01em]`}>
              {renderInline(block.text, key)}
            </h3>
          );
        }

        if (block.type === "ul") {
          return (
            <ul key={key} className={`list-disc space-y-1.5 pl-5 ${paragraphClass}`}>
              {block.items.map((item, itemIndex) => (
                <li key={`${key}-${itemIndex}`}>{renderInline(item, `${key}-${itemIndex}`)}</li>
              ))}
            </ul>
          );
        }

        if (block.type === "ol") {
          return (
            <ol key={key} className={`list-decimal space-y-1.5 pl-5 ${paragraphClass}`}>
              {block.items.map((item, itemIndex) => (
                <li key={`${key}-${itemIndex}`}>{renderInline(item, `${key}-${itemIndex}`)}</li>
              ))}
            </ol>
          );
        }

        if (block.type === "quote") {
          return (
            <blockquote
              key={key}
              className="rounded-r-xl border-l-2 border-[rgba(47,111,97,0.35)] bg-[rgba(47,111,97,0.06)] px-3 py-2"
            >
              {block.lines.map((line, quoteIndex) => (
                <p key={`${key}-${quoteIndex}`} className={paragraphClass}>
                  {renderInline(line, `${key}-${quoteIndex}`)}
                </p>
              ))}
            </blockquote>
          );
        }

        if (block.type === "code") {
          return (
            <pre
              key={key}
              className="overflow-x-auto rounded-xl border border-[rgba(24,33,29,0.15)] bg-[rgba(24,33,29,0.92)] p-3 font-mono text-[12px] leading-6 text-[rgba(245,248,246,0.95)]"
            >
              {block.language ? (
                <span className="mb-2 inline-flex rounded-md border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] uppercase tracking-[0.08em] text-white/70">
                  {block.language}
                </span>
              ) : null}
              <code className="block whitespace-pre-wrap">{block.code}</code>
            </pre>
          );
        }

        return (
          <p key={key} className={paragraphClass}>
            {renderInline(block.text, key)}
          </p>
        );
      })}
    </div>
  );
}

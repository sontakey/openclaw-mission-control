import React from "react";

type MarkdownProps = {
  content: string;
};

const INLINE_PATTERN =
  /(`[^`]+`)|(\[([^\]]+)\]\(([^)\s]+)(?:\s+"[^"]*")?\))|(\*\*([^*]+)\*\*)|(__([^_]+)__)|(\*([^*]+)\*)|(_([^_]+)_)/;

function isSafeHref(href: string) {
  if (href.startsWith("#") || href.startsWith("/")) {
    return true;
  }

  try {
    const url = new URL(href);
    return (
      url.protocol === "http:" ||
      url.protocol === "https:" ||
      url.protocol === "mailto:"
    );
  } catch {
    return false;
  }
}

function renderInline(text: string, keyPrefix: string): React.ReactNode[] {
  const match = INLINE_PATTERN.exec(text);

  if (!match || match.index < 0) {
    return [text];
  }

  const before = text.slice(0, match.index);
  const after = text.slice(match.index + match[0].length);
  const nodes: React.ReactNode[] = [];

  if (before.length > 0) {
    nodes.push(...renderInline(before, `${keyPrefix}-before`));
  }

  if (match[1]) {
    nodes.push(
      <code
        key={`${keyPrefix}-code`}
        className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[0.9em] text-slate-900 dark:bg-slate-800 dark:text-slate-100"
      >
        {match[1].slice(1, -1)}
      </code>,
    );
  } else if (match[2]) {
    const href = match[4] ?? "";
    const label = match[3] ?? href;

    if (isSafeHref(href)) {
      nodes.push(
        <a
          key={`${keyPrefix}-link`}
          className="font-medium text-blue-700 underline underline-offset-2 hover:text-blue-600 dark:text-blue-400 dark:hover:text-blue-300"
          href={href}
          rel="noreferrer"
          target="_blank"
        >
          {label}
        </a>,
      );
    } else {
      nodes.push(label);
    }
  } else if (match[5] || match[7]) {
    const value = match[6] ?? match[8] ?? "";
    nodes.push(
      <strong key={`${keyPrefix}-strong`} className="font-semibold">
        {renderInline(value, `${keyPrefix}-strong-text`)}
      </strong>,
    );
  } else if (match[9] || match[11]) {
    const value = match[10] ?? match[12] ?? "";
    nodes.push(
      <em key={`${keyPrefix}-em`} className="italic">
        {renderInline(value, `${keyPrefix}-em-text`)}
      </em>,
    );
  }

  if (after.length > 0) {
    nodes.push(...renderInline(after, `${keyPrefix}-after`));
  }

  return nodes;
}

function isHorizontalRule(line: string) {
  return /^([-*_])\1{2,}$/.test(line.trim());
}

function renderParagraph(lines: string[], key: string) {
  const text = lines.map((line) => line.trim()).join(" ");
  return (
    <p key={key} className="text-sm leading-7 text-slate-700 dark:text-slate-300">
      {renderInline(text, `${key}-inline`)}
    </p>
  );
}

function renderBlockquote(lines: string[], key: string) {
  const paragraphs = lines
    .join("\n")
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter((paragraph) => paragraph.length > 0);

  return (
    <blockquote
      key={key}
      className="border-l-4 border-slate-300 pl-4 text-slate-600 italic dark:border-slate-700 dark:text-slate-300"
    >
      <div className="space-y-3">
        {paragraphs.map((paragraph, index) => (
          <p key={`${key}-paragraph-${index}`} className="text-sm leading-7">
            {renderInline(paragraph, `${key}-inline-${index}`)}
          </p>
        ))}
      </div>
    </blockquote>
  );
}

function renderList(
  items: string[],
  key: string,
  ordered: boolean,
  start?: number,
) {
  const ListTag = ordered ? "ol" : "ul";

  return (
    <ListTag
      key={key}
      className="space-y-2 pl-6 text-sm leading-7 text-slate-700 marker:text-slate-500 dark:text-slate-300 dark:marker:text-slate-400"
      {...(ordered && start ? { start } : {})}
    >
      {items.map((item, index) => (
        <li key={`${key}-item-${index}`}>
          {renderInline(item, `${key}-item-inline-${index}`)}
        </li>
      ))}
    </ListTag>
  );
}

function renderHeading(level: number, text: string, key: string) {
  const className =
    level === 1
      ? "text-3xl font-semibold tracking-tight text-slate-950 dark:text-slate-50"
      : level === 2
        ? "text-2xl font-semibold tracking-tight text-slate-950 dark:text-slate-50"
        : level === 3
          ? "text-xl font-semibold text-slate-900 dark:text-slate-100"
          : "text-base font-semibold uppercase tracking-wide text-slate-800 dark:text-slate-200";
  const tagName = `h${Math.min(Math.max(level, 1), 6)}` as keyof React.JSX.IntrinsicElements;

  return React.createElement(
    tagName,
    { className, key },
    renderInline(text, `${key}-inline`),
  );
}

export function TaskPrdMarkdown({ content }: MarkdownProps) {
  const lines = content.replace(/\r\n/g, "\n").split("\n");
  const blocks: React.ReactNode[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index] ?? "";
    const trimmed = line.trim();

    if (trimmed.length === 0) {
      index += 1;
      continue;
    }

    if (trimmed.startsWith("```")) {
      const language = trimmed.slice(3).trim();
      const codeLines: string[] = [];
      index += 1;

      while (index < lines.length && !(lines[index] ?? "").trim().startsWith("```")) {
        codeLines.push(lines[index] ?? "");
        index += 1;
      }

      if (index < lines.length) {
        index += 1;
      }

      blocks.push(
        <pre
          key={`code-${blocks.length}`}
          className="overflow-x-auto rounded-xl bg-slate-950 p-4 text-xs leading-6 text-slate-100"
        >
          {language ? (
            <div className="mb-2 text-[10px] font-semibold tracking-[0.2em] text-slate-400 uppercase">
              {language}
            </div>
          ) : null}
          <code>{codeLines.join("\n")}</code>
        </pre>,
      );
      continue;
    }

    if (isHorizontalRule(trimmed)) {
      blocks.push(
        <hr
          key={`rule-${blocks.length}`}
          className="border-slate-200 dark:border-slate-800"
        />,
      );
      index += 1;
      continue;
    }

    const headingMatch = trimmed.match(/^(#{1,6})\s+(.*)$/);
    if (headingMatch) {
      blocks.push(
        renderHeading(
          headingMatch[1].length,
          headingMatch[2].trim(),
          `heading-${blocks.length}`,
        ),
      );
      index += 1;
      continue;
    }

    if (trimmed.startsWith(">")) {
      const quoteLines: string[] = [];

      while (index < lines.length) {
        const quoteLine = lines[index] ?? "";

        if (quoteLine.trim().length === 0) {
          quoteLines.push("");
          index += 1;
          continue;
        }

        if (!quoteLine.trim().startsWith(">")) {
          break;
        }

        quoteLines.push(quoteLine.replace(/^\s*>\s?/, ""));
        index += 1;
      }

      blocks.push(renderBlockquote(quoteLines, `quote-${blocks.length}`));
      continue;
    }

    const orderedMatch = trimmed.match(/^(\d+)\.\s+(.*)$/);
    if (orderedMatch) {
      const items: string[] = [];
      const start = Number.parseInt(orderedMatch[1], 10);

      while (index < lines.length) {
        const itemMatch = (lines[index] ?? "").trim().match(/^\d+\.\s+(.*)$/);
        if (!itemMatch) {
          break;
        }
        items.push(itemMatch[1].trim());
        index += 1;
      }

      blocks.push(renderList(items, `ordered-${blocks.length}`, true, start));
      continue;
    }

    if (/^[-*+]\s+/.test(trimmed)) {
      const items: string[] = [];

      while (index < lines.length) {
        const itemMatch = (lines[index] ?? "").trim().match(/^[-*+]\s+(.*)$/);
        if (!itemMatch) {
          break;
        }
        items.push(itemMatch[1].trim());
        index += 1;
      }

      blocks.push(renderList(items, `unordered-${blocks.length}`, false));
      continue;
    }

    const paragraphLines: string[] = [];

    while (index < lines.length) {
      const paragraphLine = lines[index] ?? "";
      const paragraphTrimmed = paragraphLine.trim();

      if (
        paragraphTrimmed.length === 0 ||
        paragraphTrimmed.startsWith("```") ||
        paragraphTrimmed.startsWith(">") ||
        /^#{1,6}\s+/.test(paragraphTrimmed) ||
        /^[-*+]\s+/.test(paragraphTrimmed) ||
        /^\d+\.\s+/.test(paragraphTrimmed) ||
        isHorizontalRule(paragraphTrimmed)
      ) {
        break;
      }

      paragraphLines.push(paragraphLine);
      index += 1;
    }

    blocks.push(renderParagraph(paragraphLines, `paragraph-${blocks.length}`));
  }

  return <div className="space-y-5">{blocks}</div>;
}

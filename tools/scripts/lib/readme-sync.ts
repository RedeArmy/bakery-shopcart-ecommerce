export interface ReadmeShape {
  headingNumbers: string[];
  codeBlocks: { lang: string; body: string }[];
  linksTo: (target: string) => boolean;
}

/** Extrae la estructura comparable de un README: encabezados numerados y bloques de código. */
export function parseReadme(markdown: string): ReadmeShape {
  const headingNumbers: string[] = [];
  const codeBlocks: { lang: string; body: string }[] = [];
  let fence: { lang: string; lines: string[] } | null = null;

  for (const line of markdown.split('\n')) {
    const fenceMatch = /^```(\w*)\s*$/.exec(line);
    if (fenceMatch) {
      if (fence) {
        codeBlocks.push({ lang: fence.lang, body: fence.lines.join('\n').trim() });
        fence = null;
      } else {
        fence = { lang: fenceMatch[1] ?? '', lines: [] };
      }
      continue;
    }
    if (fence) {
      fence.lines.push(line);
      continue;
    }
    const heading = /^## (\d+)\.\s/.exec(line);
    if (heading?.[1] !== undefined) headingNumbers.push(heading[1]);
    else if (line.startsWith('## ')) headingNumbers.push('?');
  }
  return { headingNumbers, codeBlocks, linksTo: (target) => markdown.includes(`(${target})`) };
}

/** Compara el README en español con el inglés y devuelve la lista de diferencias. */
export function compareReadmes(spanish: string, english: string): string[] {
  const es = parseReadme(spanish);
  const en = parseReadme(english);
  const problems: string[] = [];

  if (!es.linksTo('README.en.md')) problems.push('README.md must link to README.en.md');
  if (!en.linksTo('README.md')) problems.push('README.en.md must link to README.md');
  if (es.headingNumbers.includes('?') || en.headingNumbers.includes('?')) {
    problems.push('Every level-2 heading must start with a number ("## 1. Title")');
  }
  if (es.headingNumbers.join(',') !== en.headingNumbers.join(',')) {
    problems.push(
      `Level-2 headings differ: README.md [${es.headingNumbers.join(', ')}] vs README.en.md [${en.headingNumbers.join(', ')}]`,
    );
  }
  if (es.codeBlocks.length !== en.codeBlocks.length) {
    problems.push(`Code block count differs: ${es.codeBlocks.length} vs ${en.codeBlocks.length}`);
  } else {
    es.codeBlocks.forEach((block, index) => {
      const other = en.codeBlocks[index];
      if (block.lang !== other?.lang) {
        problems.push(`Code block ${index + 1} has a different language`);
      } else if (block.lang !== 'mermaid' && block.body !== other.body) {
        problems.push(`Code block ${index + 1} (${block.lang}) differs between the two READMEs`);
      }
    });
  }
  return problems;
}

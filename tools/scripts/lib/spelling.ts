import { ALLOWED_PHRASES, ALLOWED_TOKENS, DENY_LIST } from './spelling-rules.js';

export interface Violation {
  line: number;
  found: string;
  suggestion: string;
}

const IGNORE_LINE = 'spelling-ignore';
const IGNORE_START = 'spelling-ignore-start';
const IGNORE_END = 'spelling-ignore-end';

/** Separa un identificador en palabras: camelCase, PascalCase, SCREAMING_SNAKE y kebab-case. */
export function splitWords(token: string): string[] {
  return token.match(/[A-Z]+(?![a-z])|[A-Z]?[a-z]+/g) ?? [];
}

// Sustituye cada carácter por un espacio, conservando los saltos de línea (los números de línea no cambian)
const blank = (match: string): string => match.replace(/[^\n]/g, ' ');

/** Elimina los comentarios (escritos en español) para analizar solo identificadores y texto. */
export function stripComments(text: string, extension: string): string {
  switch (extension) {
    case '.ts':
    case '.tsx':
    case '.mjs':
    case '.cjs':
      return text
        .replace(/\/\*[\s\S]*?\*\//g, blank)
        .replace(
          /(^|[^:"'`])\/\/.*$/gm,
          (match, prefix: string) => prefix + blank(match.slice(prefix.length)),
        );
    case '.sql':
      return text.replace(/\/\*[\s\S]*?\*\//g, blank).replace(/--.*$/gm, blank);
    case '.yml':
    case '.yaml':
    case '.sh':
      return text.replace(
        /(^|\s)#.*$/gm,
        (match, prefix: string) => prefix + blank(match.slice(prefix.length)),
      );
    default:
      return text;
  }
}

/** Devuelve las grafías estadounidenses encontradas en un texto. */
export function findViolations(text: string, extension = '.md'): Violation[] {
  const violations: Violation[] = [];
  const originalLines = text.split('\n');
  const lines = stripComments(text, extension).split('\n');
  let ignoring = false;
  lines.forEach((strippedLine, index) => {
    // Los marcadores viven en comentarios, por eso se buscan en la línea original
    const original = originalLines[index] ?? '';
    if (original.includes(IGNORE_START)) ignoring = true;
    const skip = ignoring || original.includes(IGNORE_LINE);
    if (original.includes(IGNORE_END)) ignoring = false;
    if (skip) return;
    const line = ALLOWED_PHRASES.reduce((acc, phrase) => acc.replaceAll(phrase, ' '), strippedLine);
    for (const token of line.match(/[A-Za-z]+/g) ?? []) {
      if (ALLOWED_TOKENS.has(token)) continue;
      for (const word of splitWords(token)) {
        const key = word.toLowerCase();
        // Object.hasOwn evita falsos positivos con propiedades heredadas como "constructor"
        const suggestion = Object.hasOwn(DENY_LIST, key) ? DENY_LIST[key] : undefined;
        if (suggestion !== undefined) {
          violations.push({ line: index + 1, found: word, suggestion });
        }
      }
    }
  });
  return violations;
}

/** Analiza el nombre de un archivo o carpeta (un segmento de la ruta, sin extensión). */
export function findPathViolations(segment: string): Violation[] {
  return findViolations(segment.replace(/\.[^.]+$/, ''), '.name');
}

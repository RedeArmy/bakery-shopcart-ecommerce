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

type CommentStart = (line: string, index: number) => boolean;

// "//" no inicia un comentario si lo precede ":" (URL) o una comilla (texto dentro de una cadena)
const startsSlashComment: CommentStart = (line, index) =>
  line.startsWith('//', index) && (index === 0 || !':"\'`'.includes(line.charAt(index - 1)));

// "#" inicia un comentario solo al principio de línea o tras un espacio
const startsHashComment: CommentStart = (line, index) =>
  line.charAt(index) === '#' && (index === 0 || /\s/.test(line.charAt(index - 1)));

// "--" abre un comentario de línea en SQL en cualquier posición
const startsDashComment: CommentStart = (line, index) => line.startsWith('--', index);

// Sustituye los comentarios de bloque por espacios con indexOf: tiempo lineal y sin backtracking.
// Un bloque sin cierre se deja intacto, igual que hacía la expresión regular anterior.
function blankBlockComments(text: string): string {
  let result = '';
  let position = 0;
  while (position < text.length) {
    const start = text.indexOf('/*', position);
    const close = start === -1 ? -1 : text.indexOf('*/', start + 2);
    if (close === -1) {
      result += text.slice(position);
      break;
    }
    result += text.slice(position, start) + blank(text.slice(start, close + 2));
    position = close + 2;
  }
  return result;
}

// Recorrido lineal de cada línea: evita las expresiones regulares con retroceso (backtracking) costoso
function blankLineComments(text: string, startsComment: CommentStart): string {
  return text
    .split('\n')
    .map((line) => {
      for (let index = 0; index < line.length; index += 1) {
        if (startsComment(line, index)) {
          return line.slice(0, index) + ' '.repeat(line.length - index);
        }
      }
      return line;
    })
    .join('\n');
}

/** Elimina los comentarios (escritos en español) para analizar solo identificadores y texto. */
export function stripComments(text: string, extension: string): string {
  switch (extension) {
    case '.ts':
    case '.tsx':
    case '.mjs':
    case '.cjs':
      return blankLineComments(blankBlockComments(text), startsSlashComment);
    case '.sql':
      return blankLineComments(blankBlockComments(text), startsDashComment);
    case '.yml':
    case '.yaml':
    case '.sh':
      return blankLineComments(text, startsHashComment);
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

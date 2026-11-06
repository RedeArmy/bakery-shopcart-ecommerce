// Comprueba que las cifras que los README citan (pruebas, procedimientos, operaciones...) coinciden con el repositorio.
// Una cifra escrita a mano envejece sin que nadie lo note; aquí cada una se cuenta de la fuente y se compara.

export interface FigurePattern {
  file: string;
  /** Debe tener un único grupo de captura con el número citado */
  regex: RegExp;
}

export interface FigureRule {
  label: string;
  /** Lo que de verdad hay en el repositorio */
  actual: number;
  patterns: readonly FigurePattern[];
}

/** Compara cada cifra citada con la real. Una frase que ya no existe también es un problema: la regla quedaría muda. */
export function checkFigures(
  documents: Readonly<Record<string, string>>,
  rules: readonly FigureRule[],
): string[] {
  const problems: string[] = [];
  for (const rule of rules) {
    for (const { file, regex } of rule.patterns) {
      const text = documents[file];
      if (text === undefined) {
        problems.push(`${rule.label}: ${file} was not read`);
        continue;
      }
      const cited = [...text.matchAll(new RegExp(regex.source, 'g'))].map((match) =>
        Number(match[1]),
      );
      if (cited.length === 0) {
        problems.push(`${rule.label}: ${file} no longer has the sentence ${String(regex)}`);
        continue;
      }
      for (const value of cited) {
        if (value !== rule.actual) {
          problems.push(
            `${rule.label}: ${file} says ${value} but the repository has ${rule.actual}`,
          );
        }
      }
    }
  }
  return problems;
}

/** Pruebas tSQLt: cada procedimiento `Test_<Clase>.[test ...]` es un caso (los SetUp no cuentan). */
export const countTsqltTests = (sql: string): number =>
  (sql.match(/^CREATE PROCEDURE Test_\w+\.\[test /gm) ?? []).length;

/** Operaciones del contrato: un verbo HTTP con la sangría de los métodos de una ruta. */
export const countOperations = (openapi: string): number =>
  (openapi.match(/^ {4}(get|post|put|patch|delete):\s*$/gm) ?? []).length;

/** Casos `it(` de primer nivel dentro del `describe` de una suite de integración. */
export const countIntegrationFlows = (source: string): number =>
  (source.match(/^ {2}it\(/gm) ?? []).length;

/** Peticiones y aserciones de una colección de Postman (cada `pm.test(` es una aserción). */
export function countPostman(collection: { item: unknown[] }): {
  requests: number;
  assertions: number;
} {
  let requests = 0;
  let assertions = 0;
  const walk = (items: unknown[]): void => {
    for (const entry of items) {
      const node = entry as {
        item?: unknown[];
        request?: unknown;
        event?: { listen: string; script: { exec: string[] } }[];
      };
      if (node.item !== undefined) {
        walk(node.item);
        continue;
      }
      if (node.request === undefined) continue;
      requests += 1;
      for (const event of node.event ?? []) {
        if (event.listen === 'test')
          assertions += event.script.exec.join('\n').split('pm.test(').length - 1;
      }
    }
  };
  walk(collection.item);
  return { requests, assertions };
}

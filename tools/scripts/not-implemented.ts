// Marcador de posición para scripts cuyo objetivo se construye en una etapa posterior.
// Nunca debe fallar en silencio: imprime en español qué falta y en qué etapa llegará.
const args = process.argv.slice(2);
const passes = args.includes('--pass');
const [name, stage] = args.filter((arg) => !arg.startsWith('--'));

// cspell:disable-next-line
const message = `[${name ?? 'script'}] Todavía no está implementado: se construye en la Etapa ${stage ?? '?'} (ver docs/progress/ROADMAP.md).`;

if (passes) {
  // cspell:disable-next-line
  console.log(`${message} Se omite sin error mientras no existan pruebas de este tipo.`);
} else {
  console.error(message);
  process.exit(1);
}

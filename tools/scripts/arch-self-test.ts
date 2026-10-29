// Prueba de la prueba: un fixture viola a propósito la regla de dependencias y
// dependency-cruiser DEBE detectarlo. Si no lo detecta, arch:check no sirve de nada.
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

const FIXTURE_DIR = resolve('tools/scripts/arch-fixtures');
const CONFIG = resolve('.dependency-cruiser.cjs');
const EXPECTED_RULES = [
  'domain-not-to-outer-layers',
  'domain-no-frameworks',
  'no-cross-module-internals',
  'shared-kernel-no-io',
];

// Se invoca el binario con el mismo Node que corre este script: sin shell y válido en Windows y Linux
const DEPCRUISE_BIN = resolve('node_modules/dependency-cruiser/bin/dependency-cruise.mjs');

const result = spawnSync(
  process.execPath,
  [DEPCRUISE_BIN, '--config', CONFIG, '--output-type', 'json', 'backend/src'],
  { cwd: FIXTURE_DIR, encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 },
);

interface CruiseReport {
  summary: { violations: { rule: { name: string } }[] };
}

let report: CruiseReport;
try {
  report = JSON.parse(result.stdout) as CruiseReport;
} catch {
  console.error('arch-self-test: dependency-cruiser did not return valid JSON.\n', result.stderr);
  process.exit(1);
}

const detected = new Set(report.summary.violations.map((violation) => violation.rule.name));
const notDetected = EXPECTED_RULES.filter((rule) => !detected.has(rule));

if (notDetected.length > 0) {
  console.error(
    `arch-self-test FAILED: violations not detected for rules: ${notDetected.join(', ')}`,
  );
  process.exit(1);
}
console.log(
  `arch-self-test passed: the deliberate violations were detected (${[...detected].join(', ')}).`,
);

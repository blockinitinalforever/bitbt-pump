import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { parseHTML } from 'linkedom';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const referencePath = path.join(root, 'design-reference/20260914/bitbt-launch-ui-app.html');
const digest = (text) => crypto.createHash('sha256').update(text).digest('hex');

// Outside public/: example financial values and simulated success handlers
// must never become a production route.
export function compareUi(candidatePath) {
  const reference = fs.readFileSync(referencePath, 'utf8');
  const candidate = fs.readFileSync(candidatePath, 'utf8');
  const original = parseHTML(reference).document;
  const actual = parseHTML(candidate).document;
  const panels = (document) => [...document.querySelectorAll('[data-panel]')].map(node => node.dataset.panel);
  const sourcePanels = panels(original);
  const targetPanels = panels(actual);
  // Data text can change; element nesting and visual classes are the baseline.
  const topology = (node) => node ? [node.localName, node.getAttribute('class') || '', [...node.children].map(topology)] : null;
  const styles = [...original.querySelectorAll('style')].map((node, index) => {
    const target = [...actual.querySelectorAll('style')][index];
    return { index, id: node.id || 'base', reference: digest(node.textContent), actual: target ? digest(target.textContent) : null, identical: node.textContent === target?.textContent };
  });
  return {
    referenceSha256: digest(reference),
    missingPanels: sourcePanels.filter(name => !targetPanels.includes(name)),
    extraPanels: targetPanels.filter(name => !sourcePanels.includes(name)),
    styles,
    panels: sourcePanels.map(name => ({ name, identicalLayout: JSON.stringify(topology(original.querySelector(`[data-panel="${name}"]`))) === JSON.stringify(topology(actual.querySelector(`[data-panel="${name}"]`))) })),
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const report = compareUi(path.resolve(process.argv[2] || path.join(root, 'public/launchpad/bitbt-launch-ui-app.html')));
  console.log(JSON.stringify(report, null, 2));
  if (process.argv.includes('--check') && (report.missingPanels.length || report.extraPanels.length || report.styles.some(s => !s.identical) || report.panels.some(p => !p.identicalLayout))) process.exitCode = 1;
}

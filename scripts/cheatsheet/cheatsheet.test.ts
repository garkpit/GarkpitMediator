import { expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { FILES, problems } from './cli';
import { sheet } from './data';

test('the cheat sheet files match their data file and name only real exports (fix: bun run cheatsheet)', async () => {
  expect(await problems()).toEqual([]);
});

test('the HTML title starts with the project name and reads as the PDF title should', () => {
  const html = readFileSync(FILES.html, 'utf8');
  expect(html).toContain('<title>GarkpitMediator cheat sheet</title>');
  expect(sheet.title.startsWith(sheet.name)).toBe(true);
  // Chrome copies the HTML title into the PDF's own title field.
  expect(readFileSync(FILES.pdf).includes('GarkpitMediator cheat sheet')).toBe(true);
});

// CI runner only (GitHub Actions). Not needed to use the app — open
// tests/index.html in any browser to run the same tests locally.
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const vm = require('node:vm');

for (const file of ['../js/core.js', '../js/api.js', 'harness.js', 'tests.js']) {
  vm.runInThisContext(readFileSync(join(__dirname, file), 'utf8'), { filename: file });
}

globalThis.SmogTest.run().then((results) => {
  for (const r of results) console.log(`${r.ok ? 'ok    ' : 'FAIL  '} ${r.name}${r.ok ? '' : `\n       ${r.error}`}`);
  const failed = results.filter((r) => !r.ok).length;
  console.log(`\n${results.length - failed}/${results.length} passed`);
  process.exitCode = failed ? 1 : 0;
});

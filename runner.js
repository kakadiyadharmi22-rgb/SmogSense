/* Renders test results in the browser. */
(function () {
  'use strict';
  const list = document.getElementById('results');
  window.SmogTest.run((r) => {
    const li = document.createElement('li');
    li.className = r.ok ? 'pass' : 'fail';
    li.textContent = `${r.ok ? '✓' : '✗'} ${r.name}${r.ok ? '' : ` — ${r.error}`}`;
    list.append(li);
  }).then((results) => {
    const failed = results.filter((r) => !r.ok).length;
    const summary = document.getElementById('summary');
    summary.textContent = failed ? `${failed} of ${results.length} tests failed` : `All ${results.length} tests passed`;
    summary.className = failed ? 'fail' : 'pass';
    document.title = `${failed ? '✗' : '✓'} SmogSense Tests`;
  });
})();

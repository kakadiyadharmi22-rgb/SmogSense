/**
 * Tiny zero-dependency test harness that runs in any browser
 * (tests/index.html) and in CI (tests/run-node.js).
 */
(function (root) {
  'use strict';

  const tests = [];
  const test = (name, fn) => tests.push({ name, fn });

  function fail(message) {
    throw new Error(message);
  }

  const stable = (v) => JSON.stringify(v, (k, val) => (val === Infinity ? 'Infinity' : val));

  const assert = {
    ok(value, message) {
      if (!value) fail(message || `Expected truthy, got ${stable(value)}`);
    },
    equal(actual, expected, message) {
      if (actual !== expected) fail(`${message ? `${message}: ` : ''}expected ${stable(expected)}, got ${stable(actual)}`);
    },
    deepEqual(actual, expected, message) {
      if (stable(actual) !== stable(expected)) {
        fail(`${message ? `${message}: ` : ''}expected ${stable(expected)}, got ${stable(actual)}`);
      }
    },
    match(text, regex, message) {
      if (!regex.test(String(text))) fail(message || `Expected ${regex} to match:\n${text}`);
    },
    throws(fn, pattern) {
      try {
        fn();
      } catch (error) {
        if (pattern && !pattern.test(`${error.name} ${error.message}`)) fail(`Error "${error.message}" did not match ${pattern}`);
        return;
      }
      fail('Expected function to throw');
    },
    async rejects(promise, pattern) {
      try {
        await promise;
      } catch (error) {
        if (pattern && !pattern.test(`${error.name} ${error.kind || ''} ${error.message}`)) {
          fail(`Rejection "${error.message}" did not match ${pattern}`);
        }
        return;
      }
      fail('Expected promise to reject');
    },
  };

  async function run(report) {
    const results = [];
    for (const t of tests) {
      try {
        await t.fn();
        results.push({ name: t.name, ok: true });
      } catch (error) {
        results.push({ name: t.name, ok: false, error: error.message });
      }
      if (report) report(results[results.length - 1]);
    }
    return results;
  }

  root.SmogTest = { test, assert, run };
})(typeof globalThis !== 'undefined' ? globalThis : window);

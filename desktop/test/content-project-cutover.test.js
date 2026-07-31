const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

test('desktop enables the one-time content project cutover in development and production', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'main.js'), 'utf8');

  assert.match(
    source,
    /CONTENT_PROJECT_CUTOVER:\s*process\.env\.CONTENT_PROJECT_CUTOVER\s*\|\|\s*'true'/,
  );
});

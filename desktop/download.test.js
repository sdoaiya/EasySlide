const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const { downloadToFile } = require('./download');

async function withServer(handler, run) {
  const server = http.createServer(handler);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const { port } = server.address();
    await run(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

test('desktop download preserves PPTX, PDF, and HTML bytes', async () => {
  const fixtures = {
    '/deck.pptx': Buffer.from('504b030414000000', 'hex'),
    '/deck.pdf': Buffer.from('%PDF-1.7\n%%EOF'),
    '/deck.html': Buffer.from('<!doctype html><html><body>ok</body></html>'),
  };
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'easyslide-download-'));

  try {
    await withServer((request, response) => {
      const body = fixtures[request.url];
      response.writeHead(200, { 'Content-Length': body.length });
      response.end(body);
    }, async (baseUrl) => {
      for (const [urlPath, expected] of Object.entries(fixtures)) {
        const output = await downloadToFile(`${baseUrl}${urlPath}`, dir, path.basename(urlPath));
        assert.deepEqual(fs.readFileSync(output), expected);
      }
    });
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('interrupted desktop download leaves no broken file', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'easyslide-download-'));

  try {
    await withServer((_request, response) => {
      response.writeHead(200, { 'Content-Length': 1024 });
      response.write('PK');
      response.socket.destroy();
    }, async (baseUrl) => {
      await assert.rejects(downloadToFile(`${baseUrl}/broken.pptx`, dir, 'broken.pptx'));
    });
    assert.deepEqual(fs.readdirSync(dir), []);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

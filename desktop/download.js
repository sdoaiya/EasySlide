const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { pipeline } = require('node:stream/promises');

function getAvailablePath(dir, filename) {
  const safeName = path.basename(filename || 'download');
  const parsed = path.parse(safeName);
  let target = path.join(dir, safeName);
  let index = 1;
  while (fs.existsSync(target)) {
    target = path.join(dir, `${parsed.name} (${index})${parsed.ext}`);
    index += 1;
  }
  return target;
}

async function downloadToFile(sourceUrl, exportDir, filename) {
  const filePath = getAvailablePath(exportDir, filename);
  const tempPath = `${filePath}.${process.pid}.${Date.now()}.part`;

  try {
    const response = await new Promise((resolve, reject) => {
      http.get(sourceUrl, resolve).once('error', reject);
    });
    if (response.statusCode !== 200) {
      response.resume();
      throw new Error(`Download failed: HTTP ${response.statusCode}`);
    }

    let receivedBytes = 0;
    response.on('data', (chunk) => { receivedBytes += chunk.length; });
    await pipeline(response, fs.createWriteStream(tempPath, { flags: 'wx' }));

    const expectedBytes = Number(response.headers['content-length']);
    if (Number.isFinite(expectedBytes) && receivedBytes !== expectedBytes) {
      throw new Error(`Download incomplete: expected ${expectedBytes} bytes, received ${receivedBytes}`);
    }

    fs.renameSync(tempPath, filePath);
    return filePath;
  } catch (error) {
    fs.rmSync(tempPath, { force: true });
    throw error;
  }
}

module.exports = { downloadToFile };

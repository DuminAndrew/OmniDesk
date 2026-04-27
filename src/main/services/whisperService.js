const fs = require('fs');
const path = require('path');
const https = require('https');
const { spawn } = require('child_process');
const AdmZip = require('adm-zip');
const paths = require('../utils/paths');
const logger = require('../utils/logger');

// Pinned whisper.cpp Windows release that ships pre-built CLI binaries.
const BINARY_URL = 'https://github.com/ggerganov/whisper.cpp/releases/download/v1.7.4/whisper-bin-x64.zip';
// HuggingFace mirror for ggml-base.bin (≈147 MB, supports Russian well enough for voice notes)
const MODEL_URL = 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.bin';

function dir() { return paths.whisperDir(); }
function binPath()   { return path.join(dir(), 'whisper-cli.exe'); }
function legacyBin() { return path.join(dir(), 'main.exe'); }
function modelPath() { return path.join(dir(), 'ggml-base.bin'); }

function existingBinary() {
  if (fs.existsSync(binPath()))    return binPath();
  if (fs.existsSync(legacyBin()))  return legacyBin();
  return null;
}

function status() {
  const bin = existingBinary();
  return {
    binaryReady: !!bin,
    modelReady:  fs.existsSync(modelPath()),
    binaryPath:  bin || null,
    modelPath:   modelPath(),
    modelSizeMb: fs.existsSync(modelPath()) ? Math.round(fs.statSync(modelPath()).size / 1024 / 1024) : 0
  };
}

function downloadStream(url, file, onProgress) {
  return new Promise((resolve, reject) => {
    const tmp = file + '.tmp';
    let totalBytes = 0;

    const fetch = (u) => {
      https.get(u, { headers: { 'User-Agent': 'OmniDesk-Whisper' } }, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          return fetch(new URL(res.headers.location, u).href);
        }
        if (res.statusCode !== 200) {
          return reject(new Error(`HTTP ${res.statusCode} fetching ${u}`));
        }
        totalBytes = parseInt(res.headers['content-length'] || '0', 10);
        let received = 0;
        const stream = fs.createWriteStream(tmp);
        res.on('data', (chunk) => {
          received += chunk.length;
          if (onProgress) onProgress(received, totalBytes);
        });
        res.pipe(stream);
        stream.on('finish', () => {
          stream.close(() => {
            try {
              if (fs.existsSync(file)) fs.unlinkSync(file);
              fs.renameSync(tmp, file);
              resolve();
            } catch (err) { reject(err); }
          });
        });
        stream.on('error', reject);
      }).on('error', reject);
    };

    fetch(url);
  });
}

async function downloadModel(onProgress) {
  if (fs.existsSync(modelPath())) return { ok: true, alreadyPresent: true, path: modelPath() };
  logger.info('Whisper: downloading model…', MODEL_URL);
  await downloadStream(MODEL_URL, modelPath(), onProgress);
  return { ok: true, path: modelPath() };
}

async function downloadBinary(onProgress) {
  if (existingBinary()) return { ok: true, alreadyPresent: true, path: existingBinary() };
  logger.info('Whisper: downloading binary…', BINARY_URL);
  const zipFile = path.join(dir(), 'whisper-bin.zip');
  await downloadStream(BINARY_URL, zipFile, onProgress);

  const zip = new AdmZip(zipFile);
  const entries = zip.getEntries();
  // Look for whisper-cli.exe (modern) or main.exe (legacy)
  const target = entries.find(e => /(?:^|[\\/])(whisper-cli|main)\.exe$/i.test(e.entryName));
  if (!target) {
    fs.unlinkSync(zipFile);
    throw new Error('main.exe / whisper-cli.exe не найден в архиве');
  }
  const wantedName = /whisper-cli/i.test(target.entryName) ? 'whisper-cli.exe' : 'main.exe';
  const outFile = path.join(dir(), wantedName);
  fs.writeFileSync(outFile, target.getData());

  // Also extract any DLLs we'll need at runtime (whisper.dll, ggml*.dll, …)
  for (const e of entries) {
    if (/\.dll$/i.test(e.entryName)) {
      const name = path.basename(e.entryName);
      fs.writeFileSync(path.join(dir(), name), e.getData());
    }
  }
  try { fs.unlinkSync(zipFile); } catch (_) {}
  return { ok: true, path: outFile };
}

async function transcribe({ wavBuffer, language = 'ru' }) {
  const s = status();
  if (!s.binaryReady) throw new Error('Whisper не установлен (нет CLI). Зайдите в Настройки → Расшифровка');
  if (!s.modelReady)  throw new Error('Whisper не установлен (нет модели). Зайдите в Настройки → Расшифровка');

  const stamp = Date.now() + '-' + Math.random().toString(36).slice(2, 8);
  const wavFile = path.join(paths.voiceDir(), `transcribe-${stamp}.wav`);
  fs.writeFileSync(wavFile, Buffer.from(wavBuffer));
  const outBase = wavFile.replace(/\.wav$/, '');

  return new Promise((resolve, reject) => {
    const args = [
      '-m', modelPath(),
      '-f', wavFile,
      '-l', language,
      '-otxt',
      '-of', outBase,
      '--no-timestamps'
    ];
    const child = spawn(s.binaryPath, args, { windowsHide: true, cwd: dir() });
    let stderr = '';
    child.stderr.on('data', d => stderr += d.toString());
    child.on('error', (err) => {
      try { fs.unlinkSync(wavFile); } catch (_) {}
      reject(err);
    });
    child.on('close', (code) => {
      try { fs.unlinkSync(wavFile); } catch (_) {}
      const outTxt = outBase + '.txt';
      if (code !== 0) {
        try { fs.unlinkSync(outTxt); } catch (_) {}
        return reject(new Error('Whisper exit ' + code + ': ' + stderr.slice(-400)));
      }
      try {
        const text = fs.readFileSync(outTxt, 'utf-8').trim();
        try { fs.unlinkSync(outTxt); } catch (_) {}
        resolve(text);
      } catch (err) { reject(err); }
    });
  });
}

module.exports = { status, downloadModel, downloadBinary, transcribe };

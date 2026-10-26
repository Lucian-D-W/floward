import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const PROJECT_ROOT = fileURLToPath(new URL('../', import.meta.url));
const noticeFile = /^(?:licen[sc]e|unlicen[sc]e|copying|notice|copyright)(?:$|[._-])/i;
const termsFile = /^(?:licen[sc]e|unlicen[sc]e|copying)(?:$|[._-])/i;
const digest = bytes => createHash('sha256').update(bytes).digest('hex');

function retainedFile(root, file, hashes) {
  const absolute = path.resolve(root, file);
  const relative = path.relative(root, absolute);
  if (relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('Invalid license source path: ' + file);
  const bytes = fs.readFileSync(absolute);
  if (!hashes[file] || digest(bytes) !== hashes[file]) throw new Error('License source checksum mismatch: ' + file);
  if (!bytes.toString('utf8').trim()) throw new Error('Empty license source: ' + file);
  return bytes.toString('utf8').trim();
}

export function collectLicenseText(pkg, supplement, sourceRoot) {
  const localFiles = fs.readdirSync(pkg.root)
    .filter(name => noticeFile.test(name) && fs.statSync(path.join(pkg.root, name)).isFile());
  if (pkg.licenseFile) {
    const explicit = path.resolve(pkg.root, pkg.licenseFile);
    if (!fs.existsSync(explicit) || !fs.statSync(explicit).isFile()) throw new Error(pkg.name + ': declared license file is missing');
    if (!localFiles.some(name => path.resolve(pkg.root, name) === explicit)) localFiles.push(pkg.licenseFile);
  }
  const localTerms = !!pkg.licenseFile || localFiles.some(name => termsFile.test(name));
  let texts = localFiles.map(name => '### ' + path.basename(name) + '\n\n' + fs.readFileSync(path.resolve(pkg.root, name), 'utf8').trim());
  const key = pkg.ecosystem + ':' + pkg.name + '@' + pkg.version;
  const extra = supplement.packages[key];
  if (!localTerms) {
    if (!extra || extra.license !== pkg.license) throw new Error(key + ': no complete license text; add a verified supplement for this exact version and license');
    if (!extra.files.length) throw new Error(key + ': empty license supplement');
    texts = texts.concat(extra.files.map(file => '### ' + path.basename(file) + '\n\n' + retainedFile(sourceRoot, file, supplement.files)));
  }
  if (extra) {
    if (extra.license !== pkg.license) throw new Error(key + ': supplement license does not match package metadata');
    const provenance = [extra.attribution, extra.note, extra.sources.map(url => '- ' + url).join('\n')].filter(Boolean).join('\n\n');
    if (provenance) texts.unshift('### 来源与署名\n\n' + provenance);
  }
  // Normalize display-only trailing spaces; retained source files remain exact.
  return texts.join('\n\n').replace(/\r\n/g, '\n').replace(/[\t ]+$/gm, '');
}

export function resolvePackageManifest(name, from) {
  let dir = path.resolve(from);
  while (true) {
    const candidate = path.join(dir, 'node_modules', name, 'package.json');
    if (fs.existsSync(candidate)) return candidate;
    const parent = path.dirname(dir);
    if (parent === dir) throw new Error('Cannot resolve dependency ' + name + ' from ' + from);
    dir = parent;
  }
}

export function isProjectPackage(pkg, root) {
  return path.resolve(pkg.manifest_path).toLowerCase() === path.resolve(root, 'src-tauri/Cargo.toml').toLowerCase();
}

export function generateNotices(root = PROJECT_ROOT) {
  const sourceRoot = path.join(root, 'licenses/third-party');
  const supplement = JSON.parse(fs.readFileSync(path.join(sourceRoot, 'sources.json'), 'utf8'));
  if (supplement.schemaVersion !== 1) throw new Error('Unsupported license supplement schema');
  for (const file of Object.keys(supplement.files)) retainedFile(sourceRoot, file, supplement.files);
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  const lock = JSON.parse(fs.readFileSync(path.join(root, 'package-lock.json'), 'utf8'));
  const elkSource = lock.packages['node_modules/elkjs']?.resolved || '见 package-lock.json 中 elkjs 的 resolved 字段';
  const sections = [
    '# 顺水意流 / floward · 第三方许可\n\n' +
    '本文件保留 JavaScript 运行依赖及 Windows Rust 构建依赖的许可、署名和来源。项目自身的 GPL-3.0-only 见 LICENSE 与 COPYRIGHT，不替代以下第三方许可。\n\n' +
    'ELK 按 EPL-2.0 使用，本项目未修改其源码；锁定发行包源码入口：' + elkSource + '。\n\n' +
    '桌面插件的本地修改见 vendor/tauri-plugin-wallpaper/FLOWARD-PATCHES.md。上游只提供许可名称等特殊情况在对应章节如实说明；补充原文及校验记录保存在 licenses/third-party/。\n',
  ];
  const visited = new Set();
  function add(name, from) {
    const file = resolvePackageManifest(name, from);
    const p = JSON.parse(fs.readFileSync(file, 'utf8'));
    const key = p.name + '@' + p.version;
    if (visited.has(key)) return;
    visited.add(key);
    const repository = typeof p.repository === 'object' ? p.repository.url : p.repository || p.homepage || '';
    const text = collectLicenseText({ ...p, root: path.dirname(file), ecosystem: 'npm' }, supplement, sourceRoot);
    sections.push('## ' + key + '\n\n' + (p.license || '见原许可文件') + ' · ' + repository + '\n\n' + text);
    for (const dependency of Object.keys(p.dependencies || {})) add(dependency, path.dirname(file));
  }
  for (const name of Object.keys(manifest.dependencies)) add(name, root);
  const metadata = JSON.parse(execFileSync('cargo', [
    'metadata', '--manifest-path', path.join(root, 'src-tauri/Cargo.toml'),
    '--format-version', '1', '--locked', '--offline', '--filter-platform', 'x86_64-pc-windows-msvc',
  ], { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024, cwd: root }));
  let rustPackages = 0;
  for (const p of metadata.packages) {
    if (isProjectPackage(p, root)) continue;
    const text = collectLicenseText({ ...p, root: path.dirname(p.manifest_path), ecosystem: 'cargo', licenseFile: p.license_file }, supplement, sourceRoot);
    sections.push('## ' + p.name + '@' + p.version + ' (Rust)\n\n' + (p.license || '见原许可文件') + ' · ' + (p.repository || '') + '\n\n' + text);
    rustPackages++;
  }
  return { text: sections.join('\n\n---\n\n') + '\n', javascriptPackages: visited.size, rustPackages };
}

export function emitNotices(output, generate, { check = false } = {}) {
  // Complete all reads and validation before touching the existing deliverable.
  const result = generate();
  const existing = fs.existsSync(output) ? fs.readFileSync(output, 'utf8') : null;
  if (check) {
    if (existing !== result.text) throw new Error('Third-party notices differ; run npm run notices to regenerate');
    return result;
  }
  if (existing !== result.text) {
    const staging = output + '.' + process.pid + '.tmp';
    let created = false;
    try {
      fs.writeFileSync(staging, result.text, { flag: 'wx' });
      created = true;
      fs.renameSync(staging, output);
    } finally {
      if (created && fs.existsSync(staging)) fs.unlinkSync(staging);
    }
  }
  return result;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    const args = process.argv.slice(2);
    if (args.some(arg => arg !== '--check')) throw new Error('Usage: node scripts/notices.mjs [--check]');
    const result = emitNotices(path.join(PROJECT_ROOT, 'THIRD_PARTY_NOTICES.md'), () => generateNotices(), { check: args.includes('--check') });
    console.log('Notices ' + (args.includes('--check') ? 'verified' : 'generated') + ': ' + result.javascriptPackages + ' JavaScript, ' + result.rustPackages + ' Rust packages');
  } catch (error) {
    console.error('Notices failed: ' + error.message);
    process.exitCode = 1;
  }
}

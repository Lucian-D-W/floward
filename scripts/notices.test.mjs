import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { collectLicenseText, emitNotices, isProjectPackage } from './notices.mjs';

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'floward-notices-'));
  // Only this newly-created synthetic fixture is removed, never user data.
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const pkg = { root, name: 'example', version: '1.0.0', ecosystem: 'cargo', license: 'MIT' };
  return { root, pkg, manifest: { packages: {}, files: {} } };
}

test('recognizes the actual lowercase unlicense filename', t => {
  const f = fixture(t);
  fs.writeFileSync(path.join(f.root, 'unlicense'), 'This is free and unencumbered software.');
  assert.match(collectLicenseText(f.pkg, f.manifest, f.root), /free and unencumbered/);
});

test('uses exact-version retained terms and original attribution', t => {
  const f = fixture(t);
  const text = 'Permission granted. Original attribution.';
  fs.writeFileSync(path.join(f.root, 'terms.txt'), text);
  f.manifest.files['terms.txt'] = createHash('sha256').update(text).digest('hex');
  f.manifest.packages['cargo:example@1.0.0'] = { license: 'MIT', files: ['terms.txt'], sources: ['https://example.com/immutable'], attribution: 'Original Author' };
  assert.match(collectLicenseText(f.pkg, f.manifest, f.root), /Original Author[\s\S]*Permission granted/);
  assert.throws(() => collectLicenseText({ ...f.pkg, version: '2.0.0' }, f.manifest, f.root), /exact version/);
});

test('rejects altered retained terms', t => {
  const f = fixture(t);
  fs.writeFileSync(path.join(f.root, 'terms.txt'), 'altered');
  f.manifest.files['terms.txt'] = createHash('sha256').update('original').digest('hex');
  f.manifest.packages['cargo:example@1.0.0'] = { license: 'MIT', files: ['terms.txt'], sources: [] };
  assert.throws(() => collectLicenseText(f.pkg, f.manifest, f.root), /checksum mismatch/);
});

test('a license name or copyright line alone cannot produce a complete entry', t => {
  const f = fixture(t);
  fs.writeFileSync(path.join(f.root, 'COPYRIGHT'), 'Copyright Original Author');
  assert.throws(() => collectLicenseText(f.pkg, f.manifest, f.root), /no complete license text/);
});

test('excludes only the application manifest, not a same-name dependency', t => {
  const f = fixture(t);
  assert.equal(isProjectPackage({ manifest_path: path.join(f.root, 'src-tauri/Cargo.toml') }, f.root), true);
  assert.equal(isProjectPackage({ manifest_path: path.join(f.root, 'vendor/floward/Cargo.toml') }, f.root), false);
});

test('failure and check mode preserve the existing deliverable', t => {
  const f = fixture(t);
  const output = path.join(f.root, 'THIRD_PARTY_NOTICES.md');
  fs.writeFileSync(output, 'previous verified notices');
  assert.throws(() => emitNotices(output, () => { throw new Error('missing license'); }), /missing license/);
  assert.equal(fs.readFileSync(output, 'utf8'), 'previous verified notices');
  assert.throws(() => emitNotices(output, () => ({ text: 'changed' }), { check: true }), /differ/);
  assert.equal(fs.readFileSync(output, 'utf8'), 'previous verified notices');
  emitNotices(output, () => ({ text: 'new verified notices' }));
  assert.equal(fs.readFileSync(output, 'utf8'), 'new verified notices');
});

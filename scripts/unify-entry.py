"""Verify/update Floward binaries and shortcuts. No process killing or database access.

python scripts/unify-entry.py --check
python scripts/unify-entry.py --apply
"""
import argparse
import base64
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
from datetime import datetime

ROOT = Path(__file__).resolve().parent.parent


def digest(path):
    with Path(path).open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


def powershell(code, payload=None):
    env = os.environ.copy()
    env['FLOWARD_ENTRY_PAYLOAD'] = json.dumps(payload or {}, ensure_ascii=False)
    prefix = "$ErrorActionPreference='Stop'; [Console]::OutputEncoding=[System.Text.UTF8Encoding]::new(); "
    encoded = base64.b64encode((prefix + code).encode('utf-16le')).decode()
    result = subprocess.run(['powershell.exe', '-NoProfile', '-NonInteractive', '-EncodedCommand', encoded],
                            env=env, capture_output=True, encoding='utf-8',
                            creationflags=subprocess.CREATE_NO_WINDOW, timeout=60)
    if result.returncode:
        raise RuntimeError(result.stderr.strip() or result.stdout.strip())
    return json.loads(result.stdout.lstrip('\ufeff'))


def inventory():
    return powershell(r'''
$shell=New-Object -ComObject WScript.Shell
$roots=@([Environment]::GetFolderPath('Desktop'),[Environment]::GetFolderPath('CommonDesktopDirectory'),[Environment]::GetFolderPath('Programs'))
$links=@(foreach($root in $roots) {
 if(Test-Path -LiteralPath $root) {
  Get-ChildItem -LiteralPath $root -Filter '*.lnk' -Recurse | ForEach-Object {
   $link=$shell.CreateShortcut($_.FullName)
   if($link.TargetPath -match '(?i)(\\|/)(floward|naozha)\.exe$') {
    @{path=$_.FullName;target=$link.TargetPath;arguments=$link.Arguments;workingDirectory=$link.WorkingDirectory}
   }
  }
 }
})
$processes=@(Get-Process -Name floward,naozha -ErrorAction SilentlyContinue | ForEach-Object { @{pid=$_.Id;path=$_.Path} })
@{links=$links;processes=$processes;desktop=[Environment]::GetFolderPath('Desktop')} | ConvertTo-Json -Depth 5 -Compress
''')


def normalized(path):
    return os.path.normcase(os.path.abspath(path))


def plan(source, fixed, inv):
    wanted = digest(source)
    home = Path.home()
    candidates = [fixed, home/'AppData/Local/Floward/floward.exe']
    candidates += list((home/'AppData/Local/Packages').glob('*/LocalCache/Local/Floward/floward.exe'))
    candidates += [Path(link['target']) for link in inv['links'] if Path(link['target']).exists()]
    # Multiple redirected names may resolve to one file. Preserve their aliases
    # in the verification list, but write each observed file identity only once.
    aliases, updates, identities = {}, [], set()
    for path in candidates:
        key = normalized(path)
        if key in aliases or (not path.exists() and path != fixed):
            continue
        aliases[key] = str(path)
        identity = (path.stat().st_dev, path.stat().st_ino) if path.exists() else key
        current = digest(path) if path.exists() else None
        if current != wanted and identity not in identities:
            updates.append(str(path))
        identities.add(identity)
    links = [link for link in inv['links'] if normalized(link['target']) != normalized(fixed)]
    blockers = [p for p in inv['processes'] if p['path'] and normalized(p['path']) in aliases]
    return dict(sha256=wanted, binaries=list(aliases.values()), updates=updates,
                shortcuts=links, running=blockers,
                unknownProcesses=[p for p in inv['processes'] if not p['path']])


def probe_writable(path):
    """Open without truncating, requesting exclusive access to existing files."""
    import ctypes
    from ctypes import wintypes as W
    kernel = ctypes.WinDLL('kernel32', use_last_error=True)
    kernel.CreateFileW.argtypes = [W.LPCWSTR,W.DWORD,W.DWORD,ctypes.c_void_p,W.DWORD,W.DWORD,W.HANDLE]
    kernel.CreateFileW.restype = W.HANDLE
    kernel.CloseHandle.argtypes = [W.HANDLE]
    handle = kernel.CreateFileW(str(path), 0x80000000 | 0x40000000, 0, None, 3, 0, None)
    if handle == ctypes.c_void_p(-1).value:
        raise OSError(ctypes.get_last_error(), 'File occupied or not writable', str(path))
    kernel.CloseHandle(handle)


def replace_file(source, target):
    target = Path(target)
    target.parent.mkdir(parents=True, exist_ok=True)
    fd, temp = tempfile.mkstemp(prefix='.floward-update-', dir=target.parent)
    os.close(fd)
    try:
        shutil.copy2(source, temp)
        if digest(temp) != digest(source):
            raise RuntimeError('Staged binary hash mismatch')
        os.replace(temp, target)
    finally:
        if os.path.exists(temp):
            os.unlink(temp)


def apply(source, fixed, work, inv, report):
    if work['running']:
        raise RuntimeError('Close the listed running application normally before updating')
    # Preflight all replacements before any application files change.
    for path in work['updates']:
        if Path(path).exists():
            probe_writable(path)
    for link in work['shortcuts']:
        probe_writable(link['path'])
    archive = ROOT/'archive'/('entry-update-' + datetime.now().strftime('%Y%m%d-%H%M%S-%f'))
    archive.mkdir(parents=True)
    report['backup'] = str(archive)
    backups = []
    for i, path in enumerate(work['updates'] + [link['path'] for link in work['shortcuts']]):
        original = Path(path)
        backup = archive / (str(i) + '-' + original.name)
        if original.exists():
            shutil.copy2(original, backup)
            backups.append({'path': path, 'backup': str(backup)})
        else:
            backups.append({'path': path, 'backup': None})
    (archive/'manifest.json').write_text(json.dumps(backups, indent=2), encoding='utf-8')
    # Explicit partial-state reporting is safer than pretending a multi-file
    # Windows update is transactional. All old files remain in the backup.
    report['changed'] = []
    for path in work['updates']:
        replace_file(source, path)
        report['changed'].append(path)
    for link in work['shortcuts']:
        powershell(r'''
$p=$env:FLOWARD_ENTRY_PAYLOAD | ConvertFrom-Json
$shell=New-Object -ComObject WScript.Shell
$link=$shell.CreateShortcut($p.path)
$link.TargetPath=$p.target
$link.WorkingDirectory=Split-Path -Parent $p.target
$link.IconLocation=$p.target+',0'
$link.Save()
$check=$shell.CreateShortcut($p.path)
if($check.TargetPath -ne $p.target) { throw 'Shortcut target verification failed' }
@{ok=$true} | ConvertTo-Json -Compress
''', {'path': link['path'], 'target': str(fixed)})
        report['changed'].append(link['path'])
    for path in work['binaries']:
        if digest(path) != work['sha256']:
            raise RuntimeError('Post-update hash mismatch: ' + path)
    remaining = plan(source, fixed, inventory())
    if remaining['updates'] or remaining['shortcuts']:
        raise RuntimeError('Post-update discovery found remaining inconsistent entries')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument('--check', action='store_true', help='Read-only inspection (default)')
    mode.add_argument('--apply', action='store_true', help='Update after preflight and backup')
    parser.add_argument('--source', type=Path, default=ROOT/'src-tauri/target/release/floward.exe')
    args = parser.parse_args()
    report = {'mode': 'apply' if args.apply else 'check', 'status': 'failed', 'autoLaunched': False}
    code = 1
    try:
        if os.name != 'nt':
            raise RuntimeError('This tool requires Windows')
        source = args.source.resolve(strict=True)
        fixed = ROOT/'release/current/naozha.exe'
        inv = inventory()
        report['discoveredShortcuts'] = inv['links']
        work = plan(source, fixed, inv)
        report.update(work)
        if args.apply and (work['updates'] or work['shortcuts']):
            apply(source, fixed, work, inv, report)
        report['status'] = 'verified' if args.apply or not (work['updates'] or work['shortcuts']) else 'needs-update'
        code = 0 if report['status'] == 'verified' else 2
    except Exception as error:
        report['error'] = str(error)
        report['status'] = 'partial' if report.get('changed') else 'blocked'
    output = ROOT/'release/entry-update-report.json'
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return code


if __name__ == '__main__':
    sys.stdout.reconfigure(encoding='utf-8')
    raise SystemExit(main())

"""Re-link the real failed arm64 simulator objects with beta.4 ownership.

No project/source changes. Removes ONLY the SDK's direct app objects/core library;
the unchanged static pod archive already owns them. This is not a fresh Xcode build.
"""
import argparse
import json
from pathlib import Path
import shlex
import subprocess

parser = argparse.ArgumentParser()
parser.add_argument('--log', type=Path, required=True)
parser.add_argument('--output', type=Path, required=True)
parser.add_argument('--reproduce-beta3', action='store_true', help='Negative control: expect the original duplicate-symbol failure')
args = parser.parse_args()
args.output.mkdir(parents=True, exist_ok=True)
lines = args.log.read_text().splitlines()
command = None
for i, line in enumerate(lines):
    if line.startswith('Ld ') and 'Quralingo.debug.dylib' in line:
        command = shlex.split(lines[i + 2].strip())
        break
if not command or Path(command[0]).name != 'clang' or 'arm64-apple-ios15.6-simulator' not in command:
    raise ValueError('Expected real arm64 Quralingo simulator clang link command')
removed = []
revised = []
index = 0
while index < len(command):
    value = command[index]
    if value == '-filelist':
        filelist = Path(command[index + 1])
        entries = filelist.read_text().splitlines()
        dropped = [e for e in entries if Path(e).name in ('TajweedFormer.o', 'COpus.o')]
        if len(dropped) != 2:
            raise ValueError('Expected beta.3 direct SDK objects')
        if not args.reproduce_beta3:
            removed.extend(dropped)
        path = args.output / 'Quralingo.LinkFileList'
        path.write_text('\n'.join(entries if args.reproduce_beta3 else [e for e in entries if e not in dropped]) + '\n')
        revised.extend(['-filelist', str(path.resolve())]); index += 2; continue
    if value == '-lTajweedFormerCore' and not args.reproduce_beta3:
        removed.append(value); index += 1; continue
    if value == '-o':
        revised.extend(['-o', str((args.output / 'Quralingo.debug.dylib').resolve())]); index += 2; continue
    if index >= 2 and command[index - 1] == '-Xlinker' and command[index - 2] in ('-object_path_lto', '-dependency_info'):
        revised.append(str((args.output / Path(value).name).resolve()))
    else:
        revised.append(value)
    index += 1
# Link-map evidence is additive instrumentation, not suppression of linker failures.
revised.extend(['-Xlinker', '-map', '-Xlinker', str((args.output / 'Quralingo-LinkMap.txt').resolve())])
log = args.output / 'link.log'
with log.open('w') as output:
    result = subprocess.run(revised, stdout=output, stderr=subprocess.STDOUT)
(args.output / 'ownership-change.json').write_text(json.dumps(dict(removed=removed, returncode=result.returncode), indent=2) + '\n')
print(json.dumps(dict(returncode=result.returncode, removed=removed, log=str(log))))
if args.reproduce_beta3:
    if result.returncode == 0 or 'duplicate symbol' not in log.read_text(errors='replace'):
        raise AssertionError('Negative control did not reproduce duplicate symbols')
    print('PASS: beta.3 duplicate-symbol failure reproduced with the original app objects/link flags')
    raise SystemExit(0)
raise SystemExit(result.returncode)

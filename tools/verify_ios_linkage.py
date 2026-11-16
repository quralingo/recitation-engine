"""Inspect actual archive, final Mach-O link map/symbols and copied SDK resources."""
import argparse
from collections import Counter
import hashlib
import json
from pathlib import Path
import subprocess

parser = argparse.ArgumentParser()
parser.add_argument('--archive', required=True, type=Path)
parser.add_argument('--binary', required=True, type=Path)
parser.add_argument('--link-map', required=True, type=Path)
parser.add_argument('--app', required=True, type=Path)
parser.add_argument('--sdk-bundle', required=True, type=Path)
args = parser.parse_args()
members = Counter(subprocess.check_output(['xcrun', 'ar', '-t', str(args.archive)], text=True).splitlines())
duplicates = [name for name, count in members.items() if name.endswith('.o') and count != 1]
if duplicates:
    raise AssertionError(f'Duplicate archive object members: {duplicates}')
for name in ('TajweedFormer.o', 'COpus.o', 'zf_rt.c.o'):
    if members[name] != 1:
        raise AssertionError(f'Archive must contain one {name}, found {members[name]}')
mapping = args.link_map.read_text(errors='replace')
objects = mapping.split('# Object files:', 1)[1].split('# Sections:', 1)[0].splitlines()
for name in ('TajweedFormer.o', 'COpus.o', 'zf_rt.c.o'):
    entries = [line for line in objects if name in line]
    if len(entries) != 1 or f'QuralingoRecitation({name})' not in entries[0]:
        raise AssertionError(f'{name} must link once from the pod archive: {entries}')
if any('libTajweedFormerCore.a(' in line for line in objects):
    raise AssertionError('Core is linked independently as well as from the pod')
symbols = subprocess.check_output(['xcrun', 'nm', '-gU', str(args.binary)], text=True)
for name in ('_opus_encode', '_opus_encoder_create'):
    if sum(line.split()[-1:] == [name] for line in symbols.splitlines()) != 1:
        raise AssertionError(f'{name} must be defined once in the final image')
destination = args.app / args.sdk_bundle.name
if not (destination / 'PrivacyInfo.xcprivacy').is_file():
    raise AssertionError('SDK privacy manifest missing from app bundle')
files = 0
for path in args.sdk_bundle.rglob('*'):
    if path.is_file():
        copied = destination / path.relative_to(args.sdk_bundle)
        if not copied.is_file() or hashlib.sha256(path.read_bytes()).digest() != hashlib.sha256(copied.read_bytes()).digest():
            raise AssertionError(f'SDK resource not preserved: {path.name}')
        files += 1
print(json.dumps(dict(archive_sdk_members_once=True, final_sdk_link_once=True, resource_files_verified=files,
                     privacy_manifest_preserved=True, binary=str(args.binary))))

"""Verify generated checksums and create a deterministic mobile-data archive."""
import hashlib
import json
from pathlib import Path
import zipfile

root = Path(__file__).resolve().parents[1]
data = root / 'mobile-reference'
manifest = json.loads((data / 'manifest.json').read_text())
for name, expected in manifest['files'].items():
    blob = (data / name).read_bytes()
    if len(blob) != expected['bytes'] or hashlib.sha256(blob).hexdigest() != expected['sha256']:
        raise ValueError(f'Reference checksum mismatch: {name}')
archive = root / 'hafs-tj3-reference.zip'
with zipfile.ZipFile(archive, 'w', compression=zipfile.ZIP_DEFLATED, compresslevel=9) as z:
    entries = [(p.relative_to(data).as_posix(), p.read_bytes()) for p in data.rglob('*') if p.is_file()]
    entries.append(('INTEGRATION.md', (root / 'docs/reference-data.md').read_bytes()))
    for name, content in sorted(entries):
        info = zipfile.ZipInfo('mobile-reference/' + name, date_time=(2026, 11, 16, 0, 0, 0))
        info.compress_type = zipfile.ZIP_DEFLATED
        info.external_attr = 0o100644 << 16
        z.writestr(info, content, compress_type=zipfile.ZIP_DEFLATED, compresslevel=9)
print(f'{archive.name}: {archive.stat().st_size} bytes; checksums verified')

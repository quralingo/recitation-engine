"""Deterministic offline export using pinned Quran Lab source; no handwritten Quran phones.

python3 tools/export_hafs_reference.py --g2p /path/to/quran-g2p --output mobile-reference
The source checkout must match tools/g2p-pin.json. Python >=3.10, no pip dependencies.
"""
import argparse
import hashlib
import json
from pathlib import Path
import sys


def blob_sha(data):
    return hashlib.sha1(b'blob ' + str(len(data)).encode() + b'\0' + data).hexdigest()


def write_json(path, data):
    path.write_text(json.dumps(data, ensure_ascii=False, separators=(',', ':')) + '\n', encoding='utf-8')


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--g2p', required=True, type=Path)
    parser.add_argument('--output', required=True, type=Path)
    args = parser.parse_args()
    root = args.g2p.resolve()
    pin = json.loads(Path(__file__).with_name('g2p-pin.json').read_text())
    for entry in pin['files']:
        path = root / entry['path']
        if blob_sha(path.read_bytes()) != entry['gitBlob']:
            raise ValueError(f'Unpinned upstream file: {entry["path"]}')
    # Never silently import unpinned additional Python files from a different source tree.
    expected = {e['path'] for e in pin['files'] if e['path'].endswith('.py')}
    actual = {p.relative_to(root).as_posix() for p in (root / 'src').rglob('*.py')}
    if actual != {p for p in expected if p.startswith('src/')}:
        raise ValueError('Upstream Python source file set differs from pin')
    sys.path.insert(0, str(root / 'src'))
    from quran_g2p.textbank import TextBank
    from quran_g2p.phonemize import phonemize
    from quran_g2p.tokenlayer_tj3 import TOKENS, INDEX, phones_to_tj3, phones_to_tj3_units
    bank = TextBank.load('tanzil')  # Official loader verifies its SHA-256 and basmala handling.
    assert bank.n_ayat == 6236 and len(TOKENS) == 38
    vocabulary_file = root / 'artifacts/tokenizer_tj3/tokens.txt'
    source = dict(repository=pin['repository'], revision=pin['revision'],
                  textSha256=hashlib.sha256((root / 'data/tanzil-uthmani.txt').read_bytes()).hexdigest(),
                  vocabularySha256=hashlib.sha256(vocabulary_file.read_bytes()).hexdigest())
    out = args.output
    (out / 'surahs').mkdir(parents=True, exist_ok=True)
    (out / 'attributes').mkdir(exist_ok=True)
    surahs, attributes, word_spans, counts = {}, {}, [], dict(ayat=0, words=0, tokens=0, phones=0)
    for ref in bank.refs():
        result = phonemize(bank.ayah(ref), edition='tanzil', ref=ref)
        assert len(result.segments) == 1
        phones = result.segments[0].phones
        indices = sorted({p.word_index for p in phones})
        assert indices == list(range(len(indices))), (ref, 'Missing word index')
        full, first = phones_to_tj3_units([[p] for p in phones])
        assert full == phones_to_tj3(phones)
        words = [phones_to_tj3([p for p in phones if p.word_index == index], boundaries=False) for index in indices]
        joined = []
        for i, word in enumerate(words):
            if i: joined.append('|')
            joined.extend(word)
        assert joined == full, (ref, 'Wordwise rendering changes joined sequence')
        encoded = [[INDEX[token] for token in word] for word in words]
        assert all(word and all(2 <= token < 37 for token in word) for word in encoded)
        bundle = surahs.setdefault(ref.surah, dict(format='quralingo.hafs-tj3/1', reading='ayah-end',
                        surah=ref.surah, vocabulary=TOKENS, source=source, ayahs={}))
        bundle['ayahs'][str(ref.ayah)] = encoded
        word_spans.append(dict(surah=ref.surah, ayah=ref.ayah,
            textSha256=hashlib.sha256(bank.ayah(ref).encode('utf-8')).hexdigest(),
            spans=[[min(p.src_span[0] for p in phones if p.word_index == i),
                    max(p.src_span[1] for p in phones if p.word_index == i)] for i in indices]))
        # Sidecar: source prescriptions for future attribute scorers, NOT measured or scored feedback.
        # Positions use global tj3 token indexes INCLUDING word bars; merged short+madd phones may share a token.
        sites = []
        for phone, token_index in zip(phones, first):
            site = dict(wordIndex=phone.word_index, tokenIndex=token_index, base=phone.base.value)
            if phone.geminated: site['geminated'] = True
            if phone.ghunna: site['ghunna'] = phone.ghunna
            if phone.qalqalah: site['qalqalah'] = phone.qalqalah
            if phone.length:
                length = phone.length
                site['length'] = dict(kind=length.kind, allowed=sorted(length.allowed),
                                      canonical=length.canonical, scoring=sorted(length.scoring))
            if phone.sakt_after: site['saktAfter'] = True
            if len(site) > 3:
                site['rules'] = sorted({a.rule_id for a in phone.provenance if a.rule_id != 'EMIT'})
                sites.append(site)
        attributes.setdefault(ref.surah, dict(format='quralingo.hafs-tj3-attributes/1', reading='ayah-end',
                                             surah=ref.surah, source=source, ayahs={} ))['ayahs'][str(ref.ayah)] = sites
        counts['ayat'] += 1; counts['words'] += len(words); counts['tokens'] += sum(map(len, words)); counts['phones'] += len(phones)
    assert len(surahs) == 114 and counts['ayat'] == 6236
    files = {}
    for s in range(1, 115):
        for folder, data in [('surahs', surahs[s]), ('attributes', attributes[s])]:
            path = out / folder / f'{s:03}.json'
            write_json(path, data)
            files[path.relative_to(out).as_posix()] = dict(sha256=hashlib.sha256(path.read_bytes()).hexdigest(), bytes=path.stat().st_size)
    from dataclasses import asdict
    from quran_g2p.config import HafsConfig
    from quran_g2p.rules.registry import RULINGS
    write_json(out / 'rulings.json', [dict(id=r.id, nameAr=r.name_ar, nameEn=r.name_en, cite=r.cite) for r in RULINGS])
    (out / 'word-spans.jsonl').write_text(''.join(json.dumps(row, separators=(',', ':')) + '\n' for row in word_spans), encoding='utf-8')
    (out / 'LICENSE').write_bytes((root / 'LICENSE').read_bytes())
    (out / 'SOURCE-NOTICE.md').write_bytes((root / 'docs/SOURCES.md').read_bytes())
    # Preserve the original text file verbatim, with Tanzil's notice, for reproducible source verification.
    (out / 'tanzil-uthmani-source.txt').write_bytes((root / 'data/tanzil-uthmani.txt').read_bytes())
    for name in ['rulings.json', 'word-spans.jsonl', 'LICENSE', 'SOURCE-NOTICE.md', 'tanzil-uthmani-source.txt']:
        data = (out / name).read_bytes()
        files[name] = dict(sha256=hashlib.sha256(data).hexdigest(), bytes=len(data))
    write_json(out / 'manifest.json', dict(format='quralingo.hafs-tj3-manifest/1', source=source,
        reading='ayah-end', config=asdict(HafsConfig()), counts=counts, files=files,
        limitations=['Full ayah start to ayah-end waqf only; no automatic cropping or cross-ayah wasl.',
                     'Source word indices must be reconciled with the host display edition.',
                     'Symbolic attributes are prescriptions, not calibrated scores.']))
    print(json.dumps(counts))


if __name__ == '__main__':
    main()

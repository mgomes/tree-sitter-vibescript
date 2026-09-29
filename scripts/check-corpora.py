#!/usr/bin/env python3
"""Check every standalone corpus source accepted by the Rust compiler."""

import argparse
from concurrent.futures import ThreadPoolExecutor
import gzip
import hashlib
import json
from pathlib import Path
import re
import subprocess
import sys


RUST_LITERAL = re.compile(
    r'//[^\n]*|/\*.*?\*/|\br(?P<hashes>\#*)"(?P<raw>.*?)"(?P=hashes)'
    r'|(?<![\w\'])"(?P<escaped>(?:[^"\\]|\\.)*)"',
    re.DOTALL,
)


def rust_unescape(source):
    escapes = {'n': '\n', 'r': '\r', 't': '\t', '0': '\0', '\\': '\\', '"': '"', "'": "'"}

    def decode(match):
        value = match[1]
        if value.startswith('u{'):
            return chr(int(value[2:-1].replace('_', ''), 16))
        if value.startswith('x'):
            return chr(int(value[1:], 16))
        if value[0] in '\r\n':
            return ''
        return escapes.get(value, '\\' + value)

    return re.sub(r'\\(u\{[0-9a-fA-F_]+\}|x[0-9a-fA-F]{2}|\r?\n\s*|.)', decode, source)


def json_sources(value, label):
    if isinstance(value, dict):
        for key, item in value.items():
            if key in ('source', 'code', 'program') and isinstance(item, str):
                yield label + '/' + key, item
            elif isinstance(item, (list, dict)):
                yield from json_sources(item, label + '/' + key)
    elif isinstance(value, list):
        for index, item in enumerate(value):
            yield from json_sources(item, f'{label}/{index}')


def candidates(root):
    for directory in ('tests', 'corpus/glue', 'examples'):
        for path in sorted((root / directory).rglob('*')):
            if not path.is_file():
                continue
            label = str(path.relative_to(root))
            if path.suffix == '.vibe':
                yield label, path.read_text(), path.parent, path
            elif path.suffix == '.rs':
                source = path.read_text()
                for match in RUST_LITERAL.finditer(source):
                    if match['raw'] is not None:
                        code = match['raw']
                    elif match['escaped'] is not None:
                        code = rust_unescape(match['escaped'])
                    else:
                        continue
                    if code.strip() and '\0' not in code:
                        line = source.count('\n', 0, match.start()) + 1
                        yield f'{label}:{line}', code, path.parent, None
            elif path.name.endswith(('.json', '.jsonl', '.jsonl.gz')):
                opener = gzip.open if path.suffix == '.gz' else open
                with opener(path, 'rt') as stream:
                    values = (json.loads(line) for line in stream) if '.jsonl' in path.name else [json.load(stream)]
                    for index, value in enumerate(values):
                        for origin, code in json_sources(value, f'{label}:{index + 1}'):
                            if code.strip() and '\0' not in code:
                                yield origin, code, path.parent, None


def partition_results(summary, manifest, exceptions):
    origins = {item['path']: item['origin'] for item in manifest}
    failures, retired = [], []
    for item in summary['parse_summaries']:
        result = {**item, 'origin': origins[item['file']]}
        digest = hashlib.sha256(Path(item['file']).read_bytes()).hexdigest()
        if digest in exceptions:
            retired.append({**result, 'sha256': digest, 'diagnostics': exceptions[digest]['diagnostics']})
        elif not item['successful']:
            failures.append(result)
    return failures, retired


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('rust_repo', type=Path)
    parser.add_argument('--vibes', type=Path)
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--jobs', type=int, default=3)
    parser.add_argument('--reuse-checks', action='store_true', help='reuse checks only when all source inputs and the compiler are unchanged')
    args = parser.parse_args()
    if not 1 <= args.jobs <= 3:
        parser.error('--jobs must be between 1 and 3')
    root = args.rust_repo.resolve()
    vibes = (args.vibes or root / 'target/gate/vibes').resolve()
    grammar = Path(__file__).resolve().parent.parent
    cli = grammar / 'node_modules/.bin/tree-sitter'
    if not cli.exists() or not vibes.is_file():
        parser.error('run npm ci and provide a built Rust vibes binary')
    output = args.output.resolve()
    output.mkdir(parents=True, exist_ok=True)
    sources = {}
    for label, code, cwd, path in candidates(root):
        key = hashlib.sha256((str(cwd) + '\0' + code).encode()).hexdigest()
        sources.setdefault(key, (label, code, cwd, path))
    if not sources:
        parser.error('no corpus sources found')
    compiler_digest = hashlib.sha256(vibes.read_bytes()).digest()
    fingerprint = hashlib.sha256(vibes.read_bytes())
    fingerprint.update(''.join(sorted(sources)).encode())
    signature = fingerprint.hexdigest()
    checks_path = output / 'checks.json'
    previous = json.loads(checks_path.read_text()) if args.reuse_checks and checks_path.exists() else {}
    checks = previous.get('checks', {}) if previous.get('fingerprint') == signature else {}

    def check(item):
        key, (label, code, cwd, path) = item
        if key in checks:
            return key, checks[key]
        command = [str(vibes), 'check', '--json']
        command.extend([str(path)] if path else ['--eval', code])
        result = subprocess.run(command, cwd=cwd, capture_output=True, text=True, timeout=30)
        if result.returncode not in (0, 1):
            raise RuntimeError(f'{label}: compiler exited {result.returncode}: {result.stderr}')
        return key, {'accepted': result.returncode == 0, 'origin': label,
                     'diagnostics': result.stdout + result.stderr}

    with ThreadPoolExecutor(max_workers=args.jobs) as pool:
        for index, (key, result) in enumerate(pool.map(check, sources.items()), 1):
            checks[key] = result
            if index % 1000 == 0:
                print(f'Checked {index}/{len(sources)} candidates', flush=True)
    if hashlib.sha256(vibes.read_bytes()).digest() != compiler_digest:
        raise RuntimeError('compiler changed during the sweep; rerun with a stable binary')
    checks_path.write_text(json.dumps({'fingerprint': signature, 'checks': checks}, indent=2) + '\n')
    accepted = []
    manifest = []
    fixtures = output / 'accepted'
    fixtures.mkdir(exist_ok=True)
    for key, (label, code, _, _) in sources.items():
        if checks[key]['accepted']:
            path = fixtures / (key + '.vibe')
            path.write_text(code)
            accepted.append(str(path))
            manifest.append({'path': str(path), 'origin': label})
    if not accepted:
        raise RuntimeError('the Rust compiler accepted no fixtures')
    (output / 'manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')
    paths = output / 'paths.txt'
    paths.write_text('\n'.join(accepted) + '\n')
    result = subprocess.run([str(cli), 'parse', '--quiet', '--json-summary', '--timeout', '120000000', '--paths', str(paths)],
                            cwd=grammar, capture_output=True, text=True)
    (output / 'parse.log').write_text(result.stdout + result.stderr)
    start = result.stdout.find('{\n  "parse_summaries"')
    if start < 0:
        raise RuntimeError('Tree-sitter did not produce a parse summary; see parse.log')
    summary = json.loads(result.stdout[start:])
    (output / 'parse-summary.json').write_text(json.dumps(summary, indent=2) + '\n')
    exceptions = json.loads((grammar / 'test/name-suffix-exceptions.json').read_text())
    failures, retired = partition_results(summary, manifest,
                                         {item['sha256']: item for item in exceptions['sources']})
    (output / 'failures.json').write_text(json.dumps(failures, indent=2) + '\n')
    (output / 'retired-suffix-names.json').write_text(json.dumps(retired, indent=2) + '\n')
    if summary['source_count'] != len(accepted) or len(summary['parse_summaries']) != len(accepted):
        raise RuntimeError('Tree-sitter did not check every accepted fixture')
    print(f'{len(accepted)} accepted sources; {len(sources) - len(accepted)} rejected candidates; parse exit {result.returncode}')
    print(f'{len(retired)} obsolete suffix-name fixtures listed separately; {len(failures)} unexpected parse failures')
    print(f'Origins, compiler diagnostics and parser results: {output}')
    for failure in failures[:20]:
        print(f"Failed: {failure['origin']} ({failure['file']})")
    expected_failure_exit = result.returncode == 1 and any(not item['successful'] for item in retired)
    return bool(failures) or (result.returncode != 0 and not expected_failure_exit)


if __name__ == '__main__':
    sys.exit(main())

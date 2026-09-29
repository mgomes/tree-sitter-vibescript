import hashlib
import importlib.util
from pathlib import Path
import tempfile
import unittest


ROOT = Path(__file__).resolve().parents[2]
SPEC = importlib.util.spec_from_file_location('check_corpora', ROOT / 'scripts/check-corpora.py')
CHECK = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(CHECK)


class CorpusExceptionsTest(unittest.TestCase):
    def test_only_exact_retired_sources_are_exempt(self):
        with tempfile.TemporaryDirectory() as directory:
            paths = []
            for index, source in enumerate(['bad! = 1', 'bad! = 2', 'good = 1']):
                path = Path(directory) / f'{index}.vibe'
                path.write_text(source)
                paths.append(str(path))
            digest = hashlib.sha256(Path(paths[0]).read_bytes()).hexdigest()
            exceptions = {digest: {'diagnostics': [{'code': 'V0003', 'line': 1, 'column': 4}]}}
            manifest = [{'path': path, 'origin': f'fixture:{i}'} for i, path in enumerate(paths)]
            summary = {'parse_summaries': [
                {'file': path, 'successful': i == 2} for i, path in enumerate(paths)
            ]}
            failures, retired = CHECK.partition_results(summary, manifest, exceptions)
            self.assertEqual([item['file'] for item in failures], [paths[1]])
            self.assertEqual([item['file'] for item in retired], [paths[0]])
            self.assertEqual(retired[0]['origin'], 'fixture:0')
            self.assertEqual(retired[0]['diagnostics'][0]['code'], 'V0003')
            summary['parse_summaries'][0]['successful'] = True
            _, retired = CHECK.partition_results(summary, manifest, exceptions)
            self.assertEqual(len(retired), 1)


if __name__ == '__main__':
    unittest.main()

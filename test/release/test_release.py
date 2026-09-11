import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest


SCRIPT = Path(__file__).resolve().parents[2] / "scripts/check-release.py"


class ReleaseTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.repo = Path(self.directory.name)
        self.git("init", "--quiet", "--initial-branch=master")
        self.git("config", "user.name", "Release tests")
        self.git("config", "user.email", "release@example.invalid")
        (self.repo / "Cargo.toml").write_text(
            '[package]\nname = "tree-sitter-vibescript"\nversion = "0.70.0"\n'
        )
        (self.repo / "package.json").write_text(json.dumps({"version": "0.70.0"}))
        (self.repo / "tree-sitter.json").write_text(
            json.dumps({"metadata": {"version": "0.70.0"}})
        )
        self.git("add", ".")
        self.git("commit", "--quiet", "-m", "Release")
        self.git("update-ref", "refs/remotes/origin/master", "HEAD")

    def git(self, *args):
        return subprocess.check_output(
            ["git", *args], cwd=self.repo, text=True, stderr=subprocess.PIPE
        ).strip()

    def validate(self, tag="v0.70.0"):
        return subprocess.run(
            [sys.executable, str(SCRIPT), tag],
            cwd=self.repo,
            text=True,
            capture_output=True,
        )

    def test_release_tag_resolves_to_commit(self):
        self.git("tag", "-a", "v0.70.0", "-m", "Release")
        result = self.validate()
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(result.stdout.strip(), self.git("rev-parse", "HEAD"))

    def test_branch_cannot_impersonate_a_tag(self):
        self.git("branch", "v0.70.0")
        self.assertNotEqual(self.validate().returncode, 0)

    def test_tag_outside_master_is_rejected(self):
        self.git("switch", "--quiet", "-c", "unreviewed")
        self.git("commit", "--quiet", "--allow-empty", "-m", "Unreviewed")
        self.git("tag", "v0.70.0")
        self.assertNotEqual(self.validate().returncode, 0)

    def test_version_mismatch_is_rejected(self):
        self.git("tag", "v0.70.1")
        self.assertNotEqual(self.validate("v0.70.1").returncode, 0)

    def test_branch_with_same_name_does_not_change_selected_commit(self):
        commit = self.git("rev-parse", "HEAD")
        self.git("tag", "v0.70.0")
        self.git("switch", "--quiet", "-c", "v0.70.0")
        self.git("commit", "--quiet", "--allow-empty", "-m", "Unreviewed")
        result = self.validate()
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(result.stdout.strip(), commit)


if __name__ == "__main__":
    unittest.main()

import json
import re
import subprocess
import sys
import tomllib


def git(*args):
    return subprocess.check_output(["git", *args], text=True).strip()


def main():
    tag = sys.argv[1]
    if not re.fullmatch(r"v[0-9]+\.[0-9]+\.[0-9]+", tag):
        sys.exit("Expected a release tag such as v0.70.0")

    ref = f"refs/tags/{tag}"
    subprocess.run(["git", "show-ref", "--verify", "--quiet", ref], check=True)
    commit = git("rev-parse", "--verify", f"{ref}^{{commit}}")
    subprocess.run(
        ["git", "merge-base", "--is-ancestor", commit, "origin/master"], check=True
    )

    crate = tomllib.loads(git("show", f"{commit}:Cargo.toml"))
    package = json.loads(git("show", f"{commit}:package.json"))
    grammar = json.loads(git("show", f"{commit}:tree-sitter.json"))
    version = tag[1:]
    if (
        crate["package"]["name"] != "tree-sitter-vibescript"
        or crate["package"]["version"] != version
        or package["version"] != version
        or grammar["metadata"]["version"] != version
    ):
        sys.exit("Release tag and package versions must match")

    print(commit)


if __name__ == "__main__":
    main()

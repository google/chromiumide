# How to make a release

## Pre-releases

Pre-releases are automatically published from the HEAD of the repository by the
nightly GitHub Action job. Precisely, the nightly job commits a patch that bumps
the version number and assigns a version tag to the commit, which triggers
another GitHub Action job that builds the extension and publishes it to the
marketplace.

## Releases

First, create a commit with the following changes:

- Run `./tools/bump_version.py --release` to bump the version number in
  `package.json`.
- Edit [CHANGELOG.md](/CHANGELOG.md) to add a new entry for the release.

Send a pull request for the change, make sure all checks pass, and merge it.

Then trigger the automated release process by creating a GitHub release:

1. Visit https://github.com/google/chromiumide/releases/new
2. Click "Tag" -> "Create New Tag", and enter the new version number with
   "v" prefix (e.g. "v0.100.0")
3. In the "Release Notes" section, select the correct previous tag, and
   click "Generate release notes".
4. Update the release notes doc if needed.
5. Click the "Publish release" button.

This will trigger another GitHub Action job that builds the extension and
publishes it to the marketplace.

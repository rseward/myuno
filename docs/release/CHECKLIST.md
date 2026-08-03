# Release Checklist

This document outlines the standard procedure for performing a new release of the UNO Online project.

## Pre-Release Steps

1. **Identify Current Version**: Check `package.json` for the current `version` field. Run `git log --oneline` to see commit history and determine what changes are pending release.
2. **Review Changes**: Run `git diff` (unstaged) and `git log --oneline <last-tag>..HEAD` to review all changes since the last release. This tells you what will be included in the new release.
3. **Write Release Notes**: Prepend a user-facing summary of changes to `docs/release/RELEASE.md` under a new version heading. Summaries should be 2-5 bullet points, written in language an end user would understand. Create the file if it does not yet exist.
4. **Bump Version Number**: Increment the `version` field in `package.json` (e.g., `"version": "1.1.0"`). Ensure `package-lock.json` is updated to match — run `npm install` to sync the lockfile if needed.
5. **Verify the Build**: Run `npm run build` to confirm the Vite production build succeeds with no errors. Fix any issues before proceeding.
6. **Commit**: Stage all changes (`git add -A`) and commit with a descriptive message like `Release v1.1.0`.

## Release Steps

7. **Tag the Release**: Create a git tag matching the version (e.g., `git tag v1.1.0`).
8. **Push the Commit**: Push the branch to the remote (e.g., `git push origin main`).
9. **Push the Tag**: Push the tag to the remote (e.g., `git push origin v1.1.0`).

## Container Image Steps

10. **Build the Container Image**: Run `make docker` to build the image with podman. Confirm the image is tagged as `myuno:latest` locally.
11. **Log In to GitLab Registry**: Run `make login` (requires `GITLAB_DEPLOY_TOKEN` to be set in the environment).
12. **Push the Container Image**: Run `make push` to tag the image as `registry.gitlab.com/rseward1/myuno:latest` and push it to the GitLab Container Registry.
13. **Verify the Push**: Check that the image appears in the GitLab project's Container Registry at https://gitlab.com/rseward1/myuno/container_registry.

## Post-Release Steps

14. **Verify the Tag**: Confirm the tag and commit appear on the remote repository (GitHub).
15. **Verify the Container Image**: Pull the image on a clean machine to confirm it is accessible: `podman pull registry.gitlab.com/rseward1/myuno:latest`.
16. **Communicate**: Inform stakeholders of the new release and its changes.
#!/usr/bin/env bash
# resolve-pr.sh PR_NUMBER OWNER BRANCH
# Fetches the PR branch, merges it onto current main,
# resolves conflicts by:
#   - package-lock.json / yarn.lock / Cargo.lock: take ours (main wins, Dependabot lockfiles handled separately)
#   - All other conflicted files: take theirs (the PR's changes are the intent)
# Then commits and pushes a resolution branch.

set -euo pipefail

PR=$1
OWNER=$2
BRANCH=$3
REPO="NeuroWealth-Smartcontract"
REMOTE_URL="https://github.com/${OWNER}/${REPO}.git"
TMP_BRANCH="pr-${PR}-tmp"
RESOLVE_BRANCH="resolved/pr-${PR}"

echo "==> PR #${PR}: ${OWNER}/${BRANCH}"

# Fetch remote branch
git fetch "${REMOTE_URL}" "${BRANCH}:${TMP_BRANCH}" 2>/dev/null

# Create resolution branch from current main
git checkout main
git checkout -b "${RESOLVE_BRANCH}"

# Attempt merge
if git merge "${TMP_BRANCH}" --no-commit --no-ff 2>/dev/null; then
    echo "  Clean merge"
else
    echo "  Conflicts detected — resolving..."
    # Get list of conflicted files
    conflicted=$(git diff --name-only --diff-filter=U)
    for f in $conflicted; do
        if [[ "$f" == *"package-lock.json"* ]] || [[ "$f" == *"yarn.lock"* ]] || [[ "$f" == *"Cargo.lock"* ]]; then
            # For lockfiles, take ours (main version) to avoid churn
            git checkout --ours "$f" 2>/dev/null || true
        else
            # For all other files, take theirs (the PR's intent)
            git checkout --theirs "$f" 2>/dev/null || true
        fi
        git add "$f"
    done
fi

# Stage any remaining unstaged changes
git add -A 2>/dev/null || true

# Commit if there's anything to commit
if ! git diff --cached --quiet; then
    git commit -m "merge(pr-${PR}): resolve conflicts from ${OWNER}/${BRANCH}"
fi

# Push the resolution branch
git push origin "${RESOLVE_BRANCH}" --force-with-lease 2>/dev/null

# Clean up tmp branch
git checkout main
git branch -D "${TMP_BRANCH}" 2>/dev/null || true
git branch -D "${RESOLVE_BRANCH}" 2>/dev/null || true

echo "  Done — branch resolved/pr-${PR} pushed"

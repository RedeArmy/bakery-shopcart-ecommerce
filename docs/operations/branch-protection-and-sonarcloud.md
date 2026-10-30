# Branch protection and SonarCloud

`main` accepts changes only through a pull request that passes every check, SonarCloud included. Nobody can push to it directly, force-push it or delete it, and no one can bypass the rules, administrators included.

## The ruleset

The ruleset is versioned in [`.github/rulesets/main-protection.json`](../../.github/rulesets/main-protection.json).

| Rule | Effect |
|---|---|
| Restrict deletions and block force pushes | `main` cannot be deleted or rewritten |
| Require linear history | Only squash and rebase merges; no merge commits |
| Require a pull request | No direct commits to `main`. Zero approvals are required because this is a one-person project; raise `required_approving_review_count` to 1 once a second reviewer exists |
| Dismiss stale approvals and require resolved conversations | A new push invalidates earlier approvals and open threads block the merge |
| Require status checks, branch up to date | `lint`, `typecheck`, `unit`, `architecture`, `secrets`, `sql-lint`, `sql-tests`, `compose-validate`, `windows-smoke` and `sonarcloud` must pass on the latest commit |
| No bypass actors | The rules apply to everyone |

The `integration` job is switched off until Stage 2. Add it to `required_status_checks` when it is enabled. `sql-tests` is enabled; the ruleset in GitHub must list it too (edit the active ruleset and add the check, or re-import the JSON), and only after the job has passed once on a pull request, because a required check that never ran blocks every merge.

### Import it

1. Push the branch and open the first pull request so every job runs once.
2. In GitHub open **Settings → Rules → Rulesets → New ruleset → Import a ruleset** and upload the JSON file.
3. Check that **Enforcement status** is **Active** and save.

Status checks can only be picked by name after they have run once; the import does not need that, but a check that never runs would block every merge, so keep the names in the file identical to the job names in `ci.yml`.

With the GitHub CLI the same file can be applied with:

```bash
gh api repos/RedeArmy/bakery-shopcart-ecommerce/rulesets --method POST --input .github/rulesets/main-protection.json
```

## SonarCloud

The analysis runs from GitHub Actions (job `sonarcloud`), not from SonarCloud's automatic analysis, because coverage must be uploaded.

### One-time setup

1. Sign in at <https://sonarcloud.io> with the GitHub account and choose **Import an organization** for `RedeArmy` (the free plan covers public repositories). <!-- spelling-ignore -->
2. Choose the option to analyse a new project (the button is labelled with the US spelling), select `bakery-shopcart-ecommerce` and choose **With GitHub Actions**. When asked for the build, choose **Other**.
3. In the project go to **Administration → Analysis Method** and **turn off Automatic Analysis**. Two analysis methods at once make the scan fail.
4. Copy the generated token (**My Account → Security**, or the one shown by the wizard).
5. In GitHub open **Settings → Secrets and variables → Actions → New repository secret** and create `SONAR_TOKEN` with that token.
6. Open `sonar-project.properties` and confirm `sonar.organization` (the organisation key shown in SonarCloud, lower case) and `sonar.projectKey` (normally `RedeArmy_bakery-shopcart-ecommerce`). Fix them if they differ. <!-- spelling-ignore -->
7. In SonarCloud go to **Administration → New Code** and choose **Previous version** or **Reference branch: main**, so a pull request is judged on the code it changes.
8. Optional: install the SonarCloud GitHub app on the repository to get the `SonarCloud Code Analysis` check and pull request decoration.

### Quality gate

The default **Sonar way** gate requires, on new code: no new bugs or vulnerabilities, security hotspots reviewed, at most 3 % duplication, security, reliability and maintainability ratings of A, and coverage of at least 80 %.

Coverage is the condition to watch. The skeleton in this repository has little test code (frontend about 20 %, backend about 61 %), so the first pull request would fail on coverage. Pick one:

- **Recommended:** create a custom gate (**Quality Gates → Create**), copy Sonar way and lower coverage on new code to 60 % until Stage 7, then restore 80 %.
- Or add tests to the skeleton before opening the pull request.

Do not exclude real code from coverage to pass the gate. `sonar.coverage.exclusions` is limited to entry points, empty `index.ts` files and placeholders without logic.

### Run the coverage locally

```bash
npm run test:coverage
```

This writes `coverage/lcov.info` in `backend`, `frontend` and `tools/scripts`, which are ignored by Git.

## Working flow

1. Create a branch (`feat/…`, `fix/…`, `docs/…`, `chore/…`) and commit with Conventional Commits.
2. Push it and open a pull request against `main`.
3. Wait for all checks, including `sonarcloud`, to turn green; resolve every conversation.
4. Squash or rebase merge. The branch is deleted afterwards.

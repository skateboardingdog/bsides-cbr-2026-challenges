I made an app
=============

You are given a clone of a git repo complete with the git backing datastore.

- From inspecting the git history using `git log`, you see that there's commits
labelled `Add access keys` and `delete access keys from repo`.
- By inspecting the repo using `git diff 7f7e5e60dc0de1d54c1f36d461aa46313e856e9e`, you're able to recover an SSH key. Perhaps this may give you access to the live repo.
- Run `git pull` to fetch the latest changes in the repo, although this is possibly not required.
- Run `git -c core.sshCommand="ssh -i keys/id_rsa" fetch origin refs/pull/3/head:pr-3` (rationale being that PR 3 is missing so we can try IDOR).
- Checkout pr-3, look at history. See commit `57888c19434dbf3de5d3f27780ee40c80e296be1` in history. Check out that commit.
- Find the secret hardcoded into `app.py`.

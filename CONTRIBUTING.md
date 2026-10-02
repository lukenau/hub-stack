# Contributing

Short version: sign your commits, keep other people's code and data out of
your pull request, and read [docs/CONTRIBUTING.md](docs/CONTRIBUTING.md) for
project layout, development setup, and verification steps.

## Sign your commits

Every commit in a pull request must carry a `Signed-off-by` line:

```bash
git commit -s
```

The sign-off is the [Developer Certificate of Origin
(DCO)](https://developercertificate.org/): your statement, per commit, that
you wrote the change or otherwise have the right to submit it under this
project's MIT license. Unsigned commits are rejected.

This project is strict about provenance because of what it is: a clean copy
whose own history had to be stripped of employer-owned code and personal
data before it could be published. A sign-off is the record that your
contribution is yours to give, and it protects you as much as the project.
If your employer might own anything you are about to submit, get permission
first.

## What must not be in a contribution

Do not submit, in code, docs, issues, or logs:

- employer-owned code, or anything you do not have the right to license;
- third-party confidential material;
- real personal data, yours or anyone else's;
- secrets: keys, tokens, PEM blocks, account ids, real contact details.

`.env` and `data/` are gitignored. Keep it that way, and redact before
pasting anything into an issue or pull request.

## The publish gate

`scripts/hub-stack-gate.sh` runs against changes and scans for committed
keys, tokens, PEM blocks, account ids, and personal contact data. Run it
before every push, including from your own fork. It is a scan, not a
substitute for the rules above.

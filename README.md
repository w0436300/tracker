# Claire Job Tracker

A static, password-gated job-search dashboard designed for GitHub Pages.

## Files

- `index.html` — app shell
- `styles.css` — responsive visual system
- `app.js` — filtering, search, status tabs, details drawer, login gate
- `config.js` — password hash + session settings
- `data/jobs.json` — the only file that needs regular job-data updates
- `set_password.py` — local helper to change the password hash
- `.nojekyll` — keeps GitHub Pages simple

## Set or change password

Run locally (do not commit the plaintext password):

```bash
python set_password.py
```

The script stores only a SHA-256 hash in `config.js`, not your plain-text password. Commit and push `config.js` after changing it.

## Publish to GitHub Pages

1. Create a GitHub repository.
2. Put these files in the repository root.
3. Commit and push to the `main` branch.
4. Open **Settings → Pages**.
5. Under **Build and deployment**, choose **Deploy from a branch**.
6. Select `main` and `/ (root)`.
7. Save.

GitHub will provide the Pages URL.

## Daily data update

The website reads `data/jobs.json`. Daily updates only need to replace that file and commit it.

Once the repository is published, share the GitHub repository URL with ChatGPT and connect GitHub if prompted. The existing Toronto UX/Product daily job workflow can then target this repository and update `data/jobs.json` instead of requiring a new website build each time.

## Security note

GitHub Pages is static hosting. The included login is an access gate for personal use, but it is **not server-side authentication**. The job data file is served by GitHub Pages and can technically be retrieved by someone who knows the file path.

For stronger privacy, put the site behind Cloudflare Access or another identity-aware proxy.

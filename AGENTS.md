# Repository Guidelines

## Project Structure & Module Organization

This repository is a static personal website. `index.html` defines the page shell and navigation, `stylesheet.css` contains all site styles, and `assets/js/site.js` loads and renders Markdown content into the page. Editable page data lives in `content/`: `home.md`, `experience.md`, `projects.md`, `publications.md`, and `others.md`. Images, profile GIFs, project media, and favicons live under `images/`.

Content cards use second-level headings plus key-value fields, for example:

```md
## Project Name
url: https://example.com
image: images/example.png
description: Short text shown on the homepage.
```

## Build, Test, and Development Commands

- `python3 -m http.server 8000`: serve the site locally at `http://localhost:8000`. Use a local server because `site.js` fetches files from `content/`.
- `node scripts/preview-homepage.mjs --queue --send`: enqueue a preview request for the local preview service. Use this after IM-requested page changes because it works from Codex sandboxed sessions without connecting to `localhost`.
- `node scripts/preview-homepage.mjs --request --send`: optional trusted-shell fallback that asks the local preview service over `127.0.0.1:9765`; do not use it as the default IM workflow because some Codex sandboxes block local socket connections.
- `node scripts/preview-homepage.mjs --send`: direct fallback for trusted, unsandboxed shells; starts a temporary static server, captures a screenshot with Playwright, and sends it through cc-connect.
- `scripts/publish-homepage.sh [commit message]`: host-side publish entrypoint for IM-approved releases. It runs checks, stages repository changes, commits with the provided message or `update`, and pushes the current branch.
- `pre-commit run --all-files`: run the configured whitespace, line-ending, YAML/JSON, merge-conflict, large-file, and codespell checks.
- `git status --short`: check pending changes before committing.

There is no npm, bundler, or generated build output in this repo. The preview script uses global server tooling and does not add project dependencies. After publishing, the public site is available at `https://zengyh1900.github.io/`.

## Coding Style & Naming Conventions

Use two-space indentation in HTML, CSS, and JavaScript. Keep JavaScript plain browser-compatible ES6 without introducing framework dependencies. Prefer descriptive CSS class names that match the existing style, such as `media-item`, `profile-links`, or `section-heading`.

For Markdown content, keep field names lowercase where already established (`url`, `image`, `role`, `description`, `links`, `items`). Reference local assets with relative paths such as `images/project.png`.

## Testing Guidelines

No automated test suite is currently present. Validate changes by running a local static server, opening the homepage, and checking the affected sections in the browser. For content updates, verify that each card has the fields expected by `assets/js/site.js` and that image paths resolve. Always run `node --check scripts/preview-homepage.mjs`, `git diff --check`, and `pre-commit run --all-files` before submitting changes.

## Security & Public Repo Notes

This is a public GitHub Pages repository. Only commit information intended for the public homepage: site content, images, CSS, HTML, and plain JavaScript. Keep cc-connect config, Feishu credentials, preview-service tokens, API keys, `.env*`, private keys, and local screenshots out of the repo. Runtime preview queue files live under the ignored `.cc-connect/` directory and must not be force-added. Store runtime secrets under `~/.cc-connect/` or environment variables such as `CC_CONNECT_BIN`; do not hard-code machine-specific absolute paths, app secrets, open IDs used for authorization, or access tokens in tracked files.

## Commit & Pull Request Guidelines

Recent commits use short, lowercase messages such as `refactor`, `update`, and `adjust style`. Keep commits concise and focused on one change. Pull requests should include a brief summary, note any content or visual changes, link relevant issues when applicable, and include screenshots for layout or styling updates.

## Agent-Specific Instructions

Keep edits small and repository-local. Do not add build tooling unless the task explicitly requires it. Avoid rewriting unrelated content files while making targeted updates. After IM-requested changes, run `node scripts/preview-homepage.mjs --queue --send` to ask the host-side preview service to render the page and send the screenshot for confirmation, then commit and push only after the user approves. In IM sessions, treat the user's `/publish-homepage [message]` command as the approval path for host-side commit and push. If the queue service is unavailable and the shell is unsandboxed, use `node scripts/preview-homepage.mjs --request --send` or `node scripts/preview-homepage.mjs --send` as the fallback.

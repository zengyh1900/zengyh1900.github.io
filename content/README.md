# Content Editing Guide

The homepage and CV are rendered from Markdown-like files in this folder. Treat `content/` as the source of truth; generated files under `cv/` should not be edited by hand.

- `home.md`: profile, CV biography summary, news, and mentees/student collaborators.
- `experience.md`: homepage experience logos plus CV experience roles and bullets.
- `projects.md`: homepage project cards only.
- `publications.md`: selected homepage publication cards plus CV bibliography metadata.
- `others.md`: additional bibliography metadata and non-homepage publication records.
- `skills.md`: CV technical skills.
- `education.md`: CV education entries.
- `services.md`: homepage miscellanea plus CV services and activities.

Each card starts with a second-level heading:

```md
## Card Title
url: https://example.com
image: images/example.png
role: Optional homepage role or label
description: Short text shown on the homepage.
```

For `experience.md`, homepage rendering uses only `url` and `image`. CV rendering reads `roles:` blocks:

```md
roles:
- Research Scientist & Engineer | Hangzhou, China | Apr. 2025 – present
  - **[Project](https://example.com) (Role).** CV bullet text.
```

For `publications.md` and `others.md`, `bibkey`, `type`, `bib-authors`, `booktitle` or `journal`, `year`, and optional `pages` fields generate `cv/main.bib`. Use `selected: false` for entries that should stay in the BibTeX file but be excluded from the CV bibliography.

For the `Mentees & Student Collaborators` section in `home.md`, add linked names under `items:`:

```md
## Mentees & Student Collaborators
items:
- [Student Name](https://example.com/)
```

Prefer a personal homepage for each person. If unavailable, use a public profile, project page, or paper page as the fallback link.

Supported inline Markdown:

- `[label](https://example.com)` for links.
- `**bold text**` for bold.
- `_italic text_` for italics.
- List fields use `- item` lines under a field such as `links:` or `items:`.

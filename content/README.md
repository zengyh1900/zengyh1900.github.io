# Content Editing Guide

The homepage is rendered from Markdown-like files in this folder.

- `home.md`: profile, news, mentees, and miscellanea.
- `experience.md`: working experience cards.
- `projects.md`: project cards. These render before publications.
- `publications.md`: selected publication cards.
- `others.md`: converted publications that are kept as structured content but not rendered on the homepage by default.

Each card starts with a second-level heading:

```md
## Card Title
url: https://example.com
image: images/example.png
role: Optional role or label
description: Short paragraph shown on the page.
```

For `experience.md`, only `url` and `image` are used. The homepage renders all experience entries as linked logos in one compact block.

For the `Mentees` section in `home.md`, add linked names under `items:`:

```md
## Mentees
items:
- [Student Name](https://example.com/)
```

Prefer a personal homepage for each mentee. If unavailable, use a public profile, project page, or paper page as the fallback link.

Supported inline Markdown:

- `[label](https://example.com)` for links.
- `**bold text**` for bold.
- `_italic text_` for italics.
- List fields use `- item` lines under a field such as `links:` or `items:`.

(function () {
  const sources = {
    home: 'content/home.md',
    experience: 'content/experience.md',
    projects: 'content/projects.md',
    publications: 'content/publications.md',
    services: 'content/services.md',
  };

  const app = document.getElementById('app');

  function escapeHtml(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function renderInline(value) {
    return escapeHtml(value)
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>')
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/(^|[\s(])_([^_\n]+)_($|[\s),.!?])/g, '$1<em>$2</em>$3');
  }

  function parseDocument(markdown) {
    const sections = [];
    let current = null;

    markdown.split(/\r?\n/).forEach((line) => {
      const heading = line.match(/^##\s+(.+?)\s*$/);
      if (heading) {
        current = { title: heading[1].trim(), body: [] };
        sections.push(current);
      } else if (current) {
        current.body.push(line);
      }
    });

    return sections.map(sectionToRecord);
  }

  function parseIntro(markdown) {
    const lines = markdown.split(/\r?\n/);
    const start = lines.findIndex((line) => /^#\s+/.test(line));
    if (start === -1) {
      return '';
    }

    const intro = [];
    for (let index = start + 1; index < lines.length; index += 1) {
      if (/^##\s+/.test(lines[index])) {
        break;
      }
      if (lines[index].trim()) {
        intro.push(lines[index].trim());
      }
    }

    return intro.join(' ');
  }

  function sectionToRecord(section) {
    const record = { title: section.title };
    let currentKey = null;

    section.body.forEach((line) => {
      const field = line.match(/^([A-Za-z][\w-]*):\s*(.*)$/);
      if (field) {
        currentKey = field[1];
        record[currentKey] = field[2] || '';
        return;
      }

      if (currentKey) {
        record[currentKey] += `${record[currentKey] ? '\n' : ''}${line}`;
      }
    });

    Object.keys(record).forEach((key) => {
      if (typeof record[key] === 'string') {
        record[key] = record[key].trim();
      }
    });

    return record;
  }

  function parseList(value) {
    return String(value || '')
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => line.replace(/^-\s*/, ''));
  }

  function parseMarkdownLink(link) {
    const match = String(link || '').match(/^\[([^\]]+)\]\(([^)]+)\)$/);
    return match ? { label: match[1].trim(), url: match[2].trim() } : null;
  }

  function isPdfLink(link) {
    const markdownLink = parseMarkdownLink(link);
    const label = markdownLink ? markdownLink.label : link;
    return String(label || '').trim().toLowerCase() === 'pdf';
  }

  function renderPublicationLink(link) {
    const markdownLink = parseMarkdownLink(link);
    if (markdownLink && isPdfLink(link)) {
      return `<a class="meta-link pdf-link" href="${escapeHtml(markdownLink.url)}" aria-label="PDF" title="PDF"></a>`;
    }

    return `<span class="meta-link">${renderInline(link)}</span>`;
  }

  function putPdfLinksFirst(links) {
    return [
      ...links.filter((link) => isPdfLink(link)),
      ...links.filter((link) => !isPdfLink(link)),
    ];
  }

  function byTitle(records, title) {
    return records.find((record) => record.title === title) || {};
  }

  async function loadMarkdown(path) {
    const response = await fetch(path, { cache: 'no-cache' });
    if (!response.ok) {
      throw new Error(`Could not load ${path}`);
    }
    return response.text();
  }

  function section(id, title, body) {
    return `
      <section id="${id}" class="section">
        <div class="section-heading"><h2>${title}</h2></div>
        ${body}
      </section>
    `;
  }

  function renderProfile(profile) {
    const links = parseList(profile.links)
      .map((link) => renderInline(link))
      .join('');

    return `
      <section id="about" class="section hero">
        <div>
          <h1 class="profile-name">${renderInline(profile.name)}</h1>
          ${profile.slogan ? `<blockquote class="profile-slogan">${renderInline(profile.slogan)}</blockquote>` : ''}
          <p>${renderInline(profile.bio)}</p>
          ${profile.notice ? `<div class="notice">${renderInline(profile.notice)}</div>` : ''}
          <div class="profile-links">${links}</div>
        </div>
        <a class="avatar-link" href="${escapeHtml(profile.avatar)}">
          <img class="avatar" src="${escapeHtml(profile.avatar)}" alt="profile photo">
        </a>
      </section>
    `;
  }

  function renderNews(news) {
    const items = parseList(news.items)
      .map((item) => `<li>${renderInline(item)}</li>`)
      .join('');

    return section('news', 'News', `<div class="panel news-panel"><ul>${items}</ul></div>`);
  }

  function renderExperience(records) {
    const items = records.map((item) => {
      const logo = item.image
        ? `<img src="${escapeHtml(item.image)}" alt="${escapeHtml(item.title)} logo">`
        : `<span class="experience-placeholder">${renderInline(item.title)}</span>`;

      return `
      <a class="experience-logo" href="${escapeHtml(item.url)}" aria-label="${escapeHtml(item.title)}">
          ${logo}
      </a>
    `;
    }).join('');

    return section('experience', 'Experience', `<div class="panel logo-grid">${items}</div>`);
  }

  function renderProjects(records) {
    const items = records.map((item) => {
      const badge = item.badge ? `<img class="badge" src="${escapeHtml(item.badge)}" alt="GitHub stars">` : '';
      const media = item.image
        ? `<img src="${escapeHtml(item.image)}" alt="${escapeHtml(item.title)}">`
        : `<span class="media-placeholder">${renderInline(item.title)}</span>`;

      return `
        <article class="panel media-item">
          <a class="media-frame" href="${escapeHtml(item.url)}">
            ${media}
          </a>
          <div class="media-body">
            <a class="item-title" href="${escapeHtml(item.url)}">${renderInline(item.title)}</a>
            ${badge ? `<div class="links">${badge}</div>` : ''}
            ${item.role ? `<div class="meta">${renderInline(item.role)}</div>` : ''}
            <p class="description">${renderInline(item.description)}</p>
          </div>
        </article>
      `;
    }).join('');

    return section('projects', 'Projects', `<div class="item-list">${items}</div>`);
  }

  function renderPublications(records, intro) {
    const items = records.map((item) => {
      const links = putPdfLinksFirst(parseList(item.links))
        .map((link) => renderPublicationLink(link))
        .join('');
      const badge = item.badge ? `<img class="badge" src="${escapeHtml(item.badge)}" alt="GitHub stars">` : '';

      return `
        <article class="panel media-item">
          <a class="media-frame" href="${escapeHtml(item.url)}">
            <img src="${escapeHtml(item.image)}" alt="${escapeHtml(item.title)}">
          </a>
          <div class="media-body">
            <a class="item-title" href="${escapeHtml(item.url)}">${renderInline(item.title)}</a>
            <div class="authors">${renderInline(item.authors)}</div>
            <div class="meta">${renderInline(item.venue)}</div>
            <div class="links">${links}${badge}</div>
            <p class="description">${renderInline(item.description)}</p>
          </div>
        </article>
      `;
    }).join('');

    const note = intro ? `<p class="section-note">${renderInline(intro)}</p>` : '';
    return section('publications', 'Selected Publications', `${note}<div class="item-list">${items}</div>`);
  }

  function renderMentees(mentees) {
    const items = parseList(mentees.items)
      .map((item) => `<span class="mentee-item">${renderInline(item)}</span>`)
      .join('');

    return section('mentees', 'Mentees & Student Collaborators', `<div class="panel mentees-panel">${items}</div>`);
  }

  function renderMisc(misc) {
    const items = parseList(misc.items)
      .map((item) => `<li>${renderInline(item)}</li>`)
      .join('');

    return section('misc', 'Miscellanea', `<div class="panel misc-panel"><ul>${items}</ul></div>`);
  }

  async function boot() {
    try {
      const [homeMarkdown, experienceMarkdown, projectMarkdown, publicationMarkdown, servicesMarkdown] = await Promise.all([
        loadMarkdown(sources.home),
        loadMarkdown(sources.experience),
        loadMarkdown(sources.projects),
        loadMarkdown(sources.publications),
        loadMarkdown(sources.services),
      ]);

      const home = parseDocument(homeMarkdown);
      const experience = parseDocument(experienceMarkdown);
      const projects = parseDocument(projectMarkdown);
      const publications = parseDocument(publicationMarkdown);
      const services = parseDocument(servicesMarkdown);

      app.innerHTML = [
        renderProfile(byTitle(home, 'Profile')),
        renderNews(byTitle(home, 'News')),
        renderProjects(projects),
        renderPublications(publications, parseIntro(publicationMarkdown)),
        renderExperience(experience),
        renderMentees(byTitle(home, 'Mentees & Student Collaborators')),
        renderMisc(byTitle(services, 'Miscellanea')),
      ].join('');
    } catch (error) {
      app.innerHTML = `
        <section class="error-state">
          Could not load page content. If you are previewing locally, run a local static server so the browser can fetch files from <code>content/</code>.
        </section>
      `;
      console.error(error);
    }
  }

  boot();
}());

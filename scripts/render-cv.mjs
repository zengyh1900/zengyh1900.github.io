import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const generatedHeader = '% AUTO-GENERATED, DO NOT EDIT.\n% Source: content/ and templates/cv/.\n\n';

function argValue(name, fallback) {
  const index = process.argv.indexOf(name);
  if (index === -1) {
    return fallback;
  }
  return process.argv[index + 1] || fallback;
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

function byTitle(records, title) {
  return records.find((record) => record.title === title) || {};
}

function parseList(value) {
  return String(value || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.replace(/^-\s*/, ''));
}

function parseMarkdownLink(value) {
  const match = value.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
  if (!match) {
    return null;
  }
  return { label: match[1], url: match[2] };
}

function escapeLatex(value) {
  return String(value || '').replace(/[\\&%$#_{}~^]/g, (char) => ({
    '\\': '\\textbackslash{}',
    '&': '\\&',
    '%': '\\%',
    '$': '\\$',
    '#': '\\#',
    '_': '\\_',
    '{': '\\{',
    '}': '\\}',
    '~': '\\textasciitilde{}',
    '^': '\\textasciicircum{}',
  }[char]));
}

function escapeUrl(value) {
  return String(value || '').replace(/[\\{}%#&]/g, (char) => `\\${char}`);
}

function markdownToLatex(value) {
  const placeholders = [];

  function stash(rendered) {
    const token = `@@LATEX${placeholders.length}@@`;
    placeholders.push([token, rendered]);
    return token;
  }

  function render(input) {
    let output = String(input || '');

    output = output.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, label, url) => (
      stash(`\\href{${escapeUrl(url)}}{${render(label)}}`)
    ));

    output = output.replace(/\*\*([\s\S]+?)\*\*/g, (_, text) => (
      stash(`\\textbf{${render(text)}}`)
    ));

    output = output.replace(/(^|[\s(])_([^_\n]+)_($|[\s),.!?])/g, (_, before, text, after) => (
      `${before}${stash(`\\textit{${render(text)}}`)}${after}`
    ));

    output = escapeLatex(output);
    placeholders.forEach(([token, rendered]) => {
      output = output.replaceAll(token, rendered);
    });

    return output;
  }

  return render(value);
}

function parseRoles(value) {
  const roles = [];
  let current = null;

  String(value || '').split(/\r?\n/).forEach((line) => {
    const role = line.match(/^-\s*(.+?)\s*\|\s*(.+?)\s*\|\s*(.+?)\s*$/);
    if (role) {
      current = {
        position: role[1].trim(),
        location: role[2].trim(),
        dates: role[3].trim(),
        items: [],
      };
      roles.push(current);
      return;
    }

    const item = line.match(/^\s+-\s+(.+?)\s*$/);
    if (item && current) {
      current.items.push(item[1].trim());
    }
  });

  return roles;
}

async function readContent(name) {
  const text = await fs.readFile(path.join(repoRoot, 'content', name), 'utf8');
  return parseDocument(text);
}

async function readTemplate(name) {
  return fs.readFile(path.join(repoRoot, 'templates', 'cv', name), 'utf8');
}

function englishName(name) {
  return String(name || '').split(/\s+/).slice(0, 2).join(' ');
}

function renderHeader(profile) {
  const links = Object.fromEntries(parseList(profile.links)
    .map(parseMarkdownLink)
    .filter(Boolean)
    .map((link) => [link.label.toLowerCase(), link.url]));

  const email = (links.email || '').replace(/^mailto:/, '');
  const homepage = profile.homepage || 'https://zengyh1900.github.io/';
  const github = links.github || links.gitHub || 'https://github.com/zengyh1900';
  const scholar = links['google scholar'] || '';

  const contactItems = [
    email && `\\mbox{\\hrefWithoutArrow{mailto:${escapeUrl(email)}}{\\faEnvelope[regular] ${escapeLatex(email)}}}%`,
    homepage && `\\mbox{\\hrefWithoutArrow{${escapeUrl(homepage)}}{\\faHouseUser[regular] ${escapeLatex(homepage.replace(/^https?:\/\//, '').replace(/\/$/, ''))}}}%`,
    github && `\\mbox{\\hrefWithoutArrow{${escapeUrl(github)}}{\\faGithub[regular] ${escapeLatex(github.replace(/^https?:\/\/github\.com\//, '').replace(/\/$/, ''))}}}%`,
    scholar && `\\mbox{\\hrefWithoutArrow{${escapeUrl(scholar)}}{\\faGraduationCap[regular] ${escapeLatex(englishName(profile.name))}}}%`,
  ].filter(Boolean);

  return `\\begin{header}
\\fontsize{25 pt}{25 pt}\\selectfont ${escapeLatex(englishName(profile.name))}

\\vspace{5 pt}
\\normalsize

${contactItems.map((item, index) => `${index ? '\\kern 5.0 pt%\n\\AND%\n\\kern 5.0 pt%\n' : ''}${item}`).join('\n')}

\\end{header}

\\vspace{5 pt}
`;
}

function renderBiography(profile) {
  return `\\section{Biography}

\\begin{onecolentry}
${markdownToLatex(profile.summary || profile.bio)}
\\end{onecolentry}
`;
}

function renderItemList(items, environment = 'highlights') {
  if (!items.length) {
    return '';
  }

  return `\\begin{${environment}}
${items.map((item) => `    \\item ${markdownToLatex(item)}`).join('\n')}
\\end{${environment}}`;
}

function renderSkills(skills) {
  const items = parseList(byTitle(skills, 'Skills').items);
  return `\\section{Technical Skills}

\\begin{onecolentry}
${renderItemList(items)}
\\end{onecolentry}
`;
}

function renderEducation(education) {
  const entries = education.map((item, index) => {
    const highlights = renderItemList(parseList(item.items));
    const spacing = index === education.length - 1 ? '' : '\n\\vspace{0.20 cm}\n';

    return `\\begin{twocolentry}{
    ${markdownToLatex(item.dates)}
}
    \\textbf{${markdownToLatex(item.title)}}, ${markdownToLatex(item.degree)}
\\end{twocolentry}

\\vspace{0.10 cm}
\\begin{onecolentry}
${highlights}
\\end{onecolentry}
${spacing}`;
  }).join('\n');

  return `\\section{Education}

${entries}`;
}

function renderExperience(experience) {
  const entries = [];

  experience.forEach((organization) => {
    parseRoles(organization.roles).forEach((role) => {
      const org = organization.url
        ? `\\href{${escapeUrl(organization.url)}}{${markdownToLatex(organization.title)}}`
        : markdownToLatex(organization.title);

      entries.push(`\\begin{twocolentry}{
    ${markdownToLatex(role.dates)}
}
    \\textbf{${markdownToLatex(role.position)}}, ${org} -- ${markdownToLatex(role.location)}
\\end{twocolentry}

\\vspace{0.10 cm}
\\begin{onecolentry}
${renderItemList(role.items)}
\\end{onecolentry}`);
    });
  });

  return `\\section{Experience}

${entries.join('\n\n\\vspace{0.20 cm}\n\n')}`;
}

function renderServices(services) {
  const sections = services.filter((section) => section.title !== 'Miscellanea');
  const rendered = sections.map((section, index) => {
    const spacing = index === sections.length - 1 ? '' : '\n\n\\vspace{0.2 cm}\n';
    return `\\begin{onecolentry}
\\textbf{${markdownToLatex(section.title)}}
\\begin{itemize}
${parseList(section.items).map((item) => `    \\item ${markdownToLatex(item)}`).join('\n')}
\\end{itemize}
\\end{onecolentry}${spacing}`;
  }).join('\n');

  return `\\section{Services and Activities}

${rendered}`;
}

function renderBibField(key, value) {
  if (!value) {
    return null;
  }
  return `  ${key}={${value}}`;
}

function renderBibEntry(record) {
  if (!record.bibkey) {
    return '';
  }

  const fields = [
    renderBibField('title', record['bib-title'] || record.title),
    renderBibField('author', record['bib-authors']),
    renderBibField('booktitle', record.booktitle),
    renderBibField('journal', record.journal),
    renderBibField('year', record.year),
    renderBibField('volume', record.volume),
    renderBibField('number', record.number),
    renderBibField('pages', record.pages),
    String(record.selected).toLowerCase() === 'false' ? renderBibField('keywords', 'excluded') : null,
  ].filter(Boolean);

  return `@${record.type || 'inproceedings'}{${record.bibkey},
${fields.join(',\n')}
}`;
}

function renderBibliography(publications, others) {
  const records = [...publications, ...others].filter((record) => record.bibkey);
  return `${generatedHeader}${records.map(renderBibEntry).filter(Boolean).join('\n\n')}\n`;
}

async function writeFile(filePath, contents) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, contents, 'utf8');
}

async function main() {
  const outDir = path.resolve(repoRoot, argValue('--out', 'cv'));
  const forbidden = new Set([
    repoRoot,
    path.join(repoRoot, 'content'),
    path.join(repoRoot, 'templates'),
    path.join(repoRoot, 'scripts'),
  ].map((item) => path.resolve(item)));

  if (forbidden.has(outDir)) {
    throw new Error(`Refusing to render CV into ${outDir}`);
  }

  const [home, experience, publications, others, skills, education, services] = await Promise.all([
    readContent('home.md'),
    readContent('experience.md'),
    readContent('publications.md'),
    readContent('others.md'),
    readContent('skills.md'),
    readContent('education.md'),
    readContent('services.md'),
  ]);

  const profile = byTitle(home, 'Profile');

  await fs.rm(outDir, { recursive: true, force: true });
  await fs.mkdir(path.join(outDir, 'section'), { recursive: true });

  await writeFile(path.join(outDir, 'main.tex'), `${generatedHeader}${await readTemplate('main.tex')}`);
  await writeFile(path.join(outDir, 'predefine.tex'), `${generatedHeader}${await readTemplate('predefine.tex')}`);
  await writeFile(path.join(outDir, 'main.bib'), renderBibliography(publications, others));
  await writeFile(path.join(outDir, 'section', '00-header.tex'), `${generatedHeader}${renderHeader(profile)}`);
  await writeFile(path.join(outDir, 'section', '01-bio.tex'), `${generatedHeader}${renderBiography(profile)}`);
  await writeFile(path.join(outDir, 'section', '02-skills.tex'), `${generatedHeader}${renderSkills(skills)}`);
  await writeFile(path.join(outDir, 'section', '03-education.tex'), `${generatedHeader}${renderEducation(education)}`);
  await writeFile(path.join(outDir, 'section', '04-experience.tex'), `${generatedHeader}${renderExperience(experience)}`);
  await writeFile(path.join(outDir, 'section', '05-academic.tex'), `${generatedHeader}${renderServices(services)}`);

  console.log(`Rendered CV project to ${path.relative(repoRoot, outDir) || outDir}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

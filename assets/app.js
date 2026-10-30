/* =====================================================
   Content loading → render → interactions.
   Content shape: see content.json. Config: see config.js.
===================================================== */
(() => {
const CFG = Object.assign({
  provider: 'json',
  url: '',
  timeoutMs: 4000,
  fallbackUrl: '/content.json'
}, window.SITE_CONFIG || {});

/* ---------- fetching ---------- */
async function fetchJSON(u, { timeout = CFG.timeoutMs, fresh = false } = {}){
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeout);
  try {
    const r = await fetch(u, { signal: ctrl.signal, cache: fresh ? 'no-cache' : 'default' });
    if (!r.ok) throw new Error(`${r.status} ${u}`);
    return await r.json();
  } finally { clearTimeout(t); }
}
const safe = (p) => p.catch(() => null);

/* ---------- source adapters: each returns the content.json shape ---------- */
const ADAPTERS = {
  json: (base) => fetchJSON(base, { fresh: true }),

  async directus(base){
    const get = (c) => safe(fetchJSON(`${base}/items/${c}`)).then(r => r?.data);
    const [profile, sections, projects, experiences, skills, socials, education] = await Promise.all([
      get('profile'), get('sections'), get('projects?sort=sort'), get('experiences?sort=sort'),
      get('skills?sort=sort'), get('socials?sort=sort'), get('education?sort=sort')
    ]);
    return { profile, sections, projects, experiences, skills, socials, education };
  },

  async strapi(base){
    const un = (rec) => rec && rec.attributes ? { id: rec.id, ...rec.attributes } : rec; // v4 → flat, v5 passthrough
    const q = 'sort=sort&pagination[pageSize]=50';
    const get = (c) => safe(fetchJSON(`${base}/api/${c}`)).then(r => r?.data);
    const [profile, sections, projects, experiences, skills, socials, education] = await Promise.all([
      get('profile'), get('section'), get(`projects?${q}`), get(`experiences?${q}`),
      get(`skill-groups?${q}`), get(`socials?${q}`), get(`educations?${q}`)
    ]);
    const list = (v) => Array.isArray(v) ? v.map(un) : v;
    return { profile: un(profile), sections: un(sections), projects: list(projects),
             experiences: list(experiences), skills: list(skills), socials: list(socials), education: list(education) };
  }
};

const isEmpty = (v) => v == null || (Array.isArray(v) && !v.length) ||
                       (typeof v === 'object' && !Array.isArray(v) && !Object.keys(v).length);

async function getData(){
  const bundled = safe(fetchJSON(CFG.fallbackUrl, { fresh: true }));
  let live = null;
  const adapter = ADAPTERS[CFG.provider];
  if (adapter && CFG.url) {
    try { live = await adapter(CFG.url.replace(/\/$/, '')); }
    catch (e) { console.warn('Live content unavailable, using bundled content.', e); }
  }
  const base = await bundled;
  if (!live && !base) return { data: null, source: 'static page' };
  if (!live) return { data: base, source: 'bundled data' };

  // any section missing from the live source falls back to the bundled copy
  const data = { ...live };
  if (base) for (const k of Object.keys(base)) if (isEmpty(data[k])) data[k] = base[k];
  let host = CFG.provider;
  try { host = new URL(CFG.url).hostname.replace(/^raw\.githubusercontent\.com$/, 'github'); } catch {}
  return { data, source: host };
}

/* ---------- helpers ---------- */
const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const asList = (v) => {
  if (Array.isArray(v)) return v;
  if (typeof v === 'string') { try { return JSON.parse(v || '[]'); } catch { return v.split(',').map(s => s.trim()).filter(Boolean); } }
  return [];
};
// tiny, safe inline markup: escape first, then **bold** and _italic_
const inline = (s) => esc(s).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/(^|\W)_(.+?)_(?=\W|$)/g, '$1<em>$2</em>');
const safeUrl = (u) => /^(https?:|mailto:|\/|#)/i.test(String(u || '').trim()) ? String(u).trim() : '';
const setText = (sel, v) => { const el = $(sel); if (el && v != null && v !== '') el.textContent = v; };

const squiggle = `<svg viewBox="0 0 200 24" preserveAspectRatio="none" aria-hidden="true"><path class="draw d3" pathLength="1" d="M3 16 C 30 6, 55 22, 85 13 S 150 5, 197 14"/></svg>`;
const arrow = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" aria-hidden="true"><path d="M7 17L17 7M9 7h8v8"/></svg>`;

/* ---------- render ---------- */
function render(data){
  const p = data.profile || {};

  if (p.name) document.title = `${p.name} — ${p.role || ''}`.replace(/ — $/, '');
  setText('#brand-name', p.brand || (p.name || '').split(' ')[0].toLowerCase());
  setText('#hero-eyebrow', p.eyebrow);
  if (p.headline_pre != null || p.headline_highlight) {
    $('#hero-headline').innerHTML = `${esc(p.headline_pre)}<span class="squig">${esc(p.headline_highlight)}${squiggle}</span>.`;
  }
  // bio: plain text with **bold**; legacy bio_html is still accepted
  if (p.bio) $('#hero-bio').innerHTML = inline(p.bio);
  else if (p.bio_html) $('#hero-bio').innerHTML = p.bio_html;

  // resume opens in a new tab (viewable, not force-downloaded)
  const rb = $('#resume-btn');
  const resume = safeUrl(p.resume_url);
  if (resume && resume !== '#') { rb.href = resume; rb.hidden = false; }
  else rb.hidden = true;

  setText('#contact-sub', p.contact_blurb);
  if (p.email) { const eb = $('#email-btn'); eb.href = `mailto:${p.email}`; eb.textContent = p.email; }
  setText('#footer-left', `© ${new Date().getFullYear()} ${p.name || ''}`.trim());

  const stats = asList(p.stats);
  if (stats.length) $('#stats').innerHTML = stats.map(s =>
    `<div class="stat"><div class="num">${esc(s.value)}</div><div class="lab">${esc(s.label)}</div></div>`).join('');

  // section headings
  const S = data.sections || {};
  for (const id of ['projects', 'experience', 'skills', 'contact']) {
    const s = S[id]; if (!s) continue;
    setText(`#${id} .eyebrow`, s.eyebrow);
    setText(`#${id} h2`, s.title);
    if (id !== 'contact') setText(`#${id} .section-sub`, s.sub);
  }

  $('#proj-grid').innerHTML = asList(data.projects).map(pr => {
    const play = safeUrl(pr.play_url), gh = safeUrl(pr.github_url), web = safeUrl(pr.url);
    return `
    <article class="proj reveal${pr.featured ? ' featured' : ''}">
      <div class="proj-head"><h3>${esc(pr.title)}</h3>${pr.metric ? `<span class="proj-metric">${esc(pr.metric)}</span>` : ''}</div>
      <p>${esc(pr.description)}</p>
      <div class="tags">${asList(pr.tags).map(t => `<span class="tag">${esc(t)}</span>`).join('')}</div>
      ${play || gh || web ? `<div class="proj-links">
        ${play ? `<a href="${esc(play)}" target="_blank" rel="noopener">Play Store ${arrow}</a>` : ''}
        ${gh   ? `<a href="${esc(gh)}" target="_blank" rel="noopener">GitHub ${arrow}</a>` : ''}
        ${web  ? `<a href="${esc(web)}" target="_blank" rel="noopener">Website ${arrow}</a>` : ''}
      </div>` : ''}
    </article>`;
  }).join('');

  $('#xp-list').innerHTML = asList(data.experiences).map(x => `
    <div class="xp-item reveal">
      <div class="xp-when">${esc(x.period)}</div>
      <h3>${esc(x.role)} <span class="at">${esc(x.company)}</span></h3>
      ${x.summary ? `<p>${esc(x.summary)}</p>` : ''}
      <ul class="xp-points">${asList(x.points).map(pt => `<li>${esc(pt)}</li>`).join('')}</ul>
    </div>`).join('');

  $('#edu-list').innerHTML = asList(data.education).map(e => `
    <div class="edu-item reveal">
      <div class="xp-when">${esc(e.period)}</div>
      <h4>${esc(e.degree)}</h4>
      <span>${esc(e.school)}${e.detail ? ' · ' + esc(e.detail) : ''}</span>
    </div>`).join('');

  $('#skill-grid').innerHTML = asList(data.skills).map(g => `
    <div class="skill-card reveal">
      <h3>${esc(g.group)}</h3>
      <div class="tags">${asList(g.items).map(i => `<span class="tag">${esc(i)}</span>`).join('')}</div>
    </div>`).join('');

  $('#socials').innerHTML = asList(data.socials).filter(s => safeUrl(s.url)).map(s =>
    `<a href="${esc(safeUrl(s.url))}" target="_blank" rel="noopener">${esc(s.label)}</a>`).join('');
}

/* ---------- signature: nav-graph rail ---------- */
const SECTIONS = [
  { id: 'home',       label: 'HomeScreen()' },
  { id: 'projects',   label: 'ProjectsScreen()' },
  { id: 'experience', label: 'ExperienceScreen()' },
  { id: 'skills',     label: 'SkillsScreen()' },
  { id: 'contact',    label: 'ContactScreen()' }
];

function initRail(){
  const svg = $('#railSvg'); if (!svg) return;
  const H = 620, top = 40, bottom = H - 40;
  const step = (bottom - top) / (SECTIONS.length - 1);
  const pts = SECTIONS.map((s, i) => ({ ...s, x: i % 2 === 0 ? 26 : 54, y: top + step * i }));

  let d = `M ${pts[0].x} ${pts[0].y}`;
  for (let i = 1; i < pts.length; i++){
    const a = pts[i-1], b = pts[i], my = (a.y + b.y) / 2;
    d += ` C ${a.x} ${my}, ${b.x} ${my}, ${b.x} ${b.y}`;
  }
  $('#railTrack').setAttribute('d', d);
  const ink = $('#railInk'); ink.setAttribute('d', d);
  const L = ink.getTotalLength();
  ink.style.strokeDasharray = L;
  ink.style.strokeDashoffset = L;

  const nodesG = $('#railNodes');
  const label = $('#railLabel');
  pts.forEach((pt, i) => {
    const g = document.createElementNS('http://www.w3.org/2000/svg','g');
    g.setAttribute('class','rail-node'); g.dataset.index = i;
    g.innerHTML = `<circle class="pulse" cx="${pt.x}" cy="${pt.y}" r="7"/>
                   <circle class="core" cx="${pt.x}" cy="${pt.y}" r="6.5"/>
                   <circle cx="${pt.x}" cy="${pt.y}" r="16" fill="transparent"/>`;
    g.addEventListener('click', () => document.getElementById(pt.id)?.scrollIntoView({ behavior:'smooth' }));
    g.addEventListener('mouseenter', () => {
      const r = g.getBoundingClientRect();
      label.textContent = pt.label;
      label.style.top = (r.top + r.height/2) + 'px';
      label.classList.add('show');
    });
    g.addEventListener('mouseleave', () => label.classList.remove('show'));
    nodesG.appendChild(g);
  });

  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let ticking = false;
  function update(){
    ticking = false;
    const max = document.documentElement.scrollHeight - innerHeight;
    const prog = max > 0 ? Math.min(1, scrollY / max) : 1;
    ink.style.strokeDashoffset = reduce ? 0 : L * (1 - prog);
    $('#progress').style.width = (prog * 100) + '%';
    nodesG.querySelectorAll('.rail-node').forEach((g, i) =>
      g.classList.toggle('passed', prog >= i / (SECTIONS.length - 1) - 0.02));
  }
  addEventListener('scroll', () => { if (!ticking){ ticking = true; requestAnimationFrame(update); } }, { passive:true });
  addEventListener('resize', update);
  update();
}

/* ---------- active section + nav highlight ---------- */
function initActive(){
  const links = [...document.querySelectorAll('#navlinks a')];
  const obs = new IntersectionObserver((entries) => {
    entries.forEach(e => {
      if (!e.isIntersecting) return;
      const idx = SECTIONS.findIndex(s => s.id === e.target.id);
      document.querySelectorAll('.rail-node').forEach((g, i) => g.classList.toggle('active', i === idx));
      links.forEach(a => a.classList.toggle('active', a.getAttribute('href') === '#' + e.target.id));
    });
  }, { rootMargin: '-40% 0px -55% 0px' });
  SECTIONS.forEach(s => { const el = document.getElementById(s.id); if (el) obs.observe(el); });
}

/* ---------- reveal on scroll ---------- */
function initReveal(){
  const obs = new IntersectionObserver((es) => es.forEach(e => {
    if (e.isIntersecting){ e.target.classList.add('in'); obs.unobserve(e.target); }
  }), { threshold: 0.12 });
  document.querySelectorAll('.reveal').forEach(el => obs.observe(el));
}

/* ---------- mobile menu ---------- */
function initMenu(){
  const m = $('#mobileMenu');
  $('#menuBtn').addEventListener('click', () => m.classList.add('open'));
  $('#menuClose').addEventListener('click', () => m.classList.remove('open'));
  m.querySelectorAll('a').forEach(a => a.addEventListener('click', () => m.classList.remove('open')));
}

/* ---------- boot ---------- */
(async () => {
  initMenu();
  const { data, source } = await getData();
  if (data) {
    try { render(data); } catch (e) { console.error('Render failed; showing static page.', e); }
  }
  $('#cms-tag').textContent = source;
  document.documentElement.classList.add('content-ready');
  initRail();
  initActive();
  initReveal();
})();
})();

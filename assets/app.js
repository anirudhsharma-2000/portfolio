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
const ext = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 17L17 7M9 7h8v8"/></svg>`;
const STAR = `<svg class="star" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.6l2.82 5.98 6.52.8-4.8 4.48 1.24 6.46L12 17.1l-5.78 3.22 1.24-6.46-4.8-4.48 6.52-.8z"/></svg>`;
const initials = (t) => String(t || '?').split(/[\s-]+/)
  .filter(w => /^[A-Za-z0-9]/.test(w) && !/^(by|of|the|and|for|a)$/i.test(w))
  .slice(0, 2).map(w => w[0]).join('').toUpperCase();
const statVal = (s) => {
  let v = String(s.value ?? ''), rating = !!s.rating;
  if (/★\s*$/.test(v)) { v = v.replace(/\s*★\s*$/, ''); rating = true; }
  return { v, rating };
};

/* ---------- render ---------- */
let FEED = [];
function render(data){
  const p = data.profile || {};

  if (p.name) document.title = `${p.name} — ${p.role || ''}`.replace(/ — $/, '');
  setText('#brand-name', p.brand || (p.name || '').split(' ')[0].toLowerCase());
  setText('#hero-eyebrow', p.status || p.eyebrow);
  const headline = p.headline || `${p.headline_pre || ''}${p.headline_highlight || ''}`.trim();
  if (headline) setText('#hero-headline', /[.!?]$/.test(headline) ? headline : headline + '.');
  if (p.bio) $('#hero-bio').innerHTML = inline(p.bio);
  else if (p.bio_html) $('#hero-bio').innerHTML = p.bio_html;

  const rb = $('#resume-btn');
  const resume = safeUrl(p.resume_url);
  if (resume && resume !== '#') { rb.href = resume; rb.hidden = false; } else rb.hidden = true;

  const stats = asList(p.stats);
  $('#stats').innerHTML = stats.map(s => `<div><dt>${esc(s.label)}</dt><dd>${esc(s.value)}</dd></div>`).join('');

  // section headings (eyebrows are no longer shown; the rail carries section names)
  const S = data.sections || {};
  const sec = (id, key) => {
    const s = S[key]; if (!s) return;
    setText(`#${id} .section-head h2, #${id} > h2`, s.title);
    const sub = document.querySelector(`#${id} .section-sub`);
    if (sub && s.sub != null) sub.textContent = s.sub;
  };
  sec('work', 'projects'); sec('experience', 'experience'); sec('skills', 'skills'); sec('contact', 'contact');

  setText('#contact-sub', p.contact_blurb);
  if (p.email) { const eb = $('#email-btn'); eb.href = `mailto:${p.email}`; eb.textContent = p.email; }
  setText('#footer-left', `© ${new Date().getFullYear()} ${p.name || ''}`.trim());

  /* ----- work: showcase rows ----- */
  let mediaIdx = 0;
  $('#work-list').innerHTML = asList(data.projects).map((pr, pi) => {
    const play = safeUrl(pr.play_url), gh = safeUrl(pr.github_url), web = safeUrl(pr.url);
    const icon = safeUrl(pr.icon);
    const shots = asList(pr.screenshots).map(safeUrl).filter(Boolean).slice(0, 6);
    const tv = pr.screenshot_orientation === 'landscape';
    const flip = shots.length ? (mediaIdx++ % 2 === 1) : false;
    const cls = ['work', shots.length ? 'has-media' : 'no-media', flip && 'flip', tv && 'tv'].filter(Boolean).join(' ');
    const where = pr.badge || pr.metric || '';
    const pstats = asList(pr.stats);
    return `
    <article class="${cls}" aria-labelledby="w-${pi}">
      ${shots.length ? `
      <div class="work-media">
        <div class="frame ${tv ? 'frame-tv' : 'frame-phone'}">
          <div class="frame-screen">${shots.map((u, i) =>
            `<img src="${esc(u)}" alt="${esc(pr.title)} screen ${i + 1} of ${shots.length}" ${i ? 'loading="lazy"' : ''} referrerpolicy="no-referrer"${i === 0 ? ' class="on"' : ''}>`).join('')}</div>
        </div>
        ${shots.length > 1 ? `<div class="shot-dots" role="group" aria-label="${esc(pr.title)} screenshots">${shots.map((_, i) =>
          `<button class="dot-btn${i === 0 ? ' on' : ''}" type="button" data-i="${i}" aria-label="Show screen ${i + 1} of ${shots.length}"${i === 0 ? ' aria-current="true"' : ''}></button>`).join('')}</div>` : ''}
      </div>` : ''}
      <div class="work-text">
        <div class="work-head">
          ${icon ? `<img class="app-icon" src="${esc(icon)}" alt="" width="58" height="58" referrerpolicy="no-referrer" data-mono="${esc(initials(pr.title))}">`
                 : `<span class="app-icon mono" aria-hidden="true">${esc(initials(pr.title))}</span>`}
          <div><h3 id="w-${pi}">${esc(pr.title)}</h3>${where ? `<p class="work-where">${esc(where)}</p>` : ''}</div>
        </div>
        <p class="work-desc">${esc(pr.description)}</p>
        ${pstats.length ? `<dl class="work-stats">${pstats.map(s => { const { v, rating } = statVal(s);
          return `<div><dt>${esc(s.label)}</dt><dd>${esc(v)}${rating ? STAR + '<span class="sr-only"> stars</span>' : ''}</dd></div>`; }).join('')}</dl>` : ''}
        ${asList(pr.tags).length ? `<ul class="work-tags" aria-label="Built with">${asList(pr.tags).map(t => `<li>${esc(t)}</li>`).join('')}</ul>` : ''}
        ${play || gh || web ? `<p class="work-links">
          ${play ? `<a href="${esc(play)}" target="_blank" rel="noopener">Google Play ${ext}</a>` : ''}
          ${gh   ? `<a href="${esc(gh)}" target="_blank" rel="noopener">GitHub ${ext}</a>` : ''}
          ${web  ? `<a href="${esc(web)}" target="_blank" rel="noopener">${esc(pr.url_label || 'Website')} ${ext}</a>` : ''}
        </p>` : ''}
      </div>
    </article>`;
  }).join('');
  wireWork();

  /* ----- experience ----- */
  const SHOW = 3;
  $('#xp-list').innerHTML = asList(data.experiences).map((x, xi) => {
    const pts = asList(x.points), extra = Math.max(0, pts.length - SHOW);
    return `
    <li class="job">
      <div class="job-meta"><p class="job-when">${esc(x.period)}</p><p class="job-co">${esc(x.company)}</p></div>
      <div class="job-body">
        <h3>${esc(x.role)}</h3>
        ${x.summary ? `<p class="job-sum">${esc(x.summary)}</p>` : ''}
        <ul class="job-points" id="job-pts-${xi}">${pts.map((pt, i) => `<li${i >= SHOW ? ' class="extra"' : ''}>${esc(pt)}</li>`).join('')}</ul>
        ${extra ? `<button class="more-btn" type="button" aria-expanded="false" aria-controls="job-pts-${xi}" data-more="Show ${extra} more">Show ${extra} more</button>` : ''}
      </div>
    </li>`;
  }).join('');
  $('#xp-list').onclick = (e) => {
    const b = e.target.closest('.more-btn'); if (!b) return;
    const open = b.closest('.job').classList.toggle('open');
    b.setAttribute('aria-expanded', open);
    b.textContent = open ? 'Show less' : b.dataset.more;
  };

  $('#edu-list').innerHTML = asList(data.education).map(e => `
    <li><span class="edu-when">${esc(e.period)}</span>
      <span><span class="edu-deg">${esc(e.degree)}</span><br><span class="edu-school">${esc(e.school)}${e.detail ? `, ${esc(e.detail)}` : ''}</span></span></li>`).join('');

  /* ----- toolkit ----- */
  const core = asList(data.core_skills);
  const hot = new Set(core.map(c => String(c).toLowerCase()));
  $('#core-skills').innerHTML = core.length
    ? `<span class="core-lab">Most used</span>${core.map(c => `<span class="core-chip">${esc(c)}</span>`).join('')}` : '';
  $('#skill-grid').innerHTML = asList(data.skills).map(g => `
    <div><dt>${esc(g.group.charAt(0).toUpperCase() + g.group.slice(1))}</dt>
      <dd>${asList(g.items).map(i => hot.has(String(i).toLowerCase()) ? `<span class="hot">${esc(i)}</span>` : esc(i)).join(', ')}</dd></div>`).join('');

  /* ----- socials ----- */
  const socials = asList(data.socials).filter(s => safeUrl(s.url));
  $('#socials').innerHTML = socials.map(s => {
    const label = String(s.label || '');
    const nice = { github: 'GitHub', linkedin: 'LinkedIn' }[label.toLowerCase()] || label;
    return `<a href="${esc(safeUrl(s.url))}" target="_blank" rel="noopener">${esc(nice)}</a>`;
  }).join('') + (resume && resume !== '#' ? `<a href="${esc(resume)}" target="_blank" rel="noopener">Resume (PDF)</a>` : '');

  FEED = asList(p.live_feed).filter(e => e && e.text);
}

/* ---------- work rows: screenshot switcher, image fallbacks ---------- */
function wireWork(){
  const list = $('#work-list');
  // show screen i in a media block (wraps around); preloads the next one
  const show = (media, i) => {
    const imgs = media.querySelectorAll('.frame-screen img'), n = imgs.length; if (!n) return;
    i = ((i % n) + n) % n;
    imgs.forEach((img, k) => img.classList.toggle('on', k === i));
    media.querySelectorAll('.dot-btn').forEach((d, k) => { d.classList.toggle('on', k === i); d.toggleAttribute('aria-current', k === i); });
    imgs[i].removeAttribute('loading'); imgs[(i + 1) % n].removeAttribute('loading');
    media.dataset.cur = i;
  };
  const ROTATE_MS = 3400, AFTER_CLICK_MS = 9000;
  list.onclick = (e) => {
    const b = e.target.closest('.dot-btn'); if (!b) return;
    const media = b.closest('.work-media');
    show(media, +b.dataset.i);
    media._next = Date.now() + AFTER_CLICK_MS;   // let the visitor look before moving on
  };

  // auto-advance screenshots while a project is on screen
  if (!matchMedia('(prefers-reduced-motion: reduce)').matches) {
    const medias = [...list.querySelectorAll('.work-media')];
    const seen = new Set();
    const io = new IntersectionObserver(es => es.forEach(e => {
      if (e.isIntersecting) { seen.add(e.target); e.target._next = Math.max(e.target._next || 0, Date.now() + 1800); }
      else seen.delete(e.target);
    }), { threshold: 0.35 });
    medias.forEach((m, k) => {
      m.dataset.cur = 0; m._next = Date.now() + ROTATE_MS + k * 600;   // stagger rows
      const hold = (on) => () => { m._hold = on; if (!on) m._next = Math.max(m._next || 0, Date.now() + ROTATE_MS); };
      m.addEventListener('mouseenter', hold(true)); m.addEventListener('mouseleave', hold(false));
      m.addEventListener('focusin', hold(true));    m.addEventListener('focusout', hold(false));
      io.observe(m);
    });
    setInterval(() => {
      if (document.hidden) return;
      const now = Date.now();
      seen.forEach(m => {
        if (!m.isConnected || m._hold || now < m._next) return;
        if (m.querySelectorAll('.frame-screen img').length < 2) return;
        show(m, +m.dataset.cur + 1);
        m._next = now + ROTATE_MS;
      });
    }, 300);
  }

  const dropShot = (img) => {
    const media = img.closest('.work-media'); if (!media) return;
    const imgs = [...media.querySelectorAll('.frame-screen img')];
    const k = imgs.indexOf(img);
    const dots = media.querySelectorAll('.dot-btn');
    const wasOn = img.classList.contains('on');
    img.remove(); dots[k]?.remove();
    const left = [...media.querySelectorAll('.frame-screen img')];
    if (!left.length) {
      const row = media.closest('.work');
      media.remove(); row.classList.remove('has-media', 'flip', 'tv'); row.classList.add('no-media');
      return;
    }
    media.querySelectorAll('.dot-btn').forEach((d, j) => d.dataset.i = j);
    if (left.length < 2) media.querySelector('.shot-dots')?.remove();
    if (wasOn) { left[0].classList.add('on'); left[0].removeAttribute('loading'); media.querySelector('.dot-btn')?.classList.add('on'); media.dataset.cur = 0; }
    else media.dataset.cur = Math.max(0, left.findIndex(i => i.classList.contains('on')));
  };
  const iconFail = (img) => {
    const m = document.createElement('span');
    m.className = 'app-icon mono'; m.setAttribute('aria-hidden', 'true'); m.textContent = img.dataset.mono || '';
    img.replaceWith(m);
  };
  // landscape screenshots (e.g. a TV app) switch the row to a TV frame
  const checkShape = (img) => {
    if (!img.naturalWidth || img.naturalWidth <= img.naturalHeight * 1.1) return;
    const row = img.closest('.work'), frame = row?.querySelector('.frame');
    if (!frame || frame.classList.contains('frame-tv')) return;
    frame.classList.replace('frame-phone', 'frame-tv'); row.classList.add('tv');
  };

  list.querySelectorAll('img').forEach(img => {
    const isIcon = img.classList.contains('app-icon');
    const ok = () => { if (!isIcon) checkShape(img); };
    const bad = () => isIcon ? iconFail(img) : dropShot(img);
    if (img.complete) (img.naturalWidth ? ok : bad)();
    else { img.addEventListener('load', ok, { once: true }); img.addEventListener('error', bad, { once: true }); }
  });
}

/* ---------- hero: live event feed ---------- */
const DEFAULT_FEED = [
  { tag: 'ws',   text: 'socket.connected · gateway' },
  { tag: 'pay',  text: 'payment.captured' },
  { tag: 'fcm',  text: 'push.delivered' },
  { tag: 'sync', text: 'offline events synced' }
];
function initFeed(){
  const list = $('#feed'); if (!list) return;
  const events = FEED.length ? FEED : DEFAULT_FEED;
  const count = $('#feed-count'), clock = $('#feed-clock');
  const MAX = 8;
  let i = 0, total = 0;
  const pad = (n) => String(n).padStart(2, '0');
  const tickClock = () => { const d = new Date(); clock.textContent = `${d.getHours()}:${pad(d.getMinutes())}`; };
  tickClock(); setInterval(tickClock, 30000);

  const make = (ev) => {
    const li = document.createElement('li');
    const tag = String(ev.tag || 'ws').toLowerCase().replace(/[^a-z]/g, '');
    li.innerHTML = `<span class="ev-tag ev-${tag}">${esc(tag)}</span><span class="ev-time" data-t="${Date.now()}">now</span><span class="ev-text">${esc(ev.text)}</span>`;
    return li;
  };
  const ages = () => list.querySelectorAll('.ev-time').forEach(t => {
    const s = Math.round((Date.now() - +t.dataset.t) / 1000);
    t.textContent = s < 2 ? 'now' : `${s}s ago`;
  });
  const push = (animate) => {
    const li = make(events[i % events.length]); i++; total++;
    if (animate) li.classList.add('enter', 'fresh');
    list.prepend(li);
    if (animate) { li.getBoundingClientRect(); li.classList.remove('enter'); setTimeout(() => li.classList.remove('fresh'), 1400); }
    while (list.children.length > MAX) list.lastElementChild.remove();
    count.textContent = `${total} events`;
  };

  const seed = Math.min(4, events.length);
  for (let k = 0; k < seed; k++) push(false);
  list.querySelectorAll('.ev-time').forEach((t, k) => t.dataset.t = Date.now() - (k + 1) * 3000);
  ages();

  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  let visible = true;
  new IntersectionObserver(([e]) => visible = e.isIntersecting).observe(list);
  setInterval(() => { if (visible && !document.hidden) { push(true); ages(); } else ages(); }, 2200);
}

/* ---------- nav-graph rail ---------- */
const SECTIONS = [
  { id: 'home',       label: 'HomeScreen()' },
  { id: 'work',       label: 'WorkScreen()' },
  { id: 'experience', label: 'ExperienceScreen()' },
  { id: 'skills',     label: 'ToolkitScreen()' },
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
  ink.style.strokeDasharray = L; ink.style.strokeDashoffset = L;

  const nodesG = $('#railNodes'), label = $('#railLabel');
  pts.forEach((pt, i) => {
    const g = document.createElementNS('http://www.w3.org/2000/svg','g');
    g.setAttribute('class','rail-node'); g.dataset.index = i;
    g.innerHTML = `<circle class="node-core" cx="${pt.x}" cy="${pt.y}" r="6.5"/><circle cx="${pt.x}" cy="${pt.y}" r="16" fill="transparent"/>`;
    g.addEventListener('click', () => document.getElementById(pt.id)?.scrollIntoView({ behavior:'smooth' }));
    g.addEventListener('mouseenter', () => {
      const r = g.getBoundingClientRect();
      label.textContent = pt.label; label.style.top = (r.top + r.height/2) + 'px'; label.classList.add('show');
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
    nodesG.querySelectorAll('.rail-node').forEach((g, i) => g.classList.toggle('passed', prog >= i / (SECTIONS.length - 1) - 0.02));
  }
  addEventListener('scroll', () => { if (!ticking){ ticking = true; requestAnimationFrame(update); } }, { passive:true });
  addEventListener('resize', update);
  update();
}

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

function initMenu(){
  const m = $('#mobileMenu'), btn = $('#menuBtn');
  const set = (open) => { m.hidden = !open; btn.setAttribute('aria-expanded', open); document.body.style.overflow = open ? 'hidden' : '';
    if (open) $('#menuClose').focus(); else btn.focus(); };
  btn.addEventListener('click', () => set(true));
  $('#menuClose').addEventListener('click', () => set(false));
  m.querySelectorAll('a').forEach(a => a.addEventListener('click', () => { m.hidden = true; btn.setAttribute('aria-expanded', false); document.body.style.overflow = ''; }));
  addEventListener('keydown', (e) => { if (e.key === 'Escape' && !m.hidden) set(false); });
}

/* ---------- boot ---------- */
(async () => {
  initMenu();
  const { data, source } = await getData();
  if (data) {
    try { render(data); } catch (e) { console.error('Render failed; showing static page.', e); }
  }
  $('#cms-tag').textContent = source;
  requestAnimationFrame(() => document.documentElement.classList.add('loaded'));
  initFeed();
  initRail();
  initActive();
})();
})();

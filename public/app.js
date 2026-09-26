document.getElementById('year').textContent = new Date().getFullYear();

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => { /* silencieux si indisponible */ });
  });
}

// Suivi de visite anonyme (une fois par chargement de page).
// Ignoré côté serveur si la personne est connectée en admin.
(function trackVisit() {
  try {
    fetch('/api/track', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        path: location.pathname + (location.hash || ''),
        referrer: document.referrer || ''
      })
    }).catch(() => {});
  } catch (e) { /* ne bloque jamais l'affichage du site */ }
})();

const API = '/api';
let editingProjectId = null;
let activeFilter = 'Tous';
let uploadedPhoto = null;
let projectImages = [];
let siteContent = {};
let projects = [];
let reviews = [];
let futureProjects = [];
let editingFutureId = null;
let futureMedia = [];
let futurePollOptions = [];
let lightboxMedia = [];
let lightboxMediaIndex = 0;

function toast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2400);
}

// Redimensionne et compresse une image côté navigateur avant l'envoi,
// pour éviter d'alourdir la base de données et de ralentir le site.
function compressImage(file, maxDim = 1600, quality = 0.82) {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith('image/')) { reject(new Error('Fichier non pris en charge.')); return; }
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        let { width, height } = img;
        if (width > maxDim || height > maxDim) {
          if (width > height) { height = Math.round(height * (maxDim / width)); width = maxDim; }
          else { width = Math.round(width * (maxDim / height)); height = maxDim; }
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.onerror = () => reject(new Error("Impossible de lire cette image."));
      img.src = e.target.result;
    };
    reader.onerror = () => reject(new Error("Impossible de lire ce fichier."));
    reader.readAsDataURL(file);
  });
}
function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
}
async function api(path, options = {}) {
  const res = await fetch(API + path, {
    ...options,
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) }
  });
  let data = null;
  try { data = await res.json(); } catch (e) { /* no body */ }
  if (!res.ok) {
    const message = (data && data.error) || 'Une erreur est survenue.';
    throw new Error(message);
  }
  return data;
}

/* ---------- Rendering ---------- */
function renderSiteContent() {
  document.getElementById('hero-name').textContent = siteContent.name || '';
  document.getElementById('hero-role').textContent = siteContent.role || '';
  document.getElementById('hero-bio').textContent = siteContent.bio || '';
  document.getElementById('about-title').textContent = siteContent.aboutTitle || '';
  document.getElementById('about-text').innerHTML = (siteContent.about || '').split(/\n\s*\n/).map(p => `<p>${escapeHtml(p.trim())}</p>`).join('');
  document.getElementById('about-badges').innerHTML = (siteContent.badges || '').split(',').map(b => b.trim()).filter(Boolean).map(b => `<span>${escapeHtml(b)}</span>`).join('');

  const displayName = (siteContent.name || '').split(' ').map(w => w.charAt(0) + w.slice(1).toLowerCase()).join(' ');
  document.getElementById('footer-name').textContent = displayName;
  document.getElementById('footer-copy-name').textContent = displayName;
  document.getElementById('footer-tagline').textContent = (siteContent.role || '') + ' — interfaces web modernes, rapides et responsives.';

  const emailEl = document.getElementById('contact-email');
  emailEl.textContent = siteContent.email || '';
  emailEl.href = 'mailto:' + (siteContent.email || '');
  const waEl = document.getElementById('contact-whatsapp');
  waEl.textContent = siteContent.whatsapp ? '+' + siteContent.whatsapp : '';
  waEl.href = siteContent.whatsapp ? 'https://wa.me/' + siteContent.whatsapp : '#';
  document.getElementById('contact-location').textContent = siteContent.location || '';

  document.getElementById('chat-fab').href = siteContent.whatsapp ? 'https://wa.me/' + siteContent.whatsapp : 'mailto:' + (siteContent.email || '');
  document.getElementById('cta-whatsapp-link').href = siteContent.whatsapp ? 'https://wa.me/' + siteContent.whatsapp : 'mailto:' + (siteContent.email || '');

  const optionalSocials = [
    { key: 'youtube', label: 'YouTube', short: 'YT' },
    { key: 'instagram', label: 'Instagram', short: 'IG' },
    { key: 'tiktok', label: 'TikTok', short: 'TT' }
  ];
  const heroSocial = document.getElementById('social-inline');
  let heroLinks = [`<a href="mailto:${escapeHtml(siteContent.email || '')}">Email</a>`];
  if (siteContent.whatsapp) heroLinks.push(`<a href="https://wa.me/${escapeHtml(siteContent.whatsapp)}" target="_blank" rel="noopener">WhatsApp</a>`);
  heroLinks.push(`<a href="${escapeHtml(siteContent.github || '#')}" target="_blank" rel="noopener">GitHub</a>`);
  heroLinks.push(`<a href="${escapeHtml(siteContent.linkedin || '#')}" target="_blank" rel="noopener">LinkedIn</a>`);
  optionalSocials.forEach(s => { if (siteContent[s.key]) heroLinks.push(`<a href="${escapeHtml(siteContent[s.key])}" target="_blank" rel="noopener">${s.label}</a>`); });
  heroSocial.innerHTML = heroLinks.join('');

  const footerRow = document.getElementById('footer-social-row');
  let footerLinks = [`<a href="${escapeHtml(siteContent.github || '#')}" target="_blank" rel="noopener">GH</a>`];
  if (siteContent.whatsapp) footerLinks.push(`<a href="https://wa.me/${escapeHtml(siteContent.whatsapp)}" target="_blank" rel="noopener">WA</a>`);
  footerLinks.push(`<a href="${escapeHtml(siteContent.linkedin || '#')}" target="_blank" rel="noopener">in</a>`);
  optionalSocials.forEach(s => { if (siteContent[s.key]) footerLinks.push(`<a href="${escapeHtml(siteContent[s.key])}" target="_blank" rel="noopener">${s.short}</a>`); });
  footerRow.innerHTML = footerLinks.join('');

  const photoSrc = siteContent.photo || '';
  document.querySelectorAll('.profile-photo').forEach(img => { if (photoSrc) img.src = photoSrc; });
  if (photoSrc) document.getElementById('avatar-preview').src = photoSrc;

  document.getElementById('pf-name').value = siteContent.name || '';
  document.getElementById('pf-role').value = siteContent.role || '';
  document.getElementById('pf-bio').value = siteContent.bio || '';
  document.getElementById('pf-about-title').value = siteContent.aboutTitle || '';
  document.getElementById('pf-about').value = siteContent.about || '';
  document.getElementById('pf-badges').value = siteContent.badges || '';
  document.getElementById('pf-email').value = siteContent.email || '';
  document.getElementById('pf-whatsapp').value = siteContent.whatsapp || '';
  document.getElementById('pf-location').value = siteContent.location || '';
  document.getElementById('pf-github').value = siteContent.github || '';
  document.getElementById('pf-linkedin').value = siteContent.linkedin || '';
  document.getElementById('pf-youtube').value = siteContent.youtube || '';
  document.getElementById('pf-instagram').value = siteContent.instagram || '';
  document.getElementById('pf-tiktok').value = siteContent.tiktok || '';
}

function renderFilterTabs() {
  const tags = Array.from(new Set(projects.map(p => p.category).filter(Boolean)));
  const tabs = ['Tous', ...tags];
  const el = document.getElementById('filter-tabs');
  el.innerHTML = tabs.map(t => `<button class="filter-tab ${t === activeFilter ? 'active' : ''}" data-filter="${escapeHtml(t)}">${escapeHtml(t)}</button>`).join('');
  el.querySelectorAll('.filter-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      activeFilter = btn.dataset.filter;
      renderFilterTabs();
      renderProjects();
    });
  });
}

function renderProjects() {
  document.getElementById('nav-count-projets').textContent = `[${projects.length}]`;
  const filtered = activeFilter === 'Tous' ? projects : projects.filter(p => p.category === activeFilter);
  const list = document.getElementById('projects-list');
  if (!filtered.length) {
    list.innerHTML = `<p class="empty-state">Aucun projet publié pour le moment.</p>`;
  } else {
    list.innerHTML = filtered.map(p => {
      const imgs = (p.images && p.images.length) ? p.images : (p.image ? [p.image] : []);
      const thumbContent = imgs.length
        ? `<img src="${imgs[0]}" alt="${escapeHtml(p.title)}" data-gallery-open="${p.id}" data-index="0">
           ${imgs.length > 1 ? `
             <button type="button" class="gallery-nav prev" data-gallery-prev="${p.id}">&#8249;</button>
             <button type="button" class="gallery-nav next" data-gallery-next="${p.id}">&#8250;</button>
             <span class="gallery-count" data-gallery-count="${p.id}">1/${imgs.length}</span>
           ` : ''}`
        : "Pas d'image";
      return `
      <div class="project-card">
        <div class="project-thumb ${imgs.length ? '' : 'empty'}" data-project-thumb="${p.id}" data-current="0">
          ${thumbContent}
        </div>
        <div>
          <h3 class="project-title">${escapeHtml(p.title)}</h3>
          <p class="project-desc">${escapeHtml(p.description)}</p>
          ${p.technologies ? `<div class="tech-row">${p.technologies.split(',').map(t => `<span class="tech-chip">${escapeHtml(t.trim())}</span>`).join('')}</div>` : ''}
          <div class="project-links">
            ${p.category ? `<span class="tag">${escapeHtml(p.category)}</span>` : ''}
            ${p.link ? `<a class="project-link" href="${escapeHtml(p.link)}" target="_blank" rel="noopener">Voir le site</a>` : ''}
            ${p.github ? `<a class="project-link" href="${escapeHtml(p.github)}" target="_blank" rel="noopener">Code source</a>` : ''}
          </div>
        </div>
        <div class="project-date mono">${p.created_at ? new Date(p.created_at).toLocaleDateString('fr-FR') : ''}</div>
      </div>
    `;
    }).join('');

    // Navigation flèches (change juste l'image affichée dans la vignette)
    list.querySelectorAll('[data-gallery-prev]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        stepGalleryThumb(btn.dataset.galleryPrev, -1);
      });
    });
    list.querySelectorAll('[data-gallery-next]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        stepGalleryThumb(btn.dataset.galleryNext, 1);
      });
    });
    // Clic sur l'image = ouverture de la visionneuse plein écran
    list.querySelectorAll('[data-gallery-open]').forEach(img => {
      img.addEventListener('click', () => {
        const projectId = img.dataset.galleryOpen;
        const p = projects.find(x => String(x.id) === String(projectId));
        const imgs = (p.images && p.images.length) ? p.images : (p.image ? [p.image] : []);
        const thumb = list.querySelector(`[data-project-thumb="${projectId}"]`);
        const startIndex = parseInt(thumb.dataset.current || '0', 10);
        openLightbox(imgs, startIndex);
      });
    });
  }

  const adminList = document.getElementById('admin-projects-list');
  if (!projects.length) {
    adminList.innerHTML = `<p class="empty-state">Aucun projet pour l'instant.</p>`;
  } else {
    adminList.innerHTML = projects.map(p => `
      <div class="admin-list-item">
        <div class="info"><strong>${escapeHtml(p.title)}</strong><span>${escapeHtml(p.category || '')} · ${p.created_at ? new Date(p.created_at).toLocaleDateString('fr-FR') : ''}</span></div>
        <div class="admin-actions-inline">
          <button class="link-btn" data-edit="${p.id}">Modifier</button>
          <button class="link-btn danger" data-del="${p.id}">Supprimer</button>
        </div>
      </div>
    `).join('');
    adminList.querySelectorAll('[data-del]').forEach(btn => {
      btn.addEventListener('click', async () => {
        try {
          await api('/projects/' + btn.dataset.del, { method: 'DELETE' });
          projects = projects.filter(p => String(p.id) !== btn.dataset.del);
          renderFilterTabs();
          renderProjects();
          toast('Projet supprimé.');
        } catch (e) { toast(e.message); }
      });
    });
    adminList.querySelectorAll('[data-edit]').forEach(btn => {
      btn.addEventListener('click', () => {
        const p = projects.find(x => String(x.id) === btn.dataset.edit);
        if (!p) return;
        editingProjectId = p.id;
        projectImages = (p.images && p.images.length) ? [...p.images] : (p.image ? [p.image] : []);
        document.getElementById('np-title').value = p.title;
        document.getElementById('np-category').value = p.category || '';
        document.getElementById('np-desc').value = p.description;
        document.getElementById('np-tech').value = p.technologies || '';
        document.getElementById('np-link').value = p.link || '';
        document.getElementById('np-github').value = p.github || '';
        renderGalleryGrid();
        document.getElementById('project-form-heading').textContent = 'Modifier le projet';
        document.getElementById('add-project').textContent = 'Mettre à jour le projet';
        document.getElementById('cancel-edit').classList.remove('hidden');
        document.getElementById('tab-projets-admin').scrollIntoView({ behavior: 'smooth' });
      });
    });
  }
}

function stepGalleryThumb(projectId, delta) {
  const p = projects.find(x => String(x.id) === String(projectId));
  if (!p) return;
  const imgs = (p.images && p.images.length) ? p.images : (p.image ? [p.image] : []);
  if (imgs.length < 2) return;
  const thumb = document.querySelector(`[data-project-thumb="${projectId}"]`);
  let current = parseInt(thumb.dataset.current || '0', 10);
  current = (current + delta + imgs.length) % imgs.length;
  thumb.dataset.current = current;
  thumb.querySelector('img').src = imgs[current];
  thumb.querySelector('img').dataset.index = current;
  const countEl = thumb.querySelector('[data-gallery-count]');
  if (countEl) countEl.textContent = `${current + 1}/${imgs.length}`;
}

/* ---------- Visionneuse plein écran ---------- */
let lightboxImages = [];
let lightboxIndex = 0;

function openLightbox(imgs, startIndex) {
  if (!imgs.length) return;
  lightboxImages = imgs;
  lightboxIndex = startIndex || 0;
  renderLightbox();
  document.getElementById('lightbox').classList.remove('hidden');
}
function renderLightbox() {
  document.getElementById('lightbox-img').src = lightboxImages[lightboxIndex];
  document.getElementById('lightbox-count').textContent = `${lightboxIndex + 1} / ${lightboxImages.length}`;
  const multi = lightboxImages.length > 1;
  document.getElementById('lightbox-prev').style.display = multi ? 'flex' : 'none';
  document.getElementById('lightbox-next').style.display = multi ? 'flex' : 'none';
}
function closeLightbox() {
  document.getElementById('lightbox').classList.add('hidden');
}
document.getElementById('lightbox-close').addEventListener('click', closeLightbox);
document.getElementById('lightbox').addEventListener('click', (e) => {
  if (e.target.id === 'lightbox') closeLightbox();
});
document.getElementById('lightbox-prev').addEventListener('click', () => {
  lightboxIndex = (lightboxIndex - 1 + lightboxImages.length) % lightboxImages.length;
  renderLightbox();
});
document.getElementById('lightbox-next').addEventListener('click', () => {
  lightboxIndex = (lightboxIndex + 1) % lightboxImages.length;
  renderLightbox();
});
document.addEventListener('keydown', (e) => {
  if (document.getElementById('lightbox').classList.contains('hidden')) return;
  if (e.key === 'Escape') closeLightbox();
  if (e.key === 'ArrowLeft') document.getElementById('lightbox-prev').click();
  if (e.key === 'ArrowRight') document.getElementById('lightbox-next').click();
});

function starString(n) { n = Math.max(0, Math.min(5, n || 0)); return '★'.repeat(n) + '☆'.repeat(5 - n); }

function renderReviews() {
  document.getElementById('nav-count-avis').textContent = `[${reviews.length}]`;
  const list = document.getElementById('reviews-list');
  if (!reviews.length) {
    list.innerHTML = `<p class="empty-state">Aucun avis pour le moment. Soyez le premier à en laisser un.</p>`;
  } else {
    list.innerHTML = reviews.map(r => `
      <div class="review-card">
        <div class="review-top"><span class="review-name">${escapeHtml(r.name)}</span><span class="review-stars">${starString(r.rating)}</span></div>
        <p class="review-msg">${escapeHtml(r.message)}</p>
        <div class="review-date mono">${r.created_at ? new Date(r.created_at).toLocaleDateString('fr-FR') : ''}</div>
      </div>
    `).join('');
  }
  const adminList = document.getElementById('admin-reviews-list');
  if (!reviews.length) {
    adminList.innerHTML = `<p class="empty-state">Aucun avis pour l'instant.</p>`;
  } else {
    adminList.innerHTML = reviews.map(r => `
      <div class="admin-list-item">
        <div class="info"><strong>${escapeHtml(r.name)} — ${starString(r.rating)}</strong><span>${escapeHtml(r.message)}</span></div>
        <div class="admin-actions-inline"><button class="link-btn danger" data-delrev="${r.id}">Supprimer</button></div>
      </div>
    `).join('');
    adminList.querySelectorAll('[data-delrev]').forEach(btn => {
      btn.addEventListener('click', async () => {
        try {
          await api('/reviews/' + btn.dataset.delrev, { method: 'DELETE' });
          reviews = reviews.filter(r => String(r.id) !== btn.dataset.delrev);
          renderReviews();
          toast('Avis supprimé.');
        } catch (e) { toast(e.message); }
      });
    });
  }
}

/* ---------- Prochains projets (À venir) ---------- */
function toEmbedUrl(url) {
  try {
    const u = new URL(url);
    if (u.hostname.includes('youtu.be')) {
      return { iframe: true, url: `https://www.youtube.com/embed/${u.pathname.slice(1)}` };
    }
    if (u.hostname.includes('youtube.com')) {
      let id = u.searchParams.get('v');
      if (!id && u.pathname.includes('/embed/')) id = u.pathname.split('/embed/')[1];
      if (!id && u.pathname.includes('/shorts/')) id = u.pathname.split('/shorts/')[1];
      return { iframe: true, url: `https://www.youtube.com/embed/${id}` };
    }
    if (u.hostname.includes('vimeo.com')) {
      const id = u.pathname.split('/').filter(Boolean).pop();
      return { iframe: true, url: `https://player.vimeo.com/video/${id}` };
    }
  } catch (e) { /* lien mal formé : traité comme vidéo directe ci-dessous */ }
  return { iframe: false, url };
}

function openMediaLightbox(media, index) {
  if (!media || !media.length) return;
  lightboxMedia = media;
  lightboxMediaIndex = index || 0;
  renderMediaLightbox();
  document.getElementById('media-lightbox').classList.remove('hidden');
}
function renderMediaLightbox() {
  const item = lightboxMedia[lightboxMediaIndex];
  const content = document.getElementById('media-lightbox-content');
  if (!item) return;
  if (item.type === 'video') {
    const embed = toEmbedUrl(item.src);
    content.innerHTML = embed.iframe
      ? `<iframe src="${escapeHtml(embed.url)}" allow="autoplay; fullscreen; encrypted-media" allowfullscreen></iframe>`
      : `<video src="${escapeHtml(item.src)}" controls autoplay></video>`;
  } else {
    content.innerHTML = `<img src="${item.src}" alt="Média">`;
  }
}
document.getElementById('media-lightbox-close').addEventListener('click', () => {
  document.getElementById('media-lightbox-content').innerHTML = '';
  document.getElementById('media-lightbox').classList.add('hidden');
});
document.getElementById('media-lightbox').addEventListener('click', (e) => {
  if (e.target.id === 'media-lightbox') {
    document.getElementById('media-lightbox-content').innerHTML = '';
    document.getElementById('media-lightbox').classList.add('hidden');
  }
});

function renderFutureProjects() {
  document.getElementById('nav-count-future').textContent = `[${futureProjects.length}]`;
  const list = document.getElementById('future-projects-list');

  if (!futureProjects.length) {
    list.innerHTML = `<p class="empty-state">Aucun prochain projet publié pour le moment.</p>`;
  } else {
    list.innerHTML = futureProjects.map(p => {
      const mediaHtml = (p.media || []).map((m, i) => `
        <div class="future-media-item ${m.type === 'video' ? 'video-item' : ''}" data-media-open="${p.id}" data-media-index="${i}">
          ${m.type === 'image' ? `<img src="${m.src}" alt="${escapeHtml(p.title)}">` : ''}
        </div>
      `).join('');

      let pollHtml = '';
      if (p.pollQuestion && p.pollOptions && p.pollOptions.length) {
        const votes = p.pollVotes && p.pollVotes.length === p.pollOptions.length ? p.pollVotes : p.pollOptions.map(() => 0);
        const total = votes.reduce((a, b) => a + b, 0);
        const hasVoted = p.userVotedOption != null;
        const optionsHtml = p.pollOptions.map((opt, i) => {
          const count = votes[i] || 0;
          const pct = total > 0 ? Math.round((count / total) * 100) : 0;
          return `
            <button type="button" class="poll-option ${p.userVotedOption === i ? 'voted' : ''}" data-vote="${p.id}" data-option="${i}">
              ${hasVoted ? `<span class="poll-fill" style="width:${pct}%;"></span>` : ''}
              <span class="poll-option-row"><span>${escapeHtml(opt)}</span>${hasVoted ? `<span>${pct}%</span>` : ''}</span>
            </button>
          `;
        }).join('');
        pollHtml = `
          <div class="poll-block">
            <p class="poll-question">${escapeHtml(p.pollQuestion)}</p>
            <div class="poll-options">${optionsHtml}</div>
            ${hasVoted ? `<p class="poll-total">${total} vote${total > 1 ? 's' : ''}</p>` : ''}
          </div>
        `;
      }

      return `
        <div class="future-card">
          <h3 class="future-title">${escapeHtml(p.title)}</h3>
          <p class="future-desc">${escapeHtml(p.description)}</p>
          ${mediaHtml ? `<div class="future-media">${mediaHtml}</div>` : ''}
          <div class="reaction-row">
            <button type="button" class="reaction-btn like ${p.userReaction === 'like' ? 'active' : ''}" data-react="${p.id}" data-type="like">👍 <span>${p.likesCount || 0}</span></button>
            <button type="button" class="reaction-btn dislike ${p.userReaction === 'dislike' ? 'active' : ''}" data-react="${p.id}" data-type="dislike">👎 <span>${p.dislikesCount || 0}</span></button>
          </div>
          ${pollHtml}
        </div>
      `;
    }).join('');

    list.querySelectorAll('[data-media-open]').forEach(el => {
      el.addEventListener('click', () => {
        const p = futureProjects.find(x => String(x.id) === el.dataset.mediaOpen);
        if (p) openMediaLightbox(p.media, parseInt(el.dataset.mediaIndex, 10));
      });
    });
    list.querySelectorAll('[data-react]').forEach(btn => {
      btn.addEventListener('click', async () => {
        try {
          const data = await api(`/future-projects/${btn.dataset.react}/react`, { method: 'POST', body: JSON.stringify({ type: btn.dataset.type }) });
          const p = futureProjects.find(x => String(x.id) === btn.dataset.react);
          if (p) { p.likesCount = data.likesCount; p.dislikesCount = data.dislikesCount; p.userReaction = data.userReaction; }
          renderFutureProjects();
        } catch (e) { toast(e.message); }
      });
    });
    list.querySelectorAll('[data-vote]').forEach(btn => {
      btn.addEventListener('click', async () => {
        try {
          const data = await api(`/future-projects/${btn.dataset.vote}/vote`, { method: 'POST', body: JSON.stringify({ optionIndex: parseInt(btn.dataset.option, 10) }) });
          const p = futureProjects.find(x => String(x.id) === btn.dataset.vote);
          if (p) { p.pollVotes = data.pollVotes; p.userVotedOption = data.userVotedOption; }
          renderFutureProjects();
        } catch (e) { toast(e.message); }
      });
    });
  }

  const adminList = document.getElementById('admin-future-list');
  if (!futureProjects.length) {
    adminList.innerHTML = `<p class="empty-state">Aucun prochain projet pour l'instant.</p>`;
  } else {
    adminList.innerHTML = futureProjects.map(p => `
      <div class="admin-list-item">
        <div class="info"><strong>${escapeHtml(p.title)}</strong><span>${p.likesCount || 0} 👍 · ${p.dislikesCount || 0} 👎${p.createdAt ? ' · ' + new Date(p.createdAt).toLocaleDateString('fr-FR') : ''}</span></div>
        <div class="admin-actions-inline">
          <button class="link-btn" data-edit-future="${p.id}">Modifier</button>
          <button class="link-btn danger" data-del-future="${p.id}">Supprimer</button>
        </div>
      </div>
    `).join('');
    adminList.querySelectorAll('[data-del-future]').forEach(btn => {
      btn.addEventListener('click', async () => {
        try {
          await api('/future-projects/' + btn.dataset.delFuture, { method: 'DELETE' });
          futureProjects = futureProjects.filter(p => String(p.id) !== btn.dataset.delFuture);
          renderFutureProjects();
          toast('Prochain projet supprimé.');
        } catch (e) { toast(e.message); }
      });
    });
    adminList.querySelectorAll('[data-edit-future]').forEach(btn => {
      btn.addEventListener('click', () => {
        const p = futureProjects.find(x => String(x.id) === btn.dataset.editFuture);
        if (!p) return;
        editingFutureId = p.id;
        futureMedia = p.media ? [...p.media] : [];
        futurePollOptions = p.pollOptions ? [...p.pollOptions] : [];
        document.getElementById('future-title').value = p.title;
        document.getElementById('future-desc').value = p.description;
        document.getElementById('future-poll-question').value = p.pollQuestion || '';
        renderFutureGalleryGrid();
        renderFuturePollOptions();
        document.getElementById('future-form-heading').textContent = 'Modifier le prochain projet';
        document.getElementById('future-save-btn').textContent = 'Mettre à jour le projet';
        document.getElementById('future-cancel-edit').classList.remove('hidden');
        document.getElementById('tab-future-admin').scrollIntoView({ behavior: 'smooth' });
      });
    });
  }
}

/* ---------- Init ---------- */
function hidePreloader() {
  const p = document.getElementById('preloader');
  if (!p) return;
  p.classList.add('fade-out');
  setTimeout(() => { p.style.display = 'none'; }, 550);
}

async function init() {
  try {
    const [settingsData, projectsData, reviewsData, futureData] = await Promise.all([
      api('/settings'),
      api('/projects'),
      api('/reviews'),
      api('/future-projects')
    ]);
    siteContent = settingsData || {};
    projects = projectsData || [];
    reviews = reviewsData || [];
    futureProjects = futureData || [];
  } catch (e) {
    console.error(e);
    toast("Impossible de charger les données du serveur.");
  }
  renderSiteContent();
  renderFilterTabs();
  renderProjects();
  renderReviews();
  renderFutureProjects();
  hidePreloader();
  try {
    await api('/auth/me');
    document.getElementById('admin-panel').classList.remove('hidden');
  } catch (e) { /* pas connecté, normal pour un visiteur */ }
}
init();
window.addEventListener('load', () => setTimeout(hidePreloader, 400));
setTimeout(hidePreloader, 5000);

/* ---------- Reviews form ---------- */
let selectedRating = 0;
document.querySelectorAll('.star-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    selectedRating = parseInt(btn.dataset.val);
    document.querySelectorAll('.star-btn').forEach(b => b.classList.toggle('active', parseInt(b.dataset.val) <= selectedRating));
  });
});
document.getElementById('rv-submit').addEventListener('click', async () => {
  const name = document.getElementById('rv-name').value.trim();
  const message = document.getElementById('rv-message').value.trim();
  if (!name || !message) { toast('Merci de renseigner votre nom et votre avis.'); return; }
  try {
    const review = await api('/reviews', { method: 'POST', body: JSON.stringify({ name, message, rating: selectedRating || 5 }) });
    reviews.unshift(review);
    renderReviews();
    document.getElementById('rv-name').value = '';
    document.getElementById('rv-message').value = '';
    selectedRating = 0;
    document.querySelectorAll('.star-btn').forEach(b => b.classList.remove('active'));
    toast('Merci, votre avis a été publié !');
  } catch (e) { toast(e.message); }
});

/* ---------- Contact form ---------- */
document.getElementById('cf-submit').addEventListener('click', async () => {
  const name = document.getElementById('cf-name').value.trim();
  const email = document.getElementById('cf-email').value.trim();
  const whatsapp = document.getElementById('cf-whatsapp').value.trim();
  const projectType = document.getElementById('cf-type').value;
  const budget = document.getElementById('cf-budget').value.trim();
  const description = document.getElementById('cf-desc').value.trim();

  if (!name || !email || !description) {
    toast('Merci de renseigner ton nom, ton email et une description.');
    return;
  }

  const btn = document.getElementById('cf-submit');
  const originalText = btn.textContent;
  btn.textContent = 'Envoi en cours…';
  btn.disabled = true;

  function openMailtoFallback() {
    const body = `Nom: ${name}%0AEmail: ${email}%0AWhatsApp: ${whatsapp}%0AType de projet: ${projectType}%0ABudget: ${budget}%0A%0A${description}`;
    window.location.href = `mailto:${siteContent.email || ''}?subject=Nouvelle demande de projet&body=${body}`;
  }

  try {
    await api('/contact', {
      method: 'POST',
      body: JSON.stringify({ name, email, whatsapp, projectType, budget, description })
    });
    toast('Message envoyé ! Je te réponds rapidement.');
    ['cf-name', 'cf-email', 'cf-whatsapp', 'cf-budget', 'cf-desc'].forEach(id => document.getElementById(id).value = '');
  } catch (e) {
    toast("L'envoi a échoué, ouverture de ton client mail à la place…");
    openMailtoFallback();
  } finally {
    btn.textContent = originalText;
    btn.disabled = false;
  }
});

/* ---------- Admin login ---------- */
function openLogin() {
  document.getElementById('login-overlay').classList.remove('hidden');
  checkPasskeyAvailable().then(avail => {
    document.getElementById('passkey-login-btn').classList.toggle('hidden', !avail);
  });
}
function closeLogin() {
  document.getElementById('login-overlay').classList.add('hidden');
  document.getElementById('login-pass').value = '';
  document.getElementById('login-error').style.display = 'none';
}
document.getElementById('login-cancel').addEventListener('click', closeLogin);
document.getElementById('login-submit').addEventListener('click', tryLogin);
document.addEventListener('keydown', e => {
  if (e.ctrlKey && e.altKey && (e.key === 'a' || e.key === 'A')) { e.preventDefault(); openLogin(); }
});

/* Déclencheur via URL secrète (ADMIN_ACCESS_PATH côté serveur) : si le
   serveur a déposé le cookie éphémère "open_admin", on ouvre la connexion
   puis on supprime immédiatement le cookie pour qu'un rechargement de page
   ne rouvre pas la fenêtre sans repasser par l'URL secrète. */
(() => {
  const match = document.cookie.match(/(?:^|; )open_admin=1(?:;|$)/);
  if (match) {
    document.cookie = 'open_admin=; Max-Age=0; SameSite=Strict; path=/';
    openLogin();
  }
})();

/* Déclencheur mobile : Ctrl+Alt+A est injoignable au doigt sur un téléphone
   (pas de clavier physique), donc on ajoute un déclencheur tactile équivalent :
   7 taps rapides (moins de 2s au total) sur la mention de copyright en pied de page. */
(() => {
  const copyrightEl = document.querySelector('.copyright');
  if (!copyrightEl) return;
  let tapCount = 0;
  let resetTimer = null;
  copyrightEl.addEventListener('click', () => {
    tapCount++;
    clearTimeout(resetTimer);
    resetTimer = setTimeout(() => { tapCount = 0; }, 2000);
    if (tapCount >= 7) {
      tapCount = 0;
      clearTimeout(resetTimer);
      openLogin();
    }
  });
})();
document.getElementById('login-pass').addEventListener('keydown', e => { if (e.key === 'Enter') tryLogin(); });

async function tryLogin() {
  const password = document.getElementById('login-pass').value;
  try {
    await api('/auth/login', { method: 'POST', body: JSON.stringify({ password }) });
    closeLogin();
    document.getElementById('admin-panel').classList.remove('hidden');
    document.getElementById('admin-panel').scrollIntoView({ behavior: 'smooth' });
    toast("Connecté en tant qu'administrateur.");
  } catch (e) {
    document.getElementById('login-error').textContent = e.message;
    document.getElementById('login-error').style.display = 'block';
  }
}
document.getElementById('exit-admin').addEventListener('click', async () => {
  try { await api('/auth/logout', { method: 'POST' }); } catch (e) { /* ignore */ }
  document.getElementById('admin-panel').classList.add('hidden');
  window.scrollTo({ top: 0, behavior: 'smooth' });
});

/* ---------- Admin tabs ---------- */
document.querySelectorAll('.admin-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.admin-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.admin-section').forEach(s => s.classList.remove('active'));
    tab.classList.add('active');
    document.getElementById('tab-' + tab.dataset.tab).classList.add('active');
    if (tab.dataset.tab === 'stats') loadStats();
    if (tab.dataset.tab === 'securite') loadPasskeys();
  });
});

function barRow(label, count, max) {
  const pct = max > 0 ? Math.max(4, Math.round((count / max) * 100)) : 0;
  return `
    <div class="bar-row">
      <span class="bar-label" title="${escapeHtml(label)}">${escapeHtml(label)}</span>
      <div class="bar-track"><div class="bar-fill" style="width:${pct}%;"></div></div>
      <span class="bar-count">${count}</span>
    </div>
  `;
}

async function loadStats() {
  ['stats-daily', 'stats-pages', 'stats-referrers', 'stats-devices'].forEach(id => {
    document.getElementById(id).innerHTML = '<p class="loading-inline">Chargement…</p>';
  });
  try {
    const data = await api('/stats');

    const overview = document.getElementById('stats-overview');
    overview.innerHTML = `
      <div class="stat-box"><span class="num">${data.totalViews}</span><span class="label">Vues totales</span></div>
      <div class="stat-box"><span class="num">${data.uniqueVisitors}</span><span class="label">Visiteurs uniques</span></div>
      <div class="stat-box"><span class="num">${data.viewsToday}</span><span class="label">Vues aujourd'hui</span></div>
    `;

    const dailyEl = document.getElementById('stats-daily');
    if (!data.daily.length) {
      dailyEl.innerHTML = '<p class="empty-state">Pas encore de données sur les 7 derniers jours.</p>';
    } else {
      const maxDaily = Math.max(...data.daily.map(d => d.count));
      dailyEl.innerHTML = data.daily.map(d => {
        const label = new Date(d.day).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' });
        return barRow(label, d.count, maxDaily);
      }).join('');
    }

    const pagesEl = document.getElementById('stats-pages');
    if (!data.topPages.length) {
      pagesEl.innerHTML = '<p class="empty-state">Aucune visite enregistrée pour le moment.</p>';
    } else {
      const maxPages = Math.max(...data.topPages.map(p => p.count));
      pagesEl.innerHTML = data.topPages.map(p => barRow(p.path || '/', p.count, maxPages)).join('');
    }

    const refEl = document.getElementById('stats-referrers');
    if (!data.topReferrers.length) {
      refEl.innerHTML = '<p class="empty-state">Pas encore de source de trafic identifiée (accès directs uniquement).</p>';
    } else {
      const maxRef = Math.max(...data.topReferrers.map(r => r.count));
      refEl.innerHTML = data.topReferrers.map(r => {
        let label = r.referrer;
        try { label = new URL(r.referrer).hostname; } catch (e) { /* garder tel quel si pas une URL valide */ }
        return barRow(label, r.count, maxRef);
      }).join('');
    }

    const devEl = document.getElementById('stats-devices');
    if (!data.devices.length) {
      devEl.innerHTML = '<p class="empty-state">Aucune donnée pour le moment.</p>';
    } else {
      const maxDev = Math.max(...data.devices.map(d => d.count));
      devEl.innerHTML = data.devices.map(d => barRow(d.device, d.count, maxDev)).join('');
    }
  } catch (e) {
    toast(e.message);
  }
}

/* ---------- Settings (Paramètres) ---------- */
document.getElementById('pf-photo-input').addEventListener('change', async e => {
  const file = e.target.files[0];
  if (!file) return;
  try {
    toast('Optimisation de la photo…');
    uploadedPhoto = await compressImage(file, 1000, 0.85);
    document.getElementById('avatar-preview').src = uploadedPhoto;
  } catch (err) {
    toast(err.message);
  }
});
document.getElementById('save-settings').addEventListener('click', async () => {
  const updated = {
    ...siteContent,
    name: document.getElementById('pf-name').value.trim() || siteContent.name,
    role: document.getElementById('pf-role').value.trim(),
    bio: document.getElementById('pf-bio').value.trim(),
    aboutTitle: document.getElementById('pf-about-title').value.trim(),
    about: document.getElementById('pf-about').value.trim(),
    badges: document.getElementById('pf-badges').value.trim(),
    email: document.getElementById('pf-email').value.trim(),
    whatsapp: document.getElementById('pf-whatsapp').value.trim().replace(/[^0-9]/g, ''),
    location: document.getElementById('pf-location').value.trim(),
    github: document.getElementById('pf-github').value.trim(),
    linkedin: document.getElementById('pf-linkedin').value.trim(),
    youtube: document.getElementById('pf-youtube').value.trim(),
    instagram: document.getElementById('pf-instagram').value.trim(),
    tiktok: document.getElementById('pf-tiktok').value.trim(),
    photo: uploadedPhoto || siteContent.photo || null
  };
  try {
    const data = await api('/settings', { method: 'PUT', body: JSON.stringify(updated) });
    siteContent = data.data;
    renderSiteContent();
    toast('Vos données ont été enregistrées.');
  } catch (e) { toast(e.message); }
});

/* ---------- Projects (add / edit / cancel) ---------- */
const MAX_PROJECT_IMAGES = 8;

function renderGalleryGrid() {
  const grid = document.getElementById('project-gallery-grid');
  const thumbs = projectImages.map((src, i) => `
    <div class="thumb-wrap">
      <img src="${src}" alt="Photo ${i + 1}">
      <button type="button" class="thumb-remove" data-remove-img="${i}" title="Retirer cette photo">&times;</button>
    </div>
  `).join('');
  const addBtn = projectImages.length < MAX_PROJECT_IMAGES
    ? `<button type="button" class="thumb-add" id="project-add-photo-btn">+ Ajouter<br>une photo</button>`
    : '';
  grid.innerHTML = thumbs + addBtn;

  const addBtnEl = document.getElementById('project-add-photo-btn');
  if (addBtnEl) addBtnEl.addEventListener('click', () => document.getElementById('np-image-input').click());
  grid.querySelectorAll('[data-remove-img]').forEach(btn => {
    btn.addEventListener('click', () => {
      projectImages.splice(parseInt(btn.dataset.removeImg, 10), 1);
      renderGalleryGrid();
    });
  });
}
renderGalleryGrid();

document.getElementById('np-image-input').addEventListener('change', async e => {
  const files = Array.from(e.target.files || []);
  if (!files.length) return;
  const room = MAX_PROJECT_IMAGES - projectImages.length;
  if (room <= 0) {
    toast(`Maximum ${MAX_PROJECT_IMAGES} photos par projet.`);
    e.target.value = '';
    return;
  }
  const toProcess = files.slice(0, room);
  if (files.length > room) toast(`Seules les ${room} premières photos ont été ajoutées (maximum ${MAX_PROJECT_IMAGES}).`);
  toast('Optimisation des photos…');
  for (const file of toProcess) {
    try {
      const compressed = await compressImage(file, 1600, 0.82);
      projectImages.push(compressed);
    } catch (err) {
      toast(err.message);
    }
  }
  renderGalleryGrid();
  e.target.value = '';
});

function resetProjectForm() {
  editingProjectId = null;
  projectImages = [];
  document.getElementById('np-title').value = '';
  document.getElementById('np-category').value = '';
  document.getElementById('np-desc').value = '';
  document.getElementById('np-tech').value = '';
  document.getElementById('np-link').value = '';
  document.getElementById('np-github').value = '';
  renderGalleryGrid();
  document.getElementById('project-form-heading').textContent = 'Ajouter un projet';
  document.getElementById('add-project').textContent = 'Ajouter le projet';
  document.getElementById('cancel-edit').classList.add('hidden');
}

document.getElementById('add-project').addEventListener('click', async () => {
  const title = document.getElementById('np-title').value.trim();
  const description = document.getElementById('np-desc').value.trim();
  const category = document.getElementById('np-category').value.trim();
  const technologies = document.getElementById('np-tech').value.trim();
  const link = document.getElementById('np-link').value.trim();
  const github = document.getElementById('np-github').value.trim();
  if (!title || !description) { toast('Titre et description requis.'); return; }

  const payload = {
    title, description, category, technologies, link, github,
    images: projectImages
  };

  try {
    if (editingProjectId) {
      const updated = await api('/projects/' + editingProjectId, { method: 'PUT', body: JSON.stringify(payload) });
      projects = projects.map(p => p.id === updated.id ? updated : p);
      toast('Projet mis à jour.');
    } else {
      const created = await api('/projects', { method: 'POST', body: JSON.stringify(payload) });
      projects.unshift(created);
      toast('Projet ajouté.');
    }
    resetProjectForm();
    renderFilterTabs();
    renderProjects();
  } catch (e) { toast(e.message); }
});
document.getElementById('cancel-edit').addEventListener('click', resetProjectForm);

/* ---------- Security ---------- */
document.getElementById('change-pass').addEventListener('click', async () => {
  const val = document.getElementById('new-pass').value.trim();
  if (val.length < 8) { toast('Le mot de passe doit contenir au moins 8 caractères.'); return; }
  try {
    await api('/auth/password', { method: 'PUT', body: JSON.stringify({ newPassword: val }) });
    document.getElementById('new-pass').value = '';
    toast('Mot de passe mis à jour.');
  } catch (e) { toast(e.message); }
});

/* ---------- Passkeys (WebAuthn) : Face ID / Touch ID / Windows Hello ---------- */
// Implémenté directement avec les API natives du navigateur (pas de
// bibliothèque externe), pour rester compatible avec la politique de
// sécurité stricte du site (aucun script tiers autorisé).

function base64urlToBuffer(base64url) {
  const padding = '='.repeat((4 - (base64url.length % 4)) % 4);
  const base64 = (base64url + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const buffer = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) buffer[i] = raw.charCodeAt(i);
  return buffer.buffer;
}
function bufferToBase64url(buffer) {
  const bytes = new Uint8Array(buffer);
  let str = '';
  for (let i = 0; i < bytes.byteLength; i++) str += String.fromCharCode(bytes[i]);
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

const webauthnSupported = !!(window.PublicKeyCredential && navigator.credentials);

async function checkPasskeyAvailable() {
  if (!webauthnSupported) return false;
  try {
    const data = await api('/auth/passkey/available');
    return !!data.available;
  } catch (e) {
    return false;
  }
}

async function registerPasskey() {
  if (!webauthnSupported) { toast("Cet appareil ou ce navigateur ne prend pas en charge cette fonctionnalité."); return; }
  const errorEl = document.getElementById('passkey-error');
  errorEl.style.display = 'none';
  try {
    const { options } = await api('/auth/passkey/register-options', { method: 'POST' });
    const publicKey = {
      ...options,
      challenge: base64urlToBuffer(options.challenge),
      user: { ...options.user, id: base64urlToBuffer(options.user.id) },
      excludeCredentials: (options.excludeCredentials || []).map(c => ({ ...c, id: base64urlToBuffer(c.id) }))
    };
    const credential = await navigator.credentials.create({ publicKey });
    const attestationResponse = {
      id: credential.id,
      rawId: bufferToBase64url(credential.rawId),
      type: credential.type,
      response: {
        clientDataJSON: bufferToBase64url(credential.response.clientDataJSON),
        attestationObject: bufferToBase64url(credential.response.attestationObject),
        transports: credential.response.getTransports ? credential.response.getTransports() : []
      },
      clientExtensionResults: credential.getClientExtensionResults ? credential.getClientExtensionResults() : {}
    };
    const label = document.getElementById('passkey-label').value.trim();
    await api('/auth/passkey/register-verify', { method: 'POST', body: JSON.stringify({ response: attestationResponse, label }) });
    document.getElementById('passkey-label').value = '';
    toast('Appareil ajouté avec succès.');
    loadPasskeys();
  } catch (e) {
    if (e.name === 'NotAllowedError') {
      errorEl.textContent = 'Opération annulée.';
    } else {
      errorEl.textContent = e.message || "Impossible d'ajouter cet appareil.";
    }
    errorEl.style.display = 'block';
  }
}

async function loginWithPasskey() {
  if (!webauthnSupported) { toast("Cet appareil ou ce navigateur ne prend pas en charge cette fonctionnalité."); return; }
  try {
    const { options } = await api('/auth/passkey/login-options', { method: 'POST' });
    const publicKey = {
      ...options,
      challenge: base64urlToBuffer(options.challenge),
      allowCredentials: (options.allowCredentials || []).map(c => ({ ...c, id: base64urlToBuffer(c.id) }))
    };
    const assertion = await navigator.credentials.get({ publicKey });
    const authResponse = {
      id: assertion.id,
      rawId: bufferToBase64url(assertion.rawId),
      type: assertion.type,
      response: {
        clientDataJSON: bufferToBase64url(assertion.response.clientDataJSON),
        authenticatorData: bufferToBase64url(assertion.response.authenticatorData),
        signature: bufferToBase64url(assertion.response.signature),
        userHandle: assertion.response.userHandle ? bufferToBase64url(assertion.response.userHandle) : null
      },
      clientExtensionResults: assertion.getClientExtensionResults ? assertion.getClientExtensionResults() : {}
    };
    await api('/auth/passkey/login-verify', { method: 'POST', body: JSON.stringify({ response: authResponse }) });
    closeLogin();
    document.getElementById('admin-panel').classList.remove('hidden');
    document.getElementById('admin-panel').scrollIntoView({ behavior: 'smooth' });
    toast('Connecté avec Face ID / empreinte.');
  } catch (e) {
    if (e.name === 'NotAllowedError') {
      toast('Connexion annulée.');
    } else {
      document.getElementById('login-error').textContent = e.message || 'Connexion par passkey échouée.';
      document.getElementById('login-error').style.display = 'block';
    }
  }
}

async function loadPasskeys() {
  try {
    const list = await api('/auth/passkey/list');
    const el = document.getElementById('passkey-list');
    if (!list.length) {
      el.innerHTML = '<p class="empty-state">Aucun appareil enregistré.</p>';
      return;
    }
    el.innerHTML = list.map(p => `
      <div class="admin-list-item">
        <div class="info"><strong>${escapeHtml(p.label || 'Appareil')}</strong><span>Ajouté le ${new Date(p.created_at).toLocaleDateString('fr-FR')}</span></div>
        <div class="admin-actions-inline"><button class="link-btn danger" data-delpk="${p.id}">Supprimer</button></div>
      </div>
    `).join('');
    el.querySelectorAll('[data-delpk]').forEach(btn => {
      btn.addEventListener('click', async () => {
        try {
          await api('/auth/passkey/' + btn.dataset.delpk, { method: 'DELETE' });
          toast('Appareil supprimé.');
          loadPasskeys();
        } catch (e) { toast(e.message); }
      });
    });
  } catch (e) { /* silencieux : pas grave si la liste ne charge pas immédiatement */ }
}

document.getElementById('passkey-register-btn').addEventListener('click', registerPasskey);
document.getElementById('passkey-login-btn').addEventListener('click', loginWithPasskey);

/* ---------- Prochains projets (add / edit / cancel) ---------- */
const MAX_FUTURE_MEDIA = 6;
const MAX_POLL_OPTIONS = 6;

function renderFutureGalleryGrid() {
  const grid = document.getElementById('future-gallery-grid');
  const thumbs = futureMedia.map((m, i) => `
    <div class="thumb-wrap">
      ${m.type === 'video'
        ? `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;background:#111;color:#fff;font-size:0.68rem;padding:4px;text-align:center;word-break:break-all;">▶ Vidéo</div>`
        : `<img src="${m.src}" alt="Média ${i + 1}">`}
      <button type="button" class="thumb-remove" data-remove-future-media="${i}" title="Retirer ce média">&times;</button>
    </div>
  `).join('');
  const addBtn = futureMedia.length < MAX_FUTURE_MEDIA
    ? `<button type="button" class="thumb-add" id="future-add-photo-btn">+ Ajouter<br>une photo</button>`
    : '';
  grid.innerHTML = thumbs + addBtn;

  const addBtnEl = document.getElementById('future-add-photo-btn');
  if (addBtnEl) addBtnEl.addEventListener('click', () => document.getElementById('future-image-input').click());
  grid.querySelectorAll('[data-remove-future-media]').forEach(btn => {
    btn.addEventListener('click', () => {
      futureMedia.splice(parseInt(btn.dataset.removeFutureMedia, 10), 1);
      renderFutureGalleryGrid();
    });
  });
}
renderFutureGalleryGrid();

document.getElementById('future-image-input').addEventListener('change', async e => {
  const files = Array.from(e.target.files || []);
  if (!files.length) return;
  const room = MAX_FUTURE_MEDIA - futureMedia.length;
  if (room <= 0) { toast(`Maximum ${MAX_FUTURE_MEDIA} médias (photos + vidéos).`); e.target.value = ''; return; }
  const toProcess = files.slice(0, room);
  if (files.length > room) toast(`Seuls les ${room} premiers médias ont été ajoutés (maximum ${MAX_FUTURE_MEDIA}).`);
  toast('Optimisation des photos…');
  for (const file of toProcess) {
    try {
      const compressed = await compressImage(file, 1600, 0.82);
      futureMedia.push({ type: 'image', src: compressed });
    } catch (err) { toast(err.message); }
  }
  renderFutureGalleryGrid();
  e.target.value = '';
});

document.getElementById('future-add-video-btn').addEventListener('click', () => {
  const url = document.getElementById('future-video-url').value.trim();
  if (!url) { toast('Renseigne un lien vidéo.'); return; }
  if (!/^https?:\/\//i.test(url)) { toast('Le lien vidéo doit commencer par http:// ou https://.'); return; }
  if (futureMedia.length >= MAX_FUTURE_MEDIA) { toast(`Maximum ${MAX_FUTURE_MEDIA} médias (photos + vidéos).`); return; }
  futureMedia.push({ type: 'video', src: url });
  document.getElementById('future-video-url').value = '';
  renderFutureGalleryGrid();
});

function renderFuturePollOptions() {
  const container = document.getElementById('future-poll-options');
  container.innerHTML = futurePollOptions.map((opt, i) => `
    <div class="poll-option-row">
      <input type="text" value="${escapeHtml(opt)}" data-poll-opt-input="${i}" placeholder="Option ${i + 1}">
      <button type="button" class="link-btn danger" data-remove-poll-opt="${i}">&times;</button>
    </div>
  `).join('');
  container.querySelectorAll('[data-poll-opt-input]').forEach(input => {
    input.addEventListener('input', () => {
      futurePollOptions[parseInt(input.dataset.pollOptInput, 10)] = input.value;
    });
  });
  container.querySelectorAll('[data-remove-poll-opt]').forEach(btn => {
    btn.addEventListener('click', () => {
      futurePollOptions.splice(parseInt(btn.dataset.removePollOpt, 10), 1);
      renderFuturePollOptions();
    });
  });
}
renderFuturePollOptions();

document.getElementById('future-add-option-btn').addEventListener('click', () => {
  if (futurePollOptions.length >= MAX_POLL_OPTIONS) { toast(`Maximum ${MAX_POLL_OPTIONS} options par sondage.`); return; }
  futurePollOptions.push('');
  renderFuturePollOptions();
});

function resetFutureForm() {
  editingFutureId = null;
  futureMedia = [];
  futurePollOptions = [];
  document.getElementById('future-title').value = '';
  document.getElementById('future-desc').value = '';
  document.getElementById('future-poll-question').value = '';
  document.getElementById('future-video-url').value = '';
  renderFutureGalleryGrid();
  renderFuturePollOptions();
  document.getElementById('future-form-heading').textContent = 'Ajouter un prochain projet';
  document.getElementById('future-save-btn').textContent = 'Ajouter le projet';
  document.getElementById('future-cancel-edit').classList.add('hidden');
  const errorEl = document.getElementById('future-error');
  errorEl.style.display = 'none';
  errorEl.textContent = '';
}

document.getElementById('future-save-btn').addEventListener('click', async () => {
  const title = document.getElementById('future-title').value.trim();
  const description = document.getElementById('future-desc').value.trim();
  const pollQuestion = document.getElementById('future-poll-question').value.trim();
  const errorEl = document.getElementById('future-error');
  errorEl.style.display = 'none';

  if (!title || !description) {
    errorEl.textContent = 'Titre et description requis.';
    errorEl.style.display = 'block';
    return;
  }
  const cleanPollOptions = futurePollOptions.map(o => o.trim()).filter(Boolean);
  if (pollQuestion && cleanPollOptions.length < 2) {
    errorEl.textContent = 'Un sondage doit avoir au moins 2 options.';
    errorEl.style.display = 'block';
    return;
  }

  const payload = {
    title, description,
    media: futureMedia,
    pollQuestion,
    pollOptions: pollQuestion ? cleanPollOptions : []
  };

  try {
    if (editingFutureId) {
      const updated = await api('/future-projects/' + editingFutureId, { method: 'PUT', body: JSON.stringify(payload) });
      futureProjects = futureProjects.map(p => p.id === updated.id ? updated : p);
      toast('Prochain projet mis à jour.');
    } else {
      const created = await api('/future-projects', { method: 'POST', body: JSON.stringify(payload) });
      futureProjects.unshift(created);
      toast('Prochain projet ajouté.');
    }
    resetFutureForm();
    renderFutureProjects();
  } catch (e) {
    errorEl.textContent = e.message;
    errorEl.style.display = 'block';
  }
});
document.getElementById('future-cancel-edit').addEventListener('click', resetFutureForm);

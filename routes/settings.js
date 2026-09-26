const express = require('express');
const { pool } = require('../db');
const { requireAuth } = require('../middleware/auth');
const { MAX_SHORT, MAX_MEDIUM, MAX_LONG, trimTo, isSafeUrl, isValidImage } = require('../utils/validate');

const router = express.Router();

function validateSettingsPayload(body) {
  const data = {
    name: trimTo(body.name, MAX_SHORT) || 'ARIORI ADNEL',
    role: trimTo(body.role, MAX_SHORT),
    bio: trimTo(body.bio, MAX_MEDIUM),
    aboutTitle: trimTo(body.aboutTitle, MAX_SHORT),
    about: trimTo(body.about, MAX_LONG),
    badges: trimTo(body.badges, MAX_SHORT),
    email: trimTo(body.email, MAX_SHORT),
    whatsapp: trimTo(body.whatsapp, 30).replace(/[^0-9]/g, ''),
    location: trimTo(body.location, MAX_SHORT),
    github: trimTo(body.github, 500),
    linkedin: trimTo(body.linkedin, 500),
    youtube: trimTo(body.youtube, 500),
    instagram: trimTo(body.instagram, 500),
    tiktok: trimTo(body.tiktok, 500),
    photo: typeof body.photo === 'string' ? body.photo : null
  };

  if (data.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) {
    return { error: 'Adresse email invalide.' };
  }
  for (const key of ['github', 'linkedin', 'youtube', 'instagram', 'tiktok']) {
    if (!isSafeUrl(data[key])) return { error: `Le lien ${key} doit commencer par http:// ou https://.` };
  }
  if (!isValidImage(data.photo)) return { error: "Photo invalide ou trop volumineuse (2,5 Mo max)." };

  return { value: data };
}

router.get('/', async (req, res) => {
  try {
    const result = await pool.query('SELECT data FROM settings WHERE id = 1');
    res.set('Cache-Control', 'private, max-age=300');
    res.json(result.rows[0] ? result.rows[0].data : {});
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Erreur serveur.' });
  }
});

router.put('/', requireAuth, async (req, res) => {
  const { error, value } = validateSettingsPayload(req.body || {});
  if (error) return res.status(400).json({ error });
  try {
    await pool.query('UPDATE settings SET data = $1 WHERE id = 1', [value]);
    res.json({ ok: true, data: value });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Erreur serveur.' });
  }
});

module.exports = router;

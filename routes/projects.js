const express = require('express');
const { pool } = require('../db');
const { requireAuth } = require('../middleware/auth');
const { MAX_SHORT, MAX_MEDIUM, trimTo, isSafeUrl, validateImagesArray } = require('../utils/validate');

const router = express.Router();

function validateProjectPayload(body) {
  const title = trimTo(body.title, MAX_SHORT);
  const description = trimTo(body.description, MAX_MEDIUM);
  const category = trimTo(body.category, MAX_SHORT);
  const technologies = trimTo(body.technologies, MAX_SHORT);
  const link = trimTo(body.link, 500);
  const github = trimTo(body.github, 500);

  if (!title || !description) return { error: 'Titre et description requis.' };
  if (!isSafeUrl(link)) return { error: 'Le lien du site doit commencer par http:// ou https://.' };
  if (!isSafeUrl(github)) return { error: 'Le lien GitHub doit commencer par http:// ou https://.' };

  const imagesResult = validateImagesArray(body.images);
  if (imagesResult.error) return { error: imagesResult.error };

  return {
    value: {
      title, description, category, technologies, link, github,
      images: imagesResult.value,
      image: imagesResult.value[0] || null // conservé pour compatibilité (vignette rapide)
    }
  };
}

router.get('/', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM projects ORDER BY created_at DESC');
    // Change rarement (ajout/édition côté admin) : cache navigateur court
    // pour éviter de retélécharger toutes les photos en base64 à chaque
    // navigation dans le site pendant les 2 minutes qui suivent.
    res.set('Cache-Control', 'private, max-age=120');
    res.json(result.rows);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Erreur serveur.' });
  }
});

router.post('/', requireAuth, async (req, res) => {
  const { error, value } = validateProjectPayload(req.body || {});
  if (error) return res.status(400).json({ error });
  try {
    const result = await pool.query(
      `INSERT INTO projects (title, description, category, technologies, link, github, image, images)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [value.title, value.description, value.category || null, value.technologies || null,
        value.link || null, value.github || null, value.image, JSON.stringify(value.images)]
    );
    res.status(201).json(result.rows[0]);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Erreur serveur.' });
  }
});

router.put('/:id', requireAuth, async (req, res) => {
  if (!/^\d+$/.test(req.params.id)) return res.status(400).json({ error: 'Identifiant invalide.' });
  const { error, value } = validateProjectPayload(req.body || {});
  if (error) return res.status(400).json({ error });
  try {
    const result = await pool.query(
      `UPDATE projects SET title=$1, description=$2, category=$3, technologies=$4,
       link=$5, github=$6, image=$7, images=$8, updated_at=now() WHERE id=$9 RETURNING *`,
      [value.title, value.description, value.category || null, value.technologies || null,
        value.link || null, value.github || null, value.image, JSON.stringify(value.images), req.params.id]
    );
    if (result.rowCount === 0) return res.status(404).json({ error: 'Projet introuvable.' });
    res.json(result.rows[0]);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Erreur serveur.' });
  }
});

router.delete('/:id', requireAuth, async (req, res) => {
  if (!/^\d+$/.test(req.params.id)) return res.status(400).json({ error: 'Identifiant invalide.' });
  try {
    await pool.query('DELETE FROM projects WHERE id=$1', [req.params.id]);
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Erreur serveur.' });
  }
});

module.exports = router;

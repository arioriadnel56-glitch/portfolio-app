const express = require('express');
const { pool } = require('../db');
const { requireAuth } = require('../middleware/auth');
const { MAX_SHORT, MAX_MESSAGE, trimTo } = require('../utils/validate');

const router = express.Router();

router.get('/', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM reviews ORDER BY created_at DESC');
    res.set('Cache-Control', 'private, max-age=120');
    res.json(result.rows);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Erreur serveur.' });
  }
});

router.post('/', async (req, res) => {
  const name = trimTo((req.body || {}).name, MAX_SHORT);
  const message = trimTo((req.body || {}).message, MAX_MESSAGE);
  const rawRating = (req.body || {}).rating;

  if (!name || !message) {
    return res.status(400).json({ error: 'Nom et message requis.' });
  }
  const safeRating = Math.max(1, Math.min(5, parseInt(rawRating, 10) || 5));
  try {
    const result = await pool.query(
      'INSERT INTO reviews (name, rating, message) VALUES ($1,$2,$3) RETURNING *',
      [name, safeRating, message]
    );
    res.status(201).json(result.rows[0]);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Erreur serveur.' });
  }
});

router.delete('/:id', requireAuth, async (req, res) => {
  if (!/^\d+$/.test(req.params.id)) return res.status(400).json({ error: 'Identifiant invalide.' });
  try {
    await pool.query('DELETE FROM reviews WHERE id=$1', [req.params.id]);
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Erreur serveur.' });
  }
});

module.exports = router;

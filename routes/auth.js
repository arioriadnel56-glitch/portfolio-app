const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { pool } = require('../db');
const { requireAuth } = require('../middleware/auth');
const { ADMIN_COOKIE_NAME, ADMIN_COOKIE_OPTIONS, ADMIN_COOKIE_CLEAR_OPTIONS } = require('../utils/cookies');

const router = express.Router();

router.post('/login', async (req, res) => {
  const { password } = req.body || {};
  if (!password || typeof password !== 'string') {
    return res.status(400).json({ error: 'Mot de passe requis.' });
  }
  if (password.length > 200) {
    return res.status(400).json({ error: 'Mot de passe incorrect.' });
  }

  try {
    const result = await pool.query('SELECT password_hash FROM admin ORDER BY id LIMIT 1');
    if (result.rowCount === 0) {
      return res.status(500).json({ error: "Aucun compte admin n'est configuré." });
    }
    const match = await bcrypt.compare(password, result.rows[0].password_hash);
    if (!match) return res.status(401).json({ error: 'Mot de passe incorrect.' });

    const token = jwt.sign({ admin: true }, process.env.JWT_SECRET, { expiresIn: '30d' });
    res.cookie(ADMIN_COOKIE_NAME, token, ADMIN_COOKIE_OPTIONS);
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Erreur serveur.' });
  }
});

router.post('/logout', (req, res) => {
  res.clearCookie(ADMIN_COOKIE_NAME, ADMIN_COOKIE_CLEAR_OPTIONS);
  res.json({ ok: true });
});

router.get('/me', requireAuth, (req, res) => {
  res.json({ admin: true });
});

router.put('/password', requireAuth, async (req, res) => {
  const { newPassword } = req.body || {};
  if (!newPassword || typeof newPassword !== 'string' || newPassword.length < 8) {
    return res.status(400).json({ error: 'Le mot de passe doit contenir au moins 8 caractères.' });
  }
  if (newPassword.length > 200) {
    return res.status(400).json({ error: 'Mot de passe trop long.' });
  }
  try {
    const hash = await bcrypt.hash(newPassword, 10);
    await pool.query('UPDATE admin SET password_hash = $1 WHERE id = (SELECT id FROM admin ORDER BY id LIMIT 1)', [hash]);
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Erreur serveur.' });
  }
});

module.exports = router;

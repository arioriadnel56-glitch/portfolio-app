const express = require('express');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { pool } = require('../db');
const { trimTo } = require('../utils/validate');

const router = express.Router();

const VISITOR_COOKIE = 'visitor_id';
const VISITOR_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: true,
  sameSite: 'lax',
  maxAge: 365 * 24 * 60 * 60 * 1000 // 1 an
};

function classifyDevice(userAgent) {
  const ua = (userAgent || '').toLowerCase();
  if (/ipad|tablet|(android(?!.*mobile))/.test(ua)) return 'Tablette';
  if (/mobile|iphone|android/.test(ua)) return 'Mobile';
  return 'Ordinateur';
}

function isAdminRequest(req) {
  const token = req.cookies && req.cookies.admin_session;
  if (!token) return false;
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    return !!payload.admin;
  } catch (e) {
    return false;
  }
}

router.post('/', async (req, res) => {
  // On ne compte pas les visites du propriétaire du site connecté en admin,
  // pour ne pas fausser les statistiques.
  if (isAdminRequest(req)) return res.json({ ok: true, tracked: false });

  let visitorId = req.cookies && req.cookies[VISITOR_COOKIE];
  if (!visitorId) {
    visitorId = crypto.randomUUID();
    res.cookie(VISITOR_COOKIE, visitorId, VISITOR_COOKIE_OPTIONS);
  }

  const path = trimTo((req.body || {}).path, 300) || '/';
  const referrer = trimTo((req.body || {}).referrer, 300);
  const device = classifyDevice(req.headers['user-agent']);

  try {
    await pool.query(
      'INSERT INTO page_views (path, referrer, device, visitor_id) VALUES ($1,$2,$3,$4)',
      [path, referrer || null, device, visitorId]
    );
    res.json({ ok: true, tracked: true });
  } catch (e) {
    console.error(e);
    // Une erreur de tracking ne doit jamais gêner la navigation du visiteur.
    res.json({ ok: false });
  }
});

module.exports = router;

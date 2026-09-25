const jwt = require('jsonwebtoken');
const { ADMIN_COOKIE_NAME } = require('../utils/cookies');

function requireAuth(req, res, next) {
  const token = req.cookies && req.cookies[ADMIN_COOKIE_NAME];
  if (!token) {
    return res.status(401).json({ error: 'Authentification requise.' });
  }
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    if (!payload.admin) throw new Error('invalid token');
    req.admin = true;
    next();
  } catch (e) {
    return res.status(401).json({ error: 'Session invalide ou expirée, reconnecte-toi.' });
  }
}

module.exports = { requireAuth };

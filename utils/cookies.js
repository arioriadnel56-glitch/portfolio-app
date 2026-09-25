// Constantes partagées pour le cookie de session admin, utilisées à la fois
// par la connexion par mot de passe et par la connexion par passkey — pour
// être certain que les deux méthodes produisent exactement la même session.

const ADMIN_COOKIE_NAME = 'admin_session';

const ADMIN_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: true,
  sameSite: 'strict',
  maxAge: 30 * 24 * 60 * 60 * 1000 // 30 jours
};

const ADMIN_COOKIE_CLEAR_OPTIONS = {
  httpOnly: true,
  secure: true,
  sameSite: 'strict'
};

module.exports = { ADMIN_COOKIE_NAME, ADMIN_COOKIE_OPTIONS, ADMIN_COOKIE_CLEAR_OPTIONS };

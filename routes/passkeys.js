const express = require('express');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse
} = require('@simplewebauthn/server');
const { pool } = require('../db');
const { requireAuth } = require('../middleware/auth');
const { getRpConfig } = require('../utils/webauthn');
const { ADMIN_COOKIE_NAME, ADMIN_COOKIE_OPTIONS, ADMIN_COOKIE_CLEAR_OPTIONS } = require('../utils/cookies');

const router = express.Router();

const CHALLENGE_COOKIE = 'webauthn_challenge';
const CHALLENGE_COOKIE_OPTIONS = { httpOnly: true, secure: true, sameSite: 'strict', maxAge: 2 * 60 * 1000 };
const CHALLENGE_COOKIE_CLEAR_OPTIONS = { httpOnly: true, secure: true, sameSite: 'strict' };

async function getAdminWebauthnUserId() {
  const result = await pool.query('SELECT id, webauthn_user_id FROM admin ORDER BY id LIMIT 1');
  if (result.rowCount === 0) throw new Error('Aucun compte admin.');
  let row = result.rows[0];
  if (!row.webauthn_user_id) {
    const generated = crypto.randomBytes(32).toString('hex');
    await pool.query('UPDATE admin SET webauthn_user_id = $1 WHERE id = $2', [generated, row.id]);
    row.webauthn_user_id = generated;
  }
  return row.webauthn_user_id;
}

// Indique publiquement si au moins un appareil est enregistré, pour que la
// page n'affiche le bouton "Se connecter avec Face ID / empreinte" que
// lorsque c'est réellement utilisable.
router.get('/available', async (req, res) => {
  try {
    const result = await pool.query('SELECT COUNT(*)::int AS count FROM passkeys');
    res.json({ available: result.rows[0].count > 0 });
  } catch (e) {
    res.json({ available: false });
  }
});

router.get('/list', requireAuth, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, label, device_type, created_at FROM passkeys ORDER BY created_at DESC'
    );
    res.json(result.rows);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Erreur serveur.' });
  }
});

router.delete('/:id', requireAuth, async (req, res) => {
  if (!/^\d+$/.test(req.params.id)) return res.status(400).json({ error: 'Identifiant invalide.' });
  try {
    await pool.query('DELETE FROM passkeys WHERE id=$1', [req.params.id]);
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Erreur serveur.' });
  }
});

// --- Enregistrement d'un nouvel appareil (nécessite d'être déjà connecté) ---

router.post('/register-options', requireAuth, async (req, res) => {
  const rp = getRpConfig();
  if (!rp) return res.status(500).json({ error: "RP_ID et ORIGIN ne sont pas configurés sur le serveur." });

  try {
    const webauthnUserId = await getAdminWebauthnUserId();
    const existing = await pool.query('SELECT credential_id, transports FROM passkeys');

    const options = await generateRegistrationOptions({
      rpName: rp.rpName,
      rpID: rp.rpID,
      userID: Buffer.from(webauthnUserId, 'hex'),
      userName: 'Admin',
      attestationType: 'none',
      excludeCredentials: existing.rows.map((r) => ({
        id: r.credential_id,
        transports: r.transports ? r.transports.split(',') : undefined
      })),
      authenticatorSelection: {
        residentKey: 'preferred',
        userVerification: 'preferred',
        authenticatorAttachment: 'platform' // privilégie Face ID / Touch ID / Windows Hello
      }
    });

    res.cookie(CHALLENGE_COOKIE, options.challenge, CHALLENGE_COOKIE_OPTIONS);
    res.json({ options });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Impossible de générer les options d'enregistrement." });
  }
});

router.post('/register-verify', requireAuth, async (req, res) => {
  const rp = getRpConfig();
  if (!rp) return res.status(500).json({ error: "RP_ID et ORIGIN ne sont pas configurés sur le serveur." });

  const challenge = req.cookies && req.cookies[CHALLENGE_COOKIE];
  if (!challenge) return res.status(400).json({ error: "Session d'enregistrement expirée, réessaie." });

  const { response, label } = req.body || {};

  try {
    const verification = await verifyRegistrationResponse({
      response,
      expectedChallenge: challenge,
      expectedOrigin: rp.origin,
      expectedRPID: rp.rpID
    });

    res.clearCookie(CHALLENGE_COOKIE, CHALLENGE_COOKIE_CLEAR_OPTIONS);

    if (!verification.verified || !verification.registrationInfo) {
      return res.status(400).json({ error: 'Vérification échouée.' });
    }

    const info = verification.registrationInfo;
    const credential = info.credential; // forme de @simplewebauthn/server v9
    const credentialId = credential.id; // chaîne base64url
    const publicKey = Buffer.from(credential.publicKey).toString('base64url');
    const counter = credential.counter || 0;
    const transports = (response.response && response.response.transports)
      ? response.response.transports.join(',')
      : null;
    const safeLabel = (label || '').toString().trim().slice(0, 100) || 'Appareil';

    await pool.query(
      `INSERT INTO passkeys (credential_id, public_key, counter, device_type, backed_up, transports, label)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [credentialId, publicKey, counter, info.credentialDeviceType || null, !!info.credentialBackedUp, transports, safeLabel]
    );

    res.status(201).json({ ok: true });
  } catch (e) {
    console.error(e);
    res.clearCookie(CHALLENGE_COOKIE, CHALLENGE_COOKIE_CLEAR_OPTIONS);
    res.status(400).json({ error: "Impossible d'enregistrer cet appareil." });
  }
});

// --- Connexion avec un appareil déjà enregistré (public) ---

router.post('/login-options', async (req, res) => {
  const rp = getRpConfig();
  if (!rp) return res.status(500).json({ error: "RP_ID et ORIGIN ne sont pas configurés sur le serveur." });

  try {
    const existing = await pool.query('SELECT credential_id, transports FROM passkeys');
    if (existing.rowCount === 0) {
      return res.status(400).json({ error: 'Aucun appareil enregistré.' });
    }

    const options = await generateAuthenticationOptions({
      rpID: rp.rpID,
      userVerification: 'preferred',
      allowCredentials: existing.rows.map((r) => ({
        id: r.credential_id,
        transports: r.transports ? r.transports.split(',') : undefined
      }))
    });

    res.cookie(CHALLENGE_COOKIE, options.challenge, CHALLENGE_COOKIE_OPTIONS);
    res.json({ options });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Impossible de générer les options de connexion.' });
  }
});

router.post('/login-verify', async (req, res) => {
  const rp = getRpConfig();
  if (!rp) return res.status(500).json({ error: "RP_ID et ORIGIN ne sont pas configurés sur le serveur." });

  const challenge = req.cookies && req.cookies[CHALLENGE_COOKIE];
  if (!challenge) return res.status(400).json({ error: 'Session de connexion expirée, réessaie.' });

  const { response } = req.body || {};
  if (!response || !response.id) return res.status(400).json({ error: 'Réponse invalide.' });

  try {
    const stored = await pool.query('SELECT * FROM passkeys WHERE credential_id=$1', [response.id]);
    if (stored.rowCount === 0) {
      res.clearCookie(CHALLENGE_COOKIE, CHALLENGE_COOKIE_CLEAR_OPTIONS);
      return res.status(401).json({ error: 'Appareil non reconnu.' });
    }
    const row = stored.rows[0];

    const verification = await verifyAuthenticationResponse({
      response,
      expectedChallenge: challenge,
      expectedOrigin: rp.origin,
      expectedRPID: rp.rpID,
      credential: {
        id: row.credential_id,
        publicKey: Buffer.from(row.public_key, 'base64url'),
        counter: Number(row.counter),
        transports: row.transports ? row.transports.split(',') : undefined
      }
    });

    res.clearCookie(CHALLENGE_COOKIE, CHALLENGE_COOKIE_CLEAR_OPTIONS);

    if (!verification.verified) {
      return res.status(401).json({ error: 'Vérification échouée.' });
    }

    await pool.query('UPDATE passkeys SET counter=$1 WHERE id=$2', [verification.authenticationInfo.newCounter, row.id]);

    const token = jwt.sign({ admin: true }, process.env.JWT_SECRET, { expiresIn: '30d' });
    res.cookie(ADMIN_COOKIE_NAME, token, ADMIN_COOKIE_OPTIONS);
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.clearCookie(CHALLENGE_COOKIE, CHALLENGE_COOKIE_CLEAR_OPTIONS);
    res.status(401).json({ error: 'Connexion par passkey échouée.' });
  }
});

module.exports = router;

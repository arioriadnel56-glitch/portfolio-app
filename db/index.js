const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const defaultSettings = require('./default-settings');

if (!process.env.DATABASE_URL) {
  console.error('ERREUR: la variable d\'environnement DATABASE_URL est manquante.');
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL && process.env.DATABASE_URL.includes('localhost')
    ? false
    : { rejectUnauthorized: false }
});

async function init() {
  const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  await pool.query(schema);

  // Seed de l'admin (mot de passe par défaut, changeable ensuite depuis l'espace admin)
  const adminRes = await pool.query('SELECT id FROM admin LIMIT 1');
  if (adminRes.rowCount === 0) {
    const defaultPassword = process.env.ADMIN_PASSWORD || 'admin2026';
    const hash = await bcrypt.hash(defaultPassword, 10);
    await pool.query('INSERT INTO admin (password_hash) VALUES ($1)', [hash]);
    console.log('Compte admin initialisé avec le mot de passe par défaut (ADMIN_PASSWORD).');
  }

  // Identifiant WebAuthn stable de l'admin (nécessaire pour les passkeys),
  // généré une seule fois s'il n'existe pas encore.
  const webauthnRes = await pool.query('SELECT id, webauthn_user_id FROM admin ORDER BY id LIMIT 1');
  if (webauthnRes.rowCount > 0 && !webauthnRes.rows[0].webauthn_user_id) {
    const generated = crypto.randomBytes(32).toString('hex');
    await pool.query('UPDATE admin SET webauthn_user_id = $1 WHERE id = $2', [generated, webauthnRes.rows[0].id]);
  }

  // Seed des paramètres du site (contenu public éditable)
  const settingsRes = await pool.query('SELECT id FROM settings WHERE id = 1');
  if (settingsRes.rowCount === 0) {
    await pool.query('INSERT INTO settings (id, data) VALUES (1, $1)', [defaultSettings]);
    console.log('Paramètres du site initialisés avec les valeurs par défaut.');
  }

  // Migration : les projets créés avant l'ajout des galeries multi-photos
  // n'avaient qu'une seule image dans la colonne "image" — on la reprend
  // dans le nouveau tableau "images" si celui-ci est encore vide.
  await pool.query(`
    UPDATE projects
    SET images = jsonb_build_array(image)
    WHERE image IS NOT NULL AND images = '[]'::jsonb
  `);
}

module.exports = { pool, init };

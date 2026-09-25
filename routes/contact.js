const express = require('express');
const { pool } = require('../db');
const { MAX_SHORT, MAX_MEDIUM, trimTo, isValidEmail } = require('../utils/validate');

const router = express.Router();

const PROJECT_TYPES = [
  'Site vitrine', 'Landing page', 'E-commerce', 'Interface web',
  'Dashboard', 'Refonte de site', 'Autre'
];

function escapeHtmlForEmail(str) {
  return String(str).replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
}

router.post('/', async (req, res) => {
  const body = req.body || {};
  const name = trimTo(body.name, MAX_SHORT);
  const email = trimTo(body.email, MAX_SHORT);
  const whatsapp = trimTo(body.whatsapp, 40);
  const projectType = PROJECT_TYPES.includes(body.projectType) ? body.projectType : 'Autre';
  const budget = trimTo(body.budget, MAX_SHORT);
  const description = trimTo(body.description, MAX_MEDIUM);

  if (!name || !isValidEmail(email) || !description) {
    return res.status(400).json({ error: 'Nom, email valide et description requis.' });
  }

  if (!process.env.RESEND_API_KEY) {
    console.error("RESEND_API_KEY manquant : impossible d'envoyer l'email de contact.");
    return res.status(503).json({
      error: "L'envoi d'email n'est pas encore configuré sur ce site.",
      fallbackToMailto: true
    });
  }

  try {
    const settingsResult = await pool.query('SELECT data FROM settings WHERE id = 1');
    const ownerEmail = (settingsResult.rows[0] && settingsResult.rows[0].data.email) || process.env.CONTACT_TO_EMAIL;
    if (!ownerEmail) {
      return res.status(500).json({ error: "Aucune adresse de destination configurée.", fallbackToMailto: true });
    }

    const fromAddress = process.env.CONTACT_FROM_EMAIL || 'Portfolio <onboarding@resend.dev>';

    const html = `
      <h2>Nouvelle demande de projet</h2>
      <p><strong>Nom :</strong> ${escapeHtmlForEmail(name)}</p>
      <p><strong>Email :</strong> ${escapeHtmlForEmail(email)}</p>
      <p><strong>WhatsApp :</strong> ${escapeHtmlForEmail(whatsapp || 'Non renseigné')}</p>
      <p><strong>Type de projet :</strong> ${escapeHtmlForEmail(projectType)}</p>
      <p><strong>Budget estimatif :</strong> ${escapeHtmlForEmail(budget || 'Non renseigné')}</p>
      <p><strong>Description :</strong></p>
      <p>${escapeHtmlForEmail(description).replace(/\n/g, '<br>')}</p>
    `;

    const resendRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: fromAddress,
        to: [ownerEmail],
        reply_to: email,
        subject: `Nouvelle demande de projet — ${name}`,
        html
      })
    });

    if (!resendRes.ok) {
      const errText = await resendRes.text();
      console.error('Erreur Resend :', resendRes.status, errText);
      return res.status(502).json({ error: "Échec de l'envoi de l'email.", fallbackToMailto: true });
    }

    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Erreur serveur.', fallbackToMailto: true });
  }
});

module.exports = router;

// Lit la configuration nécessaire à WebAuthn depuis les variables
// d'environnement. RP_ID doit être le domaine exact du site déployé (sans
// protocole, ex: "mon-portfolio.onrender.com") et ORIGIN l'URL complète
// (ex: "https://mon-portfolio.onrender.com", sans slash final).
// Ces deux valeurs doivent correspondre EXACTEMENT à l'URL réelle du site,
// sinon les passkeys ne fonctionneront pas (c'est une exigence de sécurité
// du standard WebAuthn, pas une limite de ce code).

function getRpConfig() {
  const rpID = process.env.RP_ID;
  const origin = process.env.ORIGIN;
  if (!rpID || !origin) return null;
  return { rpID, rpName: 'Portfolio Adnel', origin };
}

module.exports = { getRpConfig };

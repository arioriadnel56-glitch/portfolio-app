require('dotenv').config();
const express = require('express');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const rateLimit = require('express-rate-limit');
const path = require('path');
const { init } = require('./db');

const authRoutes = require('./routes/auth');
const settingsRoutes = require('./routes/settings');
const projectsRoutes = require('./routes/projects');
const reviewsRoutes = require('./routes/reviews');
const contactRoutes = require('./routes/contact');
const trackRoutes = require('./routes/track');
const statsRoutes = require('./routes/stats');
const passkeysRoutes = require('./routes/passkeys');

const app = express();

// L'app tourne derrière le proxy/load-balancer de Render : nécessaire pour
// que les cookies "secure" et la détection HTTPS fonctionnent correctement.
app.set('trust proxy', 1);
app.disable('x-powered-by');

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
      fontSrc: ["'self'", 'https://fonts.gstatic.com'],
      imgSrc: ["'self'", 'data:'],
      connectSrc: ["'self'"],
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
      frameAncestors: ["'self'"]
    }
  }
}));

app.use(cookieParser());
app.use(express.json({ limit: '30mb' })); // galeries de plusieurs photos en base64 : borné mais généreux

// Pas de middleware CORS : le frontend et l'API sont servis depuis le même
// domaine, donc aucune requête cross-origin n'a besoin d'être autorisée.
// Ça évite d'exposer l'API à n'importe quel site tiers.

// Anti-brute-force sur la connexion admin
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Trop de tentatives. Réessaie dans quelques minutes.' }
});
app.use('/api/auth/login', loginLimiter);

// Anti-spam sur la publication d'avis publics
const reviewLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Trop d'avis envoyés depuis cette connexion. Réessaie plus tard." }
});
app.use('/api/reviews', (req, res, next) => (req.method === 'POST' ? reviewLimiter(req, res, next) : next()));

// Anti-spam sur le formulaire de contact
const contactLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Trop de messages envoyés depuis cette connexion. Réessaie plus tard.' }
});
app.use('/api/contact', contactLimiter);

// Limite générale raisonnable sur le reste de l'API
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 300,
  standardHeaders: true,
  legacyHeaders: false
});
app.use('/api', apiLimiter);

app.use('/api/auth', authRoutes);
app.use('/api/auth/passkey/login-options', loginLimiter);
app.use('/api/auth/passkey/login-verify', loginLimiter);
app.use('/api/auth/passkey', passkeysRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/projects', projectsRoutes);
app.use('/api/reviews', reviewsRoutes);
app.use('/api/contact', contactRoutes);
app.use('/api/track', trackRoutes);
app.use('/api/stats', statsRoutes);

// URL secrète d'accès admin (optionnelle) : si la variable d'environnement
// ADMIN_ACCESS_PATH est définie (ex: "x7k2-priv-adnel"), visiter
// https://tonsite/x7k2-priv-adnel ouvre automatiquement la fenêtre de
// connexion admin. Le chemin n'apparaît dans aucun fichier envoyé au
// navigateur : seul le serveur le connaît, via cette variable d'environnement.
// Pratique sur mobile (pas de clavier) : ajoute cette URL à l'écran d'accueil
// pour y accéder en un tap. Le tap x7 sur le copyright et Ctrl+Alt+A restent
// disponibles en secours, sans configuration.
const ADMIN_ACCESS_PATH = process.env.ADMIN_ACCESS_PATH
  ? process.env.ADMIN_ACCESS_PATH.replace(/^\/+/, '')
  : null;
if (ADMIN_ACCESS_PATH) {
  app.get('/' + ADMIN_ACCESS_PATH, (req, res) => {
    // Cookie très court (10s), lu une seule fois par le JS public au
    // chargement pour ouvrir la fenêtre de connexion, puis auto-expiré.
    res.cookie('open_admin', '1', { maxAge: 10000, httpOnly: false, sameSite: 'Strict' });
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
  });
}

app.use(express.static(path.join(__dirname, 'public')));
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const PORT = process.env.PORT || 3000;

if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 16) {
  console.error(
    "ERREUR: JWT_SECRET est manquant ou trop court. Définis une valeur longue " +
    "et aléatoire dans les variables d'environnement avant de démarrer en production."
  );
  process.exit(1);
}

init()
  .then(() => {
    app.listen(PORT, () => console.log(`Portfolio en ligne sur le port ${PORT}`));
  })
  .catch((e) => {
    console.error('Échec de l\'initialisation de la base de données :', e);
    process.exit(1);
  });

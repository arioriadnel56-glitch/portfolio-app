// Petites fonctions de validation réutilisées par les routes.
// Objectif : ne jamais faire confiance aux données envoyées par le client.

const MAX_IMAGE_CHARS = 3_500_000; // ~2.5 Mo en base64, large mais borné
const MAX_IMAGES_PER_PROJECT = 8;
const MAX_SHORT = 200;   // titres, noms, rôle...
const MAX_MEDIUM = 3000; // descriptions, bio
const MAX_LONG = 8000;   // texte "à propos"
const MAX_MESSAGE = 2000; // message d'avis

function trimTo(value, max) {
  if (typeof value !== 'string') return '';
  return value.trim().slice(0, max);
}

function isSafeUrl(value) {
  if (!value) return true; // champ optionnel vide = ok
  return /^https?:\/\//i.test(value.trim());
}

function isValidImage(value) {
  if (!value) return true; // pas d'image = ok
  if (typeof value !== 'string') return false;
  if (value.length > MAX_IMAGE_CHARS) return false;
  // Liste blanche stricte : exclut volontairement image/svg+xml, qui peut
  // contenir du JavaScript embarqué.
  return /^data:image\/(jpeg|jpg|png|webp);base64,/i.test(value);
}

function validateImagesArray(value) {
  if (value === undefined || value === null) return { value: [] };
  if (!Array.isArray(value)) return { error: 'Format de galerie invalide.' };
  if (value.length > MAX_IMAGES_PER_PROJECT) {
    return { error: `Maximum ${MAX_IMAGES_PER_PROJECT} photos par projet.` };
  }
  for (const img of value) {
    if (!isValidImage(img)) return { error: 'Une des images est invalide ou trop volumineuse (2,5 Mo max).' };
  }
  return { value: value.filter(Boolean) };
}

function isValidEmail(value) {
  if (!value) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

module.exports = {
  MAX_SHORT, MAX_MEDIUM, MAX_LONG, MAX_MESSAGE, MAX_IMAGE_CHARS, MAX_IMAGES_PER_PROJECT,
  trimTo, isSafeUrl, isValidImage, isValidEmail, validateImagesArray
};

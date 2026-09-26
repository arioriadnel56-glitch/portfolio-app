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

const MAX_FUTURE_MEDIA = 6;
const MAX_POLL_OPTIONS = 6;

// Valide le tableau "media" d'un prochain projet : chaque élément est
// { type: 'image'|'video', src }. Une image doit être une data URL valide
// (comme pour les projets classiques) ; une vidéo doit être un lien http(s).
function validateMediaArray(value) {
  if (value === undefined || value === null) return { value: [] };
  if (!Array.isArray(value)) return { error: 'Format des médias invalide.' };
  if (value.length > MAX_FUTURE_MEDIA) {
    return { error: `Maximum ${MAX_FUTURE_MEDIA} médias (photos + vidéos).` };
  }
  const cleaned = [];
  for (const item of value) {
    if (!item || typeof item !== 'object') return { error: 'Un média est invalide.' };
    if (item.type === 'image') {
      if (!isValidImage(item.src)) return { error: 'Une des photos est invalide ou trop volumineuse (2,5 Mo max).' };
      cleaned.push({ type: 'image', src: item.src });
    } else if (item.type === 'video') {
      if (!isSafeUrl(item.src)) return { error: 'Le lien vidéo doit commencer par http:// ou https://.' };
      cleaned.push({ type: 'video', src: trimTo(item.src, 500) });
    } else {
      return { error: 'Type de média invalide.' };
    }
  }
  return { value: cleaned };
}

// Valide les options d'un sondage optionnel. Si la question est vide,
// aucun sondage n'est attaché au projet.
function validatePollPayload(question, options) {
  const cleanQuestion = trimTo(question, MAX_SHORT);
  if (!cleanQuestion) return { value: { question: '', options: [] } };
  if (!Array.isArray(options)) return { error: 'Format des options du sondage invalide.' };
  const cleanOptions = options.map(o => trimTo(o, MAX_SHORT)).filter(Boolean);
  if (cleanOptions.length < 2) return { error: 'Un sondage doit avoir au moins 2 options.' };
  if (cleanOptions.length > MAX_POLL_OPTIONS) return { error: `Maximum ${MAX_POLL_OPTIONS} options par sondage.` };
  return { value: { question: cleanQuestion, options: cleanOptions } };
}

module.exports = {
  MAX_SHORT, MAX_MEDIUM, MAX_LONG, MAX_MESSAGE, MAX_IMAGE_CHARS, MAX_IMAGES_PER_PROJECT,
  MAX_FUTURE_MEDIA, MAX_POLL_OPTIONS,
  trimTo, isSafeUrl, isValidImage, isValidEmail, validateImagesArray, validateMediaArray, validatePollPayload
};

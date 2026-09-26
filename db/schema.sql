CREATE TABLE IF NOT EXISTS admin (
  id SERIAL PRIMARY KEY,
  password_hash TEXT NOT NULL
);

-- Ajouté séparément (ALTER) pour fonctionner même sur une base où la table
-- "admin" existe déjà depuis avant l'ajout des passkeys.
ALTER TABLE admin ADD COLUMN IF NOT EXISTS webauthn_user_id TEXT;

CREATE TABLE IF NOT EXISTS settings (
  id INT PRIMARY KEY DEFAULT 1,
  data JSONB NOT NULL,
  CONSTRAINT settings_single_row CHECK (id = 1)
);

CREATE TABLE IF NOT EXISTS projects (
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  category TEXT,
  technologies TEXT,
  link TEXT,
  github TEXT,
  image TEXT,
  images JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Ajouté séparément (ALTER) pour fonctionner même sur une base où la table
-- "projects" existait déjà avant l'ajout des galeries multi-photos.
ALTER TABLE projects ADD COLUMN IF NOT EXISTS images JSONB NOT NULL DEFAULT '[]'::jsonb;

CREATE TABLE IF NOT EXISTS reviews (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  rating INT NOT NULL DEFAULT 5,
  message TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS page_views (
  id SERIAL PRIMARY KEY,
  path TEXT NOT NULL,
  referrer TEXT,
  device TEXT,
  visitor_id TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_page_views_created_at ON page_views (created_at);
CREATE INDEX IF NOT EXISTS idx_page_views_visitor_id ON page_views (visitor_id);

-- Section "Prochains projets" (À venir) : projets pas encore publiés, avec
-- médias (photos + vidéos), sondage optionnel et compteur de likes.
CREATE TABLE IF NOT EXISTS future_projects (
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  media JSONB NOT NULL DEFAULT '[]'::jsonb,
  poll_question TEXT,
  poll_options JSONB NOT NULL DEFAULT '[]'::jsonb,
  poll_votes JSONB NOT NULL DEFAULT '[]'::jsonb,
  likes_count INT NOT NULL DEFAULT 0,
  dislikes_count INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Une ligne par visiteur (identifié par le cookie visitor_id) et par projet
-- à venir : empêche de liker/disliker ou voter plusieurs fois, et permet de
-- changer d'avis (réaction ou vote).
CREATE TABLE IF NOT EXISTS future_project_reactions (
  id SERIAL PRIMARY KEY,
  future_project_id INT NOT NULL REFERENCES future_projects(id) ON DELETE CASCADE,
  visitor_id TEXT NOT NULL,
  reaction TEXT CHECK (reaction IN ('like','dislike')),
  voted_option INT,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(future_project_id, visitor_id)
);

CREATE TABLE IF NOT EXISTS passkeys (
  id SERIAL PRIMARY KEY,
  credential_id TEXT NOT NULL UNIQUE,
  public_key TEXT NOT NULL,
  counter BIGINT NOT NULL DEFAULT 0,
  device_type TEXT,
  backed_up BOOLEAN DEFAULT false,
  transports TEXT,
  label TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

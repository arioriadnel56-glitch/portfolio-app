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

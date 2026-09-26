const express = require('express');
const crypto = require('crypto');
const { pool } = require('../db');
const { requireAuth } = require('../middleware/auth');
const { MAX_SHORT, MAX_MEDIUM, trimTo, validateMediaArray, validatePollPayload } = require('../utils/validate');

const router = express.Router();

// Même cookie visiteur que /api/track (nom partagé), pour identifier de
// façon anonyme qui a déjà liké ou voté, sans compte ni connexion.
const VISITOR_COOKIE = 'visitor_id';
const VISITOR_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: true,
  sameSite: 'lax',
  maxAge: 365 * 24 * 60 * 60 * 1000 // 1 an
};

function getOrSetVisitorId(req, res) {
  let visitorId = req.cookies && req.cookies[VISITOR_COOKIE];
  if (!visitorId) {
    visitorId = crypto.randomUUID();
    res.cookie(VISITOR_COOKIE, visitorId, VISITOR_COOKIE_OPTIONS);
  }
  return visitorId;
}

function validatePayload(body) {
  const title = trimTo(body.title, MAX_SHORT);
  const description = trimTo(body.description, MAX_MEDIUM);
  if (!title || !description) return { error: 'Titre et description requis.' };

  const mediaResult = validateMediaArray(body.media);
  if (mediaResult.error) return { error: mediaResult.error };

  const pollResult = validatePollPayload(body.pollQuestion, body.pollOptions);
  if (pollResult.error) return { error: pollResult.error };

  return {
    value: {
      title, description,
      media: mediaResult.value,
      pollQuestion: pollResult.value.question,
      pollOptions: pollResult.value.options
    }
  };
}

function shapeRow(row, visitorReaction) {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    media: row.media || [],
    pollQuestion: row.poll_question || '',
    pollOptions: row.poll_options || [],
    pollVotes: row.poll_votes || [],
    likesCount: row.likes_count || 0,
    dislikesCount: row.dislikes_count || 0,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    userReaction: (visitorReaction && visitorReaction.reaction) || null,
    userVotedOption: visitorReaction && visitorReaction.voted_option != null ? visitorReaction.voted_option : null
  };
}

// Liste publique — inclut, pour le visiteur courant, s'il a déjà liké /
// voté, afin que l'interface reflète correctement son état sans compte.
router.get('/', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM future_projects ORDER BY created_at DESC');
    const visitorId = req.cookies && req.cookies[VISITOR_COOKIE];
    let reactionsById = {};
    if (visitorId && result.rows.length) {
      const ids = result.rows.map(r => r.id);
      const reactions = await pool.query(
        'SELECT * FROM future_project_reactions WHERE visitor_id = $1 AND future_project_id = ANY($2::int[])',
        [visitorId, ids]
      );
      reactionsById = Object.fromEntries(reactions.rows.map(r => [r.future_project_id, r]));
    }
    res.json(result.rows.map(row => shapeRow(row, reactionsById[row.id])));
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Erreur serveur.' });
  }
});

router.post('/', requireAuth, async (req, res) => {
  const { error, value } = validatePayload(req.body || {});
  if (error) return res.status(400).json({ error });
  try {
    const result = await pool.query(
      `INSERT INTO future_projects (title, description, media, poll_question, poll_options, poll_votes)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [
        value.title, value.description, JSON.stringify(value.media),
        value.pollQuestion || null, JSON.stringify(value.pollOptions),
        JSON.stringify(value.pollOptions.map(() => 0))
      ]
    );
    res.status(201).json(shapeRow(result.rows[0]));
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Erreur serveur.' });
  }
});

router.put('/:id', requireAuth, async (req, res) => {
  if (!/^\d+$/.test(req.params.id)) return res.status(400).json({ error: 'Identifiant invalide.' });
  const { error, value } = validatePayload(req.body || {});
  if (error) return res.status(400).json({ error });
  try {
    // Si les options du sondage changent, on réinitialise les votes pour
    // éviter des compteurs incohérents avec les nouvelles options.
    const existing = await pool.query('SELECT poll_options FROM future_projects WHERE id=$1', [req.params.id]);
    if (existing.rowCount === 0) return res.status(404).json({ error: 'Projet introuvable.' });
    const sameOptions = JSON.stringify(existing.rows[0].poll_options || []) === JSON.stringify(value.pollOptions);
    const pollVotes = sameOptions ? undefined : value.pollOptions.map(() => 0);

    const result = await pool.query(
      `UPDATE future_projects SET title=$1, description=$2, media=$3, poll_question=$4,
       poll_options=$5, poll_votes=COALESCE($6, poll_votes), updated_at=now() WHERE id=$7 RETURNING *`,
      [
        value.title, value.description, JSON.stringify(value.media),
        value.pollQuestion || null, JSON.stringify(value.pollOptions),
        pollVotes ? JSON.stringify(pollVotes) : null,
        req.params.id
      ]
    );
    if (!sameOptions) {
      // Les anciens votes ne correspondent plus aux nouvelles options.
      await pool.query('DELETE FROM future_project_reactions WHERE future_project_id=$1', [req.params.id]);
    }
    res.json(shapeRow(result.rows[0]));
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Erreur serveur.' });
  }
});

router.delete('/:id', requireAuth, async (req, res) => {
  if (!/^\d+$/.test(req.params.id)) return res.status(400).json({ error: 'Identifiant invalide.' });
  try {
    await pool.query('DELETE FROM future_projects WHERE id=$1', [req.params.id]);
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Erreur serveur.' });
  }
});

// Like / dislike (mutuellement exclusifs, bascule au reclic) — un seul
// par visiteur anonyme (cookie), public. body: { type: 'like'|'dislike' }
router.post('/:id/react', async (req, res) => {
  if (!/^\d+$/.test(req.params.id)) return res.status(400).json({ error: 'Identifiant invalide.' });
  const type = req.body && req.body.type;
  if (type !== 'like' && type !== 'dislike') return res.status(400).json({ error: 'Réaction invalide.' });
  const visitorId = getOrSetVisitorId(req, res);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const existing = await client.query(
      'SELECT * FROM future_project_reactions WHERE future_project_id=$1 AND visitor_id=$2 FOR UPDATE',
      [req.params.id, visitorId]
    );
    const previous = existing.rowCount > 0 ? existing.rows[0].reaction : null;
    const next = previous === type ? null : type; // reclic = retrait

    let likeDelta = 0, dislikeDelta = 0;
    if (previous === 'like') likeDelta -= 1;
    if (previous === 'dislike') dislikeDelta -= 1;
    if (next === 'like') likeDelta += 1;
    if (next === 'dislike') dislikeDelta += 1;

    if (existing.rowCount > 0) {
      await client.query(
        'UPDATE future_project_reactions SET reaction=$1 WHERE future_project_id=$2 AND visitor_id=$3',
        [next, req.params.id, visitorId]
      );
    } else {
      await client.query(
        'INSERT INTO future_project_reactions (future_project_id, visitor_id, reaction) VALUES ($1,$2,$3)',
        [req.params.id, visitorId, next]
      );
    }
    const updated = await client.query(
      `UPDATE future_projects SET likes_count = GREATEST(0, likes_count + $1),
       dislikes_count = GREATEST(0, dislikes_count + $2) WHERE id=$3 RETURNING likes_count, dislikes_count`,
      [likeDelta, dislikeDelta, req.params.id]
    );
    if (updated.rowCount === 0) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Projet introuvable.' }); }
    await client.query('COMMIT');
    res.json({ likesCount: updated.rows[0].likes_count, dislikesCount: updated.rows[0].dislikes_count, userReaction: next });
  } catch (e) {
    await client.query('ROLLBACK');
    console.error(e);
    res.status(500).json({ error: 'Erreur serveur.' });
  } finally {
    client.release();
  }
});

// Vote au sondage — un vote par visiteur, modifiable (change d'avis).
router.post('/:id/vote', async (req, res) => {
  if (!/^\d+$/.test(req.params.id)) return res.status(400).json({ error: 'Identifiant invalide.' });
  const optionIndex = Number.isInteger(req.body && req.body.optionIndex) ? req.body.optionIndex : -1;
  const visitorId = getOrSetVisitorId(req, res);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const projectResult = await client.query('SELECT * FROM future_projects WHERE id=$1 FOR UPDATE', [req.params.id]);
    if (projectResult.rowCount === 0) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Projet introuvable.' }); }
    const project = projectResult.rows[0];
    const options = project.poll_options || [];
    if (!project.poll_question || optionIndex < 0 || optionIndex >= options.length) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Option de sondage invalide.' });
    }

    const votes = Array.isArray(project.poll_votes) && project.poll_votes.length === options.length
      ? [...project.poll_votes] : options.map(() => 0);

    const existing = await client.query(
      'SELECT * FROM future_project_reactions WHERE future_project_id=$1 AND visitor_id=$2 FOR UPDATE',
      [req.params.id, visitorId]
    );
    const previousOption = existing.rowCount > 0 ? existing.rows[0].voted_option : null;

    if (previousOption === optionIndex) {
      await client.query('COMMIT');
      return res.json({ pollVotes: votes, userVotedOption: optionIndex });
    }
    if (previousOption != null && previousOption >= 0 && previousOption < votes.length) {
      votes[previousOption] = Math.max(0, votes[previousOption] - 1);
    }
    votes[optionIndex] = (votes[optionIndex] || 0) + 1;

    if (existing.rowCount > 0) {
      await client.query(
        'UPDATE future_project_reactions SET voted_option=$1 WHERE future_project_id=$2 AND visitor_id=$3',
        [optionIndex, req.params.id, visitorId]
      );
    } else {
      await client.query(
        'INSERT INTO future_project_reactions (future_project_id, visitor_id, voted_option) VALUES ($1,$2,$3)',
        [req.params.id, visitorId, optionIndex]
      );
    }
    await client.query('UPDATE future_projects SET poll_votes=$1 WHERE id=$2', [JSON.stringify(votes), req.params.id]);
    await client.query('COMMIT');
    res.json({ pollVotes: votes, userVotedOption: optionIndex });
  } catch (e) {
    await client.query('ROLLBACK');
    console.error(e);
    res.status(500).json({ error: 'Erreur serveur.' });
  } finally {
    client.release();
  }
});

module.exports = router;

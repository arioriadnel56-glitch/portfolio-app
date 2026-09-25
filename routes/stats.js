const express = require('express');
const { pool } = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

router.get('/', requireAuth, async (req, res) => {
  try {
    const [total, unique, today, daily, pages, referrers, devices] = await Promise.all([
      pool.query('SELECT COUNT(*)::int AS count FROM page_views'),
      pool.query('SELECT COUNT(DISTINCT visitor_id)::int AS count FROM page_views'),
      pool.query("SELECT COUNT(*)::int AS count FROM page_views WHERE created_at >= date_trunc('day', now())"),
      pool.query(`
        SELECT date_trunc('day', created_at) AS day, COUNT(*)::int AS count
        FROM page_views
        WHERE created_at >= now() - interval '7 days'
        GROUP BY day ORDER BY day ASC
      `),
      pool.query(`
        SELECT path, COUNT(*)::int AS count FROM page_views
        GROUP BY path ORDER BY count DESC LIMIT 5
      `),
      pool.query(`
        SELECT referrer, COUNT(*)::int AS count FROM page_views
        WHERE referrer IS NOT NULL AND referrer != ''
        GROUP BY referrer ORDER BY count DESC LIMIT 5
      `),
      pool.query(`
        SELECT device, COUNT(*)::int AS count FROM page_views
        GROUP BY device ORDER BY count DESC
      `)
    ]);

    res.json({
      totalViews: total.rows[0].count,
      uniqueVisitors: unique.rows[0].count,
      viewsToday: today.rows[0].count,
      daily: daily.rows.map(r => ({ day: r.day, count: r.count })),
      topPages: pages.rows,
      topReferrers: referrers.rows,
      devices: devices.rows
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Erreur serveur.' });
  }
});

module.exports = router;

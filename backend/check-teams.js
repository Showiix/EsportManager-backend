const { Pool } = require('pg');
const pool = new Pool({
  host: 'localhost',
  port: 5432,
  user: 'postgres',
  password: 'aa1312134353',
  database: 'esports_simulator'
});

async function checkTeams() {
  const client = await pool.connect();
  try {
    const result = await client.query(`
      SELECT
        ct.*,
        t.name as team_name,
        t.region_id,
        r.name as region_name
      FROM competition_teams ct
      JOIN teams t ON ct.team_id = t.id
      LEFT JOIN regions r ON t.region_id = r.id
      WHERE ct.competition_id = 1
      LIMIT 5
    `);
    
    console.log('前5支队伍的数据结构:');
    result.rows.forEach((row, i) => {
      console.log(`\n队伍${i + 1}:`, {
        team_id: row.team_id,
        team_name: row.team_name,
        region_id: row.region_id,
        region_name: row.region_name
      });
    });
  } finally {
    client.release();
    await pool.end();
  }
}

checkTeams();

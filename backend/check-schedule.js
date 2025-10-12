const { Pool } = require('pg');
const pool = new Pool({
  host: 'localhost',
  port: 5432,
  user: 'postgres',
  password: 'aa1312134353',
  database: 'esports_simulator'
});

async function checkSchedule() {
  const client = await pool.connect();
  try {
    // 检查总比赛数
    const totalResult = await client.query(
      'SELECT COUNT(*) FROM matches WHERE competition_id = 1'
    );
    console.log(`总比赛数: ${totalResult.rows[0].count}`);
    
    // 检查最大轮次
    const maxRoundResult = await client.query(
      'SELECT MAX(round_number) as max_round FROM matches WHERE competition_id = 1'
    );
    console.log(`最大轮次: ${maxRoundResult.rows[0].max_round}`);
    
    // 检查最大matchNumber
    const maxMatchResult = await client.query(
      'SELECT MAX(match_number) as max_match FROM matches WHERE competition_id = 1'
    );
    console.log(`最大matchNumber: ${maxMatchResult.rows[0].max_match}`);
    
    // 按轮次统计比赛数
    const roundsResult = await client.query(
      `SELECT round_number, COUNT(*) as count 
       FROM matches 
       WHERE competition_id = 1 
       GROUP BY round_number 
       ORDER BY round_number 
       LIMIT 5`
    );
    console.log('\n前5轮比赛分布:');
    roundsResult.rows.forEach(row => {
      console.log(`  第${row.round_number}轮: ${row.count}场`);
    });
    
  } finally {
    client.release();
    await pool.end();
  }
}

checkSchedule();

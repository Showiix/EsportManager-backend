const { Pool } = require('pg');
const pool = new Pool({
  host: 'localhost',
  port: 5432,
  user: 'postgres',
  password: 'aa1312134353',
  database: 'esports_simulator'
});

async function checkCompetition() {
  const client = await pool.connect();
  try {
    const result = await client.query(
      'SELECT id, type, format, status FROM competitions WHERE id = 1'
    );
    const comp = result.rows[0];
    console.log('赛事ID:', comp.id);
    console.log('赛事类型:', comp.type);
    console.log('赛事状态:', comp.status);
    console.log('format配置:', JSON.stringify(comp.format, null, 2));
    console.log('\n判断条件:');
    console.log('  isRegularSeasonCompetition:', comp.type === 'spring' || comp.type === 'summer');
    console.log('  formatConfig.type:', comp.format?.type);
    console.log('  两者AND结果:', (comp.type === 'spring' || comp.type === 'summer') && comp.format?.type === 'league');
  } finally {
    client.release();
    await pool.end();
  }
}

checkCompetition();

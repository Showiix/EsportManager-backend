const { Pool } = require('pg');
const pool = new Pool({
  host: 'localhost',
  port: 5432,
  user: 'postgres',
  password: 'aa1312134353',
  database: 'esports_simulator'
});

async function checkTables() {
  const client = await pool.connect();
  try {
    const result = await client.query(`
      SELECT tablename FROM pg_tables 
      WHERE schemaname = 'public' 
      ORDER BY tablename
    `);
    console.log('数据库中的表:');
    result.rows.forEach(row => console.log('  -', row.tablename));
  } finally {
    client.release();
    await pool.end();
  }
}
checkTables();

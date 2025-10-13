// 查看季后赛数据
require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME || 'esport_manager',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
});

async function viewPlayoffData() {
  const client = await pool.connect();

  try {
    console.log('📊 查看季后赛数据...\n');

    // 1. 查看playoff_brackets表
    console.log('=== playoff_brackets 表 ===');
    const bracketsResult = await client.query(`
      SELECT
        id,
        competition_id,
        region_id,
        region_name,
        competition_type,
        status,
        created_at
      FROM playoff_brackets
      ORDER BY created_at DESC
    `);

    console.log(`总记录数: ${bracketsResult.rows.length}\n`);

    if (bracketsResult.rows.length > 0) {
      console.log('记录列表:');
      bracketsResult.rows.forEach((row, index) => {
        console.log(`${index + 1}. ID: ${row.id}`);
        console.log(`   赛区: ${row.region_name} (ID: ${row.region_id})`);
        console.log(`   赛事类型: ${row.competition_type}`);
        console.log(`   状态: ${row.status}`);
        console.log(`   创建时间: ${row.created_at}`);
        console.log('');
      });
    }

    // 2. 查看playoff_matches表
    console.log('\n=== playoff_matches 表 ===');
    const matchesResult = await client.query(`
      SELECT
        id,
        playoff_bracket_id,
        competition_id,
        round_number,
        match_type,
        team_a_name,
        team_b_name,
        status,
        winner_id
      FROM playoff_matches
      ORDER BY playoff_bracket_id, round_number
      LIMIT 20
    `);

    console.log(`总记录数: ${matchesResult.rows.length}\n`);

    if (matchesResult.rows.length > 0) {
      console.log('前20条记录:');
      matchesResult.rows.forEach((row, index) => {
        console.log(`${index + 1}. Bracket ID: ${row.playoff_bracket_id}`);
        console.log(`   比赛: ${row.team_a_name || 'TBD'} vs ${row.team_b_name || 'TBD'}`);
        console.log(`   轮次: ${row.round_number}, 类型: ${row.match_type}`);
        console.log(`   状态: ${row.status}`);
        console.log('');
      });
    }

    // 3. 查看常规赛数据（验证不会被删除）
    console.log('\n=== 常规赛数据验证 ===');
    const regularSeasonResult = await client.query(`
      SELECT
        c.id,
        c.type,
        c.status,
        COUNT(m.id) as match_count
      FROM competitions c
      LEFT JOIN matches m ON c.id = m.competition_id
      WHERE c.type IN ('spring', 'summer')
      GROUP BY c.id, c.type, c.status
      ORDER BY c.id
    `);

    console.log('常规赛赛事:');
    regularSeasonResult.rows.forEach((row) => {
      console.log(`- ${row.type}: ${row.match_count} 场比赛 (状态: ${row.status})`);
    });

    console.log('\n✅ 查询完成！');
    process.exit(0);
  } catch (error) {
    console.error('❌ 查询失败:', error);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

viewPlayoffData();

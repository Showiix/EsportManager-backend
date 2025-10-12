const { Pool } = require('pg');

const pool = new Pool({
  host: 'localhost',
  port: 5432,
  user: 'postgres',
  password: 'aa1312134353',
  database: 'esports_simulator'
});

async function clearData() {
  const client = await pool.connect();
  try {
    console.log('开始清除数据...\n');
    
    // 1. 删除季后赛相关数据
    const playoffMatchesResult = await client.query('DELETE FROM playoff_matches WHERE competition_id = 1');
    console.log(`✅ 删除季后赛比赛: ${playoffMatchesResult.rowCount} 条`);
    
    const playoffBracketsResult = await client.query('DELETE FROM playoff_brackets WHERE competition_id = 1');
    console.log(`✅ 删除季后赛对阵: ${playoffBracketsResult.rowCount} 条`);
    
    // 2. 删除对战记录（有外键约束）
    const h2hResult = await client.query(
      'DELETE FROM head_to_head_records WHERE last_match_id IN (SELECT id FROM matches WHERE competition_id = 1)'
    );
    console.log(`✅ 删除对战记录: ${h2hResult.rowCount} 条`);
    
    // 3. 删除成绩记录
    const scoreResult = await client.query('DELETE FROM score_records WHERE competition_id = 1');
    console.log(`✅ 删除成绩记录: ${scoreResult.rowCount} 条`);
    
    // 4. 删除比赛数据
    const matchesResult = await client.query('DELETE FROM matches WHERE competition_id = 1');
    console.log(`✅ 删除比赛: ${matchesResult.rowCount} 场`);
    
    // 5. 删除赛区积分榜
    const standingsResult = await client.query('DELETE FROM regional_standings WHERE competition_id = 1');
    console.log(`✅ 删除积分榜: ${standingsResult.rowCount} 条`);
    
    // 6. 重置赛事状态
    const updateResult = await client.query(
      "UPDATE competitions SET status = 'planning', updated_at = NOW() WHERE id = 1"
    );
    console.log(`✅ 重置赛事状态: ${updateResult.rowCount} 条记录`);
    
    // 7. 验证清空结果
    const checkResult = await client.query('SELECT COUNT(*) FROM matches WHERE competition_id = 1');
    console.log(`\n✅ 验证: 剩余比赛数 = ${checkResult.rows[0].count}`);
    
    console.log('\n🎉 数据清除完成！可以重新生成赛程了。');
  } catch (err) {
    console.error('❌ 清除数据失败:', err.message);
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

clearData();

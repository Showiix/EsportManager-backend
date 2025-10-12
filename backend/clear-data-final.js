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
    // 只需要完成剩余的步骤
    
    // 1. 删除赛区积分榜（检查正确的字段名）
    try {
      const standingsResult = await client.query('DELETE FROM regional_standings WHERE season_id = 1');
      console.log(`✅ 删除积分榜: ${standingsResult.rowCount} 条`);
    } catch (err) {
      console.log(`⚠️  积分榜清除跳过: ${err.message}`);
    }
    
    // 2. 重置赛事状态
    const updateResult = await client.query(
      "UPDATE competitions SET status = 'planning', updated_at = NOW() WHERE id = 1"
    );
    console.log(`✅ 重置赛事状态: ${updateResult.rowCount} 条记录`);
    
    // 3. 验证清空结果
    const checkResult = await client.query('SELECT COUNT(*) FROM matches WHERE competition_id = 1');
    console.log(`\n✅ 验证: 剩余比赛数 = ${checkResult.rows[0].count}`);
    
    console.log('\n🎉 数据清除完成！可以重新生成赛程了。');
  } catch (err) {
    console.error('❌ 清除数据失败:', err.message);
  } finally {
    client.release();
    await pool.end();
  }
}

clearData();

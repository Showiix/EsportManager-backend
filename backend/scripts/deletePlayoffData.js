// 备份并删除季后赛数据（保留常规赛数据）
require('dotenv').config();
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

// 数据库配置
const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME || 'esport_manager',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
});

console.log('数据库配置:', {
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || '5432',
  database: process.env.DB_NAME || 'esport_manager',
  user: process.env.DB_USER || 'postgres'
});

async function backupAndDeletePlayoffData() {
  const client = await pool.connect();
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
  const backupDir = path.join(__dirname, '../backups');

  try {
    // 创建备份目录
    if (!fs.existsSync(backupDir)) {
      fs.mkdirSync(backupDir, { recursive: true });
    }

    console.log('📦 开始备份夏季赛季后赛数据...');

    // 1. 备份夏季赛playoff_matches
    const matchesResult = await client.query(`
      SELECT pm.* FROM playoff_matches pm
      JOIN playoff_brackets pb ON pm.playoff_bracket_id = pb.id
      WHERE pb.competition_type = 'summer'
    `);
    const matchesBackupFile = path.join(backupDir, `playoff_matches_summer_${timestamp}.json`);
    fs.writeFileSync(matchesBackupFile, JSON.stringify(matchesResult.rows, null, 2));
    console.log(`✓ 备份了 ${matchesResult.rows.length} 条夏季赛季后赛比赛记录 → ${matchesBackupFile}`);

    // 2. 备份夏季赛playoff_brackets
    const bracketsResult = await client.query(`
      SELECT * FROM playoff_brackets WHERE competition_type = 'summer'
    `);
    const bracketsBackupFile = path.join(backupDir, `playoff_brackets_summer_${timestamp}.json`);
    fs.writeFileSync(bracketsBackupFile, JSON.stringify(bracketsResult.rows, null, 2));
    console.log(`✓ 备份了 ${bracketsResult.rows.length} 条夏季赛季后赛对阵记录 → ${bracketsBackupFile}`);

    console.log('\n🗑️  开始删除夏季赛季后赛数据...');

    await client.query('BEGIN');

    // 3. 先删除playoff_matches表中夏季赛的数据（通过bracket_id关联）
    const deleteMatchesResult = await client.query(`
      DELETE FROM playoff_matches
      WHERE playoff_bracket_id IN (
        SELECT id FROM playoff_brackets WHERE competition_type = 'summer'
      )
    `);
    console.log(`✓ 删除了 ${deleteMatchesResult.rowCount} 条夏季赛季后赛比赛记录`);

    // 4. 删除playoff_brackets表中夏季赛的数据
    const deleteBracketsResult = await client.query(`
      DELETE FROM playoff_brackets
      WHERE competition_type = 'summer'
    `);
    console.log(`✓ 删除了 ${deleteBracketsResult.rowCount} 条夏季赛季后赛对阵记录`);

    await client.query('COMMIT');

    console.log('\n✅ 操作完成！');
    console.log(`📂 备份文件保存在: ${backupDir}`);
    console.log('✓ 春季赛季后赛数据已保留');
    console.log('✓ 常规赛数据已保留');
    console.log('✓ 现在可以重新生成夏季赛季后赛');

    process.exit(0);
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ 操作失败:', error);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

backupAndDeletePlayoffData();

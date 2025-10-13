// 备份并删除季后赛数据（保留常规赛数据）
import { db } from '../src/config/database';
import * as fs from 'fs';
import * as path from 'path';

async function backupAndDeletePlayoffData() {
  const client = await db.getClient();
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
  const backupDir = path.join(__dirname, '../backups');

  try {
    // 创建备份目录
    if (!fs.existsSync(backupDir)) {
      fs.mkdirSync(backupDir, { recursive: true });
    }

    console.log('📦 开始备份季后赛数据...');

    // 1. 备份playoff_matches
    const matchesResult = await client.query(`SELECT * FROM playoff_matches`);
    const matchesBackupFile = path.join(backupDir, `playoff_matches_${timestamp}.json`);
    fs.writeFileSync(matchesBackupFile, JSON.stringify(matchesResult.rows, null, 2));
    console.log(`✓ 备份了 ${matchesResult.rows.length} 条季后赛比赛记录 → ${matchesBackupFile}`);

    // 2. 备份playoff_brackets
    const bracketsResult = await client.query(`SELECT * FROM playoff_brackets`);
    const bracketsBackupFile = path.join(backupDir, `playoff_brackets_${timestamp}.json`);
    fs.writeFileSync(bracketsBackupFile, JSON.stringify(bracketsResult.rows, null, 2));
    console.log(`✓ 备份了 ${bracketsResult.rows.length} 条季后赛对阵记录 → ${bracketsBackupFile}`);

    console.log('\n🗑️  开始删除季后赛数据...');

    await client.query('BEGIN');

    // 3. 删除playoff_matches表中的所有数据
    const deleteMatchesResult = await client.query(`DELETE FROM playoff_matches`);
    console.log(`✓ 删除了 ${deleteMatchesResult.rowCount} 条季后赛比赛记录`);

    // 4. 删除playoff_brackets表中的所有数据
    const deleteBracketsResult = await client.query(`DELETE FROM playoff_brackets`);
    console.log(`✓ 删除了 ${deleteBracketsResult.rowCount} 条季后赛对阵记录`);

    await client.query('COMMIT');

    console.log('\n✅ 操作完成！');
    console.log(`📂 备份文件保存在: ${backupDir}`);
    console.log('常规赛数据已保留，可以重新生成季后赛。');

    process.exit(0);
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ 操作失败:', error);
    process.exit(1);
  } finally {
    client.release();
  }
}

backupAndDeletePlayoffData();

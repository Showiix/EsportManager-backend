// 检查数据库现有表结构
import { db } from '../config/database';
import { logger } from '../utils/logger';

async function checkTables() {
  try {
    // 检查 seasons 表结构
    logger.info('📊 检查 seasons 表结构...');
    const seasonsColumns = await db.query(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'seasons'
      ORDER BY ordinal_position
    `);

    logger.info('Seasons 表字段:');
    seasonsColumns.rows.forEach(col => {
      logger.info(`  - ${col.column_name}: ${col.data_type} (nullable: ${col.is_nullable})`);
    });

    // 检查现有数据
    const seasonsData = await db.query(`SELECT * FROM seasons LIMIT 5`);
    logger.info(`\nSeasons 表数据 (${seasonsData.rowCount} 条):`);
    seasonsData.rows.forEach(row => {
      logger.info(`  - ${JSON.stringify(row)}`);
    });

    // 检查 competitions 表
    logger.info('\n📊 检查 competitions 表...');
    const competitionsCheck = await db.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_name = 'competitions'
      ) as exists
    `);

    if (competitionsCheck.rows[0].exists) {
      const competitionsColumns = await db.query(`
        SELECT column_name, data_type
        FROM information_schema.columns
        WHERE table_name = 'competitions'
        ORDER BY ordinal_position
      `);
      logger.info('Competitions 表字段:');
      competitionsColumns.rows.forEach(col => {
        logger.info(`  - ${col.column_name}: ${col.data_type}`);
      });

      const competitionsData = await db.query(`SELECT id, name, type, status FROM competitions LIMIT 5`);
      logger.info(`\nCompetitions 表数据 (${competitionsData.rowCount} 条):`);
      competitionsData.rows.forEach(row => {
        logger.info(`  - ${JSON.stringify(row)}`);
      });
    } else {
      logger.info('❌ competitions 表不存在');
    }

    process.exit(0);
  } catch (error) {
    logger.error('检查失败:', error);
    process.exit(1);
  }
}

checkTables();

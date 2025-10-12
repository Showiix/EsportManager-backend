// ===============================================
// 电竞赛事模拟系统 - MSI数据库表创建脚本
// ===============================================
// 运行方式: tsx src/scripts/create-msi-tables.ts
// ===============================================

import { db } from '../config/database';
import { logger } from '../utils/logger';
import * as fs from 'fs';
import * as path from 'path';

async function createMSITables() {
  try {
    logger.info('🚀 开始创建MSI数据库表...');

    // 读取SQL文件
    const sqlPath = path.join(__dirname, 'create-msi-tables.sql');
    const sql = fs.readFileSync(sqlPath, 'utf-8');

    // 执行SQL脚本
    await db.query(sql);

    logger.info('✅ MSI数据库表创建成功！');

    // 验证表是否创建成功
    const tablesResult = await db.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name IN ('msi_brackets', 'msi_matches')
      ORDER BY table_name
    `);

    logger.info('📋 创建的表:');
    tablesResult.rows.forEach(row => {
      logger.info(`  ✓ ${row.table_name}`);
    });

    // 检查索引
    const indexesResult = await db.query(`
      SELECT indexname
      FROM pg_indexes
      WHERE schemaname = 'public'
        AND tablename IN ('msi_brackets', 'msi_matches')
      ORDER BY indexname
    `);

    logger.info('📋 创建的索引:');
    indexesResult.rows.forEach(row => {
      logger.info(`  ✓ ${row.indexname}`);
    });

    logger.info('✅ MSI表创建完成！可以开始使用MSI API了。');
    process.exit(0);

  } catch (error: any) {
    logger.error('❌ MSI表创建失败:', error);
    logger.error('错误详情:', error.message);
    process.exit(1);
  }
}

// 运行脚本
createMSITables();

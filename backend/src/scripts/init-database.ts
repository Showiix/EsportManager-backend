// ===============================================
// 电竞赛事模拟系统 - 数据库初始化脚本
// ===============================================
// 运行方式: tsx src/scripts/init-database.ts
// ===============================================

import { db } from '../config/database';
import { logger } from '../utils/logger';

async function initDatabase() {
  try {
    logger.info('🚀 开始初始化数据库...');

    // 1. 创建 seasons 表
    logger.info('📝 创建 seasons 表...');
    await db.query(`
      CREATE TABLE IF NOT EXISTS seasons (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        year INTEGER NOT NULL,
        status VARCHAR(50) DEFAULT 'planned',
        current_stage VARCHAR(50) DEFAULT 'planned',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    logger.info('✅ seasons 表创建成功');

    // 2. 插入赛季数据
    logger.info('📝 插入赛季数据...');
    const seasonsResult = await db.query(`
      INSERT INTO seasons (name, year, status, current_stage) VALUES
        ('2024赛季', 2024, 'active', 'summer'),
        ('2025赛季', 2025, 'planned', 'planned')
      ON CONFLICT DO NOTHING
      RETURNING *
    `);
    logger.info(`✅ 插入了 ${seasonsResult.rowCount} 条赛季数据`);

    // 3. 创建 competitions 表
    logger.info('📝 创建 competitions 表...');
    await db.query(`
      CREATE TABLE IF NOT EXISTS competitions (
        id SERIAL PRIMARY KEY,
        season_id INTEGER REFERENCES seasons(id) ON DELETE CASCADE,
        type VARCHAR(50) NOT NULL,
        name VARCHAR(255) NOT NULL,
        format JSONB DEFAULT '{}',
        scoring_rules JSONB DEFAULT '{}',
        max_teams INTEGER DEFAULT 40,
        start_date DATE,
        end_date DATE,
        status VARCHAR(50) DEFAULT 'planned',
        description TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    logger.info('✅ competitions 表创建成功');

    // 4. 获取2024赛季ID
    const seasonResult = await db.query(`SELECT id FROM seasons WHERE year = 2024 LIMIT 1`);
    if (seasonResult.rows.length === 0) {
      throw new Error('未找到2024赛季');
    }
    const season2024Id = seasonResult.rows[0].id;

    // 5. 插入赛事数据
    logger.info('📝 插入赛事数据...');
    const competitionsData = [
      {
        season_id: season2024Id,
        type: 'spring',
        name: '2024春季赛',
        max_teams: 40,
        start_date: '2024-01-15',
        end_date: '2024-04-30',
        status: 'completed',
        description: '2024年春季常规赛'
      },
      {
        season_id: season2024Id,
        type: 'msi',
        name: '2024季中冠军赛',
        max_teams: 12,
        start_date: '2024-05-01',
        end_date: '2024-05-20',
        status: 'completed',
        description: '2024年MSI季中冠军赛'
      },
      {
        season_id: season2024Id,
        type: 'summer',
        name: '2024夏季赛',
        max_teams: 40,
        start_date: '2024-06-01',
        end_date: '2024-08-31',
        status: 'active',
        description: '2024年夏季常规赛'
      },
      {
        season_id: season2024Id,
        type: 'worlds',
        name: '2024全球总决赛',
        max_teams: 16,
        start_date: '2024-09-25',
        end_date: '2024-11-02',
        status: 'planned',
        description: '2024年全球总决赛'
      }
    ];

    let insertCount = 0;
    for (const comp of competitionsData) {
      const result = await db.query(`
        INSERT INTO competitions (season_id, type, name, max_teams, start_date, end_date, status, description)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        ON CONFLICT DO NOTHING
        RETURNING *
      `, [
        comp.season_id,
        comp.type,
        comp.name,
        comp.max_teams,
        comp.start_date,
        comp.end_date,
        comp.status,
        comp.description
      ]);
      if (result.rowCount > 0) insertCount++;
    }
    logger.info(`✅ 插入了 ${insertCount} 条赛事数据`);

    // 6. 创建 competition_teams 表
    logger.info('📝 创建 competition_teams 表...');
    await db.query(`
      CREATE TABLE IF NOT EXISTS competition_teams (
        id SERIAL PRIMARY KEY,
        competition_id INTEGER REFERENCES competitions(id) ON DELETE CASCADE,
        team_id INTEGER REFERENCES teams(id) ON DELETE CASCADE,
        seed INTEGER,
        group_name VARCHAR(50),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(competition_id, team_id)
      )
    `);
    logger.info('✅ competition_teams 表创建成功');

    // 7. 验证数据
    logger.info('📊 验证数据...');
    const seasonsCount = await db.query(`SELECT COUNT(*) as count FROM seasons`);
    const competitionsCount = await db.query(`SELECT COUNT(*) as count FROM competitions`);

    logger.info(`✅ Seasons 表记录数: ${seasonsCount.rows[0].count}`);
    logger.info(`✅ Competitions 表记录数: ${competitionsCount.rows[0].count}`);

    // 8. 显示创建的数据
    const seasons = await db.query(`SELECT id, name, year, status FROM seasons ORDER BY year`);
    logger.info('📋 赛季列表:');
    seasons.rows.forEach(s => {
      logger.info(`  - [${s.id}] ${s.name} (${s.year}) - ${s.status}`);
    });

    const competitions = await db.query(`SELECT id, name, type, status FROM competitions ORDER BY start_date`);
    logger.info('📋 赛事列表:');
    competitions.rows.forEach(c => {
      logger.info(`  - [${c.id}] ${c.name} (${c.type}) - ${c.status}`);
    });

    logger.info('✅ 数据库初始化完成！');
    process.exit(0);

  } catch (error) {
    logger.error('❌ 数据库初始化失败:', error);
    process.exit(1);
  }
}

// 运行初始化
initDatabase();

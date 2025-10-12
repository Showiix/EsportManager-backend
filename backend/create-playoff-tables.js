#!/usr/bin/env node

/**
 * 创建季后赛数据库表脚本
 */

const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

// 读取环境变量
require('dotenv').config({ path: path.join(__dirname, '.env') });

const pool = new Pool({
  host: 'localhost',
  port: 5432,
  user: 'postgres',
  password: 'aa1312134353',
  database: 'esports_simulator'
});

async function createPlayoffTables() {
  const client = await pool.connect();

  try {
    console.log('开始创建季后赛数据库表...\n');

    // 1. 创建 playoff_brackets 表
    console.log('1. 创建 playoff_brackets 表...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS playoff_brackets (
        id VARCHAR(36) PRIMARY KEY,
        competition_id INTEGER REFERENCES competitions(id) ON DELETE CASCADE,
        region_id INTEGER REFERENCES regions(id) ON DELETE CASCADE,
        region_name VARCHAR(100) NOT NULL,
        competition_type VARCHAR(20) NOT NULL,
        status VARCHAR(20) DEFAULT 'not_started',
        qualified_teams JSONB DEFAULT '[]',
        champion_id INTEGER,
        runner_up_id INTEGER,
        third_place_id INTEGER,
        fourth_place_id INTEGER,
        points_distribution JSONB DEFAULT '{"champion": 12, "runnerUp": 10, "thirdPlace": 8, "fourthPlace": 6}',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(competition_id, region_id)
      )
    `);
    console.log('✓ playoff_brackets 表创建成功\n');

    // 2. 创建 playoff_matches 表
    console.log('2. 创建 playoff_matches 表...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS playoff_matches (
        id VARCHAR(36) PRIMARY KEY,
        playoff_bracket_id VARCHAR(36) REFERENCES playoff_brackets(id) ON DELETE CASCADE,
        competition_id INTEGER REFERENCES competitions(id) ON DELETE CASCADE,
        round_number INTEGER NOT NULL,
        match_type VARCHAR(20) NOT NULL,
        best_of INTEGER DEFAULT 5,
        team_a_id INTEGER REFERENCES teams(id) ON DELETE SET NULL,
        team_b_id INTEGER REFERENCES teams(id) ON DELETE SET NULL,
        team_a_name VARCHAR(255),
        team_b_name VARCHAR(255),
        team_a_seed INTEGER,
        team_b_seed INTEGER,
        score_a INTEGER DEFAULT 0,
        score_b INTEGER DEFAULT 0,
        winner_id INTEGER REFERENCES teams(id) ON DELETE SET NULL,
        status VARCHAR(20) DEFAULT 'pending',
        next_match_id VARCHAR(36),
        loser_next_match_id VARCHAR(36),
        scheduled_at TIMESTAMP,
        completed_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('✓ playoff_matches 表创建成功\n');

    // 3. 创建索引
    console.log('3. 创建索引...');
    await client.query('CREATE INDEX IF NOT EXISTS idx_playoff_brackets_competition ON playoff_brackets(competition_id)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_playoff_brackets_region ON playoff_brackets(region_id)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_playoff_brackets_status ON playoff_brackets(status)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_playoff_matches_bracket ON playoff_matches(playoff_bracket_id)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_playoff_matches_competition ON playoff_matches(competition_id)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_playoff_matches_round ON playoff_matches(round_number)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_playoff_matches_status ON playoff_matches(status)');
    console.log('✓ 索引创建成功\n');

    // 4. 创建触发器
    console.log('4. 创建触发器...');
    await client.query(`
      CREATE OR REPLACE FUNCTION update_playoff_updated_at()
      RETURNS TRIGGER AS $$
      BEGIN
        NEW.updated_at = CURRENT_TIMESTAMP;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql
    `);

    await client.query(`
      DROP TRIGGER IF EXISTS update_playoff_brackets_updated_at ON playoff_brackets
    `);
    await client.query(`
      CREATE TRIGGER update_playoff_brackets_updated_at
      BEFORE UPDATE ON playoff_brackets
      FOR EACH ROW
      EXECUTE FUNCTION update_playoff_updated_at()
    `);

    await client.query(`
      DROP TRIGGER IF EXISTS update_playoff_matches_updated_at ON playoff_matches
    `);
    await client.query(`
      CREATE TRIGGER update_playoff_matches_updated_at
      BEFORE UPDATE ON playoff_matches
      FOR EACH ROW
      EXECUTE FUNCTION update_playoff_updated_at()
    `);
    console.log('✓ 触发器创建成功\n');

    // 5. 验证表
    console.log('5. 验证表创建...');
    const result1 = await client.query(`SELECT COUNT(*) FROM playoff_brackets`);
    const result2 = await client.query(`SELECT COUNT(*) FROM playoff_matches`);
    console.log(`✓ playoff_brackets 表记录数: ${result1.rows[0].count}`);
    console.log(`✓ playoff_matches 表记录数: ${result2.rows[0].count}\n`);

    console.log('✓ 季后赛数据库表创建完成!');
  } catch (error) {
    console.error('创建表失败:', error);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

// 执行
createPlayoffTables()
  .then(() => {
    console.log('\n✅ 脚本执行成功');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ 脚本执行失败:', error);
    process.exit(1);
  });

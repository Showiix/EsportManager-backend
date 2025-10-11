-- ===============================================
-- 电竞赛事模拟系统 - 数据库初始化脚本
-- ===============================================
-- 用途: 创建并初始化 seasons 和 competitions 表
-- 日期: 2025-10-11
-- ===============================================

-- 1. 创建 seasons 表（如果不存在）
CREATE TABLE IF NOT EXISTS seasons (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  year INTEGER NOT NULL,
  status VARCHAR(50) DEFAULT 'planned',
  current_stage VARCHAR(50) DEFAULT 'planned',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 2. 插入测试赛季数据
INSERT INTO seasons (name, year, status, current_stage) VALUES
  ('2024赛季', 2024, 'active', 'summer'),
  ('2025赛季', 2025, 'planned', 'planned')
ON CONFLICT DO NOTHING;

-- 3. 创建 competitions 表（如果不存在）
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
);

-- 4. 插入测试赛事数据
INSERT INTO competitions (season_id, type, name, max_teams, start_date, end_date, status, description)
SELECT
  s.id,
  'spring',
  '2024春季赛',
  40,
  '2024-01-15',
  '2024-04-30',
  'completed',
  '2024年春季常规赛'
FROM seasons s WHERE s.year = 2024
ON CONFLICT DO NOTHING;

INSERT INTO competitions (season_id, type, name, max_teams, start_date, end_date, status, description)
SELECT
  s.id,
  'msi',
  '2024季中冠军赛',
  12,
  '2024-05-01',
  '2024-05-20',
  'completed',
  '2024年MSI季中冠军赛'
FROM seasons s WHERE s.year = 2024
ON CONFLICT DO NOTHING;

INSERT INTO competitions (season_id, type, name, max_teams, start_date, end_date, status, description)
SELECT
  s.id,
  'summer',
  '2024夏季赛',
  40,
  '2024-06-01',
  '2024-08-31',
  'active',
  '2024年夏季常规赛'
FROM seasons s WHERE s.year = 2024
ON CONFLICT DO NOTHING;

INSERT INTO competitions (season_id, type, name, max_teams, start_date, end_date, status, description)
SELECT
  s.id,
  'worlds',
  '2024全球总决赛',
  16,
  '2024-09-25',
  '2024-11-02',
  'planned',
  '2024年全球总决赛'
FROM seasons s WHERE s.year = 2024
ON CONFLICT DO NOTHING;

-- 5. 创建 competition_teams 关联表（如果不存在）
CREATE TABLE IF NOT EXISTS competition_teams (
  id SERIAL PRIMARY KEY,
  competition_id INTEGER REFERENCES competitions(id) ON DELETE CASCADE,
  team_id INTEGER REFERENCES teams(id) ON DELETE CASCADE,
  seed INTEGER,
  group_name VARCHAR(50),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(competition_id, team_id)
);

-- 6. 验证数据
SELECT 'Seasons count: ' || COUNT(*) as result FROM seasons;
SELECT 'Competitions count: ' || COUNT(*) as result FROM competitions;

-- 7. 显示创建的数据
SELECT id, name, year, status FROM seasons ORDER BY year;
SELECT id, name, type, status, season_id FROM competitions ORDER BY start_date;

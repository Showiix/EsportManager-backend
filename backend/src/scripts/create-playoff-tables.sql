-- ===============================================
-- 电竞赛事模拟系统 - 季后赛数据库表创建脚本
-- ===============================================
-- 用途: 创建季后赛相关数据表
-- 日期: 2025-10-12
-- ===============================================

-- 1. 创建 playoff_brackets 表(季后赛对阵表)
CREATE TABLE IF NOT EXISTS playoff_brackets (
  id SERIAL PRIMARY KEY,
  competition_id INTEGER REFERENCES competitions(id) ON DELETE CASCADE,
  region_id INTEGER REFERENCES regions(id) ON DELETE CASCADE,
  region_name VARCHAR(100) NOT NULL,
  competition_type VARCHAR(20) NOT NULL, -- 'spring' 或 'summer'
  status VARCHAR(20) DEFAULT 'not_started', -- 'not_started', 'in_progress', 'completed'
  qualified_teams JSONB DEFAULT '[]', -- 晋级队伍信息JSON

  -- 最终排名(存储team_id)
  champion_id INTEGER,
  runner_up_id INTEGER,
  third_place_id INTEGER,
  fourth_place_id INTEGER,

  -- 积分分配规则
  points_distribution JSONB DEFAULT '{"champion": 12, "runnerUp": 10, "thirdPlace": 8, "fourthPlace": 6}',

  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  UNIQUE(competition_id, region_id)
);

-- 2. 创建 playoff_matches 表(季后赛比赛)
CREATE TABLE IF NOT EXISTS playoff_matches (
  id SERIAL PRIMARY KEY,
  playoff_bracket_id INTEGER REFERENCES playoff_brackets(id) ON DELETE CASCADE,
  competition_id INTEGER REFERENCES competitions(id) ON DELETE CASCADE,

  round_number INTEGER NOT NULL, -- 轮次号
  match_type VARCHAR(20) NOT NULL, -- 'winners_bracket', 'losers_bracket', 'grand_final'
  best_of INTEGER DEFAULT 5, -- BO5

  team_a_id INTEGER REFERENCES teams(id) ON DELETE SET NULL,
  team_b_id INTEGER REFERENCES teams(id) ON DELETE SET NULL,
  team_a_name VARCHAR(255),
  team_b_name VARCHAR(255),
  team_a_seed INTEGER,
  team_b_seed INTEGER,

  score_a INTEGER DEFAULT 0,
  score_b INTEGER DEFAULT 0,
  winner_id INTEGER REFERENCES teams(id) ON DELETE SET NULL,

  status VARCHAR(20) DEFAULT 'pending', -- 'pending', 'in_progress', 'completed'

  -- 胜败者去向
  next_match_id INTEGER, -- 胜者去向
  loser_next_match_id INTEGER, -- 败者去向

  scheduled_at TIMESTAMP,
  completed_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 3. 创建索引以提高查询性能
CREATE INDEX IF NOT EXISTS idx_playoff_brackets_competition ON playoff_brackets(competition_id);
CREATE INDEX IF NOT EXISTS idx_playoff_brackets_region ON playoff_brackets(region_id);
CREATE INDEX IF NOT EXISTS idx_playoff_brackets_status ON playoff_brackets(status);

CREATE INDEX IF NOT EXISTS idx_playoff_matches_bracket ON playoff_matches(playoff_bracket_id);
CREATE INDEX IF NOT EXISTS idx_playoff_matches_competition ON playoff_matches(competition_id);
CREATE INDEX IF NOT EXISTS idx_playoff_matches_round ON playoff_matches(round_number);
CREATE INDEX IF NOT EXISTS idx_playoff_matches_status ON playoff_matches(status);

-- 4. 创建触发器自动更新 updated_at
CREATE OR REPLACE FUNCTION update_playoff_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_playoff_brackets_updated_at
  BEFORE UPDATE ON playoff_brackets
  FOR EACH ROW
  EXECUTE FUNCTION update_playoff_updated_at();

CREATE TRIGGER update_playoff_matches_updated_at
  BEFORE UPDATE ON playoff_matches
  FOR EACH ROW
  EXECUTE FUNCTION update_playoff_updated_at();

-- 5. 显示创建结果
SELECT 'Playoff tables created successfully!' as result;
SELECT 'playoff_brackets count: ' || COUNT(*) FROM playoff_brackets;
SELECT 'playoff_matches count: ' || COUNT(*) FROM playoff_matches;

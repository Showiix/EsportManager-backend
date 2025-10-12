-- =================================================================
-- MSI季中赛数据库表创建脚本
-- =================================================================

-- 1. MSI对阵表 (msi_brackets)
CREATE TABLE IF NOT EXISTS msi_brackets (
  id SERIAL PRIMARY KEY,
  season_id INTEGER NOT NULL REFERENCES seasons(id) ON DELETE CASCADE,
  season_year INTEGER NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'not_started' CHECK (status IN ('not_started', 'in_progress', 'completed')),

  -- 参赛队伍数据 (JSON格式存储)
  qualified_teams JSONB NOT NULL, -- 12支队伍的完整信息
  legendary_group JSONB NOT NULL, -- 4支传奇组队伍
  challenger_group JSONB NOT NULL, -- 4支挑战者组队伍
  qualifier_group JSONB NOT NULL, -- 4支资格赛组队伍

  -- 最终排名 (队伍ID)
  champion_id INTEGER,
  runner_up_id INTEGER,
  third_place_id INTEGER,
  fourth_place_id INTEGER,

  -- 其他排名 (用于积分分配)
  loser_round_2 JSONB, -- 败者组第二轮淘汰的2队
  loser_round_1 JSONB, -- 败者组第一轮淘汰的2队

  -- 积分分配规则 (JSON格式)
  points_distribution JSONB NOT NULL DEFAULT '{
    "champion": 20,
    "runnerUp": 16,
    "thirdPlace": 12,
    "fourthPlace": 8,
    "loserRound2": 6,
    "loserRound1": 4
  }'::jsonb,

  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 2. MSI比赛表 (msi_matches)
CREATE TABLE IF NOT EXISTS msi_matches (
  id SERIAL PRIMARY KEY,
  msi_bracket_id INTEGER NOT NULL REFERENCES msi_brackets(id) ON DELETE CASCADE,

  -- 比赛基本信息
  round_number INTEGER NOT NULL,
  match_type VARCHAR(30) NOT NULL CHECK (match_type IN (
    'qualifier_knockout',
    'challenger_match',
    'losers_round_1',
    'losers_round_2',
    'winners_round_1',
    'losers_round_3',
    'losers_round_4',
    'winners_round_2',
    'losers_final',
    'grand_final'
  )),
  bracket_type VARCHAR(20) NOT NULL CHECK (bracket_type IN ('winners', 'losers', 'qualifier', 'challenger', 'grand_final')),
  best_of INTEGER NOT NULL DEFAULT 5,
  match_number INTEGER, -- 比赛编号，用于排序和显示

  -- 对阵队伍信息
  team_a_id INTEGER REFERENCES teams(id),
  team_b_id INTEGER REFERENCES teams(id),
  team_a_name VARCHAR(100),
  team_b_name VARCHAR(100),
  team_a_seed INTEGER, -- 种子位
  team_b_seed INTEGER, -- 种子位

  -- 比赛结果
  score_a INTEGER NOT NULL DEFAULT 0,
  score_b INTEGER NOT NULL DEFAULT 0,
  winner_id INTEGER REFERENCES teams(id),

  -- 比赛状态
  status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed')),

  -- 比赛去向 (双败淘汰需要两个去向)
  next_match_id INTEGER REFERENCES msi_matches(id), -- 胜者去向
  loser_next_match_id INTEGER REFERENCES msi_matches(id), -- 败者去向

  -- 时间信息
  scheduled_at TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 创建索引以提高查询性能
CREATE INDEX IF NOT EXISTS idx_msi_brackets_season ON msi_brackets(season_id);
CREATE INDEX IF NOT EXISTS idx_msi_brackets_status ON msi_brackets(status);
CREATE INDEX IF NOT EXISTS idx_msi_matches_bracket ON msi_matches(msi_bracket_id);
CREATE INDEX IF NOT EXISTS idx_msi_matches_status ON msi_matches(status);
CREATE INDEX IF NOT EXISTS idx_msi_matches_round ON msi_matches(msi_bracket_id, round_number);

-- 创建更新时间自动更新触发器
CREATE OR REPLACE FUNCTION update_msi_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_msi_brackets_updated_at
  BEFORE UPDATE ON msi_brackets
  FOR EACH ROW
  EXECUTE FUNCTION update_msi_updated_at();

CREATE TRIGGER trigger_msi_matches_updated_at
  BEFORE UPDATE ON msi_matches
  FOR EACH ROW
  EXECUTE FUNCTION update_msi_updated_at();

-- 添加注释
COMMENT ON TABLE msi_brackets IS 'MSI季中邀请赛对阵表';
COMMENT ON TABLE msi_matches IS 'MSI季中邀请赛比赛表';

COMMENT ON COLUMN msi_brackets.qualified_teams IS '12支参赛队伍的完整信息(JSON数组)';
COMMENT ON COLUMN msi_brackets.legendary_group IS '传奇组4队:各赛区春季赛冠军';
COMMENT ON COLUMN msi_brackets.challenger_group IS '挑战者组4队:各赛区春季赛亚军';
COMMENT ON COLUMN msi_brackets.qualifier_group IS '资格赛组4队:各赛区春季赛季军';
COMMENT ON COLUMN msi_brackets.points_distribution IS '积分分配规则(JSON对象)';

COMMENT ON COLUMN msi_matches.match_type IS '比赛类型:qualifier_knockout, challenger_match, losers_round_1-4, winners_round_1-2, losers_final, grand_final';
COMMENT ON COLUMN msi_matches.bracket_type IS '对阵组类型:winners, losers, qualifier, challenger, grand_final';
COMMENT ON COLUMN msi_matches.best_of IS 'BO几,MSI全部为BO5';
COMMENT ON COLUMN msi_matches.next_match_id IS '胜者进入的下一场比赛';
COMMENT ON COLUMN msi_matches.loser_next_match_id IS '败者进入的下一场比赛(双败淘汰特有)';

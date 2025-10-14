-- =================================================================
-- Clauch洲际赛数据库表创建脚本
-- =================================================================

-- 1. Clauch对阵表 (clauch_brackets)
CREATE TABLE IF NOT EXISTS clauch_brackets (
  id SERIAL PRIMARY KEY,
  season_id INTEGER NOT NULL REFERENCES seasons(id) ON DELETE CASCADE,
  season_year INTEGER NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'not_started' CHECK (status IN (
    'not_started',      -- 未开始
    'group_stage',      -- 小组赛进行中
    'knockout_stage',   -- 淘汰赛进行中
    'completed'         -- 已完成
  )),

  -- 当前阶段信息
  current_stage VARCHAR(20) DEFAULT 'group_stage',

  -- 最终排名 (队伍ID)
  champion_id INTEGER,
  runner_up_id INTEGER,
  third_place_id INTEGER,
  fourth_place_id INTEGER,

  -- 其他排名 (用于积分分配)
  east_final_losers JSONB, -- 东半区决赛败者(1队)
  west_final_losers JSONB, -- 西半区决赛败者(1队)
  east_semi_losers JSONB,  -- 东半区半决赛败者(2队)
  west_semi_losers JSONB,  -- 西半区半决赛败者(2队)
  east_round1_losers JSONB, -- 东半区第一轮败者(4队)
  west_round1_losers JSONB, -- 西半区第一轮败者(4队)

  -- 积分分配规则 (JSON格式)
  points_distribution JSONB NOT NULL DEFAULT '{
    "champion": 20,
    "runnerUp": 16,
    "thirdPlace": 12,
    "fourthPlace": 8,
    "eastFinalLoser": 6,
    "westFinalLoser": 6,
    "eastSemiLoser": 4,
    "westSemiLoser": 4,
    "eastRound1Loser": 2,
    "westRound1Loser": 2
  }'::jsonb,

  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 2. Clauch参赛资格表 (clauch_qualifications)
CREATE TABLE IF NOT EXISTS clauch_qualifications (
  id SERIAL PRIMARY KEY,
  clauch_bracket_id INTEGER NOT NULL REFERENCES clauch_brackets(id) ON DELETE CASCADE,
  team_id INTEGER NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  region_id INTEGER NOT NULL REFERENCES regions(id) ON DELETE CASCADE,

  -- 参赛资格信息
  summer_regular_rank INTEGER NOT NULL, -- 夏季赛常规赛排名(1-8)
  summer_regular_points INTEGER, -- 夏季赛常规赛积分
  
  -- 小组分配
  group_name CHAR(1) NOT NULL CHECK (group_name IN ('A', 'B', 'C', 'D', 'E', 'F', 'G', 'H')),
  
  -- 淘汰赛半区 (小组赛晋级后分配)
  knockout_bracket VARCHAR(10) CHECK (knockout_bracket IN ('east', 'west')),
  qualified_to_knockout BOOLEAN DEFAULT false, -- 是否晋级淘汰赛
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 3. Clauch比赛表 (clauch_matches)
CREATE TABLE IF NOT EXISTS clauch_matches (
  id SERIAL PRIMARY KEY,
  clauch_bracket_id INTEGER NOT NULL REFERENCES clauch_brackets(id) ON DELETE CASCADE,

  -- 比赛阶段
  stage VARCHAR(20) NOT NULL CHECK (stage IN ('group_stage', 'knockout')),
  
  -- 小组赛信息
  group_name CHAR(1) CHECK (group_name IN ('A', 'B', 'C', 'D', 'E', 'F', 'G', 'H')),
  round_in_group INTEGER, -- 小组内第几轮
  
  -- 淘汰赛信息
  knockout_bracket VARCHAR(10) CHECK (knockout_bracket IN ('east', 'west')),
  knockout_round VARCHAR(30) CHECK (knockout_round IN (
    'east_round1',      -- 东半区第一轮(4场)
    'west_round1',      -- 西半区第一轮(4场)
    'east_semi',        -- 东半区半决赛(2场)
    'west_semi',        -- 西半区半决赛(2场)
    'east_final',       -- 东半区决赛(1场)
    'west_final',       -- 西半区决赛(1场)
    'third_place',      -- 季军赛(1场)
    'grand_final'       -- 总决赛(1场)
  )),
  match_number INTEGER, -- 该轮次内的比赛编号

  -- 对阵队伍信息
  team_a_id INTEGER REFERENCES teams(id),
  team_b_id INTEGER REFERENCES teams(id),
  team_a_name VARCHAR(100),
  team_b_name VARCHAR(100),

  -- 比赛制式
  best_of INTEGER NOT NULL, -- 3 (小组赛) 或 5 (淘汰赛)

  -- 比赛结果
  score_a INTEGER NOT NULL DEFAULT 0,
  score_b INTEGER NOT NULL DEFAULT 0,
  winner_id INTEGER REFERENCES teams(id),

  -- 比赛状态
  status VARCHAR(20) NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'in_progress', 'completed')),

  -- 时间信息
  scheduled_at TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 4. Clauch小组积分榜 (clauch_group_standings)
CREATE TABLE IF NOT EXISTS clauch_group_standings (
  id SERIAL PRIMARY KEY,
  clauch_bracket_id INTEGER NOT NULL REFERENCES clauch_brackets(id) ON DELETE CASCADE,
  team_id INTEGER NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  group_name CHAR(1) NOT NULL CHECK (group_name IN ('A', 'B', 'C', 'D', 'E', 'F', 'G', 'H')),

  -- 小组赛战绩
  matches_played INTEGER NOT NULL DEFAULT 0,
  wins INTEGER NOT NULL DEFAULT 0,
  losses INTEGER NOT NULL DEFAULT 0,
  
  -- 小组赛积分 (2:0=3分, 2:1=2分, 1:2=1分, 0:2=0分)
  points INTEGER NOT NULL DEFAULT 0,
  
  -- 小局得失分
  rounds_won INTEGER NOT NULL DEFAULT 0, -- 赢的小局数
  rounds_lost INTEGER NOT NULL DEFAULT 0, -- 输的小局数
  round_differential INTEGER NOT NULL DEFAULT 0, -- 小局净胜数

  -- 排名信息
  position INTEGER, -- 小组内排名
  qualified BOOLEAN DEFAULT false, -- 是否晋级淘汰赛

  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,

  -- 唯一约束: 每个小组每个队伍只有一条记录
  UNIQUE(clauch_bracket_id, team_id)
);

-- 创建索引以提高查询性能
CREATE INDEX IF NOT EXISTS idx_clauch_brackets_season ON clauch_brackets(season_id);
CREATE INDEX IF NOT EXISTS idx_clauch_brackets_status ON clauch_brackets(status);

CREATE INDEX IF NOT EXISTS idx_clauch_qualifications_bracket ON clauch_qualifications(clauch_bracket_id);
CREATE INDEX IF NOT EXISTS idx_clauch_qualifications_team ON clauch_qualifications(team_id);
CREATE INDEX IF NOT EXISTS idx_clauch_qualifications_group ON clauch_qualifications(clauch_bracket_id, group_name);

CREATE INDEX IF NOT EXISTS idx_clauch_matches_bracket ON clauch_matches(clauch_bracket_id);
CREATE INDEX IF NOT EXISTS idx_clauch_matches_stage ON clauch_matches(clauch_bracket_id, stage);
CREATE INDEX IF NOT EXISTS idx_clauch_matches_group ON clauch_matches(clauch_bracket_id, group_name);
CREATE INDEX IF NOT EXISTS idx_clauch_matches_knockout ON clauch_matches(clauch_bracket_id, knockout_bracket);
CREATE INDEX IF NOT EXISTS idx_clauch_matches_status ON clauch_matches(status);

CREATE INDEX IF NOT EXISTS idx_clauch_standings_bracket ON clauch_group_standings(clauch_bracket_id);
CREATE INDEX IF NOT EXISTS idx_clauch_standings_group ON clauch_group_standings(clauch_bracket_id, group_name);

-- 创建更新时间自动更新触发器
CREATE OR REPLACE FUNCTION update_clauch_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_clauch_brackets_updated_at
  BEFORE UPDATE ON clauch_brackets
  FOR EACH ROW
  EXECUTE FUNCTION update_clauch_updated_at();

CREATE TRIGGER trigger_clauch_matches_updated_at
  BEFORE UPDATE ON clauch_matches
  FOR EACH ROW
  EXECUTE FUNCTION update_clauch_updated_at();

CREATE TRIGGER trigger_clauch_standings_updated_at
  BEFORE UPDATE ON clauch_group_standings
  FOR EACH ROW
  EXECUTE FUNCTION update_clauch_updated_at();

-- 添加注释
COMMENT ON TABLE clauch_brackets IS 'Clauch洲际赛对阵表';
COMMENT ON TABLE clauch_qualifications IS 'Clauch洲际赛参赛资格表 - 32支队伍(每赛区前8名)';
COMMENT ON TABLE clauch_matches IS 'Clauch洲际赛比赛表 - 包含小组赛和淘汰赛';
COMMENT ON TABLE clauch_group_standings IS 'Clauch洲际赛小组积分榜 - 8个小组(A-H)';

COMMENT ON COLUMN clauch_brackets.status IS '赛事状态: not_started, group_stage, knockout_stage, completed';
COMMENT ON COLUMN clauch_brackets.points_distribution IS '积分分配规则(JSON对象): 冠20, 亚16, 季12, 殿8, 东西决赛败者6, 东西半决赛败者4, 东西第一轮败者2';

COMMENT ON COLUMN clauch_qualifications.summer_regular_rank IS '夏季赛常规赛排名(1-8), 用于确定参赛资格';
COMMENT ON COLUMN clauch_qualifications.group_name IS '小组名称(A-H), 32队分8组, 每组4队';
COMMENT ON COLUMN clauch_qualifications.knockout_bracket IS '淘汰赛半区(east/west), 小组前2名晋级, 共16队分两半区';

COMMENT ON COLUMN clauch_matches.stage IS '比赛阶段: group_stage(小组赛BO3), knockout(淘汰赛BO5)';
COMMENT ON COLUMN clauch_matches.knockout_round IS '淘汰赛轮次: east/west_round1/semi/final, third_place, grand_final';
COMMENT ON COLUMN clauch_matches.best_of IS 'BO几: 小组赛BO3, 淘汰赛BO5';

COMMENT ON COLUMN clauch_group_standings.points IS '小组赛积分: 2:0=3分, 2:1=2分, 1:2=1分, 0:2=0分';
COMMENT ON COLUMN clauch_group_standings.round_differential IS '小局净胜数, 用于小组排名的平分判定';
COMMENT ON COLUMN clauch_group_standings.qualified IS '是否晋级淘汰赛(小组前2名)';


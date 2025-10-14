-- =================================================================
-- 电竞赛事模拟系统 - 世界赛数据库表创建脚本
-- =================================================================
-- 创建时间: 2025-10-13
-- 目的: 创建世界赛系统所需的数据库表
-- 依赖: 需要先创建 teams, regions, seasons 等基础表
-- =================================================================

-- =================================================================
-- 1. 创建世界赛对阵表 (worlds_brackets)
-- =================================================================

CREATE TABLE IF NOT EXISTS worlds_brackets (
    id SERIAL PRIMARY KEY,
    season_id VARCHAR(10) NOT NULL,  -- 赛季ID (如: S1, S2, S3)
    season_year INTEGER NOT NULL,    -- 赛季年份
    status VARCHAR(20) DEFAULT 'not_started' NOT NULL,

    -- 参赛队伍信息 (JSON数组)
    play_in_teams JSONB DEFAULT '[]'::jsonb NOT NULL,  -- 12支队伍（4直通 + 8入围）

    -- 最终排名
    champion_id INTEGER,              -- 冠军队伍ID
    runner_up_id INTEGER,             -- 亚军队伍ID
    third_place_id INTEGER,           -- 季军队伍ID
    fourth_place_id INTEGER,          -- 第四名队伍ID

    -- 其他排名（5-8名，JSON数组）
    quarter_finalists JSONB,          -- 8强止步队伍
    group_stage_teams JSONB,          -- 小组赛队伍（未晋级8强）

    -- 积分分配
    points_distribution JSONB DEFAULT '{
        "champion": 150,
        "runnerUp": 120,
        "thirdPlace": 90,
        "fourthPlace": 60,
        "quarterFinalist": 60,
        "groupStage": 30
    }'::jsonb NOT NULL,

    -- 时间戳
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,

    -- 约束
    CONSTRAINT worlds_brackets_status_check CHECK (
        status IN ('not_started', 'play_in_draw', 'group_stage', 'knockout', 'completed')
    ),
    CONSTRAINT worlds_brackets_season_unique UNIQUE (season_id)
);

-- 索引
CREATE INDEX IF NOT EXISTS idx_worlds_brackets_season ON worlds_brackets(season_id);
CREATE INDEX IF NOT EXISTS idx_worlds_brackets_status ON worlds_brackets(status);
CREATE INDEX IF NOT EXISTS idx_worlds_brackets_year ON worlds_brackets(season_year);

-- 注释
COMMENT ON TABLE worlds_brackets IS '世界赛对阵表';
COMMENT ON COLUMN worlds_brackets.play_in_teams IS '12支参赛队伍信息（4直通+8入围，包含半区种子信息）';
COMMENT ON COLUMN worlds_brackets.status IS '状态: not_started=未开始, play_in_draw=入围赛抽签, group_stage=小组赛, knockout=淘汰赛, completed=已完成';

-- =================================================================
-- 2. 创建世界赛瑞士轮比赛表 (worlds_swiss_matches)
-- =================================================================

CREATE TABLE IF NOT EXISTS worlds_swiss_matches (
    id SERIAL PRIMARY KEY,
    worlds_bracket_id INTEGER NOT NULL REFERENCES worlds_brackets(id) ON DELETE CASCADE,

    -- 轮次信息
    round_number INTEGER NOT NULL,    -- 轮次：1-3
    match_number INTEGER,             -- 当轮比赛编号

    -- 队伍信息
    team_a_id INTEGER REFERENCES teams(id) ON DELETE SET NULL,
    team_b_id INTEGER REFERENCES teams(id) ON DELETE SET NULL,
    team_a_name VARCHAR(100),
    team_b_name VARCHAR(100),

    -- 比赛结果
    winner_id INTEGER REFERENCES teams(id) ON DELETE SET NULL,
    score_a INTEGER DEFAULT 0 NOT NULL,
    score_b INTEGER DEFAULT 0 NOT NULL,
    best_of INTEGER DEFAULT 3 NOT NULL,  -- BO3

    -- 状态
    status VARCHAR(20) DEFAULT 'pending' NOT NULL,

    -- 时间戳
    scheduled_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,

    -- 约束
    CONSTRAINT worlds_swiss_matches_status_check CHECK (
        status IN ('pending', 'in_progress', 'completed')
    ),
    CONSTRAINT worlds_swiss_matches_round_check CHECK (
        round_number >= 1 AND round_number <= 3
    )
);

-- 索引
CREATE INDEX IF NOT EXISTS idx_worlds_swiss_bracket ON worlds_swiss_matches(worlds_bracket_id);
CREATE INDEX IF NOT EXISTS idx_worlds_swiss_round ON worlds_swiss_matches(round_number);
CREATE INDEX IF NOT EXISTS idx_worlds_swiss_status ON worlds_swiss_matches(status);
CREATE INDEX IF NOT EXISTS idx_worlds_swiss_teams ON worlds_swiss_matches(team_a_id, team_b_id);

-- 注释
COMMENT ON TABLE worlds_swiss_matches IS '世界赛瑞士轮比赛表';
COMMENT ON COLUMN worlds_swiss_matches.round_number IS '轮次: 1-3轮，2胜晋级，2败淘汰';

-- =================================================================
-- 3. 创建世界赛瑞士轮积分榜表 (worlds_swiss_standings)
-- =================================================================

CREATE TABLE IF NOT EXISTS worlds_swiss_standings (
    id SERIAL PRIMARY KEY,
    worlds_bracket_id INTEGER NOT NULL REFERENCES worlds_brackets(id) ON DELETE CASCADE,
    team_id INTEGER NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    team_name VARCHAR(100) NOT NULL,

    -- 战绩
    wins INTEGER DEFAULT 0 NOT NULL,
    losses INTEGER DEFAULT 0 NOT NULL,

    -- 状态
    status VARCHAR(20) DEFAULT 'active',  -- active=参赛中, qualified=已晋级, eliminated=已淘汰
    qualified BOOLEAN DEFAULT FALSE,
    is_quarter_seed BOOLEAN DEFAULT FALSE,  -- 是否为半区种子（前4名）
    quarter_slot INTEGER,                   -- 半区位置（1-4）

    -- 排名
    final_rank INTEGER,

    -- 时间戳
    last_updated TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,

    -- 约束
    CONSTRAINT worlds_swiss_standings_unique UNIQUE (worlds_bracket_id, team_id),
    CONSTRAINT worlds_swiss_standings_status_check CHECK (
        status IN ('active', 'qualified', 'eliminated')
    )
);

-- 索引
CREATE INDEX IF NOT EXISTS idx_worlds_swiss_standings_bracket ON worlds_swiss_standings(worlds_bracket_id);
CREATE INDEX IF NOT EXISTS idx_worlds_swiss_standings_team ON worlds_swiss_standings(team_id);
CREATE INDEX IF NOT EXISTS idx_worlds_swiss_standings_status ON worlds_swiss_standings(status);
CREATE INDEX IF NOT EXISTS idx_worlds_swiss_standings_wins ON worlds_swiss_standings(wins DESC, losses ASC);

-- 注释
COMMENT ON TABLE worlds_swiss_standings IS '世界赛瑞士轮积分榜';
COMMENT ON COLUMN worlds_swiss_standings.is_quarter_seed IS '是否为半区种子（前4名晋级队伍）';
COMMENT ON COLUMN worlds_swiss_standings.quarter_slot IS '半区位置（1-4），用于淘汰赛种子保护';

-- =================================================================
-- 4. 创建世界赛淘汰赛比赛表 (worlds_knockout_matches)
-- =================================================================

CREATE TABLE IF NOT EXISTS worlds_knockout_matches (
    id SERIAL PRIMARY KEY,
    worlds_bracket_id INTEGER NOT NULL REFERENCES worlds_brackets(id) ON DELETE CASCADE,

    -- 轮次信息
    round VARCHAR(20) NOT NULL,       -- QUARTER_FINAL, SEMI_FINAL, THIRD_PLACE, FINAL
    match_number INTEGER,             -- 该轮次的比赛编号

    -- 队伍信息
    team_a_id INTEGER REFERENCES teams(id) ON DELETE SET NULL,
    team_b_id INTEGER REFERENCES teams(id) ON DELETE SET NULL,
    team_a_name VARCHAR(100),
    team_b_name VARCHAR(100),
    team_a_quarter_slot INTEGER,     -- A队的半区位置
    team_b_quarter_slot INTEGER,     -- B队的半区位置

    -- 比赛结果
    winner_id INTEGER REFERENCES teams(id) ON DELETE SET NULL,
    score_a INTEGER DEFAULT 0 NOT NULL,
    score_b INTEGER DEFAULT 0 NOT NULL,
    best_of INTEGER DEFAULT 5 NOT NULL,  -- BO5

    -- 状态
    status VARCHAR(20) DEFAULT 'pending' NOT NULL,

    -- 去向关系
    next_match_id INTEGER,            -- 胜者晋级的下一场比赛ID

    -- 时间戳
    scheduled_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,

    -- 约束
    CONSTRAINT worlds_knockout_matches_status_check CHECK (
        status IN ('pending', 'in_progress', 'completed')
    ),
    CONSTRAINT worlds_knockout_matches_round_check CHECK (
        round IN ('QUARTER_FINAL', 'SEMI_FINAL', 'THIRD_PLACE', 'FINAL')
    )
);

-- 索引
CREATE INDEX IF NOT EXISTS idx_worlds_knockout_bracket ON worlds_knockout_matches(worlds_bracket_id);
CREATE INDEX IF NOT EXISTS idx_worlds_knockout_round ON worlds_knockout_matches(round);
CREATE INDEX IF NOT EXISTS idx_worlds_knockout_status ON worlds_knockout_matches(status);
CREATE INDEX IF NOT EXISTS idx_worlds_knockout_teams ON worlds_knockout_matches(team_a_id, team_b_id);

-- 注释
COMMENT ON TABLE worlds_knockout_matches IS '世界赛淘汰赛比赛表';
COMMENT ON COLUMN worlds_knockout_matches.round IS '轮次: QUARTER_FINAL=8强, SEMI_FINAL=半决赛, THIRD_PLACE=季军赛, FINAL=决赛';
COMMENT ON COLUMN worlds_knockout_matches.team_a_quarter_slot IS '半区位置（1-4），用于种子保护';

-- =================================================================
-- 5. 创建触发器函数
-- =================================================================

-- 5.1 更新时间戳触发器函数
CREATE OR REPLACE FUNCTION update_worlds_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 5.2 创建触发器
DROP TRIGGER IF EXISTS update_worlds_brackets_updated_at ON worlds_brackets;
CREATE TRIGGER update_worlds_brackets_updated_at
    BEFORE UPDATE ON worlds_brackets
    FOR EACH ROW EXECUTE FUNCTION update_worlds_updated_at();

DROP TRIGGER IF EXISTS update_worlds_swiss_matches_updated_at ON worlds_swiss_matches;
CREATE TRIGGER update_worlds_swiss_matches_updated_at
    BEFORE UPDATE ON worlds_swiss_matches
    FOR EACH ROW EXECUTE FUNCTION update_worlds_updated_at();

DROP TRIGGER IF EXISTS update_worlds_knockout_matches_updated_at ON worlds_knockout_matches;
CREATE TRIGGER update_worlds_knockout_matches_updated_at
    BEFORE UPDATE ON worlds_knockout_matches
    FOR EACH ROW EXECUTE FUNCTION update_worlds_updated_at();

-- =================================================================
-- 6. 权限设置
-- =================================================================

GRANT ALL PRIVILEGES ON TABLE worlds_brackets TO postgres;
GRANT ALL PRIVILEGES ON TABLE worlds_swiss_matches TO postgres;
GRANT ALL PRIVILEGES ON TABLE worlds_swiss_standings TO postgres;
GRANT ALL PRIVILEGES ON TABLE worlds_knockout_matches TO postgres;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO postgres;

-- =================================================================
-- 7. 完成信息
-- =================================================================

SELECT '世界赛数据库表创建脚本执行完成!' as message;
SELECT 'worlds_brackets表已创建' as table_1;
SELECT 'worlds_swiss_matches表已创建' as table_2;
SELECT 'worlds_swiss_standings表已创建' as table_3;
SELECT 'worlds_knockout_matches表已创建' as table_4;
SELECT '相关触发器、索引已创建' as additional_info;

-- =================================================================
-- 数据库表结构总结
-- =================================================================
--
-- 世界赛系统包含以下4张表：
--
-- 1. worlds_brackets          - 世界赛对阵表（主表）
--    - 存储赛季信息、参赛队伍、最终排名、积分分配
--
-- 2. worlds_swiss_matches     - 瑞士轮比赛表
--    - 存储小组赛阶段的瑞士轮比赛
--    - 最多3轮，每轮根据战绩配对
--
-- 3. worlds_swiss_standings   - 瑞士轮积分榜
--    - 存储各队伍的瑞士轮战绩和排名
--    - 标识是否晋级、半区种子等信息
--
-- 4. worlds_knockout_matches  - 淘汰赛比赛表
--    - 存储淘汰赛阶段的比赛（8强、半决赛、季军赛、决赛）
--    - 包含半区种子保护信息
--
-- =================================================================

-- =================================================================
-- Super洲际超级杯数据库表结构
-- =================================================================

-- 1. Super洲际赛主表
CREATE TABLE IF NOT EXISTS super_brackets (
    id SERIAL PRIMARY KEY,
    
    -- 赛季周期信息
    season1_id INTEGER NOT NULL REFERENCES seasons(id),
    season2_id INTEGER NOT NULL REFERENCES seasons(id),
    season1_code VARCHAR(10) NOT NULL,  -- "S1"
    season2_code VARCHAR(10) NOT NULL,  -- "S2"
    season1_year INTEGER NOT NULL,
    season2_year INTEGER NOT NULL,
    super_year INTEGER NOT NULL,  -- Super赛举办年份
    
    -- 赛事状态
    status VARCHAR(50) NOT NULL DEFAULT 'not_started',
    -- 状态值: not_started, fighter_group, challenger_stage, preparation_stage, championship_stage, completed
    
    -- 参赛队伍数据 (JSON格式存储)
    qualified_teams JSONB NOT NULL DEFAULT '[]',  -- 所有16支队伍
    legendary_group JSONB NOT NULL DEFAULT '[]',  -- 传奇组(1-4名)
    challenger_group JSONB NOT NULL DEFAULT '[]', -- 挑战者组(5-8名)
    fighter_group JSONB NOT NULL DEFAULT '[]',    -- Fighter组(9-16名)
    fighter_group_a JSONB NOT NULL DEFAULT '[]',  -- Fighter A组
    fighter_group_b JSONB NOT NULL DEFAULT '[]',  -- Fighter B组
    
    -- 各阶段晋级数据
    challenger_winners JSONB,          -- 定位赛胜者(2队)
    challenger_losers JSONB,           -- 定位赛败者(2队)
    fighter_qualifiers JSONB,          -- Fighter组晋级者(2队)
    advancement_winners JSONB,         -- 晋级赛胜者(2队)
    
    prep_winners_champion JSONB,       -- 胜者组冠军
    prep_losers_final_winner JSONB,    -- 败者组决赛胜者
    
    championship_teams JSONB,          -- 第四阶段参赛队伍(6队)
    
    -- 最终排名
    champion JSONB,
    runner_up JSONB,
    third_place JSONB,
    fourth_place JSONB,
    
    -- 其他排名（仅用于显示）
    championship_round2_eliminated JSONB, -- 次轮淘汰(2队)
    championship_round1_eliminated JSONB, -- 首轮淘汰(2队)
    prep_stage_eliminated JSONB,          -- 第三阶段淘汰(2队)
    advancement_eliminated JSONB,         -- 晋级赛淘汰(2队)
    fighter_eliminated JSONB,             -- Fighter组未晋级(6队)
    
    -- 时间戳
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    -- 唯一约束：每个周期只能有一个Super赛事
    UNIQUE(season1_id, season2_id)
);

-- 2. Super比赛表
CREATE TABLE IF NOT EXISTS super_matches (
    id SERIAL PRIMARY KEY,
    super_id INTEGER NOT NULL REFERENCES super_brackets(id) ON DELETE CASCADE,
    
    -- 比赛基本信息
    match_number INTEGER NOT NULL,
    match_type VARCHAR(50) NOT NULL,
    -- 比赛类型: fighter_group_a, fighter_group_b, challenger_positioning, 
    --          advancement_match, prep_winners, prep_losers, prep_losers_final,
    --          championship_round1, championship_round2, third_place_match, grand_final
    
    stage VARCHAR(50) NOT NULL,
    -- 阶段: fighter_group, challenger_stage, preparation_stage, championship_stage
    
    best_of INTEGER NOT NULL DEFAULT 5,  -- BO1=1, BO5=5
    bracket_type VARCHAR(50),  -- winners, losers, championship, fighter
    group_name VARCHAR(50),    -- 分组名称，如"Fighter A组"
    
    -- 对阵队伍
    team_a_id INTEGER,
    team_b_id INTEGER,
    team_a_name VARCHAR(100),
    team_b_name VARCHAR(100),
    
    -- 比赛结果
    score_a INTEGER DEFAULT 0,
    score_b INTEGER DEFAULT 0,
    winner_id INTEGER,
    winner_name VARCHAR(100),
    
    -- 比赛状态
    status VARCHAR(20) NOT NULL DEFAULT 'scheduled',
    -- 状态: scheduled, in_progress, completed
    
    -- 晋级路径
    next_match_id INTEGER REFERENCES super_matches(id),
    loser_next_match_id INTEGER REFERENCES super_matches(id),
    
    -- 时间戳
    scheduled_at TIMESTAMP WITH TIME ZONE,
    started_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 3. Fighter组积分榜
CREATE TABLE IF NOT EXISTS super_fighter_standings (
    id SERIAL PRIMARY KEY,
    super_id INTEGER NOT NULL REFERENCES super_brackets(id) ON DELETE CASCADE,
    
    team_id INTEGER NOT NULL,
    team_name VARCHAR(100) NOT NULL,
    region_name VARCHAR(50) NOT NULL,
    
    group_name VARCHAR(1) NOT NULL,  -- 'A' or 'B'
    
    matches_played INTEGER NOT NULL DEFAULT 0,
    wins INTEGER NOT NULL DEFAULT 0,
    losses INTEGER NOT NULL DEFAULT 0,
    record VARCHAR(10),  -- "2-1" 格式
    
    position INTEGER,     -- 组内排名
    qualified BOOLEAN DEFAULT false,  -- 是否晋级
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    UNIQUE(super_id, team_id)
);

-- 4. Super轮次表
CREATE TABLE IF NOT EXISTS super_rounds (
    id SERIAL PRIMARY KEY,
    super_id INTEGER NOT NULL REFERENCES super_brackets(id) ON DELETE CASCADE,
    
    round_number INTEGER NOT NULL,
    round_name VARCHAR(100) NOT NULL,
    stage VARCHAR(50) NOT NULL,
    
    status VARCHAR(20) NOT NULL DEFAULT 'pending',
    -- 状态: pending, in_progress, completed
    
    start_date TIMESTAMP WITH TIME ZONE,
    end_date TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    UNIQUE(super_id, round_number)
);

-- 创建索引以提升查询性能
CREATE INDEX IF NOT EXISTS idx_super_brackets_season ON super_brackets(season1_id, season2_id);
CREATE INDEX IF NOT EXISTS idx_super_brackets_status ON super_brackets(status);
CREATE INDEX IF NOT EXISTS idx_super_matches_super_id ON super_matches(super_id);
CREATE INDEX IF NOT EXISTS idx_super_matches_status ON super_matches(status);
CREATE INDEX IF NOT EXISTS idx_super_matches_stage ON super_matches(stage);
CREATE INDEX IF NOT EXISTS idx_super_fighter_standings_super_id ON super_fighter_standings(super_id);
CREATE INDEX IF NOT EXISTS idx_super_rounds_super_id ON super_rounds(super_id);

-- 添加更新时间戳的触发器
CREATE OR REPLACE FUNCTION update_super_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_super_brackets_updated_at
    BEFORE UPDATE ON super_brackets
    FOR EACH ROW
    EXECUTE FUNCTION update_super_updated_at();

CREATE TRIGGER update_super_matches_updated_at
    BEFORE UPDATE ON super_matches
    FOR EACH ROW
    EXECUTE FUNCTION update_super_updated_at();

CREATE TRIGGER update_super_fighter_standings_updated_at
    BEFORE UPDATE ON super_fighter_standings
    FOR EACH ROW
    EXECUTE FUNCTION update_super_updated_at();

CREATE TRIGGER update_super_rounds_updated_at
    BEFORE UPDATE ON super_rounds
    FOR EACH ROW
    EXECUTE FUNCTION update_super_updated_at();

-- 添加注释
COMMENT ON TABLE super_brackets IS 'Super洲际超级杯主表';
COMMENT ON TABLE super_matches IS 'Super洲际赛比赛表';
COMMENT ON TABLE super_fighter_standings IS 'Fighter组积分榜';
COMMENT ON TABLE super_rounds IS 'Super轮次表';

COMMENT ON COLUMN super_brackets.status IS '赛事状态: not_started, fighter_group, challenger_stage, preparation_stage, championship_stage, completed';
COMMENT ON COLUMN super_matches.match_type IS '比赛类型: fighter_group_a/b, challenger_positioning, advancement_match, prep_winners/losers/losers_final, championship_round1/2, third_place_match, grand_final';
COMMENT ON COLUMN super_matches.stage IS '所属阶段: fighter_group, challenger_stage, preparation_stage, championship_stage';


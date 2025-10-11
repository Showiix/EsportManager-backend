-- =================================================================
-- 电竞赛事模拟系统 - 积分排名与荣誉殿堂数据库补充脚本
-- =================================================================
--
-- 此脚本添加前后端对接所需的积分榜和荣誉记录表
-- 基于前端第五、六阶段工作报告的需求设计
--
-- =================================================================

-- 删除已存在的表（如果有）
DROP TABLE IF EXISTS honor_records CASCADE;
DROP TABLE IF EXISTS annual_rankings CASCADE;
DROP TABLE IF EXISTS regional_standings CASCADE;

-- =================================================================
-- 1. 赛区常规赛积分榜表
-- =================================================================
-- 用于存储各赛区春季赛和夏季赛的常规赛积分榜
CREATE TABLE regional_standings (
    id SERIAL PRIMARY KEY,
    team_id INTEGER NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    region_id INTEGER NOT NULL REFERENCES regions(id) ON DELETE CASCADE,
    season_id INTEGER NOT NULL REFERENCES seasons(id) ON DELETE CASCADE,
    competition_type VARCHAR(20) NOT NULL CHECK (competition_type IN ('spring', 'summer')),

    -- 比赛统计
    matches_played INTEGER DEFAULT 0,
    wins INTEGER DEFAULT 0,
    losses INTEGER DEFAULT 0,
    win_rate DECIMAL(5,2) DEFAULT 0.00,  -- 胜率百分比，如 83.33

    -- 积分统计
    regular_season_points INTEGER DEFAULT 0,  -- 常规赛积分
    round_differential INTEGER DEFAULT 0,     -- 小场分差

    -- 排名
    position INTEGER,  -- 排名

    -- 时间戳
    last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    -- 确保每个队伍在每个赛区、赛季、赛事类型中只有一条记录
    UNIQUE(team_id, region_id, season_id, competition_type)
);

-- 索引优化查询性能
CREATE INDEX idx_regional_standings_region_season ON regional_standings(region_id, season_id, competition_type);
CREATE INDEX idx_regional_standings_team ON regional_standings(team_id);
CREATE INDEX idx_regional_standings_position ON regional_standings(position);
CREATE INDEX idx_regional_standings_points ON regular_standings(regular_season_points DESC);

COMMENT ON TABLE regional_standings IS '赛区常规赛积分榜表';
COMMENT ON COLUMN regional_standings.competition_type IS '赛事类型：spring春季赛, summer夏季赛';
COMMENT ON COLUMN regional_standings.win_rate IS '胜率百分比，如 83.33';
COMMENT ON COLUMN regional_standings.round_differential IS '小场分差 = 赢的小场数 - 输的小场数';

-- =================================================================
-- 2. 年度积分排名表
-- =================================================================
-- 用于存储全球战队年度积分排名
CREATE TABLE annual_rankings (
    id SERIAL PRIMARY KEY,
    team_id INTEGER NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    season_id INTEGER NOT NULL REFERENCES seasons(id) ON DELETE CASCADE,

    -- 积分统计
    total_points INTEGER DEFAULT 0,             -- 年度总积分（不包含洲际赛）
    spring_points INTEGER DEFAULT 0,            -- 春季赛积分
    summer_points INTEGER DEFAULT 0,            -- 夏季赛积分
    playoff_points INTEGER DEFAULT 0,           -- 季后赛积分
    msi_points INTEGER DEFAULT 0,               -- MSI积分
    worlds_points INTEGER DEFAULT 0,            -- 世界赛积分
    intercontinental_points INTEGER DEFAULT 0,  -- 洲际赛积分（荣誉，不计入总分）

    -- 成就记录
    achievements JSONB DEFAULT '[]'::jsonb,  -- 成就列表，如 ["2024春季赛冠军", "MSI冠军"]

    -- 排名
    position INTEGER,  -- 全球排名

    -- 时间戳
    last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    -- 确保每个队伍在每个赛季只有一条记录
    UNIQUE(team_id, season_id)
);

-- 索引优化查询性能
CREATE INDEX idx_annual_rankings_season ON annual_rankings(season_id);
CREATE INDEX idx_annual_rankings_team ON annual_rankings(team_id);
CREATE INDEX idx_annual_rankings_position ON annual_rankings(position);
CREATE INDEX idx_annual_rankings_total_points ON annual_rankings(total_points DESC);
CREATE INDEX idx_annual_rankings_season_points ON annual_rankings(season_id, total_points DESC);

COMMENT ON TABLE annual_rankings IS '年度积分排名表';
COMMENT ON COLUMN annual_rankings.total_points IS '年度总积分（不包含洲际赛荣誉积分）';
COMMENT ON COLUMN annual_rankings.intercontinental_points IS '洲际赛荣誉积分（仅展示，不计入总分）';
COMMENT ON COLUMN annual_rankings.achievements IS 'JSON数组，存储成就列表';

-- =================================================================
-- 3. 荣誉记录表
-- =================================================================
-- 用于存储各赛事的冠亚季军荣誉记录
CREATE TABLE honor_records (
    id SERIAL PRIMARY KEY,
    season_id INTEGER NOT NULL REFERENCES seasons(id) ON DELETE CASCADE,
    competition_id INTEGER NOT NULL REFERENCES competitions(id) ON DELETE CASCADE,
    team_id INTEGER NOT NULL REFERENCES teams(id) ON DELETE CASCADE,

    -- 荣誉信息
    position INTEGER NOT NULL CHECK (position >= 1 AND position <= 4),  -- 名次：1冠军, 2亚军, 3季军, 4第四名
    points INTEGER DEFAULT 0,           -- 获得的积分
    achievement_date TIMESTAMP,          -- 成就日期
    special_record TEXT,                 -- 特殊记录，如"三连冠"、"不败夺冠"等

    -- 时间戳
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    -- 确保每个队伍在每个赛事中只有一条荣誉记录
    UNIQUE(competition_id, team_id)
);

-- 索引优化查询性能
CREATE INDEX idx_honor_records_season ON honor_records(season_id);
CREATE INDEX idx_honor_records_competition ON honor_records(competition_id);
CREATE INDEX idx_honor_records_team ON honor_records(team_id);
CREATE INDEX idx_honor_records_position ON honor_records(position);
CREATE INDEX idx_honor_records_season_position ON honor_records(season_id, position);

COMMENT ON TABLE honor_records IS '荣誉记录表，存储各赛事的冠亚季军';
COMMENT ON COLUMN honor_records.position IS '名次：1=冠军, 2=亚军, 3=季军, 4=第四名';
COMMENT ON COLUMN honor_records.special_record IS '特殊记录，如"三连冠"、"不败夺冠"等';

-- =================================================================
-- 4. 创建触发器
-- =================================================================

-- 4.1 更新赛区积分榜时间戳触发器
CREATE TRIGGER trigger_update_regional_standings_updated_at
    BEFORE UPDATE ON regional_standings
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- 4.2 更新年度积分排名时间戳触发器
CREATE TRIGGER trigger_update_annual_rankings_updated_at
    BEFORE UPDATE ON annual_rankings
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- 4.3 更新荣誉记录时间戳触发器
CREATE TRIGGER trigger_update_honor_records_updated_at
    BEFORE UPDATE ON honor_records
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- =================================================================
-- 5. 创建视图
-- =================================================================

-- 5.1 赛区积分榜视图
CREATE OR REPLACE VIEW v_regional_standings AS
SELECT
    rs.id,
    rs.team_id,
    t.name as team_name,
    t.short_name,
    rs.region_id,
    r.name as region_name,
    r.code as region_code,
    rs.season_id,
    s.name as season_name,
    s.year as season_year,
    rs.competition_type,
    rs.matches_played,
    rs.wins,
    rs.losses,
    rs.win_rate,
    rs.regular_season_points,
    rs.round_differential,
    rs.position,
    rs.last_updated
FROM regional_standings rs
JOIN teams t ON rs.team_id = t.id
JOIN regions r ON rs.region_id = r.id
JOIN seasons s ON rs.season_id = s.id
WHERE t.is_active = true
ORDER BY rs.region_id, rs.season_id, rs.competition_type, rs.position;

COMMENT ON VIEW v_regional_standings IS '赛区积分榜视图，包含完整的队伍和赛区信息';

-- 5.2 年度积分排名视图
CREATE OR REPLACE VIEW v_annual_rankings AS
SELECT
    ar.id,
    ar.team_id,
    t.name as team_name,
    t.short_name,
    t.region_id,
    r.name as region_name,
    r.code as region_code,
    ar.season_id,
    s.name as season_name,
    s.year as season_year,
    ar.total_points,
    ar.spring_points,
    ar.summer_points,
    ar.playoff_points,
    ar.msi_points,
    ar.worlds_points,
    ar.intercontinental_points,
    ar.achievements,
    ar.position,
    ar.last_updated
FROM annual_rankings ar
JOIN teams t ON ar.team_id = t.id
JOIN regions r ON t.region_id = r.id
JOIN seasons s ON ar.season_id = s.id
WHERE t.is_active = true
ORDER BY ar.season_id, ar.position;

COMMENT ON VIEW v_annual_rankings IS '年度积分排名视图，包含完整的队伍和赛季信息';

-- 5.3 荣誉殿堂视图
CREATE OR REPLACE VIEW v_honor_hall AS
SELECT
    hr.id,
    hr.season_id,
    s.name as season_name,
    s.year as season_year,
    hr.competition_id,
    c.name as competition_name,
    c.type as competition_type,
    hr.team_id,
    t.name as team_name,
    t.short_name,
    t.region_id,
    r.name as region_name,
    r.code as region_code,
    hr.position,
    CASE hr.position
        WHEN 1 THEN '冠军'
        WHEN 2 THEN '亚军'
        WHEN 3 THEN '季军'
        WHEN 4 THEN '第四名'
        ELSE '其他'
    END as position_name,
    hr.points,
    hr.achievement_date,
    hr.special_record,
    hr.created_at
FROM honor_records hr
JOIN seasons s ON hr.season_id = s.id
JOIN competitions c ON hr.competition_id = c.id
JOIN teams t ON hr.team_id = t.id
JOIN regions r ON t.region_id = r.id
WHERE t.is_active = true
ORDER BY hr.season_id DESC, c.type, hr.position;

COMMENT ON VIEW v_honor_hall IS '荣誉殿堂视图，展示所有赛事的冠亚季军';

-- =================================================================
-- 6. 辅助函数
-- =================================================================

-- 6.1 计算胜率函数
CREATE OR REPLACE FUNCTION calculate_win_rate(wins INTEGER, total_matches INTEGER)
RETURNS DECIMAL(5,2) AS $$
BEGIN
    IF total_matches = 0 THEN
        RETURN 0.00;
    END IF;
    RETURN ROUND((wins::DECIMAL / total_matches::DECIMAL) * 100, 2);
END;
$$ LANGUAGE plpgsql IMMUTABLE;

COMMENT ON FUNCTION calculate_win_rate IS '计算胜率百分比';

-- 6.2 刷新赛区积分榜函数
CREATE OR REPLACE FUNCTION refresh_regional_standings(
    p_region_id INTEGER,
    p_season_id INTEGER,
    p_competition_type VARCHAR
)
RETURNS VOID AS $$
BEGIN
    -- 根据比赛结果重新计算积分榜
    -- 这个函数会在RankingService中调用
    -- 暂时留空，由后端服务实现具体逻辑
    RAISE NOTICE 'Refreshing regional standings for region_id=%, season_id=%, type=%',
        p_region_id, p_season_id, p_competition_type;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION refresh_regional_standings IS '刷新赛区常规赛积分榜';

-- =================================================================
-- 7. 权限设置
-- =================================================================

-- 赋予postgres用户所有权限
GRANT ALL PRIVILEGES ON TABLE regional_standings TO postgres;
GRANT ALL PRIVILEGES ON TABLE annual_rankings TO postgres;
GRANT ALL PRIVILEGES ON TABLE honor_records TO postgres;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO postgres;

-- =================================================================
-- 8. 完成信息
-- =================================================================

SELECT '积分排名与荣誉殿堂数据库补充脚本执行完成!' as message;
SELECT 'regional_standings表已创建' as table_1;
SELECT 'annual_rankings表已创建' as table_2;
SELECT 'honor_records表已创建' as table_3;
SELECT '相关视图、索引、触发器已创建' as additional_info;

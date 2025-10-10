-- =================================================================
-- 电竞赛事模拟系统 - 数据库初始化脚本
-- =================================================================

-- 创建必要的扩展
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- =================================================================
-- 1. 删除现有表 (用于重新初始化)
-- =================================================================

DROP TABLE IF EXISTS score_records CASCADE;
DROP TABLE IF EXISTS team_statistics CASCADE;
DROP TABLE IF EXISTS head_to_head_records CASCADE;
DROP TABLE IF EXISTS matches CASCADE;
DROP TABLE IF EXISTS competition_teams CASCADE;
DROP TABLE IF EXISTS competitions CASCADE;
DROP TABLE IF EXISTS seasons CASCADE;
DROP TABLE IF EXISTS teams CASCADE;
DROP TABLE IF EXISTS regions CASCADE;

-- 删除视图
DROP VIEW IF EXISTS v_team_rankings CASCADE;
DROP VIEW IF EXISTS v_match_results CASCADE;

-- =================================================================
-- 2. 创建基础表
-- =================================================================

-- 2.1 赛区表
CREATE TABLE regions (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL UNIQUE,
    code VARCHAR(10) NOT NULL UNIQUE,
    description TEXT,
    display_order INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 2.2 战队表
CREATE TABLE teams (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    short_name VARCHAR(10) NOT NULL,
    region_id INTEGER REFERENCES regions(id) ON DELETE CASCADE,
    power_rating INTEGER DEFAULT 50 CHECK (power_rating >= 0 AND power_rating <= 100),
    founded_date DATE,
    logo_url VARCHAR(255),
    is_active BOOLEAN DEFAULT TRUE,

    -- 统计字段
    total_matches INTEGER DEFAULT 0,
    total_wins INTEGER DEFAULT 0,
    total_losses INTEGER DEFAULT 0,
    net_round_difference INTEGER DEFAULT 0,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    UNIQUE(name, region_id),
    UNIQUE(short_name, region_id)
);

-- 2.3 赛季表
CREATE TABLE seasons (
    id SERIAL PRIMARY KEY,
    name VARCHAR(50) NOT NULL UNIQUE,
    year INTEGER NOT NULL,
    status VARCHAR(20) DEFAULT 'planning' CHECK (status IN ('planning', 'active', 'completed')),
    current_phase VARCHAR(50),
    start_date DATE,
    end_date DATE,
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 2.4 赛事表
CREATE TABLE competitions (
    id SERIAL PRIMARY KEY,
    season_id INTEGER REFERENCES seasons(id) ON DELETE CASCADE,
    type VARCHAR(20) NOT NULL CHECK (type IN ('spring', 'summer', 'msi', 'worlds')),
    name VARCHAR(100) NOT NULL,
    format JSONB NOT NULL DEFAULT '{}',
    scoring_rules JSONB NOT NULL DEFAULT '{}',
    status VARCHAR(20) DEFAULT 'planning' CHECK (status IN ('planning', 'active', 'completed')),
    max_teams INTEGER DEFAULT 40,
    start_date DATE,
    end_date DATE,
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    UNIQUE(season_id, type)
);

-- 2.5 赛事参赛队伍关联表
CREATE TABLE competition_teams (
    id SERIAL PRIMARY KEY,
    competition_id INTEGER REFERENCES competitions(id) ON DELETE CASCADE,
    team_id INTEGER REFERENCES teams(id) ON DELETE CASCADE,
    seed INTEGER,
    group_name VARCHAR(10),
    joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    UNIQUE(competition_id, team_id)
);

-- 2.6 比赛表
CREATE TABLE matches (
    id SERIAL PRIMARY KEY,
    competition_id INTEGER REFERENCES competitions(id) ON DELETE CASCADE,
    team_a_id INTEGER REFERENCES teams(id) ON DELETE CASCADE,
    team_b_id INTEGER REFERENCES teams(id) ON DELETE CASCADE,
    score_a INTEGER DEFAULT 0,
    score_b INTEGER DEFAULT 0,
    winner_id INTEGER REFERENCES teams(id),
    format VARCHAR(10) DEFAULT 'BO3' CHECK (format IN ('BO1', 'BO3', 'BO5')),
    phase VARCHAR(50) NOT NULL,
    round_number INTEGER,
    match_number INTEGER,
    status VARCHAR(20) DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'in_progress', 'completed', 'cancelled')),
    scheduled_at TIMESTAMP,
    started_at TIMESTAMP,
    completed_at TIMESTAMP,
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    CHECK (team_a_id != team_b_id),
    CHECK (winner_id IN (team_a_id, team_b_id) OR winner_id IS NULL)
);

-- 2.7 积分记录表
CREATE TABLE score_records (
    id SERIAL PRIMARY KEY,
    team_id INTEGER REFERENCES teams(id) ON DELETE CASCADE,
    competition_id INTEGER REFERENCES competitions(id) ON DELETE CASCADE,
    match_id INTEGER REFERENCES matches(id) ON DELETE CASCADE,
    points INTEGER NOT NULL DEFAULT 0,
    point_type VARCHAR(50) NOT NULL,
    season_year INTEGER NOT NULL,
    earned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 2.8 战队统计表
CREATE TABLE team_statistics (
    id SERIAL PRIMARY KEY,
    team_id INTEGER REFERENCES teams(id) ON DELETE CASCADE,
    season_year INTEGER NOT NULL,
    total_points INTEGER DEFAULT 0,
    spring_points INTEGER DEFAULT 0,
    msi_points INTEGER DEFAULT 0,
    summer_points INTEGER DEFAULT 0,
    worlds_points INTEGER DEFAULT 0,
    current_ranking INTEGER,
    peak_ranking INTEGER,
    matches_played INTEGER DEFAULT 0,
    wins INTEGER DEFAULT 0,
    losses INTEGER DEFAULT 0,
    win_rate DECIMAL(5,2) DEFAULT 0.00,
    last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    UNIQUE(team_id, season_year)
);

-- 2.9 战队交锋记录表
CREATE TABLE head_to_head_records (
    id SERIAL PRIMARY KEY,
    team_a_id INTEGER REFERENCES teams(id) ON DELETE CASCADE,
    team_b_id INTEGER REFERENCES teams(id) ON DELETE CASCADE,
    total_matches INTEGER DEFAULT 0,
    team_a_wins INTEGER DEFAULT 0,
    team_b_wins INTEGER DEFAULT 0,
    last_match_date DATE,
    last_match_id INTEGER REFERENCES matches(id),

    UNIQUE(team_a_id, team_b_id),
    CHECK (team_a_id < team_b_id)
);

-- =================================================================
-- 3. 创建索引
-- =================================================================

-- 基础索引
CREATE INDEX idx_teams_region ON teams(region_id);
CREATE INDEX idx_teams_power_rating ON teams(power_rating DESC);
CREATE INDEX idx_teams_active ON teams(is_active);

CREATE INDEX idx_competitions_season ON competitions(season_id);
CREATE INDEX idx_competitions_type ON competitions(type);
CREATE INDEX idx_competitions_status ON competitions(status);

CREATE INDEX idx_matches_competition ON matches(competition_id);
CREATE INDEX idx_matches_teams ON matches(team_a_id, team_b_id);
CREATE INDEX idx_matches_winner ON matches(winner_id);
CREATE INDEX idx_matches_status ON matches(status);
CREATE INDEX idx_matches_scheduled ON matches(scheduled_at);
CREATE INDEX idx_matches_completed ON matches(completed_at);

CREATE INDEX idx_score_records_team ON score_records(team_id);
CREATE INDEX idx_score_records_competition ON score_records(competition_id);
CREATE INDEX idx_score_records_season ON score_records(season_year);
CREATE INDEX idx_score_records_points ON score_records(points DESC);

CREATE INDEX idx_team_statistics_season ON team_statistics(season_year);
CREATE INDEX idx_team_statistics_points ON team_statistics(total_points DESC);
CREATE INDEX idx_team_statistics_ranking ON team_statistics(current_ranking);

-- 复合索引
CREATE INDEX idx_score_records_team_season ON score_records(team_id, season_year);
CREATE INDEX idx_score_records_season_points ON score_records(season_year, points DESC);
CREATE INDEX idx_matches_competition_phase ON matches(competition_id, phase);

-- =================================================================
-- 4. 创建视图
-- =================================================================

-- 4.1 战队排名视图
CREATE VIEW v_team_rankings AS
SELECT
    ts.team_id,
    t.name as team_name,
    t.short_name,
    r.name as region_name,
    r.code as region_code,
    ts.season_year,
    ts.total_points,
    ts.spring_points,
    ts.msi_points,
    ts.summer_points,
    ts.worlds_points,
    ts.current_ranking,
    ts.peak_ranking,
    ts.matches_played,
    ts.wins,
    ts.losses,
    ts.win_rate,
    t.power_rating,
    ROW_NUMBER() OVER (PARTITION BY ts.season_year ORDER BY ts.total_points DESC) as overall_ranking
FROM team_statistics ts
JOIN teams t ON ts.team_id = t.id
JOIN regions r ON t.region_id = r.id
WHERE t.is_active = true;

-- 4.2 比赛结果视图
CREATE VIEW v_match_results AS
SELECT
    m.id as match_id,
    c.name as competition_name,
    c.type as competition_type,
    ta.name as team_a_name,
    ta.short_name as team_a_short,
    tb.name as team_b_name,
    tb.short_name as team_b_short,
    m.score_a,
    m.score_b,
    tw.name as winner_name,
    tw.short_name as winner_short,
    m.format,
    m.phase,
    m.round_number,
    m.status,
    m.scheduled_at,
    m.started_at,
    m.completed_at,
    s.name as season_name,
    s.year as season_year
FROM matches m
JOIN competitions c ON m.competition_id = c.id
JOIN seasons s ON c.season_id = s.id
JOIN teams ta ON m.team_a_id = ta.id
JOIN teams tb ON m.team_b_id = tb.id
LEFT JOIN teams tw ON m.winner_id = tw.id;

-- =================================================================
-- 5. 创建触发器函数
-- =================================================================

-- 5.1 更新时间戳函数
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 5.2 创建触发器
CREATE TRIGGER trigger_update_regions_updated_at
    BEFORE UPDATE ON regions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trigger_update_teams_updated_at
    BEFORE UPDATE ON teams
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trigger_update_seasons_updated_at
    BEFORE UPDATE ON seasons
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trigger_update_competitions_updated_at
    BEFORE UPDATE ON competitions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trigger_update_matches_updated_at
    BEFORE UPDATE ON matches
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- 5.3 比赛结果处理函数
CREATE OR REPLACE FUNCTION process_match_result()
RETURNS TRIGGER AS $$
BEGIN
    -- 只在比赛完成时处理
    IF NEW.status = 'completed' AND OLD.status != 'completed' THEN
        -- 更新战队统计
        UPDATE teams SET
            total_matches = total_matches + 1,
            total_wins = CASE WHEN NEW.winner_id = id THEN total_wins + 1 ELSE total_wins END,
            total_losses = CASE WHEN NEW.winner_id != id THEN total_losses + 1 ELSE total_losses END,
            net_round_difference = CASE
                WHEN id = NEW.team_a_id THEN net_round_difference + (NEW.score_a - NEW.score_b)
                WHEN id = NEW.team_b_id THEN net_round_difference + (NEW.score_b - NEW.score_a)
                ELSE net_round_difference
            END
        WHERE id IN (NEW.team_a_id, NEW.team_b_id);

        -- 更新或创建交锋记录
        INSERT INTO head_to_head_records (team_a_id, team_b_id, total_matches, team_a_wins, team_b_wins, last_match_date, last_match_id)
        VALUES (
            LEAST(NEW.team_a_id, NEW.team_b_id),
            GREATEST(NEW.team_a_id, NEW.team_b_id),
            1,
            CASE WHEN NEW.winner_id = LEAST(NEW.team_a_id, NEW.team_b_id) THEN 1 ELSE 0 END,
            CASE WHEN NEW.winner_id = GREATEST(NEW.team_a_id, NEW.team_b_id) THEN 1 ELSE 0 END,
            CURRENT_DATE,
            NEW.id
        )
        ON CONFLICT (team_a_id, team_b_id) DO UPDATE SET
            total_matches = head_to_head_records.total_matches + 1,
            team_a_wins = CASE WHEN NEW.winner_id = head_to_head_records.team_a_id
                          THEN head_to_head_records.team_a_wins + 1
                          ELSE head_to_head_records.team_a_wins END,
            team_b_wins = CASE WHEN NEW.winner_id = head_to_head_records.team_b_id
                          THEN head_to_head_records.team_b_wins + 1
                          ELSE head_to_head_records.team_b_wins END,
            last_match_date = CURRENT_DATE,
            last_match_id = NEW.id;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 创建比赛结果触发器
CREATE TRIGGER trigger_process_match_result
    AFTER UPDATE ON matches
    FOR EACH ROW EXECUTE FUNCTION process_match_result();

-- =================================================================
-- 6. 插入基础数据
-- =================================================================

-- 6.1 插入赛区数据
INSERT INTO regions (name, code, display_order, description) VALUES
('中国大陆职业联赛', 'LPL', 1, '中国大陆地区顶级电竞职业联赛'),
('韩国冠军联赛', 'LCK', 2, '韩国地区顶级电竞职业联赛'),
('欧洲冠军联赛', 'LEC', 3, '欧洲地区顶级电竞职业联赛'),
('北美冠军联赛', 'LCS', 4, '北美地区顶级电竞职业联赛');

-- 6.2 插入示例战队数据
-- LPL战队
INSERT INTO teams (name, short_name, region_id, power_rating, founded_date) VALUES
('JD Gaming', 'JDG', (SELECT id FROM regions WHERE code = 'LPL'), 88, '2017-05-20'),
('Bilibili Gaming', 'BLG', (SELECT id FROM regions WHERE code = 'LPL'), 85, '2017-12-21'),
('Top Esports', 'TES', (SELECT id FROM regions WHERE code = 'LPL'), 82, '2019-11-26'),
('Weibo Gaming', 'WBG', (SELECT id FROM regions WHERE code = 'LPL'), 79, '2020-11-26'),
('Invictus Gaming', 'IG', (SELECT id FROM regions WHERE code = 'LPL'), 76, '2011-08-02'),
('FunPlus Phoenix', 'FPX', (SELECT id FROM regions WHERE code = 'LPL'), 74, '2017-12-21'),
('EDward Gaming', 'EDG', (SELECT id FROM regions WHERE code = 'LPL'), 72, '2013-09-13'),
('Royal Never Give Up', 'RNG', (SELECT id FROM regions WHERE code = 'LPL'), 70, '2012-05-15'),
('LNG Esports', 'LNG', (SELECT id FROM regions WHERE code = 'LPL'), 68, '2019-01-01'),
('Ninjas in Pyjamas', 'NIP', (SELECT id FROM regions WHERE code = 'LPL'), 65, '2021-11-26');

-- LCK战队
INSERT INTO teams (name, short_name, region_id, power_rating, founded_date) VALUES
('T1', 'T1', (SELECT id FROM regions WHERE code = 'LCK'), 90, '2013-02-21'),
('Gen.G', 'GEN', (SELECT id FROM regions WHERE code = 'LCK'), 87, '2017-01-11'),
('DRX', 'DRX', (SELECT id FROM regions WHERE code = 'LCK'), 84, '2019-11-18'),
('KT Rolster', 'KT', (SELECT id FROM regions WHERE code = 'LCK'), 81, '2012-06-08'),
('Hanwha Life Esports', 'HLE', (SELECT id FROM regions WHERE code = 'LCK'), 78, '2016-12-01'),
('DWG KIA', 'DK', (SELECT id FROM regions WHERE code = 'LCK'), 75, '2017-02-14'),
('Liiv SANDBOX', 'LSB', (SELECT id FROM regions WHERE code = 'LCK'), 72, '2018-11-13'),
('Kwangdong Freecs', 'KDF', (SELECT id FROM regions WHERE code = 'LCK'), 69, '2016-11-30'),
('Nongshim RedForce', 'NS', (SELECT id FROM regions WHERE code = 'LCK'), 66, '2020-11-17'),
('OK Savings Bank BRION', 'BRO', (SELECT id FROM regions WHERE code = 'LCK'), 63, '2021-11-19');

-- LEC战队
INSERT INTO teams (name, short_name, region_id, power_rating, founded_date) VALUES
('G2 Esports', 'G2', (SELECT id FROM regions WHERE code = 'LEC'), 83, '2013-02-24'),
('Fnatic', 'FNC', (SELECT id FROM regions WHERE code = 'LEC'), 80, '2011-07-23'),
('MAD Lions', 'MAD', (SELECT id FROM regions WHERE code = 'LEC'), 77, '2017-02-08'),
('Team Vitality', 'VIT', (SELECT id FROM regions WHERE code = 'LEC'), 74, '2013-09-12'),
('Rogue', 'RGE', (SELECT id FROM regions WHERE code = 'LEC'), 71, '2016-12-07'),
('Team BDS', 'BDS', (SELECT id FROM regions WHERE code = 'LEC'), 68, '2021-01-15'),
('Excel Esports', 'XL', (SELECT id FROM regions WHERE code = 'LEC'), 65, '2014-08-01'),
('SK Gaming', 'SK', (SELECT id FROM regions WHERE code = 'LEC'), 62, '1997-10-01'),
('Team Heretics', 'TH', (SELECT id FROM regions WHERE code = 'LEC'), 59, '2016-06-15'),
('GIANTX', 'GX', (SELECT id FROM regions WHERE code = 'LEC'), 56, '2022-12-01');

-- LCS战队
INSERT INTO teams (name, short_name, region_id, power_rating, founded_date) VALUES
('Cloud9', 'C9', (SELECT id FROM regions WHERE code = 'LCS'), 81, '2013-04-20'),
('Team Liquid', 'TL', (SELECT id FROM regions WHERE code = 'LCS'), 78, '2015-01-07'),
('100 Thieves', '100T', (SELECT id FROM regions WHERE code = 'LCS'), 75, '2017-11-02'),
('TSM', 'TSM', (SELECT id FROM regions WHERE code = 'LCS'), 72, '2009-09-21'),
('FlyQuest', 'FLY', (SELECT id FROM regions WHERE code = 'LCS'), 69, '2017-11-27'),
('NRG', 'NRG', (SELECT id FROM regions WHERE code = 'LCS'), 66, '2015-05-12'),
('Shopify Rebellion', 'SR', (SELECT id FROM regions WHERE code = 'LCS'), 63, '2022-01-01'),
('Dignitas', 'DIG', (SELECT id FROM regions WHERE code = 'LCS'), 60, '2003-09-01'),
('Immortals', 'IMT', (SELECT id FROM regions WHERE code = 'LCS'), 57, '2015-09-04'),
('CLG', 'CLG', (SELECT id FROM regions WHERE code = 'LCS'), 54, '2010-04-18');

-- 6.3 创建示例赛季
INSERT INTO seasons (name, year, status, current_phase, start_date, end_date) VALUES
('S1', 2024, 'active', 'spring_regular', '2024-01-15', '2024-11-15');

-- 6.4 创建示例赛事
INSERT INTO competitions (season_id, type, name, format, scoring_rules, max_teams, start_date, end_date) VALUES
((SELECT id FROM seasons WHERE name = 'S1'), 'spring', 'S1春季赛',
 '{"type": "league", "regular_season": {"format": "double_round_robin", "match_format": "BO3"}, "playoffs": {"format": "double_elimination", "match_format": "BO5"}}',
 '{"regular": {"win_2_0": 3, "win_2_1": 2, "loss_1_2": 1, "loss_0_2": 0}, "playoffs": {"champion": 12, "runner_up": 10, "third_place": 8, "fourth_place": 6}}',
 40, '2024-01-15', '2024-04-15');

-- =================================================================
-- 7. 权限设置
-- =================================================================

-- 赋予postgres用户所有权限
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO postgres;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO postgres;
GRANT ALL PRIVILEGES ON ALL FUNCTIONS IN SCHEMA public TO postgres;

-- =================================================================
-- 8. 完成信息
-- =================================================================

SELECT 'Database initialization completed successfully!' as message;
SELECT 'Total tables created: ' || count(*) as tables_count FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE';
SELECT 'Total views created: ' || count(*) as views_count FROM information_schema.views WHERE table_schema = 'public';
SELECT 'Total functions created: ' || count(*) as functions_count FROM information_schema.routines WHERE routine_schema = 'public' AND routine_type = 'FUNCTION';
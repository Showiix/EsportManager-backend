// =================================================================
// 电竞赛事模拟系统 - 类型定义
// =================================================================

// 基础类型定义
export type UUID = string;
export type Timestamp = Date;

// =================================================================
// 数据库实体类型
// =================================================================

// 赛区实体
export interface Region {
  id: UUID;
  name: string;
  code: string;
  description?: string;
  displayOrder: number;
  isActive: boolean;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

// 战队实体
export interface Team {
  id: UUID;
  name: string;
  shortName: string;
  regionId: UUID;
  powerRating: number;
  foundedDate?: Date;
  logoUrl?: string;
  isActive: boolean;
  // 统计字段
  totalMatches: number;
  totalWins: number;
  totalLosses: number;
  netRoundDifference: number;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  // 关联数据
  region?: Region;
}

// 赛季实体
export interface Season {
  id: UUID;
  name: string;
  year: number;
  status: SeasonStatus;
  currentPhase?: string;
  startDate?: Date;
  endDate?: Date;
  description?: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

// 赛事实体
export interface Competition {
  id: UUID;
  seasonId: UUID;
  type: CompetitionType;
  name: string;
  format: CompetitionFormat;
  scoringRules: ScoringRules;
  status: CompetitionStatus;
  maxTeams: number;
  startDate?: Date;
  endDate?: Date;
  description?: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  // 关联数据
  season?: Season;
  teams?: Team[];
}

// 比赛实体
export interface Match {
  id: UUID;
  competitionId: UUID;
  teamAId: UUID;
  teamBId: UUID;
  scoreA: number;
  scoreB: number;
  winnerId?: UUID;
  format: MatchFormat;
  phase: string;
  roundNumber?: number;
  matchNumber?: number;
  status: MatchStatus;
  scheduledAt?: Timestamp;
  startedAt?: Timestamp;
  completedAt?: Timestamp;
  notes?: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  // 关联数据
  competition?: Competition;
  teamA?: Team;
  teamB?: Team;
  winner?: Team;
}

// 积分记录实体
export interface ScoreRecord {
  id: UUID;
  teamId: UUID;
  competitionId: UUID;
  matchId?: UUID;
  points: number;
  pointType: string;
  seasonYear: number;
  earnedAt: Timestamp;
  description?: string;
  createdAt: Timestamp;
  // 关联数据
  team?: Team;
  competition?: Competition;
  match?: Match;
}

// 战队统计实体
export interface TeamStatistics {
  id: UUID;
  teamId: UUID;
  seasonYear: number;
  totalPoints: number;
  springPoints: number;
  msiPoints: number;
  summerPoints: number;
  worldsPoints: number;
  currentRanking?: number;
  peakRanking?: number;
  matchesPlayed: number;
  wins: number;
  losses: number;
  winRate: number;
  lastUpdated: Timestamp;
  // 关联数据
  team?: Team;
}

// 战队交锋记录实体
export interface HeadToHeadRecord {
  id: UUID;
  teamAId: UUID;
  teamBId: UUID;
  totalMatches: number;
  teamAWins: number;
  teamBWins: number;
  lastMatchDate?: Date;
  lastMatchId?: UUID;
  // 关联数据
  teamA?: Team;
  teamB?: Team;
  lastMatch?: Match;
}

// =================================================================
// 枚举类型定义
// =================================================================

export enum SeasonStatus {
  PLANNING = 'planning',
  ACTIVE = 'active',
  COMPLETED = 'completed'
}

export enum CompetitionType {
  SPRING = 'spring',
  SUMMER = 'summer',
  MSI = 'msi',
  WORLDS = 'worlds'
}

export enum CompetitionStatus {
  PLANNING = 'planning',
  ACTIVE = 'active',
  COMPLETED = 'completed'
}

export enum MatchFormat {
  BO1 = 'BO1',
  BO3 = 'BO3',
  BO5 = 'BO5'
}

export enum MatchStatus {
  SCHEDULED = 'scheduled',
  IN_PROGRESS = 'in_progress',
  COMPLETED = 'completed',
  CANCELLED = 'cancelled'
}

// =================================================================
// 复杂类型定义
// =================================================================

// 赛制配置
export interface CompetitionFormat {
  type: string;
  regularSeason?: {
    format: string;
    matchFormat: MatchFormat;
  };
  playoffs?: {
    format: string;
    matchFormat: MatchFormat;
  };
  groupStage?: {
    format: string;
    matchFormat: MatchFormat;
  };
  knockout?: {
    format: string;
    matchFormat: MatchFormat;
  };
}

// 积分规则
export interface ScoringRules {
  regular?: {
    [key: string]: number;
  };
  playoffs?: {
    [key: string]: number;
  };
  groupStage?: {
    [key: string]: number;
  };
  knockout?: {
    [key: string]: number;
  };
}

// =================================================================
// DTO类型定义
// =================================================================

// 创建战队DTO
export interface CreateTeamDto {
  name: string;
  shortName: string;
  regionId: UUID;
  powerRating: number;
  foundedDate?: Date;
  logoUrl?: string;
}

// 更新战队DTO
export interface UpdateTeamDto {
  name?: string;
  shortName?: string;
  regionId?: UUID;
  powerRating?: number;
  foundedDate?: Date;
  logoUrl?: string;
  isActive?: boolean;
}

// 创建赛事DTO
export interface CreateCompetitionDto {
  seasonId: UUID;
  type: CompetitionType;
  name: string;
  format: CompetitionFormat;
  scoringRules: ScoringRules;
  maxTeams?: number;
  startDate?: Date;
  endDate?: Date;
  description?: string;
}

// 更新比赛结果DTO
export interface UpdateMatchResultDto {
  scoreA: number;
  scoreB: number;
  winnerId?: UUID;
  completedAt?: Timestamp;
  notes?: string;
}

// =================================================================
// 业务逻辑类型
// =================================================================

// 排名数据
export interface Ranking {
  teamId: UUID;
  teamName: string;
  shortName: string;
  regionName: string;
  regionCode: string;
  seasonYear: number;
  totalPoints: number;
  springPoints: number;
  msiPoints: number;
  summerPoints: number;
  worldsPoints: number;
  ranking: number;
  matchesPlayed: number;
  wins: number;
  losses: number;
  winRate: number;
}

// 历史交锋统计
export interface HeadToHeadStats {
  totalMatches: number;
  teamAWins: number;
  teamBWins: number;
  recentMatches: Match[];
  competitionBreakdown: { [competitionType: string]: number };
  winRateTrend: number[];
}

// 赛区分析数据
export interface RegionAnalysis {
  id: UUID;
  name: string;
  teamCount: number;
  avgPowerRating: number;
  totalWins: number;
  totalMatches: number;
  avgWinRate: number;
}

// 积分趋势数据
export interface PointsTrend {
  teamId: UUID;
  seasonYear: number;
  totalPoints: number;
  trendData: PointsTrendData[];
  milestones: Milestone[];
}

export interface PointsTrendData {
  date: Date;
  points: number;
  cumulativePoints: number;
  competitionType: string;
  competitionName: string;
}

export interface Milestone {
  date: Date;
  points: number;
  description: string;
}

// 比赛预测数据
export interface MatchPrediction {
  teamAWinProbability: number;
  teamBWinProbability: number;
  confidence: number;
  factors: {
    powerRating: number;
    recentForm: number;
    headToHead: number;
  };
}

// =================================================================
// API响应类型
// =================================================================

// 统一API响应格式
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: any;
  };
  meta?: {
    pagination?: {
      page: number;
      limit: number;
      total: number;
      totalPages: number;
    };
    timestamp: string;
    requestId: string;
  };
}

// 分页参数
export interface PaginationParams {
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  filter?: Record<string, any>;
}

// =================================================================
// 季后赛相关类型定义
// =================================================================

// 季后赛晋级资格
export interface PlayoffQualification {
  teamId: string;
  teamName: string;
  regionId: string;
  seed: number; // 种子位 1-4
  regularSeasonRank: number;
  regularSeasonPoints: number;
  wins: number;
  losses: number;
}

// 季后赛比赛类型
export type PlayoffMatchType = 'winners_bracket' | 'losers_bracket' | 'grand_final';

// 季后赛比赛状态
export type PlayoffMatchStatus = 'pending' | 'in_progress' | 'completed';

// 季后赛对阵表状态
export type PlayoffBracketStatus = 'not_started' | 'in_progress' | 'completed';

// 季后赛比赛(扩展Match)
export interface PlayoffMatch {
  id: string;
  competitionId: string;
  playoffBracketId: string;
  roundNumber: number;
  matchType: PlayoffMatchType;
  bestOf: number; // BO5 = 5
  teamAId?: string;
  teamBId?: string;
  teamAName?: string;
  teamBName?: string;
  teamASeed?: number;
  teamBSeed?: number;
  scoreA: number;
  scoreB: number;
  winnerId?: string;
  status: PlayoffMatchStatus;
  nextMatchId?: string; // 胜者去向
  loserNextMatchId?: string; // 败者去向
  scheduledAt?: Date;
  completedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

// 季后赛轮次
export interface PlayoffRound {
  roundNumber: number;
  roundName: string;
  bracketType: 'winners' | 'losers' | 'grand_final';
  matches: PlayoffMatch[];
  status: 'pending' | 'in_progress' | 'completed';
}

// 季后赛对阵表
export interface PlayoffBracket {
  id: string;
  competitionId: string;
  regionId: string;
  regionName: string;
  competitionType: 'spring' | 'summer';
  status: PlayoffBracketStatus;
  qualifiedTeams: PlayoffQualification[];
  rounds: PlayoffRound[];

  // 最终排名
  champion?: PlayoffQualification;
  runnerUp?: PlayoffQualification;
  thirdPlace?: PlayoffQualification;
  fourthPlace?: PlayoffQualification;

  // 积分分配
  pointsDistribution: {
    champion: number; // 12
    runnerUp: number; // 10
    thirdPlace: number; // 8
    fourthPlace: number; // 6
  };

  createdAt: Date;
  updatedAt: Date;
}

// 生成季后赛请求
export interface GeneratePlayoffRequest {
  competitionId: string;
  regionId: string;
  seasonId: string;
  competitionType: 'spring' | 'summer';
}

// 模拟季后赛比赛请求
export interface SimulatePlayoffMatchRequest {
  matchId: string;
  competitionId: string;
}

// 模拟季后赛比赛响应
export interface SimulatePlayoffMatchResponse {
  match: PlayoffMatch;
  bracket: PlayoffBracket;
  isPlayoffComplete: boolean;
  finalStandings?: {
    champion: PlayoffQualification;
    runnerUp: PlayoffQualification;
    thirdPlace: PlayoffQualification;
    fourthPlace: PlayoffQualification;
  };
}

// =================================================================
// 错误类型定义
// =================================================================

export enum ErrorCodes {
  TEAM_NOT_FOUND = 'TEAM_NOT_FOUND',
  COMPETITION_NOT_ACTIVE = 'COMPETITION_NOT_ACTIVE',
  INVALID_MATCH_RESULT = 'INVALID_MATCH_RESULT',
  DRAW_ALREADY_COMPLETED = 'DRAW_ALREADY_COMPLETED',
  INSUFFICIENT_TEAMS = 'INSUFFICIENT_TEAMS',
  INVALID_SCORING_RULES = 'INVALID_SCORING_RULES',
  SEASON_NOT_ACTIVE = 'SEASON_NOT_ACTIVE',
  MATCH_ALREADY_COMPLETED = 'MATCH_ALREADY_COMPLETED',
  INVALID_COMPETITION_FORMAT = 'INVALID_COMPETITION_FORMAT',
  PLAYOFF_ALREADY_EXISTS = 'PLAYOFF_ALREADY_EXISTS',
  REGULAR_SEASON_NOT_COMPLETE = 'REGULAR_SEASON_NOT_COMPLETE',
  PLAYOFF_NOT_FOUND = 'PLAYOFF_NOT_FOUND',
  PLAYOFF_MATCH_NOT_READY = 'PLAYOFF_MATCH_NOT_READY',
  MSI_ALREADY_EXISTS = 'MSI_ALREADY_EXISTS',
  MSI_NOT_FOUND = 'MSI_NOT_FOUND',
  MSI_MATCH_NOT_READY = 'MSI_MATCH_NOT_READY',
  ALL_SPRING_PLAYOFFS_NOT_COMPLETE = 'ALL_SPRING_PLAYOFFS_NOT_COMPLETE'
}

// 自定义错误类
export class BusinessError extends Error {
  constructor(
    public code: ErrorCodes,
    message: string,
    public details?: any
  ) {
    super(message);
    this.name = 'BusinessError';
  }
}

// =================================================================
// 服务接口类型
// =================================================================

// 数据库查询选项
export interface QueryOptions {
  include?: string[];
  pagination?: PaginationParams;
  filter?: Record<string, any>;
}

// 缓存选项
export interface CacheOptions {
  ttl?: number;
  key?: string;
  invalidatePattern?: string;
}

// =================================================================
// MSI季中赛相关类型定义
// =================================================================

// MSI参赛队伍资格
export interface MSIQualification {
  teamId: string;
  teamName: string;
  regionId: string;
  regionName: string;
  seed: number; // 1: 冠军(传奇组), 2: 亚军(挑战者组), 3: 季军(资格赛组)
  springPlayoffRank: number; // 春季赛季后赛排名
  springPlayoffPoints: number; // 春季赛季后赛积分
  group: 'legendary' | 'challenger' | 'qualifier'; // 所属分组
}

// MSI比赛类型
export type MSIMatchType =
  | 'qualifier_knockout' // 资格赛组单淘汰
  | 'challenger_match' // 挑战者组对决
  | 'losers_round_1' // 败者组第一轮
  | 'losers_round_2' // 败者组第二轮
  | 'winners_round_1' // 胜者组第一轮(传奇组对决)
  | 'losers_round_3' // 败者组第三轮
  | 'losers_round_4' // 败者组第四轮(攀登者赛)
  | 'winners_round_2' // 胜者组第二轮
  | 'losers_final' // 败者组决赛
  | 'grand_final'; // 总决赛

// MSI比赛状态
export type MSIMatchStatus = 'pending' | 'in_progress' | 'completed';

// MSI对阵表状态
export type MSIBracketStatus = 'not_started' | 'in_progress' | 'completed';

// MSI比赛
export interface MSIMatch {
  id: string;
  msiBracketId: string;
  roundNumber: number;
  matchType: MSIMatchType;
  bestOf: number; // BO5 = 5
  bracketType: 'winners' | 'losers' | 'qualifier' | 'challenger' | 'grand_final';
  teamAId?: string;
  teamBId?: string;
  teamAName?: string;
  teamBName?: string;
  teamASeed?: number;
  teamBSeed?: number;
  scoreA: number;
  scoreB: number;
  winnerId?: string;
  status: MSIMatchStatus;
  nextMatchId?: string; // 胜者去向
  loserNextMatchId?: string; // 败者去向
  matchNumber?: number; // 比赛编号
  scheduledAt?: Date;
  completedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

// MSI轮次
export interface MSIRound {
  roundNumber: number;
  roundName: string;
  stage: 'qualifier' | 'main'; // 预选赛阶段或正式阶段
  bracketType: 'winners' | 'losers' | 'qualifier' | 'challenger' | 'grand_final';
  matches: MSIMatch[];
  startDate?: string;
  endDate?: string;
  status: 'pending' | 'in_progress' | 'completed';
}

// MSI对阵表
export interface MSIBracket {
  id: string;
  seasonId: string;
  seasonYear: number;
  status: MSIBracketStatus;

  // 参赛队伍分组
  qualifiedTeams: MSIQualification[];
  legendaryGroup: MSIQualification[]; // 4队: 各赛区春季赛冠军
  challengerGroup: MSIQualification[]; // 4队: 各赛区春季赛亚军
  qualifierGroup: MSIQualification[]; // 4队: 各赛区春季赛季军

  // 对阵信息
  rounds: MSIRound[];

  // 最终排名
  champion?: MSIQualification;
  runnerUp?: MSIQualification;
  thirdPlace?: MSIQualification;
  fourthPlace?: MSIQualification;

  // 其他排名(用于积分分配)
  loserRound2?: MSIQualification[]; // 败者组第二轮淘汰(2队)
  loserRound1?: MSIQualification[]; // 败者组第一轮淘汰(2队)

  // 积分分配规则
  pointsDistribution: {
    champion: number; // 20分
    runnerUp: number; // 16分
    thirdPlace: number; // 12分
    fourthPlace: number; // 8分
    loserRound2: number; // 6分
    loserRound1: number; // 4分
  };

  createdAt: Date;
  updatedAt: Date;
}

// MSI生成请求
export interface GenerateMSIRequest {
  seasonId: string;
}

// MSI模拟请求
export interface SimulateMSIMatchRequest {
  matchId: string;
  msiId: string;
}

// MSI模拟响应
export interface SimulateMSIMatchResponse {
  match: MSIMatch;
  winner: MSIQualification;
  loser: MSIQualification;
  nextMatch?: MSIMatch;
  loserNextMatch?: MSIMatch;
  isMSIComplete: boolean;
  finalStandings?: {
    champion?: MSIQualification;
    runnerUp?: MSIQualification;
    thirdPlace?: MSIQualification;
    fourthPlace?: MSIQualification;
    loserRound2?: MSIQualification[];
    loserRound1?: MSIQualification[];
  };
}

// MSI资格检查响应
export interface MSIEligibilityResponse {
  eligible: boolean;
  reason?: string;
  qualifiedTeams?: MSIQualification[];
  legendaryGroup?: MSIQualification[];
  challengerGroup?: MSIQualification[];
  qualifierGroup?: MSIQualification[];
}
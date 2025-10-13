// =================================================================
// 电竞赛事模拟系统 - MSI季中赛服务
// =================================================================

import { PoolClient } from 'pg';
import { db } from '@/config/database';
import { logger } from '@/utils/logger';
import {
  MSIBracket,
  MSIMatch,
  MSIQualification,
  MSIRound,
  GenerateMSIRequest,
  SimulateMSIMatchRequest,
  SimulateMSIMatchResponse,
  MSIEligibilityResponse,
  BusinessError,
  ErrorCodes
} from '../types';

export class MSIService {
  /**
   * 检查是否可以生成MSI
   * 要求: 所有4个赛区的春季赛季后赛都已完成
   */
  async checkMSIEligibility(seasonId: string): Promise<MSIEligibilityResponse> {
    try {
      // 1. 检查赛季是否存在
      const seasonQuery = `SELECT * FROM seasons WHERE id = $1`;
      const seasonResult = await db.query(seasonQuery, [seasonId]);

      if (seasonResult.rows.length === 0) {
        return {
          eligible: false,
          reason: '赛季不存在'
        };
      }

      const season = seasonResult.rows[0];

      // 2. 检查是否已有MSI
      const existingMSIQuery = `SELECT id FROM msi_brackets WHERE season_id = $1`;
      const existingResult = await db.query(existingMSIQuery, [seasonId]);

      if (existingResult.rows.length > 0) {
        return {
          eligible: false,
          reason: '该赛季MSI已生成'
        };
      }

      // 3. 获取所有赛区
      const regionsQuery = `SELECT id, name FROM regions WHERE is_active = true ORDER BY id`;
      const regionsResult = await db.query(regionsQuery);

      if (regionsResult.rows.length < 4) {
        return {
          eligible: false,
          reason: `活跃赛区不足4个(当前${regionsResult.rows.length}个)`
        };
      }

      const regions = regionsResult.rows.slice(0, 4); // 只取前4个赛区

      // 4. 检查每个赛区的春季赛季后赛是否完成
      const legendaryGroup: MSIQualification[] = [];
      const challengerGroup: MSIQualification[] = [];
      const qualifierGroup: MSIQualification[] = [];

      for (const region of regions) {
        // 获取该赛区当前赛季的春季赛季后赛
        const playoffQuery = `
          SELECT pb.*, pb.status as bracket_status
          FROM playoff_brackets pb
          JOIN competitions c ON c.id = pb.competition_id
          WHERE c.season_id = $1
            AND pb.region_id = $2
            AND pb.competition_type = 'spring'
          ORDER BY pb.created_at DESC
          LIMIT 1
        `;

        const playoffResult = await db.query(playoffQuery, [seasonId, region.id]);

        if (playoffResult.rows.length === 0) {
          return {
            eligible: false,
            reason: `赛区${region.name}的春季赛季后赛尚未生成`
          };
        }

        const playoff = playoffResult.rows[0];

        if (playoff.bracket_status !== 'completed') {
          return {
            eligible: false,
            reason: `赛区${region.name}的春季赛季后赛尚未完成`
          };
        }

        // 获取该赛区春季赛季后赛的前3名
        if (!playoff.champion_id || !playoff.runner_up_id || !playoff.third_place_id) {
          return {
            eligible: false,
            reason: `赛区${region.name}的春季赛季后赛排名不完整`
          };
        }

        const qualifiedTeams = playoff.qualified_teams;

        // 查找冠亚季军信息
        const champion = qualifiedTeams.find((t: any) => t.teamId === playoff.champion_id.toString());
        const runnerUp = qualifiedTeams.find((t: any) => t.teamId === playoff.runner_up_id.toString());
        const thirdPlace = qualifiedTeams.find((t: any) => t.teamId === playoff.third_place_id.toString());

        if (!champion || !runnerUp || !thirdPlace) {
          return {
            eligible: false,
            reason: `赛区${region.name}的季后赛队伍信息不完整`
          };
        }

        // 分配到对应组别
        legendaryGroup.push({
          ...champion,
          regionName: region.name,
          seed: 1,
          springPlayoffRank: 1,
          springPlayoffPoints: playoff.points_distribution.champion || 12,
          group: 'legendary'
        });

        challengerGroup.push({
          ...runnerUp,
          regionName: region.name,
          seed: 2,
          springPlayoffRank: 2,
          springPlayoffPoints: playoff.points_distribution.runnerUp || 10,
          group: 'challenger'
        });

        qualifierGroup.push({
          ...thirdPlace,
          regionName: region.name,
          seed: 3,
          springPlayoffRank: 3,
          springPlayoffPoints: playoff.points_distribution.thirdPlace || 8,
          group: 'qualifier'
        });
      }

      const qualifiedTeams = [...legendaryGroup, ...challengerGroup, ...qualifierGroup];

      return {
        eligible: true,
        qualifiedTeams,
        legendaryGroup,
        challengerGroup,
        qualifierGroup
      };
    } catch (error: any) {
      logger.error('检查MSI资格失败', { error: error.message, seasonId });
      throw new BusinessError(
        ErrorCodes.INVALID_COMPETITION_FORMAT,
        '检查MSI资格失败',
        error.message
      );
    }
  }

  /**
   * 获取MSI资格队伍
   */
  async getQualifiedTeams(seasonId: string): Promise<MSIQualification[]> {
    const eligibility = await this.checkMSIEligibility(seasonId);
    if (!eligibility.eligible) {
      throw new BusinessError(
        ErrorCodes.ALL_SPRING_PLAYOFFS_NOT_COMPLETE,
        eligibility.reason || '无法获取MSI资格队伍'
      );
    }
    return eligibility.qualifiedTeams!;
  }

  /**
   * 生成MSI对阵
   */
  async generateMSI(request: GenerateMSIRequest): Promise<MSIBracket> {
    const client = await db.getClient();

    try {
      await client.query('BEGIN');

      // 1. 检查资格
      const eligibility = await this.checkMSIEligibility(request.seasonId);
      if (!eligibility.eligible) {
        throw new BusinessError(
          ErrorCodes.ALL_SPRING_PLAYOFFS_NOT_COMPLETE,
          eligibility.reason || '无法生成MSI'
        );
      }

      const { qualifiedTeams, legendaryGroup, challengerGroup, qualifierGroup } = eligibility;

      // 2. 获取赛季年份
      const seasonQuery = `SELECT year FROM seasons WHERE id = $1`;
      const seasonResult = await client.query(seasonQuery, [request.seasonId]);
      const seasonYear = seasonResult.rows[0]?.year || new Date().getFullYear();

      // 3. 创建MSI对阵表
      const insertBracketQuery = `
        INSERT INTO msi_brackets (
          season_id, season_year, status,
          qualified_teams, legendary_group, challenger_group, qualifier_group,
          points_distribution
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING *
      `;

      const pointsDistribution = {
        champion: 20,
        runnerUp: 16,
        thirdPlace: 12,
        fourthPlace: 8,
        loserRound2: 6,
        loserRound1: 4
      };

      const bracketResult = await client.query(insertBracketQuery, [
        request.seasonId,
        seasonYear,
        'not_started',
        JSON.stringify(qualifiedTeams),
        JSON.stringify(legendaryGroup),
        JSON.stringify(challengerGroup),
        JSON.stringify(qualifierGroup),
        JSON.stringify(pointsDistribution)
      ]);

      const bracketId = bracketResult.rows[0].id;

      // 4. 生成双败淘汰赛制的比赛
      const matches = await this.generateMSIMatches(
        client,
        bracketId,
        legendaryGroup!,
        challengerGroup!,
        qualifierGroup!
      );

      // 5. 构建轮次信息
      const rounds = this.buildMSIRounds(matches);

      await client.query('COMMIT');

      // 6. 返回完整的MSI对阵
      return {
        id: bracketId,
        seasonId: request.seasonId,
        seasonYear,
        status: 'not_started',
        qualifiedTeams: qualifiedTeams!,
        legendaryGroup: legendaryGroup!,
        challengerGroup: challengerGroup!,
        qualifierGroup: qualifierGroup!,
        rounds,
        pointsDistribution,
        createdAt: new Date(),
        updatedAt: new Date()
      };
    } catch (error: any) {
      await client.query('ROLLBACK');
      logger.error('生成MSI失败', { error: error.message, request });

      if (error instanceof BusinessError) {
        throw error;
      }

      throw new BusinessError(
        ErrorCodes.INVALID_COMPETITION_FORMAT,
        '生成MSI失败',
        error.message
      );
    } finally {
      client.release();
    }
  }

  /**
   * 生成MSI双败淘汰赛制的所有比赛
   *
   * MSI赛制:
   * 1. 预选赛阶段:
   *    - 资格赛组: 4队两两单淘汰(2场) -> 2胜者进败者组第一轮
   *    - 挑战者组: 4队对决(2场) -> 2胜者进败者组第二轮, 2败者进败者组第一轮
   *
   * 2. 正式阶段:
   *    - 败者组第一轮: 资格赛胜者 vs 挑战者败者 (2场) -> 胜者进败者组第二轮
   *    - 败者组第二轮: 挑战者胜者 vs 败者组第一轮胜者 (2场) -> 胜者进败者组第三轮
   *    - 胜者组第一轮: 4传奇组对决 (2场) -> 胜者进胜者组第二轮, 败者进败者组第三轮
   *    - 败者组第三轮: 败者组第二轮胜者 vs 胜者组第一轮败者 (2场) -> 2胜者进败者组第四轮
   *    - 败者组第四轮: 2胜者对决 (1场) -> 攀登者胜者
   *    - 胜者组第二轮: 2胜者对决 (1场) -> 胜者进总决赛, 败者与攀登者胜者PK
   *    - 败者组决赛: 胜者组第二轮败者 vs 攀登者胜者 (1场) -> 胜者进总决赛
   *    - 总决赛: 胜者组冠军 vs 败者组决赛胜者 (1场) -> 决出冠亚军
   */
  private async generateMSIMatches(
    client: PoolClient,
    bracketId: string,
    legendary: MSIQualification[],
    challenger: MSIQualification[],
    qualifier: MSIQualification[]
  ): Promise<MSIMatch[]> {
    const matches: MSIMatch[] = [];
    let matchNumber = 1;

    // === 预选赛阶段 ===

    // 资格赛组第一轮: Q1 vs Q2
    const qualifierMatch1 = await this.createMSIMatch(client, {
      bracketId,
      roundNumber: 1,
      matchType: 'qualifier_knockout',
      bracketType: 'qualifier',
      teamAId: qualifier[0].teamId,
      teamBId: qualifier[1].teamId,
      teamAName: qualifier[0].teamName,
      teamBName: qualifier[1].teamName,
      teamASeed: qualifier[0].seed,
      teamBSeed: qualifier[1].seed,
      matchNumber: matchNumber++
    });
    matches.push(qualifierMatch1);

    // 资格赛组第二轮: Q3 vs Q4
    const qualifierMatch2 = await this.createMSIMatch(client, {
      bracketId,
      roundNumber: 1,
      matchType: 'qualifier_knockout',
      bracketType: 'qualifier',
      teamAId: qualifier[2].teamId,
      teamBId: qualifier[3].teamId,
      teamAName: qualifier[2].teamName,
      teamBName: qualifier[3].teamName,
      teamASeed: qualifier[2].seed,
      teamBSeed: qualifier[3].seed,
      matchNumber: matchNumber++
    });
    matches.push(qualifierMatch2);

    // 挑战者组第一轮: C1 vs C2
    const challengerMatch1 = await this.createMSIMatch(client, {
      bracketId,
      roundNumber: 1,
      matchType: 'challenger_match',
      bracketType: 'challenger',
      teamAId: challenger[0].teamId,
      teamBId: challenger[1].teamId,
      teamAName: challenger[0].teamName,
      teamBName: challenger[1].teamName,
      teamASeed: challenger[0].seed,
      teamBSeed: challenger[1].seed,
      matchNumber: matchNumber++
    });
    matches.push(challengerMatch1);

    // 挑战者组第二轮: C3 vs C4
    const challengerMatch2 = await this.createMSIMatch(client, {
      bracketId,
      roundNumber: 1,
      matchType: 'challenger_match',
      bracketType: 'challenger',
      teamAId: challenger[2].teamId,
      teamBId: challenger[3].teamId,
      teamAName: challenger[2].teamName,
      teamBName: challenger[3].teamName,
      teamASeed: challenger[2].seed,
      teamBSeed: challenger[3].seed,
      matchNumber: matchNumber++
    });
    matches.push(challengerMatch2);

    // === 正式阶段 ===

    // 败者组第一轮: 2场 (资格赛胜者 vs 挑战者败者)
    const losersR1Match1 = await this.createMSIMatch(client, {
      bracketId,
      roundNumber: 2,
      matchType: 'losers_round_1',
      bracketType: 'losers',
      teamAId: null,
      teamBId: null,
      matchNumber: matchNumber++
    });
    matches.push(losersR1Match1);

    const losersR1Match2 = await this.createMSIMatch(client, {
      bracketId,
      roundNumber: 2,
      matchType: 'losers_round_1',
      bracketType: 'losers',
      teamAId: null,
      teamBId: null,
      matchNumber: matchNumber++
    });
    matches.push(losersR1Match2);

    // 败者组第二轮: 2场 (挑战者胜者 vs 败者组第一轮胜者)
    const losersR2Match1 = await this.createMSIMatch(client, {
      bracketId,
      roundNumber: 3,
      matchType: 'losers_round_2',
      bracketType: 'losers',
      teamAId: null,
      teamBId: null,
      matchNumber: matchNumber++
    });
    matches.push(losersR2Match1);

    const losersR2Match2 = await this.createMSIMatch(client, {
      bracketId,
      roundNumber: 3,
      matchType: 'losers_round_2',
      bracketType: 'losers',
      teamAId: null,
      teamBId: null,
      matchNumber: matchNumber++
    });
    matches.push(losersR2Match2);

    // 胜者组第一轮: 2场 (传奇组对决)
    const winnersR1Match1 = await this.createMSIMatch(client, {
      bracketId,
      roundNumber: 3,
      matchType: 'winners_round_1',
      bracketType: 'winners',
      teamAId: legendary[0].teamId,
      teamBId: legendary[1].teamId,
      teamAName: legendary[0].teamName,
      teamBName: legendary[1].teamName,
      teamASeed: legendary[0].seed,
      teamBSeed: legendary[1].seed,
      matchNumber: matchNumber++
    });
    matches.push(winnersR1Match1);

    const winnersR1Match2 = await this.createMSIMatch(client, {
      bracketId,
      roundNumber: 3,
      matchType: 'winners_round_1',
      bracketType: 'winners',
      teamAId: legendary[2].teamId,
      teamBId: legendary[3].teamId,
      teamAName: legendary[2].teamName,
      teamBName: legendary[3].teamName,
      teamASeed: legendary[2].seed,
      teamBSeed: legendary[3].seed,
      matchNumber: matchNumber++
    });
    matches.push(winnersR1Match2);

    // 败者组第三轮: 2场
    const losersR3Match1 = await this.createMSIMatch(client, {
      bracketId,
      roundNumber: 4,
      matchType: 'losers_round_3',
      bracketType: 'losers',
      teamAId: null,
      teamBId: null,
      matchNumber: matchNumber++
    });
    matches.push(losersR3Match1);

    const losersR3Match2 = await this.createMSIMatch(client, {
      bracketId,
      roundNumber: 4,
      matchType: 'losers_round_3',
      bracketType: 'losers',
      teamAId: null,
      teamBId: null,
      matchNumber: matchNumber++
    });
    matches.push(losersR3Match2);

    // 败者组第四轮(攀登者赛): 1场
    const losersR4Match = await this.createMSIMatch(client, {
      bracketId,
      roundNumber: 5,
      matchType: 'losers_round_4',
      bracketType: 'losers',
      teamAId: null,
      teamBId: null,
      matchNumber: matchNumber++
    });
    matches.push(losersR4Match);

    // 胜者组第二轮: 1场
    const winnersR2Match = await this.createMSIMatch(client, {
      bracketId,
      roundNumber: 5,
      matchType: 'winners_round_2',
      bracketType: 'winners',
      teamAId: null,
      teamBId: null,
      matchNumber: matchNumber++
    });
    matches.push(winnersR2Match);

    // 败者组决赛: 1场
    const losersFinalMatch = await this.createMSIMatch(client, {
      bracketId,
      roundNumber: 6,
      matchType: 'losers_final',
      bracketType: 'losers',
      teamAId: null,
      teamBId: null,
      matchNumber: matchNumber++
    });
    matches.push(losersFinalMatch);

    // 总决赛: 1场
    const grandFinalMatch = await this.createMSIMatch(client, {
      bracketId,
      roundNumber: 7,
      matchType: 'grand_final',
      bracketType: 'grand_final',
      teamAId: null,
      teamBId: null,
      matchNumber: matchNumber++
    });
    matches.push(grandFinalMatch);

    // 设置比赛去向关系
    // 资格赛组 -> 败者组第一轮
    await this.updateMatchNextIds(client, qualifierMatch1.id, losersR1Match1.id, null);
    await this.updateMatchNextIds(client, qualifierMatch2.id, losersR1Match2.id, null);

    // 挑战者组 -> 胜者进败者组第二轮, 败者进败者组第一轮
    await this.updateMatchNextIds(client, challengerMatch1.id, losersR2Match1.id, losersR1Match1.id);
    await this.updateMatchNextIds(client, challengerMatch2.id, losersR2Match2.id, losersR1Match2.id);

    // 败者组第一轮 -> 败者组第二轮
    await this.updateMatchNextIds(client, losersR1Match1.id, losersR2Match1.id, null);
    await this.updateMatchNextIds(client, losersR1Match2.id, losersR2Match2.id, null);

    // 败者组第二轮 -> 败者组第三轮
    await this.updateMatchNextIds(client, losersR2Match1.id, losersR3Match1.id, null);
    await this.updateMatchNextIds(client, losersR2Match2.id, losersR3Match2.id, null);

    // 胜者组第一轮 -> 胜者进胜者组第二轮, 败者进败者组第三轮
    await this.updateMatchNextIds(client, winnersR1Match1.id, winnersR2Match.id, losersR3Match1.id);
    await this.updateMatchNextIds(client, winnersR1Match2.id, winnersR2Match.id, losersR3Match2.id);

    // 败者组第三轮 -> 败者组第四轮
    await this.updateMatchNextIds(client, losersR3Match1.id, losersR4Match.id, null);
    await this.updateMatchNextIds(client, losersR3Match2.id, losersR4Match.id, null);

    // 败者组第四轮 -> 败者组决赛
    await this.updateMatchNextIds(client, losersR4Match.id, losersFinalMatch.id, null);

    // 胜者组第二轮 -> 胜者进总决赛, 败者进败者组决赛
    await this.updateMatchNextIds(client, winnersR2Match.id, grandFinalMatch.id, losersFinalMatch.id);

    // 败者组决赛 -> 总决赛
    await this.updateMatchNextIds(client, losersFinalMatch.id, grandFinalMatch.id, null);

    return matches;
  }

  /**
   * 创建单场MSI比赛
   */
  private async createMSIMatch(client: PoolClient, data: {
    bracketId: string;
    roundNumber: number;
    matchType: string;
    bracketType: string;
    teamAId: string | null;
    teamBId: string | null;
    teamAName?: string;
    teamBName?: string;
    teamASeed?: number;
    teamBSeed?: number;
    matchNumber?: number;
  }): Promise<MSIMatch> {
    const query = `
      INSERT INTO msi_matches (
        msi_bracket_id, round_number, match_type, bracket_type,
        best_of, team_a_id, team_b_id, team_a_name, team_b_name,
        team_a_seed, team_b_seed, score_a, score_b, status, match_number
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
      RETURNING *
    `;

    const result = await client.query(query, [
      data.bracketId,
      data.roundNumber,
      data.matchType,
      data.bracketType,
      5, // BO5
      data.teamAId,
      data.teamBId,
      data.teamAName || null,
      data.teamBName || null,
      data.teamASeed || null,
      data.teamBSeed || null,
      0,
      0,
      data.teamAId && data.teamBId ? 'pending' : 'pending',
      data.matchNumber || null
    ]);

    const row = result.rows[0];
    return this.mapRowToMatch(row);
  }

  /**
   * 更新比赛的去向关系
   */
  private async updateMatchNextIds(
    client: PoolClient,
    matchId: string,
    nextMatchId: string | null,
    loserNextMatchId: string | null
  ): Promise<void> {
    const query = `
      UPDATE msi_matches
      SET next_match_id = $2, loser_next_match_id = $3
      WHERE id = $1
    `;
    await client.query(query, [matchId, nextMatchId, loserNextMatchId]);
  }

  /**
   * 获取MSI对阵信息
   */
  async getMSIBracket(seasonId: string): Promise<MSIBracket | null> {
    try {
      // 1. 获取对阵表信息
      const bracketQuery = `
        SELECT * FROM msi_brackets
        WHERE season_id = $1
      `;
      const bracketResult = await db.query(bracketQuery, [seasonId]);

      if (bracketResult.rows.length === 0) {
        return null;
      }

      const bracket = bracketResult.rows[0];

      // 2. 获取所有比赛
      const matchesQuery = `
        SELECT * FROM msi_matches
        WHERE msi_bracket_id = $1
        ORDER BY match_number, round_number, id
      `;
      const matchesResult = await db.query(matchesQuery, [bracket.id]);
      const matches = matchesResult.rows.map((row: any) => this.mapRowToMatch(row));

      // 3. 构建轮次信息
      const rounds = this.buildMSIRounds(matches);

      // 4. 获取最终排名
      let champion, runnerUp, thirdPlace, fourthPlace;
      let loserRound2, loserRound1;

      if (bracket.champion_id) {
        champion = bracket.qualified_teams.find((t: any) => t.teamId === bracket.champion_id.toString());
      }
      if (bracket.runner_up_id) {
        runnerUp = bracket.qualified_teams.find((t: any) => t.teamId === bracket.runner_up_id.toString());
      }
      if (bracket.third_place_id) {
        thirdPlace = bracket.qualified_teams.find((t: any) => t.teamId === bracket.third_place_id.toString());
      }
      if (bracket.fourth_place_id) {
        fourthPlace = bracket.qualified_teams.find((t: any) => t.teamId === bracket.fourth_place_id.toString());
      }

      loserRound2 = bracket.loser_round_2;
      loserRound1 = bracket.loser_round_1;

      return {
        id: bracket.id,
        seasonId: bracket.season_id,
        seasonYear: bracket.season_year,
        status: bracket.status,
        qualifiedTeams: bracket.qualified_teams,
        legendaryGroup: bracket.legendary_group,
        challengerGroup: bracket.challenger_group,
        qualifierGroup: bracket.qualifier_group,
        rounds,
        champion,
        runnerUp,
        thirdPlace,
        fourthPlace,
        loserRound2,
        loserRound1,
        pointsDistribution: bracket.points_distribution,
        createdAt: bracket.created_at,
        updatedAt: bracket.updated_at
      };
    } catch (error: any) {
      logger.error('获取MSI对阵失败', { error: error.message, seasonId });
      throw new BusinessError(
        ErrorCodes.MSI_NOT_FOUND,
        '获取MSI对阵失败',
        error.message
      );
    }
  }

  /**
   * 模拟MSI单场比赛(BO5)
   */
  async simulateMSIMatch(request: SimulateMSIMatchRequest): Promise<SimulateMSIMatchResponse> {
    const client = await db.getClient();

    try {
      await client.query('BEGIN');

      // 1. 获取比赛信息
      const matchQuery = `SELECT * FROM msi_matches WHERE id = $1`;
      const matchResult = await client.query(matchQuery, [request.matchId]);

      if (matchResult.rows.length === 0) {
        throw new BusinessError(ErrorCodes.MSI_NOT_FOUND, '比赛不存在');
      }

      const matchRow = matchResult.rows[0];

      // 检查比赛是否已完成
      if (matchRow.status === 'completed') {
        throw new BusinessError(ErrorCodes.MATCH_ALREADY_COMPLETED, '比赛已完成');
      }

      // 检查双方队伍是否都已确定
      if (!matchRow.team_a_id || !matchRow.team_b_id) {
        throw new BusinessError(ErrorCodes.MSI_MATCH_NOT_READY, '比赛队伍尚未确定');
      }

      // 2. 模拟BO5比赛
      const { scoreA, scoreB, winnerId } = await this.simulateBO5Match(
        client,
        matchRow.team_a_id,
        matchRow.team_b_id
      );

      const loserId = winnerId === matchRow.team_a_id ? matchRow.team_b_id : matchRow.team_a_id;

      // 3. 更新比赛结果
      const updateMatchQuery = `
        UPDATE msi_matches
        SET score_a = $2, score_b = $3, winner_id = $4, status = $5, completed_at = NOW()
        WHERE id = $1
        RETURNING *
      `;
      const updatedMatchResult = await client.query(updateMatchQuery, [
        request.matchId,
        scoreA,
        scoreB,
        winnerId,
        'completed'
      ]);

      const updatedMatch = this.mapRowToMatch(updatedMatchResult.rows[0]);

      // 4. 推进到下一轮
      await this.advanceToNextRound(client, matchRow, winnerId, loserId);

      // 5. 检查MSI是否完成
      const isMSIComplete = await this.checkMSIComplete(client, matchRow.msi_bracket_id);

      // 6. 获取获胜者和败者的资格信息
      const bracketQuery = `SELECT qualified_teams FROM msi_brackets WHERE id = $1`;
      const bracketResult = await client.query(bracketQuery, [matchRow.msi_bracket_id]);
      const qualifiedTeams = bracketResult.rows[0].qualified_teams;

      const winner = qualifiedTeams.find((t: any) => t.teamId === winnerId.toString());
      const loser = qualifiedTeams.find((t: any) => t.teamId === loserId.toString());

      let finalStandings;
      if (isMSIComplete) {
        // 更新最终排名
        finalStandings = await this.updateFinalStandings(client, matchRow.msi_bracket_id);

        // 分配赛事积分
        await this.distributeMSIPoints(client, matchRow.msi_bracket_id, finalStandings);
      }

      await client.query('COMMIT');

      return {
        match: updatedMatch,
        winner,
        loser,
        isMSIComplete,
        finalStandings
      };
    } catch (error: any) {
      await client.query('ROLLBACK');
      logger.error('模拟MSI比赛失败', { error: error.message, request });

      if (error instanceof BusinessError) {
        throw error;
      }

      throw new BusinessError(
        ErrorCodes.INVALID_MATCH_RESULT,
        '模拟MSI比赛失败',
        error.message
      );
    } finally {
      client.release();
    }
  }

  /**
   * 模拟BO5比赛
   */
  private async simulateBO5Match(
    client: PoolClient,
    teamAId: string,
    teamBId: string
  ): Promise<{ scoreA: number; scoreB: number; winnerId: string }> {
    // 获取队伍实力 - 统一类型转换
    const teamsQuery = `SELECT id, power_rating, name FROM teams WHERE id IN ($1, $2)`;
    const teamsResult = await client.query(teamsQuery, [teamAId, teamBId]);

    logger.debug('[MSI] 查询队伍实力', {
      teamAId,
      teamBId,
      results: teamsResult.rows.map((r: any) => ({ id: r.id, type: typeof r.id, name: r.name }))
    });

    // 统一使用字符串比较
    const teamA = teamsResult.rows.find((t: any) => t.id.toString() === teamAId.toString());
    const teamB = teamsResult.rows.find((t: any) => t.id.toString() === teamBId.toString());

    logger.debug('[MSI] 匹配队伍结果', {
      teamA: teamA ? { name: teamA.name, power: teamA.power_rating } : null,
      teamB: teamB ? { name: teamB.name, power: teamB.power_rating } : null
    });

    // 如果未找到队伍，抛出明确错误
    if (!teamA) {
      throw new BusinessError(ErrorCodes.TEAM_NOT_FOUND, `队伍 ${teamAId} 不存在或未查询到`);
    }
    if (!teamB) {
      throw new BusinessError(ErrorCodes.TEAM_NOT_FOUND, `队伍 ${teamBId} 不存在或未查询到`);
    }

    const powerA = teamA.power_rating || 75;
    const powerB = teamB.power_rating || 75;

    // BO5: 先赢3场者获胜
    let scoreA = 0;
    let scoreB = 0;

    while (scoreA < 3 && scoreB < 3) {
      // 计算单场胜率(基于实力差距)
      const totalPower = powerA + powerB;
      const winProbA = powerA / totalPower;

      // 加入随机因素
      const random = Math.random();
      if (random < winProbA) {
        scoreA++;
      } else {
        scoreB++;
      }
    }

    const winnerId = scoreA > scoreB ? teamAId : teamBId;

    return { scoreA, scoreB, winnerId };
  }

  /**
   * 推进到下一轮
   */
  private async advanceToNextRound(
    client: PoolClient,
    match: any,
    winnerId: string,
    loserId: string
  ): Promise<void> {
    // 获取胜者和败者队伍信息
    const teamsQuery = `SELECT id, name FROM teams WHERE id IN ($1, $2)`;
    const teamsResult = await client.query(teamsQuery, [winnerId, loserId]);

    logger.debug('[MSI] 推进下一轮', { winnerId, loserId, queryResults: teamsResult.rows });

    // 统一使用字符串比较
    const winner = teamsResult.rows.find((t: any) => t.id.toString() === winnerId.toString());
    const loser = teamsResult.rows.find((t: any) => t.id.toString() === loserId.toString());

    // 检查winner和loser是否存在
    if (!winner) {
      throw new BusinessError(ErrorCodes.TEAM_NOT_FOUND, `获胜队伍 ${winnerId} 不存在`);
    }
    if (!loser) {
      throw new BusinessError(ErrorCodes.TEAM_NOT_FOUND, `失败队伍 ${loserId} 不存在`);
    }

    logger.debug('[MSI] 队伍匹配成功', { winner: winner.name, loser: loser.name });

    // 更新下一场比赛的队伍
    if (match.next_match_id) {
      // 胜者进入下一场
      logger.debug('[MSI] 胜者晋级', { winner: winner.name, nextMatchId: match.next_match_id });
      await this.updateNextMatchTeam(client, match.next_match_id, winnerId, winner.name);
    }

    if (match.loser_next_match_id) {
      // 败者进入败者组
      logger.debug('[MSI] 败者进入败者组', { loser: loser.name, loserNextMatchId: match.loser_next_match_id });
      await this.updateNextMatchTeam(client, match.loser_next_match_id, loserId, loser.name);
    }
  }

  /**
   * 更新下一场比赛的队伍
   */
  private async updateNextMatchTeam(
    client: PoolClient,
    nextMatchId: string,
    teamId: string,
    teamName: string
  ): Promise<void> {
    // 检查该比赛的team_a是否为空
    const checkQuery = `SELECT team_a_id, team_b_id FROM msi_matches WHERE id = $1`;
    const checkResult = await client.query(checkQuery, [nextMatchId]);

    if (checkResult.rows.length === 0) return;

    const nextMatch = checkResult.rows[0];

    if (!nextMatch.team_a_id) {
      // team_a 为空，填入team_a
      await client.query(
        `UPDATE msi_matches SET team_a_id = $2, team_a_name = $3 WHERE id = $1`,
        [nextMatchId, teamId, teamName]
      );
    } else if (!nextMatch.team_b_id) {
      // team_b 为空，填入team_b
      await client.query(
        `UPDATE msi_matches SET team_b_id = $2, team_b_name = $3 WHERE id = $1`,
        [nextMatchId, teamId, teamName]
      );
    }
  }

  /**
   * 检查MSI是否完成
   */
  private async checkMSIComplete(client: PoolClient, bracketId: string): Promise<boolean> {
    const query = `
      SELECT COUNT(*) as total,
             SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed
      FROM msi_matches
      WHERE msi_bracket_id = $1
    `;
    const result = await client.query(query, [bracketId]);

    const { total, completed } = result.rows[0];
    return parseInt(total) === parseInt(completed);
  }

  /**
   * 更新最终排名
   */
  private async updateFinalStandings(client: PoolClient, bracketId: string): Promise<{
    champion: MSIQualification;
    runnerUp: MSIQualification;
    thirdPlace: MSIQualification;
    fourthPlace: MSIQualification;
    loserRound2: MSIQualification[];
    loserRound1: MSIQualification[];
  }> {
    // 获取总决赛结果
    const grandFinalQuery = `
      SELECT * FROM msi_matches
      WHERE msi_bracket_id = $1 AND match_type = 'grand_final'
    `;
    const grandFinalResult = await client.query(grandFinalQuery, [bracketId]);
    const grandFinal = grandFinalResult.rows[0];

    const championId = grandFinal.winner_id;
    const runnerUpId = grandFinal.winner_id === grandFinal.team_a_id ? grandFinal.team_b_id : grandFinal.team_a_id;

    // 获取败者组决赛结果 (第3名)
    const losersFinalQuery = `
      SELECT * FROM msi_matches
      WHERE msi_bracket_id = $1 AND match_type = 'losers_final'
    `;
    const losersFinalResult = await client.query(losersFinalQuery, [bracketId]);
    const losersFinal = losersFinalResult.rows[0];

    const thirdPlaceId = losersFinal.winner_id === losersFinal.team_a_id ? losersFinal.team_b_id : losersFinal.team_a_id;

    // 获取败者组第四轮结果 (第4名)
    const losersR4Query = `
      SELECT * FROM msi_matches
      WHERE msi_bracket_id = $1 AND match_type = 'losers_round_4'
    `;
    const losersR4Result = await client.query(losersR4Query, [bracketId]);
    const losersR4 = losersR4Result.rows[0];

    const fourthPlaceId = losersR4.winner_id === losersR4.team_a_id ? losersR4.team_b_id : losersR4.team_a_id;

    // 获取败者组第二轮淘汰的队伍 (2队)
    const losersR2Query = `
      SELECT * FROM msi_matches
      WHERE msi_bracket_id = $1 AND match_type = 'losers_round_2'
    `;
    const losersR2Result = await client.query(losersR2Query, [bracketId]);
    const loserRound2Teams: string[] = [];
    losersR2Result.rows.forEach((match: any) => {
      const loserId = match.winner_id === match.team_a_id ? match.team_b_id : match.team_a_id;
      loserRound2Teams.push(loserId.toString());
    });

    // 获取败者组第一轮淘汰的队伍 (2队)
    const losersR1Query = `
      SELECT * FROM msi_matches
      WHERE msi_bracket_id = $1 AND match_type = 'losers_round_1'
    `;
    const losersR1Result = await client.query(losersR1Query, [bracketId]);
    const loserRound1Teams: string[] = [];
    losersR1Result.rows.forEach((match: any) => {
      const loserId = match.winner_id === match.team_a_id ? match.team_b_id : match.team_a_id;
      loserRound1Teams.push(loserId.toString());
    });

    // 获取bracket的qualified_teams
    const bracketQuery = `SELECT qualified_teams FROM msi_brackets WHERE id = $1`;
    const bracketResult = await client.query(bracketQuery, [bracketId]);
    const qualifiedTeams = bracketResult.rows[0].qualified_teams;

    const champion = qualifiedTeams.find((t: any) => t.teamId === championId.toString());
    const runnerUp = qualifiedTeams.find((t: any) => t.teamId === runnerUpId.toString());
    const thirdPlace = qualifiedTeams.find((t: any) => t.teamId === thirdPlaceId.toString());
    const fourthPlace = qualifiedTeams.find((t: any) => t.teamId === fourthPlaceId.toString());

    const loserRound2 = loserRound2Teams.map(id => qualifiedTeams.find((t: any) => t.teamId === id));
    const loserRound1 = loserRound1Teams.map(id => qualifiedTeams.find((t: any) => t.teamId === id));

    // 更新bracket表
    await client.query(`
      UPDATE msi_brackets
      SET champion_id = $2, runner_up_id = $3, third_place_id = $4, fourth_place_id = $5,
          loser_round_2 = $6, loser_round_1 = $7, status = 'completed'
      WHERE id = $1
    `, [
      bracketId,
      championId,
      runnerUpId,
      thirdPlaceId,
      fourthPlaceId,
      JSON.stringify(loserRound2),
      JSON.stringify(loserRound1)
    ]);

    return {
      champion,
      runnerUp,
      thirdPlace,
      fourthPlace,
      loserRound2,
      loserRound1
    };
  }

  /**
   * 分配MSI积分
   */
  private async distributeMSIPoints(client: PoolClient, bracketId: string, standings: any): Promise<void> {
    const bracketQuery = `SELECT points_distribution FROM msi_brackets WHERE id = $1`;
    const bracketResult = await client.query(bracketQuery, [bracketId]);
    const pointsDistribution = bracketResult.rows[0].points_distribution;

    // 分配积分
    const distributions = [
      { teamId: standings.champion.teamId, points: pointsDistribution.champion },
      { teamId: standings.runnerUp.teamId, points: pointsDistribution.runnerUp },
      { teamId: standings.thirdPlace.teamId, points: pointsDistribution.thirdPlace },
      { teamId: standings.fourthPlace.teamId, points: pointsDistribution.fourthPlace },
      ...standings.loserRound2.map((t: any) => ({ teamId: t.teamId, points: pointsDistribution.loserRound2 })),
      ...standings.loserRound1.map((t: any) => ({ teamId: t.teamId, points: pointsDistribution.loserRound1 }))
    ];

    for (const dist of distributions) {
      // TODO: 实际项目中应该调用积分服务更新年度积分
      logger.info('[MSI] 分配MSI积分', { teamId: dist.teamId, points: dist.points });
    }
  }

  /**
   * 构建轮次信息
   */
  private buildMSIRounds(matches: MSIMatch[]): MSIRound[] {
    const roundMap = new Map<number, MSIMatch[]>();

    // 按轮次分组
    matches.forEach(match => {
      if (!roundMap.has(match.roundNumber)) {
        roundMap.set(match.roundNumber, []);
      }
      roundMap.get(match.roundNumber)!.push(match);
    });

    // 构建轮次
    const rounds: MSIRound[] = [];

    roundMap.forEach((roundMatches, roundNumber) => {
      const roundName = this.getRoundName(roundNumber, roundMatches[0].matchType);
      const stage = this.getRoundStage(roundNumber);
      const bracketType = this.getBracketType(roundMatches[0].matchType);
      const status = this.getRoundStatus(roundMatches);

      rounds.push({
        roundNumber,
        roundName,
        stage,
        bracketType,
        matches: roundMatches,
        status
      });
    });

    return rounds.sort((a, b) => a.roundNumber - b.roundNumber);
  }

  /**
   * 获取轮次名称
   */
  private getRoundName(roundNumber: number, matchType: string): string {
    const nameMap: Record<string, string> = {
      'qualifier_knockout': '资格赛组',
      'challenger_match': '挑战者组',
      'losers_round_1': '败者组第一轮',
      'losers_round_2': '败者组第二轮',
      'winners_round_1': '胜者组第一轮',
      'losers_round_3': '败者组第三轮',
      'losers_round_4': '败者组第四轮',
      'winners_round_2': '胜者组第二轮',
      'losers_final': '败者组决赛',
      'grand_final': '总决赛'
    };
    return nameMap[matchType] || `第${roundNumber}轮`;
  }

  /**
   * 获取轮次阶段
   */
  private getRoundStage(roundNumber: number): 'qualifier' | 'main' {
    return roundNumber === 1 ? 'qualifier' : 'main';
  }

  /**
   * 获取bracket类型
   */
  private getBracketType(matchType: string): 'winners' | 'losers' | 'qualifier' | 'challenger' | 'grand_final' {
    if (matchType === 'grand_final') return 'grand_final';
    if (matchType === 'qualifier_knockout') return 'qualifier';
    if (matchType === 'challenger_match') return 'challenger';
    if (matchType.includes('winners')) return 'winners';
    if (matchType.includes('losers')) return 'losers';
    return 'losers';
  }

  /**
   * 获取轮次状态
   */
  private getRoundStatus(matches: MSIMatch[]): 'pending' | 'in_progress' | 'completed' {
    const allCompleted = matches.every(m => m.status === 'completed');
    if (allCompleted) return 'completed';

    const anyInProgress = matches.some(m => m.status === 'in_progress');
    if (anyInProgress) return 'in_progress';

    return 'pending';
  }

  /**
   * 映射数据库行到比赛对象
   */
  private mapRowToMatch(row: any): MSIMatch {
    return {
      id: row.id,
      msiBracketId: row.msi_bracket_id,
      roundNumber: row.round_number,
      matchType: row.match_type,
      bestOf: row.best_of,
      bracketType: row.bracket_type,
      teamAId: row.team_a_id?.toString(),
      teamBId: row.team_b_id?.toString(),
      teamAName: row.team_a_name,
      teamBName: row.team_b_name,
      teamASeed: row.team_a_seed,
      teamBSeed: row.team_b_seed,
      scoreA: row.score_a,
      scoreB: row.score_b,
      winnerId: row.winner_id?.toString(),
      status: row.status,
      nextMatchId: row.next_match_id,
      loserNextMatchId: row.loser_next_match_id,
      matchNumber: row.match_number,
      scheduledAt: row.scheduled_at,
      completedAt: row.completed_at,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }
}

export const msiService = new MSIService();

// =================================================================
// 电竞赛事模拟系统 - 荣誉记录补录脚本
// =================================================================
// 
// 此脚本用于为已完成的赛事补录荣誉记录
// 运行方式: npx tsx scripts/backfill-honor-records.ts
//
// =================================================================

import { db } from '../src/config/database';
import { logger } from '../src/utils/logger';

async function backfillHonorRecords() {
  try {
    console.log('🚀 开始补录荣誉记录...\n');

    // 1. 查找所有已完成的季后赛
    console.log('📋 正在查找已完成的季后赛...');
    const playoffsQuery = `
      SELECT 
        pb.id as bracket_id,
        pb.competition_id,
        pb.champion_id,
        pb.runner_up_id,
        pb.third_place_id,
        pb.fourth_place_id,
        pb.points_distribution,
        c.season_id,
        c.type,
        c.name
      FROM playoff_brackets pb
      JOIN competitions c ON pb.competition_id = c.id
      WHERE pb.status = 'completed'
        AND pb.champion_id IS NOT NULL
    `;
    const playoffsResult = await db.query(playoffsQuery);
    console.log(`   找到 ${playoffsResult.rows.length} 个已完成的季后赛\n`);

    for (const playoff of playoffsResult.rows) {
      const points = playoff.points_distribution || {
        champion: 12,
        runnerUp: 10,
        thirdPlace: 8,
        fourthPlace: 6
      };

      const records = [
        { teamId: playoff.champion_id, position: 1, points: points.champion || 12 },
        { teamId: playoff.runner_up_id, position: 2, points: points.runnerUp || 10 },
        { teamId: playoff.third_place_id, position: 3, points: points.thirdPlace || 8 },
        { teamId: playoff.fourth_place_id, position: 4, points: points.fourthPlace || 6 }
      ];

      for (const record of records) {
        await db.query(`
          INSERT INTO honor_records (
            season_id, competition_id, team_id, position, points, achievement_date
          )
          VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)
          ON CONFLICT (competition_id, team_id) DO NOTHING
        `, [playoff.season_id, playoff.competition_id, record.teamId, record.position, record.points]);
      }

      console.log(`   ✅ ${playoff.name} - 已补录`);
    }

    // 2. 查找所有已完成的MSI
    console.log('\n📋 正在查找已完成的MSI...');
    const msiQuery = `
      SELECT 
        mb.id as bracket_id,
        mb.season_id,
        mb.champion_id,
        mb.runner_up_id,
        mb.third_place_id,
        mb.fourth_place_id,
        mb.points_distribution,
        c.id as competition_id,
        c.name
      FROM msi_brackets mb
      JOIN competitions c ON mb.season_id = c.season_id AND c.type = 'msi'
      WHERE mb.status = 'completed'
        AND mb.champion_id IS NOT NULL
    `;
    const msiResult = await db.query(msiQuery);
    console.log(`   找到 ${msiResult.rows.length} 个已完成的MSI\n`);

    for (const msi of msiResult.rows) {
      const points = msi.points_distribution || {
        champion: 20,
        runnerUp: 16,
        thirdPlace: 12,
        fourthPlace: 8
      };

      const records = [
        { teamId: msi.champion_id, position: 1, points: points.champion || 20 },
        { teamId: msi.runner_up_id, position: 2, points: points.runnerUp || 16 },
        { teamId: msi.third_place_id, position: 3, points: points.thirdPlace || 12 },
        { teamId: msi.fourth_place_id, position: 4, points: points.fourthPlace || 8 }
      ];

      for (const record of records) {
        await db.query(`
          INSERT INTO honor_records (
            season_id, competition_id, team_id, position, points, achievement_date
          )
          VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)
          ON CONFLICT (competition_id, team_id) DO NOTHING
        `, [msi.season_id, msi.competition_id, record.teamId, record.position, record.points]);
      }

      console.log(`   ✅ ${msi.name} - 已补录`);
    }

    // 3. 查找所有已完成的世界赛
    console.log('\n📋 正在查找已完成的世界赛...');
    const worldsQuery = `
      SELECT 
        wb.id as bracket_id,
        wb.season_id,
        wb.champion_id,
        wb.runner_up_id,
        wb.third_place_id,
        wb.fourth_place_id,
        wb.points_distribution,
        c.id as competition_id,
        c.season_id as comp_season_id,
        c.name,
        s.year as season_year
      FROM worlds_brackets wb
      JOIN seasons s ON s.year = wb.season_year
      JOIN competitions c ON c.season_id = s.id AND c.type = 'worlds'
      WHERE wb.status = 'completed'
        AND wb.champion_id IS NOT NULL
    `;
    const worldsResult = await db.query(worldsQuery);
    console.log(`   找到 ${worldsResult.rows.length} 个已完成的世界赛\n`);

    for (const worlds of worldsResult.rows) {
      const points = worlds.points_distribution || {
        champion: 20,
        runnerUp: 16,
        thirdPlace: 12,
        fourthPlace: 8
      };

      const records = [
        { teamId: worlds.champion_id, position: 1, points: points.champion || 20 },
        { teamId: worlds.runner_up_id, position: 2, points: points.runnerUp || 16 },
        { teamId: worlds.third_place_id, position: 3, points: points.thirdPlace || 12 },
        { teamId: worlds.fourth_place_id, position: 4, points: points.fourthPlace || 8 }
      ];

      for (const record of records) {
        await db.query(`
          INSERT INTO honor_records (
            season_id, competition_id, team_id, position, points, achievement_date
          )
          VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)
          ON CONFLICT (competition_id, team_id) DO NOTHING
        `, [worlds.comp_season_id, worlds.competition_id, record.teamId, record.position, record.points]);
      }

      console.log(`   ✅ ${worlds.name} - 已补录`);
    }

    // 4. 统计总计
    const totalResult = await db.query('SELECT COUNT(*) as total FROM honor_records');
    const total = totalResult.rows[0].total;

    console.log('\n🎉 荣誉记录补录完成！');
    console.log(`📊 总计创建了 ${total} 条荣誉记录\n`);

  } catch (error: any) {
    console.error('❌ 补录失败:', error.message);
    throw error;
  }
  
  process.exit(0);
}

// 运行脚本
backfillHonorRecords();


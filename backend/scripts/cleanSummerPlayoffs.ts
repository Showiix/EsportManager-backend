import { db } from '../src/config/database';

async function cleanSummerPlayoffs() {
  try {
    console.log('开始清理夏季赛季后赛数据...');

    // 1. 查找所有夏季赛季后赛的 bracket ID
    const bracketsQuery = `
      SELECT pb.id, pb.region_id, r.name as region_name
      FROM playoff_brackets pb
      JOIN competitions c ON pb.competition_id = c.id
      JOIN regions r ON pb.region_id = r.id
      WHERE c.type = 'summer' AND c.season_id = 1
    `;
    const bracketsResult = await db.query(bracketsQuery);

    console.log(`找到 ${bracketsResult.rows.length} 个夏季赛季后赛bracket`);

    for (const bracket of bracketsResult.rows) {
      console.log(`  - 赛区 ${bracket.region_name} (ID: ${bracket.region_id}), Bracket ID: ${bracket.id}`);
    }

    if (bracketsResult.rows.length === 0) {
      console.log('没有找到夏季赛季后赛数据');
      return;
    }

    // 2. 删除所有相关的 matches - 使用bracket IDs
    const bracketIds = bracketsResult.rows.map(b => `'${b.id}'`).join(',');
    const deleteMatchesQuery = `
      DELETE FROM matches
      WHERE id IN (
        SELECT m.id
        FROM matches m
        WHERE m.playoff_bracket_id IN (${bracketIds})
      )
    `;

    let matchesResult;
    try {
      matchesResult = await db.query(deleteMatchesQuery);
      console.log(`✓ 删除了 ${matchesResult.rowCount} 场季后赛比赛`);
    } catch (err: any) {
      // 如果playoff_bracket_id字段不存在，尝试其他字段名
      console.log('尝试使用备用方法...');

      // 先删除 head_to_head_records 中的引用
      const deleteH2HQuery = `
        DELETE FROM head_to_head_records
        WHERE last_match_id IN (
          SELECT id FROM matches WHERE competition_id = 7
        )
      `;
      const h2hResult = await db.query(deleteH2HQuery);
      console.log(`✓ 删除了 ${h2hResult.rowCount} 条对战记录`);

      // 然后删除matches
      const altQuery = `DELETE FROM matches WHERE competition_id = 7`;
      matchesResult = await db.query(altQuery);
      console.log(`✓ 删除了 ${matchesResult.rowCount} 场夏季赛比赛`);
    }

    // 3. 删除所有 playoff_brackets
    const deleteBracketsQuery = `
      DELETE FROM playoff_brackets
      WHERE id IN (
        SELECT pb.id
        FROM playoff_brackets pb
        JOIN competitions c ON pb.competition_id = c.id
        WHERE c.type = 'summer' AND c.season_id = 1
      )
    `;
    const bracketsDeleteResult = await db.query(deleteBracketsQuery);
    console.log(`✓ 删除了 ${bracketsDeleteResult.rowCount} 个季后赛bracket`);

    console.log('\n✅ 夏季赛季后赛数据清理完成！');
    console.log('现在可以重新点击"完成赛季"按钮生成季后赛了。');

  } catch (error) {
    console.error('清理失败:', error);
    throw error;
  } finally {
    process.exit(0);
  }
}

cleanSummerPlayoffs();

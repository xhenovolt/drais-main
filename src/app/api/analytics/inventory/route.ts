import { NextRequest, NextResponse } from 'next/server';
import { getConnection } from '@/lib/db';

import { getSessionSchoolId } from '@/lib/auth';
import { checkModule } from '@/lib/auth/requireModule';

/**
 * Import redesign / stability-roadmap Phase 3: repoint at the real
 * tables. This route queried store_items / store_transactions, which do
 * not exist in the schema (the real tables have always been
 * inventory_items / inventory_transactions + stores) — every call here
 * was a hard 500. Confirmed live: SHOW TABLES has no store_items or
 * store_transactions at all. A rename, not a rebuild, per the original
 * readiness audit. Also added: deleted_at filtering (inventory_items,
 * inventory_transactions, and stores all carry soft-delete columns the
 * old query never checked) and school_id filtered directly on the
 * inventory tables themselves, not only via the stores join — both
 * tables carry school_id natively, so this is defense-in-depth for
 * tenant isolation rather than relying on the join alone.
 */
export async function GET(req: NextRequest) {
  try {
    // Enforce multi-tenant isolation: derive school_id from session
    const session = await getSessionSchoolId(req);
    if (!session) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }
    const __denied = await checkModule(session.schoolId, 'analytics');
    if (__denied) return __denied;
    const schoolId = session.schoolId;

    const { searchParams } = new URL(req.url);
    // school_id derived from session below
    const days = parseInt(searchParams.get('days') || '30');

    const connection = await getConnection();

    // Current stock levels
    const stockLevels = await connection.execute(`
      SELECT
        ii.id as item_id,
        ii.name as item_name,
        ii.unit,
        ii.capacity,
        ii.reorder_level,
        s.name as store_name,
        ii.current_quantity as current_stock,
        COUNT(it.id) as transaction_count,
        MAX(it.created_at) as last_transaction_date,
        CASE
          WHEN ii.current_quantity < ii.reorder_level THEN 'low'
          WHEN ii.current_quantity <= 0 THEN 'out_of_stock'
          ELSE 'normal'
        END as stock_status
      FROM inventory_items ii
      JOIN stores s ON ii.store_id = s.id AND s.deleted_at IS NULL
      LEFT JOIN inventory_transactions it ON ii.id = it.item_id AND it.deleted_at IS NULL
      WHERE ii.school_id = ? AND ii.deleted_at IS NULL
      GROUP BY ii.id, ii.name, ii.unit, ii.capacity, ii.reorder_level, ii.current_quantity, s.id, s.name
      ORDER BY current_stock ASC
    `, [schoolId]);

    // Items below reorder level
    const lowStockItems = await connection.execute(`
      SELECT
        ii.id as item_id,
        ii.name as item_name,
        ii.unit,
        ii.reorder_level,
        s.name as store_name,
        ii.current_quantity as current_stock,
        (ii.reorder_level - ii.current_quantity) as shortage
      FROM inventory_items ii
      JOIN stores s ON ii.store_id = s.id AND s.deleted_at IS NULL
      WHERE ii.school_id = ? AND ii.deleted_at IS NULL AND ii.current_quantity < ii.reorder_level
      ORDER BY shortage DESC
    `, [schoolId]);

    // Transaction trends
    const transactionTrends = await connection.execute(`
      SELECT
        DATE(it.created_at) as transaction_date,
        it.tx_type,
        COUNT(it.id) as transaction_count,
        SUM(it.quantity) as total_quantity,
        COUNT(DISTINCT it.item_id) as unique_items
      FROM inventory_transactions it
      WHERE it.school_id = ? AND it.deleted_at IS NULL
      AND it.created_at >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
      GROUP BY DATE(it.created_at), it.tx_type
      ORDER BY transaction_date DESC
    `, [schoolId, days]);

    // Most active items
    const mostActiveItems = await connection.execute(`
      SELECT
        ii.name as item_name,
        ii.unit,
        s.name as store_name,
        COUNT(it.id) as transaction_count,
        SUM(CASE WHEN it.tx_type = 'in' THEN it.quantity ELSE 0 END) as total_in,
        SUM(CASE WHEN it.tx_type = 'out' THEN it.quantity ELSE 0 END) as total_out,
        (SUM(CASE WHEN it.tx_type = 'in' THEN it.quantity ELSE 0 END) -
         SUM(CASE WHEN it.tx_type = 'out' THEN it.quantity ELSE 0 END)) as net_movement
      FROM inventory_items ii
      JOIN stores s ON ii.store_id = s.id AND s.deleted_at IS NULL
      LEFT JOIN inventory_transactions it ON ii.id = it.item_id AND it.deleted_at IS NULL
        AND it.created_at >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
      WHERE ii.school_id = ? AND ii.deleted_at IS NULL
      GROUP BY ii.id, ii.name, ii.unit, s.name
      HAVING transaction_count > 0
      ORDER BY transaction_count DESC
      LIMIT 20
    `, [days, schoolId]);

    // Store utilization
    const storeUtilization = await connection.execute(`
      SELECT
        s.name as store_name,
        s.location,
        COUNT(ii.id) as total_items,
        COUNT(CASE WHEN ii.current_quantity > 0 THEN 1 END) as items_in_stock,
        COUNT(CASE WHEN ii.current_quantity <= 0 THEN 1 END) as items_out_of_stock,
        COUNT(CASE WHEN ii.current_quantity < ii.reorder_level THEN 1 END) as items_below_reorder,
        AVG(ii.current_quantity) as avg_stock_level
      FROM stores s
      LEFT JOIN inventory_items ii ON s.id = ii.store_id AND ii.deleted_at IS NULL
      WHERE s.school_id = ? AND s.deleted_at IS NULL
      GROUP BY s.id, s.name, s.location
      ORDER BY total_items DESC
    `, [schoolId]);

    // Consumption patterns. day_name is derived in JS below rather than
    // via a SQL CASE — a CASE re-referencing the raw grouped-by column
    // tripped TiDB's only_full_group_by check even wrapped in ANY_VALUE()
    // ("nonaggregated column ... not functionally dependent"), even
    // though DAYOFWEEK(it.created_at) alone (the actual GROUP BY key) is
    // fine. Simpler and more portable to just map the integer in JS.
    const DAY_NAMES = ['', 'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const [consumptionPatternsRows] = await connection.execute(`
      SELECT
        ii.name as item_name,
        ii.unit,
        DAYOFWEEK(it.created_at) as day_of_week,
        SUM(CASE WHEN it.tx_type = 'out' THEN it.quantity ELSE 0 END) as consumption_quantity,
        COUNT(CASE WHEN it.tx_type = 'out' THEN 1 END) as consumption_events
      FROM inventory_transactions it
      JOIN inventory_items ii ON it.item_id = ii.id AND ii.deleted_at IS NULL
      WHERE it.school_id = ? AND it.deleted_at IS NULL
      AND it.created_at >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
      AND it.tx_type = 'out'
      GROUP BY ii.id, ii.name, ii.unit, DAYOFWEEK(it.created_at)
      ORDER BY ii.name, day_of_week
    `, [schoolId, days]) as any;
    const consumptionPatterns = [(consumptionPatternsRows as any[]).map((row) => ({
      ...row, day_name: DAY_NAMES[Number(row.day_of_week)] ?? null,
    }))];

    await connection.end();

    return NextResponse.json({
      success: true,
      data: {
        stockLevels: stockLevels[0],
        lowStockItems: lowStockItems[0],
        transactionTrends: transactionTrends[0],
        mostActiveItems: mostActiveItems[0],
        storeUtilization: storeUtilization[0],
        consumptionPatterns: consumptionPatterns[0]
      }
    });
  } catch (error: any) {
    console.error('Error fetching inventory analytics:', error);
    return NextResponse.json({ error: 'Failed to fetch analytics' }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from 'next/server';
import { getConnection } from '@/lib/db';

import { getSessionSchoolId } from '@/lib/auth';
export async function GET(req: NextRequest) {
  try {
    // Enforce multi-tenant isolation: derive school_id from session
    const session = await getSessionSchoolId(req);
    if (!session) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }
    const schoolId = session.schoolId;

    const { searchParams } = new URL(req.url);
    // school_id derived from session below
    const days = parseInt(searchParams.get('days', 10) || '30');
    
    const connection = await getConnection();
    
    // Current stock levels
    const stockLevels = await connection.execute(`
      SELECT 
        si.id as item_id,
        si.name as item_name,
        si.unit,
        si.capacity,
        si.reorder_level,
        s.name as store_name,
        COALESCE(SUM(CASE WHEN st.tx_type = 'in' THEN st.quantity ELSE -st.quantity END), 0) as current_stock,
        COUNT(st.id) as transaction_count,
        MAX(st.created_at) as last_transaction_date,
        CASE 
          WHEN COALESCE(SUM(CASE WHEN st.tx_type = 'in' THEN st.quantity ELSE -st.quantity END), 0) < si.reorder_level 
          THEN 'low'
          WHEN COALESCE(SUM(CASE WHEN st.tx_type = 'in' THEN st.quantity ELSE -st.quantity END), 0) = 0 
          THEN 'out_of_stock'
          ELSE 'normal'
        END as stock_status
      FROM store_items si
      JOIN stores s ON si.store_id = s.id
      LEFT JOIN store_transactions st ON si.id = st.item_id
      WHERE s.school_id = ?
      GROUP BY si.id, si.name, si.unit, si.capacity, si.reorder_level, s.id, s.name
      ORDER BY current_stock ASC
    `, [schoolId]);

    // Items below reorder level
    const lowStockItems = await connection.execute(`
      SELECT 
        si.id as item_id,
        si.name as item_name,
        si.unit,
        si.reorder_level,
        s.name as store_name,
        COALESCE(SUM(CASE WHEN st.tx_type = 'in' THEN st.quantity ELSE -st.quantity END), 0) as current_stock,
        (si.reorder_level - COALESCE(SUM(CASE WHEN st.tx_type = 'in' THEN st.quantity ELSE -st.quantity END), 0)) as shortage
      FROM store_items si
      JOIN stores s ON si.store_id = s.id
      LEFT JOIN store_transactions st ON si.id = st.item_id
      WHERE s.school_id = ?
      GROUP BY si.id, si.name, si.unit, si.reorder_level, s.id, s.name
      HAVING current_stock < si.reorder_level
      ORDER BY shortage DESC
    `, [schoolId]);

    // Transaction trends
    const transactionTrends = await connection.execute(`
      SELECT 
        DATE(st.created_at) as transaction_date,
        st.tx_type,
        COUNT(st.id) as transaction_count,
        SUM(st.quantity) as total_quantity,
        COUNT(DISTINCT st.item_id) as unique_items
      FROM store_transactions st
      JOIN store_items si ON st.item_id = si.id
      JOIN stores s ON si.store_id = s.id
      WHERE s.school_id = ?
      AND st.created_at >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
      GROUP BY DATE(st.created_at), st.tx_type
      ORDER BY transaction_date DESC
    `, [schoolId, days]);

    // Most active items
    const mostActiveItems = await connection.execute(`
      SELECT 
        si.name as item_name,
        si.unit,
        s.name as store_name,
        COUNT(st.id) as transaction_count,
        SUM(CASE WHEN st.tx_type = 'in' THEN st.quantity ELSE 0 END) as total_in,
        SUM(CASE WHEN st.tx_type = 'out' THEN st.quantity ELSE 0 END) as total_out,
        (SUM(CASE WHEN st.tx_type = 'in' THEN st.quantity ELSE 0 END) - 
         SUM(CASE WHEN st.tx_type = 'out' THEN st.quantity ELSE 0 END)) as net_movement
      FROM store_items si
      JOIN stores s ON si.store_id = s.id
      LEFT JOIN store_transactions st ON si.id = st.item_id
        AND st.created_at >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
      WHERE s.school_id = ?
      GROUP BY si.id, si.name, si.unit, s.name
      HAVING transaction_count > 0
      ORDER BY transaction_count DESC
      LIMIT 20
    `, [days, schoolId]);

    // Store utilization
    const storeUtilization = await connection.execute(`
      SELECT 
        s.name as store_name,
        s.location,
        COUNT(si.id) as total_items,
        COUNT(CASE WHEN stock.current_stock > 0 THEN 1 END) as items_in_stock,
        COUNT(CASE WHEN stock.current_stock <= 0 THEN 1 END) as items_out_of_stock,
        COUNT(CASE WHEN stock.current_stock < si.reorder_level THEN 1 END) as items_below_reorder,
        AVG(stock.current_stock) as avg_stock_level
      FROM stores s
      LEFT JOIN store_items si ON s.id = si.store_id
      LEFT JOIN (
        SELECT 
          item_id,
          SUM(CASE WHEN tx_type = 'in' THEN quantity ELSE -quantity END) as current_stock
        FROM store_transactions
        GROUP BY item_id
      ) stock ON si.id = stock.item_id
      WHERE s.school_id = ?
      GROUP BY s.id, s.name, s.location
      ORDER BY total_items DESC
    `, [schoolId]);

    // Consumption patterns
    const consumptionPatterns = await connection.execute(`
      SELECT 
        si.name as item_name,
        si.unit,
        DAYOFWEEK(st.created_at) as day_of_week,
        CASE DAYOFWEEK(st.created_at)
          WHEN 1 THEN 'Sunday'
          WHEN 2 THEN 'Monday' 
          WHEN 3 THEN 'Tuesday'
          WHEN 4 THEN 'Wednesday'
          WHEN 5 THEN 'Thursday'
          WHEN 6 THEN 'Friday'
          WHEN 7 THEN 'Saturday'
        END as day_name,
        SUM(CASE WHEN st.tx_type = 'out' THEN st.quantity ELSE 0 END) as consumption_quantity,
        COUNT(CASE WHEN st.tx_type = 'out' THEN 1 END) as consumption_events
      FROM store_transactions st
      JOIN store_items si ON st.item_id = si.id
      JOIN stores s ON si.store_id = s.id
      WHERE s.school_id = ?
      AND st.created_at >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
      AND st.tx_type = 'out'
      GROUP BY si.id, si.name, si.unit, DAYOFWEEK(st.created_at)
      ORDER BY si.name, day_of_week
    `, [schoolId, days]);

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

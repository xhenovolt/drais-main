'use client';
import React from 'react';
import Link from 'next/link';
import useSWR from 'swr';
import { Boxes, Warehouse, ArrowLeftRight, AlertTriangle, Loader2 } from 'lucide-react';

const fetcher = (u: string) => fetch(u).then(r => r.json());

interface Store { id: number; name: string; location: string | null; item_count: number; }
interface Item  { id: number; name: string; unit: string | null; current_quantity: number; reorder_level: number | null; is_low: number; store_name: string; }
interface Tx    { id: number; tx_type: 'in'|'out'|'adjust'; quantity: number; item_name: string; created_at: string; balance_after: number | null; }

export default function InventoryHubPage() {
  const { data: storesRes, isLoading: lStores } = useSWR<{ data: Store[] }>('/api/inventory/stores',       fetcher);
  const { data: itemsRes,  isLoading: lItems  } = useSWR<{ data: Item[]  }>('/api/inventory/items',        fetcher);
  const { data: txRes,     isLoading: lTx     } = useSWR<{ data: Tx[]    }>('/api/inventory/transactions', fetcher);

  const stores = storesRes?.data ?? [];
  const items  = itemsRes?.data  ?? [];
  const tx     = txRes?.data     ?? [];

  const lowStock = items.filter(i => i.is_low === 1);
  const recentTx = tx.slice(0, 8);

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Boxes className="w-6 h-6 text-indigo-500" />
        <h1 className="text-xl font-bold text-slate-800 dark:text-white">Inventory</h1>
      </div>

      {/* Stat tiles */}
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          href="/inventory/stores"
          icon={Warehouse}
          label="Stores"
          value={lStores ? '…' : stores.length}
          sub={stores.length === 0 ? 'Click to add your first store' : `${stores.length} store${stores.length === 1 ? '' : 's'}`}
        />
        <StatCard
          href="/inventory/items"
          icon={Boxes}
          label="Items"
          value={lItems ? '…' : items.length}
          sub={items.length === 0 ? 'No items yet' : `${items.length} total items`}
        />
        <StatCard
          href="/inventory/transactions"
          icon={ArrowLeftRight}
          label="Transactions"
          value={lTx ? '…' : tx.length}
          sub={tx.length === 0 ? 'No movements yet' : `${tx.length} recent`}
        />
        <StatCard
          href="/inventory/items"
          icon={AlertTriangle}
          label="Low Stock"
          value={lowStock.length}
          sub={lowStock.length === 0 ? 'All items above reorder level' : 'Items at or below reorder level'}
          warning={lowStock.length > 0}
        />
      </div>

      <div className="grid lg:grid-cols-2 gap-5">
        {/* Low-stock alerts */}
        <div className="p-5 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900">
          <div className="flex items-center gap-2 mb-4 pb-2 border-b border-slate-100 dark:border-slate-800">
            <AlertTriangle className="w-4 h-4 text-amber-500" />
            <h2 className="text-xs font-bold uppercase tracking-wide text-slate-500">Reorder Alerts</h2>
          </div>
          {lItems ? (
            <div className="flex justify-center py-6"><Loader2 className="w-4 h-4 animate-spin text-slate-400" /></div>
          ) : lowStock.length === 0 ? (
            <p className="text-sm text-slate-400 text-center py-6">All items above reorder level.</p>
          ) : (
            <div className="space-y-2">
              {lowStock.map(i => (
                <div key={i.id} className="flex items-center justify-between p-2.5 rounded-lg bg-amber-50 dark:bg-amber-900/20">
                  <div>
                    <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">{i.name}</p>
                    <p className="text-[10px] text-slate-400">{i.store_name}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-mono text-amber-700 dark:text-amber-300">
                      {Number(i.current_quantity)} {i.unit ?? ''}
                    </p>
                    <p className="text-[10px] text-slate-400">reorder ≤ {i.reorder_level}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Recent transactions */}
        <div className="p-5 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900">
          <div className="flex items-center gap-2 mb-4 pb-2 border-b border-slate-100 dark:border-slate-800">
            <ArrowLeftRight className="w-4 h-4 text-indigo-500" />
            <h2 className="text-xs font-bold uppercase tracking-wide text-slate-500">Recent Movements</h2>
          </div>
          {lTx ? (
            <div className="flex justify-center py-6"><Loader2 className="w-4 h-4 animate-spin text-slate-400" /></div>
          ) : recentTx.length === 0 ? (
            <p className="text-sm text-slate-400 text-center py-6">No movements yet.</p>
          ) : (
            <div className="space-y-2">
              {recentTx.map(t => (
                <div key={t.id} className="flex items-center justify-between p-2.5 rounded-lg bg-slate-50 dark:bg-slate-800/50">
                  <div className="flex items-center gap-2">
                    <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded ${
                      t.tx_type === 'in'  ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300'
                      : t.tx_type === 'out' ? 'bg-rose-100 dark:bg-rose-900/30 text-rose-700 dark:text-rose-300'
                      : 'bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300'
                    }`}>{t.tx_type}</span>
                    <div>
                      <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">{t.item_name}</p>
                      <p className="text-[10px] text-slate-400">{new Date(t.created_at).toLocaleString()}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-mono">{Number(t.quantity)}</p>
                    {t.balance_after != null && (
                      <p className="text-[10px] text-slate-400">balance: {Number(t.balance_after)}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function StatCard({
  href, icon: Icon, label, value, sub, warning,
}: {
  href: string; icon: React.ElementType; label: string;
  value: React.ReactNode; sub: string; warning?: boolean;
}) {
  return (
    <Link href={href}
      className={`block p-5 rounded-2xl border transition hover:shadow-md ${
        warning
          ? 'border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20'
          : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900'
      }`}>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-[10px] uppercase tracking-wide text-slate-400 font-semibold">{label}</p>
          <p className="text-2xl font-bold mt-1 text-slate-800 dark:text-white">{value}</p>
        </div>
        <Icon className={`w-5 h-5 ${warning ? 'text-amber-500' : 'text-indigo-500'}`} />
      </div>
      <p className="text-[11px] text-slate-400 mt-2">{sub}</p>
    </Link>
  );
}

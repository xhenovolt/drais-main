'use client'
import { useState, useEffect } from 'react';
import { toLocalDateStr } from '@/lib/datetime/local-date';
import { TahfizPlan, TahfizRecord } from '@/types/tahfiz';

export default function TahfizProgressPage() {
  const [plans, setPlans] = useState<TahfizPlan[]>([]);
  const [records, setRecords] = useState<TahfizRecord[]>([]);
  const [selectedDate, setSelectedDate] = useState(toLocalDateStr());
  const [loading, setLoading] = useState(false);

  // Fetch plans for selected date
  useEffect(() => {
    const fetchPlans = async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/tahfiz/plans?date=${selectedDate}`);
        const data = await res.json();
        setPlans(data);
      } catch (error) {
        console.error('Failed to fetch plans:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchPlans();
  }, [selectedDate]);

  // Handle record updates
  const handleRecordUpdate = async (record: Partial<TahfizRecord>) => {
    try {
      const res = await fetch('/api/tahfiz/records', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify([record])
      });
      
      if (!res.ok) throw new Error('Failed to update record');
      
      // Optimistically update UI
      setRecords(prev => 
        prev.map(r => 
          r.id === record.id ? { ...r, ...record } : r
        )
      );
    } catch (error) {
      console.error('Failed to update record:', error);
      // TODO: Show error toast
    }
  };

  // Render UI
  return (
    <div className="p-4">
      <h1 className="text-2xl font-bold mb-4">Tahfiz Progress Tracking</h1>
      
      {/* Date selector */}
      <input
        type="date"
        value={selectedDate}
        onChange={e => setSelectedDate(e.target.value)}
        className="mb-4 p-2 border rounded"
      />

      {/* Plans list */}
      {plans.map(plan => (
        <div key={plan.id} className="mb-8 border rounded p-4">
          <h2 className="text-xl mb-2">
            {plan.portion_text} ({plan.type})
          </h2>
          
          {/* Records table */}
          <table className="w-full">
            <thead>
              <tr>
                <th>Student</th>
                <th>Presented</th>
                <th>Length</th>
                <th>Retention</th>
                <th>Mark</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {records
                .filter(r => r.plan_id === plan.id)
                .map(record => (
                  <tr key={record.id}>
                    <td>{record.student_id}</td>
                    <td>
                      <input
                        type="checkbox"
                        checked={record.presented}
                        onChange={e => handleRecordUpdate({
                          ...record,
                          presented: e.target.checked
                        })}
                      />
                    </td>
                    <td>
                      <input
                        type="number"
                        value={record.presented_length}
                        onChange={e => handleRecordUpdate({
                          ...record,
                          presented_length: parseInt(e.target.value)
                        })}
                        className="w-20 p-1 border rounded"
                      />
                    </td>
                    <td>
                      <input
                        type="number"
                        value={record.retention_score || ''}
                        onChange={e => handleRecordUpdate({
                          ...record,
                          retention_score: parseFloat(e.target.value)
                        })}
                        className="w-20 p-1 border rounded"
                      />
                    </td>
                    <td>
                      <input
                        type="number"
                        value={record.mark || ''}
                        onChange={e => handleRecordUpdate({
                          ...record,
                          mark: parseFloat(e.target.value)
                        })}
                        className="w-20 p-1 border rounded"
                      />
                    </td>
                    <td>
                      <select
                        value={record.status}
                        onChange={e => handleRecordUpdate({
                          ...record,
                          status: e.target.value as any
                        })}
                        className="p-1 border rounded"
                      >
                        <option value="pending">Pending</option>
                        <option value="presented">Presented</option>
                        <option value="absent">Absent</option>
                        <option value="excused">Excused</option>
                      </select>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  );
}
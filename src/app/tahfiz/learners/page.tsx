'use client';
import React, { useEffect, useState } from 'react';

export default function LearnersPage() {
  const [learners, setLearners] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchLearners() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch('/api/tahfiz/learners'); // Replace 1 with the actual school_id
        const data = await res.json();
        if (!res.ok) throw new Error(data.message || 'Failed to fetch learners');
        setLearners(data.data);
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }
    fetchLearners();
  }, []);

  return (
    <div>
      <div className="toolbar">
        <button onClick={() => {/* open create modal (omitted for brevity) */}}>Add Learner</button>
      </div>
      {loading ? (
        <div>Loading...</div>
      ) : error ? (
        <div className="text-red-500">{error}</div>
      ) : (
        <table className="table">
          <thead>
            <tr>
              <th>Admission No</th>
              <th>Name</th>
              <th>Email</th>
              <th>Class</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {learners.map(l => (
              <tr key={l.id}>
                <td>{l.admission_no}</td>
                <td>{l.first_name} {l.last_name}</td>
                <td>{l.email || 'N/A'}</td>
                <td>{l.class_id ? `Class ${l.class_id}` : 'N/A'}</td> {/* Replace with actual class name if available */}
                <td>{l.status || 'N/A'}</td>
                <td>
                  <button onClick={() => {/* inline edit (open inline editor) */}}>Edit</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

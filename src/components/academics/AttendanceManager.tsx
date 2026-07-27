"use client";
import React, { useState } from 'react';
import { toLocalDateStr } from '@/lib/datetime/local-date';
import useSWR from 'swr';

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export const AttendanceManager: React.FC = () => {
  const [classId, setClassId] = useState('');
  const [streamId, setStreamId] = useState('');
  const [date, setDate] = useState(() => toLocalDateStr());
  const { data, mutate } = useSWR(
    `/api/attendance/list?class_id=${classId}&stream_id=${streamId}&date=${date}`,
    fetcher
  );
  const students = data?.data || [];

  const handleSignIn = async (student_id: number, class_id: number) => {
    await fetch('/api/attendance/signin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ student_id, class_id, date }),
    });
    mutate();
  };

  const handleSignOut = async (student_id: number, class_id: number) => {
    await fetch('/api/attendance/signout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ student_id, class_id, date }),
    });
    mutate();
  };

  return (
    <div className="p-4">
      <div className="flex gap-2 mb-4">
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="border rounded px-2 py-1"
        />
        <input
          placeholder="Class ID"
          value={classId}
          onChange={(e) => setClassId(e.target.value)}
          className="border rounded px-2 py-1"
        />
        <input
          placeholder="Stream ID"
          value={streamId}
          onChange={(e) => setStreamId(e.target.value)}
          className="border rounded px-2 py-1"
        />
      </div>
      <table className="min-w-full bg-white rounded shadow">
        <thead>
          <tr>
            <th className="px-2 py-1">Photo</th>
            <th className="px-2 py-1">Name</th>
            <th className="px-2 py-1">Stream</th>
            <th className="px-2 py-1">Sign In</th>
            <th className="px-2 py-1">Sign Out</th>
            <th className="px-2 py-1">Status</th>
          </tr>
        </thead>
        <tbody>
          {students.map((s: any) => (
            <tr key={s.student_id}>
              <td>
                {s.photo_url ? (
                  <img src={s.photo_url} alt="photo" className="w-10 h-10 rounded-full" />
                ) : (
                  <span className="w-10 h-10 inline-block bg-gray-200 rounded-full" />
                )}
              </td>
              <td>{s.first_name} {s.last_name}</td>
              <td>{s.stream_id || '-'}</td>
              <td>
                {!s.time_in ? (
                  <button
                    className="bg-green-500 text-white px-2 py-1 rounded"
                    onClick={() => handleSignIn(s.student_id, s.class_id)}
                  >
                    Sign In
                  </button>
                ) : (
                  <span className="text-xs">{s.time_in}</span>
                )}
              </td>
              <td>
                {s.time_in && !s.time_out ? (
                  <button
                    className="bg-yellow-500 text-white px-2 py-1 rounded"
                    onClick={() => handleSignOut(s.student_id, s.class_id)}
                  >
                    Sign Out
                  </button>
                ) : s.time_out ? (
                  <span className="text-xs">{s.time_out}</span>
                ) : (
                  "-"
                )}
              </td>
              <td>
                {s.time_in && s.time_out ? (
                  <span className="bg-blue-500 text-white px-2 py-1 rounded">Done</span>
                ) : s.time_in ? (
                  <span className="bg-green-500 text-white px-2 py-1 rounded">Signed In</span>
                ) : (
                  <span className="bg-gray-300 text-gray-700 px-2 py-1 rounded">Not Signed In</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};
export default AttendanceManager;
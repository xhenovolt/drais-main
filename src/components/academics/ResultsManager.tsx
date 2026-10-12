"use client";
import React, { useState } from "react";
import useSWR from "swr";
import { useI18n } from "@/components/i18n/I18nProvider";
import Swal from "sweetalert2";
import "sweetalert2/dist/sweetalert2.min.css";

const API_BASE = process.env.NEXT_PUBLIC_PHP_API_BASE || "http://localhost/drais/api";
const fetcher = (u: string) => fetch(u).then((r) => r.json());

export const ResultsManager: React.FC = () => {
  const { t } = useI18n();
  const { data: exams } = useSWR(`${API_BASE}/exams`, fetcher);
  const [examId, setExamId] = useState("");
  const results = useSWR(examId ? `${API_BASE}/results.php?exam_id=${examId}` : null, fetcher);
  const [form, setForm] = useState({ student_id: "", score: "", grade: "", remarks: "" });
  const [editForm, setEditForm] = useState<any>(null); // State for editing a result
  const [isEditing, setIsEditing] = useState(false); // Track if editing modal is open

  const add = async () => {
    if (!examId || !form.student_id) return;
    await fetch(`${API_BASE}/results.php`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        exam_id: parseInt(examId, 10),
        student_id: parseInt(form.student_id, 10),
        score: form.score ? parseFloat(form.score) : undefined,
        grade: form.grade || undefined,
        remarks: form.remarks || undefined,
      }),
    });
    setForm({ student_id: "", score: "", grade: "", remarks: "" });
    results.mutate();
  };

  const updateResult = async () => {
    if (!editForm || !editForm.id) return;
    await fetch(`${API_BASE}/results.php?id=${editForm.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        score: editForm.score ? parseFloat(editForm.score) : undefined,
        grade: editForm.grade || undefined,
        remarks: editForm.remarks || undefined,
      }),
    });
    setIsEditing(false);
    setEditForm(null);
    results.mutate();
  };

  const deleteResult = async (id: number) => {
    const result = await Swal.fire({
      title: "Are you sure?",
      text: "You won't be able to revert this!",
      icon: "warning",
      showCancelButton: true,
      confirmButtonColor: "#3085d6",
      cancelButtonColor: "#d33",
      confirmButtonText: "Yes, delete it!",
    });
    if (!result.isConfirmed) return;
    try {
      const response = await fetch(`${API_BASE}/results.php?id=${id}`, {
        method: "DELETE",
      });
      const result = await response.json();
      if (result.success) {
        alert("Result deleted successfully");
        results.mutate();
      } else {
        alert(result.error || "Failed to delete result");
      }
    } catch (error) {
      alert("An error occurred while deleting the result");
    }
  };

  return (
    <div className="space-y-6 mx-20">
      <h2 className="font-semibold text-lg bg-gradient-to-r from-indigo-600 via-fuchsia-600 to-pink-600 bg-clip-text text-transparent">
        {t("academics.results")}
      </h2>
      <div className="flex flex-wrap gap-2 items-end mb-2">
        <select
          value={examId}
          onChange={(e) => setExamId(e.target.value)}
          className="px-3 py-2 rounded-xl border border-blue-200 bg-gradient-to-r from-blue-100 to-pink-100 text-xs font-semibold min-w-[120px]"
        >
          <option value="">Select Exam</option>
          {exams?.data?.map((ex: any) => (
            <option key={ex.id} value={ex.id}>
              {ex.name}
            </option>
          ))}
        </select>
        <input
          placeholder={t("academics.student_id")}
          value={form.student_id}
          onChange={(e) => setForm({ ...form, student_id: e.target.value })}
          className="px-2 py-2 rounded-xl border bg-gradient-to-r from-blue-100 to-pink-100 text-xs"
        />
        <input
          placeholder={t("academics.score")}
          value={form.score}
          onChange={(e) => setForm({ ...form, score: e.target.value })}
          className="px-2 py-2 rounded-xl border bg-gradient-to-r from-blue-100 to-pink-100 text-xs"
        />
        <input
          placeholder={t("academics.grade")}
          value={form.grade}
          onChange={(e) => setForm({ ...form, grade: e.target.value })}
          className="px-2 py-2 rounded-xl border bg-gradient-to-r from-blue-100 to-pink-100 text-xs"
        />
        <input
          placeholder={t("academics.remarks")}
          value={form.remarks}
          onChange={(e) => setForm({ ...form, remarks: e.target.value })}
          className="px-2 py-2 rounded-xl border bg-gradient-to-r from-blue-100 to-pink-100 text-xs"
        />
        <button
          onClick={add}
          disabled={!examId || !form.student_id}
          className="px-4 py-2 rounded-xl bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 text-white text-xs font-semibold shadow-lg hover:scale-105 transition-transform"
        >
          {t("common.add")}
        </button>
      </div>
      <div className="rounded-2xl overflow-hidden border border-blue-200 dark:border-indigo-700 backdrop-blur bg-gradient-to-br from-white/80 via-blue-50/60 to-pink-50/60 dark:from-slate-900/80 dark:via-indigo-900/60 dark:to-purple-900/60 shadow-2xl">
        <table className="w-full text-xs">
          <thead className="bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 text-white">
            <tr>
              <th className="px-4 py-2 font-semibold">Student ID</th>
              <th className="px-4 py-2 font-semibold">Score</th>
              <th className="px-4 py-2 font-semibold">Grade</th>
              <th className="px-4 py-2 font-semibold">Remarks</th>
              <th className="px-4 py-2 font-semibold">ID</th>
              <th className="px-4 py-2 font-semibold">Actions</th>
            </tr>
          </thead>
          <tbody>
            {results.data?.data?.map((r: any) => (
              <tr
                key={r.id}
                className="hover:bg-gradient-to-r hover:from-blue-100 hover:via-pink-100 hover:to-indigo-100 dark:hover:from-indigo-900 dark:hover:via-purple-900 dark:hover:to-pink-900 transition-colors"
              >
                <td className="px-4 py-2 font-mono text-[11px]">{r.student_id}</td>
                <td className="px-4 py-2">{r.score || "-"}</td>
                <td className="px-4 py-2">{r.grade || "-"}</td>
                <td className="px-4 py-2 truncate max-w-[180px]">{r.remarks || "-"}</td>
                <td className="px-4 py-2 text-[10px]">{r.id}</td>
                <td className="px-4 py-2">
                  <button
                    onClick={() => {
                      setEditForm(r);
                      setIsEditing(true);
                    }}
                    className="px-2 py-1 text-xs bg-blue-500 text-white rounded hover:bg-blue-600"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => deleteResult(r.id)}
                    className="px-2 py-1 text-xs bg-red-500 text-white rounded hover:bg-red-600 ml-2"
                  >
                    {t("common.delete")}
                  </button>
                </td>
              </tr>
            ))}
            {!results.data || (results.data.data.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-blue-400">
                  {t("academics.no_results")}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Edit Modal */}
      {isEditing && editForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
          <div className="bg-white rounded-lg shadow-lg p-6 w-full max-w-md">
            <h2 className="text-lg font-semibold mb-4">Edit Result</h2>
            <div className="space-y-4">
              <input
                placeholder="Score"
                value={editForm.score}
                onChange={(e) => setEditForm({ ...editForm, score: e.target.value })}
                className="w-full px-3 py-2 border rounded"
              />
              <input
                placeholder="Grade"
                value={editForm.grade}
                onChange={(e) => setEditForm({ ...editForm, grade: e.target.value })}
                className="w-full px-3 py-2 border rounded"
              />
              <input
                placeholder="Remarks"
                value={editForm.remarks}
                onChange={(e) => setEditForm({ ...editForm, remarks: e.target.value })}
                className="w-full px-3 py-2 border rounded"
              />
            </div>
            <div className="flex justify-end mt-4">
              <button
                onClick={() => setIsEditing(false)}
                className="px-4 py-2 bg-gray-300 rounded mr-2"
              >
                Cancel
              </button>
              <button
                onClick={updateResult}
                className="px-4 py-2 bg-blue-500 text-white rounded"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
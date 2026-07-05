'use client';

import React, { useState, useEffect } from 'react';
import { Edit2, Save, X, RotateCcw } from 'lucide-react';

interface TeacherInitialsProps {
  classId: number;
  subjectId: number;
  className: string;
  subjectName: string;
  currentInitials: string;
  teacherName?: string;
  onUpdate?: (newInitials: string) => void;
  readonly?: boolean;
}

export default function EditableTeacherInitials({
  classId,
  subjectId,
  className,
  subjectName,
  currentInitials,
  teacherName,
  onUpdate,
  readonly = false
}: TeacherInitialsProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [initials, setInitials] = useState(currentInitials);
  const [originalInitials, setOriginalInitials] = useState(currentInitials);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    setInitials(currentInitials);
    setOriginalInitials(currentInitials);
  }, [currentInitials]);

  const handleSave = async () => {
    if (initials.length > 10) {
      setError('Initials must be 10 characters or less');
      return;
    }

    setIsLoading(true);
    setError('');

    try {
      const response = await fetch('/api/teacher-initials', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          classId,
          subjectId,
          initials: initials.trim() || null
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Failed to update initials');
      }

      setOriginalInitials(initials.trim());
      setIsEditing(false);
      onUpdate?.(initials.trim());
    } catch (err: any) {
      setError(err.message || 'Failed to update initials');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCancel = () => {
    setInitials(originalInitials);
    setIsEditing(false);
    setError('');
  };

  const handleReset = async () => {
    setIsLoading(true);
    setError('');

    try {
      const response = await fetch('/api/teacher-initials', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          classId,
          subjectId,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Failed to reset initials');
      }

      setInitials('');
      setOriginalInitials('');
      setIsEditing(false);
      onUpdate?.('');
    } catch (err: any) {
      setError(err.message || 'Failed to reset initials');
    } finally {
      setIsLoading(false);
    }
  };

  if (readonly) {
    return (
      <div className="flex items-center space-x-2">
        <span className="font-mono font-bold text-blue-600">
          {currentInitials || 'N/A'}
        </span>
        {teacherName && (
          <span className="text-sm text-muted-foreground">
            ({teacherName})
          </span>
        )}
      </div>
    );
  }

  return (
    <div className="flex items-center space-x-2">
      {isEditing ? (
        <div className="flex items-center space-x-2">
          <input
            type="text"
            value={initials}
            onChange={(e) => setInitials(e.target.value.toUpperCase())}
            className="px-2 py-1 border border-border rounded font-mono font-bold text-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="Enter initials"
            maxLength={10}
            autoFocus
          />
          <button
            onClick={handleSave}
            disabled={isLoading}
            className="p-1 text-green-600 hover:bg-green-50 rounded disabled:opacity-50"
            title="Save"
          >
            <Save size={16} />
          </button>
          <button
            onClick={handleCancel}
            disabled={isLoading}
            className="p-1 text-muted-foreground hover:bg-muted rounded disabled:opacity-50"
            title="Cancel"
          >
            <X size={16} />
          </button>
          <button
            onClick={handleReset}
            disabled={isLoading}
            className="p-1 text-orange-600 hover:bg-orange-50 rounded disabled:opacity-50"
            title="Reset to auto-generated"
          >
            <RotateCcw size={16} />
          </button>
        </div>
      ) : (
        <div className="flex items-center space-x-2">
          <span className="font-mono font-bold text-blue-600">
            {currentInitials || 'N/A'}
          </span>
          {teacherName && (
            <span className="text-sm text-muted-foreground">
              ({teacherName})
            </span>
          )}
          <button
            onClick={() => setIsEditing(true)}
            className="p-1 text-muted-foreground hover:text-muted-foreground hover:bg-muted rounded"
            title="Edit initials"
          >
            <Edit2 size={14} />
          </button>
        </div>
      )}
      
      {error && (
        <div className="text-red-500 text-sm mt-1">
          {error}
        </div>
      )}
      
      <div className="text-xs text-muted-foreground">
        {className} - {subjectName}
      </div>
    </div>
  );
}

// Hook for fetching teacher initials
export function useTeacherInitials(classId?: number, subjectId?: number) {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchInitials = async () => {
    try {
      const params = new URLSearchParams();
      if (classId) params.append('classId', classId.toString());
      if (subjectId) params.append('subjectId', subjectId.toString());

      const response = await fetch(`/api/teacher-initials?${params}`);
      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.message || 'Failed to fetch initials');
      }

      setData(result.data || []);
    } catch (err: any) {
      setError(err.message || 'Failed to fetch initials');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchInitials();
  }, [classId, subjectId]);

  return { data, loading, error, refetch: fetchInitials };
}

'use client';

import { useEffect, useState, useCallback, useRef, useMemo, useOptimistic, useTransition } from 'react';
import Link from 'next/link';
import {
  Search,
  Plus,
  Download,
  Eye,
  Trash2,
  AlertCircle,
  CheckSquare,
  Square,
  X,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Users,
  MoreVertical,
  Zap,
  Move,
  Camera,
  Loader,
  UserPlus,
  GraduationCap,
  FileDown,
  Check,
  MoreHorizontal,
  Upload,
  Fingerprint,
  Wifi,
  Globe,
  Radio,
  DollarSign,
  FolderOpen,
} from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import ReassignClassModal from '../_client/ReassignClassModal';
import { BulkPhotoUploadModal } from '@/components/students/BulkPhotoUploadModal';
import { FolderPhotoUploadModal } from '@/components/students/FolderPhotoUploadModal';
import { ImportModal } from '@/components/students/ImportModal';
import { LiveIdentityPopup } from '@/components/students/LiveIdentityPopup';
import { useExport } from '@/hooks/useExport';
import { showToast, confirmAction } from '@/lib/toast';
import { toast } from 'react-hot-toast';
import { apiFetch } from '@/lib/apiClient';
import DeviceSelector, { getPreferredDevice } from '@/components/modals/DeviceSelector';
import SyncDeviceModal from '@/components/device/SyncDeviceModal';
import { 
  safeArray, 
  safeString, 
  safeMultiFieldFilter,
  scopedLogger,
  standardizeResponse,
  assertArray,
} from '@/lib/safety';

// Scoped logger for this module
const logger = scopedLogger('StudentsList');

// Interfaces
interface Student {
  id: number;
  person_id: number;
  admission_no: string;
  first_name: string;
  last_name: string;
  gender: string;
  photo_url?: string;
  admission_date?: string;
}

interface EnrolledStudent extends Student {
  enrollment_id: number;
  class_id: number;
  class_name: string;
  stream_id?: number;
  stream_name?: string;
  academic_year_id: number;
  academic_year_name: string;
  term_id?: number;
  term_name?: string;
  study_mode_id?: number;
  study_mode_name?: string;
  programs?: Array<{ id: number; name: string }>;
  program_id?: number;
  program_name?: string;
  // All active enrollments for this student (multi-program)
  allEnrollments?: EnrolledStudent[];
  enrollment_status: string;
  enrollment_date: string;
  enrollment_type?: string;
  // Finance fields (populated when showFees toggle is on)
  balance?: number;
  total_charged?: number;
  total_paid?: number;
}

interface EnrollmentFormData {
  student_id: number;
  class_id: number;
  stream_id?: number;
  program_ids: number[];
  study_mode_id: number;
  academic_year_id: number;
  term_id: number;
}

interface SelectOption {
  id: number;
  name: string;
  program_id?: number | null;
  program_name?: string | null;
}

export default function StudentsListPage() {
  const { exportAsCSV, exportAsExcel, exporting } = useExport();
  
  // State Management
  const [activeTab, setActiveTab] = useState<'enrolled' | 'admitted'>('enrolled');
  const [enrolledStudents, setEnrolledStudents] = useState<EnrolledStudent[]>([]);
  const [admittedStudents, setAdmittedStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterClassId, setFilterClassId] = useState<number>(0);
  const [filterYearId, setFilterYearId]   = useState<number>(0);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [showExportMenu, setShowExportMenu] = useState(false);

  // Pagination
  const PAGE_SIZE = 50;
  const [page, setPage] = useState(1);

  // Inline editing — per-field state (matches ClassResultsManager pattern)
  const [editingCell, setEditingCell] = useState<{ studentId: number; field: 'first_name' | 'last_name' } | null>(null);
  const [editValue, setEditValue] = useState<string>('');
  const [isPendingName, startNameTransition] = useTransition();

  // Bulk Action State
  const [showReassignModal, setShowReassignModal] = useState(false);
  const [showPhotoUploadModal, setShowPhotoUploadModal] = useState(false);
  const [showFolderUploadModal, setShowFolderUploadModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [isReassigning, setIsReassigning] = useState(false);
  const [showBulkEnrollModal, setShowBulkEnrollModal] = useState(false);
  const [isBulkEnrolling, setIsBulkEnrolling] = useState(false);

  // Sync from Device
  const [showSyncModal, setShowSyncModal] = useState(false);

  // Capture mode: 'adms' (cloud / device_commands table) | 'local' (direct TCP) | 'relay' (relay bridge)
  const [captureMode, setCaptureMode] = useState<'adms' | 'local' | 'relay'>(() => {
    if (typeof window === 'undefined') return 'relay';
    return (localStorage.getItem('drais_capture_mode') as 'adms' | 'local' | 'relay') ?? 'relay';
  });
  const [localDeviceIp, setLocalDeviceIp] = useState<string>(() => {
    if (typeof window === 'undefined') return '192.168.1.197';
    return localStorage.getItem('drais_local_device_ip') ?? '192.168.1.197';
  });
  const [relayDeviceSn, setRelayDeviceSn] = useState<string>(() => {
    if (typeof window === 'undefined') return '';
    return localStorage.getItem('drais_relay_device_sn') ?? '';
  });
  const [showModeSettings, setShowModeSettings] = useState(false);
  const modeSettingsRef = useRef<HTMLDivElement>(null);

  // Fingerprint Quick-Capture State
  const [fingerprintEnrolledIds, setFingerprintEnrolledIds] = useState<Set<number>>(new Set());
  const [showDeviceSelector, setShowDeviceSelector] = useState(false);
  const [captureStudentId, setCaptureStudentId] = useState<number | null>(null);
  // Enrollment lifecycle: studentId → { step, commandId, deviceName }
  type EnrollStep = 'waking' | 'sent' | 'success' | 'failed';
  const [enrollProgress, setEnrollProgress] = useState<Map<number, { step: EnrollStep; commandId?: number; deviceName?: string; message?: string }>>(new Map());
  const pollTimers = useRef<Map<number, ReturnType<typeof setInterval>>>(new Map());
  // Synchronous in-flight guard — prevents double-click race before React re-renders
  const enrollInFlight = useRef<Set<number>>(new Set());
  // Last Enrolled confirmation panel
  const [lastEnrolled, setLastEnrolled] = useState<{ name: string; studentId: number; uid?: number; device: string; ts: Date } | null>(null);
  // Bulk Assign Program Modal (enrolled students only)
  const [showAssignProgramModal, setShowAssignProgramModal] = useState(false);
  const [isAssigningProgram, setIsAssigningProgram] = useState(false);
  const [suggestedProgramId, setSuggestedProgramId] = useState<number>(0);

  // Enrollment Modal State
  const [showEnrollModal, setShowEnrollModal] = useState(false);
  const [enrollingStudent, setEnrollingStudent] = useState<Student | null>(null);
  const [enrollForm, setEnrollForm] = useState<EnrollmentFormData>({
    student_id: 0,
    class_id: 0,
    program_ids: [],
    study_mode_id: 0,
    academic_year_id: 0,
    term_id: 0,
  });
  const [enrollLoading, setEnrollLoading] = useState(false);
  const [enrollError, setEnrollError] = useState<string>('');
  const [enrollmentValidation, setEnrollmentValidation] = useState<Record<string, boolean>>({
    class_id: false,
    program_ids: false,
    study_mode_id: false,
    academic_year_id: false,
    term_id: false,
  });
  
  // Options for Dropdowns
  const [classes, setClasses] = useState<SelectOption[]>([]);
  const [streams, setStreams] = useState<SelectOption[]>([]);
  const [programs, setPrograms] = useState<SelectOption[]>([]);
  const [studyModes, setStudyModes] = useState<SelectOption[]>([]);
  const [academicYears, setAcademicYears] = useState<SelectOption[]>([]);
  const [terms, setTerms] = useState<SelectOption[]>([]);

  // Fees column toggle — fetches balances for visible students on demand
  const [showFees, setShowFees] = useState(false);
  const [feesLoading, setFeesLoading] = useState(false);
  const [studentBalances, setStudentBalances] = useState<Map<number, { balance: number; total_charged: number; total_paid: number }>>(new Map());

  // Persist capture mode settings
  useEffect(() => {
    localStorage.setItem('drais_capture_mode', captureMode);
    localStorage.setItem('drais_local_device_ip', localDeviceIp);
    localStorage.setItem('drais_relay_device_sn', relayDeviceSn);
  }, [captureMode, localDeviceIp, relayDeviceSn]);  // Close mode settings dropdown on outside click
  useEffect(() => {
    if (!showModeSettings) return;
    const handler = (e: MouseEvent) => {
      if (modeSettingsRef.current && !modeSettingsRef.current.contains(e.target as Node)) {
        setShowModeSettings(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showModeSettings]);

  // Load options
  useEffect(() => {
    loadOptions();
    fetchFingerprintStatus();
  }, []);

  const loadOptions = async () => {
    logger.log('Loading dropdown options...');
    try {
      const [classData, streamData, progData, modeData, yearData, termData] = await Promise.all([
        apiFetch('/api/classes', { silent: true }),
        apiFetch('/api/streams', { silent: true }),
        apiFetch('/api/programs', { silent: true }),
        apiFetch('/api/study-modes', { silent: true }),
        apiFetch('/api/academic_years', { silent: true }),
        apiFetch('/api/terms', { silent: true }),
      ]);

      const normalizedClasses = standardizeResponse<SelectOption>(classData);
      setClasses(normalizedClasses.data);
      logger.debug('[Classes]', normalizedClasses.data);

      const normalizedStreams = standardizeResponse<SelectOption>(streamData);
      setStreams(normalizedStreams.data);
      logger.debug('[Streams]', normalizedStreams.data);

      const normalizedPrograms = standardizeResponse<SelectOption>(progData);
      setPrograms(normalizedPrograms.data);
      logger.debug('[Programs]', normalizedPrograms.data);

      const normalizedModes = standardizeResponse<SelectOption>(modeData);
      setStudyModes(normalizedModes.data);
      logger.debug('[StudyModes]', normalizedModes.data);

      const normalizedYears = standardizeResponse<SelectOption>(yearData);
      setAcademicYears(normalizedYears.data);
      logger.debug('[AcademicYears]', normalizedYears.data);

      const normalizedTerms = standardizeResponse<SelectOption>(termData);
      setTerms(normalizedTerms.data);
      logger.debug('[Terms]', normalizedTerms.data);

      logger.log('✅ All dropdown options loaded');
    } catch (error) {
      logger.error('Failed to load options:', error);
      setClasses([]);
      setStreams([]);
      setPrograms([]);
      setStudyModes([]);
      setAcademicYears([]);
      setTerms([]);
      showToast('error', 'Failed to load form options');
    }
  };

  // Fingerprint status fetch
  const fetchFingerprintStatus = async () => {
    try {
      const data = await apiFetch('/api/students/fingerprint-status', { silent: true });
      const ids: number[] = data?.data || [];
      setFingerprintEnrolledIds(new Set(ids));
    } catch {
      // Non-critical, leave empty
    }
  };

  // ── Local Direct Enrollment ────────────────────────────────────────────────
  const sendLocalEnrollCommand = async (studentId: number) => {
    const label = `Direct (${localDeviceIp})`;
    setStudentEnrollStep(studentId, { step: 'waking', deviceName: label, message: `Connecting to ${localDeviceIp}…` });
    try {
      const res = await apiFetch('/api/device/local-enroll', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ student_id: studentId, device_ip: localDeviceIp }),
        silent: true,
      });
      if (res?.success) {
        setStudentEnrollStep(studentId, {
          step: 'success',
          deviceName: label,
          message: `Identity Synchronized. K40 ready — scan finger now.`,
        });
        setFingerprintEnrolledIds(prev => new Set(prev).add(studentId));
        setLastEnrolled({ name: res.student_name || 'Student', studentId, uid: res.uid, device: label, ts: new Date() });
        enrollInFlight.current.delete(studentId);
        // Auto-clear after 30s (enough time for 3-finger scan)
        setTimeout(() => clearStudentEnroll(studentId), 30000);
      } else {
        throw new Error(res?.error || 'Local enrollment failed');
      }
    } catch (err: any) {
      enrollInFlight.current.delete(studentId);
      setStudentEnrollStep(studentId, {
        step: 'failed',
        deviceName: label,
        message: err?.message || 'Direct connection failed',
      });
      setTimeout(() => clearStudentEnroll(studentId), 5000);
    }
  };

  // ── Relay Bridge Enrollment ───────────────────────────────────────────────
  const sendRelayEnrollCommand = async (studentId: number) => {
    const sn = relayDeviceSn || getPreferredDevice()?.sn || '';
    if (!sn) {
      setCaptureStudentId(studentId);
      setShowDeviceSelector(true);
      return;
    }
    const label = `Relay (${sn})`;
    setStudentEnrollStep(studentId, { step: 'waking', deviceName: label, message: 'Queuing relay command…' });
    try {
      const res = await apiFetch('/api/device/relay-enroll', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ student_id: studentId, device_sn: sn }),
        silent: true,
      });
      if (!res?.success) throw new Error(res?.error || 'Relay enroll failed');
      const studentName = res.student_name || 'Student';

      // Local warm-up succeeded — server reached device directly, no polling needed
      if (res.local_warmup) {
        setStudentEnrollStep(studentId, {
          step: 'success',
          deviceName: label,
          message: res.message || 'Identity Synchronized. Machine is ready for scanning.',
        });
        setFingerprintEnrolledIds(prev => new Set(prev).add(studentId));
        setLastEnrolled({ name: studentName, studentId, uid: res.uid, device: label, ts: new Date() });
        showToast('success', `Identity Synchronized for ${studentName}`);
        setTimeout(() => clearStudentEnroll(studentId), 30000);
        return;
      }

      const commandId = res.command_id;
      const hint = res.relay_online ? '' : ' (relay agent offline — command queued)';
      setStudentEnrollStep(studentId, {
        step: 'waking',
        commandId,
        deviceName: label,
        message: `Sent to relay agent${hint}…`,
      });
      startRelayPolling(studentId, commandId, label, sn, studentName);
      showToast('info', `Relay enroll queued for ${studentName}${hint}`);
    } catch (err: any) {
      setStudentEnrollStep(studentId, { step: 'failed', deviceName: label, message: err?.message || 'Relay enroll failed' });
      showToast('error', err?.message || 'Relay enroll failed');
      setTimeout(() => clearStudentEnroll(studentId), 5000);
    }
  };

  const startRelayPolling = (studentId: number, commandId: number, deviceName: string, deviceSn: string, studentName?: string) => {
    const existing = pollTimers.current.get(studentId);
    if (existing) clearInterval(existing);

    let pendingSeconds = 0;

    const timer = setInterval(async () => {
      try {
        const data = await apiFetch(
          `/api/device/relay-enroll/status?command_id=${commandId}`,
          { silent: true },
        );
        const status = data?.data?.status;
        const agentOnline = data?.data?.relay_online;

        if (status === 'sent') {
          pendingSeconds = 0;
          setStudentEnrollStep(studentId, { step: 'sent', commandId, deviceName, message: 'Relay agent executing on device…' });
        } else if (status === 'completed') {
          setStudentEnrollStep(studentId, { step: 'success', commandId, deviceName, message: 'Identity Synchronized — scan finger now ⬆' });
          if (studentName) setLastEnrolled({ name: studentName, studentId, device: deviceName, ts: new Date() });
          clearInterval(timer);
          pollTimers.current.delete(studentId);
          setTimeout(() => clearStudentEnroll(studentId), 30000);
        } else if (status === 'failed') {
          setStudentEnrollStep(studentId, {
            step: 'failed', commandId, deviceName,
            message: data?.data?.error_message || 'Relay command failed',
          });
          clearInterval(timer);
          pollTimers.current.delete(studentId);
          setTimeout(() => clearStudentEnroll(studentId), 5000);
        } else {
          // still pending
          pendingSeconds += 2;
          const hint = !agentOnline && pendingSeconds >= 10
            ? ' — relay agent offline?'
            : `… (${pendingSeconds}s)`;
          setStudentEnrollStep(studentId, {
            step: 'waking', commandId, deviceName,
            message: `Waiting for relay agent${hint}`,
          });
        }
      } catch {
        // keep polling
      }
    }, 2000);

    pollTimers.current.set(studentId, timer);
  };

  // Quick-Capture fingerprint flow
  const handleQuickCapture = (studentId: number) => {
    // Synchronous ref guard — blocks double-click race before React re-renders enrollProgress state
    if (enrollInFlight.current.has(studentId)) return;
    if (enrollProgress.has(studentId)) return;
    enrollInFlight.current.add(studentId);
    if (captureMode === 'local') {
      sendLocalEnrollCommand(studentId);
      return;
    }
    if (captureMode === 'relay') {
      sendRelayEnrollCommand(studentId);
      return;
    }
    // ADMS cloud path
    const preferred = getPreferredDevice();
    if (preferred) {
      sendEnrollCommand(studentId, preferred.sn, preferred.name);
    } else {
      setCaptureStudentId(studentId);
      setShowDeviceSelector(true);
    }
  };

  const handleDeviceSelected = (deviceSn: string, deviceName: string) => {
    if (captureStudentId) {
      sendEnrollCommand(captureStudentId, deviceSn, deviceName);
    }
    setShowDeviceSelector(false);
    setCaptureStudentId(null);
  };

  const setStudentEnrollStep = (studentId: number, data: { step: EnrollStep; commandId?: number; deviceName?: string; message?: string }) => {
    setEnrollProgress(prev => {
      const m = new Map(prev);
      m.set(studentId, data);
      return m;
    });
  };

  const clearStudentEnroll = (studentId: number) => {
    // Stop any active poll timer
    const timer = pollTimers.current.get(studentId);
    if (timer) { clearInterval(timer); pollTimers.current.delete(studentId); }
    setEnrollProgress(prev => { const m = new Map(prev); m.delete(studentId); return m; });
  };

  const startPolling = (studentId: number, commandId: number, deviceName: string) => {
    // Clear existing timer if any
    const existing = pollTimers.current.get(studentId);
    if (existing) clearInterval(existing);

    const timer = setInterval(async () => {
      try {
        const data = await apiFetch(`/api/students/enroll-fingerprint/status?command_id=${commandId}`, { silent: true });
        const status = data?.data?.status;

        if (status === 'sent') {
          setStudentEnrollStep(studentId, { step: 'sent', commandId, deviceName, message: 'Syncing to device…' });
        } else if (status === 'acknowledged') {
          setStudentEnrollStep(studentId, { step: 'success', commandId, deviceName, message: 'Synced! Enroll fingerprint on device now.' });
          // Add to enrolled set
          setFingerprintEnrolledIds(prev => new Set(prev).add(studentId));
          // Stop polling & auto-clear after 4s
          clearInterval(timer);
          pollTimers.current.delete(studentId);
          setTimeout(() => clearStudentEnroll(studentId), 4000);
        } else if (status === 'expired' || status === 'failed') {
          setStudentEnrollStep(studentId, { step: 'failed', commandId, deviceName, message: data?.data?.error_message || 'Command expired or failed.' });
          clearInterval(timer);
          pollTimers.current.delete(studentId);
          setTimeout(() => clearStudentEnroll(studentId), 5000);
        }
        // If still 'pending', keep polling
      } catch {
        // Poll failed — keep trying
      }
    }, 2000);

    pollTimers.current.set(studentId, timer);
  };

  // Clean up poll timers on unmount
  useEffect(() => {
    return () => {
      pollTimers.current.forEach(timer => clearInterval(timer));
    };
  }, []);

  const sendEnrollCommand = async (studentId: number, deviceSn: string, deviceName: string) => {
    setStudentEnrollStep(studentId, { step: 'waking', deviceName, message: 'Syncing identity to device…' });
    try {
      const result = await apiFetch('/api/students/enroll-fingerprint', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ student_id: studentId, device_sn: deviceSn }),
        silent: true,
      });
      const studentName = result?.student_name || 'Student';
      const commandId = result?.command_id;

      if (commandId) {
        // If the server says command was already sent (existing pending/sent)
        if (result?.status === 'sent') {
          setStudentEnrollStep(studentId, { step: 'sent', commandId, deviceName, message: `Syncing ${studentName} to device…` });
        } else {
          setStudentEnrollStep(studentId, { step: 'waking', commandId, deviceName, message: `Sending ${studentName} to device…` });
        }
        startPolling(studentId, commandId, deviceName);
        showToast('info', `Syncing ${studentName} to ${deviceName}`);
      } else {
        clearStudentEnroll(studentId);
        showToast('success', result?.message || 'Enrollment command sent');
      }
    } catch (err: any) {
      setStudentEnrollStep(studentId, { step: 'failed', deviceName, message: err?.message || 'Failed to send command' });
      showToast('error', err?.message || 'Failed to send enrollment command');
      setTimeout(() => clearStudentEnroll(studentId), 4000);
    }
  };

  // Main data fetching
  useEffect(() => {
    fetchStudents();
  }, [search, filterClassId, filterYearId]);

  const fetchStudents = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ search });
      if (filterClassId)  params.set('class_id',          String(filterClassId));
      if (filterYearId)  {
        params.set('academic_year_id', String(filterYearId));
        params.set('historical',       'true');
      }
      logger.log('Fetching students — search:', search, 'class:', filterClassId, 'year:', filterYearId);
      
      const [enrolledData, admittedData] = await Promise.all([
        apiFetch(`/api/students/enrolled?${params}`, { silent: true }),
        apiFetch(`/api/students/admitted?${params}`, { silent: true }),
      ]);

      const normalizedEnrolled = standardizeResponse<EnrolledStudent>(enrolledData);
      const rawEnrolled = assertArray(normalizedEnrolled.data, 'Enrolled students', logger)
        ? normalizedEnrolled.data
        : [];
      // Group multiple enrollment rows (one per program) into one record per student
      const studentMap = new Map<number, EnrolledStudent>();
      for (const row of rawEnrolled) {
        const existing = studentMap.get(row.id);
        if (existing) {
          existing.allEnrollments = [...(existing.allEnrollments ?? [existing]), row];
        } else {
          studentMap.set(row.id, { ...row, allEnrollments: [row] });
        }
      }
      const safeEnrolled = Array.from(studentMap.values());
      setEnrolledStudents(safeEnrolled);
      logger.debug('[Enrolled Students]', safeEnrolled.length, 'students,', rawEnrolled.length, 'enrollment rows');

      const normalizedAdmitted = standardizeResponse<Student>(admittedData);
      const safeAdmitted = assertArray(normalizedAdmitted.data, 'Admitted students', logger)
        ? normalizedAdmitted.data
        : [];
      setAdmittedStudents(safeAdmitted);
      logger.debug('[Admitted Students]', safeAdmitted.length, 'records');
    } catch (error) {
      logger.error('Failed to fetch students:', error);
      setEnrolledStudents([]);
      setAdmittedStudents([]);
    } finally {
      setLoading(false);
    }
  };

  // ── Fees column toggle ────────────────────────────────────────────────────
  const fetchFeesForVisible = async (students: EnrolledStudent[]) => {
    if (students.length === 0) return;
    setFeesLoading(true);
    try {
      const ids = students.map(s => s.id);
      const data = await apiFetch('/api/finance/balances-batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ student_ids: ids }),
        silent: true,
      });
      const raw: Record<string, { balance: number; total_charged: number; total_paid: number }> = data?.balances ?? {};
      const map = new Map<number, { balance: number; total_charged: number; total_paid: number }>();
      for (const [key, val] of Object.entries(raw)) {
        map.set(Number(key), val);
      }
      setStudentBalances(map);
    } catch {
      showToast('error', 'Failed to load fee balances');
    } finally {
      setFeesLoading(false);
    }
  };

  const handleToggleFees = () => {
    if (!showFees) {
      // Turning on — fetch balances for visible enrolled students
      fetchFeesForVisible(enrolledStudents);
    } else {
      setStudentBalances(new Map());
    }
    setShowFees(v => !v);
  };

  // ── Per-field inline name editing (ClassResultsManager pattern) ──
  const updateName = (student: Student, field: 'first_name' | 'last_name', value: string) => {
    const original = field === 'first_name' ? student.first_name : student.last_name;
    if (value === original) return;

    const savingToast = toast.loading('Saving…', { duration: Infinity });
    // Optimistic update
    setEnrolledStudents(prev => prev.map(s => s.id === student.id ? { ...s, [field]: value } : s));
    setAdmittedStudents(prev => prev.map(s => s.id === student.id ? { ...s, [field]: value } : s));

    startNameTransition(async () => {
      try {
        const result = await apiFetch('/api/students/edit', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: student.id, [field]: value }),
          silent: true,
        });
        toast.dismiss(savingToast);
        if (result?.success) {
          const updated = result.data ?? { [field]: value };
          setEnrolledStudents(prev => prev.map(s => s.id === student.id ? { ...s, ...updated } : s));
          setAdmittedStudents(prev => prev.map(s => s.id === student.id ? { ...s, ...updated } : s));
          toast.success(`${field.replace('_', ' ')} updated`);
        } else {
          // Revert
          setEnrolledStudents(prev => prev.map(s => s.id === student.id ? { ...s, [field]: original } : s));
          setAdmittedStudents(prev => prev.map(s => s.id === student.id ? { ...s, [field]: original } : s));
          toast.error(result?.message || `Failed to update ${field.replace('_', ' ')}`);
        }
      } catch (err) {
        toast.dismiss(savingToast);
        setEnrolledStudents(prev => prev.map(s => s.id === student.id ? { ...s, [field]: original } : s));
        setAdmittedStudents(prev => prev.map(s => s.id === student.id ? { ...s, [field]: original } : s));
        toast.error('Failed to save name');
      }
    });
  };

  // Enrollment Modal Handlers
  const openEnrollModal = (student: Student) => {
    setEnrollingStudent(student);
    setEnrollForm({
      student_id: student.id,
      class_id: 0,
      program_ids: [],
      study_mode_id: 0,
      academic_year_id: 0,
      term_id: 0,
    });
    setEnrollError('');
    setEnrollmentValidation({
      class_id: false,
      program_ids: false,
      study_mode_id: false,
      academic_year_id: false,
      term_id: false,
    });
    setShowEnrollModal(true);
  };

  // Real-time form validation
  const validateEnrollForm = (form: EnrollmentFormData) => {
    const validation = {
      class_id: form.class_id !== 0,
      program_ids: form.program_ids.length > 0,
      study_mode_id: form.study_mode_id !== 0,
      academic_year_id: form.academic_year_id !== 0,
      term_id: form.term_id !== 0,
    };
    setEnrollmentValidation(validation);
    return Object.values(validation).every(v => v);
  };

  // Check if student is already enrolled in the same program+academic year
  const checkDuplicateEnrollment = (studentId: number, academicYearId: number, programId?: number): boolean => {
    const student = enrolledStudents.find(s => s.id === studentId);
    if (!student) return false;
    const allE = student.allEnrollments ?? [student];
    if (programId) {
      return allE.some(e => e.academic_year_id === academicYearId && e.program_id === programId);
    }
    // No program specified — let DB constraint handle true duplicates
    return false;
  };

  const handleEnroll = async () => {
    if (!validateEnrollForm(enrollForm)) {
      showToast('error', 'Please fill all required fields');
      setEnrollError('All fields marked with * are required');
      return;
    }

    if (checkDuplicateEnrollment(enrollForm.student_id, enrollForm.academic_year_id, enrollForm.program_ids[0])) {
      setEnrollError('Student is already enrolled in this program for this academic year');
      showToast('error', 'Student is already enrolled in this program for this academic year');
      return;
    }

    setEnrollLoading(true);
    setEnrollError('');
    try {
      await apiFetch('/api/enrollments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(enrollForm),
        successMessage: 'Student enrolled successfully',
      });
      setShowEnrollModal(false);
      setSelectedIds(prev => { const next = new Set(prev); next.delete(enrollForm.student_id); return next; });
      fetchStudents();
    } catch (error: any) {
      const errorMsg = error.message || 'Enrollment failed - please try again';
      setEnrollError(errorMsg);
    } finally {
      setEnrollLoading(false);
    }
  };

  // Toggle program selection
  const toggleProgram = (programId: number) => {
    setEnrollForm(prev => ({
      ...prev,
      program_ids: prev.program_ids.includes(programId)
        ? prev.program_ids.filter(id => id !== programId)
        : [...prev.program_ids, programId]
    }));
  };

  // Delete ALL learners for this school (destructive)
  const handleDeleteAllLearners = async () => {
    const total = enrolledStudents.length + admittedStudents.length;
    const confirmed = await confirmAction(
      '⚠️ Remove ALL Learners',
      `This will permanently remove all ${total > 0 ? total : ''} learners from this school. Enrollments, fee records, and fingerprint mappings will become orphaned. This action CANNOT be undone. Are you absolutely sure?`,
      'Yes, Delete All Learners',
    );
    if (!confirmed) return;

    // Second confirmation — type-check style via a second SweetAlert prompt
    const { value: typed } = await (await import('sweetalert2')).default.fire({
      title: 'Type DELETE to confirm',
      input: 'text',
      inputPlaceholder: 'DELETE',
      showCancelButton: true,
      confirmButtonColor: '#d33',
      confirmButtonText: 'Confirm',
      inputValidator: (v) => v !== 'DELETE' ? 'You must type DELETE exactly' : null,
    });
    if (typed !== 'DELETE') return;

    try {
      const res = await apiFetch('/api/students/bulk/delete-all', {
        method: 'DELETE',
        successMessage: `All learners removed successfully`,
      });
      showToast('success', res?.message || 'All learners removed');
      setSelectedIds(new Set());
      fetchStudents();
    } catch (error) {
      logger.error('Delete-all error:', error);
    }
  };

  // Soft-delete student handler
  const handleDeleteStudent = async (studentId: number) => {
    const student = admittedStudents.find(s => s.id === studentId);
    if (!student) return;

    const confirmed = await confirmAction(
      'Delete Student',
      `Remove ${safeString(student.first_name)} ${safeString(student.last_name)}? They will be soft-deleted and recoverable.`,
      'Delete'
    );
    if (!confirmed) return;

    try {
      await apiFetch('/api/students/delete', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: studentId }),
        successMessage: 'Student removed',
      });
      fetchStudents();
    } catch (error) {
      logger.error('Delete error:', error);
    }
  };

  // Hard (permanent) delete — only for already-soft-deleted students
  const handlePermanentDelete = async (studentId: number, name: string) => {
    const confirmed = await confirmAction(
      '⚠️ Permanently Delete',
      `This will PERMANENTLY delete ${name} and all their records. This CANNOT be undone.`,
      'Delete Forever',
    );
    if (!confirmed) return;
    try {
      await apiFetch('/api/students/delete-permanent', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: studentId }),
        successMessage: 'Permanently deleted',
      });
      fetchStudents();
    } catch (error) {
      logger.error('Permanent delete error:', error);
    }
  };

  // Selection handlers
  const handleSelectAll = () => {
    const currentList = activeTab === 'enrolled' ? enrolledStudents : admittedStudents;
    if (selectedIds.size === currentList.length) {
      setSelectedIds(new Set());
    } else {
      const ids = currentList.map(s => s.id);
      setSelectedIds(new Set(ids));
    }
  };

  const handleSelectStudent = (studentId: number) => {
    const newSelected = new Set(selectedIds);
    if (newSelected.has(studentId)) {
      newSelected.delete(studentId);
    } else {
      newSelected.add(studentId);
    }
    setSelectedIds(newSelected);
  };

  // Export handlers
  const handleExportCSV = (sourceData: any[]) => {
    const dataToExport = sourceData.map(s => ({
      'Admission No': s.admission_no,
      'First Name': s.first_name,
      'Last Name': s.last_name,
      ...(activeTab === 'enrolled' && {
        'Class': s.class_name || '-',
        'Programs': s.programs?.map((p: any) => p.name).join('; ') || '-',
        'Study Mode': s.study_mode_name || '-',
      }),
    }));
    exportAsCSV(dataToExport, `students_${activeTab}`, []);
    setShowExportMenu(false);
  };

  const handleExportExcel = (sourceData: any[]) => {
    const dataToExport = sourceData.map(s => ({
      'Admission No': s.admission_no,
      'First Name': s.first_name,
      'Last Name': s.last_name,
      ...(activeTab === 'enrolled' && {
        'Class': s.class_name || '-',
        'Programs': s.programs?.map((p: any) => p.name).join('; ') || '-',
        'Study Mode': s.study_mode_name || '-',
      }),
    }));
    exportAsExcel(dataToExport, `students_${activeTab}`, [], 'Student List');
    setShowExportMenu(false);
  };

  // Bulk class reassignment with optimistic UI update
  const handleReassignClass = async (newClassId: number, reason: string) => {
    if (selectedIds.size === 0) {
      showToast('error', 'Please select students first');
      return;
    }
    setIsReassigning(true);
    try {
      const data = await apiFetch<any>('/api/students/reassign-class', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          student_ids: Array.from(selectedIds),
          new_class_id: newClassId,
          reason: reason || null,
        }),
        successMessage: `${selectedIds.size} student(s) reassigned successfully`,
      });

      const newClass = classes.find(c => c.id === newClassId);
      setEnrolledStudents(prev =>
        prev.map(s =>
          selectedIds.has(s.id)
            ? { ...s, class_id: newClassId, class_name: newClass?.name || '' }
            : s
        )
      );
      setSelectedIds(new Set());
      setShowReassignModal(false);
    } catch (error: any) {
      // apiFetch already toasts, but check for partial success in error data
    } finally {
      setIsReassigning(false);
    }
  };

  const currentData = activeTab === 'enrolled' ? enrolledStudents : admittedStudents;

  const filteredData = useMemo(() => safeMultiFieldFilter(
    currentData, search, ['first_name', 'last_name', 'admission_no']
  ), [currentData, search]);

  // Client-side pagination
  const totalPages = Math.max(1, Math.ceil(filteredData.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageData = filteredData.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);
  const showFrom = filteredData.length === 0 ? 0 : (safePage - 1) * PAGE_SIZE + 1;
  const showTo   = Math.min(safePage * PAGE_SIZE, filteredData.length);

  // Reset page when tab/search/filter changes
  const resetPage = () => setPage(1);

  // Select all on current page
  const allPageSelected = pageData.length > 0 && pageData.every(s => selectedIds.has(s.id));
  const handleSelectPage = () => {
    if (allPageSelected) {
      setSelectedIds(prev => { const n = new Set(prev); pageData.forEach(s => n.delete(s.id)); return n; });
    } else {
      setSelectedIds(prev => { const n = new Set(prev); pageData.forEach(s => n.add(s.id)); return n; });
    }
  };

  // ── Avatar helper ────────────────────────────────────────────────────────
  const AvatarCell = ({ student }: { student: Student }) => {
    const initials = `${student.first_name?.[0] ?? ''}${student.last_name?.[0] ?? ''}`.toUpperCase();
    const colors = ['bg-indigo-500', 'bg-violet-500', 'bg-emerald-500', 'bg-amber-500', 'bg-rose-500', 'bg-cyan-500'];
    const color = colors[(student.id ?? 0) % colors.length];
    if (student.photo_url) {
      return <img src={student.photo_url} alt={initials} className="w-7 h-7 rounded-full object-cover ring-1 ring-white dark:ring-slate-700 flex-shrink-0" />;
    }
    return <div className={`w-7 h-7 rounded-full ${color} flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0`}>{initials || '?'}</div>;
  };

  // ── Inline editable name cell (ClassResultsManager pattern) ────────────
  const NameCell = ({ student }: { student: Student }) => {
    const isEditingFirst = editingCell?.studentId === student.id && editingCell.field === 'first_name';
    const isEditingLast  = editingCell?.studentId === student.id && editingCell.field === 'last_name';
    const isUpdating = isPendingName && (isEditingFirst || isEditingLast);

    const saveCell = (field: 'first_name' | 'last_name') => {
      if (editingCell?.studentId === student.id && editingCell.field === field) {
        updateName(student, field, editValue);
        setEditingCell(null);
        setEditValue('');
      }
    };

    const openCell = (field: 'first_name' | 'last_name') => {
      if (isUpdating) return;
      setEditingCell({ studentId: student.id, field });
      setEditValue(field === 'first_name' ? student.first_name : student.last_name);
    };

    const cancelCell = () => {
      setEditingCell(null);
      setEditValue('');
    };

    const renderField = (field: 'first_name' | 'last_name', isEditing: boolean, widthClass: string) => {
      if (isEditing) {
        return (
          <input
            autoFocus
            value={editValue}
            onChange={e => setEditValue(e.target.value)}
            onBlur={() => saveCell(field)}
            onKeyDown={e => {
              if (e.key === 'Enter') saveCell(field);
              if (e.key === 'Escape') cancelCell();
            }}
            className={`bg-transparent border-0 border-b border-indigo-500 text-sm font-semibold text-slate-800 dark:text-white ${widthClass} focus:outline-none focus:ring-0 truncate px-0 py-0.5`}
            spellCheck={false}
            disabled={isUpdating}
          />
        );
      }
      return (
        <span
          className={`text-sm font-semibold text-slate-800 dark:text-white ${widthClass} truncate border-b border-transparent hover:border-slate-300 cursor-text py-0.5 transition-colors`}
          onClick={() => openCell(field)}
          title={`Click to edit ${field.replace('_', ' ')}`}
        >
          {student[field]}
        </span>
      );
    };

    return (
      <div className="flex items-center gap-2 min-w-0">
        <AvatarCell student={student} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1">
            {renderField('first_name', isEditingFirst, 'w-[90px]')}
            {renderField('last_name', isEditingLast, 'flex-1 min-w-0')}
            {isUpdating && <Loader className="w-3 h-3 text-indigo-400 animate-spin flex-shrink-0" />}
          </div>
          {(student as EnrolledStudent).class_name && (
            <p className="text-[11px] text-slate-400 truncate">{(student as EnrolledStudent).class_name}</p>
          )}
        </div>
      </div>
    );
  };

  // ── Skeleton row ─────────────────────────────────────────────────────────
  const SkeletonRow = () => (
    <tr className="animate-pulse border-b border-slate-100 dark:border-slate-800">
      <td className="px-3 py-2.5 w-8"><div className="w-4 h-4 rounded bg-slate-200 dark:bg-slate-700" /></td>
      <td className="px-3 py-2.5">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-full bg-slate-200 dark:bg-slate-700 flex-shrink-0" />
          <div className="space-y-1 flex-1"><div className="h-3 w-28 rounded bg-slate-200 dark:bg-slate-700" /><div className="h-2.5 w-16 rounded bg-slate-100 dark:bg-slate-800" /></div>
        </div>
      </td>
      <td className="px-3 py-2.5"><div className="h-3 w-20 rounded bg-slate-100 dark:bg-slate-800" /></td>
      <td className="px-3 py-2.5"><div className="h-3 w-16 rounded bg-slate-100 dark:bg-slate-800" /></td>
      <td className="px-3 py-2.5"><div className="h-5 w-14 rounded-full bg-slate-100 dark:bg-slate-800" /></td>
      <td className="px-3 py-2.5"><div className="h-5 w-12 rounded-full bg-slate-100 dark:bg-slate-800" /></td>
      <td className="px-3 py-2.5 w-8" />
    </tr>
  );

  const enrolledCount = enrolledStudents.length;
  const admittedCount = admittedStudents.length;

  return (
    <div className="flex flex-col h-screen bg-slate-50 dark:bg-slate-950 overflow-hidden">

      {/* ── TOOLBAR (48px) ──────────────────────────────────────────────── */}
      <div className="flex-shrink-0 sticky top-0 z-40 h-12 flex items-center gap-2 px-3 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 shadow-sm">

        {/* Search */}
        <div className="relative flex items-center group">
          <Search className="absolute left-2.5 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
          <input
            type="text"
            placeholder="Search students…"
            value={search}
            onChange={e => { setSearch(e.target.value); resetPage(); }}
            className="h-8 pl-8 pr-14 w-48 sm:w-56 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs text-slate-700 dark:text-slate-200 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all focus:w-72"
          />
          <kbd className="absolute right-2 text-[10px] font-mono text-slate-400 border border-slate-200 dark:border-slate-700 rounded px-1 py-0.5 bg-slate-50 dark:bg-slate-800 pointer-events-none select-none">⌘K</kbd>
        </div>

        {/* Inline filters (enrolled only) */}
        {activeTab === 'enrolled' && (
          <>
            <div className="relative hidden sm:flex items-center">
              <select
                value={filterClassId}
                onChange={e => { setFilterClassId(Number(e.target.value)); resetPage(); }}
                className="h-8 pl-2.5 pr-6 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 appearance-none cursor-pointer"
              >
                <option value={0}>All classes</option>
                {(() => {
                  const grouped = (Array.isArray(classes) ? classes : []).reduce((acc: Record<string, SelectOption[]>, c) => {
                    const key = c.program_name || 'General';
                    (acc[key] = acc[key] || []).push(c);
                    return acc;
                  }, {});
                  const entries = Object.entries(grouped);
                  if (entries.length <= 1 && entries[0]?.[0] === 'General') {
                    return (Array.isArray(classes) ? classes : []).map(c => <option key={c.id} value={c.id}>{c.name}</option>);
                  }
                  return entries.map(([prog, list]) => (
                    <optgroup key={prog} label={prog}>{list.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</optgroup>
                  ));
                })()}
              </select>
              <ChevronDown className="absolute right-1.5 w-3 h-3 text-slate-400 pointer-events-none" />
            </div>

            <div className="relative hidden sm:flex items-center">
              <select
                value={filterYearId}
                onChange={e => { setFilterYearId(Number(e.target.value)); resetPage(); }}
                className="h-8 pl-2.5 pr-6 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 appearance-none cursor-pointer"
              >
                <option value={0}>Current term</option>
                {academicYears.map(y => <option key={y.id} value={y.id}>{y.name}</option>)}
              </select>
              <ChevronDown className="absolute right-1.5 w-3 h-3 text-slate-400 pointer-events-none" />
            </div>

            {(filterClassId !== 0 || filterYearId !== 0) && (
              <button onClick={() => { setFilterClassId(0); setFilterYearId(0); resetPage(); }}
                className="flex items-center gap-0.5 h-8 px-2 rounded-lg text-[10px] text-slate-500 hover:text-red-500 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 transition-colors">
                <X className="w-3 h-3" />
              </button>
            )}
          </>
        )}

        {/* Spacer */}
        <div className="flex-1" />

        {/* Center: Enrolled / Admitted pill tabs */}
        <div className="flex items-center gap-0.5 h-8 p-0.5 rounded-lg bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
          <button
            onClick={() => { setActiveTab('enrolled'); setSelectedIds(new Set()); resetPage(); }}
            className={`flex items-center gap-1.5 h-7 px-3 rounded-md text-xs font-semibold transition-all ${
              activeTab === 'enrolled'
                ? 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-400 shadow-sm'
                : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
            }`}
          >
            <GraduationCap className="w-3.5 h-3.5" />
            Enrolled
            <span className={`tabular-nums text-[10px] px-1.5 py-0.5 rounded-full font-bold ${activeTab === 'enrolled' ? 'bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300' : 'bg-slate-200 dark:bg-slate-700 text-slate-500'}`}>
              {enrolledCount}
            </span>
          </button>
          <button
            onClick={() => { setActiveTab('admitted'); setSelectedIds(new Set()); resetPage(); }}
            className={`flex items-center gap-1.5 h-7 px-3 rounded-md text-xs font-semibold transition-all ${
              activeTab === 'admitted'
                ? 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-400 shadow-sm'
                : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
            }`}
          >
            <Users className="w-3.5 h-3.5" />
            Admitted
            <span className={`tabular-nums text-[10px] px-1.5 py-0.5 rounded-full font-bold ${activeTab === 'admitted' ? 'bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300' : 'bg-slate-200 dark:bg-slate-700 text-slate-500'}`}>
              {admittedCount}
            </span>
          </button>
        </div>

        <div className="flex-1" />

        {/* Right: action buttons */}
        <div className="flex items-center gap-1">

          {/* ── Last Enrolled Confirmation ──────────────────────────────── */}
          {lastEnrolled && (
            <div className="hidden sm:flex items-center gap-1.5 h-8 px-2.5 rounded-lg border border-emerald-300 dark:border-emerald-700 bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 text-xs font-medium max-w-[220px] truncate">
              <Check className="w-3.5 h-3.5 flex-shrink-0 text-emerald-500" />
              <span className="truncate" title={`${lastEnrolled.name}${lastEnrolled.uid ? ` · UID ${lastEnrolled.uid}` : ''} · ${lastEnrolled.device} · ${lastEnrolled.ts.toLocaleTimeString()}`}>
                {lastEnrolled.name}
                {lastEnrolled.uid ? <span className="opacity-60 ml-1">UID {lastEnrolled.uid}</span> : null}
                <span className="opacity-50 ml-1">{lastEnrolled.ts.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
              </span>
              <button onClick={() => setLastEnrolled(null)} className="flex-shrink-0 ml-0.5 opacity-50 hover:opacity-100">
                <X className="w-3 h-3" />
              </button>
            </div>
          )}

          {/* ── Capture Mode Toggle ─────────────────────────────────────────── */}
          <div className="relative" ref={modeSettingsRef}>
            <button
              onClick={() => setShowModeSettings(v => !v)}
              title={captureMode === 'local' ? `Local Direct — ${localDeviceIp}` : captureMode === 'relay' ? `Relay Bridge — ${relayDeviceSn || 'no device'}` : 'Cloud ADMS Mode'}
              className={`hidden sm:flex items-center justify-center w-8 h-8 rounded-lg border text-xs font-semibold transition-colors ${
                captureMode === 'local'
                  ? 'border-indigo-300 dark:border-indigo-700 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400'
                  : captureMode === 'relay'
                  ? 'border-purple-300 dark:border-purple-700 bg-purple-50 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400'
                  : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
              }`}
            >
              {captureMode === 'local' ? <Wifi className="w-3.5 h-3.5" /> : captureMode === 'relay' ? <Radio className="w-3.5 h-3.5" /> : <Globe className="w-3.5 h-3.5" />}
            </button>

            {showModeSettings && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setShowModeSettings(false)} />
                <div className="absolute right-0 top-9 z-50 w-72 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-xl p-3 text-xs">
                  <p className="font-semibold text-slate-700 dark:text-slate-200 mb-2">Fingerprint Capture Mode</p>

                  <button
                    onClick={() => setCaptureMode('adms')}
                    className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg mb-1 transition-colors ${captureMode === 'adms' ? 'bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 font-semibold' : 'hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300'}`}
                  >
                    <Globe className="w-3.5 h-3.5 flex-shrink-0" />
                    <div className="text-left">
                      <div>Cloud / ADMS</div>
                      <div className="text-[10px] opacity-60 font-normal">Queues ENROLL_FP via device heartbeat</div>
                    </div>
                  </button>

                  <button
                    onClick={() => setCaptureMode('relay')}
                    className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg mb-1 transition-colors ${captureMode === 'relay' ? 'bg-purple-50 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 font-semibold' : 'hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300'}`}
                  >
                    <Radio className="w-3.5 h-3.5 flex-shrink-0" />
                    <div className="text-left">
                      <div>Relay Bridge ☁→🖧</div>
                      <div className="text-[10px] opacity-60 font-normal">CMD_STARTENROLL via relay agent on LAN</div>
                    </div>
                  </button>

                  <button
                    onClick={() => setCaptureMode('local')}
                    className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg mb-2 transition-colors ${captureMode === 'local' ? 'bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 font-semibold' : 'hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300'}`}
                  >
                    <Wifi className="w-3.5 h-3.5 flex-shrink-0" />
                    <div className="text-left">
                      <div>Local / Direct ⚡</div>
                      <div className="text-[10px] opacity-60 font-normal">Instant TCP — server on same LAN</div>
                    </div>
                  </button>

                  {captureMode === 'relay' && (
                    <div className="border-t border-slate-100 dark:border-slate-700 pt-2">
                      <label className="block text-[10px] font-semibold text-slate-500 dark:text-slate-400 mb-1 uppercase tracking-wide">
                        Device Serial Number
                      </label>
                      <input
                        type="text"
                        value={relayDeviceSn}
                        onChange={e => setRelayDeviceSn(e.target.value.trim())}
                        placeholder="e.g. GED7254601154"
                        className="w-full h-7 px-2 rounded-md border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 font-mono text-xs focus:outline-none focus:ring-1 focus:ring-purple-400"
                      />
                      <p className="mt-1 text-[10px] text-slate-400 dark:text-slate-500">
                        Relay agent must be running on school LAN
                      </p>
                    </div>
                  )}
                  {captureMode === 'local' && (
                    <div className="border-t border-slate-100 dark:border-slate-700 pt-2">
                      <label className="block text-[10px] font-semibold text-slate-500 dark:text-slate-400 mb-1 uppercase tracking-wide">
                        Device IP
                      </label>
                      <input
                        type="text"
                        value={localDeviceIp}
                        onChange={e => setLocalDeviceIp(e.target.value.trim())}
                        placeholder="192.168.1.197"
                        className="w-full h-7 px-2 rounded-md border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 font-mono text-xs focus:outline-none focus:ring-1 focus:ring-indigo-400"
                      />
                    </div>
                  )}
                </div>
              </>
            )}
          </div>

          {/* Export dropdown */}
          <div className="relative">
            <button
              onClick={() => setShowExportMenu(v => !v)}
              title="Export students"
              className="group flex items-center justify-center w-8 h-8 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 transition-colors"
            >
              <FileDown className="w-4 h-4" />
            </button>
            {showExportMenu && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setShowExportMenu(false)} />
                <div className="absolute right-0 top-9 z-50 w-40 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-xl py-1 text-xs">
                  <button onClick={() => handleExportCSV(filteredData)} disabled={exporting} className="w-full text-left px-3 py-2 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 disabled:opacity-50 flex items-center gap-2">
                    <FileDown className="w-3.5 h-3.5 text-slate-400" /> CSV
                  </button>
                  <button onClick={() => handleExportExcel(filteredData)} disabled={exporting} className="w-full text-left px-3 py-2 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 disabled:opacity-50 flex items-center gap-2 border-t border-slate-100 dark:border-slate-700">
                    <FileDown className="w-3.5 h-3.5 text-slate-400" /> Excel
                  </button>
                </div>
              </>
            )}
          </div>

          <Link href="/students/promote" title="Promote students"
            className="hidden sm:flex items-center justify-center w-8 h-8 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-500 hover:text-amber-600 dark:text-slate-400 dark:hover:text-amber-400 transition-colors">
            <Zap className="w-4 h-4" />
          </Link>

          {/* Show Fees toggle — enrolled only */}
          {activeTab === 'enrolled' && (
            <button
              onClick={handleToggleFees}
              disabled={feesLoading}
              title={showFees ? 'Hide fee balances' : 'Show fee balances'}
              className={`hidden sm:flex items-center justify-center w-8 h-8 rounded-lg border text-xs font-semibold transition-colors ${
                showFees
                  ? 'border-emerald-300 dark:border-emerald-700 bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400'
                  : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
              }`}
            >
              {feesLoading
                ? <Loader className="w-3.5 h-3.5 animate-spin" />
                : <DollarSign className="w-3.5 h-3.5" />}
            </button>
          )}

          <button title="Bulk Import" onClick={() => setShowImportModal(true)}
            className="hidden sm:flex items-center justify-center w-8 h-8 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 text-slate-600 hover:text-emerald-700 dark:text-slate-400 dark:hover:text-emerald-400 transition-colors">
            <Upload className="w-3.5 h-3.5" />
          </button>

          <button
            title="Folder Photo Upload — auto-match photos by filename"
            onClick={() => setShowFolderUploadModal(true)}
            className="hidden sm:flex items-center justify-center w-8 h-8 rounded-lg border border-violet-200 dark:border-violet-800 bg-white dark:bg-slate-800 hover:bg-violet-50 dark:hover:bg-violet-900/20 text-violet-500 hover:text-violet-700 dark:text-violet-400 dark:hover:text-violet-300 transition-colors"
          >
            <FolderOpen className="w-3.5 h-3.5" />
          </button>

          <button title="Sync from Device — pull users &amp; fingerprints from ZKTeco K40" onClick={() => setShowSyncModal(true)}
            className="hidden sm:flex items-center justify-center w-8 h-8 rounded-lg border border-blue-200 dark:border-blue-700 bg-white dark:bg-slate-800 hover:bg-blue-50 dark:hover:bg-blue-900/20 text-blue-500 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 transition-colors">
            <Wifi className="w-3.5 h-3.5" />
          </button>

          <button title="Remove ALL learners from this school — destructive" onClick={handleDeleteAllLearners}
            className="hidden sm:flex items-center justify-center w-8 h-8 rounded-lg border border-red-300 dark:border-red-800 bg-white dark:bg-slate-800 hover:bg-red-50 dark:hover:bg-red-900/20 text-red-500 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 transition-colors">
            <Trash2 className="w-3.5 h-3.5" />
          </button>

          <Link href="/students/admit" title="Add new student"
            className="flex items-center justify-center w-8 h-8 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm transition-colors">
            <Plus className="w-3.5 h-3.5" />
          </Link>
        </div>
      </div>

      {/* ── TABLE AREA ──────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-hidden flex flex-col min-h-0">
        <div className="flex-1 overflow-auto">
          <table className="w-full min-w-[640px] border-separate border-spacing-0">
            {/* Sticky thead */}
            <thead className="sticky top-0 z-30">
              <tr className="bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800">
                <th className="w-9 px-3 py-2.5 text-left">
                  <button onClick={handleSelectPage} className="flex items-center justify-center w-4 h-4 text-slate-400 hover:text-indigo-600 transition-colors">
                    {allPageSelected ? <CheckSquare className="w-4 h-4 text-indigo-600" /> : <Square className="w-4 h-4" />}
                  </button>
                </th>
                <th className="w-9 px-2 py-2.5 text-center" title="Fingerprint Enrollment">
                  <Fingerprint className="w-3.5 h-3.5 text-slate-400 mx-auto" />
                </th>
                <th className="px-3 py-2.5 text-left text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Student</th>
                <th className="px-3 py-2.5 text-left text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Reg No</th>
                {activeTab === 'enrolled' && (
                  <>
                    <th className="px-3 py-2.5 text-left text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide hidden sm:table-cell">Class</th>
                    <th className="px-3 py-2.5 text-left text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide hidden md:table-cell">Stream</th>
                    <th className="px-3 py-2.5 text-left text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide hidden md:table-cell">Type</th>
                  </>
                )}
                {activeTab === 'admitted' && (
                  <th className="px-3 py-2.5 text-left text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide hidden sm:table-cell">Admitted</th>
                )}
                <th className="px-3 py-2.5 text-left text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Status</th>
                <th className="px-3 py-2.5 text-right text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide hidden lg:table-cell whitespace-nowrap">
                  {activeTab === 'enrolled' ? 'Balance' : 'Gender'}
                </th>
                <th className="w-9 px-3 py-2.5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
              {loading ? (
                Array.from({ length: 12 }).map((_, i) => <SkeletonRow key={i} />)
              ) : pageData.length === 0 ? (
                <tr>
                  <td colSpan={activeTab === 'enrolled' ? 8 : 7} className="px-4 py-20 text-center">
                    <div className="flex flex-col items-center gap-3">
                      <div className="w-12 h-12 rounded-2xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
                        <Users className="w-6 h-6 text-slate-400" />
                      </div>
                      <p className="text-sm font-semibold text-slate-600 dark:text-slate-300">
                        {search ? `No results for "${search}"` : activeTab === 'enrolled' ? 'No enrolled students' : 'No admitted students'}
                      </p>
                      {search && (
                        <button onClick={() => { setSearch(''); resetPage(); }} className="text-xs text-indigo-600 hover:underline">Clear search</button>
                      )}
                    </div>
                  </td>
                </tr>
              ) : (
                pageData.map((student, rowIdx) => {
                  const enrolled = student as EnrolledStudent;
                  const selected = selectedIds.has(student.id);
                  const isEven = rowIdx % 2 === 0;

                  return (
                    <tr
                      key={`${activeTab}-${student.id}`}
                      className={`group transition-colors ${selected ? 'bg-indigo-50 dark:bg-indigo-950/40' : isEven ? 'bg-white dark:bg-slate-900' : 'bg-slate-50/50 dark:bg-slate-900/50'} hover:bg-indigo-50/60 dark:hover:bg-indigo-950/30`}
                    >
                      {/* Checkbox */}
                      <td className="px-3 py-2.5 w-9">
                        <button onClick={() => handleSelectStudent(student.id)} className="flex items-center justify-center w-4 h-4 text-slate-400 hover:text-indigo-600 transition-colors">
                          {selected ? <CheckSquare className="w-4 h-4 text-indigo-600" /> : <Square className="w-4 h-4" />}
                        </button>
                      </td>

                      {/* Fingerprint Quick-Capture with Waiting Room */}
                      <td className="px-2 py-2.5 w-9 text-center">
                        {(() => {
                          const progress = enrollProgress.get(student.id);
                          if (progress) {
                            // Waiting Room states
                            if (progress.step === 'waking') {
                              return (
                                <div className="flex items-center justify-center" title={progress.message}>
                                  <Loader className="w-4 h-4 text-amber-500 animate-spin mx-auto" />
                                </div>
                              );
                            }
                            if (progress.step === 'sent') {
                              return (
                                <div className="flex items-center justify-center" title={progress.message}>
                                  <Fingerprint className="w-4 h-4 text-blue-500 animate-pulse mx-auto" />
                                </div>
                              );
                            }
                            if (progress.step === 'success') {
                              return (
                                <div className="flex items-center justify-center" title={progress.message}>
                                  <Check className="w-4 h-4 text-emerald-500 mx-auto" />
                                </div>
                              );
                            }
                            if (progress.step === 'failed') {
                              return (
                                <div className="flex items-center justify-center" title={progress.message}>
                                  <AlertCircle className="w-4 h-4 text-red-500 mx-auto" />
                                </div>
                              );
                            }
                          }
                          // Default: idle fingerprint button
                          return (
                            <button
                              onClick={() => handleQuickCapture(student.id)}
                              title={fingerprintEnrolledIds.has(student.id) ? 'Re-enroll fingerprint' : 'Enroll fingerprint'}
                              className={`flex items-center justify-center w-6 h-6 rounded-md transition-colors mx-auto ${
                                fingerprintEnrolledIds.has(student.id)
                                  ? 'text-emerald-500 hover:bg-emerald-50 dark:hover:bg-emerald-900/20'
                                  : 'text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-900/20'
                              }`}
                            >
                              <Fingerprint className="w-4 h-4" />
                            </button>
                          );
                        })()}
                      </td>

                      {/* Student name (inline editable) */}
                      <td className="px-3 py-2.5 max-w-[220px]">
                        <NameCell student={student} />
                      </td>

                      {/* Reg No */}
                      <td className="px-3 py-2.5 text-xs font-mono text-slate-500 dark:text-slate-400 whitespace-nowrap">
                        {safeString(student.admission_no) || <span className="text-slate-400">—</span>}
                      </td>

                      {/* Class · Program tags · Stream · Type (enrolled) */}
                      {activeTab === 'enrolled' && (
                        <>
                          <td className="px-3 py-2.5 text-xs text-slate-600 dark:text-slate-300 hidden sm:table-cell">
                            <div className="flex flex-wrap gap-1">
                              {(enrolled.allEnrollments ?? [enrolled]).map(e => (
                                <span
                                  key={e.enrollment_id}
                                  className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 whitespace-nowrap"
                                  title={e.program_name ? `Program: ${e.program_name}` : undefined}
                                >
                                  {e.program_name && (
                                    <span className="text-indigo-400 dark:text-indigo-500 mr-0.5">{e.program_name}:</span>
                                  )}
                                  {e.class_name || '—'}
                                </span>
                              ))}
                              {!enrolled.allEnrollments && !enrolled.class_name && (
                                <span className="text-slate-400">—</span>
                              )}
                            </div>
                          </td>
                          <td className="px-3 py-2.5 text-xs text-slate-500 dark:text-slate-400 whitespace-nowrap hidden md:table-cell">
                            {enrolled.stream_name || <span className="text-slate-400">—</span>}
                          </td>
                          <td className="px-3 py-2.5 hidden md:table-cell">
                            {enrolled.enrollment_type ? (
                              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 capitalize">
                                {enrolled.enrollment_type}
                              </span>
                            ) : null}
                          </td>
                        </>
                      )}

                      {/* Admitted date (admitted tab) */}
                      {activeTab === 'admitted' && (
                        <td className="px-3 py-2.5 text-xs text-slate-500 dark:text-slate-400 whitespace-nowrap hidden sm:table-cell">
                          {student.admission_date ? new Date(student.admission_date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : <span className="text-slate-400">—</span>}
                        </td>
                      )}

                      {/* Status badge */}
                      <td className="px-3 py-2.5">
                        <StatusBadge status={(student as any).status ?? (activeTab === 'enrolled' ? (enrolled.enrollment_status ?? 'active') : 'admitted')} />
                      </td>

                      {/* Balance (enrolled) or Gender (admitted) — always shown */}
                      <td className="px-3 py-2.5 hidden lg:table-cell text-right whitespace-nowrap">
                        {activeTab === 'enrolled' ? (
                          feesLoading ? (
                            <span className="inline-block w-12 h-3 rounded bg-slate-200 dark:bg-slate-700 animate-pulse" />
                          ) : (() => {
                            const bal = studentBalances.get(student.id);
                            const balance = bal?.balance ?? 0;
                            const charged = bal?.total_charged ?? 0;
                            const paid    = bal?.total_paid ?? 0;
                            const owing = balance > 0;
                            return (
                              <Link
                                href={`/students/${student.id}/fees`}
                                title={`Charged: ${charged.toFixed(2)} · Paid: ${paid.toFixed(2)}`}
                                className={`inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full text-[11px] font-semibold transition-opacity hover:opacity-80 ${
                                  owing
                                    ? 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400'
                                    : charged > 0
                                    ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400'
                                    : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400'
                                }`}
                              >
                                {balance.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                              </Link>
                            );
                          })()
                        ) : (
                          <span className="text-xs text-slate-500 dark:text-slate-400 capitalize">{student.gender || '—'}</span>
                        )}
                      </td>

                      {/* Row actions */}
                      <td className="px-3 py-2.5 w-16">
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          {activeTab === 'enrolled' ? (
                            <>
                              <Link href={`/students/${student.id}`} title="View profile" className="flex items-center justify-center w-6 h-6 rounded-md hover:bg-indigo-100 dark:hover:bg-indigo-900/30 text-slate-400 hover:text-indigo-600 transition-colors">
                                <Eye className="w-3.5 h-3.5" />
                              </Link>
                              <Link href={`/students/${student.id}/fees`} title="Fees ledger" className="flex items-center justify-center w-6 h-6 rounded-md hover:bg-emerald-100 dark:hover:bg-emerald-900/30 text-slate-400 hover:text-emerald-600 transition-colors">
                                <DollarSign className="w-3.5 h-3.5" />
                              </Link>
                            </>
                          ) : (
                            <div className="flex items-center gap-1">
                              <button onClick={() => openEnrollModal(student)} title="Enroll student" className="flex items-center justify-center w-6 h-6 rounded-md bg-indigo-600 hover:bg-indigo-700 text-white transition-colors">
                                <UserPlus className="w-3.5 h-3.5" />
                              </button>
                              <button onClick={() => handleDeleteStudent(student.id)} title="Soft delete" className="flex items-center justify-center w-6 h-6 rounded-md hover:bg-red-100 dark:hover:bg-red-900/30 text-slate-400 hover:text-red-600 transition-colors">
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => handlePermanentDelete(student.id, `${student.first_name} ${student.last_name}`)}
                                title="Permanently delete"
                                className="flex items-center justify-center w-6 h-6 rounded-md hover:bg-red-200 dark:hover:bg-red-900/50 text-red-400 hover:text-red-700 transition-colors"
                              >
                                <X className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* ── PAGINATION FOOTER ────────────────────────────────────────── */}
        {!loading && filteredData.length > 0 && (
          <div className="flex-shrink-0 flex items-center justify-between px-4 h-10 border-t border-slate-200 dark:border-slate-800 bg-white/95 dark:bg-slate-900/95 backdrop-blur-sm text-xs text-slate-500 dark:text-slate-400">
            <span className="tabular-nums">
              Showing <strong className="text-slate-700 dark:text-slate-200">{showFrom}–{showTo}</strong> of <strong className="text-slate-700 dark:text-slate-200">{filteredData.length}</strong>
            </span>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={safePage <= 1}
                className="flex items-center justify-center w-7 h-7 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 disabled:opacity-40 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
              </button>
              {/* Page pills */}
              {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                const mid = Math.min(Math.max(safePage, 3), totalPages - 2);
                const p = totalPages <= 5 ? i + 1 : mid - 2 + i;
                if (p < 1 || p > totalPages) return null;
                return (
                  <button key={p} onClick={() => setPage(p)}
                    className={`flex items-center justify-center w-7 h-7 rounded-lg text-xs font-semibold border transition-colors ${p === safePage ? 'bg-indigo-600 border-indigo-600 text-white' : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300'}`}
                  >
                    {p}
                  </button>
                );
              })}
              <button
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={safePage >= totalPages}
                className="flex items-center justify-center w-7 h-7 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 disabled:opacity-40 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
              >
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Enrollment Modal */}
      {showEnrollModal && enrollingStudent && (
        <EnrollmentModal
          student={enrollingStudent}
          onClose={() => setShowEnrollModal(false)}
          onEnroll={handleEnroll}
          loading={enrollLoading}
          form={enrollForm}
          setForm={(form) => { setEnrollForm(form); validateEnrollForm(form); }}
          error={enrollError}
          validation={enrollmentValidation}
          classes={classes}
          streams={streams}
          programs={programs}
          studyModes={studyModes}
          academicYears={academicYears}
          terms={terms}
          toggleProgram={toggleProgram}
        />
      )}

      {/* FLOATING BULK ACTION BAR */}
      <AnimatePresence>
        {selectedIds.size > 0 && (
          <motion.div
            initial={{ y: 80, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 80, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 400, damping: 32 }}
            className="fixed bottom-5 left-1/2 -translate-x-1/2 z-50 pointer-events-none"
          >
            <div className="pointer-events-auto flex items-center gap-2 px-4 py-2.5 bg-slate-900 dark:bg-slate-800 text-white rounded-2xl shadow-2xl border border-slate-700 ring-1 ring-white/10 backdrop-blur-xl">
              <span className="text-xs font-semibold text-slate-300 whitespace-nowrap tabular-nums">
                {selectedIds.size} selected
              </span>
              <div className="w-px h-4 bg-slate-700" />
              <button
                onClick={() => setShowReassignModal(true)}
                disabled={isReassigning}
                className="flex items-center gap-1.5 h-7 px-3 bg-indigo-600 hover:bg-indigo-500 rounded-lg text-xs font-semibold disabled:opacity-50 transition-colors"
              >
                {isReassigning ? <Loader className="w-3.5 h-3.5 animate-spin" /> : <Move className="w-3.5 h-3.5" />}
                Move class
              </button>
              <button
                onClick={() => setShowBulkEnrollModal(true)}
                disabled={isBulkEnrolling}
                className="flex items-center gap-1.5 h-7 px-3 bg-blue-600 hover:bg-blue-500 rounded-lg text-xs font-semibold disabled:opacity-50 transition-colors"
              >
                {isBulkEnrolling ? <Loader className="w-3.5 h-3.5 animate-spin" /> : <GraduationCap className="w-3.5 h-3.5" />}
                Enroll
              </button>
              {activeTab === 'enrolled' && (
                <button
                  onClick={() => {
                    // Detect which program the selected students are missing
                    const selectedEnrolled = filteredData.filter(s => selectedIds.has(s.id)) as any[];
                    const programNames = new Set<string>();
                    selectedEnrolled.forEach(s => {
                      const enrollments = s.allEnrollments ?? [s];
                      enrollments.forEach((e: any) => {
                        if (e.program_name) programNames.add(e.program_name.toLowerCase());
                      });
                    });
                    // If everyone only has theology → suggest secular; only secular → suggest theology
                    const hasTheology = programNames.has('theology');
                    const hasSecular  = programNames.has('secular');
                    let guessedId = 0;
                    if (hasTheology && !hasSecular) {
                      guessedId = programs.find(p => p.name.toLowerCase() === 'secular')?.id ?? 0;
                    } else if (hasSecular && !hasTheology) {
                      guessedId = programs.find(p => p.name.toLowerCase() === 'theology')?.id ?? 0;
                    }
                    setSuggestedProgramId(guessedId);
                    setShowAssignProgramModal(true);
                  }}
                  disabled={isAssigningProgram}
                  className="flex items-center gap-1.5 h-7 px-3 bg-violet-600 hover:bg-violet-500 rounded-lg text-xs font-semibold disabled:opacity-50 transition-colors"
                >
                  {isAssigningProgram ? <Loader className="w-3.5 h-3.5 animate-spin" /> : <GraduationCap className="w-3.5 h-3.5" />}
                  Assign Program
                </button>
              )}
              <button
                onClick={() => setShowPhotoUploadModal(true)}
                className="flex items-center gap-1.5 h-7 px-3 bg-emerald-600 hover:bg-emerald-500 rounded-lg text-xs font-semibold transition-colors"
              >
                <Camera className="w-3.5 h-3.5" /> Photos
              </button>
              <button
                onClick={() => setSelectedIds(new Set())}
                className="flex items-center justify-center w-7 h-7 rounded-lg hover:bg-slate-700 transition-colors"
                title="Clear selection"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* REASSIGN CLASS MODAL */}
      {showReassignModal && (
        <ReassignClassModal
          isOpen={showReassignModal}
          onClose={() => setShowReassignModal(false)}
          onSubmit={handleReassignClass}
          isLoading={isReassigning}
          selectedStudentCount={selectedIds.size}
        />
      )}

      {/* ASSIGN PROGRAM MODAL */}
      {showAssignProgramModal && (
        <BulkAssignProgramModal
          open={showAssignProgramModal}
          onClose={() => setShowAssignProgramModal(false)}
          selectedCount={selectedIds.size}
          programs={programs}
          classes={classes}
          streams={streams}
          academicYears={academicYears}
          terms={terms}
          studyModes={studyModes}
          defaultProgramId={suggestedProgramId}
          isLoading={isAssigningProgram}
          onSubmit={async (formData) => {
            setIsAssigningProgram(true);
            try {
              const data = await apiFetch('/api/enrollments/bulk-assign', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  student_ids: Array.from(selectedIds),
                  program_id: formData.programId,
                  class_id: formData.classId,
                  term_id: formData.termId,
                  academic_year_id: formData.academicYearId,
                  study_mode_id: formData.studyModeId || undefined,
                  stream_id: formData.streamId || undefined,
                }),
                successMessage: 'Program assigned successfully',
              });
              showToast('success', data?.message || `Assigned program to ${selectedIds.size} students`);
              setShowAssignProgramModal(false);
              setSelectedIds(new Set());
              fetchStudents();
            } catch {
              // Error toast handled by apiFetch
            } finally {
              setIsAssigningProgram(false);
            }
          }}
        />
      )}

      {/* BULK ENROLL MODAL */}
      {showBulkEnrollModal && (
        <BulkEnrollModal
          open={showBulkEnrollModal}
          onClose={() => setShowBulkEnrollModal(false)}
          selectedCount={selectedIds.size}
          classes={classes}
          streams={streams}
          programs={programs}
          studyModes={studyModes}
          academicYears={academicYears}
          terms={terms}
          isLoading={isBulkEnrolling}
          onSubmit={async (formData) => {
            setIsBulkEnrolling(true);
            try {
              const data = await apiFetch('/api/students/bulk/enroll', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  student_ids: Array.from(selectedIds),
                  class_id: formData.classId || undefined,
                  stream_id: formData.streamId || undefined,
                  academic_year_id: formData.academicYearId || undefined,
                  term_id: formData.termId || undefined,
                  study_mode_id: formData.studyModeId || undefined,
                  program_ids: formData.programIds?.length ? formData.programIds : undefined,
                }),
                successMessage: `Bulk enrollment complete`,
              });
              showToast('success', data.message || `Enrolled ${data.enrolled} students`);
              setShowBulkEnrollModal(false);
              setSelectedIds(new Set());
              fetchStudents();
            } catch (err: any) {
              // Error toast handled by apiFetch
            } finally {
              setIsBulkEnrolling(false);
            }
          }}
        />
      )}

      {/* BULK PHOTO UPLOAD MODAL */}
      <BulkPhotoUploadModal
        open={showPhotoUploadModal}
        onClose={() => setShowPhotoUploadModal(false)}
        students={(activeTab === 'enrolled' ? enrolledStudents : admittedStudents)
          .filter(s => selectedIds.has(s.id))
          .map(s => ({
            id: s.id,
            person_id: s.person_id,
            first_name: s.first_name,
            last_name: s.last_name,
            admission_no: s.admission_no,
            photo_url: s.photo_url,
          }))}
        onUploadComplete={() => {
          setShowPhotoUploadModal(false);
          showToast('success', 'Photos uploaded successfully');
          fetchStudents();
        }}
      />

      {/* FOLDER PHOTO UPLOAD MODAL */}
      <FolderPhotoUploadModal
        open={showFolderUploadModal}
        onClose={() => setShowFolderUploadModal(false)}
        students={(activeTab === 'enrolled' ? enrolledStudents : admittedStudents).map(s => ({
          id: s.id,
          person_id: s.person_id,
          first_name: s.first_name,
          last_name: s.last_name,
          admission_no: s.admission_no,
          photo_url: s.photo_url,
          class_name: (s as { class_name?: string }).class_name,
        }))}
        onUploadComplete={(updated) => {
          setEnrolledStudents(prev =>
            prev.map(s => updated[s.id] ? { ...s, photo_url: updated[s.id] } : s)
          );
          setAdmittedStudents(prev =>
            prev.map(s => updated[s.id] ? { ...s, photo_url: updated[s.id] } : s)
          );
          setShowFolderUploadModal(false);
          showToast('success', `Photos uploaded for ${Object.keys(updated).length} learner${Object.keys(updated).length !== 1 ? 's' : ''}`);
          fetchStudents();
        }}
      />

      {/* BULK IMPORT MODAL */}
      <ImportModal
        open={showImportModal}
        onClose={() => setShowImportModal(false)}
        onImportSuccess={() => {
          fetchStudents();
        }}
      />

      {/* LIVE IDENTITY POPUP — real-time biometric scan notifications */}
      <LiveIdentityPopup />

      {/* DEVICE SELECTOR MODAL — Quick-Capture fingerprint enrollment */}
      <DeviceSelector
        isOpen={showDeviceSelector}
        onClose={() => { setShowDeviceSelector(false); setCaptureStudentId(null); }}
        onDeviceSelected={handleDeviceSelected}
      />

      {/* SYNC FROM DEVICE MODAL */}
      <SyncDeviceModal
        open={showSyncModal}
        onClose={() => setShowSyncModal(false)}
        defaultDeviceIp={localDeviceIp}
        defaultDeviceSn={relayDeviceSn}
      />
    </div>
  );
}

// ─── STATUS BADGE ──────────────────────────────────────────────────────────
function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { dot: string; label: string; bg: string; text: string }> = {
    active:      { dot: 'bg-emerald-500', label: 'Active',     bg: 'bg-emerald-50  dark:bg-emerald-900/20', text: 'text-emerald-700 dark:text-emerald-400' },
    admitted:    { dot: 'bg-sky-500',     label: 'Admitted',   bg: 'bg-sky-50      dark:bg-sky-900/20',     text: 'text-sky-700    dark:text-sky-400' },
    suspended:   { dot: 'bg-amber-500',   label: 'Suspended',  bg: 'bg-amber-50    dark:bg-amber-900/20',   text: 'text-amber-700  dark:text-amber-400' },
    inactive:    { dot: 'bg-slate-400',   label: 'Inactive',   bg: 'bg-slate-100   dark:bg-slate-800',      text: 'text-slate-500  dark:text-slate-400' },
    dropped_out: { dot: 'bg-red-500',     label: 'Dropped',    bg: 'bg-red-50      dark:bg-red-900/20',     text: 'text-red-600    dark:text-red-400' },
    expelled:    { dot: 'bg-red-700',     label: 'Expelled',   bg: 'bg-red-50      dark:bg-red-900/20',     text: 'text-red-700    dark:text-red-400' },
    on_leave:    { dot: 'bg-violet-500',  label: 'On Leave',   bg: 'bg-violet-50   dark:bg-violet-900/20',  text: 'text-violet-700 dark:text-violet-400' },
  };
  const cfg = map[status] ?? map['inactive'];
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold whitespace-nowrap ${cfg.bg} ${cfg.text}`}>
      <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${cfg.dot}`} />
      {cfg.label}
    </span>
  );
}

// ─── ENROLLMENT MODAL ──────────────────────────────────────
interface EnrollmentModalProps {
  student: Student;
  onClose: () => void;
  onEnroll: () => Promise<void>;
  loading: boolean;
  form: EnrollmentFormData;
  setForm: (form: EnrollmentFormData) => void;
  error: string;
  validation: Record<string, boolean>;
  classes: SelectOption[];
  streams: SelectOption[];
  programs: SelectOption[];
  studyModes: SelectOption[];
  academicYears: SelectOption[];
  terms: SelectOption[];
  toggleProgram: (id: number) => void;
}

function EnrollmentModal({
  student,
  onClose,
  onEnroll,
  loading,
  form,
  setForm,
  error,
  validation,
  classes,
  streams,
  programs,
  studyModes,
  academicYears,
  terms,
  toggleProgram,
}: EnrollmentModalProps) {
  const modalLogger = scopedLogger('EnrollmentModal');
  
  // Defensive array checks
  const safeClasses = Array.isArray(classes) ? classes : [];
  const safeStreams = Array.isArray(streams) ? streams : [];
  const safePrograms = Array.isArray(programs) ? programs : [];
  const safeStudyModes = Array.isArray(studyModes) ? studyModes : [];
  const safeAcademicYears = Array.isArray(academicYears) ? academicYears : [];
  const safeTerms = Array.isArray(terms) ? terms : [];

  // Determine if all required fields are valid
  const allFieldsValid = Object.values(validation).every(v => v);

  // Filtered terms based on selected academic year
  const filteredTerms = safeTerms.filter(t => {
    // If no academic year selected, show all
    if (form.academic_year_id === 0) return true;
    // Otherwise, you might want to filter by academic_year_id if available
    return true;
  });

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col shadow-2xl">
        {/* Sticky Header */}
        <div className="sticky top-0 z-20 bg-gradient-to-r from-white/95 to-white/90 dark:from-slate-900/95 dark:to-slate-900/90 backdrop-blur-xl border-b border-slate-200 dark:border-slate-700 px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-bold text-slate-900 dark:text-white">Enroll Student</h2>
              <p className="text-sm text-slate-600 dark:text-slate-400 mt-0.5">
                {student.first_name} {student.last_name} · Admission # {student.admission_no}
              </p>
            </div>
            <button
              onClick={onClose}
              disabled={loading}
              className="p-2 hover:bg-slate-200/50 dark:hover:bg-white/10 rounded-lg transition-colors disabled:opacity-50"
              aria-label="Close modal"
            >
              <X size={24} className="text-slate-600 dark:text-slate-400" />
            </button>
          </div>

          {/* Error Message */}
          {error && (
            <div className="mt-3 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg flex items-start gap-3">
              <AlertCircle size={18} className="text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
            </div>
          )}
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto px-6 py-6">
          <div className="space-y-6">
            {/* Row 1: Class, Stream, Academic Year */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Class Selection */}
              <div className={`space-y-2 p-4 rounded-lg border-2 transition-all ${
                validation.class_id
                  ? 'border-emerald-300 dark:border-emerald-600 bg-emerald-50/30 dark:bg-emerald-900/10'
                  : 'border-slate-200 dark:border-slate-700 bg-slate-50/30 dark:bg-slate-800/20'
              }`}>
                <label className="block text-xs font-bold uppercase tracking-widest text-slate-600 dark:text-slate-400">
                  Class <span className="text-red-600">*</span>
                </label>
                <select
                  value={form.class_id}
                  onChange={(e) => setForm({ ...form, class_id: parseInt(e.target.value) })}
                  className="w-full px-3 py-2 rounded-md bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 text-sm font-medium focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 dark:focus:border-indigo-400 dark:focus:ring-indigo-400 transition-all"
                  disabled={safeClasses.length === 0}
                >
                  <option value={0}>
                    {safeClasses.length === 0 ? '⚠️ No classes' : 'Select class'}
                  </option>
                  {(() => {
                    const grouped = safeClasses.reduce((acc: Record<string, SelectOption[]>, c) => {
                      const key = c.program_name || 'General';
                      (acc[key] = acc[key] || []).push(c);
                      return acc;
                    }, {});
                    const entries = Object.entries(grouped);
                    if (entries.length <= 1 && entries[0]?.[0] === 'General') {
                      return safeClasses.map(c => <option key={c.id} value={c.id}>{safeString(c.name)}</option>);
                    }
                    return entries.map(([prog, list]) => (
                      <optgroup key={prog} label={prog}>
                        {list.map(c => <option key={c.id} value={c.id}>{safeString(c.name)}</option>)}
                      </optgroup>
                    ));
                  })()}
                </select>
                {safeClasses.length === 0 && (
                  <p className="text-xs text-amber-600 dark:text-amber-400">Contact administrator to add classes.</p>
                )}
              </div>

              {/* Stream Selection */}
              <div className="space-y-2 p-4 rounded-lg border-2 border-slate-200 dark:border-slate-700 bg-slate-50/30 dark:bg-slate-800/20">
                <label className="block text-xs font-bold uppercase tracking-widest text-slate-600 dark:text-slate-400">Stream (Optional)</label>
                <select
                  value={form.stream_id || 0}
                  onChange={(e) => setForm({ ...form, stream_id: e.target.value ? parseInt(e.target.value) : undefined })}
                  className="w-full px-3 py-2 rounded-md bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 text-sm font-medium focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 dark:focus:border-indigo-400 dark:focus:ring-indigo-400 transition-all"
                >
                  <option value={0}>No Stream</option>
                  {safeStreams.map(s => (
                    <option key={s.id} value={s.id}>{safeString(s.name)}</option>
                  ))}
                </select>
              </div>

              {/* Academic Year Selection */}
              <div className={`space-y-2 p-4 rounded-lg border-2 transition-all ${
                validation.academic_year_id
                  ? 'border-emerald-300 dark:border-emerald-600 bg-emerald-50/30 dark:bg-emerald-900/10'
                  : 'border-slate-200 dark:border-slate-700 bg-slate-50/30 dark:bg-slate-800/20'
              }`}>
                <label className="block text-xs font-bold uppercase tracking-widest text-slate-600 dark:text-slate-400">
                  Academic Year <span className="text-red-600">*</span>
                </label>
                <select
                  value={form.academic_year_id}
                  onChange={(e) => setForm({ ...form, academic_year_id: parseInt(e.target.value) })}
                  className="w-full px-3 py-2 rounded-md bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 text-sm font-medium focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 dark:focus:border-indigo-400 dark:focus:ring-indigo-400 transition-all"
                  disabled={safeAcademicYears.length === 0}
                >
                  <option value={0}>
                    {safeAcademicYears.length === 0 ? '⚠️ No years' : 'Select year'}
                  </option>
                  {safeAcademicYears.map(y => (
                    <option key={y.id} value={y.id}>{safeString(y.name)}</option>
                  ))}
                </select>
                {safeAcademicYears.length === 0 && (
                  <p className="text-xs text-amber-600 dark:text-amber-400">No academic years configured.</p>
                )}
              </div>
            </div>

            {/* Row 2: Study Mode, Term, Programs */}
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Study Mode Selection */}
                <div className={`space-y-2 p-4 rounded-lg border-2 transition-all ${
                  validation.study_mode_id
                    ? 'border-emerald-300 dark:border-emerald-600 bg-emerald-50/30 dark:bg-emerald-900/10'
                    : 'border-slate-200 dark:border-slate-700 bg-slate-50/30 dark:bg-slate-800/20'
                }`}>
                  <label className="block text-xs font-bold uppercase tracking-widest text-slate-600 dark:text-slate-400">
                    Study Mode <span className="text-red-600">*</span>
                  </label>
                  {safeStudyModes.length > 0 ? (
                    <div className="flex flex-wrap gap-2">
                      {safeStudyModes.map(m => (
                        <button
                          key={m.id}
                          onClick={() => setForm({ ...form, study_mode_id: m.id })}
                          className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
                            form.study_mode_id === m.id
                              ? 'bg-indigo-600 text-white ring-2 ring-indigo-400 dark:ring-indigo-500'
                              : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-600 hover:border-indigo-300 dark:hover:border-indigo-600'
                          }`}
                        >
                          {safeString(m.name)}
                        </button>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-amber-600 dark:text-amber-400">No study modes available.</p>
                  )}
                </div>

                {/* Term Selection */}
                <div className={`space-y-2 p-4 rounded-lg border-2 transition-all ${
                  validation.term_id
                    ? 'border-emerald-300 dark:border-emerald-600 bg-emerald-50/30 dark:bg-emerald-900/10'
                    : 'border-slate-200 dark:border-slate-700 bg-slate-50/30 dark:bg-slate-800/20'
                }`}>
                  <label className="block text-xs font-bold uppercase tracking-widest text-slate-600 dark:text-slate-400">
                    Term <span className="text-red-600">*</span>
                  </label>
                  <select
                    value={form.term_id}
                    onChange={(e) => setForm({ ...form, term_id: parseInt(e.target.value) })}
                    className="w-full px-3 py-2 rounded-md bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 text-sm font-medium focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 dark:focus:border-indigo-400 dark:focus:ring-indigo-400 transition-all"
                    disabled={filteredTerms.length === 0}
                  >
                    <option value={0}>
                      {filteredTerms.length === 0 ? '⚠️ No terms' : 'Select term'}
                    </option>
                    {filteredTerms.map(t => (
                      <option key={t.id} value={t.id}>{safeString(t.name)}</option>
                    ))}
                  </select>
                  {filteredTerms.length === 0 && (
                    <p className="text-xs text-amber-600 dark:text-amber-400">No terms available for selected year.</p>
                  )}
                </div>
              </div>

              {/* Programs Selection (Full Width) */}
              <div className={`space-y-3 p-4 rounded-lg border-2 transition-all ${
                validation.program_ids
                  ? 'border-emerald-300 dark:border-emerald-600 bg-emerald-50/30 dark:bg-emerald-900/10'
                  : 'border-slate-200 dark:border-slate-700 bg-slate-50/30 dark:bg-slate-800/20'
              }`}>
                <label className="block text-xs font-bold uppercase tracking-widest text-slate-600 dark:text-slate-400">
                  Programs <span className="text-red-600">*</span> — Select at least one
                </label>
                {safePrograms.length > 0 ? (
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-2 max-h-48 overflow-y-auto">
                    {safePrograms.map((p, idx) => (
                      <label key={p.id} className={`flex items-center gap-3 p-2 rounded-md cursor-pointer transition-all ${
                        form.program_ids.includes(p.id)
                          ? 'bg-indigo-100 dark:bg-indigo-900/30 border border-indigo-300 dark:border-indigo-600'
                          : `border border-slate-200 dark:border-slate-600 hover:border-indigo-300 dark:hover:border-indigo-600 ${idx % 2 === 0 ? 'bg-white dark:bg-slate-800/50' : 'bg-slate-50/50 dark:bg-slate-800/30'}`
                      }`}>
                        <input
                          type="checkbox"
                          checked={form.program_ids.includes(p.id)}
                          onChange={() => toggleProgram(p.id)}
                          className="w-4 h-4 rounded text-indigo-600 dark:text-indigo-500 cursor-pointer"
                        />
                        <span className="text-sm font-medium text-slate-900 dark:text-white">{safeString(p.name)}</span>
                      </label>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-amber-600 dark:text-amber-400">No programs available. Contact administrator.</p>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Sticky Footer */}
        <div className="sticky bottom-0 bg-gradient-to-r from-white/95 to-white/90 dark:from-slate-900/95 dark:to-slate-900/90 backdrop-blur-xl border-t border-slate-200 dark:border-slate-700 px-6 py-4 flex gap-3 justify-end">
          <button
            onClick={onClose}
            disabled={loading}
            className="px-6 py-2.5 rounded-lg text-sm font-semibold border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/5 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Cancel
          </button>
          <button
            onClick={onEnroll}
            disabled={loading || !allFieldsValid}
            className="flex items-center gap-2 px-6 py-2.5 rounded-lg text-sm font-semibold bg-gradient-to-r from-indigo-600 via-fuchsia-600 to-pink-600 text-white hover:shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:shadow-none"
          >
            {loading && <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>}
            {loading ? 'Enrolling...' : 'Enroll Student'}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Bulk Enroll Modal ─────────────────────────────────────────────────── */

function BulkEnrollModal({
  open, onClose, selectedCount, classes, streams, programs, studyModes, academicYears, terms, isLoading, onSubmit,
}: {
  open: boolean;
  onClose: () => void;
  selectedCount: number;
  classes: SelectOption[];
  streams: SelectOption[];
  programs: SelectOption[];
  studyModes: SelectOption[];
  academicYears: SelectOption[];
  terms: SelectOption[];
  isLoading: boolean;
  onSubmit: (data: { classId: number | null; streamId: number | null; academicYearId: number | null; termId: number | null; studyModeId: number | null; programIds: number[] }) => void;
}) {
  const [classId, setClassId] = useState<number | null>(null);
  const [streamId, setStreamId] = useState<number | null>(null);
  const [academicYearId, setAcademicYearId] = useState<number | null>(null);
  const [termId, setTermId] = useState<number | null>(null);
  const [studyModeId, setStudyModeId] = useState<number | null>(null);
  const [selectedProgramIds, setSelectedProgramIds] = useState<number[]>([]);

  const toggleProgram = (id: number) => {
    setSelectedProgramIds(prev => prev.includes(id) ? prev.filter(p => p !== id) : [...prev, id]);
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6 space-y-5" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-slate-800 dark:text-white flex items-center gap-2">
            <GraduationCap className="w-5 h-5 text-blue-500" />
            Enroll {selectedCount} Student{selectedCount !== 1 ? 's' : ''}
          </h2>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
            <X className="w-4 h-4 text-slate-400" />
          </button>
        </div>

        <p className="text-sm text-slate-500 dark:text-slate-400">
          Enroll selected students. Fields left empty will use each student&apos;s current values.
        </p>

        <div className="space-y-4">
          {/* Row 1: Class + Stream */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Class (optional)</label>
              <select
                value={classId ?? ''}
                onChange={e => setClassId(e.target.value ? Number(e.target.value) : null)}
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 focus:outline-none focus:border-blue-400"
              >
                <option value="">Keep current class</option>
                {(() => {
                  const grouped = (Array.isArray(classes) ? classes : []).reduce((acc: Record<string, SelectOption[]>, c) => {
                    const key = c.program_name || 'General';
                    (acc[key] = acc[key] || []).push(c);
                    return acc;
                  }, {});
                  const entries = Object.entries(grouped);
                  if (entries.length <= 1 && entries[0]?.[0] === 'General') {
                    return (Array.isArray(classes) ? classes : []).map(c => <option key={c.id} value={c.id}>{c.name}</option>);
                  }
                  return entries.map(([prog, list]) => (
                    <optgroup key={prog} label={prog}>{list.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</optgroup>
                  ));
                })()}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Stream (optional)</label>
              <select
                value={streamId ?? ''}
                onChange={e => setStreamId(e.target.value ? Number(e.target.value) : null)}
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 focus:outline-none focus:border-blue-400"
              >
                <option value="">Keep current stream</option>
                {streams.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
          </div>

          {/* Row 2: Academic Year + Term */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Academic Year (optional)</label>
              <select
                value={academicYearId ?? ''}
                onChange={e => setAcademicYearId(e.target.value ? Number(e.target.value) : null)}
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 focus:outline-none focus:border-blue-400"
              >
                <option value="">Use active year</option>
                {academicYears.map(y => <option key={y.id} value={y.id}>{y.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Term (optional)</label>
              <select
                value={termId ?? ''}
                onChange={e => setTermId(e.target.value ? Number(e.target.value) : null)}
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 focus:outline-none focus:border-blue-400"
              >
                <option value="">Use active term</option>
                {terms.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>
          </div>

          {/* Row 3: Study Mode */}
          {studyModes.length > 0 && (
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Study Mode (optional)</label>
              <div className="flex flex-wrap gap-2">
                {studyModes.map(m => (
                  <button
                    key={m.id}
                    onClick={() => setStudyModeId(studyModeId === m.id ? null : m.id)}
                    className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
                      studyModeId === m.id
                        ? 'bg-indigo-600 text-white ring-2 ring-indigo-400'
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-600 hover:border-indigo-300'
                    }`}
                  >
                    {m.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Row 4: Programs */}
          {programs.length > 0 && (
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Programs (optional)</label>
              <div className="grid grid-cols-2 gap-1.5 max-h-36 overflow-y-auto">
                {programs.map(p => (
                  <label key={p.id} className={`flex items-center gap-2 p-2 rounded-md cursor-pointer transition-all text-sm ${
                    selectedProgramIds.includes(p.id)
                      ? 'bg-indigo-100 dark:bg-indigo-900/30 border border-indigo-300 dark:border-indigo-600'
                      : 'border border-slate-200 dark:border-slate-600 hover:border-indigo-300'
                  }`}>
                    <input
                      type="checkbox"
                      checked={selectedProgramIds.includes(p.id)}
                      onChange={() => toggleProgram(p.id)}
                      className="w-3.5 h-3.5 rounded text-indigo-600"
                    />
                    <span className="text-slate-700 dark:text-slate-300">{p.name}</span>
                  </label>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="flex gap-3 justify-end pt-2">
          <button
            onClick={onClose}
            disabled={isLoading}
            className="px-4 py-2 text-sm font-semibold rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={() => onSubmit({ classId, streamId, academicYearId, termId, studyModeId, programIds: selectedProgramIds })}
            disabled={isLoading}
            className="flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-lg bg-blue-600 hover:bg-blue-500 text-white disabled:opacity-50 transition-colors"
          >
            {isLoading ? <Loader className="w-4 h-4 animate-spin" /> : <GraduationCap className="w-4 h-4" />}
            Enroll {selectedCount}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── BULK ASSIGN PROGRAM MODAL ──────────────────────────────────────────────
// Assigns a NEW program enrollment to already-enrolled students without
// touching their existing enrollments (multi-program stacking).

function BulkAssignProgramModal({
  open, onClose, selectedCount, programs, classes, streams, studyModes, academicYears, terms, defaultProgramId, isLoading, onSubmit,
}: {
  open: boolean;
  onClose: () => void;
  selectedCount: number;
  programs: SelectOption[];
  classes: SelectOption[];
  streams: SelectOption[];
  studyModes: SelectOption[];
  academicYears: SelectOption[];
  terms: SelectOption[];
  defaultProgramId?: number;
  isLoading: boolean;
  onSubmit: (data: {
    programId: number;
    classId: number;
    termId: number;
    academicYearId: number;
    studyModeId: number | null;
    streamId: number | null;
  }) => void;
}) {
  const [programId, setProgramId] = useState<number>(defaultProgramId ?? 0);
  const [classId, setClassId] = useState<number>(0);
  const [streamId, setStreamId] = useState<number | null>(null);
  const [academicYearId, setAcademicYearId] = useState<number>(0);
  const [termId, setTermId] = useState<number>(0);
  const [studyModeId, setStudyModeId] = useState<number | null>(null);

  // Auto-select the suggested program when modal opens
  useEffect(() => { if (defaultProgramId) setProgramId(defaultProgramId); }, [defaultProgramId]);

  const canSubmit = programId > 0 && classId > 0 && termId > 0 && academicYearId > 0;

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div
        className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-lg p-6 space-y-5"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-slate-800 dark:text-white flex items-center gap-2">
              <GraduationCap className="w-5 h-5 text-violet-500" />
              Assign Program — {selectedCount} Student{selectedCount !== 1 ? 's' : ''}
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Adds a second program enrollment. Existing enrollments are preserved.
            </p>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800">
            <X className="w-4 h-4 text-slate-400" />
          </button>
        </div>

        {/* Info banner */}
        <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700">
          <AlertCircle className="w-4 h-4 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-amber-700 dark:text-amber-300">
            Each student will show multiple program tags (e.g. <strong>Secular: P5</strong> and <strong>Theology: P3</strong>) in the student list.
          </p>
        </div>

        <div className="space-y-4">
          {/* Program */}
          <div>
            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1.5 uppercase tracking-wide">
              Program <span className="text-red-500">*</span>
            </label>
            <select
              value={programId}
              onChange={e => setProgramId(Number(e.target.value))}
              className={`w-full px-3 py-2 text-sm rounded-lg border ${programId ? 'border-violet-400 ring-1 ring-violet-300' : 'border-slate-200 dark:border-slate-700'} bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 focus:outline-none`}
            >
              <option value={0}>Select program…</option>
              {programs.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>

          {/* Class */}
          <div>
            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1.5 uppercase tracking-wide">
              Class <span className="text-red-500">*</span>
            </label>
            <select
              value={classId}
              onChange={e => setClassId(Number(e.target.value))}
              className={`w-full px-3 py-2 text-sm rounded-lg border ${classId ? 'border-violet-400 ring-1 ring-violet-300' : 'border-slate-200 dark:border-slate-700'} bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 focus:outline-none`}
            >
              <option value={0}>Select class…</option>
              {(() => {
                const programClasses = programId
                  ? (Array.isArray(classes) ? classes : []).filter(c => c.program_id === programId)
                  : (Array.isArray(classes) ? classes : []);
                if (programId && programClasses.length === 0) {
                  return <option disabled value={-1}>⚠ No classes assigned to this program yet</option>;
                }
                return programClasses.map(c => <option key={c.id} value={c.id}>{c.name}</option>);
              })()}
            </select>
          </div>

          {/* Academic Year + Term */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1.5 uppercase tracking-wide">
                Academic Year <span className="text-red-500">*</span>
              </label>
              <select
                value={academicYearId}
                onChange={e => setAcademicYearId(Number(e.target.value))}
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 focus:outline-none"
              >
                <option value={0}>Select year…</option>
                {academicYears.map(y => <option key={y.id} value={y.id}>{y.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1.5 uppercase tracking-wide">
                Term <span className="text-red-500">*</span>
              </label>
              <select
                value={termId}
                onChange={e => setTermId(Number(e.target.value))}
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 focus:outline-none"
              >
                <option value={0}>Select term…</option>
                {terms.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>
          </div>

          {/* Stream + Study Mode (optional) */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Stream (optional)</label>
              <select
                value={streamId ?? ''}
                onChange={e => setStreamId(e.target.value ? Number(e.target.value) : null)}
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 focus:outline-none"
              >
                <option value="">No stream</option>
                {streams.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            {studyModes.length > 0 && (
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Study Mode (optional)</label>
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {studyModes.map(m => (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => setStudyModeId(studyModeId === m.id ? null : m.id)}
                      className={`px-2.5 py-1 rounded-md text-xs font-semibold transition-all ${
                        studyModeId === m.id
                          ? 'bg-violet-600 text-white'
                          : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700'
                      }`}
                    >
                      {m.name}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex gap-3 justify-end pt-2 border-t border-slate-100 dark:border-slate-800">
          <button
            type="button"
            onClick={onClose}
            disabled={isLoading}
            className="px-4 py-2 text-sm font-semibold rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => onSubmit({ programId, classId, termId, academicYearId, studyModeId, streamId })}
            disabled={isLoading || !canSubmit}
            className="flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-lg bg-violet-600 hover:bg-violet-500 text-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isLoading ? <Loader className="w-4 h-4 animate-spin" /> : <GraduationCap className="w-4 h-4" />}
            Assign to {selectedCount}
          </button>
        </div>
      </div>
    </div>
  );
}
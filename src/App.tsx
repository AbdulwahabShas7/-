import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  UserPlus,
  KeyRound,
  Copy,
  Check,
  Download,
  Search,
  FileText,
  Trash2,
  ShieldAlert,
  CheckCircle2,
  XCircle,
  Clock,
  Link2,
  Lock,
  LogOut,
  Users,
  ExternalLink,
  PauseCircle,
  PlayCircle,
  StopCircle,
  Layers,
} from 'lucide-react';
import {
  AssessmentCategory,
  CandidateSession,
  getEffectiveSections,
  JobProfile,
  KIB_BRAND,
  PermissionKey,
  QuestionItem,
  ROLE_PRESET_PERMISSIONS,
  SectionProgressStatus,
  SecurityEvent,
  SystemUser,
  USER_ROLE_LABELS,
} from './types/assessment';
import {
  INITIAL_JOB_PROFILES,
  INITIAL_QUESTIONS,
  INITIAL_SESSIONS,
  INITIAL_SYSTEM_USERS,
} from './data/initialData';
import {
  buildSessionQuestions,
  evaluateCandidateSession,
  generateUniqueOtp,
} from './utils/assessmentEngine';
import { exportResultsToCsv } from './utils/csvHelper';
import { CandidateKiosk } from './components/CandidateKiosk';
import { CandidateReportModal } from './components/CandidateReportModal';
import { QuestionBankManager } from './components/QuestionBankManager';
import { JobProfilesSettings } from './components/JobProfilesSettings';
import { UserAccessManager } from './components/UserAccessManager';
import { AnalyticsCharts } from './components/AnalyticsCharts';
import { GoogleSheetsSyncBar } from './components/GoogleSheetsSyncBar';
import {
  CLIENT_INSTANCE_ID,
  fetchServerState,
  fetchServerVersion,
  pushStateToServer,
  ServerStateSnapshot,
  SheetsConfigState,
} from './utils/realtimeSync';

const STORAGE_KEYS = {
  QUESTIONS: 'kib_hr_questions_v2',
  JOBS: 'kib_hr_jobs_v2',
  SESSIONS: 'kib_hr_sessions_v2',
  USERS: 'kib_hr_users_v2',
};

type ActiveTab = 'SESSIONS' | 'ANALYTICS' | 'QUESTION_BANK' | 'JOB_SETTINGS' | 'USERS';

function detectPortalRoute(): {
  portal: 'CANDIDATE' | 'ADMIN';
  otpParam?: string;
  nameParam?: string;
  nidParam?: string;
} {
  const params = new URLSearchParams(window.location.search);
  const portalQuery = (params.get('portal') || '').toLowerCase();
  const otpParam = params.get('otp') || undefined;
  const nameParam = params.get('name') || undefined;
  const nidParam = params.get('nid') || undefined;
  const hash = window.location.hash.toLowerCase();
  const pathname = window.location.pathname.toLowerCase();

  if (
    portalQuery === 'exam' ||
    portalQuery === 'candidate' ||
    hash.includes('exam') ||
    hash.includes('candidate') ||
    pathname.endsWith('/exam')
  ) {
    return { portal: 'CANDIDATE', otpParam, nameParam, nidParam };
  }

  return { portal: 'ADMIN', otpParam, nameParam, nidParam };
}

export default function App() {
  // Persistent State Initialization
  const [questions, setQuestions] = useState<QuestionItem[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.QUESTIONS);
      return saved ? JSON.parse(saved) : INITIAL_QUESTIONS;
    } catch {
      return INITIAL_QUESTIONS;
    }
  });

  const [jobProfiles, setJobProfiles] = useState<JobProfile[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.JOBS);
      return saved ? JSON.parse(saved) : INITIAL_JOB_PROFILES;
    } catch {
      return INITIAL_JOB_PROFILES;
    }
  });

  const [sessions, setSessions] = useState<CandidateSession[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.SESSIONS);
      return saved ? JSON.parse(saved) : INITIAL_SESSIONS;
    } catch {
      return INITIAL_SESSIONS;
    }
  });

  const [users, setUsers] = useState<SystemUser[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.USERS);
      if (saved) {
        const parsed: SystemUser[] = JSON.parse(saved);
        return parsed.map((u) => ({
          ...u,
          permissions: u.permissions || {
            ...(ROLE_PRESET_PERMISSIONS[u.role] || ROLE_PRESET_PERMISSIONS.HR_SPECIALIST),
          },
        }));
      }
      return INITIAL_SYSTEM_USERS;
    } catch {
      return INITIAL_SYSTEM_USERS;
    }
  });

  // Unified Standard Assessment Config & Dynamic Sections
  const standardConfig = jobProfiles[0] || INITIAL_JOB_PROFILES[0];
  const effectiveSections = getEffectiveSections(standardConfig);

  // Portal Route Detection
  const [routeState, setRouteState] = useState(detectPortalRoute);

  useEffect(() => {
    const handleRouteChange = () => {
      setRouteState(detectPortalRoute());
    };
    window.addEventListener('popstate', handleRouteChange);
    window.addEventListener('hashchange', handleRouteChange);
    return () => {
      window.removeEventListener('popstate', handleRouteChange);
      window.removeEventListener('hashchange', handleRouteChange);
    };
  }, []);

  // Real-time Server & Google Sheets Sync State
  const [sheetsConfig, setSheetsConfig] = useState<SheetsConfigState>({
    webAppUrl: '',
    spreadsheetId: '',
    spreadsheetUrl: '',
    spreadsheetTitle: 'قاعدة بيانات منصة اختبارات الموارد البشرية - بنك الكريمي الإسلامي',
    lastSyncedAt: '',
    autoSync: true,
    syncStatus: 'idle',
    lastError: '',
  });
  const [connectedClientsCount, setConnectedClientsCount] = useState<number>(1);
  const [isRealtimeConnected, setIsRealtimeConnected] = useState<boolean>(false);

  const isApplyingRemoteRef = useRef<boolean>(false);
  const hasHydratedFromServerRef = useRef<boolean>(false);
  const serverVersionRef = useRef<number>(0);

  const applyServerSnapshot = useCallback((snapshot: ServerStateSnapshot) => {
    isApplyingRemoteRef.current = true;
    serverVersionRef.current = snapshot.version || 1;

    if (Array.isArray(snapshot.questions) && snapshot.questions.length > 0) {
      setQuestions(snapshot.questions);
    }
    if (Array.isArray(snapshot.jobProfiles) && snapshot.jobProfiles.length > 0) {
      setJobProfiles(snapshot.jobProfiles);
    }
    if (Array.isArray(snapshot.sessions)) {
      setSessions(snapshot.sessions);
    }
    if (Array.isArray(snapshot.users) && snapshot.users.length > 0) {
      setUsers(snapshot.users);
    }
    if (snapshot.sheetsConfig) {
      setSheetsConfig(snapshot.sheetsConfig);
    }
    if (typeof snapshot.connectedClientsCount === 'number') {
      setConnectedClientsCount(Math.max(1, snapshot.connectedClientsCount));
    }

    setTimeout(() => {
      isApplyingRemoteRef.current = false;
    }, 60);
  }, []);

  // Initial Hydration + Real-Time SSE Subscription + Fast Version Polling Fallback
  useEffect(() => {
    let isMounted = true;
    let eventSource: EventSource | null = null;

    const initRealtimeSync = async () => {
      const snapshot = await fetchServerState();
      if (!isMounted) return;

      if (snapshot) {
        if (!snapshot.initialized) {
          // Seed server with initial state
          const seedRes = await pushStateToServer({
            isInitialSeed: true,
            questions,
            jobProfiles,
            sessions,
            users,
          });
          if (seedRes?.alreadyInitialized && seedRes.state) {
            applyServerSnapshot(seedRes.state);
          } else if (seedRes?.version) {
            serverVersionRef.current = seedRes.version;
          }
        } else {
          applyServerSnapshot(snapshot);
        }
        hasHydratedFromServerRef.current = true;
        setIsRealtimeConnected(true);
      }

      // Connect SSE stream for instant multi-device updates across published links
      try {
        eventSource = new EventSource('/api/events');
        eventSource.onopen = () => {
          if (isMounted) setIsRealtimeConnected(true);
        };
        eventSource.onmessage = async (event) => {
          if (!isMounted) return;
          try {
            const payload = JSON.parse(event.data);
            if (typeof payload.connectedClientsCount === 'number') {
              setConnectedClientsCount(Math.max(1, payload.connectedClientsCount));
            }
            if (payload.sheetsConfig) {
              setSheetsConfig(payload.sheetsConfig);
            }
            if (
              payload.type === 'state_updated' &&
              payload.lastUpdatedByClientId !== CLIENT_INSTANCE_ID &&
              payload.version > serverVersionRef.current
            ) {
              const latest = await fetchServerState();
              if (latest && isMounted) {
                applyServerSnapshot(latest);
              }
            }
          } catch {
            // Ignore malformed message
          }
        };
        eventSource.onerror = () => {
          if (isMounted) setIsRealtimeConnected(false);
        };
      } catch {
        // Fallback polling handles environments where EventSource is blocked
      }
    };

    initRealtimeSync();

    // Lightweight 2.5s version poll fallback so published links stay 100% in sync even behind strict proxies
    const pollInterval = setInterval(async () => {
      if (!hasHydratedFromServerRef.current) return;
      const verInfo = await fetchServerVersion();
      if (!verInfo || !isMounted) return;
      setIsRealtimeConnected(true);
      setConnectedClientsCount(Math.max(1, verInfo.connectedClientsCount || 1));
      if (verInfo.sheetsConfig) {
        setSheetsConfig(verInfo.sheetsConfig);
      }
      if (
        verInfo.initialized &&
        verInfo.version > serverVersionRef.current &&
        verInfo.lastUpdatedByClientId !== CLIENT_INSTANCE_ID
      ) {
        const latest = await fetchServerState();
        if (latest && isMounted) {
          applyServerSnapshot(latest);
        }
      }
    }, 2500);

    return () => {
      isMounted = false;
      if (eventSource) {
        eventSource.close();
      }
      clearInterval(pollInterval);
    };
  }, [applyServerSnapshot]);

  // Sync changes across tabs/windows on the same machine via storage event
  useEffect(() => {
    const handleStorageSync = (e: StorageEvent) => {
      try {
        if (e.key === STORAGE_KEYS.SESSIONS && e.newValue) {
          setSessions(JSON.parse(e.newValue));
        } else if (e.key === STORAGE_KEYS.QUESTIONS && e.newValue) {
          setQuestions(JSON.parse(e.newValue));
        } else if (e.key === STORAGE_KEYS.JOBS && e.newValue) {
          setJobProfiles(JSON.parse(e.newValue));
        } else if (e.key === STORAGE_KEYS.USERS && e.newValue) {
          setUsers(JSON.parse(e.newValue));
        }
      } catch {
        // Ignore parse error
      }
    };
    window.addEventListener('storage', handleStorageSync);
    return () => window.removeEventListener('storage', handleStorageSync);
  }, []);

  // Current Logged-in Admin / Executive User
  const [currentUser, setCurrentUser] = useState<SystemUser | null>(() => INITIAL_SYSTEM_USERS[0]);
  const [loginUsername, setLoginUsername] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginError, setLoginError] = useState('');

  // Navigation & Mode State
  const [activeTab, setActiveTab] = useState<ActiveTab>('SESSIONS');
  const [selectedReportSessionId, setSelectedReportSessionId] = useState<string | null>(null);

  // Candidate Registration Form State (With Multi-Select Sections #7/#8 & Question Count per Test #6)
  const [candidateName, setCandidateName] = useState('');
  const [nationalId, setNationalId] = useState('');
  const [phone, setPhone] = useState('');
  const [selectedCategoriesForNewExam, setSelectedCategoriesForNewExam] = useState<string[]>(
    () =>
      effectiveSections
        .filter((s) => s.enabledByDefault !== false)
        .map((s) => s.id)
  );
  const [customCountsForNewExam, setCustomCountsForNewExam] = useState<
    Record<string, number>
  >(() => {
    const map: Record<string, number> = {};
    for (const s of effectiveSections) {
      map[s.id] = s.counts.easy + s.counts.medium + s.counts.hard;
    }
    return map;
  });

  // Keep form section defaults in sync when standardConfig.sections changes
  useEffect(() => {
    const secs = getEffectiveSections(standardConfig);
    setSelectedCategoriesForNewExam((prev) => {
      const validPrev = prev.filter((id) => secs.some((s) => s.id === id));
      if (validPrev.length > 0) return validPrev;
      return secs.filter((s) => s.enabledByDefault !== false).map((s) => s.id);
    });
    setCustomCountsForNewExam(() => {
      const map: Record<string, number> = {};
      for (const s of secs) {
        map[s.id] = s.counts.easy + s.counts.medium + s.counts.hard;
      }
      return map;
    });
  }, [standardConfig]);

  const [newlyGeneratedSession, setNewlyGeneratedSession] = useState<CandidateSession | null>(
    null
  );
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Analytics Filters
  const [analyticsStatusFilter, setAnalyticsStatusFilter] = useState<
    'ALL' | 'PASSED' | 'FAILED'
  >('ALL');
  const [analyticsSearch, setAnalyticsSearch] = useState('');

  // Persist to LocalStorage AND Broadcast to Live Server + Google Sheets whenever state updates
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.QUESTIONS, JSON.stringify(questions));
    } catch {
      // Ignore
    }
    if (hasHydratedFromServerRef.current && !isApplyingRemoteRef.current) {
      pushStateToServer({ questions }).then((res) => {
        if (res?.version) serverVersionRef.current = res.version;
      });
    }
  }, [questions]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.JOBS, JSON.stringify(jobProfiles));
    } catch {
      // Ignore
    }
    if (hasHydratedFromServerRef.current && !isApplyingRemoteRef.current) {
      pushStateToServer({ jobProfiles }).then((res) => {
        if (res?.version) serverVersionRef.current = res.version;
      });
    }
  }, [jobProfiles]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.SESSIONS, JSON.stringify(sessions));
    } catch {
      // Ignore
    }
    if (hasHydratedFromServerRef.current && !isApplyingRemoteRef.current) {
      pushStateToServer({ sessions }).then((res) => {
        if (res?.version) serverVersionRef.current = res.version;
      });
    }
  }, [sessions]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.USERS, JSON.stringify(users));
    } catch {
      // Ignore
    }
    if (hasHydratedFromServerRef.current && !isApplyingRemoteRef.current) {
      pushStateToServer({ users }).then((res) => {
        if (res?.version) serverVersionRef.current = res.version;
      });
    }
  }, [users]);

  const hasPermission = (key: PermissionKey): boolean => {
    if (!currentUser) return false;
    const perms =
      currentUser.permissions ||
      ROLE_PRESET_PERMISSIONS[currentUser.role] ||
      ROLE_PRESET_PERMISSIONS.HR_SPECIALIST;
    return Boolean(perms[key]);
  };

  // Construct Dedicated Links for Candidate Portal & Admin Dashboard
  const baseOriginUrl = `${window.location.origin}${window.location.pathname}`;
  const candidatePortalUrl = `${baseOriginUrl}?portal=exam`;
  const adminDashboardUrl = `${baseOriginUrl}?portal=admin`;

  const buildDirectCandidateUrl = (sess: CandidateSession) => {
    const params = new URLSearchParams();
    params.set('portal', 'exam');
    params.set('otp', sess.otpCode);
    params.set('name', sess.candidateName);
    params.set('nid', sess.nationalId);
    return `${baseOriginUrl}?${params.toString()}`;
  };

  const handleCopyText = (text: string, key: string) => {
    navigator.clipboard?.writeText(text).catch(() => {});
    setCopiedId(key);
    setTimeout(() => setCopiedId(null), 2200);
  };

  const handleToggleExamCategoryForCandidate = (catId: string) => {
    setSelectedCategoriesForNewExam((prev) => {
      if (prev.includes(catId)) {
        if (prev.length <= 1) return prev; // Keep at least 1 section selected
        return prev.filter((id) => id !== catId);
      }
      return [...prev, catId];
    });
  };

  // Create New Candidate Session with Selected Sections (#7) & Custom Question Counts (#6)
  const handleCreateSession = (e: React.FormEvent) => {
    e.preventDefault();
    if (!candidateName.trim() || !nationalId.trim()) return;

    const activeCats =
      selectedCategoriesForNewExam.length > 0
        ? selectedCategoriesForNewExam
        : effectiveSections.map((s) => s.id);

    const otpCode = generateUniqueOtp(sessions.map((s) => s.otpCode));
    const { instances, usedQuestionIds } = buildSessionQuestions(
      questions,
      standardConfig,
      sessions,
      {
        assignedCategories: activeCats,
        customQuestionCounts: customCountsForNewExam,
      }
    );

    const initialSectionStatus: Record<string, SectionProgressStatus> = {};
    const initialSectionRemaining: Record<string, number> = {};
    for (const sec of effectiveSections) {
      if (activeCats.includes(sec.id)) {
        initialSectionStatus[sec.id] = 'not_started';
        initialSectionRemaining[sec.id] = sec.timeLimitMinutes * 60;
      }
    }

    const newSession: CandidateSession = {
      id: `sess-${Date.now()}`,
      otpCode,
      candidateName: candidateName.trim(),
      nationalId: nationalId.trim(),
      phone: phone.trim() || 'غير مسجل',
      branchCity: '',
      jobProfileId: standardConfig.id,
      assignedCategories: activeCats,
      status: 'pending',
      sectionStatus: initialSectionStatus,
      createdAt: new Date().toISOString(),
      currentQuestionIndex: 0,
      sectionRemainingSeconds: initialSectionRemaining,
      questions: instances,
      securityLogs: [],
    };

    const usedSet = new Set(usedQuestionIds);
    const nowIso = new Date().toISOString();
    setQuestions((prev) =>
      prev.map((q) =>
        usedSet.has(q.id)
          ? { ...q, usageCount: q.usageCount + 1, lastUsedAt: nowIso }
          : q
      )
    );

    setSessions((prev) => {
      const updated = [newSession, ...prev];
      try {
        localStorage.setItem(STORAGE_KEYS.SESSIONS, JSON.stringify(updated));
      } catch {
        // Ignore
      }
      return updated;
    });
    setNewlyGeneratedSession(newSession);
    setCandidateName('');
    setNationalId('');
    setPhone('');
  };

  // Emergency session creation if candidate enters a KIB-XXXX code generated on another device/tab
  const handleCreateEmergencySessionFromOtp = (
    otpCode: string,
    fallbackName?: string,
    fallbackNationalId?: string
  ): CandidateSession => {
    const activeCats = effectiveSections
      .filter((s) => s.enabledByDefault !== false)
      .map((s) => s.id);
    const { instances } = buildSessionQuestions(questions, standardConfig, sessions, {
      assignedCategories: activeCats,
    });

    const initialSectionStatus: Record<string, SectionProgressStatus> = {};
    const initialSectionRemaining: Record<string, number> = {};
    for (const sec of effectiveSections) {
      if (activeCats.includes(sec.id)) {
        initialSectionStatus[sec.id] = 'not_started';
        initialSectionRemaining[sec.id] = sec.timeLimitMinutes * 60;
      }
    }

    const emergencySession: CandidateSession = {
      id: `sess-${Date.now()}`,
      otpCode,
      candidateName: fallbackName || 'متقدم للاختبار المعياري',
      nationalId: fallbackNationalId || 'مسجل برمز الجلسة',
      phone: 'غير مسجل',
      branchCity: '',
      jobProfileId: standardConfig.id,
      assignedCategories: activeCats,
      status: 'pending',
      sectionStatus: initialSectionStatus,
      createdAt: new Date().toISOString(),
      currentQuestionIndex: 0,
      sectionRemainingSeconds: initialSectionRemaining,
      questions: instances,
      securityLogs: [],
    };

    setSessions((prev) => {
      const updated = [emergencySession, ...prev];
      try {
        localStorage.setItem(STORAGE_KEYS.SESSIONS, JSON.stringify(updated));
      } catch {
        // Ignore
      }
      return updated;
    });

    return emergencySession;
  };

  const handleUpdateCandidateIdentity = (
    sessionId: string,
    updatedName: string,
    updatedNationalId: string
  ) => {
    setSessions((prev) =>
      prev.map((s) =>
        s.id === sessionId
          ? { ...s, candidateName: updatedName, nationalId: updatedNationalId }
          : s
      )
    );
  };

  // Pause / Resume / Stop Candidate Session from Control Panel (#3)
  const handleTogglePauseSession = (sessionId: string) => {
    setSessions((prev) =>
      prev.map((s) => {
        if (s.id !== sessionId) return s;
        const nextStatus = s.status === 'paused' ? 'in_progress' : 'paused';
        return { ...s, status: nextStatus };
      })
    );
  };

  const handleTerminateSession = (sessionId: string) => {
    setSessions((prev) =>
      prev.map((s) => {
        if (s.id !== sessionId) return s;
        const evaluation = evaluateCandidateSession(s, standardConfig);
        return {
          ...s,
          status: 'completed',
          completedAt: new Date().toISOString(),
          evaluation,
        };
      })
    );
  };

  // Section-based Kiosk Callbacks
  const handleStartSection = (sessionId: string, category: AssessmentCategory) => {
    setSessions((prev) =>
      prev.map((s) =>
        s.id === sessionId
          ? {
              ...s,
              status: 'in_progress',
              startedAt: s.startedAt || new Date().toISOString(),
              sectionStatus: {
                ...(s.sectionStatus || {}),
                [category]: 'in_progress',
              },
            }
          : s
      )
    );
  };

  const handleAnswerQuestion = (
    sessionId: string,
    questionIndex: number,
    selectedOptionIndex: number | null,
    timeSpentSeconds: number,
    timedOut: boolean,
    updatedSectionRemaining: Record<string, number>,
    extra?: {
      selectedOptionIndices?: number[];
      flagged?: boolean;
      advanceIndex?: boolean;
    }
  ) => {
    setSessions((prev) =>
      prev.map((s) => {
        if (s.id !== sessionId) return s;
        const updatedQuestions = s.questions.map((q, idx) =>
          idx === questionIndex
            ? {
                ...q,
                selectedOptionIndex,
                selectedOptionIndices:
                  extra?.selectedOptionIndices ??
                  (selectedOptionIndex !== null ? [selectedOptionIndex] : []),
                flagged: extra?.flagged !== undefined ? extra.flagged : q.flagged,
                timeSpentSeconds,
                timedOut,
              }
            : q
        );
        return {
          ...s,
          currentQuestionIndex:
            extra?.advanceIndex === false ? questionIndex : questionIndex + 1,
          sectionRemainingSeconds: updatedSectionRemaining,
          questions: updatedQuestions,
        };
      })
    );
  };

  const handleToggleFlagQuestion = (
    sessionId: string,
    questionIndex: number,
    explicitFlagged?: boolean
  ) => {
    setSessions((prev) =>
      prev.map((s) => {
        if (s.id !== sessionId) return s;
        const updatedQuestions = s.questions.map((q, idx) =>
          idx === questionIndex
            ? {
                ...q,
                flagged:
                  explicitFlagged !== undefined ? explicitFlagged : !q.flagged,
              }
            : q
        );
        return { ...s, questions: updatedQuestions };
      })
    );
  };

  const handleCompleteSection = (sessionId: string, category: AssessmentCategory) => {
    setSessions((prev) =>
      prev.map((s) => {
        if (s.id !== sessionId) return s;
        const updatedSectionStatus: Record<string, SectionProgressStatus> = {
          ...(s.sectionStatus || {}),
          [category]: 'completed',
        };

        const assigned =
          s.assignedCategories && s.assignedCategories.length > 0
            ? s.assignedCategories
            : Array.from(new Set(s.questions.map((q) => q.category)));

        const allAssignedCompleted = assigned.every(
          (catId) => updatedSectionStatus[catId] === 'completed'
        );

        const evaluation = evaluateCandidateSession(s, standardConfig);

        return {
          ...s,
          sectionStatus: updatedSectionStatus,
          status: allAssignedCompleted ? 'completed' : 'in_progress',
          completedAt: allAssignedCompleted ? new Date().toISOString() : s.completedAt,
          evaluation,
        };
      })
    );
  };

  const handleLogSecurityEvent = (
    sessionId: string,
    event: Omit<SecurityEvent, 'id' | 'timestamp'>
  ) => {
    setSessions((prev) =>
      prev.map((s) => {
        if (s.id !== sessionId) return s;
        const newEvent: SecurityEvent = {
          ...event,
          id: `sec-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          timestamp: new Date().toISOString(),
        };
        return {
          ...s,
          securityLogs: [...s.securityLogs, newEvent],
        };
      })
    );
  };

  const handleDeleteSession = (sessionId: string) => {
    setSessions((prev) => prev.filter((s) => s.id !== sessionId));
    if (newlyGeneratedSession?.id === sessionId) {
      setNewlyGeneratedSession(null);
    }
  };

  // Question Bank Callbacks
  const handleSaveQuestion = (item: QuestionItem) => {
    setQuestions((prev) => {
      const exists = prev.some((q) => q.id === item.id);
      if (exists) {
        return prev.map((q) => (q.id === item.id ? item : q));
      }
      return [item, ...prev];
    });
  };

  const handleDeleteQuestion = (questionId: string) => {
    setQuestions((prev) => prev.filter((q) => q.id !== questionId));
  };

  const handleBulkDeleteQuestions = (questionIds: string[]) => {
    const idSet = new Set(questionIds);
    setQuestions((prev) => prev.filter((q) => !idSet.has(q.id)));
  };

  const handleBulkChangeCategory = (questionIds: string[], newCategory: string) => {
    const idSet = new Set(questionIds);
    setQuestions((prev) =>
      prev.map((q) => (idSet.has(q.id) ? { ...q, category: newCategory } : q))
    );
  };

  const handleImportQuestions = (imported: QuestionItem[]) => {
    setQuestions((prev) => [...imported, ...prev]);
  };

  // Standard Assessment Config Callbacks
  const handleUpdateStandardConfig = (updated: JobProfile) => {
    setJobProfiles([updated]);
  };

  const handleResetConfigDefaults = () => {
    setJobProfiles([INITIAL_JOB_PROFILES[0]]);
  };

  // User Management Callbacks
  const handleSaveUser = (userObj: SystemUser) => {
    setUsers((prev) => {
      const exists = prev.some((u) => u.id === userObj.id);
      if (exists) {
        return prev.map((u) => (u.id === userObj.id ? userObj : u));
      }
      return [...prev, userObj];
    });
    if (currentUser && currentUser.id === userObj.id) {
      setCurrentUser(userObj);
    }
  };

  const handleDeleteUser = (userId: string) => {
    setUsers((prev) => prev.filter((u) => u.id !== userId));
  };

  const selectDefaultAllowedTab = (user: SystemUser) => {
    const p = user.permissions || ROLE_PRESET_PERMISSIONS[user.role];
    if (p.view_sessions) setActiveTab('SESSIONS');
    else if (p.view_analytics) setActiveTab('ANALYTICS');
    else if (p.view_questions) setActiveTab('QUESTION_BANK');
    else if (p.view_settings) setActiveTab('JOB_SETTINGS');
    else if (p.manage_users) setActiveTab('USERS');
    else setActiveTab('ANALYTICS');
  };

  const handleAdminLogin = (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError('');
    const matched = users.find(
      (u) =>
        u.active &&
        u.username.toLowerCase() === loginUsername.trim().toLowerCase() &&
        u.password === loginPassword.trim()
    );
    if (!matched) {
      setLoginError('بيانات الدخول غير صحيحة أو الحساب غير نشط.');
      return;
    }
    setCurrentUser(matched);
    selectDefaultAllowedTab(matched);
    setLoginUsername('');
    setLoginPassword('');
  };

  // =========================================================================
  // ROUTE 1: ISOLATED CANDIDATE EXAM PORTAL (?portal=exam)
  // =========================================================================
  if (routeState.portal === 'CANDIDATE') {
    return (
      <CandidateKiosk
        sessions={sessions}
        sections={effectiveSections}
        preselectedOtp={routeState.otpParam}
        preselectedName={routeState.nameParam}
        preselectedNationalId={routeState.nidParam}
        isRealtimeConnected={isRealtimeConnected}
        onCreateEmergencySessionFromOtp={handleCreateEmergencySessionFromOtp}
        onUpdateCandidateIdentity={handleUpdateCandidateIdentity}
        onStartSection={handleStartSection}
        onAnswerQuestion={handleAnswerQuestion}
        onToggleFlagQuestion={handleToggleFlagQuestion}
        onCompleteSection={handleCompleteSection}
        onLogSecurityEvent={handleLogSecurityEvent}
      />
    );
  }

  // =========================================================================
  // ROUTE 2: HR & EXECUTIVE LOGIN SCREEN (IF LOGGED OUT)
  // =========================================================================
  if (!currentUser) {
    return (
      <div className="min-h-screen bg-[#FAF8F7] flex flex-col justify-between">
        <header className="bg-white border-b-4 border-[#7c2529] px-8 py-4 flex items-center justify-between shadow-xs">
          <div className="flex items-center gap-4">
            <img
              src={KIB_BRAND.logoColoredOnWhite}
              alt="بنك الكريمي الإسلامي"
              referrerPolicy="no-referrer"
              className="h-11 w-auto object-contain"
            />
            <div className="h-8 w-px bg-slate-200 hidden sm:block" />
            <span className="text-base md:text-lg font-bold text-[#7c2529]">
              بوابة الموارد البشرية والإدارة العليا
            </span>
          </div>
        </header>

        <main className="flex-1 flex items-center justify-center p-6">
          <div className="w-full max-w-md bg-white border border-slate-200 rounded-2xl p-8 space-y-6 shadow-xs">
            <div className="text-center space-y-2">
              <div className="w-12 h-12 rounded-xl bg-[#7c2529]/10 text-[#7c2529] flex items-center justify-center mx-auto">
                <Lock className="w-6 h-6" />
              </div>
              <h1 className="text-xl font-bold text-[#7c2529]">
                دخول لوحة تحكم الموارد البشرية والإدارة العليا
              </h1>
              <p className="text-xs text-slate-500">
                أدخل اسم المستخدم وكلمة المرور للوصول إلى الأقسام المخصصة لصلاحياتك
              </p>
            </div>

            <form onSubmit={handleAdminLogin} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  اسم المستخدم
                </label>
                <input
                  type="text"
                  required
                  dir="ltr"
                  value={loginUsername}
                  onChange={(e) => setLoginUsername(e.target.value)}
                  placeholder="admin / hr.akram / executive"
                  className="w-full px-3.5 py-2.5 text-sm font-mono-tabular bg-slate-50 border border-slate-300 rounded-xl focus:outline-none focus:border-[#7c2529]"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  كلمة المرور
                </label>
                <input
                  type="password"
                  required
                  dir="ltr"
                  value={loginPassword}
                  onChange={(e) => setLoginPassword(e.target.value)}
                  placeholder="123"
                  className="w-full px-3.5 py-2.5 text-sm font-mono-tabular bg-slate-50 border border-slate-300 rounded-xl focus:outline-none focus:border-[#7c2529]"
                />
              </div>

              {loginError && <p className="text-xs font-semibold text-red-600">{loginError}</p>}

              <button
                type="submit"
                className="w-full py-3 bg-[#7c2529] hover:bg-[#631d20] text-white font-bold text-sm rounded-xl transition-colors cursor-pointer"
              >
                تسجيل الدخول للوحة التحكم
              </button>
            </form>

            {/* Quick Role Demo Switcher */}
            <div className="pt-4 border-t border-slate-100 space-y-2">
              <div className="text-[11px] text-slate-500 font-semibold">
                حسابات جاهزة للتجربة السريعة (كلمة المرور: 123):
              </div>
              <div className="grid grid-cols-1 gap-2">
                {users.map((u) => (
                  <button
                    key={u.id}
                    type="button"
                    onClick={() => {
                      setCurrentUser(u);
                      selectDefaultAllowedTab(u);
                    }}
                    className="text-right p-2.5 rounded-xl border border-slate-200 hover:border-[#7c2529] hover:bg-[#FAF8F7] text-xs flex items-center justify-between transition-colors cursor-pointer"
                  >
                    <div>
                      <span className="font-bold text-slate-900 block">{u.fullName}</span>
                      <span className="text-[11px] text-slate-500">
                        {USER_ROLE_LABELS[u.role]?.ar || 'صلاحيات مخصصة'}
                      </span>
                    </div>
                    <span className="font-mono-tabular text-[#7c2529] font-bold">
                      {u.username}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </main>

        <footer className="bg-white border-t border-slate-200 px-8 py-4 text-xs text-slate-500 text-center">
          بنك الكريمي الإسلامي — منصة الاختبارات والتقييم المعياري
        </footer>
      </div>
    );
  }

  // =========================================================================
  // ROUTE 3: HR & EXECUTIVE CONTROL PANEL (?portal=admin)
  // =========================================================================
  const completedSessions = sessions.filter((s) => s.status === 'completed' && s.evaluation);
  const pendingSessions = sessions.filter((s) => s.status !== 'completed');
  const passedCount = completedSessions.filter((s) => s.evaluation?.passed).length;
  const passRate =
    completedSessions.length > 0
      ? Math.round((passedCount / completedSessions.length) * 100)
      : 0;
  const avgScore =
    completedSessions.length > 0
      ? Math.round(
          completedSessions.reduce(
            (acc, s) => acc + (s.evaluation?.weightedTotalScore || 0),
            0
          ) / completedSessions.length
        )
      : 0;

  const filteredCompletedSessions = completedSessions.filter((s) => {
    if (analyticsStatusFilter === 'PASSED' && !s.evaluation?.passed) return false;
    if (analyticsStatusFilter === 'FAILED' && s.evaluation?.passed) return false;
    if (
      analyticsSearch.trim() &&
      !s.candidateName.includes(analyticsSearch) &&
      !s.otpCode.toLowerCase().includes(analyticsSearch.toLowerCase()) &&
      !s.nationalId.includes(analyticsSearch)
    ) {
      return false;
    }
    return true;
  });

  const activeReportSession = selectedReportSessionId
    ? sessions.find((s) => s.id === selectedReportSessionId) || null
    : null;

  const allowedTabs: { key: ActiveTab; label: string; allowed: boolean }[] = [
    {
      key: 'SESSIONS',
      label: 'إدارة الجلسات والروابط',
      allowed: hasPermission('view_sessions') || hasPermission('create_sessions'),
    },
    {
      key: 'ANALYTICS',
      label: 'التقارير والرسوم البيانية',
      allowed: hasPermission('view_analytics') || hasPermission('print_export_reports'),
    },
    {
      key: 'QUESTION_BANK',
      label: 'بنك الأسئلة وقالب إكسل',
      allowed:
        hasPermission('view_questions') ||
        hasPermission('edit_questions') ||
        hasPermission('import_export_questions'),
    },
    {
      key: 'JOB_SETTINGS',
      label: 'إعدادات التقييم والأوزان',
      allowed: hasPermission('view_settings') || hasPermission('edit_settings'),
    },
    {
      key: 'USERS',
      label: 'إدارة المستخدمين والصلاحيات',
      allowed: true,
    },
  ];

  return (
    <div className="min-h-screen bg-[#FAF8F7] text-slate-900 flex flex-col">
      {/* Top Bar: Colored Logo on Crisp White Surface */}
      <header className="no-print bg-white border-b-4 border-[#7c2529] px-6 md:px-10 py-3.5 flex items-center justify-between gap-8 shadow-xs">
        <a
          href="#top"
          onClick={(e) => {
            e.preventDefault();
            selectDefaultAllowedTab(currentUser);
            setSelectedReportSessionId(null);
          }}
          className="flex items-center gap-4 whitespace-nowrap shrink-0"
        >
          <img
            src={KIB_BRAND.logoColoredOnWhite}
            alt="بنك الكريمي الإسلامي"
            referrerPolicy="no-referrer"
            className="h-11 w-auto object-contain shrink-0"
          />
          <div className="h-8 w-px bg-slate-200 hidden sm:block" />
          <span className="text-base md:text-lg font-bold tracking-tight text-[#7c2529]">
            منصة اختبارات الموارد البشرية
          </span>
        </a>

        <nav className="hidden lg:flex items-center gap-6 text-sm font-bold text-slate-600">
          {allowedTabs
            .filter((t) => t.allowed)
            .map((tab) => (
              <button
                key={tab.key}
                type="button"
                onClick={() => {
                  setActiveTab(tab.key);
                  setSelectedReportSessionId(null);
                }}
                className={`py-2 transition-colors whitespace-nowrap shrink-0 border-b-2 cursor-pointer ${
                  activeTab === tab.key
                    ? 'text-[#7c2529] border-[#7c2529]'
                    : 'border-transparent hover:text-[#7c2529]'
                }`}
              >
                {tab.label}
              </button>
            ))}
        </nav>

        <div className="flex items-center gap-3 shrink-0">
          <div className="hidden sm:block text-left text-xs">
            <div className="font-bold text-slate-900">{currentUser.fullName}</div>
            <div className="text-[11px] font-semibold text-[#7c2529]">
              {USER_ROLE_LABELS[currentUser.role]?.ar.split('(')[0] || 'صلاحيات مخصصة'}
            </div>
          </div>

          <button
            type="button"
            onClick={() => setCurrentUser(null)}
            className="px-3.5 py-2 text-xs font-bold text-white bg-[#7c2529] hover:bg-[#631d20] rounded-xl transition-colors whitespace-nowrap shrink-0 flex items-center gap-1.5 cursor-pointer"
            title="تبديل الحساب أو تسجيل الخروج"
          >
            <LogOut className="w-3.5 h-3.5 text-[#ffc72c]" />
            <span>تبديل الحساب</span>
          </button>
        </div>
      </header>

      {/* Mobile Navigation Bar */}
      <div className="no-print lg:hidden bg-white border-b border-slate-200 px-4 py-2 flex items-center gap-2 overflow-x-auto">
        {allowedTabs
          .filter((t) => t.allowed)
          .map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => {
                setActiveTab(tab.key);
                setSelectedReportSessionId(null);
              }}
              className={`px-3 py-1.5 text-xs font-bold rounded-lg whitespace-nowrap shrink-0 ${
                activeTab === tab.key ? 'bg-[#7c2529] text-white' : 'text-slate-600'
              }`}
            >
              {tab.label}
            </button>
          ))}
      </div>

      {/* Main Content Container */}
      <main className="flex-1 w-full max-w-[1380px] mx-auto px-6 md:px-10 py-8 space-y-6">
        {/* Live Google Sheets Database & Real-Time Multi-User Sync Bar */}
        <GoogleSheetsSyncBar
          sheetsConfig={sheetsConfig}
          connectedClientsCount={connectedClientsCount}
          isRealtimeConnected={isRealtimeConnected}
          onSheetsConfigUpdated={(updated) => setSheetsConfig(updated)}
          onStatePulledFromSheets={(snapshot) => applyServerSnapshot(snapshot)}
        />

        {/* Dedicated Portal Links Banner */}
        <section className="no-print bg-white border-2 border-[#7c2529]/20 rounded-2xl p-5 flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-5 shadow-xs">
          <div className="space-y-1">
            <div className="text-sm font-bold text-[#7c2529] flex items-center gap-2">
              <Link2 className="w-4 h-4 text-[#7c2529]" />
              <span>الروابط المستقلة للنظام (عزل تام لواجهة المختبر عن لوحة التحكم)</span>
            </div>
            <p className="text-xs text-slate-600">
              افتح <strong>رابط واجهة المختبر</strong> على جهاز المتقدم (لا يحتوي على أي أزرار أو وصول للوحة التحكم)، واستخدم <strong>رابط لوحة التحكم</strong> لموظفي الموارد البشرية والإدارة العليا.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3 shrink-0">
            <div className="flex items-center bg-[#FAF8F7] border border-slate-300 rounded-xl p-1.5 gap-2">
              <div className="px-2.5 text-right">
                <div className="text-[10px] font-bold text-[#7c2529]">
                  1. رابط واجهة المختبر (معزول)
                </div>
                <div
                  dir="ltr"
                  className="text-xs font-mono-tabular text-slate-700 max-w-[200px] truncate"
                >
                  ?portal=exam
                </div>
              </div>
              <button
                type="button"
                onClick={() => handleCopyText(candidatePortalUrl, 'CANDIDATE_URL')}
                className="px-3 py-1.5 bg-[#7c2529] hover:bg-[#631d20] text-white text-xs font-bold rounded-lg flex items-center gap-1 transition-colors cursor-pointer"
              >
                {copiedId === 'CANDIDATE_URL' ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-[#ffc72c]" />
                    <span>تم نسخ الرابط</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5 text-[#ffc72c]" />
                    <span>نسخ رابط المختبر</span>
                  </>
                )}
              </button>
              <button
                type="button"
                onClick={() => {
                  window.history.pushState({}, '', '?portal=exam');
                  setRouteState({ portal: 'CANDIDATE' });
                }}
                className="p-1.5 text-slate-600 hover:text-[#7c2529] hover:bg-slate-200/60 rounded-lg transition-colors cursor-pointer"
                title="معاينة واجهة المختبر المعزولة"
              >
                <ExternalLink className="w-4 h-4" />
              </button>
            </div>

            <div className="flex items-center bg-[#FAF8F7] border border-slate-300 rounded-xl p-1.5 gap-2">
              <div className="px-2.5 text-right">
                <div className="text-[10px] font-bold text-slate-700">
                  2. رابط لوحة التحكم (للإدارة)
                </div>
                <div
                  dir="ltr"
                  className="text-xs font-mono-tabular text-slate-700 max-w-[200px] truncate"
                >
                  ?portal=admin
                </div>
              </div>
              <button
                type="button"
                onClick={() => handleCopyText(adminDashboardUrl, 'ADMIN_URL')}
                className="px-3 py-1.5 bg-slate-800 hover:bg-slate-900 text-white text-xs font-bold rounded-lg flex items-center gap-1 transition-colors cursor-pointer"
              >
                {copiedId === 'ADMIN_URL' ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-[#ffc72c]" />
                    <span>تم نسخ الرابط</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    <span>نسخ رابط الإدارة</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </section>

        {/* Global KPI Overview Strip */}
        <section className="no-print grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs">
            <div className="text-xs text-slate-500">إجمالي المتقدمين المختبرين</div>
            <div className="text-2xl font-bold font-mono-tabular text-[#7c2529] mt-1">
              {completedSessions.length} متقدم
            </div>
            <div className="text-xs text-slate-600 mt-1">
              جلسات نشطة أو موقوفة مؤقتاً:{' '}
              <span className="font-mono-tabular font-bold text-slate-900">
                {pendingSessions.length}
              </span>
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs">
            <div className="text-xs text-slate-500">نسبة الاجتياز المعياري</div>
            <div className="text-2xl font-bold font-mono-tabular text-[#7c2529] mt-1">
              {passRate}%
            </div>
            <div className="text-xs text-slate-600 mt-1">
              اجتازوا الحد الأدنى المعتمد ({passedCount} من {completedSessions.length})
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs">
            <div className="text-xs text-slate-500">متوسط الأداء العام الموزون</div>
            <div className="text-2xl font-bold font-mono-tabular text-slate-900 mt-1">
              {avgScore}%
            </div>
            <div className="text-xs text-slate-600 mt-1">
              عبر جميع أقسام الاختبارات المفعّلة
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs">
            <div className="text-xs text-slate-500">بنك الأسئلة والأقسام المتاحة</div>
            <div className="text-2xl font-bold font-mono-tabular text-slate-900 mt-1">
              {questions.length} سؤالاً ({effectiveSections.length} أقسام)
            </div>
            <div className="text-xs text-slate-600 mt-1">
              تصدير واستيراد مباشر بصيغة Excel (.xlsx)
            </div>
          </div>
        </section>

        {/* Detailed Printable Report Modal / View */}
        {activeReportSession ? (
          <CandidateReportModal
            session={activeReportSession}
            standardConfig={standardConfig}
            allSessions={sessions}
            onClose={() => setSelectedReportSessionId(null)}
          />
        ) : (
          <>
            {/* TAB 1: SESSIONS, SECTION SELECTION (#7), QUESTION COUNTS (#6), & SESSION PAUSE/STOP (#3) */}
            {activeTab === 'SESSIONS' && (
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
                {/* Register Candidate & Select Which Tests + Question Counts */}
                <div className="lg:col-span-5 bg-white border border-slate-200 rounded-2xl p-6 md:p-8 space-y-6 shadow-xs">
                  <div className="pb-4 border-b border-slate-200">
                    <h1 className="text-lg font-bold text-[#7c2529] flex items-center gap-2">
                      <UserPlus className="w-5 h-5 text-[#7c2529]" />
                      <span>تسجيل متقدم جديد وتحديد أقسام وعدد أسئلة الاختبار</span>
                    </h1>
                    <p className="text-xs text-slate-600 mt-1">
                      حدد أقسام الاختبار التي ستظهر للمختبر وعدد الأسئلة المطلوب لكل قسم، وسيقوم النظام بتوليد نموذج فريد ورمز دخول (OTP).
                    </p>
                  </div>

                  {!hasPermission('create_sessions') ? (
                    <div className="p-5 bg-[#FAF8F7] border border-slate-200 rounded-xl text-xs text-slate-600 leading-relaxed">
                      حسابك الحالي لا يتضمن صلاحية <strong>تسجيل متقدم وتوليد رمز دخول (OTP)</strong>.
                    </div>
                  ) : (
                    <form onSubmit={handleCreateSession} className="space-y-4">
                      <div>
                        <label className="block text-xs font-semibold text-slate-800 mb-1.5">
                          اسم المتقدم الرباعي
                        </label>
                        <input
                          type="text"
                          required
                          value={candidateName}
                          onChange={(e) => setCandidateName(e.target.value)}
                          placeholder="مثال: محمد عبدالله صالح الشامي"
                          className="w-full px-3.5 py-2.5 text-sm bg-slate-50 border border-slate-300 rounded-xl focus:outline-none focus:border-[#7c2529] focus:bg-white"
                        />
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                        <div>
                          <label className="block text-xs font-semibold text-slate-800 mb-1.5">
                            الرقم الوطني / رقم الهوية
                          </label>
                          <input
                            type="text"
                            required
                            dir="ltr"
                            value={nationalId}
                            onChange={(e) => setNationalId(e.target.value)}
                            placeholder="010100XXXXX"
                            className="w-full px-3.5 py-2.5 text-sm font-mono-tabular bg-slate-50 border border-slate-300 rounded-xl focus:outline-none focus:border-[#7c2529] focus:bg-white"
                          />
                        </div>

                        <div>
                          <label className="block text-xs font-semibold text-slate-800 mb-1.5">
                            رقم الهاتف الجوال
                          </label>
                          <input
                            type="text"
                            dir="ltr"
                            value={phone}
                            onChange={(e) => setPhone(e.target.value)}
                            placeholder="77XXXXXXX"
                            className="w-full px-3.5 py-2.5 text-sm font-mono-tabular bg-slate-50 border border-slate-300 rounded-xl focus:outline-none focus:border-[#7c2529] focus:bg-white"
                          />
                        </div>
                      </div>

                      {/* Multi-Select Test Sections & Question Count per Section (#6, #7, #8) */}
                      <div className="p-4 bg-[#FAF8F7] border border-slate-200 rounded-xl space-y-3">
                        <div className="flex items-center justify-between">
                          <label className="text-xs font-bold text-[#7c2529] flex items-center gap-1.5">
                            <Layers className="w-4 h-4 text-[#7c2529]" />
                            <span>تحديد أقسام الاختبار التي تظهر للمختبر وعدد الأسئلة:</span>
                          </label>
                          <button
                            type="button"
                            onClick={() => setActiveTab('JOB_SETTINGS')}
                            className="text-[11px] font-bold text-[#7c2529] hover:underline cursor-pointer"
                          >
                            + إضافة نوع اختبار جديد
                          </button>
                        </div>

                        <div className="space-y-2">
                          {effectiveSections.map((sec) => {
                            const isChecked = selectedCategoriesForNewExam.includes(
                              sec.id
                            );
                            const currentCount =
                              customCountsForNewExam[sec.id] ??
                              sec.counts.easy + sec.counts.medium + sec.counts.hard;

                            return (
                              <div
                                key={sec.id}
                                className={`p-3 rounded-xl border flex items-center justify-between gap-3 transition-colors ${
                                  isChecked
                                    ? 'bg-white border-[#7c2529]'
                                    : 'bg-slate-100/70 border-slate-200 opacity-70'
                                }`}
                              >
                                <label className="flex items-center gap-2.5 cursor-pointer flex-1">
                                  <input
                                    type="checkbox"
                                    checked={isChecked}
                                    onChange={() =>
                                      handleToggleExamCategoryForCandidate(sec.id)
                                    }
                                    className="w-4 h-4 accent-[#7c2529] shrink-0"
                                  />
                                  <div>
                                    <span className="text-xs font-bold text-slate-900 block">
                                      {sec.titleAr}
                                    </span>
                                    <span className="text-[11px] text-slate-500">
                                      الزمن: {sec.timeLimitMinutes} دقيقة · الوزن:{' '}
                                      {sec.weight}%
                                    </span>
                                  </div>
                                </label>

                                {isChecked && (
                                  <div className="flex items-center gap-1.5 shrink-0">
                                    <span className="text-[11px] font-semibold text-slate-600">
                                      عدد الأسئلة:
                                    </span>
                                    <input
                                      type="number"
                                      min={1}
                                      max={100}
                                      value={currentCount}
                                      onChange={(e) =>
                                        setCustomCountsForNewExam((prev) => ({
                                          ...prev,
                                          [sec.id]: Math.max(
                                            1,
                                            Math.min(100, Number(e.target.value))
                                          ),
                                        }))
                                      }
                                      className="w-16 px-2 py-1 text-center font-mono-tabular font-bold text-xs text-[#7c2529] bg-[#FAF8F7] border border-slate-300 rounded-lg focus:outline-none focus:border-[#7c2529]"
                                    />
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>

                      <button
                        type="submit"
                        className="w-full py-3.5 px-5 bg-[#7c2529] hover:bg-[#631d20] text-white font-bold text-sm rounded-xl transition-colors flex items-center justify-center gap-2 cursor-pointer"
                      >
                        <KeyRound className="w-4 h-4 text-[#ffc72c]" />
                        <span>توليد نموذج الاختبار وإصدار رمز الدخول (OTP)</span>
                      </button>
                    </form>
                  )}

                  {/* Newly Generated OTP Card */}
                  {newlyGeneratedSession && (
                    <div className="p-5 bg-[#ffc72c]/15 border-2 border-[#7c2529] rounded-2xl space-y-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="text-xs font-bold text-[#7c2529]">
                            تم تجهيز جلسة الاختبار للمتقدم بنجاح
                          </div>
                          <div className="text-sm font-bold text-slate-900 mt-0.5">
                            {newlyGeneratedSession.candidateName}
                          </div>
                          <div className="text-xs text-slate-600 mt-0.5">
                            إجمالي الأسئلة:{' '}
                            <span className="font-mono-tabular font-bold">
                              {newlyGeneratedSession.questions.length}
                            </span>{' '}
                            سؤالاً ({(newlyGeneratedSession.assignedCategories || []).join(' + ')})
                          </div>
                        </div>

                        <div className="bg-white border border-[#7c2529]/30 rounded-xl px-3.5 py-2 text-center">
                          <div className="text-[11px] text-slate-500">رمز الدخول (OTP)</div>
                          <div className="text-lg font-mono-tabular font-bold text-[#7c2529]">
                            {newlyGeneratedSession.otpCode}
                          </div>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-2.5 pt-2">
                        <button
                          type="button"
                          onClick={() =>
                            handleCopyText(
                              buildDirectCandidateUrl(newlyGeneratedSession),
                              newlyGeneratedSession.id
                            )
                          }
                          className="flex-1 py-2.5 px-4 bg-[#7c2529] hover:bg-[#631d20] text-white text-xs font-bold rounded-xl flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                        >
                          {copiedId === newlyGeneratedSession.id ? (
                            <>
                              <Check className="w-3.5 h-3.5 text-[#ffc72c]" />
                              <span>تم نسخ رابط الاختبار المباشر للمتقدم</span>
                            </>
                          ) : (
                            <>
                              <Copy className="w-3.5 h-3.5 text-[#ffc72c]" />
                              <span>نسخ رابط الاختبار المباشر لهذا المتقدم</span>
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                {/* Left Column (7 cols): Active Queue with Pause / Stop Controls (#3) */}
                <div className="lg:col-span-7 space-y-6">
                  <div className="bg-white border border-slate-200 rounded-2xl p-6 space-y-4 shadow-xs">
                    <div className="flex items-center justify-between">
                      <div>
                        <h2 className="text-base font-bold text-[#7c2529]">
                          قائمة انتظار المتقدمين والتحكم المباشر بالجلسات (إيقاف / استئناف)
                        </h2>
                        <p className="text-xs text-slate-500 mt-0.5">
                          يمكنك إيقاف جلسة أي مختبر مؤقتاً أو إنهاؤها فوراً من لوحة التحكم
                        </p>
                      </div>
                      <span className="font-mono-tabular text-xs font-bold text-[#7c2529] bg-[#FAF8F7] px-3 py-1 rounded-lg border border-slate-200">
                        {pendingSessions.length} جلسة نشطة
                      </span>
                    </div>

                    {pendingSessions.length === 0 ? (
                      <div className="p-8 text-center bg-[#FAF8F7] border border-slate-200 rounded-xl text-xs text-slate-500">
                        لا توجد جلسات في قائمة الانتظار حالياً. قم بتسجيل متقدم جديد لتوليد رمز ورابط اختبار مستقل.
                      </div>
                    ) : (
                      <div className="divide-y divide-slate-200 border border-slate-200 rounded-xl overflow-hidden">
                        {pendingSessions.map((sess) => {
                          const assignedCats =
                            sess.assignedCategories && sess.assignedCategories.length > 0
                              ? sess.assignedCategories
                              : ['IQ', 'ENGLISH'];
                          const isPaused = sess.status === 'paused';

                          return (
                            <div
                              key={sess.id}
                              className={`p-4 flex flex-wrap items-center justify-between gap-4 transition-colors ${
                                isPaused
                                  ? 'bg-amber-50/70'
                                  : 'bg-white hover:bg-slate-50/80'
                              }`}
                            >
                              <div>
                                <div className="flex items-center gap-2">
                                  <span className="font-bold text-sm text-slate-900">
                                    {sess.candidateName}
                                  </span>
                                  {isPaused && (
                                    <span className="px-2 py-0.5 bg-amber-200 text-amber-900 text-[11px] font-bold rounded-md">
                                      موقوفة مؤقتاً
                                    </span>
                                  )}
                                </div>
                                <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 mt-1">
                                  <span className="font-mono-tabular">هوية: {sess.nationalId}</span>
                                  {assignedCats.map((catId) => {
                                    const st = sess.sectionStatus?.[catId] || 'not_started';
                                    return (
                                      <React.Fragment key={catId}>
                                        <span aria-hidden="true">·</span>
                                        <span>
                                          {catId}:{' '}
                                          <strong
                                            className={
                                              st === 'completed'
                                                ? 'text-emerald-700'
                                                : 'text-slate-700'
                                            }
                                          >
                                            {st === 'completed' ? 'مجمّد/مكتمل' : 'متاح'}
                                          </strong>
                                        </span>
                                      </React.Fragment>
                                    );
                                  })}
                                </div>
                              </div>

                              <div className="flex flex-wrap items-center gap-2">
                                <span className="font-mono-tabular font-bold text-sm text-[#7c2529] bg-[#FAF8F7] px-3 py-1.5 rounded-lg border border-slate-200">
                                  {sess.otpCode}
                                </span>

                                <button
                                  type="button"
                                  onClick={() =>
                                    handleCopyText(buildDirectCandidateUrl(sess), sess.id)
                                  }
                                  className="px-3 py-1.5 bg-[#7c2529] hover:bg-[#631d20] text-white text-xs font-bold rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer"
                                >
                                  {copiedId === sess.id ? (
                                    <>
                                      <Check className="w-3.5 h-3.5 text-[#ffc72c]" />
                                      <span>تم نسخ الرابط</span>
                                    </>
                                  ) : (
                                    <>
                                      <Copy className="w-3.5 h-3.5 text-[#ffc72c]" />
                                      <span>نسخ الرابط</span>
                                    </>
                                  )}
                                </button>

                                {/* Pause / Resume Session Button (#3) */}
                                {(hasPermission('delete_sessions') ||
                                  hasPermission('create_sessions')) && (
                                  <>
                                    <button
                                      type="button"
                                      onClick={() => handleTogglePauseSession(sess.id)}
                                      className={`px-3 py-1.5 text-xs font-bold rounded-lg flex items-center gap-1 border transition-colors cursor-pointer ${
                                        isPaused
                                          ? 'bg-emerald-600 hover:bg-emerald-700 text-white border-emerald-600'
                                          : 'bg-amber-50 hover:bg-amber-100 text-amber-800 border-amber-300'
                                      }`}
                                      title={
                                        isPaused
                                          ? 'استئناف جلسة المختبر'
                                          : 'إيقاف جلسة المختبر مؤقتاً'
                                      }
                                    >
                                      {isPaused ? (
                                        <>
                                          <PlayCircle className="w-3.5 h-3.5" />
                                          <span>استئناف</span>
                                        </>
                                      ) : (
                                        <>
                                          <PauseCircle className="w-3.5 h-3.5" />
                                          <span>إيقاف مؤقت</span>
                                        </>
                                      )}
                                    </button>

                                    <button
                                      type="button"
                                      onClick={() => handleTerminateSession(sess.id)}
                                      className="px-2.5 py-1.5 bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 text-xs font-bold rounded-lg flex items-center gap-1 transition-colors cursor-pointer"
                                      title="إنهاء وإغلاق جلسة المختبر فوراً وتقييم الإجابات الحالية"
                                    >
                                      <StopCircle className="w-3.5 h-3.5" />
                                      <span>إنهاء الجلسة</span>
                                    </button>
                                  </>
                                )}

                                {hasPermission('delete_sessions') && (
                                  <button
                                    type="button"
                                    onClick={() => handleDeleteSession(sess.id)}
                                    className="p-1.5 text-slate-400 hover:text-red-600 rounded-md transition-colors cursor-pointer"
                                    title="حذف الجلسة نهائياً"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </button>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* Recent Completed Sessions Quick Table */}
                  <div className="bg-white border border-slate-200 rounded-2xl p-6 space-y-4 shadow-xs">
                    <div className="flex items-center justify-between">
                      <div>
                        <h2 className="text-base font-bold text-[#7c2529]">
                          أحدث الاختبارات المكتملة وتقارير التقييم
                        </h2>
                        <p className="text-xs text-slate-500 mt-0.5">
                          النتائج سرية وتظهر فقط للمستخدمين المخولين في لوحة التحكم
                        </p>
                      </div>
                      {hasPermission('view_analytics') && (
                        <button
                          type="button"
                          onClick={() => setActiveTab('ANALYTICS')}
                          className="text-xs font-bold text-[#7c2529] hover:underline cursor-pointer"
                        >
                          عرض الرسوم البيانية والسجل الكامل
                        </button>
                      )}
                    </div>

                    <div className="border border-slate-200 rounded-xl overflow-hidden">
                      <table className="w-full text-right text-xs">
                        <thead className="bg-[#FAF8F7] border-b border-slate-200 text-slate-600">
                          <tr>
                            <th className="py-3 px-4 font-semibold">اسم المتقدم ورمز الجلسة</th>
                            <th className="py-3 px-4 font-semibold text-left">IQ</th>
                            <th className="py-3 px-4 font-semibold text-left">English</th>
                            <th className="py-3 px-4 font-semibold text-left">الدرجة الكلية</th>
                            <th className="py-3 px-4 font-semibold">النتيجة</th>
                            <th className="py-3 px-4 font-semibold text-left">التقرير</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-200">
                          {completedSessions.slice(0, 5).map((sess) => {
                            const ev = sess.evaluation!;
                            return (
                              <tr key={sess.id} className="hover:bg-slate-50/70">
                                <td className="py-3 px-4">
                                  <div className="font-bold text-slate-900 text-sm">
                                    {sess.candidateName}
                                  </div>
                                  <div className="text-slate-500 mt-0.5 font-mono-tabular">
                                    {sess.otpCode} · هوية: {sess.nationalId}
                                  </div>
                                </td>
                                <td className="py-3 px-4 text-left font-mono-tabular font-semibold text-slate-800">
                                  {ev.iqScore}%
                                </td>
                                <td className="py-3 px-4 text-left font-mono-tabular font-semibold text-slate-800">
                                  {ev.englishScore}%
                                </td>
                                <td className="py-3 px-4 text-left font-mono-tabular font-bold text-[#7c2529] text-sm">
                                  {ev.weightedTotalScore}%
                                </td>
                                <td className="py-3 px-4">
                                  {ev.passed ? (
                                    <span className="font-bold text-emerald-800 flex items-center gap-1">
                                      <CheckCircle2 className="w-3.5 h-3.5" />
                                      <span>مجتاز</span>
                                    </span>
                                  ) : (
                                    <span className="font-bold text-red-700 flex items-center gap-1">
                                      <XCircle className="w-3.5 h-3.5" />
                                      <span>غير مجتاز</span>
                                    </span>
                                  )}
                                </td>
                                <td className="py-3 px-4 text-left">
                                  {hasPermission('print_export_reports') ? (
                                    <button
                                      type="button"
                                      onClick={() => setSelectedReportSessionId(sess.id)}
                                      className="px-3 py-1.5 bg-[#7c2529] hover:bg-[#631d20] text-white font-bold rounded-lg transition-colors inline-flex items-center gap-1 cursor-pointer"
                                    >
                                      <FileText className="w-3.5 h-3.5 text-[#ffc72c]" />
                                      <span>التقرير</span>
                                    </button>
                                  ) : (
                                    <span className="text-[11px] text-slate-400">غير مخول</span>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* TAB 2: ANALYTICS CHARTS & CANDIDATE COMPARISON */}
            {activeTab === 'ANALYTICS' && (
              <div className="space-y-6">
                <AnalyticsCharts completedSessions={completedSessions} />

                <div className="bg-white border border-slate-200 rounded-2xl p-4 flex flex-wrap items-center justify-between gap-4 shadow-xs">
                  <div className="flex flex-wrap items-center gap-3">
                    <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-xl">
                      <button
                        type="button"
                        onClick={() => setAnalyticsStatusFilter('ALL')}
                        className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                          analyticsStatusFilter === 'ALL'
                            ? 'bg-[#7c2529] text-white'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        الكل ({completedSessions.length})
                      </button>
                      <button
                        type="button"
                        onClick={() => setAnalyticsStatusFilter('PASSED')}
                        className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                          analyticsStatusFilter === 'PASSED'
                            ? 'bg-[#7c2529] text-white'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        المجتازون ({passedCount})
                      </button>
                      <button
                        type="button"
                        onClick={() => setAnalyticsStatusFilter('FAILED')}
                        className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                          analyticsStatusFilter === 'FAILED'
                            ? 'bg-[#7c2529] text-white'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        غير المجتازين ({completedSessions.length - passedCount})
                      </button>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-3">
                    <div className="relative w-full sm:w-64">
                      <Search className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2" />
                      <input
                        type="text"
                        value={analyticsSearch}
                        onChange={(e) => setAnalyticsSearch(e.target.value)}
                        placeholder="بحث بالاسم أو الرقم الوطني..."
                        className="w-full pr-9 pl-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-[#7c2529]"
                      />
                    </div>

                    {hasPermission('print_export_reports') && (
                      <button
                        type="button"
                        onClick={() => exportResultsToCsv(sessions)}
                        className="px-4 py-2 bg-[#7c2529] hover:bg-[#631d20] text-white text-xs font-bold rounded-xl flex items-center gap-1.5 transition-colors cursor-pointer"
                      >
                        <Download className="w-4 h-4 text-[#ffc72c]" />
                        <span>تصدير النتائج (Excel .xlsx)</span>
                      </button>
                    )}
                  </div>
                </div>

                <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-xs">
                  <div className="overflow-x-auto">
                    <table className="w-full text-right text-sm">
                      <thead className="bg-[#FAF8F7] border-b border-slate-200 text-xs text-slate-600">
                        <tr>
                          <th className="py-3.5 px-4 font-semibold">اسم المتقدم والبيانات</th>
                          <th className="py-3.5 px-4 font-semibold text-left">تاريخ الاختبار</th>
                          <th className="py-3.5 px-4 font-semibold text-left">درجة IQ</th>
                          <th className="py-3.5 px-4 font-semibold text-left">درجة الإنجليزية</th>
                          <th className="py-3.5 px-4 font-semibold text-left">الدرجة الموزونة</th>
                          <th className="py-3.5 px-4 font-semibold text-left">سرعة الإجابة</th>
                          <th className="py-3.5 px-4 font-semibold text-left">مؤشر النزاهة</th>
                          <th className="py-3.5 px-4 font-semibold">التوصية والقرار</th>
                          <th className="py-3.5 px-4 font-semibold text-left">التقرير التفصيلي</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200">
                        {filteredCompletedSessions.map((sess) => {
                          const ev = sess.evaluation!;
                          return (
                            <tr key={sess.id} className="hover:bg-slate-50/80">
                              <td className="py-3.5 px-4">
                                <div className="font-bold text-slate-900">{sess.candidateName}</div>
                                <div className="flex items-center gap-2 text-xs text-slate-500 mt-0.5 font-mono-tabular">
                                  <span>{sess.otpCode}</span>
                                  <span aria-hidden="true">·</span>
                                  <span>هوية: {sess.nationalId}</span>
                                </div>
                              </td>

                              <td className="py-3.5 px-4 text-left font-mono-tabular text-xs text-slate-600">
                                {new Date(sess.createdAt).toLocaleDateString('ar-YE')}
                              </td>

                              <td className="py-3.5 px-4 text-left font-mono-tabular font-semibold text-slate-800">
                                {ev.iqScore}%
                              </td>

                              <td className="py-3.5 px-4 text-left font-mono-tabular font-semibold text-slate-800">
                                {ev.englishScore}%
                              </td>

                              <td className="py-3.5 px-4 text-left font-mono-tabular font-bold text-base text-[#7c2529]">
                                {ev.weightedTotalScore}%
                              </td>

                              <td className="py-3.5 px-4 text-left font-mono-tabular text-xs text-slate-600">
                                <span className="inline-flex items-center gap-1">
                                  <Clock className="w-3.5 h-3.5 text-slate-400" />
                                  {ev.avgQuestionTimeSeconds} ث / سؤال
                                </span>
                              </td>

                              <td className="py-3.5 px-4 text-left font-mono-tabular text-xs">
                                {sess.securityLogs.length === 0 ? (
                                  <span className="font-semibold text-emerald-800">100% سليم</span>
                                ) : (
                                  <span className="font-semibold text-amber-700 inline-flex items-center gap-1">
                                    <ShieldAlert className="w-3.5 h-3.5" />
                                    {ev.integrityScore}% ({sess.securityLogs.length} تنبيه)
                                  </span>
                                )}
                              </td>

                              <td className="py-3.5 px-4 text-xs">
                                {ev.recommendation === 'STRONGLY_RECOMMENDED' && (
                                  <span className="font-bold text-[#7c2529] flex items-center gap-1">
                                    <CheckCircle2 className="w-4 h-4" />
                                    <span>موصى به بشدة</span>
                                  </span>
                                )}
                                {ev.recommendation === 'QUALIFIED_FOR_INTERVIEW' && (
                                  <span className="font-bold text-emerald-700 flex items-center gap-1">
                                    <CheckCircle2 className="w-4 h-4" />
                                    <span>مؤهل للمقابلة</span>
                                  </span>
                                )}
                                {ev.recommendation === 'BORDERLINE_REVIEW' && (
                                  <span className="font-bold text-amber-700 flex items-center gap-1">
                                    <span>مراجعة حدية</span>
                                  </span>
                                )}
                                {ev.recommendation === 'NOT_QUALIFIED' && (
                                  <span className="font-bold text-red-700 flex items-center gap-1">
                                    <XCircle className="w-4 h-4" />
                                    <span>غير مجتاز</span>
                                  </span>
                                )}
                              </td>

                              <td className="py-3.5 px-4 text-left">
                                {hasPermission('print_export_reports') ? (
                                  <button
                                    type="button"
                                    onClick={() => setSelectedReportSessionId(sess.id)}
                                    className="px-3.5 py-2 bg-[#7c2529] hover:bg-[#631d20] text-white text-xs font-bold rounded-xl transition-colors inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
                                  >
                                    <FileText className="w-3.5 h-3.5 text-[#ffc72c]" />
                                    <span>عرض وطباعة التقرير</span>
                                  </button>
                                ) : (
                                  <span className="text-xs text-slate-400">عرض مقيد</span>
                                )}
                              </td>
                            </tr>
                          );
                        })}

                        {filteredCompletedSessions.length === 0 && (
                          <tr>
                            <td colSpan={9} className="py-10 text-center text-sm text-slate-500">
                              لا توجد نتائج مطابقة لمرشحات البحث الحالية.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

            {/* TAB 3: LOCAL QUESTION BANK MANAGER */}
            {activeTab === 'QUESTION_BANK' && (
              <QuestionBankManager
                questions={questions}
                sections={effectiveSections}
                canEdit={hasPermission('edit_questions')}
                canImportExport={hasPermission('import_export_questions')}
                onSaveQuestion={handleSaveQuestion}
                onDeleteQuestion={handleDeleteQuestion}
                onBulkDeleteQuestions={handleBulkDeleteQuestions}
                onBulkChangeCategory={handleBulkChangeCategory}
                onImportQuestions={handleImportQuestions}
              />
            )}

            {/* TAB 4: UNIFIED ASSESSMENT WEIGHTS & SETTINGS */}
            {activeTab === 'JOB_SETTINGS' && (
              <JobProfilesSettings
                standardConfig={standardConfig}
                canEdit={hasPermission('edit_settings')}
                onUpdateConfig={handleUpdateStandardConfig}
                onResetDefaults={handleResetConfigDefaults}
              />
            )}

            {/* TAB 5: HR & EXECUTIVE USER ACCESS MANAGEMENT */}
            {activeTab === 'USERS' && (
              <UserAccessManager
                users={users}
                currentUser={currentUser}
                canManageUsers={hasPermission('manage_users')}
                onSaveUser={handleSaveUser}
                onDeleteUser={handleDeleteUser}
              />
            )}
          </>
        )}
      </main>

      {/* Institutional Footer */}
      <footer className="no-print bg-white border-t border-slate-200 px-6 md:px-10 py-4 text-xs text-slate-500 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <img
            src={KIB_BRAND.logoColoredOnWhite}
            alt="KIB"
            referrerPolicy="no-referrer"
            className="h-7 w-auto object-contain"
          />
          <span>بنك الكريمي الإسلامي — قطاع الموارد البشرية والتطوير المؤسسي</span>
        </div>
        <div className="flex items-center gap-2">
          <Users className="w-3.5 h-3.5 text-[#7c2529]" />
          <span>المستخدم الحالي: {currentUser.fullName}</span>
        </div>
      </footer>
    </div>
  );
}

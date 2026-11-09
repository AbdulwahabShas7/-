import React, { useState, useEffect, useRef } from 'react';
import {
  ShieldCheck,
  Clock,
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Maximize2,
  CheckCircle2,
  KeyRound,
  UserCheck,
  FileCheck,
  Lock,
  Brain,
  Languages,
  Bookmark,
  Layers,
  PauseCircle,
  XOctagon,
} from 'lucide-react';
import {
  AssessmentCategory,
  AssessmentSectionConfig,
  CandidateSession,
  getSubSkillInfo,
  KIB_BRAND,
  SecurityEvent,
} from '../types/assessment';
import { isQuestionAnswered } from '../utils/assessmentEngine';

interface CandidateKioskProps {
  sessions: CandidateSession[];
  sections: AssessmentSectionConfig[];
  preselectedOtp?: string;
  preselectedName?: string;
  preselectedNationalId?: string;
  onCreateEmergencySessionFromOtp: (
    otpCode: string,
    candidateName?: string,
    nationalId?: string
  ) => CandidateSession;
  onUpdateCandidateIdentity?: (
    sessionId: string,
    candidateName: string,
    nationalId: string
  ) => void;
  onStartSection: (sessionId: string, category: AssessmentCategory) => void;
  onAnswerQuestion: (
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
  ) => void;
  onToggleFlagQuestion?: (
    sessionId: string,
    questionIndex: number,
    explicitFlagged?: boolean
  ) => void;
  isRealtimeConnected?: boolean;
  onCompleteSection: (sessionId: string, category: AssessmentCategory) => void;
  onLogSecurityEvent: (
    sessionId: string,
    event: Omit<SecurityEvent, 'id' | 'timestamp'>
  ) => void;
}

function normalizeOtpCode(raw: string): string {
  const arabicDigits = '٠١٢٣٤٥٦٧٨٩';
  const converted = raw
    .replace(/[٠-٩]/g, (d) => String(arabicDigits.indexOf(d)))
    .replace(/[\s_]+/g, '')
    .toUpperCase();

  if (/^\d{3,6}$/.test(converted)) {
    return `KIB-${converted}`;
  }
  if (/^KIB\d{3,6}$/.test(converted)) {
    return `KIB-${converted.slice(3)}`;
  }
  return converted;
}

export const CandidateKiosk: React.FC<CandidateKioskProps> = ({
  sessions,
  sections,
  preselectedOtp,
  preselectedName,
  preselectedNationalId,
  onCreateEmergencySessionFromOtp,
  onUpdateCandidateIdentity,
  onStartSection,
  onAnswerQuestion,
  onToggleFlagQuestion,
  isRealtimeConnected,
  onCompleteSection,
  onLogSecurityEvent,
}) => {
  const [otpInput, setOtpInput] = useState(preselectedOtp || '');
  const [otpError, setOtpError] = useState('');
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [kioskStage, setKioskStage] = useState<
    'OTP_GATE' | 'SECTION_HUB' | 'ACTIVE_EXAM' | 'COMPLETED'
  >('OTP_GATE');
  const [activeCategory, setActiveCategory] = useState<AssessmentCategory | null>(null);

  // Optional inline identity editor on SECTION_HUB
  const [editingIdentity, setEditingIdentity] = useState(false);
  const [quickName, setQuickName] = useState('');
  const [quickNationalId, setQuickNationalId] = useState('');

  // Index within activeSession.questions
  const [currentGlobalQuestionIndex, setCurrentGlobalQuestionIndex] = useState<number>(0);

  // Filter in Question Navigator: 'ALL' | 'UNANSWERED_OR_FLAGGED'
  const [navFilter, setNavFilter] = useState<'ALL' | 'UNANSWERED_OR_FLAGGED'>('ALL');
  const [showSubmitConfirmModal, setShowSubmitConfirmModal] = useState(false);

  // Exam choice, flag & timer states
  const [selectedChoice, setSelectedChoice] = useState<number | null>(null);
  const [selectedMultiChoices, setSelectedMultiChoices] = useState<number[]>([]);
  const [isCurrentFlagged, setIsCurrentFlagged] = useState<boolean>(false);
  const [questionSecondsLeft, setQuestionSecondsLeft] = useState<number>(45);
  const [questionElapsed, setQuestionElapsed] = useState<number>(0);
  const [sectionRemaining, setSectionRemaining] = useState<Record<string, number>>({
    IQ: 1500,
    ENGLISH: 1200,
  });

  // Security warning banner
  const [securityWarning, setSecurityWarning] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (preselectedOtp) {
      setOtpInput(preselectedOtp);
    }
  }, [preselectedOtp]);

  const activeSession = sessions.find((s) => s.id === activeSessionId) || null;

  // Determine which test sections are assigned to this candidate (#7)
  const sessionCategories = React.useMemo(() => {
    if (!activeSession) return sections;
    const catsInQuestions = Array.from(
      new Set(activeSession.questions.map((q) => q.category))
    );
    const assigned =
      activeSession.assignedCategories && activeSession.assignedCategories.length > 0
        ? activeSession.assignedCategories
        : catsInQuestions.length > 0
        ? catsInQuestions
        : sections.map((s) => s.id);

    return assigned.map((catId) => {
      const found = sections.find((s) => s.id === catId);
      if (found) return found;
      return {
        id: catId,
        titleAr:
          catId === 'IQ'
            ? 'اختبار القدرات الذهنية والذكاء (IQ)'
            : catId === 'ENGLISH'
            ? 'اختبار أساسيات اللغة الإنجليزية (English)'
            : catId,
        titleEn: catId,
        descriptionAr: 'اختبار تقييم معياري للمتقدمين الجدد.',
        direction: catId === 'ENGLISH' ? ('ltr' as const) : ('rtl' as const),
        weight: 50,
        totalQuestions: activeSession.questions.filter((q) => q.category === catId).length,
        counts: { easy: 10, medium: 10, hard: 10 },
        timeLimitMinutes: 20,
        enabledByDefault: true,
      };
    });
  }, [activeSession, sections]);

  // Compute indices for the currently chosen category
  const categoryQuestionIndices =
    activeSession && activeCategory
      ? activeSession.questions
          .map((q, idx) => (q.category === activeCategory ? idx : -1))
          .filter((idx) => idx !== -1)
      : [];

  const currentQuestion =
    activeSession &&
    currentGlobalQuestionIndex >= 0 &&
    currentGlobalQuestionIndex < activeSession.questions.length
      ? activeSession.questions[currentGlobalQuestionIndex]
      : null;

  const positionInCategory = categoryQuestionIndices.indexOf(currentGlobalQuestionIndex);

  // Sync local choice & flag state whenever currentGlobalQuestionIndex changes
  const loadQuestionIntoView = (globalIdx: number, sess: CandidateSession) => {
    const q = sess.questions[globalIdx];
    if (!q) return;
    setCurrentGlobalQuestionIndex(globalIdx);
    setSelectedChoice(q.selectedOptionIndex);
    setSelectedMultiChoices(
      q.selectedOptionIndices && q.selectedOptionIndices.length > 0
        ? q.selectedOptionIndices
        : q.selectedOptionIndex !== null
        ? [q.selectedOptionIndex]
        : []
    );
    setIsCurrentFlagged(Boolean(q.flagged));
    const remainingTime = Math.max(5, q.timeLimitSeconds - (q.timeSpentSeconds || 0));
    setQuestionSecondsLeft(remainingTime);
    setQuestionElapsed(0);
  };

  // Keep isCurrentFlagged in sync if session updates externally
  useEffect(() => {
    if (currentQuestion) {
      setIsCurrentFlagged(Boolean(currentQuestion.flagged));
    }
  }, [currentGlobalQuestionIndex, currentQuestion?.flagged]);

  // Persist current question's answer/time/flag before jumping to another question (#1 & #2)
  const saveCurrentQuestionProgress = (
    timedOut: boolean = false,
    overrideFlagged?: boolean
  ) => {
    if (!activeSession || !currentQuestion) return;
    const isMulti = currentQuestion.selectionType === 'multiple';
    const primaryChoice = isMulti
      ? selectedMultiChoices.length > 0
        ? selectedMultiChoices[0]
        : null
      : selectedChoice;

    const totalSpent = (currentQuestion.timeSpentSeconds || 0) + questionElapsed;
    const effectiveFlagged =
      overrideFlagged !== undefined ? overrideFlagged : isCurrentFlagged;

    onAnswerQuestion(
      activeSession.id,
      currentGlobalQuestionIndex,
      primaryChoice,
      totalSpent,
      timedOut,
      sectionRemaining,
      {
        selectedOptionIndices: isMulti
          ? selectedMultiChoices
          : primaryChoice !== null
          ? [primaryChoice]
          : [],
        flagged: effectiveFlagged,
        advanceIndex: false,
      }
    );
  };

  // Verify OTP code
  const handleVerifyOtp = (e: React.FormEvent) => {
    e.preventDefault();
    setOtpError('');
    const cleanCode = normalizeOtpCode(otpInput);

    if (!cleanCode) {
      setOtpError('يرجى إدخال رمز الجلسة المسلّم لك من مسؤول الاختبارات.');
      return;
    }

    // Check live synced sessions first, then merge any local fallback sessions
    const combinedSessionsMap = new Map<string, CandidateSession>();
    for (const s of sessions) {
      combinedSessionsMap.set(s.id, s);
    }
    try {
      const rawStored = localStorage.getItem('kib_hr_sessions_v2');
      if (rawStored) {
        const parsedStored: CandidateSession[] = JSON.parse(rawStored);
        if (Array.isArray(parsedStored)) {
          for (const ls of parsedStored) {
            if (!combinedSessionsMap.has(ls.id)) {
              combinedSessionsMap.set(ls.id, ls);
            }
          }
        }
      }
    } catch {
      // Fallback
    }

    const latestSessions = Array.from(combinedSessionsMap.values());
    const matched = latestSessions.find(
      (s) => normalizeOtpCode(s.otpCode) === cleanCode
    );

    if (matched) {
      if (matched.status === 'terminated') {
        setOtpError('تم إيقاف وإنهاء هذه الجلسة من قِبل مشرف الموارد البشرية.');
        return;
      }
      if (matched.status === 'completed') {
        setOtpError('تم استخدام رمز الجلسة هذا مسبقاً وإتمام الاختبارات المرتبطة به.');
        return;
      }

      setActiveSessionId(matched.id);
      setSectionRemaining(matched.sectionRemainingSeconds || { IQ: 1500, ENGLISH: 1200 });
      setQuickName(matched.candidateName);
      setQuickNationalId(matched.nationalId);
      setKioskStage('SECTION_HUB');
      return;
    }

    const finalCode = cleanCode.startsWith('KIB-') ? cleanCode : `KIB-${cleanCode}`;
    const created = onCreateEmergencySessionFromOtp(
      finalCode,
      preselectedName || 'متقدم للاختبار المعياري',
      preselectedNationalId || 'مسجل برمز الجلسة'
    );
    setActiveSessionId(created.id);
    setSectionRemaining(created.sectionRemainingSeconds);
    setQuickName(created.candidateName);
    setQuickNationalId(created.nationalId);
    setEditingIdentity(!preselectedName);
    setKioskStage('SECTION_HUB');
  };

  // Start chosen section
  const handleSelectAndStartSection = async (category: AssessmentCategory) => {
    if (!activeSession) return;
    if (activeSession.status === 'paused' || activeSession.status === 'terminated') return;

    const status = activeSession.sectionStatus?.[category] || 'not_started';
    if (status === 'completed') return;

    const indices = activeSession.questions
      .map((q, idx) => (q.category === category ? idx : -1))
      .filter((idx) => idx !== -1);

    if (indices.length === 0) return;

    const firstUnanswered =
      indices.find((idx) => !isQuestionAnswered(activeSession.questions[idx])) ??
      indices[0];

    try {
      if (document.documentElement.requestFullscreen) {
        await document.documentElement.requestFullscreen();
      }
    } catch {
      // Ignore fullscreen block in iframe
    }

    onStartSection(activeSession.id, category);
    setActiveCategory(category);
    setNavFilter('ALL');
    setShowSubmitConfirmModal(false);
    loadQuestionIntoView(firstUnanswered, activeSession);
    setKioskStage('ACTIVE_EXAM');
  };

  // Navigate to a specific question index within the active category (#1 & #2)
  const handleJumpToQuestion = (targetGlobalIdx: number) => {
    if (!activeSession || targetGlobalIdx === currentGlobalQuestionIndex) return;
    saveCurrentQuestionProgress(false);
    loadQuestionIntoView(targetGlobalIdx, activeSession);
  };

  // Previous Question (#2)
  const handlePreviousQuestion = () => {
    if (!activeSession || positionInCategory <= 0) return;
    const prevGlobalIdx = categoryQuestionIndices[positionInCategory - 1];
    handleJumpToQuestion(prevGlobalIdx);
  };

  // Next Question (#2)
  const handleNextQuestion = (timedOut: boolean = false) => {
    if (!activeSession || !currentQuestion || !activeCategory) return;
    saveCurrentQuestionProgress(timedOut);

    const nextPos = positionInCategory + 1;
    if (nextPos < categoryQuestionIndices.length) {
      const nextGlobalIdx = categoryQuestionIndices[nextPos];
      loadQuestionIntoView(nextGlobalIdx, activeSession);
    } else {
      // On the last question, open confirmation or finish if timed out
      if (timedOut) {
        handleConfirmFinishSection();
      } else {
        setShowSubmitConfirmModal(true);
      }
    }
  };

  // Toggle flag/bookmark on current question (#1)
  const handleToggleFlagCurrent = () => {
    if (!activeSession || !currentQuestion) return;
    const nextFlagged = !isCurrentFlagged;
    setIsCurrentFlagged(nextFlagged);
    if (onToggleFlagQuestion) {
      onToggleFlagQuestion(
        activeSession.id,
        currentGlobalQuestionIndex,
        nextFlagged
      );
    }
  };

  // Finalize and freeze the current section
  const handleConfirmFinishSection = () => {
    if (!activeSession || !activeCategory) return;
    saveCurrentQuestionProgress(false);
    onCompleteSection(activeSession.id, activeCategory);
    setShowSubmitConfirmModal(false);

    const otherCategories = sessionCategories
      .map((s) => s.id)
      .filter((id) => id !== activeCategory);
    const allOthersCompleted = otherCategories.every(
      (id) => activeSession.sectionStatus?.[id] === 'completed'
    );

    setActiveCategory(null);
    setSelectedChoice(null);
    setSelectedMultiChoices([]);

    if (allOthersCompleted) {
      if (document.fullscreenElement && document.exitFullscreen) {
        document.exitFullscreen().catch(() => {});
      }
      setKioskStage('COMPLETED');
    } else {
      setKioskStage('SECTION_HUB');
    }
  };

  // Dual Timer Effect — Pauses automatically if HR Admin pauses the session (#3)
  useEffect(() => {
    if (
      kioskStage !== 'ACTIVE_EXAM' ||
      !activeSession ||
      !currentQuestion ||
      !activeCategory ||
      activeSession.status === 'paused' ||
      activeSession.status === 'terminated'
    ) {
      return;
    }

    const timer = setInterval(() => {
      setQuestionElapsed((prev) => prev + 1);
      setQuestionSecondsLeft((prev) => {
        if (prev <= 1) return 0;
        return prev - 1;
      });

      setSectionRemaining((prev) => {
        const currentSec = prev[activeCategory] ?? 1200;
        return {
          ...prev,
          [activeCategory]: Math.max(0, currentSec - 1),
        };
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [
    kioskStage,
    activeSession?.id,
    activeSession?.status,
    currentGlobalQuestionIndex,
    activeCategory,
  ]);

  // If section timer reaches 0, auto-complete the section
  useEffect(() => {
    if (
      kioskStage === 'ACTIVE_EXAM' &&
      activeCategory &&
      (sectionRemaining[activeCategory] ?? 1) <= 0
    ) {
      handleConfirmFinishSection();
    }
  }, [sectionRemaining, kioskStage, activeCategory]);

  // Security Event Listeners
  useEffect(() => {
    if (kioskStage !== 'ACTIVE_EXAM' || !activeSession) return;

    const qNum = positionInCategory + 1;

    const handleVisibilityChange = () => {
      if (document.hidden) {
        onLogSecurityEvent(activeSession.id, {
          type: 'TAB_SWITCH',
          description: `محاولة تبديل التبويب أو إخفاء شاشة الاختبار أثناء السؤال رقم ${qNum}`,
          questionIndex: currentGlobalQuestionIndex,
        });
        setSecurityWarning(
          'تم رصد محاولة الخروج من نافذة الاختبار وتوثيقها في سجل الجلسة لدى إدارة الموارد البشرية.'
        );
      }
    };

    const handleFullscreenChange = () => {
      if (!document.fullscreenElement) {
        onLogSecurityEvent(activeSession.id, {
          type: 'FULLSCREEN_EXIT',
          description: `الخروج من وضع ملء الشاشة الإلزامي أثناء السؤال رقم ${qNum}`,
          questionIndex: currentGlobalQuestionIndex,
        });
        setSecurityWarning(
          'تم رصد الخروج من وضع القفل الكامل للشاشة. يرجى البقاء داخل شاشة الاختبار.'
        );
      }
    };

    const handleCopy = (e: ClipboardEvent) => {
      e.preventDefault();
      onLogSecurityEvent(activeSession.id, {
        type: 'COPY_ATTEMPT',
        description: `محاولة نسخ نص السؤال رقم ${qNum}`,
        questionIndex: currentGlobalQuestionIndex,
      });
      setSecurityWarning('نسخ الأسئلة محظور أمنياً وتم تسجيل المحاولة في النظام.');
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('copy', handleCopy);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      document.removeEventListener('copy', handleCopy);
    };
  }, [kioskStage, activeSession?.id, currentGlobalQuestionIndex, positionInCategory]);

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  const pendingLocalSessions = sessions.filter(
    (s) => s.status !== 'completed' && s.status !== 'terminated'
  );

  // Statistics for the current active category (#1)
  const categoryQuestions = categoryQuestionIndices.map(
    (idx) => activeSession!.questions[idx]
  );
  const answeredInCategoryCount = categoryQuestions.filter((q, pos) => {
    if (pos === positionInCategory) {
      return q.selectionType === 'multiple'
        ? selectedMultiChoices.length > 0
        : selectedChoice !== null;
    }
    return isQuestionAnswered(q);
  }).length;
  const unansweredInCategoryCount =
    categoryQuestions.length - answeredInCategoryCount;
  const flaggedInCategoryCount = categoryQuestions.filter((q, pos) =>
    pos === positionInCategory ? isCurrentFlagged : Boolean(q.flagged)
  ).length;

  const activeSectionConfig = sections.find((s) => s.id === activeCategory);

  return (
    <div
      ref={containerRef}
      className="min-h-screen bg-[#FAF8F7] text-slate-900 flex flex-col select-none"
      onContextMenu={(e) => e.preventDefault()}
    >
      {/* Isolated Candidate Header — Colored Logo on Crisp White Surface */}
      <header className="bg-white border-b-4 border-[#7c2529] px-8 py-4 flex items-center justify-between gap-8 shadow-xs">
        <div className="flex items-center gap-4">
          <img
            src={KIB_BRAND.logoColoredOnWhite}
            alt="بنك الكريمي الإسلامي"
            referrerPolicy="no-referrer"
            className="h-11 w-auto object-contain shrink-0"
          />
          <div className="h-8 w-px bg-slate-200 hidden sm:block" />
          <div>
            <span className="text-lg font-bold tracking-tight text-[#7c2529] block">
              بوابة اختبارات القبول المعيارية
            </span>
            <span className="text-xs text-slate-500 font-medium">
              نظام التقييم الرقمي الموحد للمتقدمين الجدد
            </span>
          </div>
        </div>

        <div className="hidden md:flex items-center gap-4 text-xs text-slate-600">
          <span className="inline-flex items-center gap-1.5">
            <span
              className={`w-2 h-2 rounded-full ${
                isRealtimeConnected !== false ? 'bg-emerald-600' : 'bg-amber-500'
              }`}
            />
            <span>بيئة اختبار معزولة ومؤمّنة (مزامنة لحظية)</span>
          </span>
          {activeSession && (
            <>
              <span aria-hidden="true" className="text-[#7c2529]">
                ·
              </span>
              <span className="font-mono-tabular font-bold text-[#7c2529] bg-[#ffc72c]/25 border border-[#ffc72c] px-3 py-1 rounded-md">
                رمز الجلسة: {activeSession.otpCode}
              </span>
            </>
          )}
        </div>
      </header>

      {/* Main Candidate Kiosk Content */}
      <main className="flex-1 flex flex-col items-center justify-center p-6 md:p-10">
        {/* OVERLAY IF SESSION IS PAUSED OR TERMINATED BY HR ADMIN (#3) */}
        {activeSession &&
          (activeSession.status === 'paused' ||
            activeSession.status === 'terminated') && (
            <div className="w-full max-w-xl bg-white border-2 border-[#7c2529] rounded-2xl p-8 md:p-10 text-center space-y-6 shadow-xs">
              <div className="w-16 h-16 rounded-2xl bg-[#7c2529]/10 text-[#7c2529] flex items-center justify-center mx-auto">
                {activeSession.status === 'paused' ? (
                  <PauseCircle className="w-9 h-9 text-[#7c2529]" />
                ) : (
                  <XOctagon className="w-9 h-9 text-red-600" />
                )}
              </div>

              <div className="space-y-2">
                <h1 className="text-2xl font-bold text-[#7c2529]">
                  {activeSession.status === 'paused'
                    ? 'تم إيقاف جلسة الاختبار مؤقتاً من لوحة التحكم'
                    : 'تم إنهاء وإيقاف جلسة الاختبار من قِبل الإدارة'}
                </h1>
                <p className="text-sm text-slate-600 leading-relaxed">
                  {activeSession.status === 'paused'
                    ? 'قام مسؤول الموارد البشرية بإيقاف مؤقت لجلسة الاختبار الخاصة بك. تم حفظ جميع إجاباتك والوقت المتبقي، وسيتم فتح الشاشة تلقائياً فور استئناف الجلسة من المشرف.'
                    : 'قام مسؤول الموارد البشرية بإنهاء جلسة الاختبار وحفظ الإجابات المسجلة حتى هذه اللحظة. يرجى مراجعة مشرف القاعة.'}
                </p>
              </div>

              <div className="p-4 bg-[#FAF8F7] border border-slate-200 rounded-xl text-xs font-mono-tabular text-slate-700">
                المتقدم: <strong>{activeSession.candidateName}</strong> · رمز الجلسة:{' '}
                <strong className="text-[#7c2529]">{activeSession.otpCode}</strong>
              </div>

              {activeSession.status === 'terminated' && (
                <button
                  type="button"
                  onClick={() => {
                    setActiveSessionId(null);
                    setOtpInput('');
                    setKioskStage('OTP_GATE');
                  }}
                  className="px-6 py-3 bg-[#7c2529] text-white text-xs font-bold rounded-xl cursor-pointer"
                >
                  العودة لشاشة الدخول الرئيسية
                </button>
              )}
            </div>
          )}

        {/* STAGE 1: OTP GATE */}
        {(!activeSession ||
          (activeSession.status !== 'paused' &&
            activeSession.status !== 'terminated')) &&
          kioskStage === 'OTP_GATE' && (
            <div className="w-full max-w-xl bg-white border border-slate-200 rounded-2xl p-8 md:p-10 shadow-xs">
              <div className="flex items-center justify-between pb-6 mb-6 border-b border-slate-100">
                <div>
                  <h1 className="text-2xl font-bold text-[#7c2529]">
                    تسجيل دخول المتقدم للاختبار
                  </h1>
                  <p className="text-sm text-slate-600 mt-1">
                    أدخل رمز الجلسة لمرة واحدة (OTP) المسلّم لك من مسؤول الاختبارات
                  </p>
                </div>
                <div className="w-12 h-12 rounded-xl bg-[#7c2529]/10 text-[#7c2529] flex items-center justify-center shrink-0">
                  <KeyRound className="w-6 h-6" />
                </div>
              </div>

              <form onSubmit={handleVerifyOtp} className="space-y-6">
                <div>
                  <label className="block text-sm font-semibold text-slate-800 mb-2">
                    رمز جلسة الاختبار (Session Code)
                  </label>
                  <input
                    type="text"
                    dir="ltr"
                    value={otpInput}
                    onChange={(e) => {
                      setOtpInput(e.target.value.toUpperCase());
                      setOtpError('');
                    }}
                    placeholder="KIB-XXXX"
                    className="w-full px-4 py-4 text-center text-2xl font-mono-tabular font-bold tracking-widest bg-slate-50 border-2 border-slate-300 rounded-xl focus:outline-none focus:border-[#7c2529] focus:bg-white text-[#7c2529]"
                  />
                  {otpError && (
                    <p className="mt-2.5 text-xs font-medium text-red-600 flex items-center gap-1.5">
                      <AlertTriangle className="w-4 h-4 shrink-0" />
                      <span>{otpError}</span>
                    </p>
                  )}
                </div>

                <button
                  type="submit"
                  className="w-full py-4 px-6 bg-[#7c2529] hover:bg-[#631d20] text-white font-bold rounded-xl transition-colors flex items-center justify-center gap-2 shadow-xs cursor-pointer"
                >
                  <span>دخول إلى بوابة الاختبار</span>
                  <ArrowLeft className="w-4 h-4 text-[#ffc72c]" />
                </button>
              </form>

              {pendingLocalSessions.length > 0 && (
                <div className="mt-7 pt-5 border-t border-slate-100">
                  <div className="text-xs font-semibold text-slate-500 mb-2.5">
                    الجلسات النشطة المسجلة حالياً (اضغط لاختيار رمزك مباشرة):
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {pendingLocalSessions.map((s) => (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => {
                          setOtpInput(s.otpCode);
                          setOtpError('');
                        }}
                        className="p-3 rounded-xl border border-slate-200 hover:border-[#7c2529] bg-[#FAF8F7] hover:bg-[#7c2529]/5 text-right flex items-center justify-between transition-colors cursor-pointer"
                      >
                        <span className="text-xs font-bold text-slate-800 truncate max-w-[140px]">
                          {s.candidateName}
                        </span>
                        <span className="font-mono-tabular text-xs font-bold text-[#7c2529] bg-white px-2 py-1 rounded-md border border-slate-200">
                          {s.otpCode}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

        {/* STAGE 2: SECTION SELECTION HUB (DYNAMIC ASSIGNED SECTIONS WITH FREEZE ON COMPLETION #7) */}
        {activeSession &&
          activeSession.status !== 'paused' &&
          activeSession.status !== 'terminated' &&
          kioskStage === 'SECTION_HUB' && (
            <div className="w-full max-w-4xl bg-white border border-slate-200 rounded-2xl p-8 md:p-10 shadow-xs space-y-8">
              <div className="flex flex-wrap items-center justify-between gap-4 pb-6 border-b border-slate-200">
                <div>
                  <p className="text-xs font-bold text-[#7c2529]">
                    بوابة الاختبارات المعيارية — بنك الكريمي الإسلامي
                  </p>
                  <h1 className="text-2xl font-bold text-slate-900 mt-1">
                    مرحباً بك، {activeSession.candidateName}
                  </h1>
                  <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 mt-1.5">
                    <span className="font-mono-tabular">
                      رقم الهوية: {activeSession.nationalId}
                    </span>
                    <span aria-hidden="true">·</span>
                    <button
                      type="button"
                      onClick={() => {
                        setQuickName(activeSession.candidateName);
                        setQuickNationalId(activeSession.nationalId);
                        setEditingIdentity(!editingIdentity);
                      }}
                      className="text-[#7c2529] font-bold hover:underline cursor-pointer"
                    >
                      {editingIdentity ? 'إغلاق تعديل الاسم' : 'تحديث الاسم / رقم الهوية'}
                    </button>
                  </div>
                </div>

                <div className="text-left font-mono-tabular bg-[#FAF8F7] border border-slate-200 rounded-xl px-4 py-2.5">
                  <div className="text-xs text-slate-500">رمز الجلسة النشط</div>
                  <div className="text-base font-bold text-[#7c2529]">
                    {activeSession.otpCode}
                  </div>
                </div>
              </div>

              {editingIdentity && (
                <div className="p-5 bg-[#FAF8F7] border-2 border-[#7c2529]/25 rounded-xl flex flex-wrap items-end gap-4">
                  <div className="flex-1 min-w-[200px]">
                    <label className="block text-xs font-bold text-[#7c2529] mb-1">
                      اسم المتقدم الرباعي (للتقرير الرسمي)
                    </label>
                    <input
                      type="text"
                      value={quickName}
                      onChange={(e) => setQuickName(e.target.value)}
                      placeholder="أدخل اسمك الرباعي..."
                      className="w-full px-3.5 py-2 text-sm bg-white border border-slate-300 rounded-xl focus:outline-none focus:border-[#7c2529]"
                    />
                  </div>
                  <div className="w-full sm:w-52">
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      الرقم الوطني / رقم الهوية
                    </label>
                    <input
                      type="text"
                      dir="ltr"
                      value={quickNationalId}
                      onChange={(e) => setQuickNationalId(e.target.value)}
                      placeholder="010100XXXXX"
                      className="w-full px-3.5 py-2 text-sm font-mono-tabular bg-white border border-slate-300 rounded-xl focus:outline-none focus:border-[#7c2529]"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      if (onUpdateCandidateIdentity && quickName.trim()) {
                        onUpdateCandidateIdentity(
                          activeSession.id,
                          quickName.trim(),
                          quickNationalId.trim() || activeSession.nationalId
                        );
                      }
                      setEditingIdentity(false);
                    }}
                    className="px-5 py-2 bg-[#7c2529] hover:bg-[#631d20] text-white text-xs font-bold rounded-xl cursor-pointer"
                  >
                    حفظ البيانات
                  </button>
                </div>
              )}

              <div className="p-5 bg-[#FAF8F7] border border-slate-200 rounded-xl space-y-2 text-xs md:text-sm text-slate-700 leading-relaxed">
                <div className="font-bold text-[#7c2529] flex items-center gap-2 text-sm">
                  <ShieldCheck className="w-5 h-5 text-[#7c2529]" />
                  <span>تعليمات أداء الاختبارات والتنقل بين الأسئلة:</span>
                </div>
                <p>
                  • يمكنك البدء بأي من الاختبارات المخصصة لك أدناه؛ وعند إكمال أحد الأقسام واعتماده{' '}
                  <strong>يتجمد تلقائياً ويُغلق</strong> ويتاح لك القسم الآخر فقط.
                </p>
                <p>
                  • يمكنك داخل الاختبار <strong>الرجوع للخلف لأي سؤال سابق</strong>، أو{' '}
                  <strong>التعليم على الأسئلة التي لم تُجب عليها للمراجعة لاحقاً</strong> قبل اعتماد إنهاء القسم.
                </p>
              </div>

              {/* Dynamic Assigned Assessment Cards (#7) */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {sessionCategories.map((sec) => {
                  const secStatus = activeSession.sectionStatus?.[sec.id] || 'not_started';
                  const secQuestionCount = activeSession.questions.filter(
                    (q) => q.category === sec.id
                  ).length;
                  const secRemSeconds =
                    sectionRemaining[sec.id] ?? sec.timeLimitMinutes * 60;

                  const SecIcon =
                    sec.id === 'IQ'
                      ? Brain
                      : sec.id === 'ENGLISH'
                      ? Languages
                      : Layers;

                  return (
                    <div
                      key={sec.id}
                      className={`rounded-2xl border-2 p-6 flex flex-col justify-between transition-all ${
                        secStatus === 'completed'
                          ? 'bg-slate-100/80 border-slate-300 opacity-80'
                          : 'bg-white border-[#7c2529]/30 hover:border-[#7c2529]'
                      }`}
                    >
                      <div className="space-y-4">
                        <div className="flex items-center justify-between">
                          <div
                            className={`w-12 h-12 rounded-xl flex items-center justify-center ${
                              secStatus === 'completed'
                                ? 'bg-slate-200 text-slate-600'
                                : 'bg-[#7c2529] text-[#ffc72c]'
                            }`}
                          >
                            <SecIcon className="w-6 h-6" />
                          </div>
                          {secStatus === 'completed' ? (
                            <span className="text-xs font-bold text-slate-700 flex items-center gap-1.5 bg-slate-200 px-3 py-1 rounded-md">
                              <Lock className="w-3.5 h-3.5" />
                              <span>مكتمل ومجمّد</span>
                            </span>
                          ) : (
                            <span className="text-xs font-bold text-[#7c2529] bg-[#ffc72c]/25 px-3 py-1 rounded-md">
                              متاح للاختبار الآن
                            </span>
                          )}
                        </div>

                        <div>
                          <h2 className="text-xl font-bold text-slate-900">{sec.titleAr}</h2>
                          <p className="text-xs text-slate-600 mt-1.5 leading-relaxed">
                            {sec.descriptionAr}
                          </p>
                        </div>

                        <div className="flex items-center gap-4 pt-2 text-xs text-slate-600 font-mono-tabular">
                          <span>عدد الأسئلة: {secQuestionCount} سؤالاً</span>
                          <span aria-hidden="true">·</span>
                          <span>الزمن: {Math.round(secRemSeconds / 60)} دقيقة</span>
                        </div>
                      </div>

                      <div className="mt-6 pt-4 border-t border-slate-200">
                        {secStatus === 'completed' ? (
                          <button
                            type="button"
                            disabled
                            className="w-full py-3 px-4 bg-slate-200 text-slate-500 font-bold text-xs rounded-xl flex items-center justify-center gap-2 cursor-not-allowed"
                          >
                            <CheckCircle2 className="w-4 h-4 text-emerald-700" />
                            <span>تم إكمال هذا الاختبار وتجميده</span>
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => handleSelectAndStartSection(sec.id)}
                            className="w-full py-3.5 px-5 bg-[#7c2529] hover:bg-[#631d20] text-white font-bold text-sm rounded-xl transition-colors flex items-center justify-center gap-2 cursor-pointer"
                          >
                            <Maximize2 className="w-4 h-4 text-[#ffc72c]" />
                            <span>بدء {sec.titleAr}</span>
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

        {/* STAGE 3: ACTIVE EXAM ENGINE WITH BACK BUTTON (#2) & QUESTION FLAGGING/NAVIGATOR (#1) */}
        {activeSession &&
          activeSession.status !== 'paused' &&
          activeSession.status !== 'terminated' &&
          kioskStage === 'ACTIVE_EXAM' &&
          currentQuestion &&
          activeCategory && (
            <div className="w-full max-w-5xl space-y-5">
              {securityWarning && (
                <div className="bg-red-50 border border-red-300 text-red-900 px-5 py-3.5 rounded-xl flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3 text-xs md:text-sm font-semibold">
                    <AlertTriangle className="w-5 h-5 text-red-600 shrink-0" />
                    <span>{securityWarning}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setSecurityWarning(null);
                      if (
                        !document.fullscreenElement &&
                        document.documentElement.requestFullscreen
                      ) {
                        document.documentElement.requestFullscreen().catch(() => {});
                      }
                    }}
                    className="px-3.5 py-1.5 bg-[#7c2529] text-white text-xs font-semibold rounded-lg hover:bg-[#631d20] whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    تأكيد والعودة لملء الشاشة
                  </button>
                </div>
              )}

              {/* Exam Progress & Dual Timer Header */}
              <div className="bg-white border border-slate-200 rounded-2xl p-5 flex flex-wrap items-center justify-between gap-6 shadow-xs">
                <div>
                  <div className="flex items-center gap-2 text-xs text-slate-500">
                    <span className="font-bold text-[#7c2529]">
                      {activeSectionConfig?.titleAr || activeCategory}
                    </span>
                    <span aria-hidden="true">·</span>
                    <span>
                      {getSubSkillInfo(currentQuestion.subSkill, currentQuestion.category).ar}
                    </span>
                  </div>
                  <div className="flex items-center gap-4 mt-1">
                    <div className="text-lg font-bold text-slate-900">
                      السؤال{' '}
                      <span className="font-mono-tabular text-[#7c2529]">
                        {positionInCategory + 1}
                      </span>{' '}
                      من{' '}
                      <span className="font-mono-tabular">
                        {categoryQuestionIndices.length}
                      </span>
                    </div>

                    {/* Single Flag / Bookmark Button for Review Later */}
                    <button
                      type="button"
                      onClick={handleToggleFlagCurrent}
                      className={`px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 border-2 transition-all cursor-pointer ${
                        isCurrentFlagged
                          ? 'bg-[#ffc72c] text-[#7c2529] border-[#7c2529] shadow-xs'
                          : 'bg-[#FAF8F7] text-slate-700 border-slate-300 hover:border-[#7c2529] hover:text-[#7c2529]'
                      }`}
                    >
                      <Bookmark
                        className={`w-4 h-4 ${
                          isCurrentFlagged ? 'fill-[#7c2529] text-[#7c2529]' : ''
                        }`}
                      />
                      <span>
                        {isCurrentFlagged
                          ? 'تم تعليم السؤال للمراجعة (اضغط لإلغاء التعليم)'
                          : 'تعليم السؤال للرجوع إليه لاحقاً'}
                      </span>
                    </button>
                  </div>
                </div>

                {/* Dual Timers */}
                <div className="flex items-center gap-6">
                  <div className="text-right">
                    <div className="text-xs text-slate-500">الوقت المتبقي للقسم</div>
                    <div className="text-base font-mono-tabular font-bold text-slate-800 mt-0.5">
                      {formatTime(sectionRemaining[activeCategory] ?? 1200)}
                    </div>
                  </div>

                  <div
                    className={`px-4 py-2.5 rounded-xl border flex items-center gap-2.5 ${
                      questionSecondsLeft <= 10
                        ? 'bg-red-50 border-red-300 text-red-700'
                        : questionSecondsLeft <= 20
                        ? 'bg-[#ffc72c]/20 border-[#ffc72c] text-slate-900'
                        : 'bg-[#FAF8F7] border-slate-200 text-[#7c2529]'
                    }`}
                  >
                    <Clock className="w-5 h-5 shrink-0" />
                    <div>
                      <div className="text-[11px] opacity-80">الزمن المقترح للسؤال</div>
                      <div className="text-xl font-mono-tabular font-bold leading-none mt-0.5">
                        00:{String(questionSecondsLeft).padStart(2, '0')}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Interactive Question Navigator Panel (#1 & #2) */}
              <div className="bg-white border border-slate-200 rounded-2xl p-4 space-y-3 shadow-xs">
                <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
                  <div className="flex flex-wrap items-center gap-4">
                    <span className="font-bold text-slate-800">
                      شريط التنقل السريع ومراجعة الأسئلة:
                    </span>
                    <span className="inline-flex items-center gap-1.5 text-slate-600">
                      <span className="w-3 h-3 rounded-xs bg-emerald-600 inline-block" />
                      <span>مجاب ({answeredInCategoryCount})</span>
                    </span>
                    <span className="inline-flex items-center gap-1.5 text-slate-600">
                      <span className="w-3 h-3 rounded-xs bg-white border border-slate-400 inline-block" />
                      <span>غير مجاب ({unansweredInCategoryCount})</span>
                    </span>
                    <span className="inline-flex items-center gap-1.5 text-slate-600">
                      <span className="w-3 h-3 rounded-xs bg-[#ffc72c] border border-[#7c2529] inline-block" />
                      <span>معلّم للمراجعة ({flaggedInCategoryCount})</span>
                    </span>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => setNavFilter('ALL')}
                      className={`px-2.5 py-1 rounded-lg font-bold transition-colors cursor-pointer ${
                        navFilter === 'ALL'
                          ? 'bg-[#7c2529] text-white'
                          : 'bg-slate-100 text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      عرض كل الأسئلة ({categoryQuestionIndices.length})
                    </button>
                    <button
                      type="button"
                      onClick={() => setNavFilter('UNANSWERED_OR_FLAGGED')}
                      className={`px-2.5 py-1 rounded-lg font-bold transition-colors cursor-pointer ${
                        navFilter === 'UNANSWERED_OR_FLAGGED'
                          ? 'bg-[#ffc72c] text-[#7c2529]'
                          : 'bg-slate-100 text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      غير المجاب عليها والمعلّمة فقط (
                      {
                        categoryQuestions.filter((q, pos) => {
                          const ans =
                            pos === positionInCategory
                              ? q.selectionType === 'multiple'
                                ? selectedMultiChoices.length > 0
                                : selectedChoice !== null
                              : isQuestionAnswered(q);
                          const flg =
                            pos === positionInCategory
                              ? isCurrentFlagged
                              : Boolean(q.flagged);
                          return !ans || flg;
                        }).length
                      }
                      )
                    </button>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-1.5 pt-1 max-h-28 overflow-y-auto">
                  {categoryQuestionIndices.map((globalIdx, pos) => {
                    const q = activeSession.questions[globalIdx];
                    const isCurrent = pos === positionInCategory;
                    const isAnswered = isCurrent
                      ? q.selectionType === 'multiple'
                        ? selectedMultiChoices.length > 0
                        : selectedChoice !== null
                      : isQuestionAnswered(q);
                    const isFlagged = isCurrent
                      ? isCurrentFlagged
                      : Boolean(q.flagged);

                    if (
                      navFilter === 'UNANSWERED_OR_FLAGGED' &&
                      isAnswered &&
                      !isFlagged &&
                      !isCurrent
                    ) {
                      return null;
                    }

                    return (
                      <button
                        key={globalIdx}
                        type="button"
                        onClick={() => handleJumpToQuestion(globalIdx)}
                        className={`w-9 h-9 rounded-lg font-mono-tabular text-xs font-bold flex items-center justify-center border-2 transition-all cursor-pointer relative ${
                          isCurrent
                            ? isFlagged
                              ? 'ring-2 ring-[#7c2529] ring-offset-1 border-[#7c2529] bg-[#ffc72c] text-[#7c2529]'
                              : 'ring-2 ring-[#7c2529] ring-offset-1 border-[#7c2529] bg-[#7c2529] text-[#ffc72c]'
                            : isFlagged
                            ? 'bg-[#ffc72c] border-[#7c2529] text-[#7c2529]'
                            : isAnswered
                            ? 'bg-emerald-600 border-emerald-600 text-white'
                            : 'bg-[#FAF8F7] border-slate-300 text-slate-700 hover:border-[#7c2529]'
                        }`}
                        title={`انتقال إلى السؤال ${pos + 1}${
                          isFlagged ? ' (معلّم للمراجعة)' : ''
                        }${isAnswered ? ' (تمت الإجابة)' : ' (لم تتم الإجابة بعد)'}`}
                      >
                        <span>{pos + 1}</span>
                        {isFlagged && (
                          <span className="absolute -top-1 -left-1 w-3 h-3 rounded-full bg-[#7c2529] text-[#ffc72c] flex items-center justify-center">
                            <Bookmark className="w-2 h-2 fill-[#ffc72c]" />
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Question Card */}
              <div
                dir={
                  activeSectionConfig?.direction ||
                  (currentQuestion.category === 'ENGLISH' ? 'ltr' : 'rtl')
                }
                className="bg-white border border-slate-200 rounded-2xl p-8 md:p-10 space-y-6 shadow-xs"
              >
                {currentQuestion.contextPassage && (
                  <div className="p-5 bg-[#FAF8F7] border border-slate-200 rounded-xl text-sm leading-relaxed text-slate-800 whitespace-pre-line font-medium">
                    {currentQuestion.contextPassage}
                  </div>
                )}

                <div className="flex items-start justify-between gap-4">
                  <h2 className="text-xl md:text-2xl font-bold text-slate-900 leading-snug">
                    {currentQuestion.prompt}
                  </h2>
                  {currentQuestion.selectionType === 'multiple' && (
                    <span className="px-3 py-1 bg-[#ffc72c]/25 border border-[#ffc72c] text-[#7c2529] text-xs font-bold rounded-lg whitespace-nowrap shrink-0">
                      سؤال اختيار متعدد (اختر كل ما ينطبق)
                    </span>
                  )}
                </div>

                {currentQuestion.visualMatrix && currentQuestion.visualMatrix.length === 9 && (
                  <div className="max-w-xs mx-auto my-6 grid grid-cols-3 gap-3 p-4 bg-[#FAF8F7] border border-slate-200 rounded-xl">
                    {currentQuestion.visualMatrix.map((cell, idx) => (
                      <div
                        key={idx}
                        className={`h-20 rounded-lg border flex items-center justify-center text-2xl font-mono-tabular font-bold ${
                          cell === '؟'
                            ? 'bg-[#ffc72c]/25 border-[#7c2529] text-[#7c2529]'
                            : 'bg-white border-slate-200 text-slate-900'
                        }`}
                      >
                        {cell}
                      </div>
                    ))}
                  </div>
                )}

                {/* Options List (Supports both Single and Multiple Choice #8) */}
                <div className="grid grid-cols-1 gap-3.5 pt-2">
                  {currentQuestion.shuffledOptions.map((optionText, idx) => {
                    const isMulti = currentQuestion.selectionType === 'multiple';
                    const isSelected = isMulti
                      ? selectedMultiChoices.includes(idx)
                      : selectedChoice === idx;

                    const optionLetter =
                      currentQuestion.category === 'ENGLISH'
                        ? ['A', 'B', 'C', 'D'][idx]
                        : ['أ', 'ب', 'ج', 'د'][idx];

                    return (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => {
                          if (isMulti) {
                            setSelectedMultiChoices((prev) =>
                              prev.includes(idx)
                                ? prev.filter((i) => i !== idx)
                                : [...prev, idx].sort()
                            );
                          } else {
                            setSelectedChoice(idx);
                          }
                        }}
                        className={`w-full text-start p-4 rounded-xl border-2 transition-all flex items-center gap-4 cursor-pointer ${
                          isSelected
                            ? 'bg-[#7c2529]/5 border-[#7c2529] text-slate-900'
                            : 'bg-white border-slate-200 hover:border-slate-300 hover:bg-slate-50 text-slate-800'
                        }`}
                      >
                        <span
                          className={`w-9 h-9 rounded-lg font-bold text-sm flex items-center justify-center shrink-0 transition-colors ${
                            isSelected
                              ? 'bg-[#7c2529] text-[#ffc72c]'
                              : 'bg-slate-100 text-slate-700'
                          }`}
                        >
                          {optionLetter}
                        </span>
                        <span className="text-base font-semibold">{optionText}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Action Footer with Back Button (#2), Next, and Section Submit */}
              <div className="flex flex-wrap items-center justify-between gap-4 bg-white border border-slate-200 rounded-2xl px-6 py-4 shadow-xs">
                <div className="flex items-center gap-2.5">
                  {/* Back / Previous Question Button (#2) */}
                  <button
                    type="button"
                    disabled={positionInCategory <= 0}
                    onClick={handlePreviousQuestion}
                    className={`px-5 py-3 rounded-xl font-bold text-xs flex items-center gap-2 border transition-colors ${
                      positionInCategory > 0
                        ? 'bg-white border-slate-300 hover:border-[#7c2529] text-slate-800 cursor-pointer'
                        : 'bg-slate-100 border-slate-200 text-slate-400 cursor-not-allowed'
                    }`}
                  >
                    <ArrowRight className="w-4 h-4 text-[#7c2529]" />
                    <span>السؤال السابق</span>
                  </button>
                </div>

                <div className="flex items-center gap-2.5">
                  <button
                    type="button"
                    onClick={() => setShowSubmitConfirmModal(true)}
                    className="px-4 py-3 rounded-xl font-bold text-xs text-slate-700 hover:text-[#7c2529] border border-slate-300 hover:border-[#7c2529] transition-colors cursor-pointer"
                  >
                    مراجعة الملخص وإنهاء القسم
                  </button>

                  <button
                    type="button"
                    onClick={() => handleNextQuestion(false)}
                    className="px-7 py-3.5 rounded-xl font-bold text-sm bg-[#7c2529] hover:bg-[#631d20] text-white transition-colors flex items-center gap-2 cursor-pointer"
                  >
                    <span>
                      {positionInCategory + 1 === categoryQuestionIndices.length
                        ? 'مراجعة وإنهاء هذا القسم'
                        : 'حفظ والسؤال التالي'}
                    </span>
                    <ArrowLeft className="w-4 h-4 text-[#ffc72c]" />
                  </button>
                </div>
              </div>

              {/* Section Review & Confirm Submit Modal (#1) */}
              {showSubmitConfirmModal && (
                <div className="fixed inset-0 z-50 bg-slate-900/60 flex items-center justify-center p-4">
                  <div className="w-full max-w-lg bg-white border-2 border-[#7c2529] rounded-2xl p-6 md:p-8 space-y-6 shadow-xl">
                    <div className="space-y-1.5">
                      <h3 className="text-lg font-bold text-[#7c2529]">
                        تأكيد إنهاء واعتماد ({activeSectionConfig?.titleAr || activeCategory})
                      </h3>
                      <p className="text-xs text-slate-600">
                        يرجى مراجعة حالة إجاباتك قبل تجميد هذا القسم نهائياً:
                      </p>
                    </div>

                    <div className="grid grid-cols-3 gap-3 text-center">
                      <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl">
                        <div className="text-xl font-bold font-mono-tabular text-emerald-800">
                          {answeredInCategoryCount}
                        </div>
                        <div className="text-[11px] font-semibold text-emerald-700">
                          أسئلة مجاب عليها
                        </div>
                      </div>

                      <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl">
                        <div className="text-xl font-bold font-mono-tabular text-amber-800">
                          {unansweredInCategoryCount}
                        </div>
                        <div className="text-[11px] font-semibold text-amber-700">
                          غير مجاب عليها
                        </div>
                      </div>

                      <div className="p-3 bg-[#ffc72c]/20 border border-[#ffc72c] rounded-xl">
                        <div className="text-xl font-bold font-mono-tabular text-[#7c2529]">
                          {flaggedInCategoryCount}
                        </div>
                        <div className="text-[11px] font-semibold text-[#7c2529]">
                          معلّمة للمراجعة
                        </div>
                      </div>
                    </div>

                    {(unansweredInCategoryCount > 0 || flaggedInCategoryCount > 0) && (
                      <div className="p-4 bg-[#FAF8F7] border border-slate-200 rounded-xl text-xs text-slate-700 leading-relaxed">
                        تنبيه: لا يزال لديك{' '}
                        {unansweredInCategoryCount > 0 && (
                          <strong>({unansweredInCategoryCount}) سؤال غير مجاب عليه </strong>
                        )}
                        {flaggedInCategoryCount > 0 && (
                          <strong>و({flaggedInCategoryCount}) سؤال معلّم للمراجعة</strong>
                        )}
                        . يمكنك الضغط على «العودة لمراجعة الأسئلة» للإجابة عليها قبل الإغلاق النهائي.
                      </div>
                    )}

                    <div className="flex flex-wrap items-center justify-end gap-3 pt-3 border-t border-slate-200">
                      <button
                        type="button"
                        onClick={() => {
                          setShowSubmitConfirmModal(false);
                          if (unansweredInCategoryCount > 0 || flaggedInCategoryCount > 0) {
                            setNavFilter('UNANSWERED_OR_FLAGGED');
                          }
                        }}
                        className="px-4 py-2.5 text-xs font-bold text-[#7c2529] bg-[#FAF8F7] border border-[#7c2529]/30 rounded-xl hover:bg-[#7c2529]/10 cursor-pointer"
                      >
                        العودة لمراجعة الأسئلة المتبقية
                      </button>

                      <button
                        type="button"
                        onClick={handleConfirmFinishSection}
                        className="px-6 py-2.5 bg-[#7c2529] hover:bg-[#631d20] text-white text-xs font-bold rounded-xl flex items-center gap-1.5 cursor-pointer"
                      >
                        <CheckCircle2 className="w-4 h-4 text-[#ffc72c]" />
                        <span>اعتماد الإجابات وتجميد هذا القسم نهائياً</span>
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

        {/* STAGE 4: CONFIDENTIAL COMPLETION SCREEN */}
        {activeSession &&
          activeSession.status !== 'paused' &&
          activeSession.status !== 'terminated' &&
          kioskStage === 'COMPLETED' && (
            <div className="w-full max-w-xl bg-white border border-slate-200 rounded-2xl p-8 md:p-10 text-center space-y-6 shadow-xs">
              <div className="w-16 h-16 rounded-2xl bg-[#7c2529]/10 text-[#7c2529] flex items-center justify-center mx-auto">
                <CheckCircle2 className="w-9 h-9" />
              </div>

              <div>
                <p className="text-xs font-bold text-[#7c2529]">
                  تم إتمام جميع الاختبارات المقررة وحفظ الإجابات بنجاح
                </p>
                <h1 className="text-2xl font-bold text-slate-900 mt-1">
                  شكراً لك، {activeSession.candidateName}
                </h1>
                <p className="text-sm text-slate-600 mt-2 leading-relaxed">
                  لقد أتممت الاختبارات المقررة لك بنجاح. تم حفظ إجاباتك وإرسال التقرير التحليلي السري إلى إدارة الموارد البشرية في بنك الكريمي الإسلامي.
                </p>
              </div>

              <div className="p-5 bg-[#FAF8F7] border border-slate-200 rounded-xl text-right space-y-2.5 text-xs text-slate-700">
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">رقم الجلسة المرجعي:</span>
                  <span className="font-mono-tabular font-bold text-[#7c2529]">
                    {activeSession.otpCode}
                  </span>
                </div>
                {sessionCategories.map((sec) => (
                  <div key={sec.id} className="flex items-center justify-between">
                    <span className="text-slate-500">حالة ({sec.titleAr}):</span>
                    <span className="font-bold text-emerald-800 flex items-center gap-1">
                      <FileCheck className="w-3.5 h-3.5" />
                      <span>مكتمل ومجمّد</span>
                    </span>
                  </div>
                ))}
              </div>

              <div className="pt-4 border-t border-slate-100 flex items-center justify-center">
                <button
                  type="button"
                  onClick={() => {
                    setActiveSessionId(null);
                    setOtpInput('');
                    setEditingIdentity(false);
                    setKioskStage('OTP_GATE');
                  }}
                  className="px-8 py-3.5 bg-[#7c2529] hover:bg-[#631d20] text-white text-xs font-bold rounded-xl transition-colors flex items-center justify-center gap-2 cursor-pointer"
                >
                  <UserCheck className="w-4 h-4 text-[#ffc72c]" />
                  <span>إنهاء الجلسة وتجهيز الشاشة للمتقدم التالي</span>
                </button>
              </div>
            </div>
          )}
      </main>
    </div>
  );
};

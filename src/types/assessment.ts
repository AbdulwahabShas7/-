export type AssessmentCategory = 'IQ' | 'ENGLISH' | string;

export type SubSkill =
  | 'logical_reasoning'
  | 'numerical_series'
  | 'spatial_pattern'
  | 'banking_math'
  | 'grammar'
  | 'banking_vocabulary'
  | 'reading_comprehension'
  | 'general_skill'
  | string;

export type DifficultyLevel = 'easy' | 'medium' | 'hard';

export type QuestionSelectionType = 'single' | 'multiple';

export interface QuestionItem {
  id: string;
  category: AssessmentCategory;
  subSkill: SubSkill;
  difficulty: DifficultyLevel;
  selectionType?: QuestionSelectionType;
  prompt: string;
  contextPassage?: string;
  visualMatrix?: string[];
  options: string[];
  correctOptionIndex: number;
  correctOptionIndices?: number[];
  timeLimitSeconds: number;
  usageCount: number;
  lastUsedAt?: string;
  explanation?: string;
}

export interface AssessmentSectionConfig {
  id: string; // 'IQ', 'ENGLISH', or custom e.g. 'ACCOUNTING'
  titleAr: string;
  titleEn: string;
  descriptionAr: string;
  direction: 'rtl' | 'ltr';
  weight: number;
  totalQuestions: number;
  counts: {
    easy: number;
    medium: number;
    hard: number;
  };
  timeLimitMinutes: number;
  enabledByDefault: boolean;
}

export interface JobProfile {
  id: string;
  titleAr: string;
  titleEn: string;
  department: string;
  iqWeight: number;
  englishWeight: number;
  passingScore: number;
  iqCounts: {
    easy: number;
    medium: number;
    hard: number;
  };
  englishCounts: {
    easy: number;
    medium: number;
    hard: number;
  };
  sectionTimeLimitMinutes: Record<string, number>;
  sections?: AssessmentSectionConfig[];
}

export interface SecurityEvent {
  id: string;
  timestamp: string;
  type: 'FULLSCREEN_EXIT' | 'TAB_SWITCH' | 'WINDOW_BLUR' | 'COPY_ATTEMPT';
  description: string;
  questionIndex: number;
}

export interface SessionQuestionInstance {
  questionId: string;
  category: AssessmentCategory;
  subSkill: SubSkill;
  difficulty: DifficultyLevel;
  selectionType?: QuestionSelectionType;
  prompt: string;
  contextPassage?: string;
  visualMatrix?: string[];
  shuffledOptions: string[];
  correctShuffledIndex: number;
  correctShuffledIndices?: number[];
  timeLimitSeconds: number;
  selectedOptionIndex: number | null;
  selectedOptionIndices?: number[];
  flagged?: boolean;
  timeSpentSeconds: number;
  timedOut: boolean;
}

export interface SubSkillPerformance {
  subSkill: SubSkill;
  labelAr: string;
  category: AssessmentCategory;
  correct: number;
  total: number;
  percentage: number;
  avgTimeSeconds: number;
}

export interface SectionScoreBreakdown {
  categoryId: string;
  titleAr: string;
  correct: number;
  total: number;
  score: number;
  weight: number;
}

export type SectionProgressStatus = 'not_started' | 'in_progress' | 'completed';

export type SessionLifecycleStatus =
  | 'pending'
  | 'in_progress'
  | 'paused'
  | 'terminated'
  | 'completed';

export interface CandidateSession {
  id: string;
  otpCode: string;
  candidateName: string;
  nationalId: string;
  phone: string;
  branchCity: string;
  jobProfileId: string;
  assignedCategories?: string[];
  status: SessionLifecycleStatus;
  sectionStatus: Record<string, SectionProgressStatus>;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
  currentQuestionIndex: number;
  sectionRemainingSeconds: Record<string, number>;
  questions: SessionQuestionInstance[];
  securityLogs: SecurityEvent[];
  evaluation?: {
    iqScore: number;
    englishScore: number;
    weightedTotalScore: number;
    iqCorrect: number;
    iqTotal: number;
    englishCorrect: number;
    englishTotal: number;
    sectionScores?: SectionScoreBreakdown[];
    totalTimeSeconds: number;
    avgQuestionTimeSeconds: number;
    passed: boolean;
    recommendation:
      | 'STRONGLY_RECOMMENDED'
      | 'QUALIFIED_FOR_INTERVIEW'
      | 'BORDERLINE_REVIEW'
      | 'NOT_QUALIFIED';
    subSkillBreakdown: SubSkillPerformance[];
    integrityScore: number;
  };
}

export type SystemUserRole = 'HR_ADMIN' | 'HR_SPECIALIST' | 'EXECUTIVE_VIEWER' | 'CUSTOM';

export type PermissionKey =
  | 'view_sessions'
  | 'create_sessions'
  | 'delete_sessions'
  | 'view_analytics'
  | 'print_export_reports'
  | 'view_questions'
  | 'edit_questions'
  | 'import_export_questions'
  | 'view_settings'
  | 'edit_settings'
  | 'manage_users';

export type UserPermissions = Record<PermissionKey, boolean>;

export const PERMISSION_DEFINITIONS: {
  key: PermissionKey;
  label: string;
  group: string;
}[] = [
  { key: 'view_sessions', label: 'عرض قائمة الجلسات والروابط', group: 'إدارة الجلسات والروابط' },
  { key: 'create_sessions', label: 'تسجيل متقدم وتوليد رمز دخول (OTP)', group: 'إدارة الجلسات والروابط' },
  { key: 'delete_sessions', label: 'إيقاف أو حذف جلسات المتقدمين', group: 'إدارة الجلسات والروابط' },
  { key: 'view_analytics', label: 'الاطلاع على التقارير والرسوم البيانية', group: 'التقارير والتحليلات' },
  { key: 'print_export_reports', label: 'طباعة التقارير الفردية وتصدير الإكسل', group: 'التقارير والتحليلات' },
  { key: 'view_questions', label: 'استعراض بنك الأسئلة المحلي', group: 'بنك الأسئلة' },
  { key: 'edit_questions', label: 'إضافة وتعديل وحذف الأسئلة يدوياً', group: 'بنك الأسئلة' },
  { key: 'import_export_questions', label: 'تحميل ورفع قالب إكسل للأسئلة (XLSX)', group: 'بنك الأسئلة' },
  { key: 'view_settings', label: 'الاطلاع على إعدادات التقييم والأوزان', group: 'إعدادات التقييم' },
  { key: 'edit_settings', label: 'تعديل أوزان الاختبار وإضافة أقسام جديدة', group: 'إعدادات التقييم' },
  { key: 'manage_users', label: 'إدارة المستخدمين وتخصيص الصلاحيات', group: 'إدارة المستخدمين' },
];

export const ROLE_PRESET_PERMISSIONS: Record<SystemUserRole, UserPermissions> = {
  HR_ADMIN: {
    view_sessions: true,
    create_sessions: true,
    delete_sessions: true,
    view_analytics: true,
    print_export_reports: true,
    view_questions: true,
    edit_questions: true,
    import_export_questions: true,
    view_settings: true,
    edit_settings: true,
    manage_users: true,
  },
  HR_SPECIALIST: {
    view_sessions: true,
    create_sessions: true,
    delete_sessions: true,
    view_analytics: true,
    print_export_reports: true,
    view_questions: true,
    edit_questions: true,
    import_export_questions: true,
    view_settings: true,
    edit_settings: false,
    manage_users: false,
  },
  EXECUTIVE_VIEWER: {
    view_sessions: false,
    create_sessions: false,
    delete_sessions: false,
    view_analytics: true,
    print_export_reports: true,
    view_questions: false,
    edit_questions: false,
    import_export_questions: false,
    view_settings: true,
    edit_settings: false,
    manage_users: false,
  },
  CUSTOM: {
    view_sessions: true,
    create_sessions: false,
    delete_sessions: false,
    view_analytics: true,
    print_export_reports: false,
    view_questions: false,
    edit_questions: false,
    import_export_questions: false,
    view_settings: false,
    edit_settings: false,
    manage_users: false,
  },
};

export interface SystemUser {
  id: string;
  fullName: string;
  username: string;
  password: string;
  role: SystemUserRole;
  permissions: UserPermissions;
  jobTitle: string;
  branch: string;
  active: boolean;
  createdAt: string;
}

export const USER_ROLE_LABELS: Record<
  SystemUserRole,
  { ar: string; description: string }
> = {
  HR_ADMIN: {
    ar: 'مدير الموارد البشرية (صلاحية كاملة)',
    description: 'وصول كامل لجميع أقسام المنصة وإدارة المستخدمين والصلاحيات',
  },
  HR_SPECIALIST: {
    ar: 'أخصائي موارد بشرية وتوظيف',
    description: 'إصدار رموز الاختبار للمتقدمين، التحكم بالجلسات، وإدارة الأسئلة',
  },
  EXECUTIVE_VIEWER: {
    ar: 'الإدارة العليا (اطلاع وتقارير فقط)',
    description: 'استعراض لوحة التحليلات، الرسوم البيانية، وطباعة تقارير المتقدمين',
  },
  CUSTOM: {
    ar: 'صلاحيات مخصصة (Custom Access)',
    description: 'تحديد دقيق ومفصل للأقسام والعمليات المسموح للمستخدم الوصول إليها',
  },
};

export const SUB_SKILL_LABELS: Record<
  string,
  { ar: string; en: string; category: AssessmentCategory }
> = {
  logical_reasoning: { ar: 'الاستنتاج والتحليل المنطقي', en: 'Logical Reasoning', category: 'IQ' },
  numerical_series: { ar: 'السلاسل والأنماط الرقمية', en: 'Numerical Series', category: 'IQ' },
  spatial_pattern: {
    ar: 'العلاقات المكانية والمصفوفات',
    en: 'Spatial & Pattern Matrix',
    category: 'IQ',
  },
  banking_math: {
    ar: 'المنطق المالي والمصرفي',
    en: 'Financial & Banking Math',
    category: 'IQ',
  },
  grammar: {
    ar: 'القواعد والتراكيب اللغوية',
    en: 'Grammar & Structure',
    category: 'ENGLISH',
  },
  banking_vocabulary: {
    ar: 'المصطلحات المصرفية والمالية',
    en: 'Banking Vocabulary',
    category: 'ENGLISH',
  },
  reading_comprehension: {
    ar: 'استيعاب النصوص والمراسلات',
    en: 'Reading Comprehension',
    category: 'ENGLISH',
  },
  general_skill: {
    ar: 'مهارة تخصصية عامة',
    en: 'General Specialized Skill',
    category: 'IQ',
  },
};

export function getSubSkillInfo(subSkill: string, fallbackCategory: string = 'IQ') {
  if (SUB_SKILL_LABELS[subSkill]) {
    return SUB_SKILL_LABELS[subSkill];
  }
  return {
    ar: subSkill || 'مهارة عامة',
    en: subSkill || 'General Skill',
    category: fallbackCategory,
  };
}

export const DIFFICULTY_LABELS: Record<DifficultyLevel, string> = {
  easy: 'أساسي',
  medium: 'متوسط',
  hard: 'متقدم',
};

export function distributeTotalQuestions(total: number): {
  easy: number;
  medium: number;
  hard: number;
} {
  const safeTotal = Math.max(1, Math.round(total));
  const easy = Math.max(1, Math.round(safeTotal * 0.4));
  const medium = Math.max(0, Math.round(safeTotal * 0.4));
  const hard = Math.max(0, safeTotal - easy - medium);
  return { easy, medium, hard };
}

export function getEffectiveSections(profile: JobProfile): AssessmentSectionConfig[] {
  if (profile.sections && profile.sections.length > 0) {
    return profile.sections;
  }
  const iqTotal =
    (profile.iqCounts?.easy || 12) +
    (profile.iqCounts?.medium || 12) +
    (profile.iqCounts?.hard || 6);
  const enTotal =
    (profile.englishCounts?.easy || 12) +
    (profile.englishCounts?.medium || 12) +
    (profile.englishCounts?.hard || 6);

  return [
    {
      id: 'IQ',
      titleAr: 'اختبار القدرات الذهنية والذكاء (IQ)',
      titleEn: 'Cognitive & IQ Assessment',
      descriptionAr:
        'يقيس الاستنتاج المنطقي، السلاسل الرقمية، التحليل المالي والمصرفي، والعلاقات المكانية.',
      direction: 'rtl',
      weight: profile.iqWeight ?? 60,
      totalQuestions: iqTotal,
      counts: profile.iqCounts || { easy: 12, medium: 12, hard: 6 },
      timeLimitMinutes: profile.sectionTimeLimitMinutes?.IQ || 25,
      enabledByDefault: true,
    },
    {
      id: 'ENGLISH',
      titleAr: 'اختبار أساسيات اللغة الإنجليزية (English)',
      titleEn: 'Banking English Assessment',
      descriptionAr:
        'يقيس القواعد اللغوية، المصطلحات المصرفية والمالية، واستيعاب المراسلات والسياسات.',
      direction: 'ltr',
      weight: profile.englishWeight ?? 40,
      totalQuestions: enTotal,
      counts: profile.englishCounts || { easy: 12, medium: 12, hard: 6 },
      timeLimitMinutes: profile.sectionTimeLimitMinutes?.ENGLISH || 20,
      enabledByDefault: true,
    },
  ];
}

export const KIB_BRAND = {
  maroon: '#7c2529',
  gold: '#ffc72c',
  logoColoredOnWhite: '/assets/aistudio/_________________________-14_5415be9e.png',
  logoLightBg: '/assets/aistudio/_________________________-14_5415be9e.png',
};

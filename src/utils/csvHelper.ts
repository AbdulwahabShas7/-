import * as XLSX from 'xlsx';
import {
  AssessmentCategory,
  AssessmentSectionConfig,
  CandidateSession,
  DIFFICULTY_LABELS,
  DifficultyLevel,
  getSubSkillInfo,
  QuestionItem,
  QuestionSelectionType,
  SubSkill,
  SUB_SKILL_LABELS,
} from '../types/assessment';

const ARABIC_DIFFICULTY_TO_KEY: Record<string, DifficultyLevel> = {
  أساسي: 'easy',
  اساسي: 'easy',
  سهل: 'easy',
  easy: 'easy',
  متوسط: 'medium',
  medium: 'medium',
  متقدم: 'hard',
  صعب: 'hard',
  hard: 'hard',
};

function getSectionArabicName(
  category: string,
  sections?: AssessmentSectionConfig[]
): string {
  const found = sections?.find((s) => s.id === category);
  if (found) return found.titleAr;
  if (category === 'IQ') return 'اختبار القدرات الذهنية والذكاء (IQ)';
  if (category === 'ENGLISH') return 'اختبار أساسيات اللغة الإنجليزية (English)';
  return category;
}

function resolveCategoryFromArabicOrCode(
  raw: string,
  sections?: AssessmentSectionConfig[]
): AssessmentCategory {
  const clean = (raw || '').trim();
  if (!clean) return 'IQ';

  if (sections && sections.length > 0) {
    const exactMatch = sections.find(
      (s) =>
        s.id.toLowerCase() === clean.toLowerCase() ||
        s.titleAr.trim() === clean ||
        clean.includes(s.titleAr.trim()) ||
        clean.toUpperCase().includes(s.id.toUpperCase())
    );
    if (exactMatch) return exactMatch.id;
  }

  const upper = clean.toUpperCase();
  if (upper.includes('ENG') || clean.includes('إنجليز') || clean.includes('انجليز')) {
    return 'ENGLISH';
  }
  if (upper.includes('IQ') || clean.includes('قدرات') || clean.includes('ذكاء')) {
    return 'IQ';
  }
  return clean;
}

function resolveSubSkillFromArabicOrCode(
  raw: string,
  category: AssessmentCategory
): SubSkill {
  const clean = (raw || '').trim();
  if (!clean) {
    return category === 'ENGLISH' ? 'grammar' : 'logical_reasoning';
  }

  // Check if matches key directly
  if (SUB_SKILL_LABELS[clean]) {
    return clean;
  }

  // Check if matches Arabic or English label
  for (const [key, info] of Object.entries(SUB_SKILL_LABELS)) {
    if (
      info.ar === clean ||
      clean.includes(info.ar) ||
      info.en.toLowerCase() === clean.toLowerCase()
    ) {
      return key;
    }
  }

  return clean;
}

/**
 * Downloads a real .xlsx Excel Template with 100% Arabic headers and instructions
 * for adding questions and uploading them to the Control Panel.
 */
export function downloadExcelQuestionTemplate(
  sections?: AssessmentSectionConfig[]
): void {
  const headers = [
    'معرف السؤال (اختياري)',
    'قسم الاختبار',
    'المهارة الفرعية',
    'مستوى الصعوبة (أساسي / متوسط / متقدم)',
    'نوع الإجابة (اختيار مفرد / اختيار متعدد)',
    'نص السؤال',
    'النص المرجعي أو القطعة (اختياري)',
    'الخيار الأول (1)',
    'الخيار الثاني (2)',
    'الخيار الثالث (3)',
    'الخيار الرابع (4)',
    'رقم الإجابة الصحيحة (مثال: 1 أو 1,3 للمتعدد)',
    'الزمن المخصص بالثواني',
    'الشرح والتوضيح للإجابة (اختياري)',
  ];

  const sampleRows: (string | number)[][] = [
    [
      'TEMP-IQ-1',
      getSectionArabicName('IQ', sections),
      'السلاسل والأنماط الرقمية',
      'متوسط',
      'اختيار مفرد',
      'ما هو الرقم التالي في السلسلة العددية: 10 ، 20 ، 40 ، 80 ، (...)؟',
      '',
      '160',
      '120',
      '100',
      '140',
      '1',
      45,
      'يتضاعف الرقم بالضرب في 2 في كل خطوة متتالية',
    ],
    [
      'TEMP-IQ-2',
      getSectionArabicName('IQ', sections),
      'المنطق المالي والمصرفي',
      'أساسي',
      'اختيار متعدد',
      'أي من العمليات التالية تُعد من خدمات الصيرفة الإسلامية المعتمدة في البنك؟ (اختر إجابتين)',
      '',
      'المرابحة للآمر بالشراء',
      'المضاربة الشرعية',
      'الإقراض الربوي بفائدة',
      'الخصم غير المشروع',
      '1,2',
      50,
      'المرابحة والمضاربة من صيغ التمويل الإسلامي المعتمدة',
    ],
    [
      'TEMP-EN-1',
      getSectionArabicName('ENGLISH', sections),
      'المصطلحات المصرفية والمالية',
      'أساسي',
      'اختيار مفرد',
      'What do we call the money placed into a bank account for safekeeping?',
      '',
      'Deposit',
      'Withdrawal',
      'Overdraft',
      'Penalty',
      '1',
      35,
      'Deposit means placing funds into a bank account',
    ],
    [
      'TEMP-EN-2',
      getSectionArabicName('ENGLISH', sections),
      'القواعد والتراكيب اللغوية',
      'متوسط',
      'اختيار مفرد',
      'Choose the correct verb form: "The branch manager ________ the daily reports every evening."',
      '',
      'reviews',
      'review',
      'reviewing',
      'have reviewed',
      '1',
      35,
      'Present simple third-person singular takes -s',
    ],
  ];

  // If custom sections exist, add a sample row for the first custom section too
  const customSections = (sections || []).filter(
    (s) => s.id !== 'IQ' && s.id !== 'ENGLISH'
  );
  if (customSections.length > 0) {
    const customSec = customSections[0];
    sampleRows.push([
      `TEMP-${customSec.id}-1`,
      customSec.titleAr,
      'مهارة تخصصية عامة',
      'متوسط',
      'اختيار مفرد',
      `سؤال تجريبي خاص بقسم (${customSec.titleAr}) - يمكنك استبداله بأسئلتك الخاصة:`,
      '',
      'الخيار الصحيح الأول',
      'الخيار الثاني',
      'الخيار الثالث',
      'الخيار الرابع',
      '1',
      45,
      'توضيح الإجابة الصحيحة',
    ]);
  }

  const worksheetData = [headers, ...sampleRows];
  const worksheet = XLSX.utils.aoa_to_sheet(worksheetData);

  // Set Right-to-Left view and comfortable column widths
  worksheet['!views'] = [{ rightToLeft: true }];
  worksheet['!cols'] = [
    { wch: 18 },
    { wch: 34 },
    { wch: 28 },
    { wch: 24 },
    { wch: 24 },
    { wch: 52 },
    { wch: 30 },
    { wch: 22 },
    { wch: 22 },
    { wch: 22 },
    { wch: 22 },
    { wch: 28 },
    { wch: 20 },
    { wch: 34 },
  ];

  const workbook = XLSX.utils.book_new();
  workbook.Workbook = { Views: [{ RTL: true }] };
  XLSX.utils.book_append_sheet(workbook, worksheet, 'قالب_رفع_الأسئلة');

  XLSX.writeFile(workbook, 'قالب_رفع_الأسئلة_بنك_الكريمي.xlsx');
}

/**
 * Exports QuestionItems to a real .xlsx Excel workbook with Arabic column headers and values
 */
export function exportQuestionsToCsv(
  questions: QuestionItem[],
  sections?: AssessmentSectionConfig[]
): void {
  const headers = [
    'معرف السؤال',
    'قسم الاختبار',
    'رمز القسم',
    'المهارة الفرعية',
    'مستوى الصعوبة',
    'نوع الإجابة',
    'نص السؤال',
    'النص المرجعي أو القطعة',
    'الخيار الأول (1)',
    'الخيار الثاني (2)',
    'الخيار الثالث (3)',
    'الخيار الرابع (4)',
    'رقم الإجابة الصحيحة',
    'الزمن المخصص (ثانية)',
    'عدد مرات الاستخدام',
    'الشرح والتوضيح',
  ];

  const rows = questions.map((q) => {
    const subSkillAr = getSubSkillInfo(q.subSkill, q.category).ar;
    const diffAr = DIFFICULTY_LABELS[q.difficulty] || 'متوسط';
    const isMulti =
      q.selectionType === 'multiple' &&
      q.correctOptionIndices &&
      q.correctOptionIndices.length > 1;
    const correctNumbersStr = isMulti
      ? q.correctOptionIndices!.map((idx) => idx + 1).join(',')
      : String((q.correctOptionIndex ?? 0) + 1);

    return [
      q.id,
      getSectionArabicName(q.category, sections),
      q.category,
      subSkillAr,
      diffAr,
      isMulti ? 'اختيار متعدد' : 'اختيار مفرد',
      q.prompt,
      q.contextPassage || '',
      q.options[0] || '',
      q.options[1] || '',
      q.options[2] || '',
      q.options[3] || '',
      correctNumbersStr,
      q.timeLimitSeconds,
      q.usageCount || 0,
      q.explanation || '',
    ];
  });

  const worksheet = XLSX.utils.aoa_to_sheet([headers, ...rows]);
  worksheet['!views'] = [{ rightToLeft: true }];
  worksheet['!cols'] = [
    { wch: 16 },
    { wch: 32 },
    { wch: 14 },
    { wch: 26 },
    { wch: 16 },
    { wch: 18 },
    { wch: 52 },
    { wch: 28 },
    { wch: 22 },
    { wch: 22 },
    { wch: 22 },
    { wch: 22 },
    { wch: 18 },
    { wch: 18 },
    { wch: 18 },
    { wch: 32 },
  ];

  const workbook = XLSX.utils.book_new();
  workbook.Workbook = { Views: [{ RTL: true }] };
  XLSX.utils.book_append_sheet(workbook, worksheet, 'بنك_الأسئلة');

  const dateStr = new Date().toISOString().slice(0, 10);
  XLSX.writeFile(workbook, `بنك_الأسئلة_بنك_الكريمي_${dateStr}.xlsx`);
}

/**
 * Exports Candidate Assessment Results to a real .xlsx Excel workbook with Arabic headers
 */
export function exportResultsToCsv(sessions: CandidateSession[]): void {
  const headers = [
    'رمز الجلسة (OTP)',
    'اسم المتقدم',
    'الرقم الوطني / الهوية',
    'رقم الهاتف',
    'حالة الجلسة',
    'تاريخ الاختبار',
    'الأقسام المختبرة',
    'درجة القدرات (IQ %)',
    'درجة الإنجليزية (English %)',
    'الدرجة الموزونة الكلية (%)',
    'النتيجة النهائية',
    'التوصية الآلية',
    'مؤشر النزاهة والانضباط (%)',
    'عدد تنبيهات الأمان',
    'متوسط زمن السؤال (ثانية)',
  ];

  const recommendationLabels: Record<string, string> = {
    STRONGLY_RECOMMENDED: 'موصى به بشدة للقبول',
    QUALIFIED_FOR_INTERVIEW: 'مؤهل للمقابلة الشخصية',
    BORDERLINE_REVIEW: 'قيد المراجعة الحدية',
    NOT_QUALIFIED: 'غير مجتاز',
  };

  const statusLabels: Record<string, string> = {
    completed: 'مكتمل',
    in_progress: 'جاري الاختبار',
    paused: 'موقوف مؤقتاً',
    terminated: 'موقوف من الإدارة',
    pending: 'بانتظار الدخول',
  };

  const rows = sessions.map((s) => {
    const secSummary =
      s.evaluation?.sectionScores
        ?.map((sec) => `${sec.titleAr}: ${sec.score}%`)
        .join(' | ') || 'IQ + English';

    return [
      s.otpCode,
      s.candidateName,
      s.nationalId,
      s.phone,
      statusLabels[s.status] || s.status,
      new Date(s.createdAt).toLocaleString('ar-YE'),
      secSummary,
      s.evaluation ? s.evaluation.iqScore : '-',
      s.evaluation ? s.evaluation.englishScore : '-',
      s.evaluation ? s.evaluation.weightedTotalScore : '-',
      s.evaluation ? (s.evaluation.passed ? 'مجتاز' : 'غير مجتاز') : '-',
      s.evaluation ? recommendationLabels[s.evaluation.recommendation] || '' : '-',
      s.evaluation ? s.evaluation.integrityScore : '-',
      s.securityLogs.length,
      s.evaluation ? s.evaluation.avgQuestionTimeSeconds : '-',
    ];
  });

  const worksheet = XLSX.utils.aoa_to_sheet([headers, ...rows]);
  worksheet['!views'] = [{ rightToLeft: true }];
  worksheet['!cols'] = [
    { wch: 16 },
    { wch: 28 },
    { wch: 20 },
    { wch: 16 },
    { wch: 18 },
    { wch: 22 },
    { wch: 36 },
    { wch: 18 },
    { wch: 20 },
    { wch: 20 },
    { wch: 16 },
    { wch: 24 },
    { wch: 20 },
    { wch: 18 },
    { wch: 20 },
  ];

  const workbook = XLSX.utils.book_new();
  workbook.Workbook = { Views: [{ RTL: true }] };
  XLSX.utils.book_append_sheet(workbook, worksheet, 'نتائج_المتقدمين');

  const dateStr = new Date().toISOString().slice(0, 10);
  XLSX.writeFile(workbook, `نتائج_المتقدمين_بنك_الكريمي_${dateStr}.xlsx`);
}

/**
 * Parses a 2D array of rows (from XLSX or CSV) into QuestionItem objects
 */
function parseRowsToQuestions(
  rows: (string | number | undefined)[][],
  sections?: AssessmentSectionConfig[]
): QuestionItem[] {
  if (!rows || rows.length <= 1) return [];

  const headerRow = rows[0].map((c) => String(c || '').trim());
  // Detect whether the sheet has the new 14-column Arabic format (with SelectionType) or 16-column exported format or legacy 13-column format
  const hasSelectionTypeCol = headerRow.some(
    (h) => h.includes('نوع الإجابة') || h.includes('نوع الاختيار') || h.toLowerCase().includes('selection')
  );
  const hasCategoryCodeCol = headerRow.some((h) => h.includes('رمز القسم'));

  const parsed: QuestionItem[] = [];

  for (let i = 1; i < rows.length; i++) {
    const r = rows[i].map((cell) => String(cell ?? '').trim());
    if (r.filter(Boolean).length < 5) continue;

    let categoryRaw = '';
    let subSkillRaw = '';
    let diffRaw = '';
    let selectionTypeRaw = 'اختيار مفرد';
    let prompt = '';
    let contextPassage = '';
    let opt1 = '';
    let opt2 = '';
    let opt3 = '';
    let opt4 = '';
    let correctRaw = '1';
    let timeLimitRaw = '45';
    let explanation = '';

    if (hasCategoryCodeCol) {
      // 16-column full exported bank format
      categoryRaw = r[2] || r[1];
      subSkillRaw = r[3];
      diffRaw = r[4];
      selectionTypeRaw = r[5];
      prompt = r[6];
      contextPassage = r[7];
      opt1 = r[8];
      opt2 = r[9];
      opt3 = r[10];
      opt4 = r[11];
      correctRaw = r[12];
      timeLimitRaw = r[13];
      explanation = r[15] || '';
    } else if (hasSelectionTypeCol) {
      // 14-column Arabic template format
      categoryRaw = r[1];
      subSkillRaw = r[2];
      diffRaw = r[3];
      selectionTypeRaw = r[4];
      prompt = r[5];
      contextPassage = r[6];
      opt1 = r[7];
      opt2 = r[8];
      opt3 = r[9];
      opt4 = r[10];
      correctRaw = r[11];
      timeLimitRaw = r[12];
      explanation = r[13] || '';
    } else {
      // Legacy 13-column format
      categoryRaw = r[1];
      subSkillRaw = r[2];
      diffRaw = r[3];
      prompt = r[4];
      contextPassage = r[5];
      opt1 = r[6];
      opt2 = r[7];
      opt3 = r[8];
      opt4 = r[9];
      correctRaw = r[10];
      timeLimitRaw = r[11];
      explanation = r[12] || '';
    }

    const options = [opt1, opt2, opt3, opt4].filter(Boolean);
    if (!prompt || options.length < 2) continue;

    const category = resolveCategoryFromArabicOrCode(categoryRaw, sections);
    const subSkill = resolveSubSkillFromArabicOrCode(subSkillRaw, category);
    const difficulty: DifficultyLevel =
      ARABIC_DIFFICULTY_TO_KEY[diffRaw.toLowerCase()] ||
      ARABIC_DIFFICULTY_TO_KEY[diffRaw] ||
      'medium';

    // Parse single or multiple correct option numbers (e.g. "1" or "1,3" or "1،2")
    const correctIndices = correctRaw
      .split(/[,،;\s]+/)
      .map((s) => parseInt(s.trim(), 10) - 1)
      .filter((idx) => !isNaN(idx) && idx >= 0 && idx < options.length);

    const safeIndices = correctIndices.length > 0 ? correctIndices : [0];
    const isMulti: QuestionSelectionType =
      selectionTypeRaw.includes('متعدد') ||
      selectionTypeRaw.toLowerCase().includes('multi') ||
      safeIndices.length > 1
        ? 'multiple'
        : 'single';

    const timeLimitSeconds = Math.max(
      15,
      Math.min(180, parseInt(timeLimitRaw || '45', 10) || 45)
    );

    parsed.push({
      id: `custom-${Date.now()}-${i}`,
      category,
      subSkill,
      difficulty,
      selectionType: isMulti,
      prompt,
      contextPassage: contextPassage || undefined,
      options,
      correctOptionIndex: safeIndices[0],
      correctOptionIndices: safeIndices,
      timeLimitSeconds,
      usageCount: 0,
      explanation: explanation || undefined,
    });
  }

  return parsed;
}

/**
 * Parses an uploaded Excel (.xlsx / .xls) or CSV File into QuestionItem[]
 */
export async function parseQuestionsFromExcelFile(
  file: File,
  sections?: AssessmentSectionConfig[]
): Promise<QuestionItem[]> {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array' });
  const firstSheetName = workbook.SheetNames[0];
  if (!firstSheetName) return [];
  const worksheet = workbook.Sheets[firstSheetName];
  const rows = XLSX.utils.sheet_to_json<(string | number | undefined)[]>(worksheet, {
    header: 1,
    defval: '',
  });
  return parseRowsToQuestions(rows, sections);
}

/**
 * Backward-compatible text parser
 */
export function parseQuestionsFromCsv(
  csvText: string,
  sections?: AssessmentSectionConfig[]
): QuestionItem[] {
  const workbook = XLSX.read(csvText, { type: 'string' });
  const firstSheetName = workbook.SheetNames[0];
  if (!firstSheetName) return [];
  const worksheet = workbook.Sheets[firstSheetName];
  const rows = XLSX.utils.sheet_to_json<(string | number | undefined)[]>(worksheet, {
    header: 1,
    defval: '',
  });
  return parseRowsToQuestions(rows, sections);
}

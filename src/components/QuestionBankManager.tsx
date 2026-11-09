import React, { useState, useRef } from 'react';
import {
  Plus,
  Download,
  Upload,
  Search,
  Edit3,
  Trash2,
  Check,
  X,
  FileSpreadsheet,
  CheckSquare,
} from 'lucide-react';
import {
  AssessmentCategory,
  AssessmentSectionConfig,
  DifficultyLevel,
  DIFFICULTY_LABELS,
  getSubSkillInfo,
  QuestionItem,
  QuestionSelectionType,
  SubSkill,
  SUB_SKILL_LABELS,
} from '../types/assessment';
import {
  downloadExcelQuestionTemplate,
  exportQuestionsToCsv,
  parseQuestionsFromExcelFile,
} from '../utils/csvHelper';

interface QuestionBankManagerProps {
  questions: QuestionItem[];
  sections: AssessmentSectionConfig[];
  canEdit: boolean;
  canImportExport?: boolean;
  onSaveQuestion: (question: QuestionItem) => void;
  onDeleteQuestion: (questionId: string) => void;
  onBulkDeleteQuestions?: (questionIds: string[]) => void;
  onBulkChangeCategory?: (questionIds: string[], newCategory: string) => void;
  onImportQuestions: (imported: QuestionItem[]) => void;
}

export const QuestionBankManager: React.FC<QuestionBankManagerProps> = ({
  questions,
  sections,
  canEdit,
  canImportExport = true,
  onSaveQuestion,
  onDeleteQuestion,
  onBulkDeleteQuestions,
  onBulkChangeCategory,
  onImportQuestions,
}) => {
  const [filterCategory, setFilterCategory] = useState<'ALL' | AssessmentCategory>('ALL');
  const [filterDifficulty, setFilterDifficulty] = useState<'ALL' | DifficultyLevel>('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  // Multi-select state for Question Bank rows (#8)
  const [selectedQuestionIds, setSelectedQuestionIds] = useState<string[]>([]);
  const [bulkTargetCategory, setBulkTargetCategory] = useState<string>(
    sections[0]?.id || 'IQ'
  );

  // Editor state
  const [isEditing, setIsEditing] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [category, setCategory] = useState<AssessmentCategory>('IQ');
  const [subSkill, setSubSkill] = useState<SubSkill>('numerical_series');
  const [customSubSkill, setCustomSubSkill] = useState('');
  const [difficulty, setDifficulty] = useState<DifficultyLevel>('medium');
  const [selectionType, setSelectionType] = useState<QuestionSelectionType>('single');
  const [prompt, setPrompt] = useState('');
  const [contextPassage, setContextPassage] = useState('');
  const [options, setOptions] = useState<string[]>(['', '', '', '']);
  const [correctIndex, setCorrectIndex] = useState<number>(0);
  const [correctIndices, setCorrectIndices] = useState<number[]>([0]);
  const [timeLimit, setTimeLimit] = useState<number>(45);
  const [explanation, setExplanation] = useState('');
  const [importBanner, setImportBanner] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const getSectionTitle = (catId: string) => {
    const found = sections.find((s) => s.id === catId);
    if (found) return found.titleAr;
    if (catId === 'IQ') return 'القدرات الذهنية (IQ)';
    if (catId === 'ENGLISH') return 'اللغة الإنجليزية (English)';
    return catId;
  };

  const filteredQuestions = questions.filter((q) => {
    if (filterCategory !== 'ALL' && q.category !== filterCategory) return false;
    if (filterDifficulty !== 'ALL' && q.difficulty !== filterDifficulty) return false;
    if (
      searchQuery.trim() &&
      !q.prompt.toLowerCase().includes(searchQuery.toLowerCase()) &&
      !getSubSkillInfo(q.subSkill, q.category).ar.includes(searchQuery)
    ) {
      return false;
    }
    return true;
  });

  const handleToggleSelectQuestion = (id: string) => {
    setSelectedQuestionIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const handleToggleSelectAllFiltered = () => {
    const filteredIds = filteredQuestions.map((q) => q.id);
    const allSelected =
      filteredIds.length > 0 &&
      filteredIds.every((id) => selectedQuestionIds.includes(id));

    if (allSelected) {
      const removeSet = new Set(filteredIds);
      setSelectedQuestionIds((prev) => prev.filter((id) => !removeSet.has(id)));
    } else {
      const merged = new Set([...selectedQuestionIds, ...filteredIds]);
      setSelectedQuestionIds(Array.from(merged));
    }
  };

  const handleOpenNew = () => {
    setEditingId(null);
    const defaultCat = filterCategory !== 'ALL' ? filterCategory : sections[0]?.id || 'IQ';
    setCategory(defaultCat);
    setSubSkill(
      defaultCat === 'ENGLISH'
        ? 'grammar'
        : defaultCat === 'IQ'
        ? 'numerical_series'
        : 'general_skill'
    );
    setCustomSubSkill('');
    setDifficulty('medium');
    setSelectionType('single');
    setPrompt('');
    setContextPassage('');
    setOptions(['', '', '', '']);
    setCorrectIndex(0);
    setCorrectIndices([0]);
    setTimeLimit(45);
    setExplanation('');
    setIsEditing(true);
  };

  const handleOpenEdit = (q: QuestionItem) => {
    setEditingId(q.id);
    setCategory(q.category);
    if (SUB_SKILL_LABELS[q.subSkill]) {
      setSubSkill(q.subSkill);
      setCustomSubSkill('');
    } else {
      setSubSkill('general_skill');
      setCustomSubSkill(q.subSkill);
    }
    setDifficulty(q.difficulty);
    setSelectionType(q.selectionType || 'single');
    setPrompt(q.prompt);
    setContextPassage(q.contextPassage || '');
    setOptions([
      q.options[0] || '',
      q.options[1] || '',
      q.options[2] || '',
      q.options[3] || '',
    ]);
    setCorrectIndex(q.correctOptionIndex);
    setCorrectIndices(
      q.correctOptionIndices && q.correctOptionIndices.length > 0
        ? q.correctOptionIndices
        : [q.correctOptionIndex]
    );
    setTimeLimit(q.timeLimitSeconds);
    setExplanation(q.explanation || '');
    setIsEditing(true);
  };

  const handleToggleCorrectMultiOption = (idx: number) => {
    setCorrectIndices((prev) => {
      if (prev.includes(idx)) {
        if (prev.length <= 1) return prev; // Keep at least 1 correct option
        return prev.filter((i) => i !== idx);
      }
      return [...prev, idx].sort();
    });
  };

  const handleSubmitForm = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanedOptions = options.map((o) => o.trim()).filter(Boolean);
    if (!prompt.trim() || cleanedOptions.length < 2) return;

    const existing = editingId ? questions.find((q) => q.id === editingId) : undefined;
    const finalSubSkill =
      subSkill === 'general_skill' && customSubSkill.trim()
        ? customSubSkill.trim()
        : subSkill;

    const validMultiIndices = correctIndices.filter((i) => i < cleanedOptions.length);
    const finalIndices =
      selectionType === 'multiple'
        ? validMultiIndices.length > 0
          ? validMultiIndices
          : [0]
        : [Math.min(correctIndex, cleanedOptions.length - 1)];

    const newItem: QuestionItem = {
      id: editingId || `q-${Date.now()}`,
      category,
      subSkill: finalSubSkill,
      difficulty,
      selectionType,
      prompt: prompt.trim(),
      contextPassage: contextPassage.trim() || undefined,
      visualMatrix: existing?.visualMatrix,
      options: cleanedOptions,
      correctOptionIndex: finalIndices[0],
      correctOptionIndices: finalIndices,
      timeLimitSeconds: Math.max(15, Math.min(180, timeLimit)),
      usageCount: existing ? existing.usageCount : 0,
      lastUsedAt: existing?.lastUsedAt,
      explanation: explanation.trim() || undefined,
    };

    onSaveQuestion(newItem);
    setIsEditing(false);
  };

  const handleExcelFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const parsed = await parseQuestionsFromExcelFile(file, sections);
      if (parsed.length > 0) {
        onImportQuestions(parsed);
        setImportBanner(
          `تم استيراد ${parsed.length} سؤالاً جديداً من ملف الإكسل (${file.name}) بنجاح إلى قاعدة البيانات المحلية.`
        );
        setTimeout(() => setImportBanner(null), 6000);
      } else {
        setImportBanner(
          'تعذر العثور على أسئلة صالحة في الملف. يرجى تحميل قالب الإكسل العربي المعتمد (.xlsx) وتعبئته ثم رفعه.'
        );
      }
    } catch {
      setImportBanner(
        'حدث خطأ أثناء قراءة الملف. يرجى التأكد من أن الملف بصيغة Excel (.xlsx) أو CSV.'
      );
    }

    e.target.value = '';
  };

  return (
    <div className="space-y-6">
      {/* Header & Arabic XLSX Template Workflow Bar (#4 & #5) */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 flex flex-wrap items-center justify-between gap-6 shadow-xs">
        <div>
          <h2 className="text-xl font-bold text-[#7c2529]">
            إدارة بنك الأسئلة المحلي وقوالب الإكسل العربية (XLSX)
          </h2>
          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600 mt-1.5">
            <span>
              إجمالي الأسئلة النشطة:{' '}
              <strong className="font-mono-tabular text-[#7c2529]">{questions.length}</strong>
            </span>
            {sections.map((sec) => {
              const count = questions.filter((q) => q.category === sec.id).length;
              return (
                <React.Fragment key={sec.id}>
                  <span aria-hidden="true">·</span>
                  <span>
                    {sec.titleAr}:{' '}
                    <strong className="font-mono-tabular text-slate-900">
                      {count} سؤالاً
                    </strong>
                  </span>
                </React.Fragment>
              );
            })}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            onChange={handleExcelFileChange}
            className="hidden"
          />

          {canImportExport && (
            <>
              <button
                type="button"
                onClick={() => downloadExcelQuestionTemplate(sections)}
                className="px-3.5 py-2.5 text-xs font-bold text-[#7c2529] bg-[#ffc72c]/25 hover:bg-[#ffc72c]/40 border border-[#ffc72c] rounded-xl flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <FileSpreadsheet className="w-4 h-4 text-[#7c2529]" />
                <span>تحميل قالب رفع الأسئلة (Excel .xlsx بالعربية)</span>
              </button>

              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="px-3.5 py-2.5 text-xs font-semibold text-slate-700 hover:text-slate-900 border border-slate-300 rounded-xl hover:bg-slate-50 flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Upload className="w-4 h-4 text-[#7c2529]" />
                <span>رفع ملف الأسئلة (.xlsx / .csv)</span>
              </button>

              <button
                type="button"
                onClick={() => exportQuestionsToCsv(questions, sections)}
                className="px-3.5 py-2.5 text-xs font-semibold text-slate-700 hover:text-slate-900 border border-slate-300 rounded-xl hover:bg-slate-50 flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Download className="w-4 h-4 text-[#7c2529]" />
                <span>تصدير بنك الأسئلة (Excel .xlsx)</span>
              </button>
            </>
          )}

          {canEdit && (
            <button
              type="button"
              onClick={handleOpenNew}
              className="px-4 py-2.5 bg-[#7c2529] hover:bg-[#631d20] text-white text-xs font-bold rounded-xl flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Plus className="w-4 h-4 text-[#ffc72c]" />
              <span>إضافة سؤال جديد</span>
            </button>
          )}
        </div>
      </div>

      {importBanner && (
        <div className="bg-[#ffc72c]/20 border border-[#7c2529]/30 text-[#7c2529] px-5 py-3.5 rounded-xl text-xs font-bold flex items-center justify-between">
          <span>{importBanner}</span>
          <button type="button" onClick={() => setImportBanner(null)}>
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Multi-Select Bulk Action Bar (#8) */}
      {selectedQuestionIds.length > 0 && (
        <div className="bg-[#FAF8F7] border-2 border-[#7c2529] rounded-2xl p-4 flex flex-wrap items-center justify-between gap-4 shadow-xs">
          <div className="flex items-center gap-2.5 text-xs font-bold text-[#7c2529]">
            <CheckSquare className="w-4 h-4 text-[#7c2529]" />
            <span>
              تم تحديد ({selectedQuestionIds.length}) سؤالاً بالاختيار المتعدد
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {canImportExport && (
              <button
                type="button"
                onClick={() => {
                  const selectedItems = questions.filter((q) =>
                    selectedQuestionIds.includes(q.id)
                  );
                  exportQuestionsToCsv(selectedItems, sections);
                }}
                className="px-3 py-1.5 bg-white hover:bg-slate-50 text-[#7c2529] border border-[#7c2529]/30 text-xs font-bold rounded-lg flex items-center gap-1.5 cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                <span>تصدير الأسئلة المحددة (.xlsx)</span>
              </button>
            )}

            {canEdit && onBulkChangeCategory && (
              <div className="flex items-center gap-1.5 bg-white border border-slate-300 rounded-lg px-2 py-1">
                <select
                  value={bulkTargetCategory}
                  onChange={(e) => setBulkTargetCategory(e.target.value)}
                  className="text-xs bg-transparent focus:outline-none text-slate-800 font-semibold"
                >
                  {sections.map((sec) => (
                    <option key={sec.id} value={sec.id}>
                      {sec.titleAr}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => {
                    onBulkChangeCategory(selectedQuestionIds, bulkTargetCategory);
                    setSelectedQuestionIds([]);
                  }}
                  className="px-2.5 py-1 bg-[#7c2529] text-white text-[11px] font-bold rounded-md cursor-pointer"
                >
                  نقل للقسم
                </button>
              </div>
            )}

            {canEdit && onBulkDeleteQuestions && (
              <button
                type="button"
                onClick={() => {
                  onBulkDeleteQuestions(selectedQuestionIds);
                  setSelectedQuestionIds([]);
                }}
                className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white text-xs font-bold rounded-lg flex items-center gap-1.5 cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>حذف المحدد ({selectedQuestionIds.length})</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => setSelectedQuestionIds([])}
              className="px-2.5 py-1.5 text-xs font-semibold text-slate-600 hover:text-slate-900 cursor-pointer"
            >
              إلغاء التحديد
            </button>
          </div>
        </div>
      )}

      {/* Question Editor Form (Supports Single Choice & Multiple Choice Answers #8) */}
      {isEditing && canEdit && (
        <div className="bg-white border-2 border-[#7c2529]/30 rounded-2xl p-6 md:p-8 space-y-6 shadow-xs">
          <div className="flex items-center justify-between pb-4 border-b border-slate-200">
            <h3 className="text-base font-bold text-[#7c2529]">
              {editingId ? 'تعديل بيانات السؤال' : 'إضافة سؤال معياري جديد إلى البنك المحلي'}
            </h3>
            <button
              type="button"
              onClick={() => setIsEditing(false)}
              className="text-slate-400 hover:text-slate-700 cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <form onSubmit={handleSubmitForm} className="space-y-5">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  قسم الاختبار
                </label>
                <select
                  value={category}
                  onChange={(e) => {
                    const newCat = e.target.value;
                    setCategory(newCat);
                    setSubSkill(
                      newCat === 'ENGLISH'
                        ? 'grammar'
                        : newCat === 'IQ'
                        ? 'numerical_series'
                        : 'general_skill'
                    );
                  }}
                  className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-300 rounded-xl focus:outline-none focus:border-[#7c2529]"
                >
                  {sections.map((sec) => (
                    <option key={sec.id} value={sec.id}>
                      {sec.titleAr}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  المهارة الفرعية
                </label>
                <select
                  value={subSkill}
                  onChange={(e) => setSubSkill(e.target.value)}
                  className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-300 rounded-xl focus:outline-none focus:border-[#7c2529]"
                >
                  {Object.entries(SUB_SKILL_LABELS)
                    .filter(
                      ([key, info]) =>
                        info.category === category || key === 'general_skill'
                    )
                    .map(([key, info]) => (
                      <option key={key} value={key}>
                        {info.ar}
                      </option>
                    ))}
                </select>
                {subSkill === 'general_skill' && (
                  <input
                    type="text"
                    value={customSubSkill}
                    onChange={(e) => setCustomSubSkill(e.target.value)}
                    placeholder="اكتب اسم المهارة الفرعية..."
                    className="mt-2 w-full px-3 py-1.5 text-xs bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-[#7c2529]"
                  />
                )}
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  مستوى الصعوبة
                </label>
                <select
                  value={difficulty}
                  onChange={(e) => setDifficulty(e.target.value as DifficultyLevel)}
                  className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-300 rounded-xl focus:outline-none focus:border-[#7c2529]"
                >
                  <option value="easy">أساسي</option>
                  <option value="medium">متوسط</option>
                  <option value="hard">متقدم</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#7c2529] mb-1.5">
                  نوع الإجابة (مفرد / متعدد)
                </label>
                <select
                  value={selectionType}
                  onChange={(e) =>
                    setSelectionType(e.target.value as QuestionSelectionType)
                  }
                  className="w-full px-3 py-2 text-sm font-bold text-[#7c2529] bg-[#FAF8F7] border border-[#7c2529]/40 rounded-xl focus:outline-none focus:border-[#7c2529]"
                >
                  <option value="single">اختيار مفرد (إجابة واحدة)</option>
                  <option value="multiple">اختيار متعدد (عدة إجابات صحيحة)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  الزمن المخصص للسؤال (ثانية)
                </label>
                <input
                  type="number"
                  min={15}
                  max={180}
                  value={timeLimit}
                  onChange={(e) => setTimeLimit(Number(e.target.value))}
                  className="w-full px-3 py-2 text-sm font-mono-tabular bg-slate-50 border border-slate-300 rounded-xl focus:outline-none focus:border-[#7c2529]"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                نص القطعة أو السياق المرجعي (اختياري)
              </label>
              <textarea
                rows={2}
                dir={category === 'ENGLISH' ? 'ltr' : 'rtl'}
                value={contextPassage}
                onChange={(e) => setContextPassage(e.target.value)}
                placeholder="أدخل الفقرة النصية هنا إن وجدت..."
                className="w-full px-3.5 py-2 text-sm bg-slate-50 border border-slate-300 rounded-xl focus:outline-none focus:border-[#7c2529]"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                نص السؤال
              </label>
              <textarea
                rows={2}
                required
                dir={category === 'ENGLISH' ? 'ltr' : 'rtl'}
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="اكتب نص السؤال بوضوح..."
                className="w-full px-3.5 py-2 text-sm bg-slate-50 border border-slate-300 rounded-xl focus:outline-none focus:border-[#7c2529]"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-2">
                {selectionType === 'multiple'
                  ? 'الخيارات الأربعة (حدد جميع الإجابات الصحيحة عبر مربعات الاختيار المتعدد)'
                  : 'الخيارات الأربعة (حدد الخيار الصحيح الوحيد للسؤال)'}
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {options.map((opt, idx) => {
                  const isCorrect =
                    selectionType === 'multiple'
                      ? correctIndices.includes(idx)
                      : correctIndex === idx;

                  return (
                    <div
                      key={idx}
                      className={`flex items-center gap-2.5 p-2.5 rounded-xl border ${
                        isCorrect
                          ? 'bg-[#ffc72c]/15 border-[#7c2529]'
                          : 'bg-slate-50 border-slate-200'
                      }`}
                    >
                      {selectionType === 'multiple' ? (
                        <input
                          type="checkbox"
                          checked={isCorrect}
                          onChange={() => handleToggleCorrectMultiOption(idx)}
                          className="w-4 h-4 accent-[#7c2529] shrink-0 cursor-pointer"
                          title="تحديد كإجابة صحيحة ضمن الاختيار المتعدد"
                        />
                      ) : (
                        <input
                          type="radio"
                          name="correctOption"
                          checked={isCorrect}
                          onChange={() => setCorrectIndex(idx)}
                          className="w-4 h-4 accent-[#7c2529] shrink-0 cursor-pointer"
                          title="تحديد كإجابة صحيحة"
                        />
                      )}
                      <input
                        type="text"
                        required={idx < 2}
                        dir={category === 'ENGLISH' ? 'ltr' : 'rtl'}
                        value={opt}
                        onChange={(e) => {
                          const copy = [...options];
                          copy[idx] = e.target.value;
                          setOptions(copy);
                        }}
                        placeholder={`الخيار ${idx + 1}`}
                        className="w-full bg-transparent text-sm focus:outline-none"
                      />
                    </div>
                  );
                })}
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                تفسير الإجابة الصحيحة (يظهر لمسؤول الموارد البشرية فقط)
              </label>
              <input
                type="text"
                value={explanation}
                onChange={(e) => setExplanation(e.target.value)}
                placeholder="شرح مختصر لطريقة الحل..."
                className="w-full px-3.5 py-2 text-sm bg-slate-50 border border-slate-300 rounded-xl focus:outline-none focus:border-[#7c2529]"
              />
            </div>

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-200">
              <button
                type="button"
                onClick={() => setIsEditing(false)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-900 cursor-pointer"
              >
                إلغاء
              </button>
              <button
                type="submit"
                className="px-5 py-2.5 bg-[#7c2529] hover:bg-[#631d20] text-white text-xs font-bold rounded-xl flex items-center gap-1.5 cursor-pointer"
              >
                <Check className="w-4 h-4 text-[#ffc72c]" />
                <span>حفظ السؤال في القاعدة المحلية</span>
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Filter Bar */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4 flex flex-wrap items-center justify-between gap-4 shadow-xs">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-100 rounded-xl">
            <button
              type="button"
              onClick={() => setFilterCategory('ALL')}
              className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-colors cursor-pointer ${
                filterCategory === 'ALL'
                  ? 'bg-[#7c2529] text-white'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              جميع الأقسام ({questions.length})
            </button>
            {sections.map((sec) => {
              const count = questions.filter((q) => q.category === sec.id).length;
              return (
                <button
                  key={sec.id}
                  type="button"
                  onClick={() => setFilterCategory(sec.id)}
                  className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-colors cursor-pointer ${
                    filterCategory === sec.id
                      ? 'bg-[#7c2529] text-white'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {sec.titleAr} ({count})
                </button>
              );
            })}
          </div>

          <select
            value={filterDifficulty}
            onChange={(e) => setFilterDifficulty(e.target.value as 'ALL' | DifficultyLevel)}
            className="px-3 py-1.5 text-xs font-semibold bg-slate-50 border border-slate-200 rounded-xl text-slate-700 focus:outline-none"
          >
            <option value="ALL">جميع مستويات الصعوبة</option>
            <option value="easy">أساسي</option>
            <option value="medium">متوسط</option>
            <option value="hard">متقدم</option>
          </select>
        </div>

        <div className="relative w-full sm:w-72">
          <Search className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="بحث في نص السؤال أو المهارة..."
            className="w-full pr-9 pl-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-[#7c2529]"
          />
        </div>
      </div>

      {/* Questions Table with Multi-Select Checkboxes (#8) */}
      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-right text-sm">
            <thead className="bg-[#FAF8F7] border-b border-slate-200 text-xs text-slate-600">
              <tr>
                <th className="py-3.5 px-4 w-10">
                  <input
                    type="checkbox"
                    checked={
                      filteredQuestions.length > 0 &&
                      filteredQuestions.every((q) => selectedQuestionIds.includes(q.id))
                    }
                    onChange={handleToggleSelectAllFiltered}
                    className="w-4 h-4 accent-[#7c2529] cursor-pointer"
                    title="تحديد / إلغاء تحديد الكل"
                  />
                </th>
                <th className="py-3.5 px-4 font-semibold">القسم والمهارة</th>
                <th className="py-3.5 px-4 font-semibold">المستوى ونوع الاختيار</th>
                <th className="py-3.5 px-4 font-semibold">نص السؤال والإجابة الصحيحة</th>
                <th className="py-3.5 px-4 font-semibold text-left">الزمن</th>
                <th className="py-3.5 px-4 font-semibold text-left">الاستخدام</th>
                {canEdit && (
                  <th className="py-3.5 px-4 font-semibold text-left">إجراءات</th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {filteredQuestions.map((q) => {
                const isSelected = selectedQuestionIds.includes(q.id);
                const isMulti =
                  q.selectionType === 'multiple' &&
                  q.correctOptionIndices &&
                  q.correctOptionIndices.length > 1;
                const correctDisplay = isMulti
                  ? q.correctOptionIndices!
                      .map((idx) => q.options[idx])
                      .filter(Boolean)
                      .join(' + ')
                  : q.options[q.correctOptionIndex];

                return (
                  <tr
                    key={q.id}
                    className={`hover:bg-slate-50/80 transition-colors ${
                      isSelected ? 'bg-[#ffc72c]/10' : ''
                    }`}
                  >
                    <td className="py-3.5 px-4 align-top">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => handleToggleSelectQuestion(q.id)}
                        className="mt-1 w-4 h-4 accent-[#7c2529] cursor-pointer"
                      />
                    </td>

                    <td className="py-3.5 px-4 align-top">
                      <div className="font-bold text-[#7c2529] text-xs">
                        {getSectionTitle(q.category)}
                      </div>
                      <div className="text-xs text-slate-600 mt-0.5">
                        {getSubSkillInfo(q.subSkill, q.category).ar}
                      </div>
                    </td>

                    <td className="py-3.5 px-4 align-top text-xs">
                      <div className="font-semibold text-slate-800">
                        {DIFFICULTY_LABELS[q.difficulty]}
                      </div>
                      <div className="text-[11px] text-slate-500 mt-0.5">
                        {isMulti ? 'اختيار متعدد الإجابات' : 'اختيار مفرد'}
                      </div>
                    </td>

                    <td
                      dir={q.category === 'ENGLISH' ? 'ltr' : 'rtl'}
                      className="py-3.5 px-4 align-top max-w-xl"
                    >
                      <div className="font-semibold text-slate-900 text-sm">{q.prompt}</div>
                      <div className="text-xs text-[#7c2529] mt-1">
                        الإجابة الصحيحة: <strong>{correctDisplay}</strong>
                      </div>
                    </td>

                    <td className="py-3.5 px-4 align-top text-left font-mono-tabular text-xs font-semibold text-slate-700">
                      {q.timeLimitSeconds} ثانية
                    </td>

                    <td className="py-3.5 px-4 align-top text-left font-mono-tabular text-xs text-slate-600">
                      {q.usageCount} مرات
                    </td>

                    {canEdit && (
                      <td className="py-3.5 px-4 align-top text-left">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => handleOpenEdit(q)}
                            className="p-1.5 text-slate-600 hover:text-[#7c2529] hover:bg-slate-100 rounded-md transition-colors cursor-pointer"
                            title="تعديل السؤال"
                          >
                            <Edit3 className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => onDeleteQuestion(q.id)}
                            className="p-1.5 text-slate-600 hover:text-red-700 hover:bg-red-50 rounded-md transition-colors cursor-pointer"
                            title="حذف السؤال"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                );
              })}
              {filteredQuestions.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-10 text-center text-sm text-slate-500">
                    لا توجد أسئلة مطابقة لمعايير البحث الحالية.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

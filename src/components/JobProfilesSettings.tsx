import React, { useState, useEffect } from 'react';
import {
  Sliders,
  Check,
  RotateCcw,
  Plus,
  Trash2,
  Save,
  Layers,
  CheckCircle2,
} from 'lucide-react';
import {
  AssessmentSectionConfig,
  distributeTotalQuestions,
  getEffectiveSections,
  JobProfile,
} from '../types/assessment';

interface JobProfilesSettingsProps {
  standardConfig: JobProfile;
  canEdit: boolean;
  onUpdateConfig: (updated: JobProfile) => void;
  onResetDefaults: () => void;
}

export const JobProfilesSettings: React.FC<JobProfilesSettingsProps> = ({
  standardConfig,
  canEdit,
  onUpdateConfig,
  onResetDefaults,
}) => {
  // Local draft state so user can modify settings and click the explicit Save button (#9)
  const [draftPassingScore, setDraftPassingScore] = useState<number>(
    standardConfig.passingScore
  );
  const [draftSections, setDraftSections] = useState<AssessmentSectionConfig[]>(() =>
    getEffectiveSections(standardConfig)
  );
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [savedNotice, setSavedNotice] = useState(false);

  // Add New Test Section Modal / Form state (#7)
  const [showAddSectionForm, setShowAddSectionForm] = useState(false);
  const [newSecCode, setNewSecCode] = useState('');
  const [newSecTitleAr, setNewSecTitleAr] = useState('');
  const [newSecDescAr, setNewSecDescAr] = useState('');
  const [newSecDirection, setNewSecDirection] = useState<'rtl' | 'ltr'>('rtl');
  const [newSecTotalQuestions, setNewSecTotalQuestions] = useState<number>(30);
  const [newSecTimeMinutes, setNewSecTimeMinutes] = useState<number>(20);
  const [newSecWeight, setNewSecWeight] = useState<number>(20);

  useEffect(() => {
    setDraftPassingScore(standardConfig.passingScore);
    setDraftSections(getEffectiveSections(standardConfig));
    setHasUnsavedChanges(false);
  }, [standardConfig]);

  // Update total question count for a section and automatically distribute across easy/medium/hard (#6)
  const handleTotalQuestionsChange = (sectionId: string, newTotal: number) => {
    if (!canEdit) return;
    const safeTotal = Math.max(1, Math.min(100, newTotal));
    const distributed = distributeTotalQuestions(safeTotal);
    setDraftSections((prev) =>
      prev.map((s) =>
        s.id === sectionId
          ? {
              ...s,
              totalQuestions: safeTotal,
              counts: distributed,
            }
          : s
      )
    );
    setHasUnsavedChanges(true);
  };

  // Update individual difficulty count for a section
  const handleDifficultyCountChange = (
    sectionId: string,
    diff: 'easy' | 'medium' | 'hard',
    val: number
  ) => {
    if (!canEdit) return;
    const safeVal = Math.max(0, Math.min(60, val));
    setDraftSections((prev) =>
      prev.map((s) => {
        if (s.id !== sectionId) return s;
        const nextCounts = { ...s.counts, [diff]: safeVal };
        const nextTotal = Math.max(
          1,
          nextCounts.easy + nextCounts.medium + nextCounts.hard
        );
        return {
          ...s,
          counts: nextCounts,
          totalQuestions: nextTotal,
        };
      })
    );
    setHasUnsavedChanges(true);
  };

  const handleSectionFieldChange = (
    sectionId: string,
    partial: Partial<AssessmentSectionConfig>
  ) => {
    if (!canEdit) return;
    setDraftSections((prev) =>
      prev.map((s) => (s.id === sectionId ? { ...s, ...partial } : s))
    );
    setHasUnsavedChanges(true);
  };

  // Add a brand new test type (#7)
  const handleAddNewTestSection = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canEdit || !newSecTitleAr.trim()) return;

    const cleanId =
      newSecCode
        .trim()
        .toUpperCase()
        .replace(/[^A-Z0-9_]/g, '_') || `TEST_${Date.now().toString().slice(-4)}`;

    if (draftSections.some((s) => s.id === cleanId)) return;

    const counts = distributeTotalQuestions(newSecTotalQuestions);
    const createdSection: AssessmentSectionConfig = {
      id: cleanId,
      titleAr: newSecTitleAr.trim(),
      titleEn: cleanId,
      descriptionAr:
        newSecDescAr.trim() ||
        'اختبار معياري مخصص لتقييم المتقدمين في بنك الكريمي الإسلامي.',
      direction: newSecDirection,
      weight: Math.max(5, Math.min(100, newSecWeight)),
      totalQuestions: newSecTotalQuestions,
      counts,
      timeLimitMinutes: Math.max(5, Math.min(120, newSecTimeMinutes)),
      enabledByDefault: true,
    };

    const nextSections = [...draftSections, createdSection];
    setDraftSections(nextSections);
    setHasUnsavedChanges(true);

    // Also persist immediately so the user sees it right away
    saveToParent(draftPassingScore, nextSections);

    setNewSecCode('');
    setNewSecTitleAr('');
    setNewSecDescAr('');
    setNewSecTotalQuestions(30);
    setNewSecTimeMinutes(20);
    setNewSecWeight(20);
    setShowAddSectionForm(false);
  };

  const handleDeleteCustomSection = (sectionId: string) => {
    if (!canEdit || sectionId === 'IQ' || sectionId === 'ENGLISH') return;
    const nextSections = draftSections.filter((s) => s.id !== sectionId);
    setDraftSections(nextSections);
    setHasUnsavedChanges(true);
  };

  const saveToParent = (
    passingScoreVal: number,
    sectionsList: AssessmentSectionConfig[]
  ) => {
    const iqSec = sectionsList.find((s) => s.id === 'IQ') || sectionsList[0];
    const enSec = sectionsList.find((s) => s.id === 'ENGLISH') || sectionsList[1] || iqSec;

    const timeMap: Record<string, number> = {};
    for (const s of sectionsList) {
      timeMap[s.id] = s.timeLimitMinutes;
    }

    const updatedProfile: JobProfile = {
      ...standardConfig,
      passingScore: passingScoreVal,
      iqWeight: iqSec ? iqSec.weight : 60,
      englishWeight: enSec ? enSec.weight : 40,
      iqCounts: iqSec ? iqSec.counts : { easy: 12, medium: 12, hard: 6 },
      englishCounts: enSec ? enSec.counts : { easy: 12, medium: 12, hard: 6 },
      sectionTimeLimitMinutes: timeMap,
      sections: sectionsList,
    };

    onUpdateConfig(updatedProfile);
    setHasUnsavedChanges(false);
    setSavedNotice(true);
    setTimeout(() => setSavedNotice(false), 3500);
  };

  const handleExplicitSave = () => {
    if (!canEdit) return;
    saveToParent(draftPassingScore, draftSections);
  };

  const totalAllQuestions = draftSections.reduce(
    (acc, s) => acc + (s.counts.easy + s.counts.medium + s.counts.hard),
    0
  );

  return (
    <div className="space-y-6">
      {/* Header with Explicit Save Button (#9) & Add New Test Section Button (#7) */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 flex flex-wrap items-center justify-between gap-4 shadow-xs">
        <div>
          <h2 className="text-xl font-bold text-[#7c2529]">
            إعدادات التقييم والأوزان وإدارة أقسام الاختبارات
          </h2>
          <p className="text-xs text-slate-600 mt-1">
            تحكم في عدد الأسئلة لكل اختبار، الأوزان النسبية، درجة الاجتياز، أو أضف اختبارات تخصصية جديدة تظهر للمتقدمين.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {canEdit && (
            <>
              <button
                type="button"
                onClick={() => setShowAddSectionForm(!showAddSectionForm)}
                className="px-4 py-2.5 text-xs font-bold text-[#7c2529] bg-[#ffc72c]/25 hover:bg-[#ffc72c]/40 border border-[#ffc72c] rounded-xl flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <Plus className="w-4 h-4 text-[#7c2529]" />
                <span>إضافة اختبار بنوع جديد</span>
              </button>

              <button
                type="button"
                onClick={onResetDefaults}
                className="px-3.5 py-2.5 text-xs font-semibold text-slate-700 hover:text-slate-900 border border-slate-300 rounded-xl hover:bg-slate-50 flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>استعادة الافتراضي</span>
              </button>

              <button
                type="button"
                onClick={handleExplicitSave}
                className="px-5 py-2.5 bg-[#7c2529] hover:bg-[#631d20] text-white text-xs font-bold rounded-xl flex items-center gap-2 transition-colors shadow-xs cursor-pointer"
              >
                <Save className="w-4 h-4 text-[#ffc72c]" />
                <span>حفظ إعدادات التقييم والأوزان</span>
              </button>
            </>
          )}
        </div>
      </div>

      {/* Save Confirmation Banner */}
      {savedNotice && (
        <div className="bg-emerald-50 border-2 border-emerald-600/30 text-emerald-900 px-5 py-3.5 rounded-xl text-xs font-bold flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-700" />
            <span>
              تم حفظ واعتماد إعدادات التقييم والأوزان وعدد الأسئلة لجميع الاختبارات بنجاح.
            </span>
          </div>
          <span className="text-[11px] font-mono-tabular text-emerald-700">معتمد ونشط</span>
        </div>
      )}

      {/* Modal/Form to Add a Brand New Test Type (#7) */}
      {showAddSectionForm && canEdit && (
        <div className="bg-white border-2 border-[#7c2529] rounded-2xl p-6 md:p-8 space-y-5 shadow-xs">
          <div className="flex items-center justify-between pb-3 border-b border-slate-200">
            <h3 className="text-base font-bold text-[#7c2529] flex items-center gap-2">
              <Layers className="w-5 h-5 text-[#7c2529]" />
              <span>إضافة قسم اختبار جديد إلى المنصة (مثل: المحاسبة، الحاسوب، الصيرفة الإسلامية)</span>
            </h3>
          </div>

          <form onSubmit={handleAddNewTestSection} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-800 mb-1.5">
                  اسم الاختبار الجديد (يظهر للمختبر)
                </label>
                <input
                  type="text"
                  required
                  value={newSecTitleAr}
                  onChange={(e) => setNewSecTitleAr(e.target.value)}
                  placeholder="مثال: اختبار المحاسبة والعمليات المصرفية"
                  className="w-full px-3.5 py-2.5 text-sm bg-slate-50 border border-slate-300 rounded-xl focus:outline-none focus:border-[#7c2529]"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-800 mb-1.5">
                  الرمز التعريفي للقسم (بالحروف الإنجليزية)
                </label>
                <input
                  type="text"
                  required
                  dir="ltr"
                  value={newSecCode}
                  onChange={(e) => setNewSecCode(e.target.value.toUpperCase())}
                  placeholder="ACCOUNTING / IT_SKILLS"
                  className="w-full px-3.5 py-2.5 text-sm font-mono-tabular bg-slate-50 border border-slate-300 rounded-xl focus:outline-none focus:border-[#7c2529]"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-800 mb-1.5">
                  اتجاه عرض الأسئلة
                </label>
                <select
                  value={newSecDirection}
                  onChange={(e) => setNewSecDirection(e.target.value as 'rtl' | 'ltr')}
                  className="w-full px-3.5 py-2.5 text-sm bg-slate-50 border border-slate-300 rounded-xl focus:outline-none focus:border-[#7c2529]"
                >
                  <option value="rtl">من اليمين لليسار (اختبار باللغة العربية)</option>
                  <option value="ltr">من اليسار لليمين (اختبار باللغة الإنجليزية)</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-800 mb-1.5">
                  عدد الأسئلة الإجمالي لهذا الاختبار
                </label>
                <input
                  type="number"
                  min={1}
                  max={100}
                  value={newSecTotalQuestions}
                  onChange={(e) => setNewSecTotalQuestions(Number(e.target.value))}
                  className="w-full px-3.5 py-2.5 text-sm font-mono-tabular font-bold bg-slate-50 border border-slate-300 rounded-xl focus:outline-none focus:border-[#7c2529]"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-800 mb-1.5">
                  الزمن المخصص للاختبار (بالدقائق)
                </label>
                <input
                  type="number"
                  min={5}
                  max={120}
                  value={newSecTimeMinutes}
                  onChange={(e) => setNewSecTimeMinutes(Number(e.target.value))}
                  className="w-full px-3.5 py-2.5 text-sm font-mono-tabular font-bold bg-slate-50 border border-slate-300 rounded-xl focus:outline-none focus:border-[#7c2529]"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-800 mb-1.5">
                  الوزن النسبي في التقييم (%)
                </label>
                <input
                  type="number"
                  min={5}
                  max={100}
                  value={newSecWeight}
                  onChange={(e) => setNewSecWeight(Number(e.target.value))}
                  className="w-full px-3.5 py-2.5 text-sm font-mono-tabular font-bold bg-slate-50 border border-slate-300 rounded-xl focus:outline-none focus:border-[#7c2529]"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-800 mb-1.5">
                وصف مختصر للاختبار (يظهر للمتقدم في بطاقة اختيار القسم)
              </label>
              <input
                type="text"
                value={newSecDescAr}
                onChange={(e) => setNewSecDescAr(e.target.value)}
                placeholder="مثال: يقيس الإلمام بالقيود المحاسبية، العمليات المصرفية، ومعايير الصيرفة الإسلامية."
                className="w-full px-3.5 py-2.5 text-sm bg-slate-50 border border-slate-300 rounded-xl focus:outline-none focus:border-[#7c2529]"
              />
            </div>

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-200">
              <button
                type="button"
                onClick={() => setShowAddSectionForm(false)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-900 cursor-pointer"
              >
                إلغاء
              </button>
              <button
                type="submit"
                className="px-6 py-2.5 bg-[#7c2529] hover:bg-[#631d20] text-white text-xs font-bold rounded-xl flex items-center gap-1.5 cursor-pointer"
              >
                <Check className="w-4 h-4 text-[#ffc72c]" />
                <span>إضافة الاختبار الجديد واعتماده</span>
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Main Configuration Workspace */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 md:p-8 space-y-8 shadow-xs">
        <div className="flex flex-wrap items-center justify-between gap-4 pb-5 border-b border-slate-200">
          <div>
            <h3 className="text-lg font-bold text-[#7c2529]">
              المعايير العامة وأقسام الاختبارات المتاحة في المنصة
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              يمكنك تحديد عدد الأسئلة لكل اختبار والوزن النسبي والأقسام التي تظهر افتراضياً عند تسجيل متقدم جديد
            </p>
          </div>
          <div className="text-left font-mono-tabular bg-[#FAF8F7] border border-slate-200 rounded-xl px-4 py-2">
            <div className="text-[11px] text-slate-500">
              إجمالي الأقسام المعرّفة ({draftSections.length} أقسام)
            </div>
            <div className="text-base font-bold text-[#7c2529]">
              مجموع الأسئلة: {totalAllQuestions} سؤالاً
            </div>
          </div>
        </div>

        {/* Section 1: Passing Cut-off Score */}
        <div className="space-y-4">
          <h4 className="text-sm font-bold text-slate-900 flex items-center gap-2">
            <Sliders className="w-4 h-4 text-[#7c2529]" />
            <span>1. الحد الأدنى لدرجة الاجتياز الكلية الموزونة</span>
          </h4>

          <div className="p-5 bg-[#FAF8F7] border border-slate-200 rounded-xl max-w-2xl">
            <label className="block text-xs font-semibold text-slate-800 mb-2">
              درجة الاجتياز المعيارية المطلوبة (%):{' '}
              <span className="font-mono-tabular font-bold text-base text-[#7c2529]">
                {draftPassingScore}%
              </span>
            </label>
            <input
              type="range"
              disabled={!canEdit}
              min={50}
              max={95}
              step={1}
              value={draftPassingScore}
              onChange={(e) => {
                setDraftPassingScore(Number(e.target.value));
                setHasUnsavedChanges(true);
              }}
              className="w-full accent-[#7c2529] cursor-pointer"
            />
            <div className="flex items-center justify-between text-[11px] text-slate-500 mt-1 font-mono-tabular">
              <span>50%</span>
              <span>70% (معياري)</span>
              <span>95%</span>
            </div>
          </div>
        </div>

        {/* Section 2: Dynamic Test Sections & Question Counts per Test (#6 & #7) */}
        <div className="space-y-4">
          <h4 className="text-sm font-bold text-slate-900 flex items-center gap-2">
            <Layers className="w-4 h-4 text-[#7c2529]" />
            <span>
              2. تخصيص أقسام الاختبارات وتحديد عدد الأسئلة والوزن لكل اختبار
            </span>
          </h4>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {draftSections.map((sec) => {
              const secTotal = sec.counts.easy + sec.counts.medium + sec.counts.hard;
              const isCore = sec.id === 'IQ' || sec.id === 'ENGLISH';

              return (
                <div
                  key={sec.id}
                  className="p-5 bg-[#FAF8F7] border border-slate-200 rounded-2xl space-y-4 flex flex-col justify-between"
                >
                  <div className="space-y-4">
                    <div className="flex items-start justify-between gap-2 pb-3 border-b border-slate-200">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-mono-tabular text-[11px] font-bold bg-[#7c2529] text-[#ffc72c] px-2 py-0.5 rounded-md">
                            {sec.id}
                          </span>
                          <h5 className="text-sm font-bold text-slate-900">{sec.titleAr}</h5>
                        </div>
                        <p className="text-xs text-slate-500 mt-1">{sec.descriptionAr}</p>
                      </div>

                      {!isCore && canEdit && (
                        <button
                          type="button"
                          onClick={() => handleDeleteCustomSection(sec.id)}
                          className="p-1.5 text-slate-400 hover:text-red-600 rounded-lg transition-colors cursor-pointer"
                          title="حذف هذا القسم"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>

                    {/* Primary Controls: Total Questions (#6), Weight, Time Limit */}
                    <div className="grid grid-cols-3 gap-3 bg-white p-3.5 rounded-xl border border-slate-200">
                      <div>
                        <label className="block text-[11px] font-bold text-[#7c2529] mb-1">
                          إجمالي عدد الأسئلة
                        </label>
                        <input
                          type="number"
                          disabled={!canEdit}
                          min={1}
                          max={100}
                          value={secTotal}
                          onChange={(e) =>
                            handleTotalQuestionsChange(sec.id, Number(e.target.value))
                          }
                          className="w-full px-2.5 py-1.5 text-center font-mono-tabular font-bold text-sm text-[#7c2529] bg-[#FAF8F7] border border-[#7c2529]/30 rounded-lg focus:outline-none focus:border-[#7c2529]"
                        />
                      </div>

                      <div>
                        <label className="block text-[11px] font-bold text-slate-700 mb-1">
                          الوزن النسبي (%)
                        </label>
                        <input
                          type="number"
                          disabled={!canEdit}
                          min={5}
                          max={100}
                          value={sec.weight}
                          onChange={(e) =>
                            handleSectionFieldChange(sec.id, {
                              weight: Math.max(5, Math.min(100, Number(e.target.value))),
                            })
                          }
                          className="w-full px-2.5 py-1.5 text-center font-mono-tabular font-bold text-sm bg-[#FAF8F7] border border-slate-300 rounded-lg focus:outline-none focus:border-[#7c2529]"
                        />
                      </div>

                      <div>
                        <label className="block text-[11px] font-bold text-slate-700 mb-1">
                          الزمن (بالدقائق)
                        </label>
                        <input
                          type="number"
                          disabled={!canEdit}
                          min={5}
                          max={120}
                          value={sec.timeLimitMinutes}
                          onChange={(e) =>
                            handleSectionFieldChange(sec.id, {
                              timeLimitMinutes: Math.max(5, Number(e.target.value)),
                            })
                          }
                          className="w-full px-2.5 py-1.5 text-center font-mono-tabular font-bold text-sm bg-[#FAF8F7] border border-slate-300 rounded-lg focus:outline-none focus:border-[#7c2529]"
                        />
                      </div>
                    </div>

                    {/* Stratified Breakdown (Easy / Medium / Hard) */}
                    <div className="space-y-2.5 text-xs pt-1">
                      <div className="text-[11px] font-semibold text-slate-500">
                        توزيع مستوى الصعوبة داخل الـ ({secTotal}) سؤالاً:
                      </div>
                      <div className="grid grid-cols-3 gap-2.5">
                        <div className="bg-white border border-slate-200 rounded-lg p-2 text-center">
                          <span className="block text-[11px] text-slate-500 mb-1">أساسي</span>
                          <input
                            type="number"
                            disabled={!canEdit}
                            min={0}
                            max={60}
                            value={sec.counts.easy}
                            onChange={(e) =>
                              handleDifficultyCountChange(
                                sec.id,
                                'easy',
                                Number(e.target.value)
                              )
                            }
                            className="w-full text-center font-mono-tabular font-bold text-slate-900 bg-slate-50 border border-slate-200 rounded-md py-1"
                          />
                        </div>

                        <div className="bg-white border border-slate-200 rounded-lg p-2 text-center">
                          <span className="block text-[11px] text-slate-500 mb-1">متوسط</span>
                          <input
                            type="number"
                            disabled={!canEdit}
                            min={0}
                            max={60}
                            value={sec.counts.medium}
                            onChange={(e) =>
                              handleDifficultyCountChange(
                                sec.id,
                                'medium',
                                Number(e.target.value)
                              )
                            }
                            className="w-full text-center font-mono-tabular font-bold text-slate-900 bg-slate-50 border border-slate-200 rounded-md py-1"
                          />
                        </div>

                        <div className="bg-white border border-slate-200 rounded-lg p-2 text-center">
                          <span className="block text-[11px] text-slate-500 mb-1">متقدم</span>
                          <input
                            type="number"
                            disabled={!canEdit}
                            min={0}
                            max={60}
                            value={sec.counts.hard}
                            onChange={(e) =>
                              handleDifficultyCountChange(
                                sec.id,
                                'hard',
                                Number(e.target.value)
                              )
                            }
                            className="w-full text-center font-mono-tabular font-bold text-slate-900 bg-slate-50 border border-slate-200 rounded-md py-1"
                          />
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Default Visibility Toggle when creating a new candidate test */}
                  <div className="pt-3 mt-3 border-t border-slate-200">
                    <label className="flex items-center gap-2 text-xs font-semibold text-slate-800 cursor-pointer">
                      <input
                        type="checkbox"
                        disabled={!canEdit}
                        checked={sec.enabledByDefault !== false}
                        onChange={(e) =>
                          handleSectionFieldChange(sec.id, {
                            enabledByDefault: e.target.checked,
                          })
                        }
                        className="w-4 h-4 accent-[#7c2529]"
                      />
                      <span>تفعيل هذا القسم افتراضياً عند إنشاء اختبار لمتقدم جديد</span>
                    </label>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Bottom Save Bar (#9) */}
        {canEdit && (
          <div className="pt-6 border-t border-slate-200 flex flex-wrap items-center justify-between gap-4">
            <div className="text-xs text-slate-600">
              {hasUnsavedChanges ? (
                <span className="text-amber-700 font-bold">
                  لديك تعديلات غير محفوظة — اضغط على زر «حفظ إعدادات التقييم والأوزان» لاعتمادها.
                </span>
              ) : (
                <span>جميع الإعدادات والأوزان الحالية محفوظة ومعتمدة في النظام.</span>
              )}
            </div>

            <button
              type="button"
              onClick={handleExplicitSave}
              className="px-8 py-3.5 bg-[#7c2529] hover:bg-[#631d20] text-white text-sm font-bold rounded-xl flex items-center gap-2 transition-colors shadow-xs cursor-pointer"
            >
              <Save className="w-4 h-4 text-[#ffc72c]" />
              <span>حفظ إعدادات التقييم والأوزان</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

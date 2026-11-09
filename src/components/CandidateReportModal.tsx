import React from 'react';
import {
  Printer,
  ArrowRight,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  ShieldCheck,
  Clock,
  Award,
  BarChart3,
} from 'lucide-react';
import { CandidateSession, JobProfile, KIB_BRAND } from '../types/assessment';
import { calculatePercentile, calculateOverlapRate } from '../utils/assessmentEngine';

interface CandidateReportModalProps {
  session: CandidateSession;
  standardConfig?: JobProfile;
  allSessions: CandidateSession[];
  onClose: () => void;
}

export const CandidateReportModal: React.FC<CandidateReportModalProps> = ({
  session,
  standardConfig,
  allSessions,
  onClose,
}) => {
  const evaluation = session.evaluation;
  if (!evaluation) return null;

  const completedSessions = allSessions.filter((s) => s.status === 'completed' && s.evaluation);
  const percentile = calculatePercentile(evaluation.weightedTotalScore, completedSessions);
  const overlapRate = calculateOverlapRate(session, allSessions);

  const avgGeneralScore =
    completedSessions.length > 0
      ? Math.round(
          completedSessions.reduce(
            (acc, s) => acc + (s.evaluation?.weightedTotalScore || 0),
            0
          ) / completedSessions.length
        )
      : 72;

  const recommendationMap = {
    STRONGLY_RECOMMENDED: {
      label: 'موصى به بشدة للقبول والمقابلة النهائية',
      color: 'text-[#7c2529]',
      icon: CheckCircle2,
    },
    QUALIFIED_FOR_INTERVIEW: {
      label: 'مؤهل للمقابلة الشخصية',
      color: 'text-emerald-700',
      icon: CheckCircle2,
    },
    BORDERLINE_REVIEW: {
      label: 'أداء حدي — يتطلب مراجعة لجنة التوظيف',
      color: 'text-amber-700',
      icon: AlertTriangle,
    },
    NOT_QUALIFIED: {
      label: 'غير مجتاز للحد الأدنى المعياري للاختبار',
      color: 'text-red-700',
      icon: XCircle,
    },
  };

  const recInfo = recommendationMap[evaluation.recommendation];
  const RecIcon = recInfo.icon;

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-8 md:p-10 space-y-8 shadow-xs">
      {/* Top Action Bar (Hidden in Print) */}
      <div className="no-print flex flex-wrap items-center justify-between gap-4 pb-6 border-b border-slate-200">
        <button
          type="button"
          onClick={onClose}
          className="px-4 py-2.5 text-xs font-semibold text-slate-700 hover:text-slate-900 border border-slate-300 rounded-xl hover:bg-slate-50 flex items-center gap-2 transition-colors cursor-pointer"
        >
          <ArrowRight className="w-4 h-4" />
          <span>العودة لسجل النتائج والتحليلات</span>
        </button>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => window.print()}
            className="px-5 py-2.5 bg-[#7c2529] hover:bg-[#631d20] text-white text-xs font-bold rounded-xl flex items-center gap-2 transition-colors cursor-pointer"
          >
            <Printer className="w-4 h-4 text-[#ffc72c]" />
            <span>طباعة التقرير الرسمي لاعتماد التوظيف</span>
          </button>
        </div>
      </div>

      {/* Official Bank Report Header with Attached Logo */}
      <div className="flex flex-wrap items-start justify-between gap-6 pb-6 border-b-2 border-[#7c2529]">
        <div className="flex items-center gap-5">
          <img
            src={KIB_BRAND.logoLightBg}
            alt="بنك الكريمي الإسلامي"
            referrerPolicy="no-referrer"
            className="h-14 w-auto object-contain shrink-0"
          />
          <div>
            <div className="text-xs font-bold text-[#7c2529]">
              بنك الكريمي الإسلامي — قطاع الموارد البشرية والتطوير المؤسسي
            </div>
            <h1 className="text-2xl font-bold text-slate-900 mt-0.5">
              تقرير التقييم والاختبار المعياري للمتقدم الجديد
            </h1>
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600 mt-1.5">
              <span>تاريخ التقييم: {new Date(session.createdAt).toLocaleDateString('ar-YE')}</span>
              <span aria-hidden="true">·</span>
              <span className="font-mono-tabular font-semibold text-[#7c2529]">
                رمز الجلسة: {session.otpCode}
              </span>
            </div>
          </div>
        </div>

        <div className="text-left bg-[#FAF8F7] border border-slate-200 rounded-xl p-4 min-w-[250px]">
          <div className="text-xs text-slate-500">التوصية المعيارية للنظام</div>
          <div className={`text-sm font-bold mt-1 flex items-center gap-1.5 ${recInfo.color}`}>
            <RecIcon className="w-4 h-4 shrink-0" />
            <span>{recInfo.label}</span>
          </div>
          <div className="text-xs text-slate-600 mt-1">
            درجة الاجتياز المعيارية المعتمدة:{' '}
            <span className="font-mono-tabular font-bold">{standardConfig?.passingScore || 70}%</span>
          </div>
        </div>
      </div>

      {/* Candidate Metadata Grid (No Branch & No Job Title) */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 p-5 bg-[#FAF8F7] border border-slate-200 rounded-xl text-sm">
        <div>
          <div className="text-xs text-slate-500">اسم المتقدم الرباعي</div>
          <div className="font-bold text-slate-900 mt-0.5">{session.candidateName}</div>
        </div>
        <div>
          <div className="text-xs text-slate-500">الرقم الوطني / رقم الهوية</div>
          <div className="font-mono-tabular font-bold text-slate-900 mt-0.5">
            {session.nationalId}
          </div>
        </div>
        <div>
          <div className="text-xs text-slate-500">رقم الهاتف الجوال</div>
          <div className="font-mono-tabular font-bold text-slate-900 mt-0.5">{session.phone}</div>
        </div>
      </div>

      {/* Primary Psychometric Scorecards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="p-5 bg-white border-2 border-[#7c2529]/20 rounded-xl">
          <div className="text-xs text-slate-500">الدرجة الكلية الموزونة</div>
          <div className="text-3xl font-bold font-mono-tabular text-[#7c2529] mt-1">
            {evaluation.weightedTotalScore}%
          </div>
          <div className="text-xs text-slate-600 mt-1.5">
            متوسط المتقدمين العام:{' '}
            <span className="font-mono-tabular font-semibold">{avgGeneralScore}%</span>
          </div>
        </div>

        <div className="p-5 bg-white border border-slate-200 rounded-xl">
          <div className="text-xs text-slate-500">
            القدرات الذهنية والذكاء (IQ — وزن {standardConfig?.iqWeight || 50}%)
          </div>
          <div className="text-3xl font-bold font-mono-tabular text-slate-900 mt-1">
            {evaluation.iqScore}%
          </div>
          <div className="text-xs text-slate-600 mt-1.5 font-mono-tabular">
            {evaluation.iqCorrect} إجابات صحيحة من {evaluation.iqTotal}
          </div>
        </div>

        <div className="p-5 bg-white border border-slate-200 rounded-xl">
          <div className="text-xs text-slate-500">
            اللغة الإنجليزية المصرفية (وزن {standardConfig?.englishWeight || 50}%)
          </div>
          <div className="text-3xl font-bold font-mono-tabular text-slate-900 mt-1">
            {evaluation.englishScore}%
          </div>
          <div className="text-xs text-slate-600 mt-1.5 font-mono-tabular">
            {evaluation.englishCorrect} إجابات صحيحة من {evaluation.englishTotal}
          </div>
        </div>

        <div className="p-5 bg-white border border-slate-200 rounded-xl">
          <div className="text-xs text-slate-500">الترتيب المئوي المعياري (Percentile)</div>
          <div className="text-3xl font-bold font-mono-tabular text-[#7c2529] mt-1">
            أعلى من {percentile}%
          </div>
          <div className="text-xs text-slate-600 mt-1.5">
            مقارنة بجميع المختبرين في قاعدة البنك
          </div>
        </div>
      </div>

      {/* Sub-Skill Analytical Breakdown */}
      <div className="space-y-4 print-break-inside-avoid">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold text-[#7c2529] flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-[#7c2529]" />
            <span>تحليل الكفاءات والمهارات الفرعية التفصيلي</span>
          </h2>
          <span className="text-xs text-slate-500">
            مرتبة حسب القسم ومستوى الإتقان والسرعة الزمنية
          </span>
        </div>

        <div className="border border-slate-200 rounded-xl overflow-hidden">
          <table className="w-full text-right text-sm">
            <thead className="bg-[#FAF8F7] border-b border-slate-200 text-xs text-slate-600">
              <tr>
                <th className="py-3 px-4 font-semibold">المهارة الفرعية</th>
                <th className="py-3 px-4 font-semibold">القسم</th>
                <th className="py-3 px-4 font-semibold text-left">الإجابات الصحيحة</th>
                <th className="py-3 px-4 font-semibold text-left">متوسط زمن السؤال</th>
                <th className="py-3 px-4 font-semibold w-1/3">نسبة الإتقان</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {evaluation.subSkillBreakdown.map((item) => (
                <tr key={item.subSkill} className="hover:bg-slate-50/80">
                  <td className="py-3 px-4 font-semibold text-slate-900">{item.labelAr}</td>
                  <td className="py-3 px-4 text-xs text-slate-600">
                    {item.category === 'IQ' ? 'قدرات ذهنية (IQ)' : 'إنجليزية مصرفية'}
                  </td>
                  <td className="py-3 px-4 text-left font-mono-tabular font-semibold text-slate-800">
                    {item.correct} / {item.total}
                  </td>
                  <td className="py-3 px-4 text-left font-mono-tabular text-slate-600">
                    {item.avgTimeSeconds} ثانية
                  </td>
                  <td className="py-3 px-4">
                    <div className="flex items-center gap-3">
                      <div className="flex-1 h-2.5 bg-slate-100 rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full"
                          style={{
                            width: `${item.percentage}%`,
                            backgroundColor:
                              item.percentage >= 70
                                ? '#7c2529'
                                : item.percentage >= 50
                                ? '#ffc72c'
                                : '#dc2626',
                          }}
                        />
                      </div>
                      <span className="font-mono-tabular text-xs font-bold text-slate-900 w-10 text-left">
                        {item.percentage}%
                      </span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Integrity, Anti-Duplication & Security Audit */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 print-break-inside-avoid">
        <div className="p-5 bg-[#FAF8F7] border border-slate-200 rounded-xl space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-[#7c2529] flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-[#7c2529]" />
              <span>سجل النزاهة ومراقبة جلسة الكشك</span>
            </h3>
            <span className="font-mono-tabular text-xs font-bold text-slate-900">
              مؤشر الانضباط: {evaluation.integrityScore}%
            </span>
          </div>

          {session.securityLogs.length === 0 ? (
            <p className="text-xs text-emerald-800 leading-relaxed">
              لم يتم رصد أي محاولة خروج من وضع ملء الشاشة أو تبديل للنوافذ أو محاولة نسخ طوال فترة الجلسة. التزام تام بضوابط الاختبار.
            </p>
          ) : (
            <div className="space-y-2">
              {session.securityLogs.map((log) => (
                <div
                  key={log.id}
                  className="p-2.5 bg-white border border-red-200 rounded-lg text-xs text-red-800 flex items-start justify-between gap-2"
                >
                  <span>{log.description}</span>
                  <span className="font-mono-tabular text-[11px] text-slate-500 shrink-0">
                    {new Date(log.timestamp).toLocaleTimeString('ar-YE')}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="p-5 bg-[#FAF8F7] border border-slate-200 rounded-xl space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-[#7c2529] flex items-center gap-2">
              <Clock className="w-4 h-4 text-[#7c2529]" />
              <span>كفاءة الزمن وتفرد نموذج الاختبار</span>
            </h3>
            <span className="font-mono-tabular text-xs font-bold text-[#7c2529]">
              نسبة التفرد: {100 - overlapRate}%
            </span>
          </div>
          <div className="space-y-1.5 text-xs text-slate-700">
            <div className="flex items-center justify-between">
              <span>إجمالي الزمن الفعلي المستغرق:</span>
              <span className="font-mono-tabular font-bold">
                {Math.floor(evaluation.totalTimeSeconds / 60)} دقيقة و{' '}
                {evaluation.totalTimeSeconds % 60} ثانية
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span>متوسط سرعة الإجابة لكل سؤال:</span>
              <span className="font-mono-tabular font-bold">
                {evaluation.avgQuestionTimeSeconds} ثانية / سؤال
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span>توليد النموذج وخلط الخيارات:</span>
              <span className="font-semibold text-slate-900">
                عشوائي متوازن (30+ سؤال لكل قسم) مع تجميد فوري بعد الإكمال
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Question-by-Question Audit Log */}
      {session.questions.length > 0 && (
        <div className="space-y-4 print-break-inside-avoid">
          <h2 className="text-base font-bold text-[#7c2529] flex items-center gap-2">
            <Award className="w-5 h-5 text-[#7c2529]" />
            <span>سجل إجابات المتقدم التفصيلي (توثيق الأسئلة المسحوبة)</span>
          </h2>
          <div className="border border-slate-200 rounded-xl overflow-hidden">
            <table className="w-full text-right text-xs">
              <thead className="bg-[#FAF8F7] border-b border-slate-200 text-slate-600">
                <tr>
                  <th className="py-2.5 px-3 font-semibold">#</th>
                  <th className="py-2.5 px-3 font-semibold">القسم</th>
                  <th className="py-2.5 px-3 font-semibold">السؤال</th>
                  <th className="py-2.5 px-3 font-semibold">إجابة المتقدم</th>
                  <th className="py-2.5 px-3 font-semibold">الإجابة الصحيحة</th>
                  <th className="py-2.5 px-3 font-semibold text-left">الزمن</th>
                  <th className="py-2.5 px-3 font-semibold">التقييم</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {session.questions.map((q, idx) => {
                  const isCorrect =
                    q.selectedOptionIndex !== null &&
                    q.selectedOptionIndex === q.correctShuffledIndex;
                  const candidateAnswer =
                    q.selectedOptionIndex !== null
                      ? q.shuffledOptions[q.selectedOptionIndex]
                      : q.timedOut
                      ? 'انتهى وقت السؤال بدون إجابة'
                      : 'لم يُجب';

                  return (
                    <tr key={idx} className="hover:bg-slate-50/60">
                      <td className="py-2.5 px-3 font-mono-tabular font-bold text-slate-700">
                        {idx + 1}
                      </td>
                      <td className="py-2.5 px-3 text-slate-600">
                        {q.category === 'IQ' ? 'IQ' : 'English'}
                      </td>
                      <td className="py-2.5 px-3 text-slate-900 font-medium max-w-xs truncate">
                        {q.prompt}
                      </td>
                      <td className="py-2.5 px-3 text-slate-800">{candidateAnswer}</td>
                      <td className="py-2.5 px-3 text-slate-600">
                        {q.shuffledOptions[q.correctShuffledIndex]}
                      </td>
                      <td className="py-2.5 px-3 text-left font-mono-tabular text-slate-600">
                        {q.timeSpentSeconds} ث
                      </td>
                      <td className="py-2.5 px-3 font-bold">
                        {isCorrect ? (
                          <span className="text-emerald-800">صحيحة</span>
                        ) : (
                          <span className="text-red-700">خاطئة</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Signature Footer for Printed Official Copies */}
      <div className="pt-8 mt-6 border-t border-slate-300 grid grid-cols-3 gap-8 text-xs text-slate-700 print-break-inside-avoid">
        <div>
          <div className="font-bold text-slate-900">أخصائي التوظيف والاختبارات</div>
          <div className="mt-6 border-b border-dashed border-slate-400 w-44" />
          <div className="text-[11px] text-slate-500 mt-1">الاسم والتوقيع</div>
        </div>
        <div>
          <div className="font-bold text-slate-900">مدير إدارة الموارد البشرية</div>
          <div className="mt-6 border-b border-dashed border-slate-400 w-44" />
          <div className="text-[11px] text-slate-500 mt-1">الاعتماد والتوجيه</div>
        </div>
        <div>
          <div className="font-bold text-slate-900">ختم قطاع الموارد البشرية — بنك الكريمي</div>
          <div className="mt-6 border-b border-dashed border-slate-400 w-44" />
          <div className="text-[11px] text-slate-500 mt-1">التاريخ: ____ / ____ / 2026م</div>
        </div>
      </div>
    </div>
  );
};

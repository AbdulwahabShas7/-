import React from 'react';
import { BarChart3, PieChart, TrendingUp, Users } from 'lucide-react';
import { CandidateSession, SUB_SKILL_LABELS } from '../types/assessment';

interface AnalyticsChartsProps {
  completedSessions: CandidateSession[];
}

export const AnalyticsCharts: React.FC<AnalyticsChartsProps> = ({
  completedSessions,
}) => {
  const total = completedSessions.length;

  // 1. Recommendation Distribution for SVG Donut Chart
  const stronglyRec = completedSessions.filter(
    (s) => s.evaluation?.recommendation === 'STRONGLY_RECOMMENDED'
  ).length;
  const qualifiedRec = completedSessions.filter(
    (s) => s.evaluation?.recommendation === 'QUALIFIED_FOR_INTERVIEW'
  ).length;
  const borderlineRec = completedSessions.filter(
    (s) => s.evaluation?.recommendation === 'BORDERLINE_REVIEW'
  ).length;
  const notQualifiedRec = completedSessions.filter(
    (s) => s.evaluation?.recommendation === 'NOT_QUALIFIED'
  ).length;

  const segments = [
    { label: 'موصى به بشدة', count: stronglyRec, color: '#7c2529' },
    { label: 'مؤهل للمقابلة', count: qualifiedRec, color: '#ffc72c' },
    { label: 'مراجعة حدية', count: borderlineRec, color: '#b45309' },
    { label: 'غير مجتاز', count: notQualifiedRec, color: '#cbd5e1' },
  ];

  const radius = 60;
  const circumference = 2 * Math.PI * radius;
  let accumulatedPercent = 0;

  // 2. Candidate Score Comparison (IQ vs English for Top/Recent Candidates)
  const candidateComparison = completedSessions.slice(0, 5).map((s) => ({
    id: s.id,
    name: s.candidateName,
    iqScore: s.evaluation?.iqScore || 0,
    englishScore: s.evaluation?.englishScore || 0,
    totalScore: s.evaluation?.weightedTotalScore || 0,
  }));

  // 3. Sub-Skill Mastery Averages
  const subSkillStats = Object.entries(SUB_SKILL_LABELS).map(([key, info]) => {
    let sum = 0;
    let c = 0;
    for (const s of completedSessions) {
      const found = s.evaluation?.subSkillBreakdown.find((b) => b.subSkill === key);
      if (found) {
        sum += found.percentage;
        c++;
      }
    }
    return {
      key,
      labelAr: info.ar,
      category: info.category,
      avg: c > 0 ? Math.round(sum / c) : 0,
    };
  });

  return (
    <div className="space-y-6">
      {/* Row 1: Donut Chart (Recommendations) + Grouped Bar Chart (IQ vs English per Candidate) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Donut Chart Card (5 cols) */}
        <div className="lg:col-span-5 bg-white border border-slate-200 rounded-2xl p-6 flex flex-col justify-between shadow-xs">
          <div>
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-[#7c2529] flex items-center gap-2">
                <PieChart className="w-5 h-5 text-[#7c2529]" />
                <span>توزيع توصيات القبول والاجتياز</span>
              </h3>
              <span className="text-xs font-mono-tabular text-slate-500">
                إجمالي: {total} متقدم
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-1">
              تصنيف المتقدمين وفق الدرجات المعيارية ومؤشر النزاهة
            </p>
          </div>

          <div className="my-6 flex flex-col sm:flex-row items-center justify-around gap-6">
            <div className="relative w-40 h-40 flex items-center justify-center shrink-0">
              <svg className="w-full h-full -rotate-90" viewBox="0 0 160 160">
                <circle
                  cx="80"
                  cy="80"
                  r={radius}
                  fill="transparent"
                  stroke="#f1f5f9"
                  strokeWidth="22"
                />
                {total > 0 &&
                  segments.map((seg, idx) => {
                    const pct = seg.count / total;
                    const strokeLength = pct * circumference;
                    const strokeOffset = -accumulatedPercent * circumference;
                    accumulatedPercent += pct;
                    if (seg.count === 0) return null;
                    return (
                      <circle
                        key={idx}
                        cx="80"
                        cy="80"
                        r={radius}
                        fill="transparent"
                        stroke={seg.color}
                        strokeWidth="22"
                        strokeDasharray={`${strokeLength} ${circumference}`}
                        strokeDashoffset={strokeOffset}
                      />
                    );
                  })}
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                <span className="text-2xl font-bold font-mono-tabular text-[#7c2529]">
                  {total > 0 ? Math.round(((stronglyRec + qualifiedRec) / total) * 100) : 0}%
                </span>
                <span className="text-[11px] text-slate-500 font-semibold">نسبة التأهل</span>
              </div>
            </div>

            <div className="space-y-3 w-full sm:w-auto">
              {segments.map((seg, idx) => {
                const pct = total > 0 ? Math.round((seg.count / total) * 100) : 0;
                return (
                  <div key={idx} className="flex items-center justify-between gap-4 text-xs">
                    <div className="flex items-center gap-2">
                      <span
                        className="w-3.5 h-3.5 rounded-sm shrink-0"
                        style={{ backgroundColor: seg.color }}
                      />
                      <span className="font-semibold text-slate-800">{seg.label}</span>
                    </div>
                    <div className="font-mono-tabular font-bold text-slate-900">
                      {seg.count} ({pct}%)
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Grouped Bar Chart: IQ vs English per Candidate (7 cols) */}
        <div className="lg:col-span-7 bg-white border border-slate-200 rounded-2xl p-6 flex flex-col justify-between shadow-xs">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h3 className="text-base font-bold text-[#7c2529] flex items-center gap-2">
                <BarChart3 className="w-5 h-5 text-[#7c2529]" />
                <span>مقارنة أداء المتقدمين في القدرات (IQ) واللغة الإنجليزية</span>
              </h3>
              <p className="text-xs text-slate-500 mt-1">
                تحليل مقارن لدرجات المتقدمين الجدد في الاختبارين المعياريين
              </p>
            </div>

            <div className="flex items-center gap-4 text-xs">
              <div className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-xs bg-[#7c2529]" />
                <span className="font-semibold text-slate-700">القدرات الذهنية (IQ)</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-xs bg-[#ffc72c]" />
                <span className="font-semibold text-slate-700">اللغة الإنجليزية</span>
              </div>
            </div>
          </div>

          <div className="mt-6 space-y-4">
            {candidateComparison.map((cand) => (
              <div key={cand.id} className="space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-slate-800">{cand.name}</span>
                  <span className="font-mono-tabular text-slate-600">
                    الدرجة الكلية:{' '}
                    <strong className="text-[#7c2529]">{cand.totalScore}%</strong>
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-mono-tabular text-slate-500 w-8">IQ</span>
                    <div className="flex-1 h-3 bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-[#7c2529] rounded-full transition-all duration-300"
                        style={{ width: `${cand.iqScore}%` }}
                      />
                    </div>
                    <span className="text-xs font-mono-tabular font-bold text-[#7c2529] w-9 text-left">
                      {cand.iqScore}%
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-mono-tabular text-slate-500 w-8">EN</span>
                    <div className="flex-1 h-3 bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-[#ffc72c] rounded-full transition-all duration-300"
                        style={{ width: `${cand.englishScore}%` }}
                      />
                    </div>
                    <span className="text-xs font-mono-tabular font-bold text-slate-800 w-9 text-left">
                      {cand.englishScore}%
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Row 2: Sub-Skill Competency Visual Matrix */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 space-y-5 shadow-xs">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h3 className="text-base font-bold text-[#7c2529] flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-[#7c2529]" />
              <span>مؤشر إتقان الكفاءات الفرعية لدى المتقدمين</span>
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              رسم بياني لمستوى أداء المتقدمين في المهارات الـ 7 الأساسية المعتمدة في بنك الكريمي الإسلامي
            </p>
          </div>

          <div className="flex items-center gap-2 text-xs text-slate-600">
            <Users className="w-4 h-4 text-[#7c2529]" />
            <span>عينة التحليل: جميع المختبرين المكتملين</span>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-7 gap-4 pt-2">
          {subSkillStats.map((skill) => {
            const isIq = skill.category === 'IQ';
            return (
              <div
                key={skill.key}
                className="p-4 bg-[#FAF8F7] border border-slate-200 rounded-xl flex flex-col justify-between space-y-4"
              >
                <div className="flex items-center justify-between text-[11px]">
                  <span
                    className={`font-bold px-2 py-0.5 rounded-xs ${
                      isIq
                        ? 'bg-[#7c2529] text-white'
                        : 'bg-[#ffc72c] text-slate-900'
                    }`}
                  >
                    {isIq ? 'IQ' : 'EN'}
                  </span>
                  <span className="font-mono-tabular font-bold text-sm text-slate-900">
                    {skill.avg}%
                  </span>
                </div>

                <div className="h-28 w-full flex items-end justify-center bg-white border border-slate-200/80 rounded-lg p-2">
                  <div
                    className="w-10 rounded-t-md transition-all duration-300"
                    style={{
                      height: `${Math.max(8, skill.avg)}%`,
                      backgroundColor: isIq ? '#7c2529' : '#ffc72c',
                    }}
                  />
                </div>

                <div className="text-xs font-bold text-slate-800 text-center leading-snug">
                  {skill.labelAr}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

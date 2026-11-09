import {
  AssessmentCategory,
  CandidateSession,
  DifficultyLevel,
  distributeTotalQuestions,
  getEffectiveSections,
  getSubSkillInfo,
  JobProfile,
  QuestionItem,
  SectionScoreBreakdown,
  SessionQuestionInstance,
  SubSkill,
  SubSkillPerformance,
} from '../types/assessment';

function shuffleArray<T>(items: T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

/**
 * Generates a unique OTP session code in the format KIB-XXXX
 */
export function generateUniqueOtp(existingCodes: string[]): string {
  const existingSet = new Set(existingCodes.map((c) => c.toUpperCase()));
  let code = '';
  let attempts = 0;
  do {
    const num = Math.floor(1000 + Math.random() * 9000);
    code = `KIB-${num}`;
    attempts++;
  } while (existingSet.has(code) && attempts < 500);
  return code;
}

/**
 * Stratified random question selector with anti-duplication cooldown priority.
 * Supports any assessment category and exact total question counts.
 */
function selectStratifiedQuestions(
  pool: QuestionItem[],
  category: AssessmentCategory,
  counts: { easy: number; medium: number; hard: number },
  recentQuestionIds: Set<string>
): QuestionItem[] {
  const selected: QuestionItem[] = [];
  const difficulties: DifficultyLevel[] = ['easy', 'medium', 'hard'];
  const targetTotal = counts.easy + counts.medium + counts.hard;

  for (const diff of difficulties) {
    const targetCount = counts[diff];
    if (targetCount <= 0) continue;

    const matching = pool.filter((q) => q.category === category && q.difficulty === diff);

    // Split into fresh (not used recently) and used recently, then sort by lowest usageCount
    const fresh = shuffleArray(matching.filter((q) => !recentQuestionIds.has(q.id))).sort(
      (a, b) => a.usageCount - b.usageCount
    );
    const recentlyUsed = shuffleArray(matching.filter((q) => recentQuestionIds.has(q.id))).sort(
      (a, b) => a.usageCount - b.usageCount
    );

    const prioritized = [...fresh, ...recentlyUsed];

    // Pick diverse sub-skills first
    const chosenForDiff: QuestionItem[] = [];
    const usedSubSkills = new Set<SubSkill>();

    for (const candidate of prioritized) {
      if (chosenForDiff.length >= targetCount) break;
      if (!usedSubSkills.has(candidate.subSkill)) {
        chosenForDiff.push(candidate);
        usedSubSkills.add(candidate.subSkill);
      }
    }

    // Fill remainder if needed
    for (const candidate of prioritized) {
      if (chosenForDiff.length >= targetCount) break;
      if (!chosenForDiff.some((c) => c.id === candidate.id)) {
        chosenForDiff.push(candidate);
      }
    }

    selected.push(...chosenForDiff);
  }

  // If a custom category doesn't have enough questions of a specific difficulty, top up from remaining category questions
  if (selected.length < targetTotal) {
    const selectedIds = new Set(selected.map((s) => s.id));
    const remainingInCategory = shuffleArray(
      pool.filter((q) => q.category === category && !selectedIds.has(q.id))
    );
    for (const q of remainingInCategory) {
      if (selected.length >= targetTotal) break;
      selected.push(q);
    }
  }

  return shuffleArray(selected);
}

/**
 * Checks whether a question instance was answered correctly (supports both single and multiple choice)
 */
export function isQuestionAnsweredCorrectly(q: SessionQuestionInstance): boolean {
  if (q.selectionType === 'multiple' && q.correctShuffledIndices && q.correctShuffledIndices.length > 0) {
    const selected = q.selectedOptionIndices || (q.selectedOptionIndex !== null ? [q.selectedOptionIndex] : []);
    if (selected.length !== q.correctShuffledIndices.length) return false;
    const expectedSet = new Set(q.correctShuffledIndices);
    return selected.every((idx) => expectedSet.has(idx));
  }
  return q.selectedOptionIndex !== null && q.selectedOptionIndex === q.correctShuffledIndex;
}

/**
 * Checks whether a question instance has been answered by the candidate
 */
export function isQuestionAnswered(q: SessionQuestionInstance): boolean {
  if (q.selectionType === 'multiple') {
    return Boolean(q.selectedOptionIndices && q.selectedOptionIndices.length > 0);
  }
  return q.selectedOptionIndex !== null;
}

/**
 * Creates shuffled SessionQuestionInstance objects from raw QuestionItems
 * Supports dynamic sections, custom question counts per section, and optional manually selected question IDs.
 */
export function buildSessionQuestions(
  questionBank: QuestionItem[],
  jobProfile: JobProfile,
  recentSessions: CandidateSession[],
  options?: {
    assignedCategories?: string[];
    customQuestionCounts?: Record<string, number>;
    manualQuestionIds?: string[];
  }
): { instances: SessionQuestionInstance[]; usedQuestionIds: string[] } {
  // Collect question IDs from the 5 most recent sessions to enforce anti-duplication
  const recentIds = new Set<string>();
  const sortedRecent = [...recentSessions]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 5);

  for (const sess of sortedRecent) {
    for (const q of sess.questions) {
      recentIds.add(q.questionId);
    }
  }

  const effectiveSections = getEffectiveSections(jobProfile);
  const activeCategoryIds =
    options?.assignedCategories && options.assignedCategories.length > 0
      ? options.assignedCategories
      : effectiveSections.filter((s) => s.enabledByDefault !== false).map((s) => s.id);

  let combined: QuestionItem[] = [];

  // If the HR admin explicitly multi-selected specific questions for this test
  if (options?.manualQuestionIds && options.manualQuestionIds.length > 0) {
    const idSet = new Set(options.manualQuestionIds);
    combined = questionBank.filter(
      (q) => idSet.has(q.id) && activeCategoryIds.includes(q.category)
    );
  }

  // For any active section that doesn't have manually selected questions, use stratified random selection
  for (const catId of activeCategoryIds) {
    const alreadyHasForCat = combined.some((q) => q.category === catId);
    if (alreadyHasForCat) continue;

    const secConfig = effectiveSections.find((s) => s.id === catId);
    const customTotal = options?.customQuestionCounts?.[catId];

    const counts =
      typeof customTotal === 'number' && customTotal > 0
        ? distributeTotalQuestions(customTotal)
        : secConfig?.counts || { easy: 12, medium: 12, hard: 6 };

    const chosen = selectStratifiedQuestions(questionBank, catId, counts, recentIds);
    combined.push(...chosen);
  }

  const usedQuestionIds = combined.map((q) => q.id);

  const instances: SessionQuestionInstance[] = combined.map((q) => {
    const rawCorrectSet = new Set<number>(
      q.selectionType === 'multiple' && q.correctOptionIndices && q.correctOptionIndices.length > 0
        ? q.correctOptionIndices
        : [q.correctOptionIndex]
    );

    const indexedOptions = q.options.map((text, idx) => ({
      text,
      isCorrect: rawCorrectSet.has(idx),
    }));
    const shuffled = shuffleArray(indexedOptions);
    const newCorrectIndex = Math.max(
      0,
      shuffled.findIndex((item) => item.isCorrect)
    );
    const newCorrectIndices = shuffled
      .map((item, idx) => (item.isCorrect ? idx : -1))
      .filter((idx) => idx !== -1);

    return {
      questionId: q.id,
      category: q.category,
      subSkill: q.subSkill,
      difficulty: q.difficulty,
      selectionType: q.selectionType || 'single',
      prompt: q.prompt,
      contextPassage: q.contextPassage,
      visualMatrix: q.visualMatrix,
      shuffledOptions: shuffled.map((item) => item.text),
      correctShuffledIndex: newCorrectIndex,
      correctShuffledIndices: newCorrectIndices,
      timeLimitSeconds: q.timeLimitSeconds,
      selectedOptionIndex: null,
      selectedOptionIndices: [],
      flagged: false,
      timeSpentSeconds: 0,
      timedOut: false,
    };
  });

  return { instances, usedQuestionIds };
}

/**
 * Evaluates a completed candidate session and produces psychometric breakdown & recommendation
 * Supports dynamic test sections as well as IQ and English.
 */
export function evaluateCandidateSession(
  session: CandidateSession,
  jobProfile: JobProfile
): NonNullable<CandidateSession['evaluation']> {
  const effectiveSections = getEffectiveSections(jobProfile);
  const categoriesInSession = Array.from(new Set(session.questions.map((q) => q.category)));

  const sectionScores: SectionScoreBreakdown[] = categoriesInSession.map((catId) => {
    const catQuestions = session.questions.filter((q) => q.category === catId);
    const correct = catQuestions.filter(isQuestionAnsweredCorrectly).length;
    const total = catQuestions.length;
    const score = total > 0 ? Math.round((correct / total) * 100) : 0;
    const secConfig = effectiveSections.find((s) => s.id === catId);

    return {
      categoryId: catId,
      titleAr: secConfig?.titleAr || catId,
      correct,
      total,
      score,
      weight: secConfig?.weight ?? 50,
    };
  });

  const iqQuestions = session.questions.filter((q) => q.category === 'IQ');
  const englishQuestions = session.questions.filter((q) => q.category === 'ENGLISH');

  const iqCorrect = iqQuestions.filter(isQuestionAnsweredCorrectly).length;
  const iqTotal = iqQuestions.length;
  const iqScore = iqTotal > 0 ? Math.round((iqCorrect / iqTotal) * 100) : 0;

  const englishCorrect = englishQuestions.filter(isQuestionAnsweredCorrectly).length;
  const englishTotal = englishQuestions.length;
  const englishScore = englishTotal > 0 ? Math.round((englishCorrect / englishTotal) * 100) : 0;

  // Compute weighted total across all active sections in this session
  const totalActiveWeight = sectionScores.reduce((acc, s) => acc + (s.weight || 1), 0);
  const weightedTotalScore =
    sectionScores.length > 0 && totalActiveWeight > 0
      ? Math.round(
          sectionScores.reduce((acc, s) => acc + s.score * (s.weight || 1), 0) /
            totalActiveWeight
        )
      : 0;

  const totalTimeSeconds = session.questions.reduce((acc, q) => acc + q.timeSpentSeconds, 0);
  const avgQuestionTimeSeconds =
    session.questions.length > 0 ? Math.round(totalTimeSeconds / session.questions.length) : 0;

  // Calculate sub-skill breakdown
  const subSkillMap = new Map<
    string,
    { correct: number; total: number; totalTime: number; category: string }
  >();

  for (const q of session.questions) {
    const curr = subSkillMap.get(q.subSkill) || {
      correct: 0,
      total: 0,
      totalTime: 0,
      category: q.category,
    };
    curr.total += 1;
    curr.totalTime += q.timeSpentSeconds;
    if (isQuestionAnsweredCorrectly(q)) {
      curr.correct += 1;
    }
    subSkillMap.set(q.subSkill, curr);
  }

  const subSkillBreakdown: SubSkillPerformance[] = Array.from(subSkillMap.entries()).map(
    ([subSkill, stats]) => {
      const info = getSubSkillInfo(subSkill, stats.category);
      return {
        subSkill,
        labelAr: info.ar,
        category: stats.category,
        correct: stats.correct,
        total: stats.total,
        percentage: stats.total > 0 ? Math.round((stats.correct / stats.total) * 100) : 0,
        avgTimeSeconds: stats.total > 0 ? Math.round(stats.totalTime / stats.total) : 0,
      };
    }
  );

  // Integrity calculation
  let penalty = 0;
  for (const log of session.securityLogs) {
    if (log.type === 'FULLSCREEN_EXIT' || log.type === 'TAB_SWITCH') {
      penalty += 8;
    } else {
      penalty += 5;
    }
  }
  const integrityScore = Math.max(0, 100 - penalty);

  const passed = weightedTotalScore >= jobProfile.passingScore && integrityScore >= 70;

  let recommendation: NonNullable<CandidateSession['evaluation']>['recommendation'] =
    'NOT_QUALIFIED';

  if (passed && weightedTotalScore >= jobProfile.passingScore + 12 && integrityScore >= 90) {
    recommendation = 'STRONGLY_RECOMMENDED';
  } else if (passed) {
    recommendation = 'QUALIFIED_FOR_INTERVIEW';
  } else if (weightedTotalScore >= jobProfile.passingScore - 5) {
    recommendation = 'BORDERLINE_REVIEW';
  } else {
    recommendation = 'NOT_QUALIFIED';
  }

  return {
    iqScore,
    englishScore,
    weightedTotalScore,
    iqCorrect,
    iqTotal,
    englishCorrect,
    englishTotal,
    sectionScores,
    totalTimeSeconds,
    avgQuestionTimeSeconds,
    passed,
    recommendation,
    subSkillBreakdown,
    integrityScore,
  };
}

/**
 * Calculates percentile rank among all completed sessions
 */
export function calculatePercentile(
  score: number,
  allCompletedSessions: CandidateSession[]
): number {
  const scores = allCompletedSessions
    .map((s) => s.evaluation?.weightedTotalScore)
    .filter((v): v is number => typeof v === 'number');

  if (scores.length <= 1) return 95;
  const belowOrEqual = scores.filter((s) => s <= score).length;
  return Math.min(99, Math.max(5, Math.round((belowOrEqual / scores.length) * 100)));
}

/**
 * Calculates similarity overlap % between a session and previous sessions
 */
export function calculateOverlapRate(
  session: CandidateSession,
  otherSessions: CandidateSession[]
): number {
  if (!session.questions || session.questions.length === 0) return 0;
  const myIds = new Set(session.questions.map((q) => q.questionId));
  const othersWithQuestions = otherSessions.filter(
    (s) => s.id !== session.id && s.questions && s.questions.length > 0
  );
  if (othersWithQuestions.length === 0) return 0;

  let totalOverlapRatio = 0;
  for (const other of othersWithQuestions) {
    let shared = 0;
    for (const q of other.questions) {
      if (myIds.has(q.questionId)) shared++;
    }
    totalOverlapRatio += shared / myIds.size;
  }

  return Math.round((totalOverlapRatio / othersWithQuestions.length) * 100);
}

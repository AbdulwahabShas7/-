import express, { Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_DIR = path.join(__dirname, '.data');
const STATE_FILE = path.join(DATA_DIR, 'kib-live-db.json');

const SHEET_TABS = {
  SESSIONS: 'ملخص_النتائج_والمتقدمين',
  QUESTIONS: 'بنك_الأسئلة',
  SETTINGS: 'إعدادات_الأقسام_والأوزان',
  USERS: 'المستخدمون_والصلاحيات',
  SYSTEM_JSON: '_SYSTEM_STATE_JSON',
};

interface SheetsConfig {
  webAppUrl: string;
  spreadsheetId: string;
  spreadsheetUrl: string;
  spreadsheetTitle: string;
  lastSyncedAt: string;
  autoSync: boolean;
  syncStatus: string;
  lastError: string;
}

interface ServerPlatformState {
  initialized: boolean;
  version: number;
  updatedAt: string;
  lastUpdatedByClientId: string;
  questions: any[];
  jobProfiles: any[];
  sessions: any[];
  users: any[];
  sheetsConfig: SheetsConfig;
}

// In-memory authoritative state persisted to disk & Google Sheets via Apps Script Web App URL
let serverState: ServerPlatformState = {
  initialized: false,
  version: 1,
  updatedAt: new Date().toISOString(),
  lastUpdatedByClientId: '',
  questions: [],
  jobProfiles: [],
  sessions: [],
  users: [],
  sheetsConfig: {
    webAppUrl: '',
    spreadsheetId: '',
    spreadsheetUrl: '',
    spreadsheetTitle: 'قاعدة بيانات منصة اختبارات الموارد البشرية - بنك الكريمي الإسلامي',
    lastSyncedAt: '',
    autoSync: true,
    syncStatus: 'idle',
    lastError: '',
  },
};

let autoSyncTimeout: ReturnType<typeof setTimeout> | null = null;

function loadStateFromDisk() {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    if (fs.existsSync(STATE_FILE)) {
      const raw = fs.readFileSync(STATE_FILE, 'utf-8');
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        serverState = {
          ...serverState,
          ...parsed,
          sheetsConfig: {
            ...serverState.sheetsConfig,
            ...(parsed.sheetsConfig || {}),
          },
        };
      }
    }
  } catch (err) {
    console.error('Failed to load state from disk:', err);
  }
}

function saveStateToDisk() {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    fs.writeFileSync(STATE_FILE, JSON.stringify(serverState, null, 2), 'utf-8');
  } catch (err) {
    console.error('Failed to save state to disk:', err);
  }
}

loadStateFromDisk();

// Active SSE Clients for instant real-time sync across all published links
const sseClients = new Set<Response>();

function broadcastToClients(
  eventType: string = 'state_updated',
  extraPayload: Record<string, any> = {}
) {
  const payload = JSON.stringify({
    type: eventType,
    version: serverState.version,
    updatedAt: serverState.updatedAt,
    lastUpdatedByClientId: serverState.lastUpdatedByClientId,
    sheetsConfig: serverState.sheetsConfig,
    connectedClientsCount: sseClients.size,
    ...extraPayload,
  });

  for (const client of sseClients) {
    try {
      client.write(`data: ${payload}\n\n`);
    } catch {
      sseClients.delete(client);
    }
  }
}

// Helper to split large JSON strings safely under Google Sheets' 50,000 char cell limit
function chunkString(str: string, size: number = 38000): string[] {
  const chunks: string[] = [];
  for (let i = 0; i < str.length; i += size) {
    chunks.push(str.slice(i, i + size));
  }
  return chunks.length > 0 ? chunks : [''];
}

// Build human-readable Arabic tables + system JSON rows for Google Apps Script
function buildGoogleSheetsTables(state: ServerPlatformState) {
  const sessions: any[] = Array.isArray(state.sessions) ? state.sessions : [];
  const questions: any[] = Array.isArray(state.questions) ? state.questions : [];
  const jobProfiles: any[] = Array.isArray(state.jobProfiles) ? state.jobProfiles : [];
  const users: any[] = Array.isArray(state.users) ? state.users : [];

  // 1. Sessions & Candidate Results Sheet
  const sessionHeaders = [
    'معرف الجلسة',
    'رمز الدخول (OTP)',
    'اسم المتقدم الرباعي',
    'الرقم الوطني / الهوية',
    'رقم الهاتف',
    'الأقسام المخصصة',
    'حالة الجلسة',
    'درجة القدرات (IQ %)',
    'درجة الإنجليزية (English %)',
    'الدرجة الكلية الموزونة (%)',
    'حالة الاجتياز',
    'التوصية الإدارية',
    'متوسط زمن السؤال (ثانية)',
    'مؤشر النزاهة (%)',
    'عدد التنبيهات الأمنية',
    'تاريخ الإنشاء',
    'تاريخ الإكمال',
  ];

  const statusArMap: Record<string, string> = {
    pending: 'بانتظار الدخول',
    in_progress: 'قيد الاختبار الآن',
    paused: 'موقوفة مؤقتاً',
    terminated: 'منهاة إدارياً',
    completed: 'مكتمل',
  };

  const recArMap: Record<string, string> = {
    STRONGLY_RECOMMENDED: 'موصى به بشدة للتعيين',
    QUALIFIED_FOR_INTERVIEW: 'مؤهل للمقابلة الشخصية',
    BORDERLINE_REVIEW: 'مراجعة حدية (قرار لجنة)',
    NOT_QUALIFIED: 'غير مجتاز للحد الأدنى',
  };

  const sessionRows = sessions.map((s: any) => {
    const ev = s.evaluation || null;
    const stKey = String(s.status || '');
    const recKey = ev ? String(ev.recommendation || '') : '';
    return [
      s.id || '',
      s.otpCode || '',
      s.candidateName || '',
      s.nationalId || '',
      s.phone || '',
      Array.isArray(s.assignedCategories) ? s.assignedCategories.join(' + ') : 'IQ + ENGLISH',
      statusArMap[stKey] || stKey,
      ev ? ev.iqScore : '-',
      ev ? ev.englishScore : '-',
      ev ? ev.weightedTotalScore : '-',
      ev ? (ev.passed ? 'مجتاز' : 'غير مجتاز') : 'قيد الإجراء',
      ev ? recArMap[recKey] || recKey : '-',
      ev ? ev.avgQuestionTimeSeconds : '-',
      ev ? ev.integrityScore : 100,
      Array.isArray(s.securityLogs) ? s.securityLogs.length : 0,
      s.createdAt || '',
      s.completedAt || '-',
    ];
  });

  // 2. Question Bank Sheet
  const questionHeaders = [
    'معرف السؤال',
    'قسم الاختبار',
    'المهارة الفرعية',
    'مستوى الصعوبة',
    'نوع الاختيار',
    'نص السؤال',
    'النص السياقي / القطعة',
    'الخيار الأول (1)',
    'الخيار الثاني (2)',
    'الخيار الثالث (3)',
    'الخيار الرابع (4)',
    'رقم الخيار الصحيح (1-4)',
    'أرقام الخيارات الصحيحة للمتعدد',
    'الزمن المخصص (ثانية)',
    'عدد مرات الاستخدام',
  ];

  const diffAr: Record<string, string> = { easy: 'سهل', medium: 'متوسط', hard: 'صعب' };

  const questionRows = questions.map((q: any) => {
    const opts = Array.isArray(q.options) ? q.options : ['', '', '', ''];
    const multiIndices =
      Array.isArray(q.correctOptionIndices) && q.correctOptionIndices.length > 0
        ? q.correctOptionIndices.map((idx: number) => idx + 1).join(',')
        : String((q.correctOptionIndex ?? 0) + 1);
    const diffKey = String(q.difficulty || 'medium');

    return [
      q.id || '',
      q.category || 'IQ',
      q.subSkill || '',
      diffAr[diffKey] || diffKey,
      q.selectionType === 'multiple' ? 'اختيار متعدد' : 'اختيار مفرد',
      q.prompt || '',
      q.contextPassage || '',
      opts[0] || '',
      opts[1] || '',
      opts[2] || '',
      opts[3] || '',
      (q.correctOptionIndex ?? 0) + 1,
      multiIndices,
      q.expectedTimeSeconds || 45,
      q.usageCount || 0,
    ];
  });

  // 3. Settings & Sections Sheet
  const settingsHeaders = [
    'رمز القسم',
    'اسم القسم بالعربية',
    'الاسم بالإنجليزية',
    'الوزن النسبي (%)',
    'إجمالي الأسئلة',
    'أسئلة سهلة',
    'أسئلة متوسطة',
    'أسئلة صعبة',
    'الزمن المخصص (دقيقة)',
    'درجة الاجتياز الكلية المعتمدة (%)',
  ];

  const primaryProfile = jobProfiles[0] || {};
  const sections: any[] = Array.isArray(primaryProfile.sections)
    ? primaryProfile.sections
    : [];
  const settingsRows = sections.map((sec: any) => [
    sec.id || '',
    sec.titleAr || '',
    sec.titleEn || '',
    sec.weight ?? 50,
    (sec.counts?.easy || 0) + (sec.counts?.medium || 0) + (sec.counts?.hard || 0),
    sec.counts?.easy || 0,
    sec.counts?.medium || 0,
    sec.counts?.hard || 0,
    sec.timeLimitMinutes || 20,
    primaryProfile.minPassScore || 65,
  ]);

  // 4. Users Sheet
  const userHeaders = [
    'معرف المستخدم',
    'الاسم الكامل',
    'اسم الدخول',
    'الدور الوظيفي',
    'الحالة',
    'تاريخ الإنشاء',
  ];

  const userRows = users.map((u: any) => [
    u.id || '',
    u.fullName || '',
    u.username || '',
    u.role || '',
    u.active ? 'نشط' : 'موقوف',
    u.createdAt || '',
  ]);

  // 5. System State JSON Sheet (for 100% lossless hydration)
  const sessionsChunks = chunkString(JSON.stringify(sessions));
  const questionsChunks = chunkString(JSON.stringify(questions));
  const jobsChunks = chunkString(JSON.stringify(jobProfiles));
  const usersChunks = chunkString(JSON.stringify(users));

  const systemJsonRows = [
    [
      'COLLECTION_KEY',
      'UPDATED_AT',
      'VERSION',
      ...sessionsChunks.map((_, i) => `CHUNK_${i + 1}`),
    ],
    ['SESSIONS', state.updatedAt, String(state.version), ...sessionsChunks],
    ['QUESTIONS', state.updatedAt, String(state.version), ...questionsChunks],
    ['JOB_PROFILES', state.updatedAt, String(state.version), ...jobsChunks],
    ['USERS', state.updatedAt, String(state.version), ...usersChunks],
  ];

  return [
    {
      tabName: SHEET_TABS.SESSIONS,
      rightToLeft: true,
      rows: [sessionHeaders, ...sessionRows],
    },
    {
      tabName: SHEET_TABS.QUESTIONS,
      rightToLeft: true,
      rows: [questionHeaders, ...questionRows],
    },
    {
      tabName: SHEET_TABS.SETTINGS,
      rightToLeft: true,
      rows: [settingsHeaders, ...settingsRows],
    },
    {
      tabName: SHEET_TABS.USERS,
      rightToLeft: true,
      rows: [userHeaders, ...userRows],
    },
    {
      tabName: SHEET_TABS.SYSTEM_JSON,
      rightToLeft: false,
      rows: systemJsonRows,
    },
  ];
}

// Push current server state to Google Sheets via Google Apps Script Web App URL
async function pushStateToAppsScript(overrideWebAppUrl?: string, customSpreadsheetId?: string) {
  const webAppUrl = (overrideWebAppUrl || serverState.sheetsConfig?.webAppUrl || '').trim();
  if (!webAppUrl) {
    return { skipped: true, reason: 'Missing Google Apps Script Web App URL' };
  }

  serverState.sheetsConfig.syncStatus = 'syncing';
  broadcastToClients('sheets_status');

  try {
    const tables = buildGoogleSheetsTables(serverState);

    const res = await fetch(webAppUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/plain;charset=utf-8',
      },
      redirect: 'follow',
      body: JSON.stringify({
        action: 'sync',
        spreadsheetTitle:
          serverState.sheetsConfig.spreadsheetTitle ||
          'قاعدة بيانات منصة اختبارات الموارد البشرية - بنك الكريمي الإسلامي',
        customSpreadsheetId:
          customSpreadsheetId || serverState.sheetsConfig.spreadsheetId || '',
        tables,
      }),
    });

    const rawText = await res.text();
    let parsed: any = null;
    try {
      parsed = JSON.parse(rawText);
    } catch {
      throw new Error(
        'الرد القادم من رابط Google Apps Script ليس بصيغة JSON صحيحة. تأكد من نشر السكربت بصلاحية (Anyone / أي شخص) ونسخ رابط Web App المنتهي بـ /exec.'
      );
    }

    if (!res.ok || parsed?.error || parsed?.ok === false) {
      throw new Error(parsed?.error || `فشل التحديث عبر Apps Script (${res.status})`);
    }

    const nowIso = new Date().toISOString();
    serverState.sheetsConfig.webAppUrl = webAppUrl;
    if (parsed.spreadsheetId) {
      serverState.sheetsConfig.spreadsheetId = parsed.spreadsheetId;
    }
    if (parsed.spreadsheetUrl) {
      serverState.sheetsConfig.spreadsheetUrl = parsed.spreadsheetUrl;
    }
    if (parsed.spreadsheetTitle) {
      serverState.sheetsConfig.spreadsheetTitle = parsed.spreadsheetTitle;
    }
    serverState.sheetsConfig.lastSyncedAt = nowIso;
    serverState.sheetsConfig.syncStatus = 'synced';
    serverState.sheetsConfig.lastError = '';
    saveStateToDisk();
    broadcastToClients('sheets_status');

    return {
      ok: true,
      createdNew: Boolean(parsed.createdNew),
      lastSyncedAt: nowIso,
      sheetsConfig: serverState.sheetsConfig,
    };
  } catch (caught: unknown) {
    const err = caught as Error;
    console.error('Google Apps Script sync error:', err?.message || err);
    serverState.sheetsConfig.syncStatus = 'error';
    serverState.sheetsConfig.lastError =
      err?.message || 'تعذر الاتصال برابط Google Apps Script Web App';
    saveStateToDisk();
    broadcastToClients('sheets_status');
    throw err;
  }
}

function scheduleBackgroundSheetsSync() {
  if (
    !serverState.sheetsConfig?.autoSync ||
    !serverState.sheetsConfig?.webAppUrl
  ) {
    return;
  }
  if (autoSyncTimeout) {
    clearTimeout(autoSyncTimeout);
  }
  autoSyncTimeout = setTimeout(() => {
    pushStateToAppsScript().catch(() => {});
  }, 1200);
}

// Pull state from Google Sheets via Google Apps Script Web App URL
async function pullStateFromAppsScript(overrideWebAppUrl?: string) {
  const webAppUrl = (overrideWebAppUrl || serverState.sheetsConfig?.webAppUrl || '').trim();
  if (!webAppUrl) {
    throw new Error('لم يتم إدخال رابط Google Apps Script Web App URL بعد.');
  }

  const res = await fetch(webAppUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'text/plain;charset=utf-8',
    },
    redirect: 'follow',
    body: JSON.stringify({
      action: 'pull',
      customSpreadsheetId: serverState.sheetsConfig.spreadsheetId || '',
      systemTabName: SHEET_TABS.SYSTEM_JSON,
    }),
  });

  const rawText = await res.text();
  let parsed: any = null;
  try {
    parsed = JSON.parse(rawText);
  } catch {
    throw new Error(
      'تعذر قراءة استجابة JSON من رابط Google Apps Script. تأكد من صلاحية الرابط (/exec).'
    );
  }

  if (!res.ok || parsed?.error || parsed?.ok === false) {
    throw new Error(parsed?.error || 'فشل استرجاع البيانات من Google Sheets.');
  }

  const rows: any[] = Array.isArray(parsed.systemRows) ? parsed.systemRows : [];
  let restoredAny = false;

  for (const row of rows.slice(1)) {
    const key = row[0];
    const chunks = row.slice(3).filter(Boolean);
    if (!key || chunks.length === 0) continue;
    try {
      const joined = chunks.join('');
      const collectionData = JSON.parse(joined);
      if (key === 'SESSIONS' && Array.isArray(collectionData)) {
        serverState.sessions = collectionData;
        restoredAny = true;
      } else if (key === 'QUESTIONS' && Array.isArray(collectionData)) {
        serverState.questions = collectionData;
        restoredAny = true;
      } else if (key === 'JOB_PROFILES' && Array.isArray(collectionData)) {
        serverState.jobProfiles = collectionData;
        restoredAny = true;
      } else if (key === 'USERS' && Array.isArray(collectionData)) {
        serverState.users = collectionData;
        restoredAny = true;
      }
    } catch (e) {
      console.error(`Failed to parse ${key} from _SYSTEM_STATE_JSON:`, e);
    }
  }

  if (restoredAny) {
    serverState.initialized = true;
    serverState.version += 1;
    serverState.updatedAt = new Date().toISOString();
    serverState.sheetsConfig.lastSyncedAt = serverState.updatedAt;
    serverState.sheetsConfig.syncStatus = 'synced';
    serverState.sheetsConfig.lastError = '';
    if (parsed.spreadsheetId) {
      serverState.sheetsConfig.spreadsheetId = parsed.spreadsheetId;
    }
    if (parsed.spreadsheetUrl) {
      serverState.sheetsConfig.spreadsheetUrl = parsed.spreadsheetUrl;
    }
    saveStateToDisk();
    broadcastToClients('state_updated');
  }

  return { restoredAny, state: serverState };
}

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;

  app.use(express.json({ limit: '20mb' }));

  // 1. Real-Time SSE Endpoint for Multi-User / Multi-Device Sync
  app.get('/api/events', (req: Request, res: Response) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders?.();

    sseClients.add(res);

    const initMsg = JSON.stringify({
      type: 'connected',
      version: serverState.version,
      updatedAt: serverState.updatedAt,
      sheetsConfig: serverState.sheetsConfig,
      connectedClientsCount: sseClients.size,
    });
    res.write(`data: ${initMsg}\n\n`);

    broadcastToClients('presence_updated');

    const heartbeat = setInterval(() => {
      try {
        res.write(`: heartbeat ${Date.now()}\n\n`);
      } catch {
        clearInterval(heartbeat);
        sseClients.delete(res);
      }
    }, 15000);

    req.on('close', () => {
      clearInterval(heartbeat);
      sseClients.delete(res);
      broadcastToClients('presence_updated');
    });
  });

  // 2. Get Full Platform State
  app.get('/api/state', (_req: Request, res: Response) => {
    res.json({
      ...serverState,
      connectedClientsCount: Math.max(1, sseClients.size),
    });
  });

  // 3. Lightweight Version Check for Polling Fallback
  app.get('/api/state/version', (_req: Request, res: Response) => {
    res.json({
      initialized: serverState.initialized,
      version: serverState.version,
      updatedAt: serverState.updatedAt,
      lastUpdatedByClientId: serverState.lastUpdatedByClientId,
      sheetsConfig: serverState.sheetsConfig,
      connectedClientsCount: Math.max(1, sseClients.size),
    });
  });

  // 4. Sync / Update State from Any Client (Candidate Kiosk or Admin Dashboard)
  app.post('/api/state/sync', (req: Request, res: Response) => {
    const {
      clientId,
      questions,
      jobProfiles,
      sessions,
      users,
      sheetsConfig,
      isInitialSeed,
    } = req.body || {};

    if (isInitialSeed && serverState.initialized) {
      return res.json({
        ok: true,
        alreadyInitialized: true,
        state: {
          ...serverState,
          connectedClientsCount: Math.max(1, sseClients.size),
        },
      });
    }

    let changed = false;

    if (Array.isArray(questions)) {
      serverState.questions = questions;
      changed = true;
    }
    if (Array.isArray(jobProfiles)) {
      serverState.jobProfiles = jobProfiles;
      changed = true;
    }
    if (Array.isArray(sessions)) {
      serverState.sessions = sessions;
      changed = true;
    }
    if (Array.isArray(users)) {
      serverState.users = users;
      changed = true;
    }
    if (sheetsConfig && typeof sheetsConfig === 'object') {
      serverState.sheetsConfig = {
        ...serverState.sheetsConfig,
        ...sheetsConfig,
      };
      changed = true;
    }

    if (changed) {
      serverState.initialized = true;
      serverState.version += 1;
      serverState.updatedAt = new Date().toISOString();
      serverState.lastUpdatedByClientId = clientId || '';
      saveStateToDisk();
      broadcastToClients('state_updated');
      scheduleBackgroundSheetsSync();
    }

    return res.json({
      ok: true,
      version: serverState.version,
      updatedAt: serverState.updatedAt,
      sheetsConfig: serverState.sheetsConfig,
      connectedClientsCount: Math.max(1, sseClients.size),
    });
  });

  // 5. Connect Google Apps Script Web App URL & Initialize / Sync All Tabs
  app.post('/api/sheets/initialize', async (req: Request, res: Response) => {
    const { webAppUrl, customSpreadsheetId } = req.body || {};
    const targetUrl = String(
      webAppUrl || serverState.sheetsConfig.webAppUrl || ''
    ).trim();

    if (!targetUrl) {
      return res.status(400).json({
        error: 'يرجى إدخال رابط Google Apps Script Web App URL أولاً.',
      });
    }

    try {
      serverState.sheetsConfig.webAppUrl = targetUrl;
      if (customSpreadsheetId !== undefined) {
        serverState.sheetsConfig.spreadsheetId = String(customSpreadsheetId).trim();
      }
      serverState.sheetsConfig.autoSync = true;
      saveStateToDisk();

      const result = await pushStateToAppsScript(
        targetUrl,
        customSpreadsheetId ? String(customSpreadsheetId).trim() : undefined
      );

      return res.json({
        ok: true,
        createdNew: result.createdNew,
        sheetsConfig: serverState.sheetsConfig,
      });
    } catch (caught: unknown) {
      const err = caught as Error;
      return res.status(500).json({
        error: err?.message || 'تعذر الاتصال برابط Google Apps Script Web App.',
      });
    }
  });

  // 6. Manual Push to Google Sheets via Apps Script Web App URL
  app.post('/api/sheets/push', async (_req: Request, res: Response) => {
    if (!serverState.sheetsConfig.webAppUrl) {
      return res.status(400).json({
        error: 'لم يتم إعداد رابط Google Apps Script Web App URL بعد.',
      });
    }

    try {
      const result = await pushStateToAppsScript();
      return res.json({
        ok: true,
        ...result,
        sheetsConfig: serverState.sheetsConfig,
      });
    } catch (caught: unknown) {
      const err = caught as Error;
      return res.status(500).json({
        error: err?.message || 'فشل إرسال التحديثات إلى Google Sheets.',
      });
    }
  });

  // 7. Pull State from Google Sheets via Apps Script Web App URL
  app.post('/api/sheets/pull', async (_req: Request, res: Response) => {
    if (!serverState.sheetsConfig.webAppUrl) {
      return res.status(400).json({
        error: 'لم يتم إعداد رابط Google Apps Script Web App URL بعد.',
      });
    }

    try {
      const result = await pullStateFromAppsScript();
      return res.json({
        ok: true,
        restoredAny: result.restoredAny,
        state: result.state,
      });
    } catch (caught: unknown) {
      const err = caught as Error;
      return res.status(500).json({
        error: err?.message || 'فشل استرجاع البيانات من Google Sheets.',
      });
    }
  });

  // Vite middleware in development, static dist in production
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`KIB Assessment Real-Time Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();

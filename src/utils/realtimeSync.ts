import {
  CandidateSession,
  JobProfile,
  QuestionItem,
  SystemUser,
} from '../types/assessment';

export interface SheetsConfigState {
  webAppUrl?: string;
  spreadsheetId: string;
  spreadsheetUrl: string;
  spreadsheetTitle: string;
  lastSyncedAt: string;
  autoSync: boolean;
  syncStatus: 'idle' | 'syncing' | 'synced' | 'error';
  lastError: string;
}

export interface ServerStateSnapshot {
  initialized: boolean;
  version: number;
  updatedAt: string;
  lastUpdatedByClientId: string;
  questions: QuestionItem[];
  jobProfiles: JobProfile[];
  sessions: CandidateSession[];
  users: SystemUser[];
  sheetsConfig: SheetsConfigState;
  connectedClientsCount?: number;
}

// Unique Client ID for this browser tab/window so it ignores its own SSE echo
export const CLIENT_INSTANCE_ID = `client-${Date.now()}-${Math.random()
  .toString(36)
  .slice(2, 8)}`;

// Ready-to-copy Google Apps Script (Code.gs) that auto-creates the spreadsheet/tabs and syncs data without OAuth Client ID
export const GOOGLE_APPS_SCRIPT_CODE = `/**
 * سكربت الربط المباشر لمنصة اختبارات الموارد البشرية - بنك الكريمي الإسلامي
 * يعمل تلقائياً سواء تم وضعه داخل ملف Google Sheet أو عبر رابط مستقل (script.new)
 */

function getOrCreateTargetSpreadsheet(payload) {
  var props = PropertiesService.getScriptProperties();
  var customId = payload && payload.customSpreadsheetId ? String(payload.customSpreadsheetId).trim() : '';
  var savedId = customId || props.getProperty('KIB_SPREADSHEET_ID') || '';
  var ss = null;
  var createdNew = false;

  if (savedId) {
    try {
      ss = SpreadsheetApp.openById(savedId);
    } catch (e) {
      ss = null;
    }
  }

  if (!ss) {
    try {
      ss = SpreadsheetApp.getActiveSpreadsheet();
    } catch (e) {
      ss = null;
    }
  }

  if (!ss) {
    var title = (payload && payload.spreadsheetTitle) || 'قاعدة بيانات منصة اختبارات الموارد البشرية - بنك الكريمي الإسلامي';
    ss = SpreadsheetApp.create(title);
    createdNew = true;
  }

  props.setProperty('KIB_SPREADSHEET_ID', ss.getId());
  return { ss: ss, createdNew: createdNew };
}

function doPost(e) {
  var lock = LockService.getScriptLock();
  lock.tryLock(25000);

  try {
    var raw = e && e.postData && e.postData.contents ? e.postData.contents : '{}';
    var payload = JSON.parse(raw);
    var action = payload.action || 'sync';

    var target = getOrCreateTargetSpreadsheet(payload);
    var ss = target.ss;

    if (action === 'pull') {
      var sysTabName = payload.systemTabName || '_SYSTEM_STATE_JSON';
      var sysSheet = ss.getSheetByName(sysTabName);
      var systemRows = sysSheet ? sysSheet.getDataRange().getValues() : [];

      return ContentService.createTextOutput(JSON.stringify({
        ok: true,
        spreadsheetId: ss.getId(),
        spreadsheetUrl: ss.getUrl(),
        spreadsheetTitle: ss.getName(),
        systemRows: systemRows
      })).setMimeType(ContentService.MimeType.JSON);
    }

    // Default action: 'sync' — Create/Update all 5 Arabic tabs
    var tables = payload.tables || [];
    for (var i = 0; i < tables.length; i++) {
      var tbl = tables[i];
      var sheet = ss.getSheetByName(tbl.tabName);
      if (!sheet) {
        sheet = ss.insertSheet(tbl.tabName);
      }
      if (tbl.rightToLeft !== undefined) {
        sheet.setRightToLeft(Boolean(tbl.rightToLeft));
      }

      sheet.clearContents();
      var rows = tbl.rows || [];
      if (rows.length > 0 && rows[0].length > 0) {
        sheet.getRange(1, 1, rows.length, rows[0].length).setValues(rows);
        sheet.setFrozenRows(1);

        // Format header row with Al-Kuraimi Islamic Bank Identity (#7c2529)
        if (tbl.tabName !== '_SYSTEM_STATE_JSON') {
          var headerRange = sheet.getRange(1, 1, 1, rows[0].length);
          headerRange.setBackground('#7c2529');
          headerRange.setFontColor('#ffffff');
          headerRange.setFontWeight('bold');
        }
      }
    }

    SpreadsheetApp.flush();

    return ContentService.createTextOutput(JSON.stringify({
      ok: true,
      createdNew: target.createdNew,
      spreadsheetId: ss.getId(),
      spreadsheetUrl: ss.getUrl(),
      spreadsheetTitle: ss.getName(),
      syncedAt: new Date().toISOString()
    })).setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({
      ok: false,
      error: String(err && err.message ? err.message : err)
    })).setMimeType(ContentService.MimeType.JSON);
  } finally {
    lock.releaseLock();
  }
}

function doGet(e) {
  return ContentService.createTextOutput(JSON.stringify({
    ok: true,
    status: 'KIB Google Apps Script Web App is active and ready.'
  })).setMimeType(ContentService.MimeType.JSON);
}`;

export async function fetchServerState(): Promise<ServerStateSnapshot | null> {
  try {
    const res = await fetch('/api/state');
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export async function fetchServerVersion(): Promise<{
  initialized: boolean;
  version: number;
  updatedAt: string;
  lastUpdatedByClientId: string;
  sheetsConfig: SheetsConfigState;
  connectedClientsCount: number;
} | null> {
  try {
    const res = await fetch('/api/state/version');
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export async function pushStateToServer(payload: {
  questions?: QuestionItem[];
  jobProfiles?: JobProfile[];
  sessions?: CandidateSession[];
  users?: SystemUser[];
  sheetsConfig?: Partial<SheetsConfigState>;
  isInitialSeed?: boolean;
}): Promise<{
  ok: boolean;
  alreadyInitialized?: boolean;
  version?: number;
  state?: ServerStateSnapshot;
  sheetsConfig?: SheetsConfigState;
  connectedClientsCount?: number;
} | null> {
  try {
    const res = await fetch('/api/state/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        clientId: CLIENT_INSTANCE_ID,
        ...payload,
      }),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export function extractSpreadsheetIdFromInput(rawInput: string): string {
  const trimmed = rawInput.trim();
  const match = trimmed.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if (match && match[1]) {
    return match[1];
  }
  return trimmed;
}

export async function connectAndSyncAppsScriptWebApp(options: {
  webAppUrl: string;
  customSpreadsheetId?: string;
}): Promise<{
  ok: boolean;
  createdNew?: boolean;
  sheetsConfig: SheetsConfigState;
}> {
  const res = await fetch('/api/sheets/initialize', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(options),
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || 'تعذر الاتصال برابط Google Apps Script Web App.');
  }
  return data;
}

export async function manualPushToGoogleSheet(): Promise<{
  ok: boolean;
  lastSyncedAt?: string;
  sheetsConfig: SheetsConfigState;
}> {
  const res = await fetch('/api/sheets/push', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || 'فشل إرسال البيانات إلى Google Sheets.');
  }
  return data;
}

export async function manualPullFromGoogleSheet(): Promise<{
  ok: boolean;
  restoredAny: boolean;
  state: ServerStateSnapshot;
}> {
  const res = await fetch('/api/sheets/pull', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || 'فشل استرجاع البيانات من Google Sheets.');
  }
  return data;
}

import React, { useState, useEffect } from 'react';
import {
  Database,
  RefreshCw,
  ExternalLink,
  CheckCircle2,
  AlertTriangle,
  Wifi,
  Settings2,
  DownloadCloud,
  UploadCloud,
  Copy,
  Check,
  Code2,
  X,
} from 'lucide-react';
import {
  connectAndSyncAppsScriptWebApp,
  extractSpreadsheetIdFromInput,
  GOOGLE_APPS_SCRIPT_CODE,
  manualPullFromGoogleSheet,
  manualPushToGoogleSheet,
  ServerStateSnapshot,
  SheetsConfigState,
} from '../utils/realtimeSync';

interface GoogleSheetsSyncBarProps {
  sheetsConfig: SheetsConfigState;
  connectedClientsCount: number;
  isRealtimeConnected: boolean;
  onSheetsConfigUpdated: (updated: SheetsConfigState) => void;
  onStatePulledFromSheets: (snapshot: ServerStateSnapshot) => void;
}

export const GoogleSheetsSyncBar: React.FC<GoogleSheetsSyncBarProps> = ({
  sheetsConfig,
  connectedClientsCount,
  isRealtimeConnected,
  onSheetsConfigUpdated,
  onStatePulledFromSheets,
}) => {
  const [busyAction, setBusyAction] = useState<'NONE' | 'INIT' | 'PUSH' | 'PULL'>(
    'NONE'
  );
  const [feedbackMessage, setFeedbackMessage] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  const [showManageModal, setShowManageModal] = useState(false);
  const [webAppUrlInput, setWebAppUrlInput] = useState(
    sheetsConfig?.webAppUrl || ''
  );
  const [customSheetInput, setCustomSheetInput] = useState(
    sheetsConfig?.spreadsheetId || ''
  );
  const [copiedCode, setCopiedCode] = useState(false);

  const [confirmDialog, setConfirmDialog] = useState<{
    title: string;
    description: string;
    confirmLabel: string;
    onConfirm: () => Promise<void>;
  } | null>(null);

  useEffect(() => {
    if (sheetsConfig?.webAppUrl) {
      setWebAppUrlInput(sheetsConfig.webAppUrl);
    }
    if (sheetsConfig?.spreadsheetId) {
      setCustomSheetInput(sheetsConfig.spreadsheetId);
    }
  }, [sheetsConfig?.webAppUrl, sheetsConfig?.spreadsheetId]);

  const isWebAppConnected = Boolean(sheetsConfig?.webAppUrl);

  const showToast = (type: 'success' | 'error', text: string) => {
    setFeedbackMessage({ type, text });
    setTimeout(() => {
      setFeedbackMessage((prev) => (prev?.text === text ? null : prev));
    }, 6000);
  };

  const handleCopyScriptCode = () => {
    navigator.clipboard?.writeText(GOOGLE_APPS_SCRIPT_CODE).catch(() => {});
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2500);
  };

  const handleSaveAndConnectWebApp = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const cleanUrl = webAppUrlInput.trim();
    if (!cleanUrl) {
      showToast('error', 'يرجى لصق رابط Google Apps Script Web App URL المنتهي بـ /exec.');
      return;
    }

    setBusyAction('INIT');
    setFeedbackMessage(null);
    try {
      const extractedSheetId = customSheetInput.trim()
        ? extractSpreadsheetIdFromInput(customSheetInput)
        : undefined;

      const res = await connectAndSyncAppsScriptWebApp({
        webAppUrl: cleanUrl,
        customSpreadsheetId: extractedSheetId,
      });

      onSheetsConfigUpdated(res.sheetsConfig);
      showToast(
        'success',
        res.createdNew
          ? 'تم الاتصال بـ Google Apps Script وإنشاء ملف Google Sheets وتجهيز الجداول العربية الخمسة ومزامنة البيانات تلقائياً!'
          : 'تم ربط رابط Google Apps Script Web App ومزامنة كافة البيانات مع ملف Google Sheets بنجاح!'
      );
      setShowManageModal(false);
    } catch (err: unknown) {
      const msg =
        err instanceof Error
          ? err.message
          : 'تعذر الاتصال برابط Google Apps Script Web App.';
      showToast('error', msg);
    } finally {
      setBusyAction('NONE');
    }
  };

  const handleManualPush = async () => {
    setBusyAction('PUSH');
    setFeedbackMessage(null);
    try {
      const res = await manualPushToGoogleSheet();
      onSheetsConfigUpdated(res.sheetsConfig);
      showToast('success', 'تم تحديث ملف Google Sheets بجميع البيانات الحالية بنجاح.');
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : 'فشل إرسال التحديثات إلى Google Sheets.';
      showToast('error', msg);
    } finally {
      setBusyAction('NONE');
    }
  };

  const executePullFromSheets = async () => {
    setConfirmDialog(null);
    setBusyAction('PULL');
    setFeedbackMessage(null);
    try {
      const res = await manualPullFromGoogleSheet();
      if (res.restoredAny && res.state) {
        onStatePulledFromSheets(res.state);
        showToast(
          'success',
          'تم استرجاع كافة البيانات من ملف Google Sheets وتعميمها لحظياً على الأجهزة المتصلة.'
        );
      } else {
        showToast('error', 'لم يتم العثور على بيانات محفوظة في جدول النظام داخل الشيت.');
      }
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : 'فشل استرجاع البيانات من Google Sheets.';
      showToast('error', msg);
    } finally {
      setBusyAction('NONE');
    }
  };

  return (
    <>
      <section className="no-print bg-white border-2 border-[#7c2529]/25 rounded-2xl p-4 md:p-5 space-y-3 shadow-xs">
        <div className="flex flex-col xl:flex-row items-stretch xl:items-center justify-between gap-4">
          {/* Left Side: Live Multi-User Sync & Google Apps Script Status */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-[#7c2529] text-[#ffc72c] flex items-center justify-center shrink-0">
              <Database className="w-5 h-5" />
            </div>

            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-bold text-[#7c2529]">
                  الربط المباشر مع Google Sheets (عبر Web App URL بدون تسجيل دخول)
                </span>

                {/* Real-time SSE Multi-Device Badge */}
                <span
                  className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md text-[11px] font-bold border ${
                    isRealtimeConnected
                      ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                      : 'bg-amber-50 text-amber-800 border-amber-300'
                  }`}
                >
                  <Wifi className="w-3 h-3" />
                  <span>
                    {isRealtimeConnected
                      ? `مزامنة لحظية نشطة (${connectedClientsCount} شاشة متصلة)`
                      : 'جاري الاتصال بالمزامنة اللحظية...'}
                  </span>
                </span>

                {/* Google Apps Script Connection Badge */}
                {isWebAppConnected ? (
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md text-[11px] font-bold bg-[#ffc72c]/25 text-[#7c2529] border border-[#ffc72c]">
                    <CheckCircle2 className="w-3 h-3" />
                    <span>مرتبط بـ Google Sheets (مزامنة تلقائية دائمة)</span>
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md text-[11px] font-semibold bg-slate-100 text-slate-600 border border-slate-200">
                    <span>بانتظار إدخال رابط Web App URL</span>
                  </span>
                )}
              </div>

              <p className="text-xs text-slate-600">
                {isWebAppConnected ? (
                  <>
                    جميع التعديلات وإجابات المتقدمين عبر رابط{' '}
                    <span className="font-mono-tabular font-semibold text-[#7c2529]">
                      Publish
                    </span>{' '}
                    تتزامن لحظياً بين جميع المتصفحات وتُحفظ مباشرة في Google Sheets عبر Apps Script.
                    {sheetsConfig.lastSyncedAt && (
                      <span className="mr-2 font-mono-tabular text-[11px] text-slate-500">
                        (آخر مزامنة:{' '}
                        {new Date(sheetsConfig.lastSyncedAt).toLocaleTimeString('ar-YE')})
                      </span>
                    )}
                  </>
                ) : (
                  <>
                    المزامنة اللحظية بين الأجهزة عبر رابط <strong>Publish</strong> مفعّلة تلقائياً الآن. ولربطها بملف Google Sheets بدون OAuth، اضغط على{' '}
                    <strong>«إعداد رابط Google Apps Script Web App»</strong>.
                  </>
                )}
              </p>
            </div>
          </div>

          {/* Right Side: Action Buttons */}
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            {!isWebAppConnected ? (
              <button
                type="button"
                onClick={() => setShowManageModal(true)}
                className="px-4 py-2.5 bg-[#7c2529] hover:bg-[#631d20] text-white text-xs font-bold rounded-xl flex items-center gap-2 transition-colors cursor-pointer shadow-xs"
              >
                <Code2 className="w-4 h-4 text-[#ffc72c]" />
                <span>إعداد رابط Google Apps Script Web App (بدون تسجيل دخول)</span>
              </button>
            ) : (
              <>
                <button
                  type="button"
                  disabled={busyAction !== 'NONE'}
                  onClick={handleManualPush}
                  className="px-3.5 py-2 bg-[#7c2529] hover:bg-[#631d20] disabled:opacity-60 text-white text-xs font-bold rounded-xl flex items-center gap-1.5 transition-colors cursor-pointer"
                  title="مزامنة وإرسال كافة التحديثات إلى ملف Google Sheets الآن"
                >
                  <UploadCloud
                    className={`w-3.5 h-3.5 text-[#ffc72c] ${
                      busyAction === 'PUSH' || sheetsConfig.syncStatus === 'syncing'
                        ? 'animate-bounce'
                        : ''
                    }`}
                  />
                  <span>
                    {busyAction === 'PUSH' || sheetsConfig.syncStatus === 'syncing'
                      ? 'جاري الحفظ في الشيت...'
                      : 'مزامنة مع الشيت الآن'}
                  </span>
                </button>

                <button
                  type="button"
                  disabled={busyAction !== 'NONE'}
                  onClick={() =>
                    setConfirmDialog({
                      title: 'تأكيد استعادة البيانات من Google Sheets',
                      description:
                        'سيتم قراءة البيانات المحفوظة في ملف Google Sheets واستبدال البيانات الحالية في المنصة بها. هل ترغب في المتابعة؟',
                      confirmLabel: 'نعم، استرجاع البيانات من الشيت',
                      onConfirm: executePullFromSheets,
                    })
                  }
                  className="px-3 py-2 bg-[#FAF8F7] hover:bg-slate-100 border border-slate-300 text-slate-800 text-xs font-bold rounded-xl flex items-center gap-1.5 transition-colors cursor-pointer"
                  title="قراءة واسترجاع البيانات من ملف Google Sheets"
                >
                  <DownloadCloud className="w-3.5 h-3.5 text-[#7c2529]" />
                  <span>سحب من الشيت</span>
                </button>
              </>
            )}

            {sheetsConfig.spreadsheetUrl && (
              <a
                href={sheetsConfig.spreadsheetUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="px-3.5 py-2 bg-[#ffc72c]/25 hover:bg-[#ffc72c]/40 border border-[#7c2529]/30 text-[#7c2529] text-xs font-bold rounded-xl flex items-center gap-1.5 transition-colors"
              >
                <span>فتح ملف Google Sheets</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            )}

            <button
              type="button"
              onClick={() => setShowManageModal(true)}
              className="p-2 bg-[#FAF8F7] hover:bg-slate-100 border border-slate-300 text-slate-700 rounded-xl transition-colors cursor-pointer"
              title="إعدادات رابط Web App URL وكود Apps Script"
            >
              <Settings2 className="w-4 h-4 text-[#7c2529]" />
            </button>
          </div>
        </div>

        {/* Inline Quick Input Bar if not yet connected */}
        {!isWebAppConnected && (
          <form
            onSubmit={handleSaveAndConnectWebApp}
            className="pt-2 border-t border-slate-100 flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5"
          >
            <input
              type="url"
              dir="ltr"
              value={webAppUrlInput}
              onChange={(e) => setWebAppUrlInput(e.target.value)}
              placeholder="https://script.google.com/macros/s/AKfycb.../exec"
              className="flex-1 px-3.5 py-2 text-xs font-mono-tabular bg-[#FAF8F7] border border-slate-300 rounded-xl focus:outline-none focus:border-[#7c2529] focus:bg-white"
            />
            <button
              type="submit"
              disabled={busyAction !== 'NONE'}
              className="px-4 py-2 bg-[#7c2529] hover:bg-[#631d20] disabled:opacity-60 text-white text-xs font-bold rounded-xl flex items-center justify-center gap-1.5 cursor-pointer shrink-0"
            >
              <RefreshCw
                className={`w-3.5 h-3.5 text-[#ffc72c] ${
                  busyAction === 'INIT' ? 'animate-spin' : ''
                }`}
              />
              <span>
                {busyAction === 'INIT'
                  ? 'جاري الاتصال وتهيئة الجداول...'
                  : 'ربط ومزامنة فورية'}
              </span>
            </button>
            <button
              type="button"
              onClick={handleCopyScriptCode}
              className="px-3.5 py-2 bg-[#ffc72c]/25 hover:bg-[#ffc72c]/40 border border-[#7c2529]/30 text-[#7c2529] text-xs font-bold rounded-xl flex items-center justify-center gap-1.5 cursor-pointer shrink-0"
            >
              {copiedCode ? (
                <>
                  <Check className="w-3.5 h-3.5" />
                  <span>تم نسخ كود Apps Script!</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" />
                  <span>نسخ كود Apps Script الجاهز</span>
                </>
              )}
            </button>
          </form>
        )}

        {/* Status Toast or Error Banner */}
        {(feedbackMessage || sheetsConfig.lastError) && (
          <div
            className={`px-4 py-2.5 rounded-xl text-xs font-semibold flex items-center justify-between gap-3 ${
              feedbackMessage?.type === 'success'
                ? 'bg-emerald-50 border border-emerald-200 text-emerald-900'
                : 'bg-red-50 border border-red-200 text-red-900'
            }`}
          >
            <div className="flex items-center gap-2">
              {feedbackMessage?.type === 'success' ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" />
              ) : (
                <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
              )}
              <span>{feedbackMessage?.text || sheetsConfig.lastError}</span>
            </div>
            {feedbackMessage && (
              <button
                type="button"
                onClick={() => setFeedbackMessage(null)}
                className="text-slate-500 hover:text-slate-800 cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        )}
      </section>

      {/* Modal: Google Apps Script Web App Setup & Ready-to-Copy Code */}
      {showManageModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 flex items-center justify-center p-4 overflow-y-auto">
          <div className="w-full max-w-2xl bg-white border-2 border-[#7c2529] rounded-2xl p-6 md:p-8 space-y-6 shadow-xl my-8">
            <div className="flex items-start justify-between gap-4 pb-4 border-b border-slate-200">
              <div>
                <h3 className="text-lg font-bold text-[#7c2529]">
                  ربط Google Sheets عبر Google Apps Script Web App URL
                </h3>
                <p className="text-xs text-slate-600 mt-1">
                  لا يتطلب تسجيل دخول مستخدم أو مفاتيح OAuth Client ID — يعمل مباشرة على مدار الساعة لجميع المتقدمين والمشرفين.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowManageModal(false)}
                className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Step 1: Copy Ready Apps Script Code */}
            <div className="p-4 bg-[#FAF8F7] border border-slate-200 rounded-xl space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-xs font-bold text-[#7c2529]">
                  الخطوة 1: انسخ كود Google Apps Script الجاهز (ينشئ الملف والجداول العربية الخمسة تلقائياً)
                </div>
                <button
                  type="button"
                  onClick={handleCopyScriptCode}
                  className="px-3.5 py-1.5 bg-[#7c2529] hover:bg-[#631d20] text-white text-xs font-bold rounded-lg flex items-center gap-1.5 cursor-pointer"
                >
                  {copiedCode ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-[#ffc72c]" />
                      <span>تم نسخ الكود بالكامل</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5 text-[#ffc72c]" />
                      <span>نسخ الكود الجاهز (Code.gs)</span>
                    </>
                  )}
                </button>
              </div>

              <ol className="text-xs text-slate-700 space-y-1.5 list-decimal list-inside leading-relaxed">
                <li>
                  افتح صفحة{' '}
                  <a
                    href="https://script.new"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[#7c2529] font-bold underline"
                  >
                    script.new
                  </a>{' '}
                  (أو افتح أي ملف Google Sheet واختر من القائمة العلوية:{' '}
                  <strong>Extensions / الإضافات &rarr; Apps Script</strong>).
                </li>
                <li>
                  امسح أي كود موجود والصق الكود المنسوخ أعلاه، ثم اضغط أعلى اليسار على{' '}
                  <strong>Deploy (نشر) &rarr; New deployment (نشر جديد)</strong>.
                </li>
                <li>
                  اختر النوع <strong>Web app (تطبيق ويب)</strong>، واجعل{' '}
                  <strong>Who has access (من لديه حق الوصول) = Anyone (أي شخص)</strong>، ثم اضغط{' '}
                  <strong>Deploy</strong> وانسخ رابط <strong>Web app URL</strong> المنتهي بـ{' '}
                  <code className="font-mono-tabular bg-white px-1.5 py-0.5 rounded border">
                    /exec
                  </code>
                  .
                </li>
              </ol>
            </div>

            {/* Step 2: Paste Web App URL & Connect */}
            <form onSubmit={handleSaveAndConnectWebApp} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-900 mb-1.5">
                  الخطوة 2: الصق رابط Google Apps Script Web App URL هنا:
                </label>
                <input
                  type="url"
                  required
                  dir="ltr"
                  value={webAppUrlInput}
                  onChange={(e) => setWebAppUrlInput(e.target.value)}
                  placeholder="https://script.google.com/macros/s/AKfycb.../exec"
                  className="w-full px-3.5 py-2.5 text-xs font-mono-tabular bg-slate-50 border border-slate-300 rounded-xl focus:outline-none focus:border-[#7c2529] focus:bg-white"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  اختياري: رابط أو معرف ملف Google Sheet محدد (إذا تركته فارغاً سيقوم السكربت بإنشاء ملف جديد تلقائياً أو استخدام الشيت المفتوح):
                </label>
                <input
                  type="text"
                  dir="ltr"
                  value={customSheetInput}
                  onChange={(e) => setCustomSheetInput(e.target.value)}
                  placeholder="اختياري — اتركه فارغاً للإنشاء التلقائي"
                  className="w-full px-3.5 py-2 text-xs font-mono-tabular bg-slate-50 border border-slate-300 rounded-xl focus:outline-none focus:border-[#7c2529] focus:bg-white"
                />
              </div>

              {sheetsConfig.spreadsheetUrl && (
                <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center justify-between text-xs">
                  <span className="font-bold text-emerald-900">
                    ملف Google Sheets المتصل حالياً جاهز:
                  </span>
                  <a
                    href={sheetsConfig.spreadsheetUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-[#7c2529] font-bold hover:underline"
                  >
                    <span>فتح الجدول في Google Sheets</span>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                </div>
              )}

              <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setShowManageModal(false)}
                  className="px-4 py-2.5 text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl cursor-pointer"
                >
                  إغلاق
                </button>
                <button
                  type="submit"
                  disabled={busyAction !== 'NONE'}
                  className="px-6 py-2.5 bg-[#7c2529] hover:bg-[#631d20] disabled:opacity-60 text-white text-xs font-bold rounded-xl flex items-center gap-2 cursor-pointer"
                >
                  <RefreshCw
                    className={`w-4 h-4 text-[#ffc72c] ${
                      busyAction === 'INIT' ? 'animate-spin' : ''
                    }`}
                  />
                  <span>
                    {busyAction === 'INIT'
                      ? 'جاري الاتصال وتهيئة الجداول العربية...'
                      : 'حفظ الرابط وتهيئة ومزامنة Google Sheets الآن'}
                  </span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Confirmation Modal */}
      {confirmDialog && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-white border-2 border-[#7c2529] rounded-2xl p-6 space-y-4 shadow-xl">
            <div className="flex items-center gap-2.5 text-[#7c2529]">
              <AlertTriangle className="w-5 h-5 shrink-0" />
              <h4 className="text-base font-bold">{confirmDialog.title}</h4>
            </div>
            <p className="text-xs text-slate-600 leading-relaxed">
              {confirmDialog.description}
            </p>
            <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-200">
              <button
                type="button"
                onClick={() => setConfirmDialog(null)}
                className="px-4 py-2 text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl cursor-pointer"
              >
                إلغاء
              </button>
              <button
                type="button"
                onClick={() => confirmDialog.onConfirm()}
                className="px-4 py-2 text-xs font-bold text-white bg-[#7c2529] hover:bg-[#631d20] rounded-xl cursor-pointer"
              >
                {confirmDialog.confirmLabel}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

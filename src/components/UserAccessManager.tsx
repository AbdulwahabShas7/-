import React, { useState } from 'react';
import {
  UserPlus,
  Shield,
  Trash2,
  Edit3,
  Check,
  X,
  KeyRound,
  Sliders,
} from 'lucide-react';
import {
  PERMISSION_DEFINITIONS,
  PermissionKey,
  ROLE_PRESET_PERMISSIONS,
  SystemUser,
  SystemUserRole,
  USER_ROLE_LABELS,
  UserPermissions,
} from '../types/assessment';

interface UserAccessManagerProps {
  users: SystemUser[];
  currentUser: SystemUser;
  canManageUsers: boolean;
  onSaveUser: (user: SystemUser) => void;
  onDeleteUser: (userId: string) => void;
}

export const UserAccessManager: React.FC<UserAccessManagerProps> = ({
  users,
  currentUser,
  canManageUsers,
  onSaveUser,
  onDeleteUser,
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [fullName, setFullName] = useState('');
  const [jobTitle, setJobTitle] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<SystemUserRole>('HR_SPECIALIST');
  const [permissions, setPermissions] = useState<UserPermissions>({
    ...ROLE_PRESET_PERMISSIONS.HR_SPECIALIST,
  });
  const [active, setActive] = useState(true);

  const handleOpenNew = () => {
    setEditingId(null);
    setFullName('');
    setJobTitle('');
    setUsername('');
    setPassword('');
    setRole('HR_SPECIALIST');
    setPermissions({ ...ROLE_PRESET_PERMISSIONS.HR_SPECIALIST });
    setActive(true);
    setIsEditing(true);
  };

  const handleOpenEdit = (u: SystemUser) => {
    setEditingId(u.id);
    setFullName(u.fullName);
    setJobTitle(u.jobTitle || USER_ROLE_LABELS[u.role].ar);
    setUsername(u.username);
    setPassword(u.password);
    setRole(u.role);
    setPermissions(
      u.permissions
        ? { ...u.permissions }
        : { ...ROLE_PRESET_PERMISSIONS[u.role] }
    );
    setActive(u.active);
    setIsEditing(true);
  };

  const handleRoleChange = (newRole: SystemUserRole) => {
    setRole(newRole);
    if (newRole !== 'CUSTOM') {
      setPermissions({ ...ROLE_PRESET_PERMISSIONS[newRole] });
    }
  };

  const handleTogglePermission = (key: PermissionKey) => {
    setPermissions((prev) => {
      const next = { ...prev, [key]: !prev[key] };
      // Ensure dependent view permission is enabled when an action permission is enabled
      if (key === 'create_sessions' && next.create_sessions) next.view_sessions = true;
      if (key === 'delete_sessions' && next.delete_sessions) next.view_sessions = true;
      if (key === 'print_export_reports' && next.print_export_reports) next.view_analytics = true;
      if (key === 'edit_questions' && next.edit_questions) next.view_questions = true;
      if (key === 'import_export_questions' && next.import_export_questions)
        next.view_questions = true;
      if (key === 'edit_settings' && next.edit_settings) next.view_settings = true;
      return next;
    });
    setRole('CUSTOM');
  };

  const handleSelectAllPermissions = (enableAll: boolean) => {
    const updated = {} as UserPermissions;
    PERMISSION_DEFINITIONS.forEach((def) => {
      updated[def.key] = enableAll;
    });
    if (!enableAll) {
      updated.view_analytics = true; // Keep at least one view active
    }
    setPermissions(updated);
    setRole(enableAll ? 'HR_ADMIN' : 'CUSTOM');
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!fullName.trim() || !username.trim() || !password.trim()) return;

    const existing = editingId ? users.find((u) => u.id === editingId) : undefined;

    const userObj: SystemUser = {
      id: editingId || `usr-${Date.now()}`,
      fullName: fullName.trim(),
      username: username.trim().toLowerCase(),
      password: password.trim(),
      role,
      permissions: { ...permissions },
      jobTitle: jobTitle.trim() || USER_ROLE_LABELS[role].ar,
      branch: '',
      active,
      createdAt: existing ? existing.createdAt : new Date().toISOString(),
    };

    onSaveUser(userObj);
    setIsEditing(false);
  };

  // Group permissions by module for clean visual matrix
  const permissionGroups = Array.from(
    new Set(PERMISSION_DEFINITIONS.map((d) => d.group))
  ).map((groupName) => ({
    groupName,
    items: PERMISSION_DEFINITIONS.filter((d) => d.group === groupName),
  }));

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 flex flex-wrap items-center justify-between gap-4 shadow-xs">
        <div>
          <h2 className="text-xl font-bold text-[#7c2529]">
            إدارة المستخدمين وتخصيص الصلاحيات التفصيلية
          </h2>
          <p className="text-xs text-slate-600 mt-1">
            يمكنك اختيار قالب صلاحيات جاهز أو تخصيص صلاحيات دقيقة لكل مستخدم لتحديد الأقسام والعمليات المسموح له الوصول إليها بالتفصيل في المنصة.
          </p>
        </div>

        {canManageUsers && (
          <button
            type="button"
            onClick={handleOpenNew}
            className="px-4 py-2.5 bg-[#7c2529] hover:bg-[#631d20] text-white text-xs font-bold rounded-xl flex items-center gap-2 transition-colors cursor-pointer"
          >
            <UserPlus className="w-4 h-4 text-[#ffc72c]" />
            <span>إضافة مستخدم جديد وتخصيص صلاحياته</span>
          </button>
        )}
      </div>

      {/* Role Cards Summary */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {(
          Object.entries(USER_ROLE_LABELS) as [
            SystemUserRole,
            (typeof USER_ROLE_LABELS)['HR_ADMIN'],
          ][]
        ).map(([roleKey, info]) => {
          const count = users.filter((u) => u.role === roleKey).length;
          return (
            <div
              key={roleKey}
              className="bg-white border border-slate-200 rounded-2xl p-5 space-y-2 shadow-xs"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-bold text-[#7c2529] flex items-center gap-1.5">
                  <Shield className="w-4 h-4 text-[#ffc72c] shrink-0" />
                  <span>{info.ar}</span>
                </span>
                <span className="font-mono-tabular text-xs font-bold text-slate-700 bg-slate-100 px-2.5 py-0.5 rounded-md shrink-0">
                  {count}
                </span>
              </div>
              <p className="text-xs text-slate-600 leading-relaxed">{info.description}</p>
            </div>
          );
        })}
      </div>

      {/* Add / Edit User Modal Form with Granular Permission Matrix */}
      {isEditing && canManageUsers && (
        <div className="bg-white border-2 border-[#7c2529]/30 rounded-2xl p-6 md:p-8 space-y-6 shadow-xs">
          <div className="flex items-center justify-between pb-4 border-b border-slate-200">
            <h3 className="text-base font-bold text-[#7c2529] flex items-center gap-2">
              <Sliders className="w-4 h-4 text-[#7c2529]" />
              <span>
                {editingId
                  ? 'تعديل بيانات المستخدم وتخصيص صلاحياته التفصيلية'
                  : 'إضافة مستخدم جديد وتحديد صلاحيات الوصول التفصيلية'}
              </span>
            </h3>
            <button
              type="button"
              onClick={() => setIsEditing(false)}
              className="text-slate-400 hover:text-slate-700 cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  الاسم الكامل للمستخدم
                </label>
                <input
                  type="text"
                  required
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="مثال: أ. محمد عبدالله الكبسي"
                  className="w-full px-3.5 py-2.5 text-sm bg-slate-50 border border-slate-300 rounded-xl focus:outline-none focus:border-[#7c2529]"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  الصفة الإدارية / القسم (اختياري)
                </label>
                <input
                  type="text"
                  value={jobTitle}
                  onChange={(e) => setJobTitle(e.target.value)}
                  placeholder="مثال: مشرف اختبارات / عضو لجنة القبول"
                  className="w-full px-3.5 py-2.5 text-sm bg-slate-50 border border-slate-300 rounded-xl focus:outline-none focus:border-[#7c2529]"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  قالب الصلاحية الأساسي
                </label>
                <select
                  value={role}
                  onChange={(e) => handleRoleChange(e.target.value as SystemUserRole)}
                  className="w-full px-3.5 py-2.5 text-sm bg-slate-50 border border-slate-300 rounded-xl focus:outline-none focus:border-[#7c2529]"
                >
                  <option value="HR_ADMIN">مدير الموارد البشرية (وصول كامل)</option>
                  <option value="HR_SPECIALIST">أخصائي موارد بشرية وتوظيف</option>
                  <option value="EXECUTIVE_VIEWER">الإدارة العليا (اطلاع وتقارير فقط)</option>
                  <option value="CUSTOM">صلاحيات مخصصة (Custom Access)</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  اسم المستخدم للدخول (Username)
                </label>
                <input
                  type="text"
                  required
                  dir="ltr"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="hr.mohammed"
                  className="w-full px-3.5 py-2.5 text-sm font-mono-tabular bg-slate-50 border border-slate-300 rounded-xl focus:outline-none focus:border-[#7c2529]"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  كلمة المرور / رمز الدخول
                </label>
                <input
                  type="text"
                  required
                  dir="ltr"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="123"
                  className="w-full px-3.5 py-2.5 text-sm font-mono-tabular bg-slate-50 border border-slate-300 rounded-xl focus:outline-none focus:border-[#7c2529]"
                />
              </div>

              <div className="flex items-end">
                <label className="w-full flex items-center gap-2.5 px-4 py-2.5 bg-slate-50 border border-slate-300 rounded-xl cursor-pointer">
                  <input
                    type="checkbox"
                    checked={active}
                    onChange={(e) => setActive(e.target.checked)}
                    className="w-4 h-4 accent-[#7c2529]"
                  />
                  <span className="text-xs font-bold text-slate-800">
                    الحساب نشط ومسموح له بتسجيل الدخول
                  </span>
                </label>
              </div>
            </div>

            {/* Granular Permissions Matrix */}
            <div className="space-y-4 pt-2 border-t border-slate-200">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h4 className="text-sm font-bold text-[#7c2529]">
                    مصفوفة الصلاحيات المخصصة (تحديد الوصول لكل جزء في المنصة بالتفصيل)
                  </h4>
                  <p className="text-xs text-slate-500 mt-0.5">
                    حدد بدقة الأقسام والعمليات الفرعية التي يحق لهذا المستخدم رؤيتها أو تنفيذها
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleSelectAllPermissions(true)}
                    className="px-3 py-1.5 text-xs font-bold text-[#7c2529] bg-[#FAF8F7] hover:bg-[#7c2529]/10 border border-slate-300 rounded-lg cursor-pointer"
                  >
                    منح كافة الصلاحيات
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSelectAllPermissions(false)}
                    className="px-3 py-1.5 text-xs font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg cursor-pointer"
                  >
                    إلغاء التحديد (تقارير فقط)
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {permissionGroups.map((group) => (
                  <div
                    key={group.groupName}
                    className="bg-[#FAF8F7] border border-slate-200 rounded-xl p-4 space-y-3"
                  >
                    <div className="text-xs font-bold text-[#7c2529] pb-2 border-b border-slate-200">
                      {group.groupName}
                    </div>
                    <div className="space-y-2.5">
                      {group.items.map((perm) => {
                        const checked = Boolean(permissions[perm.key]);
                        return (
                          <label
                            key={perm.key}
                            className={`flex items-start gap-2.5 p-2 rounded-lg border transition-colors cursor-pointer ${
                              checked
                                ? 'bg-white border-[#7c2529]/40 text-slate-900'
                                : 'bg-transparent border-transparent text-slate-600 hover:bg-white/60'
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => handleTogglePermission(perm.key)}
                              className="mt-0.5 w-4 h-4 accent-[#7c2529] shrink-0"
                            />
                            <span className="text-xs font-semibold leading-snug">
                              {perm.label}
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-200">
              <button
                type="button"
                onClick={() => setIsEditing(false)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-900 cursor-pointer"
              >
                إلغاء
              </button>
              <button
                type="submit"
                className="px-6 py-2.5 bg-[#7c2529] hover:bg-[#631d20] text-white text-xs font-bold rounded-xl flex items-center gap-1.5 cursor-pointer"
              >
                <Check className="w-4 h-4 text-[#ffc72c]" />
                <span>حفظ المستخدم والصلاحيات المخصصة</span>
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Users Table with Granular Permissions Overview */}
      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-right text-sm">
            <thead className="bg-[#FAF8F7] border-b border-slate-200 text-xs text-slate-600">
              <tr>
                <th className="py-3.5 px-4 font-semibold">الاسم الكامل والصفة</th>
                <th className="py-3.5 px-4 font-semibold">نوع الدور</th>
                <th className="py-3.5 px-4 font-semibold">الصلاحيات التفصيلية الممنوحة</th>
                <th className="py-3.5 px-4 font-semibold text-left">اسم المستخدم</th>
                <th className="py-3.5 px-4 font-semibold text-left">الحالة</th>
                {canManageUsers && (
                  <th className="py-3.5 px-4 font-semibold text-left">إجراءات</th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {users.map((u) => {
                const userPerms = u.permissions || ROLE_PRESET_PERMISSIONS[u.role];
                const enabledPerms = PERMISSION_DEFINITIONS.filter((d) => userPerms[d.key]);

                return (
                  <tr key={u.id} className="hover:bg-slate-50/80">
                    <td className="py-3.5 px-4 align-top">
                      <div className="font-bold text-slate-900">{u.fullName}</div>
                      {u.jobTitle && (
                        <div className="text-xs text-slate-500 mt-0.5">{u.jobTitle}</div>
                      )}
                    </td>

                    <td className="py-3.5 px-4 align-top text-xs">
                      <span className="font-bold text-[#7c2529]">
                        {USER_ROLE_LABELS[u.role]?.ar || 'صلاحيات مخصصة'}
                      </span>
                    </td>

                    <td className="py-3.5 px-4 align-top max-w-md">
                      <div className="flex flex-wrap gap-1.5">
                        {enabledPerms.map((p) => (
                          <span
                            key={p.key}
                            className="text-[11px] font-medium bg-[#FAF8F7] text-slate-700 border border-slate-200 px-2 py-0.5 rounded-md"
                          >
                            {p.label}
                          </span>
                        ))}
                      </div>
                    </td>

                    <td className="py-3.5 px-4 align-top text-left font-mono-tabular text-xs font-bold text-slate-800">
                      <span className="inline-flex items-center gap-1">
                        <KeyRound className="w-3.5 h-3.5 text-slate-400" />
                        {u.username}
                      </span>
                    </td>

                    <td className="py-3.5 px-4 align-top text-left text-xs font-bold">
                      {u.active ? (
                        <span className="text-emerald-700">نشط</span>
                      ) : (
                        <span className="text-slate-400">موقوف</span>
                      )}
                    </td>

                    {canManageUsers && (
                      <td className="py-3.5 px-4 align-top text-left">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => handleOpenEdit(u)}
                            className="px-2.5 py-1.5 text-xs font-bold text-[#7c2529] bg-[#FAF8F7] hover:bg-[#7c2529] hover:text-white border border-slate-200 rounded-lg transition-colors inline-flex items-center gap-1 cursor-pointer"
                            title="تعديل الصلاحيات التفصيلية"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                            <span>تخصيص الصلاحيات</span>
                          </button>
                          {u.id !== currentUser.id && (
                            <button
                              type="button"
                              onClick={() => onDeleteUser(u.id)}
                              className="p-1.5 text-slate-600 hover:text-red-700 hover:bg-red-50 rounded-md transition-colors cursor-pointer"
                              title="حذف المستخدم"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

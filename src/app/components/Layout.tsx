import React, { useState, useEffect } from 'react';
import { NavLink, useLocation, Outlet } from 'react-router';
import { FileText, ShoppingCart, Receipt, Calculator, CheckCircle2, List, LayoutTemplate, Folder, Cloud } from 'lucide-react';
import { useData } from '../context/DataContext';

const STEPS = [
  {
    path: '/',
    label: 'Спецификация',
    shortLabel: 'Спецификация',
    icon: FileText,
    description: 'Список материалов',
  },
  {
    path: '/purchase',
    label: 'Запрос поставщику',
    shortLabel: 'Запрос',
    icon: ShoppingCart,
    description: 'Закупочный запрос',
  },
  {
    path: '/invoice',
    label: 'Счёт поставщика',
    shortLabel: 'Счёт',
    icon: Receipt,
    description: 'Входящий счёт',
  },
  {
    path: '/estimate',
    label: 'Смета',
    shortLabel: 'Смета',
    icon: Calculator,
    description: 'Файл для программы смет',
  },
];

export function Layout() {
  const location = useLocation();
  const { projectName, setProjectName, specRows, invoiceRows, estimateRows, configKeys, setConfigKeys, yandexConfig, saveYandexConfig } = useData();
  const [editingName, setEditingName] = useState(false);
  const [nameVal, setNameVal] = useState(projectName);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'success' | 'warning' | 'error'>('idle');
  const [syncError, setSyncError] = useState(false);

  // Settings Panel local state
  const [localApiKey, setLocalApiKey] = useState(yandexConfig.apiKey);
  const [localFolderId, setLocalFolderId] = useState(yandexConfig.folderId);

  useEffect(() => {
    // Keep local state in sync if yandexConfig changes externally
    setLocalApiKey(yandexConfig.apiKey);
    setLocalFolderId(yandexConfig.folderId);
  }, [yandexConfig]);

  useEffect(() => {
    fetch('http://localhost:8000/api/config')
      .then(r => r.json())
      .then(d => {
        if (d.keys && Object.keys(d.keys).length > 0) {
          setConfigKeys(d.keys);
        }
      })
      .catch(e => console.error('Config fetch error:', e));
  }, [setConfigKeys]);

  // LIVE STATUS based on local state (for instant feedback while typing)
  const currentIsFully = Boolean(localApiKey.trim() && localFolderId.trim());
  const currentIsPartial = Boolean((localApiKey.trim() && !localFolderId.trim()) || (!localApiKey.trim() && localFolderId.trim()));
  const currentIsNone = !localApiKey.trim() && !localFolderId.trim();

  // Clear sync error when typing
  useEffect(() => {
    if (syncError) setSyncError(false);
  }, [localApiKey, localFolderId, syncError]);

  const handleSaveSettings = async () => {
    // 1. Initial State
    setSaveStatus('idle');
    setSyncError(false);

    // 2. Data Sync (Awaited)
    const config = { apiKey: localApiKey, folderId: localFolderId };
    saveYandexConfig(config);
    
    try {
      const res = await fetch('http://localhost:8000/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          keys: { 
            YANDEX_API_KEY: localApiKey, 
            YANDEX_FOLDER_ID: localFolderId 
          } 
        }),
      });

      if (!res.ok) throw new Error('API Sync Error');
      setSyncError(false);
    } catch (e) {
      console.error('Failed to sync config to backend:', e);
      setSyncError(true);
      setSaveStatus('error');
      // On network error, still close eventually as requested
      setTimeout(() => {
        setIsSettingsOpen(false);
        setSaveStatus('idle');
      }, 1500);
      return;
    }

    // 3. UI Feedback and Closure AFTER Response
    if (currentIsFully) {
      setSaveStatus('success');
      setTimeout(() => {
        setIsSettingsOpen(false);
        setSaveStatus('idle');
      }, 300);
    } else if (currentIsPartial) {
      setSaveStatus('error');
      // As requested: close after response, but give time to see the error
      setTimeout(() => {
        setIsSettingsOpen(false);
        setSaveStatus('idle');
      }, 1500);
    } else {
      // currentIsNone
      setSaveStatus('warning');
      setTimeout(() => {
        setIsSettingsOpen(false);
        setSaveStatus('idle');
      }, 300);
    }
  };

  const activeIndex = STEPS.findIndex((s) => {
    if (s.path === '/') return location.pathname === '/';
    return location.pathname.startsWith(s.path);
  });

  const hasData = [specRows.length > 0, specRows.length > 0, invoiceRows.length > 0, estimateRows.length > 0];

  const handleNameBlur = () => {
    setEditingName(false);
    setProjectName(nameVal || 'Новый проект');
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <div className="relative z-40">
        {/* Global Header (Row 1) */}
        <header className="bg-white border-b border-gray-200 px-6 py-3 flex flex-wrap items-center justify-between gap-4 shrink-0 relative z-50">
          <div className="flex items-center gap-6">
            {/* Logo */}
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 bg-gray-900 rounded flex items-center justify-center">
                <FileText size={12} className="text-white" />
              </div>
              <span className="text-sm font-semibold text-gray-900 tracking-tight">DocFlow</span>
            </div>

            <div className="w-px h-4 bg-gray-200" />

            {/* Global Navigation */}
            <div className="flex items-center gap-1">
              <button className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-gray-900 bg-gray-100/80 rounded-lg transition-colors">
                <LayoutTemplate size={16} className="text-gray-700" />
                <span className="hidden sm:inline">Рабочая область</span>
              </button>
              <button className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-gray-500 hover:text-gray-900 hover:bg-gray-50 rounded-lg transition-colors">
                <List size={16} />
                <span className="hidden sm:inline">Список проектов</span>
              </button>
            </div>
          </div>

          {/* Right Header Actions - Cloud Settings Button */}
          <div className="flex items-center gap-3">
            {/* Inline Desktop Settings */}
            {isSettingsOpen && (
              <div className="hidden md:flex items-center gap-4 animate-in fade-in slide-in-from-right-2 duration-300">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest whitespace-nowrap">API Key</span>
                  <input
                    type="password"
                    value={localApiKey}
                    onChange={(e) => setLocalApiKey(e.target.value)}
                    placeholder="AQVN..."
                    className="w-40 px-3 py-1.5 bg-gray-50/50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500 transition-all text-sm font-medium text-gray-900"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest whitespace-nowrap">Folder ID</span>
                  <input
                    type="text"
                    value={localFolderId}
                    onChange={(e) => setLocalFolderId(e.target.value)}
                    placeholder="b1g..."
                    className="w-36 px-3 py-1.5 bg-gray-50/50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500 transition-all text-sm font-medium text-gray-900"
                  />
                </div>
                <button
                  onClick={handleSaveSettings}
                  className={`px-5 py-1.5 text-xs font-bold text-white rounded-lg transition-all active:scale-95 shadow-sm
                    ${saveStatus === 'success' ? 'bg-green-600' : saveStatus === 'error' ? 'bg-red-600 animate-shake' : saveStatus === 'warning' ? 'bg-yellow-400' : 'bg-blue-600 hover:bg-blue-700'}`}
                >
                  Ок
                </button>
              </div>
            )}

            <button
              onClick={() => setIsSettingsOpen(!isSettingsOpen)}
              className={`p-1.5 rounded-lg transition-all flex items-center justify-center shrink-0 border-2
                ${syncError
                  ? 'bg-red-50 text-red-600 border-red-400 hover:bg-red-100 animate-shake'
                  : currentIsFully 
                  ? 'text-green-600 bg-green-50 border-green-100 hover:bg-green-100' 
                  : currentIsPartial
                  ? 'bg-red-50 text-red-600 border-red-100 hover:bg-red-100 animate-pulse'
                  : 'bg-yellow-50 text-yellow-600 border-yellow-100 hover:bg-yellow-100 animate-pulse'
                }`}
              title={syncError ? 'Ошибка сохранения на сервер' : currentIsNone ? 'Требуется настройка' : currentIsPartial ? 'Данные не до конца заполнены' : 'Настройки нейросети'}
            >
              <Cloud size={18} fill={currentIsFully && !syncError ? 'currentColor' : 'none'} className={currentIsFully && !syncError ? 'opacity-40' : ''} />
            </button>
          </div>
        </header>

        {/* Mobile Settings Panel (Dropdown) */}
        {isSettingsOpen && (
          <div className="md:hidden absolute top-full left-0 right-0 bg-white border-b border-gray-200 shadow-md px-6 z-40 h-[64px] flex items-center origin-top animate-in slide-in-from-top-2 fade-in duration-200">
            <div className="w-full flex flex-row items-center justify-between gap-3">
              <div className="flex-1 flex gap-2">
                <input
                  type="password"
                  value={localApiKey}
                  onChange={(e) => setLocalApiKey(e.target.value)}
                  placeholder="API Key"
                  className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:outline-none text-sm"
                />
                <input
                  type="text"
                  value={localFolderId}
                  onChange={(e) => setLocalFolderId(e.target.value)}
                  placeholder="Folder ID"
                  className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:outline-none text-sm"
                />
              </div>
              <button
                onClick={handleSaveSettings}
                className={`px-5 py-2 text-sm font-bold text-white rounded-lg shrink-0 transition-colors
                  ${saveStatus === 'success' ? 'bg-green-600' : saveStatus === 'error' ? 'bg-red-600' : saveStatus === 'warning' ? 'bg-yellow-400' : 'bg-blue-600'}`}
              >
                Ок
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Project Context Panel (Row 2) */}
      <nav className="bg-white border-b border-gray-200 px-4 md:px-6 shrink-0 relative z-20 shadow-sm">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 py-2 lg:py-0 min-h-[56px] w-full">
          
          {/* ZONE 1: Left - Project Name */}
          <div className="flex items-center lg:w-1/3 shrink-0 gap-3">
            <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-gray-100 text-gray-500 shadow-inner shrink-0 tracking-tighter">
              <Folder size={18} fill="currentColor" className="opacity-20" />
            </div>
            <div className="flex items-center text-sm text-gray-400 font-medium whitespace-nowrap">
              <span>Проекты</span>
              <span className="mx-2 opacity-50">/</span>
              {editingName ? (
                <input
                  autoFocus
                  value={nameVal}
                  onChange={(e) => setNameVal(e.target.value)}
                  onBlur={handleNameBlur}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === 'Escape') handleNameBlur();
                  }}
                  className="text-base font-extrabold text-gray-900 border-b-2 border-blue-500 outline-none bg-transparent px-1 w-full max-w-[250px]"
                />
              ) : (
                <button
                  onClick={() => {
                    setNameVal(projectName);
                    setEditingName(true);
                  }}
                  className="text-base font-extrabold text-gray-900 hover:text-blue-600 transition-colors cursor-text px-1 truncate text-left max-w-[300px]"
                  title="Редактировать название проекта"
                >
                  {projectName}
                </button>
              )}
            </div>
          </div>

          {/* ZONE 2: Center - Tabs */}
          <div className="flex items-stretch gap-0 overflow-x-auto no-scrollbar lg:justify-center lg:flex-1 -mb-2 lg:-mb-0 pb-2 lg:pb-0">
            {STEPS.map((step, index) => {
              const isActive = index === activeIndex;
              const isDone = hasData[index] && !isActive;

              return (
                <NavLink
                  key={step.path}
                  to={step.path}
                  className={`
                    flex items-center gap-2.5 px-3 md:px-5 py-3 md:py-3.5 text-sm transition-all whitespace-nowrap shrink-0
                    border-b-2
                    ${isActive
                      ? 'border-gray-900 text-gray-900'
                      : isDone
                      ? 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                      : 'border-transparent text-gray-400 hover:text-gray-600 hover:border-gray-200'
                    }
                  `}
                >
                  <span
                    className={`
                      flex items-center justify-center w-5 h-5 rounded-full text-xs shrink-0
                      ${isActive
                        ? 'bg-gray-900 text-white'
                        : isDone
                        ? 'bg-green-100 text-green-600'
                        : 'bg-gray-100 text-gray-400'
                      }
                    `}
                  >
                    {isDone ? <CheckCircle2 size={12} /> : index + 1}
                  </span>
                  <span className="hidden sm:block">{step.label}</span>
                  <span className="sm:hidden">{step.shortLabel}</span>
                </NavLink>
              );
            })}
          </div>

          {/* ZONE 3: Right - Toolbar Portal Actions */}
          <div className="flex items-center lg:w-1/4 shrink-0 lg:justify-end min-h-[40px]">
            <div id="toolbar-portal" className="flex items-center gap-2 flex-wrap w-full lg:justify-end"></div>
          </div>

        </div>
      </nav>

      {/* Page content */}
      <main className="flex-1 overflow-auto bg-gray-50 flex flex-col">
        <Outlet />
      </main>
    </div>
  );
}

import React, { useState, useCallback, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router';
import { arrayMove } from '@dnd-kit/sortable';
import { Upload, Download, ArrowRight, RotateCcw, Calculator, Layers, Rows, X, ChevronUp, Trash2, RefreshCw, Brain, CheckCircle2, Clock, AlertCircle, FileText } from 'lucide-react';
import { EditableTable, ColumnDef } from '../components/EditableTable';
import { FileUploadZone } from '../components/FileUploadZone';
import { useData, genId, InvoiceRow } from '../context/DataContext';
import {
  parseFile,
  exportToExcel,
  autoDetectMapping,
  INVOICE_ALIASES,
  DetectedMapping,
} from '../utils/fileUtils';

const INVOICE_COLUMNS: ColumnDef[] = [
  { key: 'article', label: 'Артикул', width: 110 },
  { key: 'supplier', label: 'Поставщик', width: 140 },
  { key: 'name', label: 'Наименование', width: 220 },
  { key: 'quantity', label: 'Кол-во', width: 100, type: 'number', align: 'right' },
  { key: 'unit', label: 'Ед.', width: 80, align: 'center' },
  { key: 'price', label: 'Цена', width: 100, type: 'number', align: 'right' },
  { key: 'vat', label: 'НДС', width: 80, align: 'center' },
  { key: 'vatAmount', label: 'Сумма НДС', width: 110, type: 'number', align: 'right' },
  { key: 'total', label: 'Сумма', width: 110, type: 'number', align: 'right' },
];

const INVOICE_TARGET_FIELDS = [
  { key: 'article', label: 'Артикул' },
  { key: 'supplier', label: 'Поставщик' },
  { key: 'name', label: 'Наименование', required: true },
  { key: 'quantity', label: 'Количество' },
  { key: 'unit', label: 'Единицы измерения' },
  { key: 'price', label: 'Цена' },
  { key: 'vat', label: 'НДС (ставка)' },
  { key: 'vatAmount', label: 'Сумма НДС' },
  { key: 'total', label: 'Сумма' },
];

type ViewMode = 'list' | 'grouped';

function emptyRow(): InvoiceRow {
  return {
    id: genId(),
    article: '',
    name: '',
    supplier: '',
    quantity: '',
    unit: '',
    price: '',
    vat: '',
    vatAmount: '',
    total: '',
  };
}

export function InvoicePage() {
  const { invoiceRows, setInvoiceRows } = useData();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploadStatuses, setUploadStatuses] = useState<Record<string, { status: string; time: string }>>({});
  const [filesMap, setFilesMap] = useState<Record<string, File>>({});

  const [columns, setColumns] = useState<ColumnDef[]>(INVOICE_COLUMNS);
  
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [toolbarPortalNode, setToolbarPortalNode] = useState<HTMLElement | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [isDropZoneVisible, setIsDropZoneVisible] = useState(false);
  const dragCounter = useRef(0);

  useEffect(() => {
    setToolbarPortalNode(document.getElementById('toolbar-portal'));
  }, []);

  const handleFileRef = useRef<any>(null);

  useEffect(() => {
    const handleDragEnter = (e: DragEvent) => {
      e.preventDefault();
      // Only show overlay if we actually have a table/files (don't conflicts with default uploader)
      if (invoiceRows.length === 0 && Object.keys(filesMap).length === 0) return;
      dragCounter.current += 1;
      setIsDropZoneVisible(true);
    };
    const handleDragOver = (e: DragEvent) => e.preventDefault();
    const handleDragLeave = (e: DragEvent) => {
      e.preventDefault();
      dragCounter.current -= 1;
      if (dragCounter.current === 0) setIsDropZoneVisible(false);
    };
    const handleDropWindow = async (e: DragEvent) => {
      e.preventDefault();
      dragCounter.current = 0;
      setIsDropZoneVisible(false);
      
      const droppedFiles = Array.from(e.dataTransfer?.files || []);
      const validFiles = droppedFiles.filter(f => {
        const ext = '.' + f.name.split('.').pop()?.toLowerCase();
        return (INVOICE_ALIASES.pdf as any[]).includes(ext) || (INVOICE_ALIASES.excel as any[]).includes(ext);
      });

      if (validFiles.length > 0 && handleFileRef.current) {
        for (const file of validFiles) {
          await handleFileRef.current(file, false);
        }
      }
    };

    window.addEventListener('dragenter', handleDragEnter);
    window.addEventListener('dragover', handleDragOver);
    window.addEventListener('dragleave', handleDragLeave);
    window.addEventListener('drop', handleDropWindow);
    return () => {
      window.removeEventListener('dragenter', handleDragEnter);
      window.removeEventListener('dragover', handleDragOver);
      window.removeEventListener('dragleave', handleDragLeave);
      window.removeEventListener('drop', handleDropWindow);
    };
  }, [invoiceRows.length, filesMap]);

  const handleFile = async (file: File, forceAI: boolean = false) => {
    setLoading(true);
    setError(null);
    const now = new Date();
    const currentTime = `${now.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })} | ${now.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: '2-digit' })}`;
    setUploadStatuses(prev => ({ ...prev, [file.name]: { status: 'Старт...', time: currentTime } }));

    const isPdfOrImage = !!file.name.match(/\.(pdf|png|jpe?g)$/i);
    const useAi = forceAI || isPdfOrImage;

    if (!useAi) {
      setUploadStatuses(prev => ({ ...prev, [file.name]: { status: 'Локальный парсинг...', time: currentTime } }));
      try {
        const { headers, rows: parsedRawRows } = await parseFile(file);
        const detected = autoDetectMapping(headers, INVOICE_ALIASES);
        
        const mapping = Object.fromEntries(
          Object.entries(detected).map(([key, value]) => [key, value.index])
        );

        const newRowsToAppend: InvoiceRow[] = parsedRawRows.map((row) => {
          const r: InvoiceRow = {
            id: genId(),
            documentName: file.name,
            isUncertain: false,
            article: mapping.article !== undefined ? (row[mapping.article] || '') : '',
            name: mapping.name !== undefined ? (row[mapping.name] || '') : '',
            supplier: mapping.supplier !== undefined ? (row[mapping.supplier] || '') : '',
            quantity: mapping.quantity !== undefined ? (row[mapping.quantity] || '') : '',
            unit: mapping.unit !== undefined ? (row[mapping.unit] || '') : '',
            price: mapping.price !== undefined ? (row[mapping.price] || '') : '',
            vat: mapping.vat !== undefined ? (row[mapping.vat] || '') : '',
            vatAmount: mapping.vatAmount !== undefined ? (row[mapping.vatAmount] || '') : '',
            total: mapping.total !== undefined ? (row[mapping.total] || '') : '',
          };

          const qty = parseFloat(String(r.quantity).replace(/\s/g, '').replace(/,/g, '.')) || 0;
          const price = parseFloat(String(r.price).replace(/\s/g, '').replace(/,/g, '.')) || 0;
          const subtotal = qty * price;

          if (!r.total && subtotal > 0) {
            r.total = subtotal.toFixed(2);
          }
          return r;
        });

        const filtered = invoiceRows.filter((r: InvoiceRow) => r.documentName !== file.name);
        setInvoiceRows([...filtered, ...newRowsToAppend]);
        
        setUploadStatuses(prev => ({ ...prev, [file.name]: { status: 'Готово (Локально)', time: currentTime } }));
        setFilesMap(prev => ({ ...prev, [file.name]: file }));
      } catch (e: any) {
        setError(`Ошибка файла ${file.name}: ${e.message}`);
        setUploadStatuses(prev => ({ ...prev, [file.name]: { status: 'Ошибка', time: currentTime } }));
      } finally {
        setLoading(false);
      }
      return; 
    }

    if (useAi) {
      setUploadStatuses(prev => ({ ...prev, [file.name]: { status: 'Конвертация и Анализ ИИ...', time: currentTime } }));
      const formData = new FormData();
      formData.append('file', file);

      try {
        const res = await fetch('http://localhost:8000/api/process-invoice', {
          method: 'POST',
          body: formData,
        });

        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.detail || `Ошибка сервера ${res.status}`);
        }

        const data = await res.json();
        
        const aiRows: InvoiceRow[] = (data.items || []).map((item: any) => ({
           id: genId(),
           documentName: data.document?.filename || data.document?.name || file.name,
           isUncertain: Boolean(item.isUncertain),
           article: item.article || '',
           name: item.name || '',
           supplier: data.document?.metadata?.vendor || '',
           quantity: strToNumOrBlank(item.quantity),
           unit: item.unit || '',
           price: strToNumOrBlank(item.price),
           vat: '',
           vatAmount: '',
           total: strToNumOrBlank(item.total)
        }));

        const filtered = invoiceRows.filter((r: InvoiceRow) => r.documentName !== file.name);
        setInvoiceRows([...filtered, ...aiRows]);
        
        // Auto-show uncertainty warning if any
        if (aiRows.some(r => r.isUncertain)) {
            setColumns(prev => prev.map(c => ({...c, isUncertain: true})));
        }
        
        setUploadStatuses(prev => ({ ...prev, [file.name]: { status: 'Готово (ИИ)', time: currentTime } }));
        setFilesMap(prev => ({ ...prev, [file.name]: file }));
      } catch (e: any) {
        setError(e.message || 'Ошибка обработки файла через ИИ');
        setUploadStatuses(prev => ({ ...prev, [file.name]: { status: 'Ошибка', time: currentTime } }));
      } finally {
        setLoading(false);
      }
    }
  };

  const handleDeleteFile = (fileName: string) => {
    setInvoiceRows(prev => prev.filter(r => r.documentName !== fileName));
    setUploadStatuses(prev => {
      const next = { ...prev };
      delete next[fileName];
      return next;
    });
    setFilesMap(prev => {
      const next = { ...prev };
      delete next[fileName];
      return next;
    });
  };

  const strToNumOrBlank = (v: any) => {
     if (!v) return '';
     const parsed = parseFloat(String(v).replace(/,/g, '.').replace(/\s/g, ''));
     return isNaN(parsed) ? String(v) : String(parsed);
  };

  const handleColumnChange = useCallback((oldKey: string, newKey: string) => {
    if (oldKey === newKey) return;
    
    setColumns(prevCols => {
       const newCols = [...prevCols];
       const existingIndex = newCols.findIndex(c => c.key === newKey);
       const oldIndex = newCols.findIndex(c => c.key === oldKey);
       
       if (existingIndex !== -1 && oldIndex !== -1) {
           const targetField1 = INVOICE_TARGET_FIELDS.find(f => f.key === newKey);
           const targetField2 = INVOICE_TARGET_FIELDS.find(f => f.key === oldKey);
           newCols[oldIndex] = { ...newCols[oldIndex], key: newKey, label: targetField1?.label || newKey, isUncertain: false };
           newCols[existingIndex] = { ...newCols[existingIndex], key: oldKey, label: targetField2?.label || oldKey, isUncertain: false };
       } else if (oldIndex !== -1) {
           const targetField = INVOICE_TARGET_FIELDS.find(f => f.key === newKey);
           newCols[oldIndex] = { ...newCols[oldIndex], key: newKey, label: targetField?.label || newKey, isUncertain: false };
       }
       return newCols;
    });

    const newRows = invoiceRows.map(r => {
       const newRow = { ...r } as any;
       const temp = newRow[oldKey];
       newRow[oldKey] = newRow[newKey];
       newRow[newKey] = temp;
       return newRow as InvoiceRow;
    });
    setInvoiceRows(newRows);
  }, [invoiceRows, setInvoiceRows]);

  const handleColumnConfirm = useCallback((key: string) => {
    setColumns(prev => prev.map(c => c.key === key ? { ...c, isUncertain: false } : c));
  }, []);

  const handleColumnOrderChange = useCallback((activeKey: string, overKey: string) => {
    setColumns(prev => {
      const oldIndex = prev.findIndex(c => c.key === activeKey);
      const newIndex = prev.findIndex(c => c.key === overKey);
      return arrayMove(prev, oldIndex, newIndex);
    });
  }, []);

  const handleRowChange = useCallback(
    (index: number, key: string, value: string) => {
      // If in grouped mode, the index refers to groupedRows
      // We should avoid editing in grouped mode to prevent array index mismatch,
      // or implement ID-based lookups. For now, we only allow editing in list mode.
      if (viewMode === 'grouped') return;

      const updated = [...invoiceRows];
      updated[index] = { ...updated[index], [key]: value };

      // Auto-recalculate
      const qtyStr = String(key === 'quantity' ? value : updated[index].quantity).replace(/\s/g, '').replace(/,/g, '.');
      const priceStr = String(key === 'price' ? value : updated[index].price).replace(/\s/g, '').replace(/,/g, '.');
      const vatRateStr = String(key === 'vat' ? value : updated[index].vat).replace(/\s/g, '').replace(/,/g, '.');

      const qty = parseFloat(qtyStr) || 0;
      const price = parseFloat(priceStr) || 0;
      const vatRate = parseFloat(vatRateStr) || 0;
      const subtotal = qty * price;
      
      if (subtotal > 0) {
        const vatAmt = vatRate > 0 ? subtotal * vatRate / 100 : 0;
        updated[index].vatAmount = vatAmt > 0 ? vatAmt.toFixed(2) : updated[index].vatAmount;
        updated[index].total = (subtotal + vatAmt).toFixed(2);
      }

      setInvoiceRows(updated);
    },
    [invoiceRows, setInvoiceRows, viewMode]
  );

  const handleAddRow = useCallback(() => {
    setInvoiceRows([...invoiceRows, emptyRow()]);
  }, [invoiceRows, setInvoiceRows]);

  const handleDeleteRow = useCallback(
    (index: number) => {
      if (viewMode === 'grouped') return;
      setInvoiceRows(invoiceRows.filter((_, i) => i !== index));
    },
    [invoiceRows, setInvoiceRows, viewMode]
  );

  const handleExport = () => {
    const data = invoiceRows.map((r, i) => {
      const rowData: any = { '№': i + 1 };
      columns.forEach(col => {
         rowData[col.label] = (r as any)[col.key];
      });
      return rowData;
    });
    exportToExcel(data, 'Счет_поставщика');
  };

  const handleReset = () => {
    if (window.confirm('Очистить данные счёта?')) {
      setInvoiceRows([]);
    }
  };

  const handleGoToEstimate = () => {
    navigate('/estimate');
  };

  const handleConfirmAllHeader = useCallback(() => {
    setColumns(prev => prev.map(c => ({ ...c, isUncertain: false })));
  }, []);

  const groupRowsByDocument = (rows: InvoiceRow[]) => {
    const groups = new Map<string, InvoiceRow[]>();
    rows.forEach(row => {
      const doc = (row.documentName || 'Без документа').trim();
      if (!groups.has(doc)) groups.set(doc, []);
      groups.get(doc)!.push(row);
    });

    return Array.from(groups.entries()).map(([docName, children]) => {
      const totalSum = children.reduce((acc, c) => acc + (parseFloat(String(c.total).replace(/\s/g, '').replace(/,/g, '.')) || 0), 0);
      const totalQty = children.reduce((acc, c) => acc + (parseFloat(String(c.quantity).replace(/\s/g, '').replace(/,/g, '.')) || 0), 0);
      
      return {
        id: `group-${docName}`,
        article: '',
        supplier: '',
        name: `Документ: ${docName}`,
        quantity: String(totalQty),
        unit: '',
        price: '',
        vat: '',
        vatAmount: '',
        total: totalSum.toFixed(2),
        children: children.map(c => ({ ...c, readOnly: true })), 
        readOnly: true, 
      } as any;
    });
  };

  const displayRows = viewMode === 'grouped' ? groupRowsByDocument(invoiceRows) : invoiceRows;

  const totalSum = invoiceRows.reduce((s, r) => s + (parseFloat(String(r.total).replace(/\s/g, '').replace(/,/g, '.')) || 0), 0);
  const totalVat = invoiceRows.reduce((s, r) => s + (parseFloat(String(r.vatAmount).replace(/\s/g, '').replace(/,/g, '.')) || 0), 0);
  const totalQty = invoiceRows.reduce((s, r) => s + (parseFloat(String(r.quantity).replace(/\s/g, '').replace(/,/g, '.')) || 0), 0);
  
  const hasRows = invoiceRows.length > 0;
  const hasUncertain = columns.some(c => c.isUncertain);

  const fileEntries = Object.entries(uploadStatuses);

  useEffect(() => {
    handleFileRef.current = handleFile;
  }, [handleFile]);

  return (
    <div className="px-4 md:px-8 pt-4 w-full h-[calc(100vh-110px)] flex flex-col overflow-hidden relative pb-24">
      
      {/* Toolbar Portal Render */}
      {toolbarPortalNode && createPortal(
        <div className="flex items-center gap-3 flex-wrap pb-2 md:pb-0">
          <input
            id="invoice-file-input-toolbar"
            type="file"
            accept=".xlsx,.xls,.csv,.pdf,.png,.jpg,.jpeg"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleFile(f, false);
              e.target.value = '';
            }}
          />


          {hasRows && (
            <>
              {/* Grouping Toggle */}
              <button 
                onClick={() => setViewMode(viewMode === 'list' ? 'grouped' : 'list')}
                className={`flex items-center justify-center gap-1.5 px-3 h-9 text-sm border rounded-lg transition-all shadow-sm font-medium ${
                  viewMode === 'grouped' 
                    ? 'bg-transparent border-gray-200 text-gray-500 hover:bg-gray-50' 
                    : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50 hover:border-gray-300'
                }`}
                title={viewMode === 'grouped' ? "Показать список" : "Сгруппировать по поставщику"}
              >
                {viewMode === 'grouped' ? <Rows size={16} /> : <Layers size={16} />}
                <span>{viewMode === 'grouped' ? "Общий список" : "Группировка"}</span>
              </button>
              
              {/* Action Slider Group */}
              <div className="flex w-[200px] h-9 overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
                <button
                  onClick={() => document.getElementById('invoice-file-input-toolbar')?.click()}
                  className="group relative flex-1 hover:flex-[2.3] flex items-center transition-all duration-300 ease-in-out cursor-pointer hover:bg-blue-50 border-r border-gray-100 text-gray-600 hover:text-blue-600"
                  title="Загрузить файл"
                >
                  <div className="absolute left-1/2 -translate-x-1/2 group-hover:left-[18px] group-hover:translate-x-0 transition-all duration-300 flex items-center justify-center shrink-0">
                    <Upload size={16} />
                  </div>
                  <span className="pl-11 whitespace-nowrap overflow-hidden text-xs font-bold transition-all duration-0 opacity-0 group-hover:opacity-100 group-hover:duration-200 group-hover:delay-100 max-w-0 group-hover:max-w-[120px]">
                    Импорт
                  </span>
                </button>

                <button 
                  onClick={handleExport}
                  className="group relative flex-1 hover:flex-[2.3] flex items-center transition-all duration-300 ease-in-out cursor-pointer hover:bg-gray-50 border-r border-gray-100 text-gray-600 hover:text-gray-900"
                  title="Экспорт в Excel"
                >
                  <div className="absolute left-1/2 -translate-x-1/2 group-hover:left-[18px] group-hover:translate-x-0 transition-all duration-300 flex items-center justify-center shrink-0">
                    <Download size={16} />
                  </div>
                  <span className="pl-11 whitespace-nowrap overflow-hidden text-xs font-bold transition-all duration-0 opacity-0 group-hover:opacity-100 group-hover:duration-200 group-hover:delay-100 max-w-0 group-hover:max-w-[120px]">
                    Экспорт
                  </span>
                </button>

                <button 
                  onClick={handleReset}
                  className="group relative flex-1 hover:flex-[2.3] flex items-center transition-all duration-300 ease-in-out cursor-pointer hover:bg-red-50 text-gray-400 hover:text-red-600"
                  title="Очистить таблицу"
                >
                  <div className="absolute left-1/2 -translate-x-1/2 group-hover:left-[18px] group-hover:translate-x-0 transition-all duration-300 flex items-center justify-center shrink-0">
                    <RotateCcw size={16} />
                  </div>
                  <span className="pl-11 whitespace-nowrap overflow-hidden text-xs font-bold transition-all duration-0 opacity-0 group-hover:opacity-100 group-hover:duration-200 group-hover:delay-100 max-w-0 group-hover:max-w-[120px]">
                    Сброс
                  </span>
                </button>
              </div>

              {/* Gatekeeper Button */}
              <button 
                onClick={hasUncertain ? handleConfirmAllHeader : handleGoToEstimate}
                className={`flex items-center justify-center gap-2 w-[100px] h-9 text-sm font-bold rounded-lg transition-all duration-300 shadow-sm shrink-0 ${
                  hasUncertain 
                    ? 'bg-yellow-400 hover:bg-yellow-500 text-yellow-900' 
                    : 'bg-blue-600 hover:bg-blue-700 text-white'
                }`}
              >
                <span>{hasUncertain ? "Все верно" : "Дальше"}</span>
              </button>
            </>
          )}
        </div>,
        toolbarPortalNode
      )}

      {error && (
        <div className="mb-6 p-4 border border-red-200 text-sm font-medium bg-red-50 text-red-600 rounded-xl">
          ⚠️ Ошибка: {error}
        </div>
      )}

      {/* Main Table Area */}
      <div className="flex-1 min-h-0 bg-white rounded-2xl border border-gray-100 shadow-[0_4px_20px_rgba(0,0,0,0.02)] overflow-hidden flex flex-col relative mb-16">
        {/* Global Drag and Drop Overlay */}
        {isDropZoneVisible && (hasRows || fileEntries.length > 0) && (
          <div 
            className="absolute inset-0 z-[100] bg-blue-50/80 backdrop-blur-[4px] border-[3px] border-blue-400 border-dashed m-6 rounded-3xl flex flex-col items-center justify-center animate-in fade-in duration-200"
            onDrop={async (e) => {
              e.preventDefault();
              dragCounter.current = 0;
              setIsDropZoneVisible(false);
              const droppedFiles = Array.from(e.dataTransfer.files);
              const validFiles = droppedFiles.filter(f => {
                const ext = '.' + f.name.split('.').pop()?.toLowerCase();
                return INVOICE_ALIASES.pdf.includes(ext as any) || INVOICE_ALIASES.excel.includes(ext as any);
              });
              for (const file of validFiles) {
                await handleFile(file, false);
              }
            }}
            onDragOver={(e) => e.preventDefault()}
          >
            <Upload size={54} className="text-blue-500 mb-4 animate-bounce" />
            <h2 className="text-2xl font-bold text-blue-700">Добавить документы</h2>
            <p className="text-blue-600/70 mt-3 font-medium text-sm text-center max-w-sm">
              Отпустите файлы здесь, и мы моментально добавим их к текущей спецификации
            </p>
          </div>
        )}

        {!hasRows ? (
          <div className="flex-1 flex flex-col items-center justify-center p-8 bg-gray-50/20 shadow-inner gap-6">
             <FileUploadZone onFile={handleFile} loading={loading} />
             <p className="text-center text-xs text-gray-400 max-w-md leading-relaxed animate-in fade-in slide-in-from-bottom-2 duration-700 delay-300">
               Рекомендуется использовать оригинальные PDF-счета для максимальной точности. 
               При использовании сканов используйте разрешение не менее 300 DPI. 
               Сомнительные данные будут выделены желтым цветом.
             </p>
          </div>
        ) : (
          <div className="flex-1 flex flex-col min-h-0 animate-in fade-in duration-700">
            <EditableTable
              columns={columns}
              rows={displayRows as unknown as Record<string, any>[]}
              onRowChange={handleRowChange}
              onAddRow={handleAddRow}
              onDeleteRow={handleDeleteRow}
              availableFields={INVOICE_TARGET_FIELDS}
              onColumnChange={handleColumnChange}
              onColumnConfirm={handleColumnConfirm}
              onColumnOrderChange={handleColumnOrderChange}
              emptyMessage="Добавьте строки вручную или загрузите файл счёта."
            />
          </div>
        )}
      </div>

      {/* File Drawer Overlay (Positioned BEHIND footer using z-index) */}
      {(hasRows || fileEntries.length > 0) && isDrawerOpen && (
          <div className="fixed bottom-16 left-4 w-[35%] bg-white border-t border-l border-r border-gray-200 rounded-t-2xl shadow-[0_-10px_40px_rgba(0,0,0,0.08)] z-[50] animate-in slide-in-from-bottom-12 duration-300 max-h-[400px] flex flex-col overflow-hidden">
            <div className="p-4 border-b border-gray-100 flex items-center justify-between bg-gray-50/50">
                <h3 className="font-bold text-gray-700 flex items-center gap-2">
                  <FileText size={18} className="text-blue-500" />
                  Загруженные документы
                </h3>
                <button 
                  onClick={() => setIsDrawerOpen(false)}
                  className="p-1 hover:bg-gray-200 rounded-lg text-gray-500 transition-colors"
                >
                  <X size={20} />
                </button>
            </div>
            <div className="flex-1 overflow-y-auto p-2 space-y-1 text-xs">
                {fileEntries.length === 0 ? (
                  <div className="py-12 text-center text-gray-400 italic">
                    Список файлов пуст
                  </div>
                ) : (
                  fileEntries.map(([filename, data]) => (
                    <div key={filename} className="flex flex-col p-3 hover:bg-gray-50 rounded-xl transition-colors group">
                       <div className="flex items-center gap-3 mb-1">
                          {data.status.includes('Ошибка') ? <AlertCircle size={18} className="text-red-500 shrink-0" /> 
                           : data.status.includes('Готово') ? <CheckCircle2 size={18} className="text-green-500 shrink-0" />
                           : <Clock size={18} className="text-blue-500 animate-pulse shrink-0" />}
                          
                          <span className="font-bold text-[14px] text-gray-800 truncate flex-1">{filename}</span>
                          
                          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity ml-auto">
                            <button 
                              onClick={() => filesMap[filename] && handleFile(filesMap[filename], false)}
                              className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-all"
                              title="Обновить"
                            >
                              <RefreshCw size={18} />
                            </button>
                            <button 
                              onClick={() => filesMap[filename] && handleFile(filesMap[filename], true)}
                              disabled={data.status.includes('ИИ')}
                              className={`p-1.5 rounded transition-all ${data.status.includes('ИИ') ? 'text-purple-500 bg-purple-50' : 'text-gray-400 hover:text-purple-600 hover:bg-purple-50'}`}
                              title="ИИ Анализ"
                            >
                              <Brain size={18} />
                            </button>
                            <button 
                              onClick={() => handleDeleteFile(filename)}
                              className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition-all"
                              title="Удалить"
                            >
                              <Trash2 size={18} />
                            </button>
                          </div>
                       </div>
                       <div className="flex items-center gap-2 ml-[30px]">
                          <span className="text-[10px] text-gray-400 font-medium tabular-nums">{data.time}</span>
                          <span className="w-1 h-1 bg-gray-300 rounded-full" />
                          <span className="text-[10px] text-gray-400 font-medium uppercase tracking-wider">{data.status}</span>
                       </div>
                    </div>
                  ))
                )}
            </div>
          </div>
      )}

      {/* Global Bottom Navigation Bar */}
      {(hasRows || fileEntries.length > 0) && (
        <div className="fixed bottom-0 left-0 right-0 h-16 bg-white border-t border-gray-200 z-[60] shadow-[0_-8px_30px_rgba(0,0,0,0.05)] flex items-center px-6">
            <button 
               onClick={() => setIsDrawerOpen(!isDrawerOpen)}
               className={`flex items-center gap-2 px-3 py-1.5 rounded-lg transition-all border text-xs ${
                 isDrawerOpen 
                  ? 'bg-blue-50 border-blue-200 text-blue-700' 
                  : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
               }`}
            >
               <Layers size={14} className={isDrawerOpen ? 'animate-bounce' : ''} />
               <span className="font-bold">Файлы: {fileEntries.length}</span>
               <ChevronUp size={14} className={`transition-transform duration-300 ${isDrawerOpen ? 'rotate-180' : ''}`} />
            </button>
        </div>
      )}

    </div>
  );
}

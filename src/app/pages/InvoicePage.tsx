import React, { useState, useCallback, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router';
import { arrayMove } from '@dnd-kit/sortable';
import { Upload, Download, ArrowRight, RotateCcw, Calculator, Layers, Rows } from 'lucide-react';
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

  const [columns, setColumns] = useState<ColumnDef[]>(INVOICE_COLUMNS);
  
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [toolbarPortalNode, setToolbarPortalNode] = useState<HTMLElement | null>(null);

  useEffect(() => {
    setToolbarPortalNode(document.getElementById('toolbar-portal'));
  }, []);

  const handleFile = async (file: File) => {
    setLoading(true);
    setError(null);
    try {
      const { headers, rows: parsedRawRows } = await parseFile(file);
      const detected = autoDetectMapping(headers, INVOICE_ALIASES);
      
      const mapping = Object.fromEntries(
        Object.entries(detected).map(([key, value]) => [key, value.index])
      );

      const newRowsToAppend: InvoiceRow[] = parsedRawRows.map((row) => {
        const r: InvoiceRow = {
          id: genId(),
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

        // Auto-calculate vatAmount and total if not mapped
        const qtyStr = String(r.quantity).replace(/\s/g, '').replace(/,/g, '.');
        const priceStr = String(r.price).replace(/\s/g, '').replace(/,/g, '.');
        const vatRateStr = String(r.vat).replace(/\s/g, '').replace(/,/g, '.');

        const qty = parseFloat(qtyStr) || 0;
        const price = parseFloat(priceStr) || 0;
        const vatRate = parseFloat(vatRateStr) || 0;
        const subtotal = qty * price;

        if (!r.vatAmount && subtotal > 0 && vatRate > 0) {
          r.vatAmount = (subtotal * vatRate / 100).toFixed(2);
        }
        if (!r.total && subtotal > 0) {
          const vatAmt = parseFloat(r.vatAmount) || 0;
          r.total = (subtotal + vatAmt).toFixed(2);
        }

        return r;
      });

      setInvoiceRows([...invoiceRows, ...newRowsToAppend]);

      // Update uncertainty status
      setColumns(prev => prev.map(col => {
        const wasDetected = detected[col.key];
        return { ...col, isUncertain: wasDetected ? wasDetected.isUncertain : false };
      }));

    } catch (e: any) {
      setError(e.message || 'Ошибка чтения файла');
    } finally {
      setLoading(false);
    }
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

  const groupRowsBySupplier = (rows: InvoiceRow[]) => {
    const groups = new Map<string, InvoiceRow[]>();
    rows.forEach(row => {
      const s = (row.supplier || 'Не указан').trim();
      if (!groups.has(s)) groups.set(s, []);
      groups.get(s)!.push(row);
    });

    return Array.from(groups.entries()).map(([supplier, children]) => {
      const totalSum = children.reduce((acc, c) => acc + (parseFloat(String(c.total).replace(/\s/g, '').replace(/,/g, '.')) || 0), 0);
      const totalQty = children.reduce((acc, c) => acc + (parseFloat(String(c.quantity).replace(/\s/g, '').replace(/,/g, '.')) || 0), 0);
      
      return {
        id: `group-${supplier}`,
        article: '',
        supplier: supplier,
        name: `Итого по поставщику`,
        quantity: String(totalQty),
        unit: '',
        price: '',
        vat: '',
        vatAmount: '',
        total: totalSum.toFixed(2),
        children: children.map(c => ({ ...c, readOnly: true })), // Children are read-only
        readOnly: true, // Parent is read-only
      } as any;
    });
  };

  const displayRows = viewMode === 'grouped' ? groupRowsBySupplier(invoiceRows) : invoiceRows;

  const totalSum = invoiceRows.reduce((s, r) => s + (parseFloat(String(r.total).replace(/\s/g, '').replace(/,/g, '.')) || 0), 0);
  const hasRows = invoiceRows.length > 0;
  const hasUncertain = columns.some(c => c.isUncertain);

  return (
    <div className="px-4 md:px-8 pb-4 pt-4 w-full h-[calc(100vh-110px)] flex flex-col overflow-hidden relative">
      
      {/* Toolbar Portal Render */}
      {toolbarPortalNode && createPortal(
        <div className="flex items-center gap-3 flex-wrap pb-2 md:pb-0">
          <input
            id="invoice-file-input-toolbar"
            type="file"
            accept=".xlsx,.xls,.csv,.pdf"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleFile(f);
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
                  title="Загрузить новый файл"
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
      <div className="flex-1 min-h-0 bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden flex flex-col relative">
        {!hasRows ? (
          <div className="flex-1 flex flex-col items-center justify-center p-8 bg-gray-50/20 shadow-inner">
             <FileUploadZone onFile={handleFile} loading={loading} />
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

      {/* Totals Section */}
      {hasRows && (
        <div className="mt-4 flex justify-end gap-12 text-sm font-semibold text-gray-500 bg-white p-4 rounded-xl border border-gray-100 shadow-sm">
           <div className="flex items-center gap-3">
             <span>Позиций:</span>
             <span className="text-gray-900">{invoiceRows.length}</span>
           </div>
           <div className="flex items-center gap-3">
             <span>Итого к оплате:</span>
             <span className="text-blue-600 text-lg">
               {totalSum.toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ₽
             </span>
           </div>
        </div>
      )}

    </div>
  );
}

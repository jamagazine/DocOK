import React, { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router';
import { Download, RotateCcw, Merge, ArrowLeft, Send, Upload } from 'lucide-react';
import { EditableTable, ColumnDef } from '../components/EditableTable';
import { useData, genId, SpecRow } from '../context/DataContext';
import { exportToExcel, mergeDuplicateMaterials } from '../utils/fileUtils';

interface PurchaseRow extends SpecRow {
  deliveryTime: string;
  price: string;
  amount: string;
}

const PURCHASE_COLUMNS: ColumnDef[] = [
  { key: 'name', label: 'Наименование', width: 220 },
  { key: 'brand', label: 'Марка', width: 130 },
  { key: 'code', label: 'Код', width: 110 },
  { key: 'supplier', label: 'Поставщик', width: 140 },
  { key: 'unit', label: 'Ед.', width: 80, align: 'center' },
  { key: 'quantity', label: 'Кол-во', width: 100, type: 'number', align: 'right' },
  { key: 'deliveryTime', label: 'Срок поставки', width: 130 },
  { key: 'price', label: 'Цена', width: 100, type: 'number', align: 'right' },
  { key: 'amount', label: 'Сумма', width: 100, type: 'number', align: 'right' },
  { key: 'note', label: 'Прим.', width: 180 },
];

function emptyRow(): PurchaseRow {
  return {
    id: genId(),
    name: '',
    brand: '',
    code: '',
    supplier: '',
    unit: '',
    quantity: '',
    mass: '',
    note: '',
    deliveryTime: '',
    price: '',
    amount: '',
    children: [],
    originalRowsIds: [],
  };
}

function specToPurchase(specRows: SpecRow[]): PurchaseRow[] {
  return specRows.map((r) => ({
    ...r,
    deliveryTime: (r as any).deliveryTime || '',
    price: (r as any).price || '',
    amount: (r as any).amount || '',
  }));
}

export function PurchasePage() {
  const { specRows, setSpecRows } = useData();
  const navigate = useNavigate();

  const [rows, setRows] = useState<PurchaseRow[]>(() => specToPurchase(specRows));
  const [toolbarPortalNode, setToolbarPortalNode] = useState<HTMLElement | null>(null);
  const [isMerged, setIsMerged] = useState(false);
  const [backupRows, setBackupRows] = useState<PurchaseRow[]>([]);

  useEffect(() => {
    setToolbarPortalNode(document.getElementById('toolbar-portal'));
  }, []);

  // Sync rows from context when it changes (e.g. if updated in spec)
  useEffect(() => {
    setRows(specToPurchase(specRows));
  }, [specRows]);

  const handleRowChange = useCallback(
    (rowIndex: number, key: string, value: string) => {
      const updated = [...rows];
      updated[rowIndex] = { ...updated[rowIndex], [key]: value };

      // Auto-calculate amount = quantity * price
      if (key === 'price' || key === 'quantity') {
        const qStr = String(key === 'quantity' ? value : updated[rowIndex].quantity).replace(/\s/g, '').replace(/,/g, '.');
        const pStr = String(key === 'price' ? value : updated[rowIndex].price).replace(/\s/g, '').replace(/,/g, '.');
        const q = parseFloat(qStr) || 0;
        const p = parseFloat(pStr) || 0;
        if (q > 0 && p > 0) {
          updated[rowIndex].amount = (q * p).toFixed(2);
        }
      }

      setRows(updated);
      
      // Update the context so the data persists across tabs
      // We strip purchase-only fields when saving to specRows if they don't exist there,
      // but actually it's fine to keep them in context.
      setSpecRows(updated as SpecRow[]);
    },
    [rows, setSpecRows]
  );

  const handleAddRow = useCallback(() => {
    const newRow = emptyRow();
    const updated = [...rows, newRow];
    setRows(updated);
    setSpecRows(updated as SpecRow[]);
  }, [rows, setSpecRows]);

  const handleDeleteRow = useCallback((index: number) => {
    const updated = rows.filter((_, i) => i !== index);
    setRows(updated);
    setSpecRows(updated as SpecRow[]);
  }, [rows, setSpecRows]);

  const handleMergeManual = () => {
    if (isMerged) {
      if (backupRows.length > 0) {
        setRows(backupRows);
        setSpecRows(backupRows as SpecRow[]);
        setIsMerged(false);
      }
    } else {
      setBackupRows(rows);
      const merged = mergeDuplicateMaterials(rows).map(item => ({
        ...item,
        id: (item as any).id || genId()
      })) as unknown as PurchaseRow[];
      setRows(merged);
      setSpecRows(merged as SpecRow[]);
      setIsMerged(true);
    }
  };

  const handleExport = () => {
    const data = rows.map((r, i) => {
        const rowData: any = { '№': i + 1 };
        PURCHASE_COLUMNS.forEach(col => {
            rowData[col.label] = (r as any)[col.key];
        });
        return rowData;
    });
    exportToExcel(data, 'Запрос_поставщику');
  };

  const handleReset = () => {
    if (window.confirm('Очистить все данные запроса?')) {
      setRows([]);
      setSpecRows([]);
    }
  };

  const handleUnmerge = useCallback((parentId: string, childId: string) => {
    const newRows = [...rows];
    const parentIndex = newRows.findIndex(r => r.id === parentId);
    if (parentIndex === -1) return;
    
    const parentRow = { ...newRows[parentIndex] };
    if (!parentRow.children || parentRow.children.length === 0) return;
    
    const childIndex = parentRow.children.findIndex((c: SpecRow) => c.id === childId);
    if (childIndex === -1) return;
    
    const extractedChild = parentRow.children[childIndex];
    
    parentRow.children = parentRow.children.filter((c: SpecRow) => c.id !== childId);
    parentRow.originalRowsIds = parentRow.originalRowsIds?.filter(id => id !== childId);
    
    const parseQty = (val: unknown) => parseFloat(String(val).replace(/\s/g, '').replace(/,/g, '.')) || 0;
    const pQty = parseQty(parentRow.quantity);
    const cQty = parseQty(extractedChild.quantity);
    const newQty = Math.max(0, pQty - cQty);
    parentRow.quantity = newQty === 0 ? '' : String(newQty);
    
    newRows[parentIndex] = parentRow;
    
    const unmergedPurchaseRow = {
       ...extractedChild,
       deliveryTime: '',
       price: '',
       amount: '',
       originalRowsIds: [extractedChild.id],
       children: [{ ...extractedChild } as SpecRow]
    } as unknown as PurchaseRow;
    
    newRows.splice(parentIndex + 1, 0, unmergedPurchaseRow);
    setRows(newRows);
    setSpecRows(newRows as SpecRow[]);
  }, [rows, setSpecRows]);

  const hasRows = rows.length > 0;

  return (
    <div className="px-4 md:px-8 pb-4 pt-4 w-full h-[calc(100vh-110px)] flex flex-col overflow-hidden relative">
      {/* Toolbar Portal Render */}
      {toolbarPortalNode && createPortal(
        <div className="flex items-center gap-3 flex-wrap pb-2 md:pb-0">
          {hasRows && (
            <>
              <button 
                onClick={handleMergeManual}
                className={`flex items-center justify-center gap-1.5 px-3 h-9 text-sm border rounded-lg transition-all shadow-sm font-medium ${
                  isMerged 
                    ? 'bg-transparent border-gray-200 text-gray-500 hover:bg-gray-50' 
                    : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50 hover:border-gray-300'
                }`}
                title={isMerged ? "Вернуть как было" : "Схлопнуть по наименованию"}
              >
                {isMerged ? <RotateCcw size={16} /> : <Merge size={16} />}
                <span>{isMerged ? "Разъединить" : "Объединить"}</span>
              </button>
              
              {/* Action Slider Group */}
              <div className="flex w-[200px] h-9 overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
                <button
                  disabled
                  className="group relative flex-1 hover:flex-[2.3] flex items-center transition-all duration-300 ease-in-out cursor-not-allowed opacity-50 border-r border-gray-100 text-gray-400"
                  title="Импорт доступен в Спецификации"
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

              {/* Action Button */}
              <button 
                onClick={handleExport}
                className="flex items-center justify-center gap-2 w-[100px] h-9 text-sm font-bold rounded-lg transition-all duration-300 shadow-sm shrink-0 bg-gray-900 hover:bg-gray-800 text-white"
              >
                <Send size={16} />
                <span>Запрос</span>
              </button>
            </>
          )}
        </div>,
        toolbarPortalNode
      )}

      {/* Main Table Area */}
      <div className="flex-1 min-h-0 bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden flex flex-col relative">
        {!hasRows ? (
          <div className="flex-1 flex flex-col items-center justify-center p-8 bg-gray-50/20 shadow-inner">
            <div className="w-16 h-16 bg-gray-100 rounded-2xl flex items-center justify-center text-gray-400 mb-4">
              <ArrowLeft size={32} />
            </div>
            <p className="text-gray-500 font-medium text-center max-w-sm">
              Нет данных для запроса. Загрузите спецификацию или добавьте позиции вручную.
            </p>
            <button
                onClick={() => navigate('/')}
                className="mt-6 flex items-center gap-2 px-6 py-2.5 bg-white border border-gray-200 rounded-xl text-sm font-bold text-gray-700 hover:bg-gray-50 transition-all shadow-sm"
            >
                <ArrowLeft size={16} />
                Вернуться к спецификации
            </button>
          </div>
        ) : (
          <div className="flex-1 flex flex-col min-h-0 animate-in fade-in duration-700">
            <EditableTable
              columns={PURCHASE_COLUMNS}
              rows={rows as unknown as Record<string, any>[]}
              onRowChange={handleRowChange}
              onAddRow={handleAddRow}
              onDeleteRow={handleDeleteRow}
              onUnmerge={handleUnmerge}
              emptyMessage="Добавьте строки вручную или загрузите спецификацию."
            />
          </div>
        )}
      </div>
    </div>
  );
}

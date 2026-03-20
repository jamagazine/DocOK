import React, { useState, useCallback, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router';
import { arrayMove } from '@dnd-kit/sortable';
import {
  Upload,
  Merge,
  ArrowRight,
  Download,
  Plus,
  Trash2,
  RotateCcw,
  CheckCircle2,
} from 'lucide-react';
import { useData, genId, SpecRow } from '../context/DataContext';
import {
  parseFile,
  exportToExcel,
  exportToXLSX,
  exportGeometryToXLSX,
  autoDetectMapping,
  SPEC_ALIASES,
  mergeDuplicateMaterials,
  DetectedMapping,
} from '../utils/fileUtils';
import { parsePdfGeometry, PdfGeometry } from '../utils/pdfUtils';
import { FileUploadZone } from '../components/FileUploadZone';
import { EditableTable, ColumnDef } from '../components/EditableTable';

const SPEC_COLUMNS: ColumnDef[] = [
  { key: 'name', label: 'Наименование', width: 220 },
  { key: 'brand', label: 'Марка', width: 130 },
  { key: 'code', label: 'Код', width: 110 },
  { key: 'supplier', label: 'Поставщик', width: 140 },
  { key: 'unit', label: 'Ед.', width: 80, align: 'center' },
  { key: 'quantity', label: 'Кол-во', width: 100, type: 'number', align: 'right' },
  { key: 'mass', label: 'Масса', width: 100, type: 'number', align: 'right' },
  { key: 'note', label: 'Прим.', width: 180 },
];

const SPEC_TARGET_FIELDS = [
  { key: 'name', label: 'Наименование', required: true },
  { key: 'brand', label: 'Марка' },
  { key: 'code', label: 'Код' },
  { key: 'supplier', label: 'Поставщик' },
  { key: 'unit', label: 'Единицы измерения' },
  { key: 'quantity', label: 'Количество' },
  { key: 'mass', label: 'Масса' },
  { key: 'note', label: 'Примечания' },
];

function emptyRow(): SpecRow {
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
  };
}

export function SpecificationPage() {
  const { specRows, setSpecRows } = useData();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [columns, setColumns] = useState<ColumnDef[]>(SPEC_COLUMNS);
  const [toolbarPortalNode, setToolbarPortalNode] = useState<HTMLElement | null>(null);
  const [isDraggingGlobal, setIsDraggingGlobal] = useState(false);
  const [isMerged, setIsMerged] = useState(false);
  const [backupRows, setBackupRows] = useState<SpecRow[]>([]);
  const dragCounter = React.useRef(0);

  // ── File parsing state ───────────────────────────────────────────────────
  const [parsedRawGrid, setParsedRawGrid] = useState<string[][]>([]);
  const [parsedRawGridX, setParsedRawGridX] = useState<number[] | undefined>(undefined);
  const [pdfGeometry, setPdfGeometry] = useState<PdfGeometry | null>(null);
  
  useEffect(() => {
    setToolbarPortalNode(document.getElementById('toolbar-portal'));
  }, []);

  const handleFile = async (file: File) => {
    setLoading(true);
    setError(null);
    try {
      const { headers, rows: parsedRawRows, gridX } = await parseFile(file);
      
      // Дополнительно парсим геометрию для "Цифрового двойника"
      if (file.name.toLowerCase().endsWith('.pdf')) {
        const geometry = await parsePdfGeometry(file);
        setPdfGeometry(geometry);
      }

      setParsedRawGrid([headers, ...parsedRawRows]);
      setParsedRawGridX(gridX);
      const detected = autoDetectMapping(headers, SPEC_ALIASES);
      
      const mapping = Object.fromEntries(
        Object.entries(detected).map(([key, value]) => [key, value.index])
      );

      const newRows: SpecRow[] = parsedRawRows.map((row) => ({
        id: genId(),
        name: mapping.name !== undefined ? (row[mapping.name] || '') : '',
        brand: mapping.brand !== undefined ? (row[mapping.brand] || '') : '',
        code: mapping.code !== undefined ? (row[mapping.code] || '') : '',
        supplier: mapping.supplier !== undefined ? (row[mapping.supplier] || '') : '',
        unit: mapping.unit !== undefined ? (row[mapping.unit] || '') : '',
        quantity: mapping.quantity !== undefined ? (row[mapping.quantity] || '') : '',
        mass: mapping.mass !== undefined ? (row[mapping.mass] || '') : '',
        note: mapping.note !== undefined ? (row[mapping.note] || '') : '',
        originalRowsIds: [],
        children: [],
      }));

      setSpecRows(newRows);

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

  const handleConfirmAllHeader = useCallback(() => {
    setColumns(prev => prev.map(c => ({ ...c, isUncertain: false })));
  }, []);

  const handleColumnChange = useCallback((oldKey: string, newKey: string) => {
    if (oldKey === newKey) return;
    
    setColumns(prevCols => {
       const newCols = [...prevCols];
       const existingIndex = newCols.findIndex(c => c.key === newKey);
       const oldIndex = newCols.findIndex(c => c.key === oldKey);
       
       if (existingIndex !== -1 && oldIndex !== -1) {
           const targetField1 = SPEC_TARGET_FIELDS.find(f => f.key === newKey);
           const targetField2 = SPEC_TARGET_FIELDS.find(f => f.key === oldKey);
           newCols[oldIndex] = { ...newCols[oldIndex], key: newKey, label: targetField1?.label || newKey, isUncertain: false };
           newCols[existingIndex] = { ...newCols[existingIndex], key: oldKey, label: targetField2?.label || oldKey, isUncertain: false };
       } else if (oldIndex !== -1) {
           const targetField = SPEC_TARGET_FIELDS.find(f => f.key === newKey);
           newCols[oldIndex] = { ...newCols[oldIndex], key: newKey, label: targetField?.label || newKey, isUncertain: false };
       }
       return newCols;
    });

    const newRows = specRows.map(r => {
       const newRow = { ...r } as any;
       const temp = newRow[oldKey];
       newRow[oldKey] = newRow[newKey];
       newRow[newKey] = temp;
       return newRow as SpecRow;
    });
    setSpecRows(newRows);
  }, [specRows, setSpecRows]);

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
    (index: number, key: keyof SpecRow, value: string) => {
      const updated = [...specRows];
      updated[index] = { ...updated[index], [key]: value };
      setSpecRows(updated);
    },
    [specRows, setSpecRows]
  );

  const handleUnmerge = useCallback((parentId: string, childId: string) => {
       const newRows = [...specRows];
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
       
       const unmergedSpecRow: SpecRow = {
          ...extractedChild,
          originalRowsIds: [extractedChild.id],
          children: [{ ...extractedChild } as SpecRow]
       };
       
       newRows.splice(parentIndex + 1, 0, unmergedSpecRow);
       setSpecRows(newRows);
  }, [specRows, setSpecRows]);

  const handleAddRow = useCallback(() => {
    setSpecRows([...specRows, emptyRow()]);
  }, [specRows, setSpecRows]);

  const handleDeleteRow = useCallback(
    (index: number) => {
      setSpecRows(specRows.filter((_: unknown, i: number) => i !== index));
    },
    [specRows, setSpecRows]
  );

  const handleMergeManual = () => {
    if (isMerged) {
      if (backupRows.length > 0) {
        setSpecRows(backupRows);
        setIsMerged(false);
      }
    } else {
      setBackupRows(specRows);
      const merged = mergeDuplicateMaterials(specRows).map(item => ({
        ...item,
        id: (item as any).id || genId()
      })) as unknown as SpecRow[];
      setSpecRows(merged);
      setIsMerged(true);
    }
  };

  const handleExport = () => {
    const data = specRows.map((r: SpecRow, i: number) => {
      const rowData: any = { '№': i + 1 };
      columns.forEach(col => {
         rowData[col.label] = (r as any)[col.key];
      });
      return rowData;
    });
    exportToExcel(data, 'Спецификация');
  };

  const handleReset = () => {
    if (window.confirm('Очистить все данные спецификации?')) {
      setSpecRows([]);
    }
  };

  const handleGoToPurchase = () => {
    navigate('/purchase');
  };

  const handleGlobalDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current++;
    if (e.dataTransfer.items && e.dataTransfer.items.length > 0) {
      setIsDraggingGlobal(true);
    }
  };

  const handleGlobalDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current--;
    if (dragCounter.current === 0) {
      setIsDraggingGlobal(false);
    }
  };

  const handleGlobalDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleGlobalDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingGlobal(false);
    dragCounter.current = 0;
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  };

  const hasRows = specRows.length > 0;
  const hasUncertain = columns.some(c => c.isUncertain);

  return (
    <div 
      className="px-4 md:px-8 pb-4 pt-4 w-full h-[calc(100vh-110px)] flex flex-col overflow-hidden relative"
      onDragEnter={handleGlobalDragEnter}
      onDragOver={handleGlobalDragOver}
      onDragLeave={handleGlobalDragLeave}
      onDrop={handleGlobalDrop}
    >
      {/* Global Drag Overlay - Reusing FileUploadZone with global state */}
      {isDraggingGlobal && hasRows && (
        <div className="absolute inset-6 z-50 flex animate-in fade-in zoom-in duration-300 pointer-events-none">
          <FileUploadZone 
            onFile={handleFile} 
            isGlobalDragging={true}
            accept=".xlsx,.xls,.csv,.pdf"
          />
        </div>
      )}

      {/* Toolbar Portal Render */}
      {toolbarPortalNode && createPortal(
        <div className="flex items-center gap-3 flex-wrap pb-2 md:pb-0">
          <input
            id="spec-file-input-toolbar"
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
                  onClick={() => document.getElementById('spec-file-input-toolbar')?.click()}
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

               {/* Export RAW CSV Button (Temp) */}
              {parsedRawGrid.length > 0 && (
                <button
                   onClick={() => {
                     if (pdfGeometry) {
                       exportGeometryToXLSX(pdfGeometry, 'geometry_twin_empty.xlsx');
                     } else {
                       exportToXLSX(parsedRawGrid[0], parsedRawGrid.slice(1), parsedRawGridX, 'diagnostic_pdf.xlsx');
                     }
                   }}
                   className="flex items-center justify-center gap-1.5 h-9 px-3 text-sm border rounded-lg transition-all shadow-sm font-medium bg-white border-gray-200 text-gray-700 hover:bg-gray-50 hover:border-gray-300 mr-2 shrink-0"
                   title={pdfGeometry ? "Экспорт пустой геометрии (Цифровой двойник)" : "Скачать сырые данные в XLSX"}
                >
                   <Download size={14} />
                   <span>{pdfGeometry ? 'XLSX Geometry Twin' : 'XLSX Debug Export'}</span>
                </button>
              )}

              {/* Gatekeeper Transformer Button */}
              <button 
                onClick={hasUncertain ? handleConfirmAllHeader : handleGoToPurchase}
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
        <div className="mb-6 p-4 border border-red-200 text-sm font-medium bg-red-50 text-red-600 rounded-xl animate-shake">
          ⚠️ Ошибка: {error}
        </div>
      )}

      {/* Main Table Area */}
      <div className="flex-1 min-h-0 bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden flex flex-col relative transition-all duration-700">
        {!hasRows ? (
          <div className={`flex-1 flex items-center justify-center transition-all duration-500 ${isDraggingGlobal ? 'p-6' : 'p-8'} bg-gray-50/20 shadow-inner`}>
            <FileUploadZone 
              onFile={handleFile} 
              loading={loading}
              isGlobalDragging={isDraggingGlobal}
              accept=".xlsx,.xls,.csv,.pdf"
            />
          </div>
        ) : (
          <div className="flex-1 flex flex-col min-h-0 animate-in fade-in duration-1000 fill-mode-both">
            <EditableTable
              columns={columns}
              rows={specRows as unknown as Record<string, any>[]}
              onRowChange={(index, key, value) => handleRowChange(index, key as keyof SpecRow, value)}
              onAddRow={handleAddRow}
              onDeleteRow={handleDeleteRow}
              availableFields={SPEC_TARGET_FIELDS}
              onColumnChange={handleColumnChange}
              onColumnConfirm={handleColumnConfirm}
              onColumnOrderChange={handleColumnOrderChange}
              onUnmerge={handleUnmerge}
            />
          </div>
        )}
      </div>

      <style>{`
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          25% { transform: translateX(-4px); }
          75% { transform: translateX(4px); }
        }
        .animate-shake {
           animation: shake 0.4s ease-in-out;
        }
      `}</style>
    </div>
  );
}

import React, { useState, useRef, useEffect, useCallback, Fragment, useMemo } from 'react';
import { Trash2, Plus, GripVertical, ChevronRight, ChevronDown, Unlink, ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  horizontalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

export interface ColumnDef {
  key: string;
  label: string;
  width?: number;
  type?: 'text' | 'number' | 'select';
  options?: string[];
  readOnly?: boolean;
  align?: 'left' | 'right' | 'center';
  isUncertain?: boolean;
}

// ── Editable Cell ─────────────────────────────────────────────────────────────

interface EditableCellProps {
  value: string;
  column: ColumnDef;
  isEditing: boolean;
  onStartEdit: () => void;
  onCommit: (value: string) => void;
  onNext: () => void;
  onPrev: () => void;
  onNextRow: () => void;
}

function EditableCell({
  value,
  column,
  isEditing,
  onStartEdit,
  onCommit,
  onNext,
  onPrev,
  onNextRow,
}: EditableCellProps) {
  const [editValue, setEditValue] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);
  const selectRef = useRef<HTMLSelectElement>(null);

  useEffect(() => {
    if (!isEditing) {
      setEditValue(value);
    }
  }, [value, isEditing]);

  useEffect(() => {
    if (isEditing) {
      setEditValue(value);
      setTimeout(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
        selectRef.current?.focus();
      }, 0);
    }
  }, [isEditing]);

  const handleBlur = useCallback(() => {
    onCommit(editValue);
  }, [editValue, onCommit]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        onCommit(editValue);
        onNextRow();
      } else if (e.key === 'Escape') {
        onCommit(value);
      } else if (e.key === 'Tab') {
        e.preventDefault();
        onCommit(editValue);
        if (e.shiftKey) onPrev();
        else onNext();
      }
    },
    [editValue, value, onCommit, onNext, onPrev, onNextRow]
  );

  if (column.readOnly) {
    return (
      <div
        className="px-2.5 py-1.5 text-sm min-h-[34px] text-gray-400 select-none"
        style={{ textAlign: column.align || 'left' }}
      >
        {value || '\u00A0'}
      </div>
    );
  }

  if (isEditing) {
    if (column.type === 'select' && column.options) {
      return (
        <select
          ref={selectRef}
          value={editValue}
          onChange={(e) => {
            setEditValue(e.target.value);
            onCommit(e.target.value);
          }}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
          className="w-full min-h-[34px] border-0 outline-none bg-blue-50 px-2.5 py-1.5 text-sm"
          style={{ textAlign: column.align || 'left' }}
        >
          {column.options.map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </select>
      );
    }
    return (
      <input
        ref={inputRef}
        type={column.type === 'number' ? 'number' : 'text'}
        value={editValue}
        onChange={(e) => setEditValue(e.target.value)}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        className="w-full min-h-[34px] border-0 outline-none bg-blue-50 px-2.5 py-1.5 text-sm"
        style={{ textAlign: column.align || 'left' }}
      />
    );
  }

  return (
    <div
      onClick={onStartEdit}
      className="px-2.5 py-1.5 text-sm min-h-[34px] cursor-text hover:bg-gray-50 transition-colors whitespace-pre-wrap break-words"
      style={{ textAlign: column.align || 'left' }}
    >
      {value || '\u00A0'}
    </div>
  );
}

// ── Sortable Header ───────────────────────────────────────────────────────────

function SortableHeader({
  col,
  availableFields,
  onColumnChange,
  onColumnConfirm,
  sortConfig,
  onSort,
}: {
  col: ColumnDef;
  availableFields?: { key: string; label: string }[];
  onColumnChange?: (oldKey: string, newKey: string) => void;
  onColumnConfirm?: (key: string) => void;
  sortConfig: { key: string; direction: 'asc' | 'desc' | null };
  onSort: (key: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: col.key });

  const style = {
    transform: CSS.Translate.toString(transform),
    transition,
    zIndex: isDragging ? 20 : 1,
    opacity: isDragging ? 0.8 : 1,
  };

  const isSorted = sortConfig.key === col.key;

  return (
    <th
      ref={setNodeRef}
      style={{ ...style, minWidth: col.width || 120 }}
      className={`relative px-2.5 py-2.5 text-xs font-semibold text-gray-600 text-left border-r border-gray-200 last:border-r-0 whitespace-nowrap select-none tracking-wide bg-gray-50 transition-all ${
        col.isUncertain ? 'bg-yellow-50 border-2 border-yellow-300' : ''
      }`}
    >
      <div className="flex items-center gap-1 w-full bg-inherit">
        <div
          {...attributes}
          {...listeners}
          className="cursor-grab hover:bg-gray-200 p-0.5 rounded text-gray-400"
        >
          <GripVertical size={13} />
        </div>
        
        <div className="flex items-center gap-1 w-full relative group">
          {availableFields && onColumnChange ? (
             <div className="flex items-center flex-1 min-w-0 relative">
                <select
                  value={col.key}
                  onChange={(e) => onColumnChange(col.key, e.target.value)}
                  className="absolute inset-0 opacity-0 cursor-pointer z-10"
                >
                  {availableFields.map((f) => (
                    <option key={f.key} value={f.key}>
                      {f.label}
                    </option>
                  ))}
                </select>
                <span className="uppercase font-semibold text-gray-600 text-xs truncate hover:text-blue-600 cursor-pointer">
                  {availableFields.find(f => f.key === col.key)?.label || col.label}
                </span>
             </div>
          ) : (
            <span className="uppercase flex-1 truncate">{col.label}</span>
          )}

          <button
            onClick={(e) => {
              e.stopPropagation();
              onSort(col.key);
            }}
            className={`p-1 rounded hover:bg-gray-200 transition-colors z-20 relative ${isSorted ? 'text-blue-600 bg-blue-50' : 'text-gray-300'}`}
          >
            {isSorted ? (
              sortConfig.direction === 'asc' ? <ArrowUp size={12} /> : <ArrowDown size={12} />
            ) : (
              <ArrowUpDown size={12} />
            )}
          </button>

          {col.isUncertain && onColumnConfirm && (
            <button
              onClick={() => onColumnConfirm(col.key)}
              className="px-1.5 py-0.5 ml-1 bg-yellow-400 text-yellow-900 text-[10px] rounded hover:bg-yellow-500 flex-shrink-0 z-20"
            >
              Ок
            </button>
          )}
        </div>
      </div>
    </th>
  );
}

// ── Editable Table ────────────────────────────────────────────────────────────

interface EditableTableProps {
  columns: ColumnDef[];
  rows: Record<string, any>[];
  onRowChange: (index: number, key: string, value: string) => void;
  onAddRow: () => void;
  onDeleteRow: (index: number) => void;
  emptyMessage?: string;
  availableFields?: { key: string; label: string }[];
  onColumnChange?: (oldKey: string, newKey: string) => void;
  onColumnConfirm?: (key: string) => void;
  onColumnOrderChange?: (activeKey: string, overKey: string) => void;
  onUnmerge?: (parentId: string, childId: string) => void;
}

export function EditableTable({
  columns,
  rows,
  onRowChange,
  onAddRow,
  onDeleteRow,
  emptyMessage = 'Нет данных. Загрузите файл или добавьте строки вручную.',
  availableFields,
  onColumnChange,
  onColumnConfirm,
  onColumnOrderChange,
  onUnmerge,
}: EditableTableProps) {
  const [editingCell, setEditingCell] = useState<{
    row: number;
    col: number;
  } | null>(null);
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' | null }>({
    key: '',
    direction: null,
  });
  const tableRef = useRef<HTMLDivElement>(null);

  // Indices of non-readonly columns for Tab navigation
  const editableColIndices = columns
    .map((c, i) => ({ c, i }))
    .filter((x) => !x.c.readOnly)
    .map((x) => x.i);

  const totals = useMemo(() => {
    return rows.reduce((acc, row) => {
      const parse = (v: any) => parseFloat(String(v || '0').replace(/\s/g, '').replace(',', '.')) || 0;
      return {
        quantity: acc.quantity + parse(row.quantity),
        vatAmount: acc.vatAmount + parse(row.vatAmount),
        total: acc.total + parse(row.total)
      };
    }, { quantity: 0, vatAmount: 0, total: 0 });
  }, [rows]);

  const startEdit = useCallback((row: number, col: number) => {
    setEditingCell({ row, col });
  }, []);

  const commit = useCallback(
    (rowIndex: number, colKey: string, value: string) => {
      onRowChange(rowIndex, colKey, value);
    },
    [onRowChange]
  );

  const moveNext = useCallback(
    (row: number, col: number) => {
      const pos = editableColIndices.indexOf(col);
      if (pos < editableColIndices.length - 1) {
        setEditingCell({ row, col: editableColIndices[pos + 1] });
      } else if (row < rows.length - 1) {
        setEditingCell({ row: row + 1, col: editableColIndices[0] });
      } else {
        setEditingCell(null);
      }
    },
    [editableColIndices, rows.length]
  );

  const movePrev = useCallback(
    (row: number, col: number) => {
      const pos = editableColIndices.indexOf(col);
      if (pos > 0) {
        setEditingCell({ row, col: editableColIndices[pos - 1] });
      } else if (row > 0) {
        setEditingCell({
          row: row - 1,
          col: editableColIndices[editableColIndices.length - 1],
        });
      } else {
        setEditingCell(null);
      }
    },
    [editableColIndices]
  );

  const moveNextRow = useCallback(
    (row: number, col: number) => {
      if (row < rows.length - 1) {
        setEditingCell({ row: row + 1, col });
      } else {
        setEditingCell(null);
      }
    },
    [rows.length]
  );

  // Click outside to stop editing
  useEffect(() => {
    const handleMouseDown = (e: MouseEvent) => {
      if (tableRef.current && !tableRef.current.contains(e.target as Node)) {
        setEditingCell(null);
      }
    };
    document.addEventListener('mousedown', handleMouseDown);
    return () => document.removeEventListener('mousedown', handleMouseDown);
  }, []);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const handleSort = (key: string) => {
    setSortConfig((prev) => {
      if (prev.key === key) {
        if (prev.direction === 'asc') return { key, direction: 'desc' };
        return { key: '', direction: null };
      }
      return { key, direction: 'asc' };
    });
  };

  const normalizedCompare = (a: any, b: any, direction: 'asc' | 'desc') => {
    const clean = (s: any) => String(s || '').replace(/^[^a-zA-Zа-яА-Я0-9]+/, '').toLowerCase();
    const valA = clean(a);
    const valB = clean(b);

    if (valA < valB) return direction === 'asc' ? -1 : 1;
    if (valA > valB) return direction === 'asc' ? 1 : -1;
    return 0;
  };

  const sortedRows = useMemo(() => {
    if (!sortConfig.key || !sortConfig.direction) return rows;
    return [...rows].sort((a, b) => 
      normalizedCompare(a[sortConfig.key], b[sortConfig.key], sortConfig.direction!)
    );
  }, [rows, sortConfig]);

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      if (onColumnOrderChange) {
        onColumnOrderChange(active.id as string, over.id as string);
      }
    }
  };

  const totalMinWidth =
    columns.reduce((sum, c) => sum + (c.width || 120), 0) + 80;

  return (
    <div ref={tableRef} className="relative h-full overflow-hidden border border-gray-200 rounded-lg bg-white flex flex-col">
      <div className="flex-1 overflow-auto" style={{ minWidth: totalMinWidth }}>
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={columns.map((c) => c.key)}
            strategy={horizontalListSortingStrategy}
          >
          <table className="w-full border-collapse">
          <thead className="sticky top-0 z-10 bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="w-10 px-2 py-2.5 text-xs text-gray-400 font-medium text-center border-r border-gray-200 select-none bg-gray-50">
                №
              </th>
              {columns.map((col) => (
                <SortableHeader
                  key={col.key}
                  col={col}
                  availableFields={availableFields}
                  onColumnChange={onColumnChange}
                  onColumnConfirm={onColumnConfirm}
                  sortConfig={sortConfig}
                  onSort={handleSort}
                />
              ))}
              <th className="w-10 bg-gray-50" />
            </tr>
          </thead>
          <tbody>
            {sortedRows.length === 0 ? (
              <tr>
                <td
                  colSpan={columns.length + 2}
                  className="px-4 py-10 text-center text-sm text-gray-400"
                >
                  {emptyMessage}
                </td>
              </tr>
            ) : (
              sortedRows.map((row, rowIndex) => {
                const isMerged = Array.isArray(row.children) && row.children.length > 1;
                const isExpanded = isMerged && expandedRows.has(row.id as string);

                const toggleRow = (id: string, e: React.MouseEvent) => {
                  e.stopPropagation();
                  setExpandedRows(prev => {
                     const next = new Set(prev);
                     if (next.has(id)) next.delete(id); else next.add(id);
                     return next;
                  });
                };

                return (
                  <Fragment key={row.id || rowIndex}>
                    <tr className={`border-b border-gray-100 last:border-b-0 group transition-colors ${row.isUncertain ? 'bg-yellow-100/60 hover:bg-yellow-100' : 'hover:bg-gray-50/50'}`}>
                      <td className="px-2 py-0 text-xs text-gray-300 border-r border-gray-100 select-none w-10 text-center relative">
                        <div className="flex items-center justify-center relative w-full h-full min-h-[34px]">
                          {isMerged && (
                            <button
                              onClick={(e) => toggleRow(row.id as string, e)}
                              className="absolute left-0 p-1 text-gray-400 hover:text-gray-700 transition-colors"
                            >
                              {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                            </button>
                          )}
                          <span className={isMerged ? "ml-3" : ""}>{rowIndex + 1}</span>
                        </div>
                      </td>
                      {columns.map((col, colIndex) => (
                        <td
                          key={col.key}
                          className="border-r border-gray-100 last:border-r-0 p-0"
                        >
                          <EditableCell
                            value={String(row[col.key] ?? '')}
                            column={col}
                            isEditing={
                              editingCell?.row === rowIndex &&
                              editingCell?.col === colIndex
                            }
                            onStartEdit={() => startEdit(rowIndex, colIndex)}
                            onCommit={(val) => commit(rowIndex, col.key, val)}
                            onNext={() => moveNext(rowIndex, colIndex)}
                            onPrev={() => movePrev(rowIndex, colIndex)}
                            onNextRow={() => moveNextRow(rowIndex, colIndex)}
                          />
                        </td>
                      ))}
                      <td className="w-10 text-center p-0">
                        <button
                          onClick={() => onDeleteRow(rowIndex)}
                          className="opacity-0 group-hover:opacity-100 p-1.5 text-gray-300 hover:text-red-500 rounded transition-all mx-auto block"
                          title="Удалить строку"
                        >
                          <Trash2 size={13} />
                        </button>
                      </td>
                    </tr>
                    
                    {/* Render Children */}
                    {isExpanded && row.children.map((child: any, childIndex: number) => (
                       <tr key={child.id || childIndex} className="bg-gray-50/40 border-b border-gray-100 group">
                          <td className="px-2 py-0 text-[10px] text-gray-400 text-right pr-3 border-r border-gray-100 select-none w-10">
                             •
                          </td>
                          {columns.map((col) => (
                            <td
                              key={col.key}
                              className="border-r border-gray-200/50 last:border-r-0 p-0"
                            >
                              <EditableCell
                                value={String(child[col.key] ?? '')}
                                column={{ ...col, readOnly: true }}
                                isEditing={false}
                                onStartEdit={() => {}}
                                onCommit={() => {}}
                                onNext={() => {}}
                                onPrev={() => {}}
                                onNextRow={() => {}}
                              />
                            </td>
                          ))}
                          <td className="w-10 text-center p-0 pl-1">
                            {onUnmerge && (
                              <button
                                onClick={() => onUnmerge(row.id as string, child.id as string)}
                                className="opacity-0 group-hover:opacity-100 p-1 text-gray-400 hover:text-orange-500 rounded transition-all mx-auto block"
                                title="Извлечь из группы"
                              >
                                <Unlink size={13} />
                              </button>
                            )}
                          </td>
                       </tr>
                    ))}
                  </Fragment>
                );
              })
            )}
          </tbody>
          {rows.length > 0 && (
            <tfoot className="sticky bottom-0 z-20 bg-white shadow-[0_-4px_10px_rgba(0,0,0,0.03)] border-t-2 border-gray-200 font-bold text-gray-800">
              <tr className="divide-x divide-gray-200">
                <td className="bg-gray-50 border-r border-gray-200" />
                {columns.map((col) => {
                  const isTotalCol = ['quantity', 'vatAmount', 'total'].includes(col.key);
                  const isNameCol = col.key === 'name';
                  return (
                    <td 
                      key={col.key} 
                      className={`px-3 py-3 border-r border-gray-200 last:border-r-0 text-right tabular-nums text-xs
                        ${isTotalCol || isNameCol ? 'bg-blue-50/30' : ''}`}
                    >
                      {isTotalCol && (
                        totals[col.key as keyof typeof totals].toLocaleString('ru-RU', { 
                          minimumFractionDigits: col.key === 'quantity' ? 0 : 2, 
                          maximumFractionDigits: 2 
                        })
                      )}
                      {isNameCol && (
                        <div className="flex items-center gap-2 justify-end text-gray-400 font-medium whitespace-nowrap">
                          <span>Всего позиций:</span>
                          <span className="text-gray-900 font-bold">{rows.length}</span>
                        </div>
                      )}
                    </td>
                  );
                })}
                <td className="bg-gray-50" />
              </tr>
            </tfoot>
          )}
        </table>
        </SortableContext>
        </DndContext>

        <button
          onClick={onAddRow}
          className="flex items-center gap-2 px-4 py-3 text-sm text-gray-400 hover:text-blue-600 hover:bg-blue-50/50 w-full transition-colors font-medium border-t border-gray-100"
        >
          <Plus size={14} />
          Добавить строку
        </button>
      </div>
    </div>
  );
}

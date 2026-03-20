import React, { useState, useCallback } from 'react';
import { useNavigate } from 'react-router';
import {
  Download,
  Plus,
  RotateCcw,
  ArrowLeft,
  TrendingUp,
  FileDown,
  PackagePlus,
} from 'lucide-react';
import { EditableTable, ColumnDef } from '../components/EditableTable';
import { useData, genId, EstimateRow } from '../context/DataContext';
import { exportToExcel } from '../utils/fileUtils';

const MARKUP_OPTIONS = ['0', '5', '10', '15', '20', '25', '30', '40', '50', '75', '100'];
const TYPE_OPTIONS = ['Материалы', 'Работа', 'Услуги', 'Оборудование', 'Прочее'];

const COLUMNS: ColumnDef[] = [
  {
    key: 'type',
    label: 'Вид',
    width: 130,
    type: 'select',
    options: TYPE_OPTIONS,
  },
  { key: 'name', label: 'Наименование', width: 220 },
  { key: 'unit', label: 'Ед. изм.', width: 80, align: 'center' },
  { key: 'quantity', label: 'Количество', width: 100, type: 'number', align: 'right' },
  { key: 'cost', label: 'Себестоимость', width: 130, type: 'number', align: 'right' },
  {
    key: 'markup',
    label: 'Наценка, %',
    width: 110,
    type: 'select',
    options: MARKUP_OPTIONS,
    align: 'center',
  },
  { key: 'clientPrice', label: 'Стоимость для клиента', width: 170, type: 'number', align: 'right' },
];

function emptyRow(type = 'Материалы'): EstimateRow {
  return {
    id: genId(),
    type,
    name: '',
    unit: '',
    quantity: '',
    cost: '',
    markup: '20',
    clientPrice: '',
  };
}

function recalcClientPrice(row: EstimateRow): EstimateRow {
  const cost = parseFloat(row.cost) || 0;
  const qty = parseFloat(row.quantity) || 1;
  const markup = parseFloat(row.markup) || 0;
  if (cost > 0) {
    const unitClientPrice = cost * (1 + markup / 100);
    const total = unitClientPrice * qty;
    return { ...row, clientPrice: total.toFixed(2) };
  }
  return row;
}

export function EstimatePage() {
  const { estimateRows, setEstimateRows, specRows, invoiceRows } = useData();
  const navigate = useNavigate();

  const handleRowChange = useCallback(
    (index: number, key: string, value: string) => {
      const updated = [...estimateRows];
      updated[index] = { ...updated[index], [key]: value };

      // Auto-recalculate clientPrice when cost, quantity, or markup changes
      if (key === 'cost' || key === 'quantity' || key === 'markup') {
        updated[index] = recalcClientPrice(updated[index]);
      }

      setEstimateRows(updated);
    },
    [estimateRows, setEstimateRows]
  );

  const handleAddRow = useCallback(() => {
    const newRow = emptyRow();
    const recalced = recalcClientPrice(newRow);
    setEstimateRows([...estimateRows, recalced]);
  }, [estimateRows, setEstimateRows]);

  const handleAddWorkRow = useCallback(() => {
    const newRow = emptyRow('Работа');
    setEstimateRows([...estimateRows, newRow]);
  }, [estimateRows, setEstimateRows]);

  const handleDeleteRow = useCallback(
    (index: number) => {
      setEstimateRows(estimateRows.filter((_, i) => i !== index));
    },
    [estimateRows, setEstimateRows]
  );

  const handleImportFromSpec = () => {
    if (specRows.length === 0) {
      alert('Спецификация пуста. Сначала загрузите данные на вкладке «Спецификация».');
      return;
    }
    const existing = estimateRows.length > 0;
    if (existing && !window.confirm('Добавить позиции из спецификации к текущей смете?')) {
      return;
    }

    const newRows: EstimateRow[] = specRows.map((r) => {
      const row: EstimateRow = {
        id: genId(),
        type: 'Материалы',
        name: [r.name, r.brand].filter(Boolean).join(' — '),
        unit: r.unit,
        quantity: r.quantity,
        cost: '',
        markup: '20',
        clientPrice: '',
      };
      return row;
    });

    setEstimateRows([...estimateRows, ...newRows]);
  };

  const handleImportFromInvoice = () => {
    if (invoiceRows.length === 0) {
      alert('Счёт пуст. Сначала загрузите данные на вкладке «Счёт поставщика».');
      return;
    }
    const existing = estimateRows.length > 0;
    if (existing && !window.confirm('Добавить позиции из счёта к текущей смете?')) {
      return;
    }

    const newRows: EstimateRow[] = invoiceRows.map((r) => {
      const cost = parseFloat(r.price) || 0;
      const row: EstimateRow = {
        id: genId(),
        type: 'Материалы',
        name: r.name,
        unit: r.unit,
        quantity: r.quantity,
        cost: cost > 0 ? String(cost) : '',
        markup: '20',
        clientPrice: '',
      };
      return recalcClientPrice(row);
    });

    setEstimateRows([...estimateRows, ...newRows]);
  };

  const handleReset = () => {
    if (window.confirm('Очистить смету?')) {
      setEstimateRows([]);
    }
  };

  const handleExport = () => {
    const data = estimateRows.map((r, i) => ({
      '№': i + 1,
      Вид: r.type,
      Наименование: r.name,
      'Ед. изм.': r.unit,
      Количество: r.quantity,
      Себестоимость: r.cost,
      'Наценка, %': r.markup,
      'Стоимость для клиента': r.clientPrice,
    }));
    exportToExcel(data, 'Смета');
  };

  const handleRecalcAll = () => {
    setEstimateRows(estimateRows.map(recalcClientPrice));
  };

  // Totals
  const totals = estimateRows.reduce(
    (acc, r) => {
      const cost = parseFloat(r.cost) || 0;
      const qty = parseFloat(r.quantity) || 1;
      const client = parseFloat(r.clientPrice) || 0;
      return {
        cost: acc.cost + cost * qty,
        client: acc.client + client,
        profit: acc.profit + (client - cost * qty),
      };
    },
    { cost: 0, client: 0, profit: 0 }
  );

  const fmt = (n: number) =>
    n.toLocaleString('ru-RU', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });

  const hasRows = estimateRows.length > 0;

  // Group counts for display
  const materialCount = estimateRows.filter((r) => r.type === 'Материалы').length;
  const workCount = estimateRows.filter((r) => r.type === 'Работа').length;

  return (
    <div className="p-6 max-w-full">
      {/* Header */}
      <div className="mb-6 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-lg font-semibold text-gray-900">Смета</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Файл для загрузки в программу по составлению смет
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => navigate('/invoice')}
            className="flex items-center gap-2 px-3.5 py-2 text-sm border border-gray-200 rounded-lg text-gray-500 hover:bg-gray-50 transition-colors"
          >
            <ArrowLeft size={14} />
            Счёт
          </button>
          <button
            onClick={handleImportFromSpec}
            className="flex items-center gap-2 px-3.5 py-2 text-sm border border-gray-200 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors"
          >
            <PackagePlus size={14} />
            Из спецификации
          </button>
          <button
            onClick={handleImportFromInvoice}
            className="flex items-center gap-2 px-3.5 py-2 text-sm border border-gray-200 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors"
          >
            <PackagePlus size={14} />
            Из счёта
          </button>
          {hasRows && (
            <>
              <button
                onClick={handleRecalcAll}
                className="flex items-center gap-2 px-3.5 py-2 text-sm border border-gray-200 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors"
              >
                <TrendingUp size={14} />
                Пересчитать
              </button>
              <button
                onClick={handleReset}
                className="flex items-center gap-2 px-3.5 py-2 text-sm border border-gray-200 rounded-lg text-gray-400 hover:text-red-500 hover:border-red-200 transition-colors"
              >
                <RotateCcw size={14} />
                Очистить
              </button>
              <button
                onClick={handleExport}
                className="flex items-center gap-2 px-4 py-2 text-sm bg-gray-900 text-white rounded-lg hover:bg-gray-700 transition-colors"
              >
                <FileDown size={14} />
                Экспорт Excel
              </button>
            </>
          )}
        </div>
      </div>

      {/* Summary cards */}
      {hasRows && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
          <div className="bg-white border border-gray-200 rounded-lg px-4 py-3">
            <p className="text-xs text-gray-400 mb-0.5">Позиций</p>
            <p className="text-lg font-semibold text-gray-900">{estimateRows.length}</p>
            {(materialCount > 0 || workCount > 0) && (
              <p className="text-xs text-gray-400 mt-0.5">
                {materialCount > 0 && `${materialCount} мат.`}
                {materialCount > 0 && workCount > 0 && ', '}
                {workCount > 0 && `${workCount} раб.`}
              </p>
            )}
          </div>
          <div className="bg-white border border-gray-200 rounded-lg px-4 py-3">
            <p className="text-xs text-gray-400 mb-0.5">Себестоимость</p>
            <p className="text-lg font-semibold text-gray-900">{fmt(totals.cost)} ₽</p>
          </div>
          <div className="bg-white border border-gray-200 rounded-lg px-4 py-3">
            <p className="text-xs text-gray-400 mb-0.5">Для клиента</p>
            <p className="text-lg font-semibold text-gray-900">{fmt(totals.client)} ₽</p>
          </div>
          <div className="bg-white border border-gray-200 rounded-lg px-4 py-3">
            <p className="text-xs text-gray-400 mb-0.5">Прибыль</p>
            <p
              className={`text-lg font-semibold ${
                totals.profit >= 0 ? 'text-green-600' : 'text-red-600'
              }`}
            >
              {fmt(totals.profit)} ₽
            </p>
          </div>
        </div>
      )}

      {/* Quick add buttons */}
      {!hasRows && (
        <div className="border border-dashed border-gray-200 rounded-lg p-8 text-center mb-4">
          <p className="text-sm text-gray-400 mb-4">
            Начните с импорта данных или добавьте позиции вручную
          </p>
          <div className="flex items-center justify-center gap-3 flex-wrap">
            <button
              onClick={handleImportFromSpec}
              className="flex items-center gap-2 px-4 py-2 text-sm border border-gray-200 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors"
            >
              <PackagePlus size={14} />
              Импорт из спецификации
            </button>
            <button
              onClick={handleImportFromInvoice}
              className="flex items-center gap-2 px-4 py-2 text-sm border border-gray-200 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors"
            >
              <PackagePlus size={14} />
              Импорт из счёта
            </button>
          </div>
        </div>
      )}

      {/* Quick add row buttons */}
      {hasRows && (
        <div className="flex items-center gap-2 mb-3">
          <button
            onClick={handleAddRow}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50 transition-colors"
          >
            <Plus size={12} />
            Материалы
          </button>
          <button
            onClick={handleAddWorkRow}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50 transition-colors"
          >
            <Plus size={12} />
            Работа
          </button>
        </div>
      )}

      {/* Table */}
      <EditableTable
        columns={COLUMNS}
        rows={estimateRows as unknown as Record<string, string>[]}
        onRowChange={handleRowChange}
        onAddRow={handleAddRow}
        onDeleteRow={handleDeleteRow}
        emptyMessage="Смета пуста. Импортируйте данные или добавьте позиции вручную."
      />
    </div>
  );
}

import React, { useState, useMemo } from 'react';
import { X, Wand2, ArrowRight, Link2 } from 'lucide-react';

interface TargetField {
  key: string;
  label: string;
  required?: boolean;
}

interface ColumnMapperModalProps {
  fileHeaders: string[];
  targetFields: TargetField[];
  initialMapping: Record<string, number>;
  onConfirm: (mapping: Record<string, number>) => void;
  onCancel: () => void;
  title?: string;
}

const NONE = -1;

// ── Fuzzy Match ──────────────────────────────────────────────────────────────

const FUZZY_ALIASES: Record<string, string[]> = {
  name: ['наименование', 'название', 'материал', 'описание', 'позиция', 'наим', 'товар'],
  brand: ['марка', 'тип', 'бренд', 'модель', 'обозначение', 'марка/тип'],
  code: ['код', 'артикул', '№', 'шифр', 'номер', 'арт', 'код товара', 'sku'],
  supplier: ['поставщик', 'производитель', 'завод', 'фирма', 'вендор', 'контрагент'],
  unit: ['единица', 'ед.изм', 'ед.', 'ед', 'единиц', 'изм', 'ед.измерения'],
  quantity: ['количество', 'кол-во', 'кол.', 'кол', 'объем', 'объём', 'шт', 'qty'],
  mass: ['масса', 'вес', 'kg', 'кг', 'масса,кг'],
  note: ['примечание', 'примечания', 'комментарий', 'комментарии', 'доп.', 'коммент', 'прим'],
  article: ['артикул', 'арт', 'арт.', 'код товара', 'код', 'sku', '№'],
  price: ['цена', 'цена ед', 'цена за ед.', 'стоимость ед'],
  vat: ['ндс', '%ндс', 'ставка ндс', 'ндс%', 'ставка', 'vat'],
  vatAmount: ['сумма ндс', 'ндс сумма'],
  total: ['сумма', 'итого', 'стоимость', 'всего', 'total', 'сумма с ндс'],
};

function fuzzyMatch(
  sourceHeaders: string[],
  targetFields: TargetField[]
): Record<string, number> {
  const mapping: Record<string, number> = {};
  const usedSourceIndices = new Set<number>();

  for (const field of targetFields) {
    const aliases = FUZZY_ALIASES[field.key] || [field.label.toLowerCase()];

    for (let i = 0; i < sourceHeaders.length; i++) {
      if (usedSourceIndices.has(i)) continue;
      const normalized = sourceHeaders[i].toLowerCase().trim();
      if (normalized === '') continue;

      // Exact match
      if (aliases.some(a => normalized === a)) {
        mapping[field.key] = i;
        usedSourceIndices.add(i);
        break;
      }

      // Partial match (source contains alias or alias contains source)
      if (aliases.some(a => normalized.includes(a) || a.includes(normalized))) {
        mapping[field.key] = i;
        usedSourceIndices.add(i);
        break;
      }
    }
  }

  return mapping;
}

// ── Modal ────────────────────────────────────────────────────────────────────

export function ColumnMapperModal({
  fileHeaders,
  targetFields,
  initialMapping,
  onConfirm,
  onCancel,
  title = 'Сопоставление столбцов',
}: ColumnMapperModalProps) {
  // Auto-detect on mount: merge initialMapping with fuzzyMatch
  const autoMapping = useMemo(() => {
    const fuzzy = fuzzyMatch(fileHeaders, targetFields);
    // initialMapping takes priority, fuzzy fills gaps
    return { ...fuzzy, ...initialMapping };
  }, [fileHeaders, targetFields, initialMapping]);

  // State: sourceIndex → targetFieldKey (or NONE)
  // Convert from Record<targetKey, sourceIndex> to Record<sourceIndex, targetKey>
  const [mapping, setMapping] = useState<Record<number, string>>(() => {
    const m: Record<number, string> = {};
    for (const [targetKey, sourceIdx] of Object.entries(autoMapping)) {
      if (sourceIdx !== NONE) {
        m[sourceIdx] = targetKey;
      }
    }
    return m;
  });

  const handleChange = (sourceIndex: number, targetKey: string) => {
    setMapping(prev => {
      const next = { ...prev };

      // If another source was already mapped to this target, unmap it
      if (targetKey !== '') {
        for (const [idx, key] of Object.entries(next)) {
          if (key === targetKey && Number(idx) !== sourceIndex) {
            delete next[Number(idx)];
          }
        }
      }

      if (targetKey === '') {
        delete next[sourceIndex];
      } else {
        next[sourceIndex] = targetKey;
      }
      return next;
    });
  };

  const handleConfirm = () => {
    // Convert from Record<sourceIndex, targetKey> to Record<targetKey, sourceIndex>
    const result: Record<string, number> = {};
    for (const [sourceIdx, targetKey] of Object.entries(mapping)) {
      result[targetKey] = Number(sourceIdx);
    }
    onConfirm(result);
  };

  const mappedTargets = new Set(Object.values(mapping));

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <Wand2 size={16} className="text-blue-500" />
            <h2 className="text-sm font-semibold text-gray-800">{title}</h2>
          </div>
          <button
            onClick={onCancel}
            className="p-1.5 text-gray-400 hover:text-gray-700 rounded transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        {/* Description */}
        <div className="px-6 pt-4 pb-2">
          <p className="text-xs text-gray-500">
            Слева — колонки из вашего файла. Справа — поля системы. Автоматически распознанные связи уже установлены.
          </p>
        </div>

        {/* Column Labels */}
        <div className="flex items-center gap-3 px-6 py-2 text-[10px] uppercase tracking-widest text-gray-400 font-bold">
          <span className="flex-1">Из файла (Source)</span>
          <span className="w-6" />
          <span className="w-52">Поле системы (Target)</span>
        </div>

        {/* Mapping Rows */}
        <div className="flex-1 overflow-y-auto px-6 py-2 space-y-2">
          {fileHeaders.map((header, sourceIndex) => {
            const currentTarget = mapping[sourceIndex] || '';
            const isLinked = currentTarget !== '';

            return (
              <div
                key={sourceIndex}
                className={`flex items-center gap-3 p-2 rounded-lg transition-all ${
                  isLinked
                    ? 'bg-blue-50/50 border border-blue-100'
                    : 'bg-gray-50/50 border border-gray-100'
                }`}
              >
                {/* Source */}
                <div className="flex-1 flex items-center gap-2 min-w-0">
                  <span className="text-[10px] text-gray-400 font-mono w-5 shrink-0 text-right">
                    {sourceIndex + 1}
                  </span>
                  <span className="text-sm text-gray-800 font-medium truncate">
                    {header || `(столбец ${sourceIndex + 1})`}
                  </span>
                </div>

                {/* Arrow */}
                <div className={`shrink-0 ${isLinked ? 'text-blue-400' : 'text-gray-200'}`}>
                  {isLinked ? <Link2 size={14} /> : <ArrowRight size={14} />}
                </div>

                {/* Target Select */}
                <select
                  value={currentTarget}
                  onChange={(e) => handleChange(sourceIndex, e.target.value)}
                  className={`w-52 border rounded-lg px-3 py-1.5 text-sm bg-white outline-none focus:border-blue-400 transition-colors ${
                    isLinked ? 'border-blue-200 text-gray-900' : 'border-gray-200 text-gray-400'
                  }`}
                >
                  <option value="">— не импортировать —</option>
                  {targetFields.map((f) => (
                    <option
                      key={f.key}
                      value={f.key}
                      disabled={mappedTargets.has(f.key) && currentTarget !== f.key}
                    >
                      {f.label}{f.required ? ' *' : ''}
                    </option>
                  ))}
                </select>
              </div>
            );
          })}
        </div>

        {/* Actions */}
        <div className="flex items-center justify-between gap-3 px-6 py-4 border-t border-gray-100">
          <span className="text-xs text-gray-400">
            Связано: {Object.keys(mapping).length} из {fileHeaders.length}
          </span>
          <div className="flex items-center gap-3">
            <button
              onClick={onCancel}
              className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 hover:bg-gray-50 rounded-lg transition-colors"
            >
              Отмена
            </button>
            <button
              onClick={handleConfirm}
              className="px-4 py-2 text-sm bg-gray-900 text-white rounded-lg hover:bg-gray-700 transition-colors"
            >
              Импортировать
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

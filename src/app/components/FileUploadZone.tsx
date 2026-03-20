import React, { useRef, useState, DragEvent } from 'react';
import { Upload } from 'lucide-react';

interface FileUploadZoneProps {
  onFile: (file: File) => void;
  accept?: string;
  loading?: boolean;
  isGlobalDragging?: boolean;
}

export function FileUploadZone({
  onFile,
  accept = '.xlsx,.xls,.csv,.pdf',
  loading = false,
  isGlobalDragging = false,
}: FileUploadZoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const handleDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) onFile(file);
  };

  const handleDragOver = (e: DragEvent) => {
    e.preventDefault();
    setDragging(true);
  };

  const handleDragLeave = () => setDragging(false);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) onFile(file);
    e.target.value = '';
  };

  const isActivelyDragging = dragging || isGlobalDragging;

  return (
    <div
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onClick={() => !loading && inputRef.current?.click()}
      className={`
        relative flex flex-col items-center justify-center gap-6
        border-2 border-dashed p-8 md:p-12
        cursor-pointer transition-all duration-500 ease-in-out select-none
        bg-white overflow-hidden
        ${isGlobalDragging 
          ? 'w-full h-full border-blue-500 bg-blue-50/50 shadow-2xl shadow-blue-100/50 rounded-2xl scale-[0.98]' 
          : 'w-full max-w-[500px] min-h-[380px] border-gray-200 hover:border-blue-400 hover:bg-gray-50/50 hover:shadow-xl hover:shadow-gray-100 rounded-[2.5rem]'
        }
        ${loading ? 'opacity-60 cursor-wait' : ''}
      `}
    >
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        onChange={handleChange}
        className="hidden"
      />
      
      {loading ? (
        <div className="flex flex-col items-center gap-4">
          <div className="w-16 h-16 border-4 border-blue-100 border-t-blue-600 rounded-full animate-spin" />
          <p className="text-sm font-semibold text-blue-600">Обработка файла...</p>
        </div>
      ) : (
        <>
          <div className={`
            w-24 h-24 rounded-[2rem] flex items-center justify-center transition-all duration-700
            ${isActivelyDragging 
              ? 'bg-blue-600 text-white shadow-xl shadow-blue-200 scale-110 -rotate-6' 
              : 'bg-blue-50 text-blue-600 group-hover:scale-110'
            }
          `}>
            <Upload size={40} />
          </div>
          
          <div className="text-center space-y-3 px-4">
            <h3 className="text-xl font-bold text-gray-900 transition-all">
              {isGlobalDragging ? 'Отпустите файл для загрузки' : 'Оцифровка спецификации'}
            </h3>
            <p className="text-sm text-gray-500 leading-relaxed max-w-[340px] mx-auto">
              <span className="text-blue-600 font-bold underline underline-offset-4">Перетащите файл</span> сюда или <span className="text-blue-600 font-bold underline underline-offset-4">нажмите</span> для автоматического импорта и сопоставления колонок
            </p>
          </div>

          <div className={`flex items-center gap-2 mt-2 px-4 py-2 bg-gray-50 rounded-full border border-gray-100 transition-opacity duration-500 ${isGlobalDragging ? 'opacity-0' : 'opacity-100'}`}>
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Форматы:</p>
            <div className="flex gap-1.5">
              {['.xls', '.xlsx', '.pdf', '.csv'].map(ext => (
                <span key={ext} className="text-[10px] font-bold text-gray-600 bg-white px-2 py-0.5 rounded border border-gray-200 shadow-sm">
                  {ext.toUpperCase()}
                </span>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

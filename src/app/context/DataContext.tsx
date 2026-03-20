import React, { createContext, useContext, useState, ReactNode } from 'react';
import { MaterialPosition } from '../utils/fileUtils';


export function genId(): string {
  return typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2);
}

export interface SpecRow extends MaterialPosition {
  id: string;
  originalRowsIds?: string[];
  children?: SpecRow[];
}

export interface InvoiceRow {
  id: string;
  article: string;
  name: string;
  supplier: string;
  quantity: string;
  unit: string;
  price: string;
  vat: string;
  vatAmount: string;
  total: string;
}

export interface EstimateRow {
  id: string;
  type: string;
  name: string;
  unit: string;
  quantity: string;
  cost: string;
  markup: string;
  clientPrice: string;
}

interface DataContextType {
  projectName: string;
  setProjectName: (name: string) => void;
  specRows: SpecRow[];
  setSpecRows: (rows: SpecRow[]) => void;
  invoiceRows: InvoiceRow[];
  setInvoiceRows: (rows: InvoiceRow[]) => void;
  estimateRows: EstimateRow[];
  setEstimateRows: (rows: EstimateRow[]) => void;
}

const DataContext = createContext<DataContextType | null>(null);

export function DataProvider({ children }: { children: ReactNode }) {
  const [projectName, setProjectName] = useState('Новый проект #1');
  const [specRows, setSpecRows] = useState<SpecRow[]>([]);
  const [invoiceRows, setInvoiceRows] = useState<InvoiceRow[]>([]);
  const [estimateRows, setEstimateRows] = useState<EstimateRow[]>([]);

  return (
    <DataContext.Provider
      value={{
        projectName,
        setProjectName,
        specRows,
        setSpecRows,
        invoiceRows,
        setInvoiceRows,
        estimateRows,
        setEstimateRows,
      }}
    >
      {children}
    </DataContext.Provider>
  );
}

export function useData() {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error('useData must be used within DataProvider');
  return ctx;
}

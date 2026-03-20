import React from 'react';
import { RouterProvider } from 'react-router';
import { router } from './routes';
import { DataProvider } from './context/DataContext';

export default function App() {
  return (
    <DataProvider>
      <RouterProvider router={router} />
    </DataProvider>
  );
}

import { createBrowserRouter } from 'react-router';
import { Layout } from './components/Layout';
import { SpecificationPage } from './pages/SpecificationPage';
import { PurchasePage } from './pages/PurchasePage';
import { InvoicePage } from './pages/InvoicePage';
import { EstimatePage } from './pages/EstimatePage';

export const router = createBrowserRouter([
  {
    path: '/',
    Component: Layout,
    children: [
      { index: true, Component: SpecificationPage },
      { path: 'purchase', Component: PurchasePage },
      { path: 'invoice', Component: InvoicePage },
      { path: 'estimate', Component: EstimatePage },
    ],
  },
]);

import './globals.css';
import { ErpProvider } from '@/lib/ErpProvider';
import { ToastHost } from '@/components/Toast';
import { ModalHost } from '@/components/Modal';

export const metadata = {
  title: 'Arundhati ERP',
  description: 'Staff attendance & leave ERP for Arundhati Medical College & Hospital.',
};

export const viewport = { width: 'device-width', initialScale: 1 };

// Set the theme before first paint so there is no flash.
const themeInit = `(function(){try{var t=localStorage.getItem('arundhati-theme')||(matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light');document.documentElement.dataset.theme=t;var a=localStorage.getItem('arundhati-accent');if(a)document.documentElement.style.setProperty('--primary',a);}catch(e){}})();`;

export default function RootLayout({ children }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInit }} />
      </head>
      <body>
        <ErpProvider>{children}</ErpProvider>
        <ToastHost />
        <ModalHost />
      </body>
    </html>
  );
}

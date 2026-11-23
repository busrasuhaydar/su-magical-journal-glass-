import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import './styles/app.css';
import './styles/glass-book.css';
import { queryClient, useRealtime, useSession } from './lib/data';
import { ToastProvider } from './components/ui';
import { EditorProvider } from './components/Editors';
import { Shell } from './components/Shell';
import Login from './pages/Login';
import Home from './pages/Home';
import CalendarPage from './pages/Calendar';
import DayPage from './pages/Day';
import TasksPage from './pages/Tasks';
import ProjectsPage from './pages/Projects';
import FilesPage from './pages/Files';
import SettingsPage from './pages/Settings';
import SocialPage from './pages/Social';
import ContactsPage from './pages/Contacts';
import IdeasPage from './pages/Ideas';
import { applySimple } from './lib/prefs';
import { startAutoIcons } from './lib/autoIcons';
applySimple();
startAutoIcons();
import NftCollectionsPage from './pages/NftCollections';
import ProjectWorkspace from './pages/project/Workspace';
import OpportunitiesPage from './pages/Opportunities';
import CommonGallery from './pages/Gallery';
import { todayKey } from './lib/dates';

function App() {
  const session = useSession();
  useRealtime(!!session);
  if (session === undefined) return <div className="auth"><span className="script" style={{ fontSize: 40 }}>Yükleniyor…</span></div>;
  if (!session) return <Login />;
  return (
    <EditorProvider>
      <Routes>
        <Route element={<Shell />}>
          <Route index element={<Home />} />
          <Route path="takvim" element={<Navigate to="/takvim/yil" replace />} />
          <Route path="takvim/:view/:date?" element={<CalendarPage />} />
          <Route path="gun" element={<Navigate to={`/gun/${todayKey()}`} replace />} />
          <Route path="gun/:date" element={<DayPage />} />
          <Route path="gorevler" element={<TasksPage />} />
          <Route path="projeler" element={<ProjectsPage />} />
          <Route path="projeler/:slug/:tab?/:sub?" element={<ProjectWorkspace />} />
          <Route path="sosyal" element={<SocialPage />} />
          <Route path="firsatlar/:id?" element={<OpportunitiesPage />} />
          <Route path="kisiler" element={<ContactsPage />} />
          <Route path="fikirler" element={<IdeasPage />} />
          <Route path="koleksiyonlar" element={<NftCollectionsPage />} />
          <Route path="koleksiyonlar/:slug" element={<NftCollectionsPage />} />
          <Route path="galeri" element={<CommonGallery />} />
          <Route path="dosyalar" element={<FilesPage />} />
          <Route path="ayarlar" element={<SettingsPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </EditorProvider>
  );
}

if ('serviceWorker' in navigator) window.addEventListener('load', () => navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => undefined));

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <BrowserRouter basename={import.meta.env.BASE_URL.replace(/\/$/, '')}>
          <App />
        </BrowserRouter>
      </ToastProvider>
    </QueryClientProvider>
  </StrictMode>,
);

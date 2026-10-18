import { BrowserRouter, Outlet, Route, Routes } from 'react-router-dom';
import { SiteHeader } from './components/SiteHeader';
import { BookPage } from './pages/BookPage';
import { CalendarPage } from './pages/CalendarPage';
import { ConfirmationPage } from './pages/ConfirmationPage';
import { HostPage } from './pages/HostPage';
import { JoinWaitlistPage } from './pages/JoinWaitlistPage';
import { WaitlistStatusPage } from './pages/WaitlistStatusPage';
import { ManagePage } from './pages/ManagePage';
import { NotFoundPage } from './pages/NotFoundPage';

function Layout() {
  return (
    <>
      <a href="#main" className="skip-link">
        Skip to content
      </a>
      <SiteHeader />
      <main id="main" className="container">
        <Outlet />
      </main>
    </>
  );
}

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<CalendarPage />} />
          <Route path="book/:slotId" element={<BookPage />} />
          <Route path="confirmation/:ref" element={<ConfirmationPage />} />
          <Route path="manage/:token" element={<ManagePage />} />
          <Route path="host" element={<HostPage />} />
          <Route path="join-waitlist/:date" element={<JoinWaitlistPage />} />
          <Route path="waitlist/:token" element={<WaitlistStatusPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

import { useEffect } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { Layout } from './components/Layout';
import { useApp } from './state/AppContext';
import { Dashboard } from './pages/Dashboard';
import { Onboarding } from './pages/Onboarding';
import { Study } from './pages/Study';
import { Learn } from './pages/Learn';
import { Review } from './pages/Review';
import { Grammar } from './pages/Grammar';
import { GrammarLesson } from './pages/GrammarLesson';
import { MixedPractice } from './pages/MixedPractice';
import { Library } from './pages/Library';
import { Passage } from './pages/Passage';
import { Speak } from './pages/Speak';
import { Produce } from './pages/Produce';
import { Tutor } from './pages/Tutor';
import { Pronounce } from './pages/Pronounce';
import { Settings } from './pages/Settings';

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    try {
      window.scrollTo(0, 0);
    } catch {
      /* jsdom */
    }
  }, [pathname]);
  return null;
}

export function App() {
  const { progress } = useApp();
  const onboarded = progress.goal !== null;

  return (
    <>
      <ScrollToTop />
      <Routes>
        <Route path="/welcome" element={onboarded ? <Navigate to="/" replace /> : <Onboarding />} />
        <Route element={onboarded ? <Layout /> : <Navigate to="/welcome" replace />}>
          <Route index element={<Dashboard />} />
          <Route path="study" element={<Study />} />
          <Route path="learn" element={<Learn />} />
          <Route path="review" element={<Review />} />
          <Route path="grammar" element={<Grammar />} />
          <Route path="grammar/mixed/:setId" element={<MixedPractice />} />
          <Route path="grammar/:lessonId" element={<GrammarLesson />} />
          <Route path="library" element={<Library />} />
          <Route path="library/:passageId" element={<Passage />} />
          <Route path="speak" element={<Speak />} />
          <Route path="produce" element={<Produce />} />
          <Route path="tutor" element={<Tutor />} />
          <Route path="pronounce" element={<Pronounce />} />
          <Route path="settings" element={<Settings />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </>
  );
}

import { Routes, Route } from 'react-router-dom';
import { ErrorBoundary } from './components/ErrorBoundary.jsx';
import { SenderScreen } from './screens/SenderScreen.jsx';
import { ReceiverScreen } from './screens/ReceiverScreen.jsx';
import { DataFlowExplainer } from './pages/DataFlowExplainer.jsx';
import { PrivacyPolicy } from './pages/PrivacyPolicy.jsx';

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<ErrorBoundary><SenderScreen /></ErrorBoundary>} />
      <Route path="/how-it-works" element={<ErrorBoundary><DataFlowExplainer /></ErrorBoundary>} />
      <Route path="/privacy" element={<ErrorBoundary><PrivacyPolicy /></ErrorBoundary>} />
      <Route path="/r/:sessionId" element={<ErrorBoundary><ReceiverScreen /></ErrorBoundary>} />
    </Routes>
  );
}
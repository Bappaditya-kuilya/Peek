import { Routes, Route } from 'react-router-dom';
import { ErrorBoundary } from './components/ErrorBoundary.jsx';
import { SenderScreen } from './screens/SenderScreen.jsx';
import { ReceiverScreen } from './screens/ReceiverScreen.jsx';

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<ErrorBoundary><SenderScreen /></ErrorBoundary>} />
      <Route path="/r/:sessionId" element={<ErrorBoundary><ReceiverScreen /></ErrorBoundary>} />
    </Routes>
  );
}
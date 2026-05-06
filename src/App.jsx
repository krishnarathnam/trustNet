import { Routes, Route } from 'react-router-dom'
import CanvasPage from './pages/CanvasPage'
import DashboardPage from './pages/DashboardPage'

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<CanvasPage />} />
      <Route path="/default" element={<CanvasPage forceDefaultOnMount />} />
      <Route path="/dashboard" element={<DashboardPage />} />
    </Routes>
  )
}

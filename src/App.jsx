import { BrowserRouter, Route, Routes } from 'react-router-dom'
import './App.css'
import Home from './pages/Home.jsx'
import ToolPage from './pages/ToolPage.jsx'

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/tool/:toolId" element={<ToolPage />} />
        <Route path="*" element={<ToolPage />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App

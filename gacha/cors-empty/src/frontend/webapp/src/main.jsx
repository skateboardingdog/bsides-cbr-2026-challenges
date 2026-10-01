import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import Home from './pages/Home.jsx'
import Challenge1 from './pages/challenges/Challenge1.jsx'
import Challenge2 from './pages/challenges/Challenge2.jsx'
import Challenge3 from './pages/challenges/Challenge3.jsx'
import Challenge4 from './pages/challenges/Challenge4.jsx'
import './styles.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/chal/1" element={<Challenge1 />} />
        <Route path="/chal/2" element={<Challenge2 />} />
        <Route path="/chal/3" element={<Challenge3 />} />
        <Route path="/chal/4" element={<Challenge4 />} />
      </Routes>
    </BrowserRouter>
  </React.StrictMode>,
)

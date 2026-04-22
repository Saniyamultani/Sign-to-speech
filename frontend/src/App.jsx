/**
 * src/App.jsx
 * Root state machine: landing → sign-to-speech | text-to-gesture
 */
import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import LandingPage       from './pages/LandingPage.jsx'
import SignToSpeechPage  from './pages/SignToSpeechPage.jsx'
import TextToGesturePage from './pages/TextToGesturePage.jsx'

const pageVariants = {
  initial: { opacity: 0, y: 20 },
  enter:   { opacity: 1, y: 0, transition: { duration: 0.4, ease: [0.22,1,0.36,1] } },
  exit:    { opacity: 0, y: -12, transition: { duration: 0.25 } },
}

export default function App() {
  const [page, setPage] = useState('landing')  // 'landing' | 's2s' | 't2g'

  return (
    <AnimatePresence mode="wait">
      {page === 'landing' && (
        <motion.div key="landing" variants={pageVariants} initial="initial" animate="enter" exit="exit">
          <LandingPage onMode={setPage} />
        </motion.div>
      )}
      {page === 's2s' && (
        <motion.div key="s2s" variants={pageVariants} initial="initial" animate="enter" exit="exit">
          <SignToSpeechPage onBack={() => setPage('landing')} />
        </motion.div>
      )}
      {page === 't2g' && (
        <motion.div key="t2g" variants={pageVariants} initial="initial" animate="enter" exit="exit">
          <TextToGesturePage onBack={() => setPage('landing')} />
        </motion.div>
      )}
    </AnimatePresence>
  )
}

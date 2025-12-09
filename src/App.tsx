import { useState } from 'react'
import { Header } from './components/Header'
import { NFTList } from './components/NFTList'
import './App.css'

function App() {
  const [connectedAccount, setConnectedAccount] = useState<string | null>(null);

  return (
    <div className="app">
      <Header onAccountChange={setConnectedAccount} />
      <main className="main-content">
        <NFTList accountId={connectedAccount} />
      </main>
    </div>
  )
}

export default App

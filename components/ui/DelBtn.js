import { useState, useRef } from 'react'

export default function DelBtn({ onDel }) {
  const [confirming, setConfirming] = useState(false)
  const timerRef = useRef(null)
  function handleClick() {
    if (confirming) {
      clearTimeout(timerRef.current)
      setConfirming(false)
      onDel()
    } else {
      setConfirming(true)
      timerRef.current = setTimeout(() => setConfirming(false), 3000)
    }
  }
  return (
    <button onClick={handleClick}
      title={confirming ? 'Cliquer pour confirmer la suppression' : 'Supprimer'}
      className={`transition text-xs px-1 rounded ${confirming ? 'text-red-600 font-bold bg-red-50' : 'text-red-300 hover:text-red-500'}`}>
      {confirming ? 'Ok?' : '✕'}
    </button>
  )
}

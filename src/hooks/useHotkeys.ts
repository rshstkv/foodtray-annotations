import { useEffect } from 'react'

type HotkeyHandler = (e: KeyboardEvent) => void

interface Hotkey {
  key: string
  ctrl?: boolean
  shift?: boolean
  alt?: boolean
  handler: HotkeyHandler
}

export function useHotkeys(hotkeys: Hotkey[]) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      for (const hotkey of hotkeys) {
        const ctrlMatch = hotkey.ctrl ? e.ctrlKey || e.metaKey : !e.ctrlKey && !e.metaKey
        const shiftMatch = hotkey.shift ? e.shiftKey : !e.shiftKey
        const altMatch = hotkey.alt ? e.altKey : !e.altKey
        const keyMatch = e.key.toLowerCase() === hotkey.key.toLowerCase()

        if (ctrlMatch && shiftMatch && altMatch && keyMatch) {
          e.preventDefault()
          hotkey.handler(e)
          break
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [hotkeys])
}









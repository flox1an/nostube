import { useLocalStorage } from './useLocalStorage'

export function useCinemaMode() {
  const [cinemaMode, setCinemaMode] = useLocalStorage('cinemaMode', false)

  const toggleCinemaMode = () => {
    setCinemaMode(!cinemaMode)
  }

  return {
    cinemaMode,
    setCinemaMode,
    toggleCinemaMode,
  }
}

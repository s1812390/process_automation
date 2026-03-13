import { createContext, useContext, ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { settingsApi } from '../api/settings'

interface TimezoneContextValue {
  timezone: string
  formatDate: (date: string | Date, opts?: Intl.DateTimeFormatOptions) => string
  formatTime: (date: string | Date) => string
  formatDateTime: (date: string | Date) => string
}

const TimezoneContext = createContext<TimezoneContextValue>({
  timezone: 'Asia/Almaty',
  formatDate: (d) => new Date(d).toLocaleDateString(),
  formatTime: (d) => new Date(d).toLocaleTimeString(),
  formatDateTime: (d) => new Date(d).toLocaleString(),
})

export function TimezoneProvider({ children }: { children: ReactNode }) {
  const { data: settings } = useQuery({
    queryKey: ['settings'],
    queryFn: settingsApi.get,
    staleTime: 60_000,
  })

  const timezone = settings?.timezone || 'Asia/Almaty'

  const fmt = (date: string | Date, opts: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat('ru-KZ', { timeZone: timezone, ...opts }).format(new Date(date))

  const formatDate = (date: string | Date) =>
    fmt(date, { year: 'numeric', month: '2-digit', day: '2-digit' })

  const formatTime = (date: string | Date) =>
    fmt(date, { hour: '2-digit', minute: '2-digit', second: '2-digit' })

  const formatDateTime = (date: string | Date) =>
    fmt(date, { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' })

  return (
    <TimezoneContext.Provider value={{ timezone, formatDate, formatTime, formatDateTime }}>
      {children}
    </TimezoneContext.Provider>
  )
}

export function useTimezone() {
  return useContext(TimezoneContext)
}

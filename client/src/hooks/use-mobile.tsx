import * as React from "react"

const MOBILE_BREAKPOINT = 768
const COMPACT_DESKTOP_BREAKPOINT = 1024

export function useIsMobile() {
  const [isMobile, setIsMobile] = React.useState(() => window.innerWidth < MOBILE_BREAKPOINT)

  React.useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`)
    const onChange = () => {
      setIsMobile(window.innerWidth < MOBILE_BREAKPOINT)
    }
    mql.addEventListener("change", onChange)
    return () => mql.removeEventListener("change", onChange)
  }, [])

  return isMobile
}

export function useIsCompactDesktop() {
  const [isCompactDesktop, setIsCompactDesktop] = React.useState(() => 
    window.innerWidth >= MOBILE_BREAKPOINT && window.innerWidth < COMPACT_DESKTOP_BREAKPOINT
  )

  React.useEffect(() => {
    const mql = window.matchMedia(`(min-width: ${MOBILE_BREAKPOINT}px) and (max-width: ${COMPACT_DESKTOP_BREAKPOINT - 1}px)`)
    const onChange = () => {
      setIsCompactDesktop(window.innerWidth >= MOBILE_BREAKPOINT && window.innerWidth < COMPACT_DESKTOP_BREAKPOINT)
    }
    mql.addEventListener("change", onChange)
    return () => mql.removeEventListener("change", onChange)
  }, [])

  return isCompactDesktop
}

import { createContext, useContext, useEffect } from 'react';

/** Lets a page tell Ask QAIbridge what it shows right now (a circuit, a result, a lesson step). */
export const PageDetailsContext = createContext<((key: string, text: string | null) => void) | null>(null);

/**
 * Describe what this part of the page shows, in a few plain lines, for Ask QAIbridge.
 * Each part adds its lines under its own key, and they go away with the part.
 * Keep it short: it is sent with every question asked on this page.
 */
export function usePageDetails(key: string, text: string | null) {
  const set = useContext(PageDetailsContext);
  useEffect(() => {
    if (!set) return;
    set(key, text);
    return () => set(key, null);
  }, [set, key, text]);
}

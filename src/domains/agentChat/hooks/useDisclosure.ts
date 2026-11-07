import { useState } from "react";
import { useChatView } from "../chatContext";

/**
 * Open/closed for a collapsible card: the card's default until the user picks,
 * and always open on the fixture page's "expand all" screenshots.
 */
export function useDisclosure(defaultOpen: boolean): [boolean, () => void] {
  const { expandAll } = useChatView();
  const [choice, setChoice] = useState<boolean | null>(null);
  const open = choice ?? (expandAll || defaultOpen);
  return [open, () => setChoice(!open)];
}

import { toast } from "@/app/toast";
import { copyPlain } from "@/ipc/clipboard";

/** Put `text` on the clipboard and say so ("Copied the path."), or why it couldn't. */
export function copyText(text: string, what: string): void {
  void copyPlain(text)
    .then(() => toast.success(`Copied the ${what}.`))
    .catch((e) => toast.error(`Couldn't copy: ${String(e)}`));
}

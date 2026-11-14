import { useState } from "react";
import { MessageSquare, Send, X } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Sticky feedback tag, bottom right, deliberately low key.
 * Sending opens a prefilled GitHub issue in a new tab (no email
 * address is exposed anywhere, and no backend is needed). The
 * transport can be swapped for a form endpoint later without
 * changing this component's UI.
 */
const ISSUES_URL =
  "https://github.com/rankplanmuse-ops/domain-crawl/issues/new";

export function FeedbackTag() {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");

  const send = () => {
    const body = [
      text.trim(),
      "",
      "---",
      `Page: ${window.location.href}`,
      `Sent: ${new Date().toISOString()}`,
    ].join("\n");
    const url = `${ISSUES_URL}?title=${encodeURIComponent(
      "Feedback: Domain Finder"
    )}&body=${encodeURIComponent(body)}`;
    window.open(url, "_blank", "noopener");
    setOpen(false);
    setText("");
  };

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col items-end gap-2">
      {open && (
        <div className="w-72 rounded-xl border border-border bg-card p-4 shadow-xl">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-sm font-medium text-foreground">
              Send feedback
            </p>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close feedback form"
              className="text-muted-foreground transition-colors hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={4}
            autoFocus
            placeholder="What worked, what did not, what is missing?"
            className="w-full resize-none rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          />
          <button
            type="button"
            onClick={send}
            disabled={text.trim().length === 0}
            className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground transition-opacity disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Send className="h-3.5 w-3.5" />
            Send feedback
          </button>
          <p className="mt-2 text-center text-[11px] leading-snug text-muted-foreground">
            Opens GitHub to send. No account? Use the{" "}
            <a
              href="https://rankplan.us/contact/"
              target="_blank"
              rel="noreferrer"
              className="underline underline-offset-2 hover:text-foreground"
            >
              Rankplan contact form
            </a>{" "}
            instead.
          </p>
        </div>
      )}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "inline-flex items-center gap-1.5 rounded-full border border-border",
          "bg-secondary/85 px-3 py-1.5 text-xs font-medium text-secondary-foreground",
          "opacity-75 shadow-md backdrop-blur transition-all hover:opacity-100"
        )}
      >
        <MessageSquare className="h-3.5 w-3.5" />
        Submit feedback
      </button>
    </div>
  );
}

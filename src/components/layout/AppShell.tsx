// AppShell — static CSS grid wrapper.
//
// Desktop: `280px 1fr` sidebar + main. Sidebar stays full-width on every
// page (including repo detail) so the terminal chrome is always visible
// and users never lose their filter/category context.
// Mobile: single column, sidebar hidden (<md breakpoint handled in CSS).

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="app-shell" data-mode="full">
      {children}
    </div>
  );
}

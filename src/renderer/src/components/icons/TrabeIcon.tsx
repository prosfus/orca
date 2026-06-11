export function TrabeIcon({ className }: { className?: string }): React.JSX.Element {
  return (
    <svg viewBox="0 0 200 200" aria-hidden className={className} fill="currentColor">
      {/* Why: flatten Trabe's logo (LiBuilding public/logo_trabe.svg) to its T
      mark — full-width top bar + left-offset stem — so it matches Orca's
      monochrome provider icons instead of rendering as a branded tile. */}
      <rect x="0" y="54" width="200" height="29" rx="3" />
      <rect x="54" y="83" width="30" height="110" rx="3" />
    </svg>
  )
}

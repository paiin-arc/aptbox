/**
 * Official Shelby symbol — extracted from media-kit.shelby.xyz.
 * `fill="currentColor"` so it inherits text color from a parent class.
 *
 * Decorative by default: every use sits directly beside the word "Shelby", so
 * labelling the mark too made screen readers say it twice. Pass `label` if you
 * ever render it without adjacent text.
 */
export function ShelbyLogo({
  className = "",
  label,
}: {
  className?: string;
  label?: string;
}) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 699.93 663.68"
      fill="currentColor"
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      focusable="false"
      className={className}
    >
      {label && <title>{label}</title>}
      <g>
        <path d="M170.41,224.87c8.43-14.59,18.31-27.8,29.35-39.58l-51.86-89.81c-5.49-9.51-19.21-9.51-24.7,0L11.47,289.05c-15.29,26.47-15.29,59.1,0,85.57l111.75,193.56c5.49,9.51,19.21,9.51,24.7,0l51.86-89.81c-62.99-66.97-77.7-169.77-29.35-253.5h-.01Z" />
        <path d="M512.14,0h-223.5c-10.98,0-17.84,11.88-12.35,21.39l51.87,89.85c51.14-12.02,106.79-5.36,155.88,22.98,49.09,28.34,82.69,73.2,97.85,123.51h103.75c10.98,0,17.84-11.88,12.35-21.39l-111.75-193.54c-15.29-26.47-43.53-42.78-74.1-42.78Z" />
        <path d="M328.15,552.49l-51.86,89.8c-5.49,9.51,1.37,21.39,12.35,21.39h223.5c30.57,0,58.81-16.32,74.1-42.78l111.75-193.56c5.49-9.51-1.37-21.39-12.35-21.39h-103.7c-4.68,15.46-11.18,30.62-19.6,45.21-48.33,83.72-144.71,122.39-234.22,101.33h.01Z" />
        <path d="M321.03,123.6c-40.26,9.47-77.73,30.52-106.99,61.71l59.9,103.75c15.29,26.47,15.29,59.1,0,85.57l-59.9,103.75c13.99,14.87,30.35,28,48.95,38.72,18.6,10.74,38.14,18.35,58.02,23.03l59.9-103.75c15.29-26.47,43.54-42.78,74.1-42.78h119.8c12.38-40.95,11.88-83.92-.06-123.51h-119.74c-30.58,0-58.82-16.32-74.1-42.78l-59.87-103.71Z" />
      </g>
    </svg>
  );
}

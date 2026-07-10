/**
 * Story Protocol mark — uses the official icon from story.foundation
 * (mirrored to /public/brand/story-icon.png so we don't depend on their CDN).
 *
 * The PNG already has the brand color baked in. `className` controls size
 * only; the inline filter lets us soften the edges to fit dark UI better.
 */
export function StoryLogo({ className = "" }: { className?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/brand/story-icon.png"
      alt="Story Protocol"
      className={`inline-block object-contain ${className}`}
      width={48}
      height={48}
    />
  );
}

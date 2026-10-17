// The background image behind the reader (a preset or an upload), on its own layer so the blur and
// the wash never touch the pages, the navigation or the call to action. The layer is pushed beyond
// the stage edges and clipped, so the blur leaves no soft or transparent rim. The stage around it
// must be "relative isolate" so the layer stays behind the stage's content.
// image: { url, blurPx, overlay } from backgroundAppearance.
export default function ReaderBackground({ image }) {
  if (!image) return null
  const bleed = image.blurPx * 3
  return (
    <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden" aria-hidden="true" data-testid="reader-background">
      <div
        className="absolute bg-cover bg-center bg-no-repeat"
        style={{ inset: -bleed, backgroundImage: `url("${image.url}")`, filter: `blur(${image.blurPx}px)` }}
      ></div>
      <div className="absolute inset-0" style={{ backgroundColor: image.overlay }}></div>
    </div>
  )
}

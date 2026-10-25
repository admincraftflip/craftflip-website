import { useEffect, useRef, useState } from 'react'
import toast from 'react-hot-toast'
import { Plus, X } from 'lucide-react'
import api from '../utils/api'
import { saveFlipbookDetails } from '../utils/flipbookDetails'
import { copyLink } from '../utils/publication'
import {
  BACKGROUND_PRESETS,
  EMBED_LIMITS,
  MAX_BACKGROUND_BYTES,
  MAX_CONTENTS_ENTRIES,
  MAX_CONTENTS_TITLE_LENGTH,
  MAX_CTA_LABEL_LENGTH,
  embedCode,
  presetThumbnailUrl,
  readerFormProblem,
  readerOf,
  readerUpdate,
  removeBackground,
  removeLogo,
  uploadBackground,
  uploadLogo,
} from '../utils/readerSettings'

const SWATCH_DEFAULT = '#292524'
const BACKGROUND_SWATCH_DEFAULT = '#f5f5f4'

const BACKGROUND_CHOICES = [
  { kind: 'default', label: 'Default' },
  { kind: 'color', label: 'Colour' },
  { kind: 'preset', label: 'Preset image' },
  { kind: 'image', label: 'Your image' },
]

function ColorField({ label, value, onChange, disabled, swatchDefault = SWATCH_DEFAULT }) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
      <span className="w-28 text-sm">{label}</span>
      <input
        type="color"
        className="h-8 w-10 cursor-pointer rounded border border-base-300 bg-transparent"
        value={value ?? swatchDefault}
        onChange={(event) => onChange(event.target.value)}
        disabled={disabled}
        aria-label={label}
      />
      <span className="w-20 font-mono text-xs text-base-content/70">{value ?? 'Default'}</span>
      {value && (
        <button type="button" className="btn btn-ghost btn-xs" onClick={() => onChange(null)} disabled={disabled}>
          Use default
        </button>
      )}
    </div>
  )
}

// Editable contents rows: the page is kept as typed until the form is checked.
let nextRowKey = 0
function contentsRows(contents) {
  return contents.map((entry) => ({ key: nextRowKey++, title: entry.title, page: String(entry.page) }))
}

function GroupHeading({ children }) {
  return <h4 className="text-xs font-semibold uppercase tracking-wider text-base-content/60">{children}</h4>
}

// Reader settings for one flipbook, in three groups: Appearance (logo, background, button colour),
// Actions (the call to action) and Reader settings (PDF download, table of contents, embed code).
// Open while `flipbook` is set; the parent gives it a key per flipbook. onSaved receives the
// server's updated flipbook after every successful change. The logo and the background image are
// saved straight away; everything else is saved with "Save settings". The viewing style is chosen
// in the preview page's toolbar (ViewerStylePicker), not here.
export default function ReaderSettingsDialog({ flipbook, logoSrc, backgroundSrc, onSaved, onClose }) {
  const dialogRef = useRef(null)
  const logoFileRef = useRef(null)
  const backgroundFileRef = useRef(null)
  const saved = readerOf(flipbook)
  const [form, setForm] = useState({
    primaryColor: saved.primaryColor,
    background: { kind: saved.background.kind, color: saved.background.color, preset: saved.background.preset },
    cta: saved.cta,
    allowDownload: saved.allowDownload,
    contents: contentsRows(saved.contents),
  })
  const [saving, setSaving] = useState(false)
  const [imageBusy, setImageBusy] = useState(null)
  const [problem, setProblem] = useState(null)
  const [embed, setEmbed] = useState({ responsive: true, width: '100%', height: 600 })
  const codeRef = useRef(null)

  useEffect(() => {
    const dialog = dialogRef.current
    if (flipbook && !dialog.open) dialog.showModal()
    if (!flipbook && dialog.open) dialog.close()
  }, [flipbook])

  const busy = saving || Boolean(imageBusy)
  const setCta = (changes) => setForm((current) => ({ ...current, cta: { ...current.cta, ...changes } }))
  const setBackground = (changes) => setForm((current) => ({ ...current, background: { ...current.background, ...changes } }))
  const hasBackgroundImage = Boolean(saved.background.image)
  const pageCount = flipbook?.pageCount ?? null
  const setContents = (update) => setForm((current) => ({ ...current, contents: update(current.contents) }))
  const contentsListRef = useRef(null)

  function addSection() {
    setContents((rows) => {
      const lastPage = Number(rows.at(-1)?.page)
      const page = Number.isInteger(lastPage) && lastPage >= 1 ? Math.min(lastPage + 1, pageCount) : 1
      return [...rows, { key: nextRowKey++, title: '', page: String(page) }]
    })
    // Focus the new row's title once it is drawn.
    requestAnimationFrame(() => contentsListRef.current?.querySelector('li:last-child input')?.focus())
  }

  function updateSection(key, changes) {
    setContents((rows) => rows.map((row) => (row.key === key ? { ...row, ...changes } : row)))
  }

  function removeSection(key) {
    setContents((rows) => rows.filter((row) => row.key !== key))
  }

  async function handleSave(event) {
    event.preventDefault()
    const localProblem = readerFormProblem(form, pageCount)
    if (localProblem) return setProblem(localProblem)
    setSaving(true)
    setProblem(null)
    const result = await saveFlipbookDetails(api, flipbook.id, readerUpdate(form))
    setSaving(false)
    if (!result.ok) return setProblem(result.message)
    // The server keeps the sections in page order; show them that way.
    setForm((current) => ({ ...current, contents: contentsRows(readerOf(result.flipbook).contents) }))
    onSaved(result.flipbook)
    toast.success('Reader settings saved.')
  }

  // Logo and background image uploads and removals are saved straight away.
  async function runImageRequest(which, request, successMessage) {
    setImageBusy(which)
    setProblem(null)
    const result = await request()
    setImageBusy(null)
    if (!result.ok) {
      setProblem(result.message)
      return false
    }
    onSaved(result.flipbook)
    toast.success(successMessage)
    return true
  }

  async function handleLogoChosen(event) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    if (file.size > 2 * 1024 * 1024) return setProblem('Logos must be 2 MB or smaller.')
    await runImageRequest('logo', () => uploadLogo(api, flipbook.id, file), 'Logo saved.')
  }

  async function handleBackgroundChosen(event) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    if (file.size > MAX_BACKGROUND_BYTES) return setProblem('Background images must be 8 MB or smaller.')
    // The server makes an uploaded image the chosen background.
    if (await runImageRequest('background', () => uploadBackground(api, flipbook.id, file), 'Background image saved.')) setBackground({ kind: 'image' })
  }

  async function handleBackgroundRemove() {
    if (await runImageRequest('background', () => removeBackground(api, flipbook.id), 'Background image removed.')) {
      setForm((current) => (current.background.kind === 'image' ? { ...current, background: { ...current.background, kind: 'default' } } : current))
    }
  }

  function chooseBackground(kind) {
    if (kind === 'color') return setBackground({ kind, color: form.background.color ?? BACKGROUND_SWATCH_DEFAULT })
    if (kind === 'preset') return setBackground({ kind, preset: form.background.preset ?? BACKGROUND_PRESETS[0].id })
    setBackground({ kind })
  }

  const code = flipbook ? embedCode({ origin: window.location.origin, slug: flipbook.slug, title: flipbook.title, ...embed }) : ''

  async function handleCopyCode() {
    if (await copyLink(navigator.clipboard, code)) return toast.success('Embed code copied.')
    // Clipboard refused: select the code so it can be copied by hand.
    codeRef.current?.focus()
    codeRef.current?.select()
    toast('Press Ctrl+C (or Cmd+C) to copy the selected code.')
  }

  return (
    <dialog ref={dialogRef} className="modal" onClose={() => !busy && onClose()} aria-labelledby="reader-settings-title">
      <div className="modal-box flex max-h-[90dvh] max-w-xl flex-col gap-5 overflow-y-auto overflow-x-hidden">
        <h3 id="reader-settings-title" className="text-lg font-semibold">
          Customize reader
        </h3>

        <form id="reader-settings-form" className="flex flex-col gap-6" onSubmit={handleSave} noValidate>
          {/* 1. Appearance */}
          <fieldset className="flex flex-col gap-4" aria-labelledby="group-appearance">
            <div id="group-appearance">
              <GroupHeading>Appearance</GroupHeading>
            </div>

            <section className="flex flex-col gap-2">
              <h5 className="text-sm font-semibold">Logo</h5>
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-36 items-center justify-center rounded-box border border-base-300 bg-base-200">
                  {saved.logo && logoSrc ? <img src={logoSrc} alt="Current logo" className="max-h-10 max-w-32 object-contain" /> : <span className="text-xs text-base-content/50">No logo</span>}
                </div>
                <input ref={logoFileRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={handleLogoChosen} />
                <button type="button" className="btn btn-outline btn-sm" onClick={() => logoFileRef.current.click()} disabled={busy}>
                  {imageBusy === 'logo' ? <span className="loading loading-spinner loading-xs" aria-label="Working"></span> : saved.logo ? 'Replace' : 'Upload'}
                </button>
                {saved.logo && (
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => runImageRequest('logo', () => removeLogo(api, flipbook.id), 'Logo removed.')} disabled={busy}>
                    Remove
                  </button>
                )}
              </div>
              <p className="text-xs text-base-content/60">PNG, JPEG or WebP, up to 2 MB. Saved straight away.</p>
            </section>

            <section className="flex flex-col gap-2">
              <h5 className="text-sm font-semibold">Reader background</h5>
              <div className="flex flex-wrap gap-x-4 gap-y-1" role="radiogroup" aria-label="Reader background">
                {BACKGROUND_CHOICES.map((choice) => {
                  const unavailable = choice.kind === 'image' && !hasBackgroundImage
                  return (
                    <label key={choice.kind} className={`flex items-center gap-2 text-sm ${unavailable ? 'text-base-content/40' : ''}`} title={unavailable ? 'Upload an image first' : undefined}>
                      <input
                        type="radio"
                        name="background-kind"
                        className="radio radio-sm disabled:opacity-40"
                        checked={form.background.kind === choice.kind}
                        onChange={() => chooseBackground(choice.kind)}
                        disabled={busy || unavailable}
                      />
                      {choice.label}
                    </label>
                  )
                })}
              </div>

              {form.background.kind === 'color' && (
                <ColorField label="Background colour" value={form.background.color} onChange={(color) => setBackground(color ? { color } : { kind: 'default', color: null })} disabled={busy} swatchDefault={BACKGROUND_SWATCH_DEFAULT} />
              )}

              {form.background.kind === 'preset' && (
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4" role="radiogroup" aria-label="Background preset">
                  {BACKGROUND_PRESETS.map((preset) => {
                    const selected = form.background.preset === preset.id
                    return (
                      <button
                        key={preset.id}
                        type="button"
                        role="radio"
                        aria-checked={selected}
                        onClick={() => setBackground({ preset: preset.id })}
                        disabled={busy}
                        className={`overflow-hidden rounded-box border-2 text-left text-xs ${selected ? 'border-base-content' : 'border-transparent hover:border-base-300'}`}
                      >
                        <img src={presetThumbnailUrl(preset.id)} alt="" className="aspect-[3/2] w-full object-cover" loading="lazy" />
                        <span className="block px-1.5 py-1">{preset.name}</span>
                      </button>
                    )
                  })}
                </div>
              )}

              <div className="flex items-center gap-3">
                <div className="h-12 w-20 overflow-hidden rounded-box border border-base-300 bg-base-200">
                  {hasBackgroundImage && backgroundSrc ? <img src={backgroundSrc} alt="Uploaded background" className="h-full w-full object-cover" /> : null}
                </div>
                <input ref={backgroundFileRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={handleBackgroundChosen} />
                <button type="button" className="btn btn-outline btn-sm" onClick={() => backgroundFileRef.current.click()} disabled={busy}>
                  {imageBusy === 'background' ? <span className="loading loading-spinner loading-xs" aria-label="Working"></span> : hasBackgroundImage ? 'Replace image' : 'Upload image'}
                </button>
                {hasBackgroundImage && (
                  <button type="button" className="btn btn-ghost btn-sm" onClick={handleBackgroundRemove} disabled={busy}>
                    Remove
                  </button>
                )}
              </div>
              <p className="text-xs text-base-content/60">
                Fills the space around the pages and never covers them. PNG, JPEG or WebP, up to 8 MB; an upload is saved and shown straight away. Preset images are temporary placeholders.
              </p>
            </section>

            <section className="flex flex-col gap-2">
              <h5 className="text-sm font-semibold">Brand colour</h5>
              <ColorField label="Button colour" value={form.primaryColor} onChange={(value) => setForm((current) => ({ ...current, primaryColor: value }))} disabled={busy} />
              <p className="text-xs text-base-content/60">Used for the call-to-action button and the page arrows.</p>
            </section>

          </fieldset>

          {/* 2. Actions */}
          <fieldset className="flex flex-col gap-2 border-t border-base-300 pt-5" aria-labelledby="group-actions">
            <div id="group-actions">
              <GroupHeading>Actions</GroupHeading>
            </div>
            <h5 className="text-sm font-semibold">Call to action</h5>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" className="checkbox checkbox-sm" checked={form.cta.enabled} onChange={(event) => setCta({ enabled: event.target.checked })} disabled={busy} />
              Show a button in the reader
            </label>
            <input
              className="input input-bordered input-sm"
              placeholder="Button label, for example Book a viewing"
              value={form.cta.label}
              maxLength={MAX_CTA_LABEL_LENGTH}
              onChange={(event) => setCta({ label: event.target.value })}
              disabled={busy}
              aria-label="Button label"
            />
            <input
              className="input input-bordered input-sm"
              placeholder="https://your-website.com/contact"
              value={form.cta.url}
              onChange={(event) => setCta({ url: event.target.value })}
              disabled={busy}
              inputMode="url"
              spellCheck={false}
              aria-label="Button link"
            />
            <p className="text-xs text-base-content/60">Floats at the bottom right of the reader on every page. Opens in a new tab.</p>
          </fieldset>

          {/* 3. Reader settings (the embed code below belongs to this group too) */}
          <fieldset className="flex flex-col gap-2 border-t border-base-300 pt-5" aria-labelledby="group-reader">
            <div id="group-reader">
              <GroupHeading>Reader settings</GroupHeading>
            </div>
            <h5 className="text-sm font-semibold">Downloads</h5>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="checkbox checkbox-sm"
                checked={form.allowDownload}
                onChange={(event) => setForm((current) => ({ ...current, allowDownload: event.target.checked }))}
                disabled={busy}
              />
              Let visitors download the original PDF
            </label>
            <p className="text-xs text-base-content/60">When off, there is no download button and the download link is refused. Visitors can still take screenshots.</p>

            <section className="mt-3 flex flex-col gap-2" aria-labelledby="contents-heading">
              <h5 id="contents-heading" className="text-sm font-semibold">
                Contents
              </h5>
              {pageCount ? (
                <>
                  {form.contents.length > 0 && (
                    <ol ref={contentsListRef} className="flex flex-col gap-2">
                      {form.contents.map((row, index) => (
                        <li key={row.key} className="flex items-center gap-2">
                          <input
                            className="input input-bordered input-sm min-w-0 flex-1"
                            placeholder="Section title"
                            value={row.title}
                            maxLength={MAX_CONTENTS_TITLE_LENGTH}
                            onChange={(event) => updateSection(row.key, { title: event.target.value })}
                            disabled={busy}
                            aria-label={`Section ${index + 1} title`}
                          />
                          <input
                            className="input input-bordered input-sm w-16 shrink-0 text-center tabular-nums"
                            value={row.page}
                            inputMode="numeric"
                            onChange={(event) => updateSection(row.key, { page: event.target.value.replace(/\D/g, '').slice(0, 4) })}
                            disabled={busy}
                            aria-label={`Section ${index + 1} page, 1 to ${pageCount}`}
                            title={`Page (1–${pageCount})`}
                          />
                          <button
                            type="button"
                            className="btn btn-ghost btn-sm btn-square shrink-0"
                            onClick={() => removeSection(row.key)}
                            disabled={busy}
                            aria-label={`Remove section ${index + 1}`}
                            title="Remove"
                          >
                            <X size={16} aria-hidden="true" />
                          </button>
                        </li>
                      ))}
                    </ol>
                  )}
                  {form.contents.length < MAX_CONTENTS_ENTRIES && (
                    <div>
                      <button type="button" className="btn btn-outline btn-sm" onClick={addSection} disabled={busy}>
                        <Plus size={16} aria-hidden="true" />
                        Add section
                      </button>
                    </div>
                  )}
                  <p className="text-xs text-base-content/60">
                    Section titles and the page each starts on (1–{pageCount}), sorted by page when saved. Visitors open them from the Contents button in the reader, which is shown only when there is at least one section.
                  </p>
                </>
              ) : (
                <p className="text-sm text-base-content/70">Contents can be added once the flipbook is ready.</p>
              )}
            </section>
          </fieldset>
        </form>

        <section className="flex flex-col gap-2">
          <h5 className="text-sm font-semibold">Embed on a website</h5>
          {flipbook?.isPublished ? (
            <>
              <div className="flex flex-wrap items-center gap-3 text-sm">
                <label className="flex items-center gap-2">
                  <input type="checkbox" className="checkbox checkbox-sm" checked={embed.responsive} onChange={(event) => setEmbed((current) => ({ ...current, responsive: event.target.checked }))} />
                  Fit the page width
                </label>
                {!embed.responsive && (
                  <>
                    <label className="flex items-center gap-1">
                      Width
                      <input
                        className="input input-bordered input-xs w-20"
                        value={embed.width}
                        onChange={(event) => setEmbed((current) => ({ ...current, width: event.target.value }))}
                        aria-label="Embed width"
                      />
                    </label>
                    <label className="flex items-center gap-1">
                      Height
                      <input
                        className="input input-bordered input-xs w-20"
                        type="number"
                        min={EMBED_LIMITS.minHeight}
                        max={EMBED_LIMITS.maxHeight}
                        value={embed.height}
                        onChange={(event) => setEmbed((current) => ({ ...current, height: event.target.value }))}
                        aria-label="Embed height"
                      />
                    </label>
                  </>
                )}
              </div>
              <textarea ref={codeRef} className="textarea textarea-bordered h-24 font-mono text-xs" readOnly value={code} aria-label="Embed code" onFocus={(event) => event.target.select()}></textarea>
              <div className="flex justify-end">
                <button type="button" className="btn btn-outline btn-sm" onClick={handleCopyCode}>
                  Copy code
                </button>
              </div>
              <p className="text-xs text-base-content/60">
                Width is a number of pixels or 100%. The embed shows this flipbook only while it is published; after unpublishing or deleting it shows "doesn't exist".
              </p>
            </>
          ) : (
            <p className="text-sm text-base-content/70">Publish this flipbook from the dashboard to get its embed code. Embeds only work while it is published.</p>
          )}
        </section>

        {problem && (
          <p className="text-sm text-error" role="alert">
            {problem}
          </p>
        )}
        {/* Kept in view while the dialog scrolls; -bottom-6 covers the dialog's own bottom padding. */}
        <div className="sticky -bottom-6 z-10 -mx-6 -mb-6 flex justify-end gap-2 border-t border-base-300 bg-base-100 px-6 py-3">
          <button type="button" className="btn btn-ghost btn-sm" onClick={onClose} disabled={busy}>
            Close
          </button>
          <button type="submit" form="reader-settings-form" className="btn btn-primary btn-sm" disabled={busy}>
            {saving ? <span className="loading loading-spinner loading-xs" aria-label="Saving"></span> : 'Save settings'}
          </button>
        </div>
      </div>
      <form method="dialog" className="modal-backdrop">
        <button type="submit" disabled={busy}>
          Close
        </button>
      </form>
    </dialog>
  )
}

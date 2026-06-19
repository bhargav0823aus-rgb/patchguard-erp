import puppeteer, { type Browser, type Page } from 'puppeteer'
import type { CaptureSource } from '../captureSource.js'
import type { Waypoint } from '../types.js'
import { earthUrlFor } from './flyTo.js'

// CSS selectors of Earth Web chrome we hide before snapshotting.
// These are observation-based — Google may change them; if so this is the spot to patch.
const HIDE_SELECTORS = [
  'earth-toolbar',
  'earth-app-bar',
  'earth-sidebar',
  '#earth-toolbar',
  'header',
  '[role="navigation"]',
]

const HIDE_CSS = HIDE_SELECTORS.join(',') + ' { display: none !important; visibility: hidden !important; }'

export class EarthCaptureSource implements CaptureSource {
  private browser: Browser | null = null
  private page: Page | null = null
  private readonly headless: boolean

  constructor(opts: { headless?: boolean } = {}) {
    this.headless = opts.headless ?? true
  }

  async init(): Promise<void> {
    this.browser = await puppeteer.launch({
      headless: this.headless,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--use-gl=swiftshader',
        '--enable-webgl',
        '--window-size=1280,800',
      ],
      defaultViewport: { width: 1280, height: 800 },
    })
    this.page = await this.browser.newPage()
    await this.page.setUserAgent(
      'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36',
    )
    await this.page.addStyleTag({ content: HIDE_CSS }).catch(() => {})
  }

  async captureAt(wp: Waypoint, settleMs: number): Promise<{ jpeg: Buffer; capturedAt: number }> {
    if (!this.page) throw new Error('source not initialised')
    const url = earthUrlFor(wp)
    await this.page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30_000 })
    // Re-inject hide CSS — Earth replaces the DOM on navigation.
    await this.page.addStyleTag({ content: HIDE_CSS }).catch(() => {})
    // Earth has no reliable readiness signal in the public DOM; we wait for network idle, then
    // give the WebGL globe time to render to the camera position.
    await this.page.waitForNetworkIdle({ idleTime: 800, timeout: 20_000 }).catch(() => {})
    await new Promise((r) => setTimeout(r, settleMs))
    const buf = (await this.page.screenshot({
      type: 'jpeg',
      quality: 75,
      fullPage: false,
    })) as Buffer
    return { jpeg: buf, capturedAt: Date.now() }
  }

  async dispose(): Promise<void> {
    await this.page?.close().catch(() => {})
    await this.browser?.close().catch(() => {})
    this.page = null
    this.browser = null
  }
}

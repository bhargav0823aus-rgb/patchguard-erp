// Renders a generated inspection report (Markdown) in a modal, with .md download.
// Lightweight renderer — handles the subset our reports use (h2, bold, lists, paragraphs).

import { useMemo } from 'react'
import type { ReportOut } from '../lib/erpApi'

function mdToHtml(md: string): string {
  const esc = (s: string) =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  const inline = (s: string) =>
    esc(s)
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g, '<em>$1</em>')
      .replace(/`(.+?)`/g, '<code>$1</code>')

  const lines = md.split('\n')
  const out: string[] = []
  let inList = false
  for (const line of lines) {
    if (line.startsWith('## ')) {
      if (inList) { out.push('</ul>'); inList = false }
      out.push(`<h2>${inline(line.slice(3))}</h2>`)
    } else if (line.startsWith('- ')) {
      if (!inList) { out.push('<ul>'); inList = true }
      out.push(`<li>${inline(line.slice(2))}</li>`)
    } else if (line.trim() === '') {
      if (inList) { out.push('</ul>'); inList = false }
    } else {
      if (inList) { out.push('</ul>'); inList = false }
      out.push(`<p>${inline(line)}</p>`)
    }
  }
  if (inList) out.push('</ul>')
  return out.join('\n')
}

export function ReportPanel({ report, onClose }: { report: ReportOut; onClose: () => void }) {
  const html = useMemo(() => mdToHtml(report.content_md), [report.content_md])

  function download() {
    const blob = new Blob([report.content_md], { type: 'text/markdown' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `inspection_report_${report.report_id.slice(0, 8)}.md`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal report-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <strong>Inspection report</strong>
            <div className="modal-meta">
              {new Date(report.created_at).toLocaleString()} · {report.model}
              {report.is_mock && <span className="mock-pill">template mode</span>}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <button className="picker-clear" onClick={download} type="button">Download .md</button>
            <button className="modal-close" onClick={onClose} type="button" aria-label="Close">×</button>
          </div>
        </div>
        <div className="report-body" dangerouslySetInnerHTML={{ __html: html }} />
      </div>
    </div>
  )
}

import { useState, useRef } from 'react'

// Does a dropped file satisfy an <input accept="..."> string? Mirrors how the
// native picker filters: ".pdf" extensions, "image/*" wildcards, exact types.
function matchesAccept(file, accept) {
  if (!accept) return true
  const name = file.name.toLowerCase()
  const type = (file.type || '').toLowerCase()
  return accept.split(',').map(t => t.trim().toLowerCase()).filter(Boolean).some(t => {
    if (t.startsWith('.')) return name.endsWith(t)
    if (t.endsWith('/*')) return type.startsWith(t.slice(0, -1))
    return type === t
  })
}

function hasFiles(e) {
  return Array.from(e.dataTransfer?.types || []).includes('Files')
}

// Drag-and-drop for anywhere a file is asked for. Spread `dropProps` on the
// element that should accept the drop; `dragging` is true while a file is held
// over it (for a highlight). Files that don't match `accept` are ignored, the
// same as they'd be in the file picker. Dragging text/links around the page
// never triggers it — only real files do.
export function useFileDrop({ onFiles, accept, multiple = false, disabled = false }) {
  const [dragging, setDragging] = useState(false)
  const depth = useRef(0) // dragenter/leave fire for every child element

  if (disabled) return { dragging: false, dropProps: {} }

  const dropProps = {
    onDragEnter: e => {
      if (!hasFiles(e)) return
      e.preventDefault()
      depth.current += 1
      setDragging(true)
    },
    onDragOver: e => {
      if (!hasFiles(e)) return
      e.preventDefault()
      e.dataTransfer.dropEffect = 'copy'
    },
    onDragLeave: e => {
      if (!hasFiles(e)) return
      depth.current = Math.max(0, depth.current - 1)
      if (depth.current === 0) setDragging(false)
    },
    onDrop: e => {
      if (!hasFiles(e)) return
      e.preventDefault()
      depth.current = 0
      setDragging(false)
      const files = Array.from(e.dataTransfer.files).filter(f => matchesAccept(f, accept))
      if (files.length === 0) return
      onFiles(multiple ? files : files.slice(0, 1))
    },
  }
  return { dragging, dropProps }
}

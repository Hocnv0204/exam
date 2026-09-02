/**
 * PDF Viewer Component using Mozilla PDF.js
 * Strictly isolated scaling + Touch Scrolling + Page Jump + Fullscreen + Rotation.
 * Mounts control bar directly into header next to action buttons!
 */

let pdfjsLoaded = false

async function loadPdfJs() {
  if (pdfjsLoaded && window.pdfjsLib) return window.pdfjsLib

  return new Promise((resolve, reject) => {
    if (window.pdfjsLib) {
      pdfjsLoaded = true
      return resolve(window.pdfjsLib)
    }

    const script = document.createElement('script')
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js'
    script.onload = () => {
      window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js'
      pdfjsLoaded = true
      resolve(window.pdfjsLib)
    }
    script.onerror = () => {
      reject(new Error('Failed to load PDF.js script'))
    }
    document.head.appendChild(script)
  })
}

export async function renderPdfViewer(containerElement, pdfUrl) {
  if (!containerElement || !pdfUrl) return

  containerElement.innerHTML = `
    <div style="display:flex; flex-direction:column; align-items:center; justify-content:center; width:100%; height:100%; min-height:250px; padding:30px; color:#64748b; background:#f8fafc; box-sizing:border-box;">
      <i class="fa-solid fa-spinner fa-spin" style="font-size:32px; color:#0066cc; margin-bottom:12px;"></i>
      <span style="font-size:13px; font-weight:600; color:#334155;">Đang tải và dựng file PDF đề bài...</span>
    </div>
  `

  try {
    const pdfjs = await loadPdfJs()
    const loadingTask = pdfjs.getDocument(pdfUrl)
    const pdf = await loadingTask.promise

    containerElement.innerHTML = ''
    containerElement.style.position = 'relative'

    let currentZoomScale = 1.0
    let currentRotation = 0
    let currentPageNum = 1
    const totalPages = pdf.numPages
    const pagesData = []

    // Look for parent/sibling .pdf-toolbar to place controls in header
    let headerToolbar = containerElement.closest('.pdf-viewer-container')?.querySelector('.pdf-toolbar') ||
                        (containerElement.previousElementSibling?.classList?.contains('pdf-toolbar') ? containerElement.previousElementSibling : null)

    let controlsTarget = null

    if (headerToolbar) {
      let slot = headerToolbar.querySelector('.pdf-controls-slot')
      if (!slot) {
        slot = document.createElement('div')
        slot.className = 'pdf-controls-slot'
        slot.style.cssText = 'display:flex; align-items:center; gap:8px;'

        const actionArea = headerToolbar.querySelector('div:last-child')
        if (actionArea && actionArea !== headerToolbar.firstElementChild) {
          actionArea.insertBefore(slot, actionArea.firstChild)
        } else {
          headerToolbar.appendChild(slot)
        }
      }
      slot.innerHTML = ''
      controlsTarget = slot
    }

    // Outer container wrapper (Strictly isolated viewport)
    const outerContainer = document.createElement('div')
    outerContainer.className = 'pdf-viewer-outer-bounds'
    outerContainer.style.cssText = `
      width: 100% !important;
      height: 100% !important;
      min-width: 0 !important;
      max-width: 100% !important;
      display: flex;
      flex-direction: column;
      position: relative;
      overflow: hidden !important;
      background: #334155;
      border-radius: 10px;
      box-sizing: border-box;
    `

    // Toolbar HTML string
    const toolbarHTML = `
      <div class="pdf-utility-bar" style="display:flex; align-items:center; gap:6px; background:#f1f5f9; border:1px solid #cbd5e1; padding:3px 10px; border-radius:8px; color:#1e293b; user-select:none; font-size:13px;">
        <!-- Page Nav -->
        <div style="display:flex; align-items:center; gap:2px;">
          <button id="pdf-prev-page" type="button" style="background:none; border:none; color:#475569; font-size:12px; cursor:pointer; padding:3px 5px; border-radius:4px; display:flex; align-items:center;" title="Trang trước">
            <i class="fa-solid fa-chevron-left"></i>
          </button>
          <span id="pdf-page-indicator" style="font-size:12px; font-weight:700; font-family:monospace; min-width:40px; text-align:center; color:#0f172a;">1 / ${totalPages}</span>
          <button id="pdf-next-page" type="button" style="background:none; border:none; color:#475569; font-size:12px; cursor:pointer; padding:3px 5px; border-radius:4px; display:flex; align-items:center;" title="Trang sau">
            <i class="fa-solid fa-chevron-right"></i>
          </button>
        </div>

        <div style="width:1px; height:14px; background:#cbd5e1; margin:0 2px;"></div>

        <!-- Zoom Controls -->
        <div style="display:flex; align-items:center; gap:2px;">
          <button id="pdf-zoom-out" type="button" style="background:none; border:none; color:#475569; font-size:13px; cursor:pointer; padding:3px 5px; border-radius:4px; display:flex; align-items:center;" title="Thu nhỏ (-20%)">
            <i class="fa-solid fa-magnifying-glass-minus"></i>
          </button>
          <span id="pdf-zoom-val" style="font-size:12px; font-weight:700; font-family:monospace; min-width:38px; text-align:center; color:#0f172a;">100%</span>
          <button id="pdf-zoom-in" type="button" style="background:none; border:none; color:#475569; font-size:13px; cursor:pointer; padding:3px 5px; border-radius:4px; display:flex; align-items:center;" title="Phóng to (+20%)">
            <i class="fa-solid fa-magnifying-glass-plus"></i>
          </button>
          <button id="pdf-zoom-reset" type="button" style="background:none; border:none; color:#64748b; font-size:11px; cursor:pointer; padding:3px 5px; font-weight:600;" title="Khôi phục kích thước vừa màn hình">
            <i class="fa-solid fa-rotate-left"></i> Rest
          </button>
        </div>

        <div style="width:1px; height:14px; background:#cbd5e1; margin:0 2px;"></div>

        <!-- Rotation & Fullscreen -->
        <div style="display:flex; align-items:center; gap:2px;">
          <button id="pdf-rotate" type="button" style="background:none; border:none; color:#475569; font-size:12px; cursor:pointer; padding:3px 5px; border-radius:4px; display:flex; align-items:center;" title="Xoay trang 90°">
            <i class="fa-solid fa-rotate-right"></i>
          </button>
          <button id="pdf-fullscreen" type="button" style="background:none; border:none; color:#475569; font-size:12px; cursor:pointer; padding:3px 5px; border-radius:4px; display:flex; align-items:center;" title="Xem toàn màn hình">
            <i class="fa-solid fa-expand" id="pdf-fullscreen-icon"></i>
          </button>
        </div>
      </div>
    `

    let toolbarElem = null
    if (controlsTarget) {
      controlsTarget.innerHTML = toolbarHTML
      toolbarElem = controlsTarget.firstElementChild
    } else {
      const topBar = document.createElement('div')
      topBar.style.cssText = 'position:absolute; top:10px; right:12px; z-index:40;'
      topBar.innerHTML = toolbarHTML
      outerContainer.appendChild(topBar)
      toolbarElem = topBar.firstElementChild
    }

    // Scroll wrapper for PDF pages
    const wrapper = document.createElement('div')
    wrapper.className = 'pdf-pages-scroll-wrapper'
    wrapper.style.cssText = `
      width: 100% !important;
      height: 100% !important;
      min-width: 0 !important;
      max-width: 100% !important;
      overflow-y: auto !important;
      overflow-x: auto !important;
      -webkit-overflow-scrolling: touch !important;
      touch-action: pan-x pan-y !important;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 16px;
      padding: ${controlsTarget ? '16px' : '48px 16px 16px 16px'};
      box-sizing: border-box;
      background: #475569;
    `

    outerContainer.appendChild(wrapper)
    containerElement.appendChild(outerContainer)

    const updateDisplayState = () => {
      const zoomValSpan = toolbarElem?.querySelector('#pdf-zoom-val')
      if (zoomValSpan) zoomValSpan.textContent = `${Math.round(currentZoomScale * 100)}%`

      pagesData.forEach(({ canvas, baseWidth }) => {
        const scaledWidth = baseWidth * currentZoomScale
        canvas.style.width = `${scaledWidth}px`
        canvas.style.transform = `rotate(${currentRotation}deg)`
        if (currentZoomScale > 1.0) {
          canvas.style.maxWidth = 'none'
        } else {
          canvas.style.maxWidth = '100%'
        }
      })
    }

    // Render each PDF page canvas
    for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
      const page = await pdf.getPage(pageNum)
      const containerWidth = Math.max(containerElement.clientWidth - 32, 280)
      const unscaledViewport = page.getViewport({ scale: 1.0 })
      const fitScale = containerWidth > 0 ? (containerWidth / unscaledViewport.width) : 1.2

      // High resolution render scale for crisp text when zooming up to 300%
      const renderScale = Math.max(fitScale, 1.2) * 1.5
      const viewport = page.getViewport({ scale: renderScale })

      const pageContainer = document.createElement('div')
      pageContainer.className = 'pdf-page-item'
      pageContainer.setAttribute('data-page-num', pageNum)
      pageContainer.style.cssText = `
        display: flex;
        justify-content: center;
        align-items: center;
        width: auto;
        min-width: 100%;
        box-sizing: border-box;
      `

      const canvas = document.createElement('canvas')
      canvas.className = 'pdf-page-canvas'

      const baseWidth = (viewport.width / 1.5)
      canvas.style.cssText = `
        width: ${baseWidth}px;
        max-width: 100%;
        height: auto;
        box-shadow: 0 6px 18px rgba(0,0,0,0.35);
        border-radius: 4px;
        background: #ffffff;
        transition: width 0.15s ease, transform 0.2s ease;
      `

      const context = canvas.getContext('2d')
      canvas.height = viewport.height
      canvas.width = viewport.width

      pageContainer.appendChild(canvas)
      wrapper.appendChild(pageContainer)
      pagesData.push({ canvas, baseWidth, pageContainer })

      await page.render({
        canvasContext: context,
        viewport: viewport
      }).promise
    }

    // Real-time Scroll Page Tracker
    wrapper.addEventListener('scroll', () => {
      const wrapperRect = wrapper.getBoundingClientRect()
      for (const item of pagesData) {
        const rect = item.pageContainer.getBoundingClientRect()
        if (rect.top <= wrapperRect.top + 150 && rect.bottom >= wrapperRect.top + 50) {
          const pageNum = parseInt(item.pageContainer.getAttribute('data-page-num'), 10)
          if (pageNum !== currentPageNum) {
            currentPageNum = pageNum
            const indicator = toolbarElem?.querySelector('#pdf-page-indicator')
            if (indicator) indicator.textContent = `${currentPageNum} / ${totalPages}`
          }
          break
        }
      }
    })

    // Attach Event Listeners
    toolbarElem?.querySelector('#pdf-zoom-in')?.addEventListener('click', (e) => {
      e.stopPropagation()
      if (currentZoomScale < 3.0) {
        currentZoomScale = Math.min(3.0, +(currentZoomScale + 0.2).toFixed(2))
        updateDisplayState()
      }
    })

    toolbarElem?.querySelector('#pdf-zoom-out')?.addEventListener('click', (e) => {
      e.stopPropagation()
      if (currentZoomScale > 0.5) {
        currentZoomScale = Math.max(0.5, +(currentZoomScale - 0.2).toFixed(2))
        updateDisplayState()
      }
    })

    toolbarElem?.querySelector('#pdf-zoom-reset')?.addEventListener('click', (e) => {
      e.stopPropagation()
      currentZoomScale = 1.0
      updateDisplayState()
    })

    toolbarElem?.querySelector('#pdf-rotate')?.addEventListener('click', (e) => {
      e.stopPropagation()
      currentRotation = (currentRotation + 90) % 360
      updateDisplayState()
    })

    toolbarElem?.querySelector('#pdf-prev-page')?.addEventListener('click', (e) => {
      e.stopPropagation()
      if (currentPageNum > 1) {
        currentPageNum--
        pagesData[currentPageNum - 1]?.pageContainer.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }
    })

    toolbarElem?.querySelector('#pdf-next-page')?.addEventListener('click', (e) => {
      e.stopPropagation()
      if (currentPageNum < totalPages) {
        currentPageNum++
        pagesData[currentPageNum - 1]?.pageContainer.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }
    })

    let isFullscreen = false
    toolbarElem?.querySelector('#pdf-fullscreen')?.addEventListener('click', (e) => {
      e.stopPropagation()
      isFullscreen = !isFullscreen
      const icon = toolbarElem.querySelector('#pdf-fullscreen-icon')

      if (isFullscreen) {
        outerContainer.style.cssText = `
          position: fixed !important;
          top: 0 !important;
          left: 0 !important;
          width: 100vw !important;
          height: 100vh !important;
          z-index: 999999 !important;
          border-radius: 0 !important;
          background: #1e293b;
        `
        if (icon) icon.className = 'fa-solid fa-compress'
      } else {
        outerContainer.style.cssText = `
          width: 100% !important;
          height: 100% !important;
          min-width: 0 !important;
          max-width: 100% !important;
          display: flex;
          flex-direction: column;
          position: relative;
          overflow: hidden !important;
          background: #334155;
          border-radius: 10px;
          box-sizing: border-box;
        `
        if (icon) icon.className = 'fa-solid fa-expand'
      }
    })

  } catch (err) {
    console.warn('PDF.js rendering error, fallback to iframe:', err)
    containerElement.innerHTML = `
      <iframe src="${pdfUrl}" style="width:100%; height:100%; border:none; background:#f8fafc; -webkit-overflow-scrolling:touch;"></iframe>
    `
  }
}

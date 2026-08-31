/**
 * PDF Viewer Component using Mozilla PDF.js
 * Solves real iPad / Mobile Safari / Android Chrome iframe PDF touch scrolling issues.
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

    // Create scroll wrapper
    const wrapper = document.createElement('div')
    wrapper.className = 'pdf-pages-scroll-wrapper'
    wrapper.style.cssText = `
      width: 100%;
      height: 100%;
      overflow-y: auto;
      overflow-x: auto;
      -webkit-overflow-scrolling: touch;
      touch-action: pan-x pan-y;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 16px;
      padding: 16px;
      background: #525659;
      box-sizing: border-box;
    `

    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
      const page = await pdf.getPage(pageNum)

      // Calculate scale to fit container width nicely
      const containerWidth = Math.max(containerElement.clientWidth - 32, 280)
      const unscaledViewport = page.getViewport({ scale: 1.0 })
      const scale = containerWidth > 0 ? (containerWidth / unscaledViewport.width) : 1.2
      const viewport = page.getViewport({ scale: Math.max(scale, 1.0) })

      const canvas = document.createElement('canvas')
      canvas.className = 'pdf-page-canvas'
      canvas.style.cssText = `
        max-width: 100%;
        height: auto;
        box-shadow: 0 4px 14px rgba(0,0,0,0.3);
        border-radius: 4px;
        background: #ffffff;
      `

      const context = canvas.getContext('2d')
      canvas.height = viewport.height
      canvas.width = viewport.width

      wrapper.appendChild(canvas)

      await page.render({
        canvasContext: context,
        viewport: viewport
      }).promise
    }

    containerElement.appendChild(wrapper)
  } catch (err) {
    console.warn('PDF.js rendering error, fallback to iframe:', err)
    containerElement.innerHTML = `
      <iframe src="${pdfUrl}" style="width:100%; height:100%; border:none; background:#f8fafc; -webkit-overflow-scrolling:touch;"></iframe>
    `
  }
}

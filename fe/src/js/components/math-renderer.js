/**
 * Math & Chemistry Renderer Component (KaTeX + mhchem)
 */

let katexReadyPromise = null

export function ensureKatexLoaded() {
  if (window.katex && window.renderMathInElement) {
    return Promise.resolve()
  }

  if (katexReadyPromise) return katexReadyPromise

  katexReadyPromise = new Promise((resolve) => {
    const checkInterval = setInterval(() => {
      if (window.katex && window.renderMathInElement) {
        clearInterval(checkInterval)
        resolve()
      }
    }, 50)

    // Timeout fallback after 4 seconds
    setTimeout(() => {
      clearInterval(checkInterval)
      resolve()
    }, 4000)
  })

  return katexReadyPromise
}

/**
 * Render toàn bộ công thức Toán học ($...$) và Hóa học (\ce{...}) trong một phần tử DOM
 * @param {HTMLElement} element 
 */
export async function renderMath(element) {
  if (!element) return

  await ensureKatexLoaded()

  if (!window.renderMathInElement) {
    console.warn('[MathRenderer] KaTeX renderMathInElement not ready.')
    return
  }

  // Pre-process: Tự động bọc các biểu thức \ce{...} đứng độc lập ngoài dấu $
  // Ví dụ: \ce{CuSO4 <=> Cu+ + SO4^2-} -> $\ce{CuSO4 <=> Cu+ + SO4^2-}$
  // Duyệt qua các text node an toàn
  preprocessChemicalFormulas(element)

  try {
    window.renderMathInElement(element, {
      delimiters: [
        { left: '$$', right: '$$', display: true },
        { left: '$', right: '$', display: false },
        { left: '\\[', right: '\\]', display: true },
        { left: '\\(', right: '\\)', display: false }
      ],
      throwOnError: false,
      ignoredTags: ['script', 'noscript', 'style', 'textarea', 'pre', 'code']
    })
  } catch (err) {
    console.warn('[MathRenderer] Error rendering math in element:', err)
  }
}

/**
 * Đảm bảo mọi thẻ \ce{...} độc lập đều được bọc trong $...$ để KaTeX parse
 */
function preprocessChemicalFormulas(root) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null, false)
  const nodesToReplace = []

  let node
  while ((node = walker.nextNode())) {
    if (node.nodeValue && node.nodeValue.includes('\\ce{')) {
      // Kiểm tra xem có đang nằm ngoài dấu $ không
      nodesToReplace.push(node)
    }
  }

  nodesToReplace.forEach(textNode => {
    let val = textNode.nodeValue
    // Tìm các \ce{...} mà trước đó không có dấu $
    // Ví dụ \ce{...} mà không nằm trong $ \ce{...} $
    const replaced = val.replace(/(?<!\$)\\ce\{([^{}]+(?:\([^()]+\)[^{}]*)*)\}(?!\$)/g, '$\\ce{$1}$')
    if (replaced !== val) {
      textNode.nodeValue = replaced
    }
  })
}

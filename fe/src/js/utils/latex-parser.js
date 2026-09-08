/**
 * LaTeX Exam Parser Engine
 * Hỗ trợ bóc tách đề thi Toán & Hóa học:
 * - Macro: \Cau, \choice, \choiceTwo, \choiceFour, \choiceTF, \shortans, \begin{TrueFalseBox}, \ShortAnswerBox
 * - Phân tích ngoặc lồng nhau bằng thuật toán Balanced Brace Scanner
 * - Tự động trích xuất đáp án từ comment: % Câu X - Key: [A-D] hoặc % Key: [A-D] hoặc % Key: a-S, b-Đ...
 * - Nhận diện \True trong \choice và \choiceTF
 * - Chuyển đổi bảng xét dấu tkz-tab thành HTML Table
 * - Vẽ hình học TikZ (góc lượng giác, đường tròn lượng giác, vector) thành SVG vector trực tiếp
 * - Giữ nguyên \ce{...} (mhchem) và $...$ cho KaTeX
 * - Báo cáo lỗi chi tiết từng câu (Error Diagnostics)
 */

import { convertTikzToSvg } from './tikz-to-svg.js'

/**
 * Thuật toán Balanced Brace Scanner
 * Bóc tách chính xác N đối số dạng {...} ở cấp cao nhất, bỏ qua các ngoặc lồng nhau bên trong.
 * @param {string} text - Chuỗi nguồn
 * @param {number} startIndex - Vị trí bắt đầu tìm kiếm
 * @param {number} maxArgs - Số lượng đối số cần bóc tách
 * @returns {{ args: string[], nextIndex: number, error?: string }}
 */
export function extractBalancedArguments(text, startIndex, maxArgs = 4) {
  const args = []
  let i = startIndex
  const len = text.length

  while (args.length < maxArgs && i < len) {
    // Bỏ qua khoảng trắng và comment dòng nếu có
    while (i < len && /\s/.test(text[i])) {
      i++
    }

    if (i >= len) break

    // Nếu gặp comment % thì bỏ qua đến hết dòng
    if (text[i] === '%') {
      while (i < len && text[i] !== '\n') i++
      continue
    }

    if (text[i] !== '{') {
      // Không bắt đầu bằng dấu ngoặc nhọn
      break
    }

    // Bắt đầu 1 cặp ngoặc
    i++ // Bỏ qua '{'
    const argStart = i
    let depth = 1

    while (i < len && depth > 0) {
      const ch = text[i]

      // Xử lý ký tự escape như \{ hoặc \} hoặc \\
      if (ch === '\\') {
        i += 2 // Bỏ qua cả dấu gạch chéo và ký tự kế tiếp
        continue
      }

      if (ch === '{') {
        depth++
      } else if (ch === '}') {
        depth--
      }

      if (depth === 0) {
        // Đã đóng cặp ngoặc cấp cao nhất
        args.push(text.substring(argStart, i))
        i++ // Bỏ qua '}'
        break
      }

      i++
    }

    if (depth > 0) {
      return {
        args,
        nextIndex: i,
        error: `Thiếu dấu ngoặc nhọn đóng '}' tại vị trí ${i}`
      }
    }
  }

  return { args, nextIndex: i }
}

/**
 * Trích xuất bảng xét dấu tkz-tab thành bảng HTML
 * Hỗ trợ cú pháp \tkzTabInit + \tkzTabLine
 */
export function convertTkzTabToHtml(tikzBlock) {
  try {
    // Tìm \tkzTabInit
    const initMatch = tikzBlock.match(/\\tkzTabInit(?:\[[^\]]*\])?\s*\{([^}]+)\}\s*\{([^}]+)\}/)
    const lineMatch = tikzBlock.match(/\\tkzTabLine\s*\{([^}]+)\}/)

    if (!initMatch || !lineMatch) {
      return null // Không đúng cấu trúc bảng xét dấu đơn giản, dùng fallback
    }

    // Dòng 1: Tên các hàng (ví dụ: $x$ / 0.7, $f'(x)$ / 0.7)
    const rowHeaders = initMatch[1].split(',').map(s => {
      const p = s.split('/')
      return p[0].trim()
    })

    // Dòng 2: Các mốc giá trị của x (ví dụ: $-\infty$, $-1$, $2$, $+\infty$)
    const xValues = initMatch[2].split(',').map(s => s.trim())

    // Dòng 3: Dấu của f'(x) (ví dụ: , +, z, -, z, +, )
    const rawSigns = lineMatch[1].split(',').map(s => s.trim())

    // Xây dựng cấu trúc Table HTML hiện đại
    let html = '<div class="tkz-sign-table-wrapper" style="overflow-x: auto; margin: 12px 0;">'
    html += '<table class="tkz-sign-table" style="border-collapse: collapse; margin: 0 auto; min-width: 320px; text-align: center; border: 1.5px solid #cbd5e1; background: #ffffff;">'

    // Hàng x
    html += '<tr style="border-bottom: 1.5px solid #94a3b8;">'
    html += `<td class="tkz-header" style="padding: 6px 14px; font-weight: bold; background: #f8fafc; border-right: 2px solid #94a3b8; width: 60px;">${rowHeaders[0] || '$x$'}</td>`
    xValues.forEach(val => {
      html += `<td class="tkz-val" style="padding: 6px 16px; min-width: 50px;">${val}</td>`
    })
    html += '</tr>'

    // Hàng f'(x)
    html += '<tr>'
    html += `<td class="tkz-header" style="padding: 6px 14px; font-weight: bold; background: #f8fafc; border-right: 2px solid #94a3b8;">${rowHeaders[1] || "$f'(x)$"}</td>`

    // Đưa các dấu vào các ô tương ứng
    rawSigns.forEach(s => {
      const item = s.trim()
      if (item === '') {
        // Khoảng trống / mép
        html += '<td class="tkz-empty" style="padding: 6px 4px;"></td>'
      } else if (item === 'z' || item === '0') {
        // Điểm làm đạo hàm bằng 0
        html += '<td class="tkz-zero" style="padding: 6px 10px; font-weight: bold; color: #0284c7; border-left: 1px dashed #cbd5e1; border-right: 1px dashed #cbd5e1;">0</td>'
      } else if (item === 'd') {
        // Không xác định
        html += '<td class="tkz-double" style="padding: 6px 6px; border-left: 2px double #ef4444; border-right: 2px double #ef4444;"></td>'
      } else if (item === '+') {
        html += '<td class="tkz-plus" style="padding: 6px 12px; font-weight: bold; color: #16a34a; font-size: 16px;">+</td>'
      } else if (item === '-') {
        html += '<td class="tkz-minus" style="padding: 6px 12px; font-weight: bold; color: #dc2626; font-size: 16px;">−</td>'
      } else {
        html += `<td class="tkz-item" style="padding: 6px 10px;">${item}</td>`
      }
    })
    html += '</tr>'

    html += '</table></div>'
    return html
  } catch (e) {
    console.warn('[LaTeX Parser] Failed to parse tkz-tab:', e)
    return null
  }
}

/**
 * Xử lý làm sạch các macro LaTeX phụ trợ trong thân câu hỏi
 */
export function cleanLatexPrompt(text) {
  let cleaned = text

  // 1. Xóa các khung hình học trang trí in ấn của Phần III:
  // \begin{tikzpicture}[baseline=(box.base)] ... Đáp số ... \end{tikzpicture}
  cleaned = cleaned.replace(/\\begin\{tikzpicture\}(?:\[[^\]]*\])?[\s\S]*?(?:Đáp số|box\.base)[\s\S]*?\\end\{tikzpicture\}/gi, '')
  cleaned = cleaned.replace(/\\drawMinion\{[^}]*\}/g, '')
  cleaned = cleaned.replace(/\\minionQuestionIcon\{[^}]*\}/g, '')

  // 2. Chuyển đổi bảng xét dấu tkz-tab hoặc hình học TikZ
  cleaned = cleaned.replace(/\\begin\{tikzpicture\}[\s\S]*?\\end\{tikzpicture\}/g, (match) => {
    if (match.includes('\\tkzTabInit')) {
      const tableHtml = convertTkzTabToHtml(match)
      if (tableHtml) return tableHtml
    }

    const svg = convertTikzToSvg(match)
    if (svg) return svg

    // Fallback: Giữ nguyên trong thẻ code hoặc đánh dấu
    return `<div class="tikz-block-fallback" data-tikz="${encodeURIComponent(match)}"><em>[Đồ thị/Bảng xét dấu TikZ]</em></div>`
  })

  // 3. Xử lý \includegraphics
  cleaned = cleaned.replace(/\\includegraphics(?:\[[^\]]*\])?\{([^}]+)\}/g, (_, imgPath) => {
    const filename = imgPath.split('/').pop().trim()
    if (filename.toLowerCase().includes('minion')) {
      return ''
    }
    return `
<div class="latex-image-container" data-img-name="${filename}" style="text-align: center; margin: 12px 0;">
  <div class="latex-img-box" style="display: inline-block; padding: 10px 16px; background: #f8fafc; border: 1.5px dashed #cbd5e1; border-radius: 8px; max-width: 100%;">
    <div style="display: flex; align-items: center; justify-content: center; gap: 8px; color: #475569; font-size: 13px; font-weight: 500;">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/></svg>
      <span>Hình ảnh đính kèm: <strong>${filename}</strong></span>
    </div>
    <img src="${filename}" alt="${filename}" style="max-width: 100%; max-height: 280px; object-fit: contain; margin-top: 8px; border-radius: 6px; display: block;" onerror="this.style.display='none';" />
  </div>
</div>`
  })

  // Hỗ trợ thẻ giữ chỗ tiếng Việt nhanh: [HÌNH], [HINH], [HÌNH 1], [HÌNH: ten_anh.png]
  cleaned = cleaned.replace(/\[H[IÌ]NH(?:[_\s:]*([a-zA-Z0-9_.-]+))?\]/gi, (_, name) => {
    const fn = name ? name.trim() : 'hinh_ve.png'
    return `
<div class="latex-image-container" data-img-name="${fn}" style="text-align: center; margin: 12px 0;">
  <div class="latex-img-box" style="display: inline-block; padding: 10px 16px; background: #f0f9ff; border: 1.5px dashed #0284c7; border-radius: 8px; max-width: 100%;">
    <div style="display: flex; align-items: center; justify-content: center; gap: 8px; color: #0369a1; font-size: 13px; font-weight: 600;">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/></svg>
      <span>Vị trí hình ảnh: <strong>${fn}</strong></span>
    </div>
  </div>
</div>`
  })

  // 4. Chuyển đổi \begin{center} ... \end{center}
  cleaned = cleaned.replace(/\\begin\{center\}([\s\S]*?)\\end\{center\}/g, '<div style="text-align:center; margin: 10px 0;">$1</div>')

  // 5. Chuyển đổi \begin{enumerate}[label=(\arabic*)] ... \end{enumerate}
  cleaned = cleaned.replace(/\\begin\{enumerate\}(?:\[[^\]]*\])?([\s\S]*?)\\end\{enumerate\}/g, (_, inner) => {
    const items = inner.split('\\item').filter(s => s.trim().length > 0)
    let listHtml = '<ol class="enumerate-list" style="margin: 8px 0 8px 24px; padding: 0;">'
    items.forEach(it => {
      listHtml += `<li style="margin-bottom: 4px;">${it.trim()}</li>`
    })
    listHtml += '</ol>'
    return listHtml
  })

  // 6. Định dạng văn bản phổ biến & dọn dẹp các lệnh layout in ấn
  cleaned = cleaned.replace(/\\textbf\{([^}]+)\}/g, '<strong>$1</strong>')
  cleaned = cleaned.replace(/\\textit\{([^}]+)\}/g, '<em>$1</em>')
  cleaned = cleaned.replace(/\\underline\{([^}]+)\}/g, '<u>$1</u>')
  cleaned = cleaned.replace(/\\par\b/g, '<br>')
  cleaned = cleaned.replace(/\\hfill\b/g, '')
  cleaned = cleaned.replace(/\\newpage\b/g, '')
  cleaned = cleaned.replace(/\\vspace\{[^}]+\}/g, '')
  cleaned = cleaned.replace(/\\hspace\{[^}]+\}/g, '')
  cleaned = cleaned.replace(/\\stepcounter\{[^}]+\}/g, '')
  cleaned = cleaned.replace(/\\noindent\b/g, '')

  return cleaned.trim()
}

/**
 * Trích xuất comment đáp án trắc nghiệm ABCD dạng:
 * % Câu 1 - Key: A
 * % Câu 1 (Phần I) - Key: A
 * % Key: A
 * % Câu 1: A
 */
export function extractCommentKey(text) {
  if (!text) return null
  const m = text.match(/%\s*(?:C[aâ]u\s*\d+(?:\s*\([^)]*\))?\s*[-:]\s*)?Key:\s*([A-D])\b/i) ||
            text.match(/%\s*Đáp\s*án\s*[-:]\s*([A-D])\b/i) ||
            text.match(/%\s*C[aâ]u\s*\d+(?:\s*\([^)]*\))?\s*[-:]\s*([A-D])\b/i)
  return m ? m[1].toUpperCase() : null
}

/**
 * Trích xuất comment đáp án Đúng/Sai dạng:
 * % Câu 1 (Phần II) - Key: a-S, b-Đ, c-S, d-Đ
 * % Câu 1 - Key: aD bS cD dS hoặc % Key: DDSD hoặc % Key: TTFT
 */
export function extractCommentTfKeys(text) {
  if (!text) return null
  
  // Dạng a-S, b-Đ, c-S, d-Đ hoặc aD bS cD dS hoặc a:Đ b:S c:Đ d:S
  const matchDetailed = text.match(/%\s*(?:C[aâ]u\s*\d+(?:\s*\([^)]*\))?\s*[-:]\s*)?Key:\s*a[-:\s]*([ĐDSTF01])[\s,;]*b[-:\s]*([ĐDSTF01])[\s,;]*c[-:\s]*([ĐDSTF01])[\s,;]*d[-:\s]*([ĐDSTF01])/i)
  if (matchDetailed) {
    const isTrue = (char) => ['D', 'Đ', 'T', '1'].includes(char.toUpperCase())
    return {
      a: isTrue(matchDetailed[1]),
      b: isTrue(matchDetailed[2]),
      c: isTrue(matchDetailed[3]),
      d: isTrue(matchDetailed[4])
    }
  }

  // Dạng 4 ký tự liền nhau: DDSD, TTFT, DSDD
  const matchCompact = text.match(/%\s*(?:C[aâ]u\s*\d+(?:\s*\([^)]*\))?\s*[-:]\s*)?Key:\s*([ĐDSTF01]{4})/i)
  if (matchCompact) {
    const chars = matchCompact[1].split('')
    const isTrue = (char) => ['D', 'Đ', 'T', '1'].includes(char.toUpperCase())
    return {
      a: isTrue(chars[0]),
      b: isTrue(chars[1]),
      c: isTrue(chars[2]),
      d: isTrue(chars[3])
    }
  }

  return null
}

/**
 * Trích xuất comment đáp án trả lời ngắn dạng:
 * % Câu 1 (Phần III) - Key: 3.1
 * % Câu 5 (Phần III) - Key: 753
 * % Câu 6 (Phần III) - Key: 127.5
 */
export function extractCommentSaKey(text) {
  if (!text) return null
  const m = text.match(/%\s*(?:C[aâ]u\s*\d+(?:\s*\([^)]*\))?\s*[-:]\s*)?Key:\s*([^\n\r]+)/i)
  if (m) {
    const val = m[1].trim()
    // Nếu là key trắc nghiệm (A, B, C, D) đơn lẻ thì bỏ qua cho extractCommentKey
    // Nếu là dạng a-S, b-Đ thì bỏ qua cho extractCommentTfKeys
    if (/^[A-D]$/i.test(val) || /^a[-:\s]/i.test(val) || /^[ĐDSTF01]{4}$/i.test(val)) {
      return null
    }
    return val
  }
  return null
}

/**
 * Phân tích chuỗi đáp án nhập nhanh (ví dụ: "1A 2B 3C" hoặc "1.A 2.B" hoặc "1A2B3C")
 */
export function parseAnswerKeyString(inputStr) {
  const result = {}
  if (!inputStr) return result

  const clean = inputStr.trim().toUpperCase()

  // 1. Dạng có số câu: 1A 2B 3C... hoặc 1.A 2.B hoặc 1:A 2:B hoặc 1-A
  const regexWithNumber = /(\d+)[\s.:\-_=]*([A-D])/g
  let match
  let countFound = 0
  while ((match = regexWithNumber.exec(clean)) !== null) {
    const qNum = parseInt(match[1], 10)
    const ans = match[2]
    result[qNum] = ans
    countFound++
  }

  if (countFound > 0) return result

  // 2. Dạng chuỗi ký tự ABCD liên tiếp: ABCDABCD -> 1A 2B 3C 4D...
  const onlyLetters = clean.replace(/[^A-D]/g, '')
  if (onlyLetters.length > 0) {
    for (let i = 0; i < onlyLetters.length; i++) {
      result[i + 1] = onlyLetters[i]
    }
  }

  return result
}

/**
 * Hàm phân tích toàn bộ file mã nguồn LaTeX đề thi
 * @param {string} latexSource - Chuỗi mã nguồn .tex
 * @returns {{
 *   success: boolean,
 *   title: string,
 *   subtitle: string,
 *   questions: Array<{
 *     questionNumber: number,
 *     questionType: 'MULTIPLE_CHOICE' | 'TRUE_FALSE' | 'SHORT_ANSWER',
 *     partTitle: string | null,
 *     content: string,
 *     options?: Array<{ key: string, content: string }>,
 *     statements?: Array<{ key: string, content: string }>,
 *     mcAnswer?: string | null,
 *     tfAnswers?: { a: boolean, b: boolean, c: boolean, d: boolean },
 *     saAnswer?: string | null,
 *     explanation?: string | null
 *   }>,
 *   errors: Array<{ questionNumber: number, rawTextSnippet: string, reason: string }>
 * }}
 */
/**
 * Bóc tách một khối câu hỏi đơn lẻ từ mã LaTeX
 * @param {string} questionBlock - Chuỗi mã nguồn của 1 câu
 * @param {number} questionNumber - Số thứ tự câu
 * @param {string|null} currentPartTitle - Tiêu đề phần hiện tại
 * @returns {{ question: object, error: string | null, partTitle: string | null }}
 */
export function parseSingleQuestionBlock(questionBlock, questionNumber = 1, currentPartTitle = null) {
  let error = null
  let partTitle = currentPartTitle

  // Kiểm tra xem có \PartHeader ở trước hoặc trong khối câu này không
  const partMatch = questionBlock.match(/\\PartHeader\s*\{([^}]+)\}\s*\{([^}]+)\}/)
  if (partMatch) {
    partTitle = `${partMatch[1].trim()}. ${partMatch[2].trim()}`
  }

  // 1. Tìm comment đáp án nằm ngay trong khối câu hỏi này
  const commentKey = extractCommentKey(questionBlock)
  const commentTfKeys = extractCommentTfKeys(questionBlock)
  const commentSaKey = extractCommentSaKey(questionBlock)

  // Phát hiện yêu cầu hình ảnh trong câu hỏi (\includegraphics hoặc [HÌNH])
  const imgMatch = questionBlock.match(/\\includegraphics(?:\[[^\]]*\])?\{([^}]+)\}/) || questionBlock.match(/\[H[IÌ]NH(?:[_\s:]*([a-zA-Z0-9_.-]+))?\]/i)
  let detectedImageName = null
  if (imgMatch) {
    const fn = imgMatch[1] ? imgMatch[1].split('/').pop().trim() : 'hinh_ve.png'
    if (!fn.toLowerCase().includes('minion')) {
      detectedImageName = fn
    }
  }

  // 2. Xác định dạng câu hỏi và bóc tách
  const choiceMatch = questionBlock.match(/\\(choice|choiceTwo|choiceFour)\b/)
  const choiceTfMatch = questionBlock.match(/\\choiceTF\b/)
  const tfBoxMatch = questionBlock.match(/\\begin\{TrueFalseBox\}/)
  const shortAnsMatch = questionBlock.match(/\\shortans\b/)
  const saBoxMatch = questionBlock.match(/\\ShortAnswerBox\b/)

  let question = null

  if (choiceMatch) {
    // DẠNG 1: TRẮC NGHIỆM ABCD
    const choiceCmd = choiceMatch[0]
    const choicePos = questionBlock.indexOf(choiceCmd)
    const promptRaw = questionBlock.substring(0, choicePos)
    const afterChoice = questionBlock.substring(choicePos + choiceCmd.length)

    // Dùng Balanced Brace Scanner để lấy đúng 4 đối số
    const extracted = extractBalancedArguments(afterChoice, 0, 4)
    if (extracted.args.length < 4) {
      error = `Câu ${questionNumber}: Lệnh ${choiceCmd} chỉ bóc tách được ${extracted.args.length}/4 phương án. ${extracted.error || ''}`
    }

    let detectedAnswer = commentKey
    const options = []
    const keys = ['A', 'B', 'C', 'D']

    extracted.args.forEach((argRaw, i) => {
      let content = argRaw.trim()
      const key = keys[i] || 'A'

      // Kiểm tra xem có \True không
      if (content.includes('\\True')) {
        detectedAnswer = key
        content = content.replace(/\\True\b/g, '').trim()
      }

      options.push({ key, content })
    })

    // Làm sạch prompt câu hỏi
    let cleanPrompt = promptRaw
      .replace(/%\s*C[aâ]u[^\n]*\n?/gi, '')
      .replace(/\\Cau\b/g, '')
      .replace(/\\PartHeader\{[^}]+\}\{[^}]+\}/g, '')

    cleanPrompt = cleanLatexPrompt(cleanPrompt)

    question = {
      questionNumber,
      questionType: 'MULTIPLE_CHOICE',
      partTitle,
      content: cleanPrompt,
      options,
      mcAnswer: detectedAnswer || null,
      imageName: detectedImageName,
      explanation: null,
      rawBlock: questionBlock,
      parseError: error
    }
  } else if (choiceTfMatch) {
    // DẠNG 2A: ĐÚNG / SAI 4 Ý (\choiceTF)
    const choicePos = questionBlock.indexOf('\\choiceTF')
    const promptRaw = questionBlock.substring(0, choicePos)
    const afterChoice = questionBlock.substring(choicePos + '\\choiceTF'.length)

    const extracted = extractBalancedArguments(afterChoice, 0, 4)
    if (extracted.args.length < 4) {
      error = `Câu ${questionNumber}: Lệnh \\choiceTF chỉ bóc tách được ${extracted.args.length}/4 mệnh đề.`
    }

    const statements = []
    const tfAnswers = commentTfKeys || { a: false, b: false, c: false, d: false }
    const tfKeys = ['a', 'b', 'c', 'd']

    extracted.args.forEach((argRaw, i) => {
      let content = argRaw.trim()
      const k = tfKeys[i] || 'a'

      if (content.includes('\\True')) {
        tfAnswers[k] = true
        content = content.replace(/\\True\b/g, '').trim()
      }

      statements.push({ key: k, content })
    })

    let cleanPrompt = promptRaw
      .replace(/%\s*C[aâ]u[^\n]*\n?/gi, '')
      .replace(/\\Cau\b/g, '')
      .replace(/\\PartHeader\{[^}]+\}\{[^}]+\}/g, '')

    cleanPrompt = cleanLatexPrompt(cleanPrompt)

    question = {
      questionNumber,
      questionType: 'TRUE_FALSE',
      partTitle,
      content: cleanPrompt,
      statements,
      tfAnswers,
      imageName: detectedImageName,
      explanation: null,
      rawBlock: questionBlock,
      parseError: error
    }
  } else if (tfBoxMatch) {
    // DẠNG 2B: ĐÚNG / SAI dạng \begin{TrueFalseBox}{...} \tfStatement{...} \end{TrueFalseBox}
    const tfBoxPos = questionBlock.indexOf('\\begin{TrueFalseBox}')
    const afterBoxStart = questionBlock.substring(tfBoxPos + '\\begin{TrueFalseBox}'.length)
    const promptExtract = extractBalancedArguments(afterBoxStart, 0, 1)
    const rawPrompt = promptExtract.args[0] || ''
    const remainder = afterBoxStart.substring(promptExtract.nextIndex)

    const statements = []
    const tfAnswers = commentTfKeys || { a: false, b: false, c: false, d: false }
    const tfKeys = ['a', 'b', 'c', 'd']

    let stmIdx = 0
    let searchPos = 0
    while (stmIdx < 4) {
      const sPos = remainder.indexOf('\\tfStatement', searchPos)
      if (sPos === -1) break
      const afterCmd = remainder.substring(sPos + '\\tfStatement'.length)
      const stmExtract = extractBalancedArguments(afterCmd, 0, 1)
      if (stmExtract.args.length > 0) {
        let stmContent = stmExtract.args[0].trim()
        const k = tfKeys[stmIdx] || 'a'
        if (stmContent.includes('\\True')) {
          tfAnswers[k] = true
          stmContent = stmContent.replace(/\\True\b/g, '').trim()
        }
        stmContent = stmContent.replace(/^[a-d]\s*[\)\.:]\s*/i, '').trim()
        statements.push({ key: k, content: cleanLatexPrompt(stmContent) })
        stmIdx++
        searchPos = sPos + '\\tfStatement'.length + stmExtract.nextIndex
      } else {
        break
      }
    }

    let cleanPrompt = cleanLatexPrompt(rawPrompt)

    question = {
      questionNumber,
      questionType: 'TRUE_FALSE',
      partTitle,
      content: cleanPrompt,
      statements,
      tfAnswers,
      imageName: detectedImageName,
      explanation: null,
      rawBlock: questionBlock,
      parseError: error
    }
  } else if (saBoxMatch) {
    // DẠNG 3A: TRẢ LỜI NGẮN (\ShortAnswerBox{...})
    const saPos = questionBlock.indexOf('\\ShortAnswerBox')
    const afterSa = questionBlock.substring(saPos + '\\ShortAnswerBox'.length)
    const extracted = extractBalancedArguments(afterSa, 0, 1)
    const rawPrompt = extracted.args[0] || ''
    let cleanPrompt = cleanLatexPrompt(rawPrompt)

    question = {
      questionNumber,
      questionType: 'SHORT_ANSWER',
      partTitle,
      content: cleanPrompt,
      saAnswer: commentSaKey || null,
      imageName: detectedImageName,
      explanation: null,
      rawBlock: questionBlock,
      parseError: error
    }
  } else if (shortAnsMatch) {
    // DẠNG 3B: TRẢ LỜI NGẮN (\shortans{...})
    const saPos = questionBlock.indexOf('\\shortans')
    const promptRaw = questionBlock.substring(0, saPos)
    const afterSa = questionBlock.substring(saPos + '\\shortans'.length)

    const extracted = extractBalancedArguments(afterSa, 0, 1)
    const saAnswer = extracted.args[0] ? extracted.args[0].trim() : (commentSaKey || null)

    let cleanPrompt = promptRaw
      .replace(/%\s*C[aâ]u[^\n]*\n?/gi, '')
      .replace(/\\Cau\b/g, '')
      .replace(/\\PartHeader\{[^}]+\}\{[^}]+\}/g, '')

    cleanPrompt = cleanLatexPrompt(cleanPrompt)

    question = {
      questionNumber,
      questionType: 'SHORT_ANSWER',
      partTitle,
      content: cleanPrompt,
      saAnswer,
      imageName: detectedImageName,
      explanation: null,
      rawBlock: questionBlock,
      parseError: error
    }
  } else {
    // Fallback: Kiểm tra xem có các ký hiệu A. B. C. D. thủ công không
    const manualOpts = questionBlock.match(/[A-D]\.\s+([\s\S]+?)(?=[B-D]\.|$)/g)
    if (manualOpts && manualOpts.length >= 2) {
      const firstOptIndex = questionBlock.search(/[A-D]\.\s+/)
      const promptRaw = questionBlock.substring(0, firstOptIndex)
      let cleanPrompt = cleanLatexPrompt(promptRaw.replace(/\\Cau\b/g, '').replace(/%\s*C[aâ]u[^\n]*\n?/gi, ''))

      const options = []
      manualOpts.forEach(opt => {
        const k = opt.substring(0, 1).toUpperCase()
        const c = opt.substring(2).trim()
        options.push({ key: k, content: c })
      })

      question = {
        questionNumber,
        questionType: 'MULTIPLE_CHOICE',
        partTitle,
        content: cleanPrompt,
        options,
        mcAnswer: commentKey || null,
        imageName: detectedImageName,
        explanation: null,
        rawBlock: questionBlock,
        parseError: error
      }
    } else {
      // Câu hỏi tự luận thuần hoặc trả lời ngắn không có macro riêng
      let cleanPrompt = cleanLatexPrompt(questionBlock.replace(/\\Cau\b/g, '').replace(/%\s*C[aâ]u[^\n]*\n?/gi, ''))
      question = {
        questionNumber,
        questionType: 'SHORT_ANSWER',
        partTitle,
        content: cleanPrompt,
        saAnswer: commentSaKey || null,
        imageName: detectedImageName,
        explanation: null,
        rawBlock: questionBlock,
        parseError: error
      }
    }
  }

  return { question, error, partTitle }
}

/**
 * Trích xuất toàn bộ đề thi LaTeX thành cấu trúc dữ liệu câu hỏi hoàn chỉnh
 */
export function parseLatexExam(latexSource) {
  const result = {
    success: true,
    title: '',
    subtitle: '',
    questions: [],
    errors: []
  }

  if (!latexSource || typeof latexSource !== 'string') {
    result.success = false
    result.errors.push({ questionNumber: 0, rawTextSnippet: '', reason: 'Mã nguồn LaTeX rỗng' })
    return result
  }

  // 1. Trích xuất CustomHeader nếu có
  const headerMatch = latexSource.match(/\\CustomHeader\s*\{([^}]+)\}\s*\{([^}]+)\}/)
  if (headerMatch) {
    result.title = headerMatch[1].trim()
    result.subtitle = headerMatch[2].trim()
  }

  // 2. Tách theo các khối câu hỏi
  let bodyContent = latexSource
  const docStart = latexSource.indexOf('\\begin{document}')
  if (docStart !== -1) {
    bodyContent = latexSource.substring(docStart + '\\begin{document}'.length)
  }
  const docEnd = bodyContent.indexOf('\\end{document}')
  if (docEnd !== -1) {
    bodyContent = bodyContent.substring(0, docEnd)
  }

  const markerRegex = /(?:%[^\n]*\n)*\s*(?:\\Cau\b|\\begin\{TrueFalseBox\}|\\ShortAnswerBox\b|\\begin\{ex\}|\\begin\{cau\}|(?:\n|^)\s*C[aâ]u\s*\d+\s*[:.])/gi
  
  const matches = []
  let match
  while ((match = markerRegex.exec(bodyContent)) !== null) {
    matches.push({
      index: match.index,
      marker: match[0]
    })
  }

  if (matches.length === 0) {
    result.success = false
    result.errors.push({
      questionNumber: 0,
      rawTextSnippet: bodyContent.substring(0, 200),
      reason: 'Không tìm thấy câu hỏi nào có cú pháp \\Cau hoặc \\begin{TrueFalseBox} hoặc \\ShortAnswerBox hoặc \\begin{ex}'
    })
    return result
  }

  let currentPartTitle = null

  // Duyệt qua từng khối câu hỏi
  for (let idx = 0; idx < matches.length; idx++) {
    const current = matches[idx]
    const next = matches[idx + 1]
    const questionNumber = idx + 1

    const questionBlock = next 
      ? bodyContent.substring(current.index, next.index)
      : bodyContent.substring(current.index)

    const { question, error, partTitle } = parseSingleQuestionBlock(questionBlock, questionNumber, currentPartTitle)
    
    if (partTitle) {
      currentPartTitle = partTitle
    }
    
    if (error) {
      result.errors.push({
        questionNumber,
        rawTextSnippet: questionBlock.substring(0, 150),
        reason: error
      })
    }

    if (question) {
      result.questions.push(question)
    }
  }

  return result
}


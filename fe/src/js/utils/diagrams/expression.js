/**
 * expression.js — Bộ phân tích biểu thức toán "an toàn" dùng cho khối hình.
 *
 * Mục tiêu:
 *  - KHÔNG dùng `eval` / `new Function` (chặn RCE từ nội dung Markdown).
 *  - Chỉ cho phép: số, biến `x`, hằng `pi`/`e`, toán tử `+ - * / ^`, ngoặc,
 *    và hàm whitelist: sin cos tan sqrt abs ln log exp (`log` là alias của `ln`).
 *  - Thứ tự ưu tiên đúng: `-x^2 = -(x^2)`, `x^2^3 = x^(2^3)`, `2^-1 = 1/2`.
 *  - Không hỗ trợ nhân ẩn (`2x` bị từ chối), không truy cập thuộc tính,
 *    không gán biến, không callback.
 *
 * Module thuần (không phụ thuộc DOM) để unit-test bằng Node.
 */

export class ExpressionError extends Error {
  constructor(message, position = null) {
    super(message)
    this.name = 'ExpressionError'
    this.position = position
  }
}

export const EXPR_MAX_LENGTH = 400
export const EXPR_MAX_DEPTH = 32
export const EXPR_MAX_NODES = 400

/** Hàm được phép dùng (tên → số tham số). */
export const ALLOWED_FUNCTIONS = Object.freeze({
  sin: 1, cos: 1, tan: 1,
  sqrt: 1, abs: 1,
  ln: 1, log: 1,
  exp: 1
})

/** Hằng số được phép dùng. */
export const ALLOWED_CONSTANTS = Object.freeze({
  pi: Math.PI,
  e: Math.E
})

const PUNCT = new Set(['+', '-', '*', '/', '^', '(', ')', ','])

/* ------------------------------------------------------------------ *
 * Tokenizer
 * ------------------------------------------------------------------ */

function tokenize(src) {
  const tokens = []
  let i = 0
  while (i < src.length) {
    const ch = src[i]
    if (ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r') { i++; continue }

    // Số: 12, 3.5, .5, 1e-3
    if ((ch >= '0' && ch <= '9') || (ch === '.' && src[i + 1] >= '0' && src[i + 1] <= '9')) {
      const start = i
      while (i < src.length && ((src[i] >= '0' && src[i] <= '9') || src[i] === '.')) i++
      if (src[i] === 'e' || src[i] === 'E') {
        const expStart = i
        let j = i + 1
        if (src[j] === '+' || src[j] === '-') j++
        if (src[j] >= '0' && src[j] <= '9') {
          while (j < src.length && src[j] >= '0' && src[j] <= '9') j++
          i = j
        } else {
          i = expStart
        }
      }
      const raw = src.slice(start, i)
      const value = Number(raw)
      if (!Number.isFinite(value)) {
        throw new ExpressionError(`Số không hợp lệ "${raw}"`, start)
      }
      tokens.push({ type: 'number', value, pos: start })
      continue
    }

    // Tên biến / hàm
    if ((ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z') || ch === '_') {
      const start = i
      while (i < src.length && /[A-Za-z0-9_]/.test(src[i])) i++
      tokens.push({ type: 'name', value: src.slice(start, i), pos: start })
      continue
    }

    if (PUNCT.has(ch)) {
      tokens.push({ type: 'punct', value: ch, pos: i })
      i++
      continue
    }

    throw new ExpressionError(
      `Ký tự không được phép "${ch}". Chỉ chấp nhận số, x, pi, e, toán tử + - * / ^ và hàm sin cos tan sqrt abs ln log exp.`,
      i
    )
  }
  tokens.push({ type: 'eof', value: '', pos: src.length })
  return tokens
}

/* ------------------------------------------------------------------ *
 * Parser (recursive descent) → AST
 * ------------------------------------------------------------------ */

function createParser(tokens) {
  let pos = 0
  let nodes = 0
  let depth = 0

  const peek = () => tokens[pos]
  const next = () => tokens[pos++]

  function expectPunct(value) {
    const tok = peek()
    if (tok.type !== 'punct' || tok.value !== value) {
      throw new ExpressionError(`Cần "${value}"`, tok.pos)
    }
    return next()
  }

  function countNode(node) {
    nodes++
    if (nodes > EXPR_MAX_NODES) {
      throw new ExpressionError('Biểu thức quá phức tạp (vượt quá số nút cho phép)')
    }
    return node
  }

  function parseExpression() {
    depth++
    if (depth > EXPR_MAX_DEPTH) {
      throw new ExpressionError('Biểu thức lồng quá sâu (vượt quá độ sâu cho phép)')
    }
    let left = parseTerm()
    while (peek().type === 'punct' && (peek().value === '+' || peek().value === '-')) {
      const op = next().value
      const right = parseTerm()
      left = countNode({ type: 'binary', op, left, right })
    }
    depth--
    return left
  }

  function parseTerm() {
    let left = parseUnary()
    while (peek().type === 'punct' && (peek().value === '*' || peek().value === '/')) {
      const op = next().value
      const right = parseUnary()
      left = countNode({ type: 'binary', op, left, right })
    }
    return left
  }

  function parseUnary() {
    depth++
    if (depth > EXPR_MAX_DEPTH) {
      throw new ExpressionError('Biểu thức lồng quá sâu (vượt quá độ sâu cho phép)')
    }
    const tok = peek()
    if (tok.type === 'punct' && (tok.value === '+' || tok.value === '-')) {
      next()
      const arg = parseUnary()
      depth--
      return countNode({ type: 'unary', op: tok.value, arg })
    }
    const node = parsePower()
    depth--
    return node
  }

  // Lũy thừa kết hợp phải: x^2^3 = x^(2^3)
  function parsePower() {
    const base = parsePrimary()
    const tok = peek()
    if (tok.type === 'punct' && tok.value === '^') {
      next()
      const exponent = parseUnary()
      return countNode({ type: 'binary', op: '^', left: base, right: exponent })
    }
    return base
  }

  function parsePrimary() {
    const tok = peek()
    if (tok.type === 'number') {
      next()
      return countNode({ type: 'number', value: tok.value })
    }
    if (tok.type === 'name') {
      next()
      const name = tok.value
      const lower = name.toLowerCase()
      if (peek().type === 'punct' && peek().value === '(') {
        next()
        const args = []
        if (!(peek().type === 'punct' && peek().value === ')')) {
          args.push(parseExpression())
          while (peek().type === 'punct' && peek().value === ',') {
            next()
            args.push(parseExpression())
          }
        }
        expectPunct(')')
        if (!Object.prototype.hasOwnProperty.call(ALLOWED_FUNCTIONS, lower)) {
          throw new ExpressionError(`Hàm "${name}" không được phép dùng`, tok.pos)
        }
        if (args.length !== ALLOWED_FUNCTIONS[lower]) {
          throw new ExpressionError(`Hàm "${name}" cần đúng ${ALLOWED_FUNCTIONS[lower]} tham số`, tok.pos)
        }
        return countNode({ type: 'call', name: lower, args })
      }
      if (lower === 'x') {
        return countNode({ type: 'variable', name: 'x' })
      }
      if (Object.prototype.hasOwnProperty.call(ALLOWED_CONSTANTS, lower)) {
        return countNode({ type: 'constant', name: lower })
      }
      throw new ExpressionError(`Tên "${name}" không hợp lệ (chỉ cho phép x, pi, e hoặc hàm whitelist)`, tok.pos)
    }
    if (tok.type === 'punct' && tok.value === '(') {
      next()
      const inner = parseExpression()
      expectPunct(')')
      return inner
    }
    throw new ExpressionError('Biểu thức không hoàn chỉnh', tok.pos)
  }

  return { parseExpression, peek, atEnd: () => peek().type === 'eof' }
}

/**
 * Phân tích biểu thức toán thành AST.
 * @throws {ExpressionError}
 */
export function parseExpression(source) {
  const src = String(source == null ? '' : source).trim()
  if (!src) throw new ExpressionError('Biểu thức rỗng')
  if (src.length > EXPR_MAX_LENGTH) {
    throw new ExpressionError(`Biểu thức quá dài (tối đa ${EXPR_MAX_LENGTH} ký tự)`)
  }
  const parser = createParser(tokenize(src))
  const ast = parser.parseExpression()
  if (!parser.atEnd()) {
    const tok = parser.peek()
    throw new ExpressionError(
      `Thiếu toán tử trước "${tok.value}". Phép nhân phải viết tường minh, ví dụ 2*x.`,
      tok.pos
    )
  }
  return ast
}

/** Kiểm tra biểu thức có hợp lệ không (trả về null nếu hợp lệ). */
export function checkExpression(source) {
  try {
    parseExpression(source)
    return null
  } catch (err) {
    return err instanceof ExpressionError ? err.message : String(err && err.message ? err.message : err)
  }
}

/* ------------------------------------------------------------------ *
 * Evaluator
 * ------------------------------------------------------------------ */

/**
 * Tính giá trị AST tại x (mặc định x = undefined ⇒ biểu thức hằng).
 * Trả về NaN / Infinity khi không xác định — caller tự kiểm tra.
 */
export function evaluate(ast, x) {
  switch (ast.type) {
    case 'number':
      return ast.value
    case 'variable':
      return typeof x === 'number' ? x : NaN
    case 'constant':
      return ALLOWED_CONSTANTS[ast.name]
    case 'unary': {
      const v = evaluate(ast.arg, x)
      if (ast.op === '-') return -v
      return v
    }
    case 'binary': {
      const a = evaluate(ast.left, x)
      const b = evaluate(ast.right, x)
      switch (ast.op) {
        case '+': return a + b
        case '-': return a - b
        case '*': return a * b
        case '/': return a / b
        case '^': return Math.pow(a, b)
        default: return NaN
      }
    }
    case 'call': {
      const arg = evaluate(ast.args[0], x)
      switch (ast.name) {
        case 'sin': return Math.sin(arg)
        case 'cos': return Math.cos(arg)
        case 'tan': return Math.tan(arg)
        case 'sqrt': return Math.sqrt(arg)
        case 'abs': return Math.abs(arg)
        case 'ln': return Math.log(arg)
        case 'log': return Math.log(arg)   // alias của ln theo quy ước V2
        case 'exp': return Math.exp(arg)
        default: return NaN
      }
    }
    default:
      return NaN
  }
}

/** AST có chứa biến `x` hay không? */
export function hasVariable(ast) {
  switch (ast.type) {
    case 'variable': return true
    case 'unary': return hasVariable(ast.arg)
    case 'binary': return hasVariable(ast.left) || hasVariable(ast.right)
    case 'call': return ast.args.some(hasVariable)
    default: return false
  }
}

/** Đánh giá một biểu thức hằng (không chứa biến). */
export function evaluateConstant(ast) {
  if (hasVariable(ast)) throw new ExpressionError('Biểu thức phải là hằng số (không chứa x)')
  const v = evaluate(ast, undefined)
  if (!Number.isFinite(v)) throw new ExpressionError('Biểu thức hằng không cho ra giá trị hữu hạn')
  return v
}

/**
 * Biểu thức có xác định tại x không?
 * Dùng để tìm miền xác định (sqrt u >= 0, ln u > 0, mẫu số khác 0, tan...).
 */
export function isDefinedAt(ast, x) {
  switch (ast.type) {
    case 'number':
    case 'constant':
      return true
    case 'variable':
      return typeof x === 'number' && Number.isFinite(x)
    case 'unary':
      return isDefinedAt(ast.arg, x)
    case 'binary': {
      const a = ast.left
      const b = ast.right
      switch (ast.op) {
        case '+':
        case '-':
        case '*':
          return isDefinedAt(a, x) && isDefinedAt(b, x)
        case '/':
          return isDefinedAt(a, x) && isDefinedAt(b, x) && evaluate(b, x) !== 0
        case '^': {
          if (!isDefinedAt(a, x) || !isDefinedAt(b, x)) return false
          const base = evaluate(a, x)
          const exp = evaluate(b, x)
          if (base === 0 && exp < 0) return false
          if (base < 0 && !Number.isInteger(exp)) return false
          return true
        }
        default: return false
      }
    }
    case 'call': {
      if (!isDefinedAt(ast.args[0], x)) return false
      const arg = evaluate(ast.args[0], x)
      switch (ast.name) {
        case 'sqrt': return arg >= 0
        case 'ln':
        case 'log': return arg > 0
        case 'tan': return Math.abs(Math.cos(arg)) > 1e-12
        default: return true
      }
    }
    default:
      return false
  }
}

/**
 * Chuỗi mô tả dạng "affine" của biểu thức: trả về {a, b} nếu biểu thức có dạng a*x + b
 * (a, b là hằng số), ngược lại null.
 */
export function asAffine(ast) {
  // hằng số
  if (!hasVariable(ast)) {
    try {
      const c = evaluateConstant(ast)
      return { a: 0, b: c }
    } catch (_) { return null }
  }
  // dạng a*x + b  hoặc  b + a*x
  const linear = (node) => {
    if (node.type === 'binary' && node.op === '+') {
      const l = linear(node.left)
      const r = linear(node.right)
      if (l && r) return { a: l.a + r.a, b: l.b + r.b }
      if (l && isConstantNode(node.right)) return { a: l.a, b: l.b + evaluateConstant(node.right) }
      if (r && isConstantNode(node.left)) return { a: r.a, b: r.b + evaluateConstant(node.left) }
      return null
    }
    if (node.type === 'binary' && node.op === '-') {
      const l = linear(node.left)
      const r = linear(node.right)
      if (l && r) return { a: l.a - r.a, b: l.b - r.b }
      if (l && isConstantNode(node.right)) return { a: l.a, b: l.b - evaluateConstant(node.right) }
      return null
    }
    if (node.type === 'binary' && node.op === '*') {
      const l = linear(node.left)
      const r = linear(node.right)
      if (l && r) return null
      if (l && isConstantNode(node.right)) return { a: l.a * evaluateConstant(node.right), b: 0 }
      if (r && isConstantNode(node.left)) return { a: r.a * evaluateConstant(node.left), b: 0 }
      return null
    }
    if (node.type === 'unary' && node.op === '-') {
      const l = linear(node.arg)
      if (l) return { a: -l.a, b: -l.b }
      return null
    }
    if (node.type === 'binary' && node.op === '^') {
      // x^1
      if (node.left.type === 'variable' && isConstantNode(node.right) && evaluateConstant(node.right) === 1) {
        return { a: 1, b: 0 }
      }
      return null
    }
    if (node.type === 'variable') return { a: 1, b: 0 }
    return null
  }
  const res = linear(ast)
  return res
}

function isConstantNode(node) {
  return !hasVariable(node)
}

/** Định dạng số gọn cho nhãn (tránh 0.30000000000000004). */
export function formatNumber(value, digits = 10) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return String(value)
  if (Number.isInteger(value) && Math.abs(value) < 1e15) return String(value)
  const s = Number(value.toPrecision(digits)).toString()
  return s
}

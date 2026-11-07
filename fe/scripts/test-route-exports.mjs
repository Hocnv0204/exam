// Bảo đảm mọi route lazy trong app.js trỏ tới hàm render/bind thực sự được export bởi view.
// (Lỗi từng xảy ra: router gọi routeModule.render nhưng view chỉ export renderXxxView → trắng trang.)
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const appSrc = readFileSync(new URL('../src/js/app.js', import.meta.url), 'utf8')
const lazyRoutes = [...appSrc.matchAll(/'?([\w-]+)'?:\s*\{\s*loader:\s*\(\)\s*=>\s*import\('\.\/views\/([\w-]+)\.js'\)(?:,\s*renderName:\s*'(\w+)')?(?:,\s*bindName:\s*'(\w+)')?/g)]

test('có route lazy để kiểm tra', () => {
  assert.ok(lazyRoutes.length > 0)
})

for (const [, route, view, renderName, bindName] of lazyRoutes) {
  test(`route lazy "${route}" khai báo và export đủ render/bind`, () => {
    assert.ok(renderName, `route ${route} thiếu renderName`)
    assert.ok(bindName, `route ${route} thiếu bindName`)
    const viewSrc = readFileSync(new URL(`../src/js/views/${view}.js`, import.meta.url), 'utf8')
    for (const fn of [renderName, bindName]) {
      assert.match(viewSrc, new RegExp(`export\\s+(async\\s+)?(function\\s+${fn}\\b|const\\s+${fn}\\b)`), `${view}.js không export ${fn}`)
    }
  })
}

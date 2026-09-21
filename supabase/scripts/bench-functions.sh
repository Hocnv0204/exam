#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# Đo hiệu năng (TTFB) các Supabase Edge Functions + kiểm tra region thực thi.
#
# Dùng:
#   TOKEN="<access_token>" bash supabase/scripts/bench-functions.sh
#   TOKEN=... CLASS_ID=<uuid lớp có học sinh> SAMPLES=5 bash supabase/scripts/bench-functions.sh
#
# Cách hiểu kết quả:
#   Mỗi lời gọi Supabase (PostgREST/GoTrue) trong function = 1 round-trip.
#   - Function KHÁC region DB  : ~160ms / round-trip
#   - Function CÙNG region DB  : ~50-60ms / round-trip
#   => TTFB ≈ (gateway + khởi động) + per-hop × số round-trip
#   Muốn nhanh: ít round-trip + pin region về đúng region của Database
#   (xem mục 2.5.1 trong HUONG_DAN_SUPABASE.md).
# ---------------------------------------------------------------------------
set -uo pipefail

BASE_URL="${SUPABASE_URL:-https://fpeqddxhhsngntybyson.supabase.co}"
SAMPLES="${SAMPLES:-5}"
TOKEN="${TOKEN:-}"
CLASS_ID="${CLASS_ID:-}"

if [ -z "$TOKEN" ]; then
  echo "Thiếu TOKEN. Ví dụ: TOKEN=\"\$(cat /tmp/tok.txt)\" bash $0" >&2
  exit 1
fi

AUTH=(-H "authorization: Bearer $TOKEN")

median() { sort -n | awk '{a[NR]=$1} END { if (NR%2) printf "%.3f", a[(NR+1)/2]; else printf "%.3f", (a[NR/2]+a[NR/2+1])/2 }'; }

bench() {
  local label="$1"; shift
  local tmp; tmp="$(mktemp)"
  for _ in $(seq 1 "$SAMPLES"); do
    curl -s -o /dev/null --max-time 60 -w '%{time_starttransfer}\n' "$@" >> "$tmp"
  done
  printf '  %-42s median=%ss\n' "$label" "$(median < "$tmp")"
  rm -f "$tmp"
}

dump_headers() {
  local url="$1"; shift
  curl -s -D - -o /dev/null --max-time 60 "$url" "$@" \
    | grep -i 'x-sb-edge-region\|endpoint-load-metrics' | tr -d '\r' | sed 's/^/  /'
}

echo "=== 1) TTFB theo số round-trip nội bộ (region mặc định) ==="
bench "0 hop  - login (body sai)"      -X POST "$BASE_URL/functions/v1/login" -H 'content-type: application/json' -d '{"username":"","password":""}'
bench "3 hop  - create-class (GET)"    "$BASE_URL/functions/v1/create-class" "${AUTH[@]}"
bench "3 hop  - create-student (GET)"  "$BASE_URL/functions/v1/create-student" "${AUTH[@]}"
bench "4 hop  - create-student?classId rỗng" "$BASE_URL/functions/v1/create-student?classId=00000000-0000-0000-0000-000000000000" "${AUTH[@]}"
if [ -n "$CLASS_ID" ]; then
  bench "5 hop  - create-student?classId có HS" "$BASE_URL/functions/v1/create-student?classId=$CLASS_ID" "${AUTH[@]}"
else
  echo "  (bỏ qua case 5 hop: chưa truyền CLASS_ID)"
fi

echo
echo "=== 2) Region thực thi (mặc định) ==="
dump_headers "$BASE_URL/functions/v1/create-student" "${AUTH[@]}"

echo
echo "=== 3) Khi pin về đúng region Database (ap-southeast-2) ==="
if [ -n "$CLASS_ID" ]; then
  Q="functions/v1/create-student?classId=$CLASS_ID"
else
  Q="functions/v1/create-class"
fi
bench "cùng region DB (x-region: ap-southeast-2)" "$BASE_URL/$Q" "${AUTH[@]}" -H 'x-region: ap-southeast-2'
dump_headers "$BASE_URL/$Q" "${AUTH[@]}" -H 'x-region: ap-southeast-2'

echo
echo "=== 4) Cold start lần đầu ở region mới (thường 2-25s) ==="
for R in us-west-2 eu-west-1; do
  printf '  %-12s call1=' "$R"
  curl -s -o /dev/null --max-time 90 -w '%{time_starttransfer}s call2=' "$BASE_URL/$Q" "${AUTH[@]}" -H "x-region: $R"
  curl -s -o /dev/null --max-time 90 -w '%{time_starttransfer}s\n' "$BASE_URL/$Q" "${AUTH[@]}" -H "x-region: $R"
done

// Nội dung tutorial học sinh trên giao diện Mochi (spec 006).
// Mỗi bước trỏ tới phần tử có thuộc tính data-tour="<target>"; bước nào không có phần tử
// đang hiển thị (ẩn trên điện thoại, chưa có dữ liệu…) sẽ được engine bỏ qua.
// Key "m2-*" là mới: mọi học sinh (kể cả đã xem tour cũ) thấy mỗi tour đúng một lần.

export const STUDENT_TOURS = {
  'm2-welcome': {
    key: 'm2-welcome',
    welcome: {
      title: 'Chào mừng bạn đến với EduPortal!',
      lines: [
        'Mochi sẽ dẫn bạn đi một vòng khoảng 1 phút.',
        'Ở đây bạn xem bài học, làm bài tập, vào phòng thi và theo dõi tiến bộ của mình.',
        'Muốn xem lại hướng dẫn lúc nào cũng được: bấm nút "Hướng dẫn" ở mỗi trang.'
      ],
      startLabel: 'Bắt đầu tham quan',
      laterLabel: 'Để sau'
    },
    steps: [
      { target: 'home-continue', mood: 'cheer', title: 'Nút Tiếp tục', text: 'Bấm "Tiếp tục" để vào ngay bài tập gần hạn nhất. Chưa có bài nào thì Mochi đưa bạn tới lớp học.' },
      { target: 'home-todo', title: 'Bài tập cần làm', text: 'Các bài được giao mà bạn chưa làm, xếp theo hạn nộp. Bấm vào bài để làm ngay, bài thi sẽ mở phòng thi.' },
      { target: 'home-drafts', title: 'Bài đang làm dở', text: 'Bài bạn đã mở nhưng chưa nộp nằm ở đây. Câu trả lời được lưu tự động, quay lại làm tiếp bất cứ lúc nào trước hạn.' },
      { target: 'home-review', mood: 'happy', title: 'Mochi gợi ý ôn lại', text: 'Mochi tìm ra những chương bạn hay làm sai nhất. Ôn lại các chương này trước khi làm bài mới nhé!' },
      { target: 'home-progress', title: 'Tiến độ bài tập', text: 'Tổng số bài được giao, số bài đã xong và số bài còn lại của bạn.' },
      { target: 'home-scores', title: 'Điểm các bài gần đây', text: 'Điểm 10 lần nộp gần nhất, đã quy về thang 10, để bạn thấy mình đang tiến hay lùi.' },
      { target: 'home-achievements', mood: 'cheer', title: 'Thành tích', text: 'Làm bài và đi học đều đặn để nhận XP, giữ chuỗi ngày học và mở khoá huy hiệu.' },
      { target: 'theme', title: 'Đổi chế độ màu', text: 'Chọn giao diện bạn thích: Sáng, Tối, Sakura hoặc Bạc hà. Mochi nhớ lựa chọn của bạn.' },
      { target: 'nav', title: 'Thanh điều hướng', text: 'Đi tới Lớp học, Bài tập, Điểm danh, Lịch sử làm bài và Thành tích. Trên điện thoại, các mục còn lại và nút Đăng xuất nằm trong ô "Thêm".' },
      { target: 'tour-replay', mood: 'wink', title: 'Xem lại hướng dẫn', text: 'Mỗi trang đều có nút "Hướng dẫn" như thế này. Chúc bạn học thật vui cùng Mochi!' }
    ]
  },

  'm2-classes': {
    key: 'm2-classes',
    steps: [
      { target: 'map-header', title: 'Bản đồ bài học', text: 'Tên lớp, chương đang xem và thanh tiến độ: bạn đã xong bao nhiêu bài của chương này.' },
      { target: 'map-chapters', title: 'Chọn chương', text: 'Mỗi nút là một chương của lớp. Bấm để chuyển sang chương khác.' },
      { target: 'map-path', mood: 'cheer', title: 'Lộ trình bài học', text: 'Học lần lượt từ trên xuống. Bài có dấu ✓ là bạn đã làm xong bài tập của bài đó. Bấm "Vào bài học" để bắt đầu.' },
      { target: 'tour-replay', title: 'Xem lại hướng dẫn', text: 'Bấm "Hướng dẫn" bất cứ lúc nào để xem lại.' }
    ]
  },

  'm2-lesson': {
    key: 'm2-lesson',
    steps: [
      { target: 'lesson-steps', title: '3 bước của một bài học', text: 'Xem video, đọc lý thuyết rồi làm bài tập. Làm xong bài tập, bước 3 sẽ được đánh dấu ✓.' },
      { target: 'lesson-content', title: 'Video & lý thuyết', text: 'Chuyển giữa tab Video và Lý thuyết. Video không phát được thì bấm nút mở trong tab mới.' },
      { target: 'lesson-homeworks', mood: 'cheer', title: 'Bài tập của bài', text: 'Bấm "Làm bài" để bắt đầu, đồng hồ tính giờ chạy ngay khi bạn xác nhận. Bài thi sẽ mở phòng thi có giám sát.' },
      { target: 'lesson-files', title: 'Tài liệu', text: '"Xem" để đọc tài liệu PDF ngay trên trang, "Tải xuống" để lưu về máy.' },
      { target: 'lesson-pager', title: 'Bài trước / bài sau', text: 'Chuyển nhanh sang bài kế tiếp trong chương mà không cần quay lại bản đồ.' }
    ]
  },

  'm2-homeworks': {
    key: 'm2-homeworks',
    steps: [
      { target: 'hw-stats', title: 'Tổng quan bài tập', text: 'Số bài được giao, chưa làm, đã làm và điểm trung bình của bạn.' },
      { target: 'hw-filters', title: 'Lọc & tìm bài', text: 'Lọc theo trạng thái, lớp, chương, bài học hoặc gõ tên bài để tìm nhanh.' },
      { target: 'hw-list', title: 'Danh sách bài', text: 'Bài chưa làm hiện hạn nộp, bấm "Làm bài". Bài đã làm hiện điểm: "Xem kết quả" để xem từng câu và lời giải, "Làm lại" để cải thiện điểm (nếu còn lượt).' },
      { target: 'hw-list', mood: 'happy', title: 'Quy định phòng thi', text: 'Bài thi tính giờ ngay khi vào phòng. Nếu bạn chuyển tab hay rời cửa sổ, đề bài sẽ bị che lại nhưng đồng hồ vẫn chạy, nên hãy ở lại màn hình thi. Bài làm được lưu liên tục và tự nộp khi hết giờ. Lỡ mất mạng thì cứ làm tiếp, có mạng lại Mochi sẽ gửi bù.' },
      { target: 'tour-replay', title: 'Xem lại hướng dẫn', text: 'Quên cách dùng? Bấm "Hướng dẫn" để xem lại.' }
    ]
  },

  'm2-attendance': {
    key: 'm2-attendance',
    steps: [
      { target: 'att-filters', title: 'Chọn lớp & khoảng ngày', text: 'Chọn lớp (nếu bạn học nhiều lớp) và khoảng ngày, rồi bấm "Xem".' },
      { target: 'att-overview', title: 'Tổng quan', text: 'Số buổi lớp đã học, số buổi bạn có mặt và vắng. "Không tính" là các buổi trước khi bạn vào lớp hoặc lúc tạm nghỉ.' },
      { target: 'att-compare', title: 'Bạn và cả lớp', text: 'So sánh tỉ lệ chuyên cần của bạn với trung bình lớp.' },
      { target: 'att-list', title: 'Từng buổi học', text: 'Danh sách buổi học, lọc nhanh Có mặt / Vắng. Buổi vắng được tô đỏ để bạn dễ thấy.' },
      { target: 'tour-replay', title: 'Xem lại hướng dẫn', text: 'Bấm "Hướng dẫn" để xem lại bất cứ lúc nào.' }
    ]
  },

  'm2-history': {
    key: 'm2-history',
    steps: [
      { target: 'hist-stats', title: 'Kết quả của bạn', text: 'Điểm trung bình, tổng số bài đã làm và số bài nộp muộn.' },
      { target: 'hist-filters', title: 'Lọc lịch sử', text: 'Tìm theo tên bài, lọc theo lớp, chương hoặc bài học.' },
      { target: 'hist-list', mood: 'happy', title: 'Xem lại bài làm', text: 'Mỗi thẻ là một lần nộp. Bấm "Xem kết quả" để xem từng câu, đáp án đúng và lời giải chi tiết.' },
      { target: 'tour-replay', title: 'Xem lại hướng dẫn', text: 'Bấm "Hướng dẫn" để xem lại bất cứ lúc nào.' }
    ]
  },

  'm2-achievements': {
    key: 'm2-achievements',
    steps: [
      { target: 'ach-xp', mood: 'cheer', title: 'XP & cấp độ', text: 'Mỗi bài nộp được cộng XP theo điểm số, thưởng thêm nếu nộp đúng hạn. Mỗi buổi có mặt được 10 XP. Đủ XP thì lên cấp.' },
      { target: 'ach-streak', title: 'Chuỗi ngày học', text: 'Mỗi ngày làm ít nhất một bài hoặc đi học là giữ được chuỗi. Đừng để ngọn lửa tắt nhé!' },
      { target: 'ach-badges', title: 'Huy hiệu', text: 'Hoàn thành thử thách để mở khoá huy hiệu. Huy hiệu chưa mở hiện điều kiện cần đạt.' },
      { target: 'ach-rules', title: 'Cách tính điểm', text: 'Bảng quy tắc cho biết mỗi hoạt động được bao nhiêu XP.' },
      { target: 'ach-leaderboard', title: 'Bảng vinh danh', text: 'Xếp hạng XP trong lớp của bạn.' },
      { target: 'tour-replay', title: 'Xem lại hướng dẫn', text: 'Bấm "Hướng dẫn" để xem lại bất cứ lúc nào.' }
    ]
  }
}

/** Route (+ tham số) → key tour tương ứng; null nếu trang không có tour tự mở. */
export function tourKeyForRoute(route, params = new URLSearchParams()) {
  if (route === 'student-dashboard' || route === '') return 'm2-welcome'
  if (route === 'my-classes') {
    if (params.get('classId') && params.get('lessonId')) return 'm2-lesson'
    if (params.get('classId')) return 'm2-classes'
    return null
  }
  if (route === 'my-homeworks') return 'm2-homeworks'
  if (route === 'attendance') return 'm2-attendance'
  if (route === 'history') return 'm2-history'
  if (route === 'achievements') return 'm2-achievements'
  return null
}

(function(){const e=document.createElement("link").relList;if(e&&e.supports&&e.supports("modulepreload"))return;for(const s of document.querySelectorAll('link[rel="modulepreload"]'))n(s);new MutationObserver(s=>{for(const a of s)if(a.type==="childList")for(const d of a.addedNodes)d.tagName==="LINK"&&d.rel==="modulepreload"&&n(d)}).observe(document,{childList:!0,subtree:!0});function i(s){const a={};return s.integrity&&(a.integrity=s.integrity),s.referrerPolicy&&(a.referrerPolicy=s.referrerPolicy),s.crossOrigin==="use-credentials"?a.credentials="include":s.crossOrigin==="anonymous"?a.credentials="omit":a.credentials="same-origin",a}function n(s){if(s.ep)return;s.ep=!0;const a=i(s);fetch(s.href,a)}})();const r={user:JSON.parse(localStorage.getItem("edu_user")||"null"),token:localStorage.getItem("edu_token")||null,classes:[{id:"c1",name:"Toán 11: Đại số & Giải tích",category:"NÂNG CAO",period:"Tiết 1",teacher:"ThS. Nguyễn Văn Thắng",studentsCount:28,progress:68},{id:"c2",name:"Hóa học 11",category:"CƠ BẢN",period:"Tiết 2",teacher:"TS. Phạm Minh Tuấn",studentsCount:24,progress:42},{id:"c3",name:"Vật lý 11",category:"NÂNG CAO",period:"Tiết 4",teacher:"Cô Lê Thị Hoa",studentsCount:22,progress:55},{id:"c4",name:"Ngữ văn 11",category:"CƠ BẢN",period:"Tiết 5",teacher:"Thầy Trần Quốc Bảo",studentsCount:31,progress:82}],curriculums:[{classId:"c1",chapters:[{id:"ch1_c1",code:"CHƯƠNG 1",title:"Đại số nâng cao",lessons:[{id:"l1.1",code:"1.1",title:"Hàm số đa thức & Đồ thị",hwCount:2,refCount:3},{id:"l1.2",code:"1.2",title:"Biểu thức hữu tỷ",hwCount:1,refCount:0,missingDocs:!0}]},{id:"ch2_c1",code:"CHƯƠNG 2",title:"Cơ bản về Lượng giác",lessons:[{id:"l2.1",code:"2.1",title:"Công thức lượng giác cơ bản",hwCount:3,refCount:2}]}]},{classId:"c2",chapters:[{id:"ch1_c2",code:"CHƯƠNG 1",title:"Cấu tạo nguyên tử & Liên kết hóa học",lessons:[{id:"l1_c2_1",code:"1.1",title:"Mô hình nguyên tử Bohr & Orbital",hwCount:2,refCount:4},{id:"l1_c2_2",code:"1.2",title:"Liên kết cộng hóa trị",hwCount:1,refCount:2}]}]},{classId:"c3",chapters:[{id:"ch1_c3",code:"CHƯƠNG 1",title:"Động học & Động lực học chất điểm",lessons:[{id:"l1_c3_1",code:"1.1",title:"Dao động điều hòa & Con lắc đơn",hwCount:4,refCount:3}]}]},{classId:"c4",chapters:[{id:"ch1_c4",code:"CHƯƠNG 1",title:"Văn học trung đại Việt Nam",lessons:[{id:"l1_c4_1",code:"1.1",title:"Phân tích tác phẩm Truyện Kiều",hwCount:2,refCount:5}]}]}],students:[{id:"s1",username:"john_doe",fullName:"Nguyễn Văn An",studentCode:"STU-8942",email:"an.nguyen@eduportal.vn",className:"Toán 11",classId:"c1",status:"Hoạt động",createdAt:"12/10/2023"},{id:"s2",username:"alice_smith",fullName:"Trần Thị Mai",studentCode:"STU-8943",email:"mai.tran@eduportal.vn",className:"Vật lý 11",classId:"c3",status:"Hoạt động",createdAt:"14/10/2023"},{id:"s3",username:"michael_j",fullName:"Lê Hoàng Nam",studentCode:"STU-8944",email:"nam.le@eduportal.vn",className:"Hóa học 11",classId:"c2",status:"Ngừng hoạt động",createdAt:"02/11/2023"}],homeworks:[{id:"hw1",title:"Kiểm tra Chương 3: Con lắc đơn & Động lực học",pdfPath:"Physics_Midterm_Ch3_Review.pdf",lessonTitle:"3.1 Dao động điều hòa",chapterTitle:"Chương 3 Động học & Động lực học",durationMinutes:45,passScore:5,maxScore:10,questions:[{id:"q1",questionNumber:1,questionType:"MULTIPLE_CHOICE",prompt:"Công thức nào sau đây mô tả đúng mối quan hệ giữa lực, khối lượng và gia tốc?",options:["F = m / a","F = m * a","F = a / m","F = m + a"],mcAnswer:"B",points:3},{id:"q2",questionNumber:2,questionType:"TRUE_FALSE",prompt:"Đánh giá các phát biểu sau về động học chất điểm.",statements:[{id:"s1",text:"Vận tốc là một đại lượng hướng (véc-tơ)."},{id:"s2",text:"Độ dịch chuyển có thể nhận giá trị âm."},{id:"s3",text:"Gia tốc trong chuyển động tròn đều là không đổi về hướng."},{id:"s4",text:"Công cơ học bằng tích của lực và quãng đường dịch chuyển."}],tfAnswers:{s1:!0,s2:!0,s3:!1,s4:!0},points:4},{id:"q3",questionNumber:3,questionType:"SHORT_ANSWER",prompt:"Tính gia tốc trọng trường g gần mặt đất theo đơn vị m/s^2 (Độ chính xác ±0.1).",saAnswer:9.8,saTolerance:.1,points:3}]}],submissions:[{id:"sub1",homeworkTitle:"Bài tập Chương 4: Đại số",lesson:"Đại số đại cương",submittedAt:"12/10/2023",score:85,maxScore:100,status:"ĐÃ CHẤM"},{id:"sub2",homeworkTitle:"Dự án Hình học không gian",lesson:"Hình học phẳng",submittedAt:"05/10/2023",score:92,maxScore:100,status:"ĐÃ CHẤM"},{id:"sub3",homeworkTitle:"Bài tập Đạo hàm & Giới hạn",lesson:"Giới hạn & Đạo hàm",submittedAt:"28/09/2023",score:"--",maxScore:100,status:"ĐÃ NỘP"},{id:"sub4",homeworkTitle:"Phương trình bậc hai",lesson:"Đại số đại cương",submittedAt:"15/09/2023",score:65,maxScore:100,status:"ĐÃ CHẤM"}]};function N(t,e){r.user=t,r.token=e,t&&e?(localStorage.setItem("edu_user",JSON.stringify(t)),localStorage.setItem("edu_token",e)):(localStorage.removeItem("edu_user"),localStorage.removeItem("edu_token"))}function W(){N(null,null),window.location.hash="#login"}const Y="http://127.0.0.1:54321/functions/v1";async function m(t,e={}){const i={"Content-Type":"application/json",...e.headers||{}};r.token&&(i.Authorization=`Bearer ${r.token}`);try{const n=await fetch(`${Y}/${t}`,{...e,headers:i}),s=await n.json();if(!n.ok||s.success===!1)throw new Error(s.error||`HTTP ${n.status}`);return s.data}catch(n){throw console.warn(`[API] Edge Function call ${t} failed, falling back to local state mode:`,n.message),n}}const A={login:(t,e)=>m("login",{method:"POST",body:JSON.stringify({username:t,password:e})}),createStudent:t=>m("create-student",{method:"POST",body:JSON.stringify(t)}),resetPassword:t=>m("reset-password",{method:"POST",body:JSON.stringify(t)}),createClass:t=>m("create-class",{method:"POST",body:JSON.stringify(t)}),createChapter:t=>m("create-chapter",{method:"POST",body:JSON.stringify(t)}),createLesson:t=>m("create-lesson",{method:"POST",body:JSON.stringify(t)}),createHomework:t=>m("create-homework",{method:"POST",body:JSON.stringify(t)}),submitHomework:t=>m("submit-homework",{method:"POST",body:JSON.stringify(t)}),getDashboard:()=>m("dashboard",{method:"GET"}),getStatistics:(t="")=>m(`statistics?${t}`,{method:"GET"}),getStudentHistory:(t="")=>m(`student-history?${t}`,{method:"GET"}),getHomeworkDetail:t=>m(`homework-detail?homeworkId=${t}`,{method:"GET"})};function f(t,e="info"){const i=document.getElementById("toast-container");if(!i)return;const n=document.createElement("div");n.className=`toast toast-${e}`,n.innerHTML=`
    <i class="fa-solid ${e==="success"?"fa-circle-check":e==="error"?"fa-triangle-exclamation":"fa-circle-info"}"></i>
    <span>${t}</span>
  `,i.appendChild(n),setTimeout(()=>{n.style.opacity="0",n.style.transform="translateY(10px)",setTimeout(()=>n.remove(),300)},3500)}function Z(){return`
    <div class="login-wrapper">
      <div class="login-card">
        <div class="login-logo">
          <i class="fa-solid fa-graduation-cap"></i>
        </div>
        <h1 class="login-title">Học & Phát Triển</h1>
        <p class="login-subtitle">Đăng nhập để truy cập bảng điều khiển của bạn.</p>

        <form id="login-form">
          <div class="form-group">
            <span class="form-label-floating">Tên đăng nhập</span>
            <input type="text" id="login-username" class="form-input" placeholder="Tên đăng nhập (admin)" value="admin" required>
          </div>

          <div class="form-group">
            <span class="form-label-floating">Mật khẩu</span>
            <input type="password" id="login-password" class="form-input" placeholder="Mật khẩu (admin)" value="admin" required>
            <i class="fa-regular fa-eye-slash input-icon-right" id="toggle-pw-icon"></i>
          </div>

          <div class="login-options">
            <label class="remember-me">
              <input type="checkbox" checked> Ghi nhớ đăng nhập
            </label>
            <a href="#forgot" class="forgot-link">Quên mật khẩu?</a>
          </div>

          <button type="submit" class="btn-primary">
            Đăng Nhập <i class="fa-solid fa-arrow-right"></i>
          </button>
        </form>

        <div class="login-hint">
          Gợi ý: Sử dụng tài khoản <span class="code-chip">admin</span> / <span class="code-chip">admin</span>
        </div>
      </div>
    </div>
  `}function tt(){const t=document.getElementById("login-password"),e=document.getElementById("toggle-pw-icon");e==null||e.addEventListener("click",()=>{t.type==="password"?(t.type="text",e.className="fa-regular fa-eye input-icon-right"):(t.type="password",e.className="fa-regular fa-eye-slash input-icon-right")});const i=document.getElementById("login-form");i==null||i.addEventListener("submit",async n=>{n.preventDefault();const s=document.getElementById("login-username").value.trim(),a=document.getElementById("login-password").value.trim();try{f("Đang xác thực với hệ thống Supabase Auth...","info");const d=await A.login(s,a);N(d.user,d.accessToken),f("Xin chào, đăng nhập thành công!","success"),window.location.hash=d.user.role==="ADMIN"?"#admin-dashboard":"#my-classes"}catch(d){s==="admin"&&a==="admin"?(N({id:"00000000-0000-0000-0000-000000000001",username:"admin",fullName:"Quản trị viên hệ thống",role:"ADMIN",classId:null},"mock_admin_token"),f("Đăng nhập thành công với quyền Quản trị viên (Chế độ Demo)","success"),window.location.hash="#admin-dashboard"):s==="student"||s.startsWith("student")?(N({id:"s1",username:s,fullName:"Nguyễn Văn An",role:"STUDENT",classId:"c1"},"mock_student_token"),f("Đăng nhập thành công với quyền Học sinh (Chế độ Demo)","success"),window.location.hash="#my-classes"):f(d.message||"Tên đăng nhập hoặc mật khẩu không đúng","error")}})}function b(t){var i;return`
    <aside class="sidebar">
      <div class="brand-logo">
        <i class="fa-solid fa-graduation-cap"></i>
        <span>EduPortal</span>
      </div>

      ${(((i=r.user)==null?void 0:i.role)||"ADMIN")==="ADMIN"?`
        <div class="nav-section-title">Quản trị viên</div>
        <div class="nav-item ${t==="admin-dashboard"?"active":""}" onclick="window.location.hash='#admin-dashboard'">
          <i class="fa-solid fa-table-cells-large"></i> Bảng điều khiển
        </div>
        <div class="nav-item ${t==="students"?"active":""}" onclick="window.location.hash='#students'">
          <i class="fa-solid fa-users"></i> Quản lý học sinh
        </div>
        <div class="nav-item ${t==="classes-admin"?"active":""}" onclick="window.location.hash='#classes-admin'">
          <i class="fa-solid fa-book-bookmark"></i> Quản lý lớp học
        </div>
        <div class="nav-item ${t==="curriculum"?"active":""}" onclick="window.location.hash='#curriculum'">
          <i class="fa-solid fa-book-open"></i> Chương & Bài học
        </div>
        <div class="nav-item ${t==="create-homework"?"active":""}" onclick="window.location.hash='#create-homework'">
          <i class="fa-solid fa-file-signature"></i> Tạo bài tập
        </div>
        <div class="nav-item ${t==="statistics"?"active":""}" onclick="window.location.hash='#statistics'">
          <i class="fa-solid fa-chart-column"></i> Thống kê báo cáo
        </div>
      `:""}

      <div class="nav-section-title">Dành cho học sinh</div>
      <div class="nav-item ${t==="my-classes"?"active":""}" onclick="window.location.hash='#my-classes'">
        <i class="fa-solid fa-graduation-cap"></i> Lớp học của tôi
      </div>
      <div class="nav-item ${t==="homework-attempt"?"active":""}" onclick="window.location.hash='#homework-attempt'">
        <i class="fa-solid fa-pen-to-square"></i> Làm bài tập
      </div>
      <div class="nav-item ${t==="history"?"active":""}" onclick="window.location.hash='#history'">
        <i class="fa-solid fa-clock-rotate-left"></i> Lịch sử nộp bài
      </div>

      <div style="margin-top:auto; padding-top:20px; border-top:1px solid var(--border-color);">
        <div class="nav-item" id="sidebar-logout-btn">
          <i class="fa-solid fa-arrow-right-from-bracket"></i> Đăng xuất
        </div>
      </div>
    </aside>
  `}function C(){var t;(t=document.getElementById("sidebar-logout-btn"))==null||t.addEventListener("click",()=>{W()})}function x(t="Nền tảng / Bảng điều khiển"){var n;const e=((n=r.user)==null?void 0:n.fullName)||"Quản trị hệ thống",i=e.split(" ").map(s=>s[0]).join("").substring(0,2).toUpperCase();return`
    <header class="top-navbar">
      <div class="breadcrumb">${t}</div>
      <div class="top-navbar-right">
        <div class="search-box">
          <i class="fa-solid fa-magnifying-glass"></i>
          <input type="text" placeholder="Tìm kiếm hệ thống...">
        </div>
        <button class="notification-btn" title="Thông báo">
          <i class="fa-regular fa-bell"></i>
          <span class="notification-dot"></span>
        </button>
        <div class="user-profile-chip" title="Hồ sơ người dùng">
          <span>${e}</span>
          <div class="user-avatar-circle">${i}</div>
        </div>
      </div>
    </header>
  `}let S=null;function H(){var e,i;const t=r.classes;if(S){const n=t.find(o=>o.id===S)||t[0],a=(((e=r.curriculums)==null?void 0:e.find(o=>o.classId===n.id))||{chapters:[]}).chapters||[],d=((i=r.homeworks)==null?void 0:i.filter(o=>!o.classId||o.classId===n.id))||r.homeworks;return`
      <div class="app-layout">
        ${b("my-classes")}
        <div class="main-content">
          ${x("Nền tảng / Bảng điều khiển")}
          <div class="content-body">
            <!-- Back Button & Page Header -->
            <div style="margin-bottom:16px;">
              <button class="btn-secondary" id="back-to-classes-btn" style="padding:6px 14px; font-size:13px; font-weight:600;">
                <i class="fa-solid fa-arrow-left"></i> Quay lại danh sách lớp học
              </button>
            </div>

            <!-- Class Banner -->
            <div class="card" style="background:linear-gradient(135deg, #ffffff 0%, #f0f7ff 100%); padding:24px; margin-bottom:24px;">
              <div style="display:flex; justify-content:space-between; align-items:center;">
                <div style="display:flex; align-items:center; gap:20px;">
                  <div style="width:60px; height:60px; background:#0066cc; color:#ffffff; border-radius:16px; display:flex; align-items:center; justify-content:center; font-size:28px;">
                    <i class="fa-solid fa-graduation-cap"></i>
                  </div>
                  <div>
                    <span class="badge" style="background:#e0f2fe; color:#0369a1; font-weight:700; margin-bottom:4px;">${n.category}</span>
                    <h1 class="page-title" style="font-size:24px; margin-top:2px;">${n.name}</h1>
                    <div style="font-size:13px; color:#64748b; margin-top:4px;">
                      <i class="fa-regular fa-user"></i> ${n.teacher} &nbsp;•&nbsp; 
                      <i class="fa-solid fa-users"></i> ${n.studentsCount} Học sinh &nbsp;•&nbsp;
                      <i class="fa-regular fa-clock"></i> ${n.period}
                    </div>
                  </div>
                </div>

                <div style="text-align:right;">
                  <div style="font-size:12px; color:#64748b; margin-bottom:4px;">Tiến độ môn học</div>
                  <div style="font-family:var(--font-heading); font-size:28px; font-weight:700; color:#0066cc;">${n.progress}%</div>
                </div>
              </div>
            </div>

            <!-- Main Content: Lessons & Assignments Split -->
            <div class="grid-3">
              <!-- Left Column: Chapter & Lesson List (Span 2) -->
              <div style="grid-column: span 2;">
                <div class="page-header" style="margin-bottom:16px;">
                  <h2 style="font-family:var(--font-heading); font-size:18px; font-weight:700; color:#0f172a;">
                    <i class="fa-solid fa-book-open" style="color:#0066cc;"></i> Chương & Bài học
                  </h2>
                </div>

                ${a.length===0?`
                  <div class="card" style="text-align:center; padding:32px; color:#64748b;">
                    <i class="fa-solid fa-folder-open" style="font-size:36px; color:#94a3b8; margin-bottom:12px;"></i>
                    <p style="font-weight:600;">Lớp học này chưa cập nhật danh sách bài học.</p>
                  </div>
                `:a.map(o=>{var c;return`
                  <div class="card" style="padding:18px; margin-bottom:16px;">
                    <div style="display:flex; justify-content:space-between; align-items:center;">
                      <div>
                        <span style="background:#e0f2fe; color:#0369a1; font-size:11px; font-weight:700; padding:2px 8px; border-radius:4px; text-transform:uppercase;">${o.code||"CHƯƠNG"}</span>
                        <h3 style="font-size:16px; font-weight:700; color:#0f172a; margin-top:4px;">${o.title}</h3>
                      </div>
                      <span style="font-size:12px; color:#64748b;">${((c=o.lessons)==null?void 0:c.length)||0} bài học</span>
                    </div>

                    <div style="margin-top:14px; padding-top:14px; border-top:1px solid #f1f5f9; display:flex; flex-direction:column; gap:10px;">
                      ${(o.lessons||[]).map(l=>`
                        <div style="display:flex; align-items:center; justify-content:space-between; padding:10px 14px; background:#f8fafc; border-radius:10px;">
                          <div style="display:flex; align-items:center; gap:12px;">
                            <span style="width:26px; height:26px; background:#ffffff; border:1px solid #cbd5e1; border-radius:50%; display:flex; align-items:center; justify-content:center; font-size:11px; font-weight:700;">${l.code||"1.1"}</span>
                            <div>
                              <div style="font-weight:600; font-size:14px; color:#0f172a;">${l.title}</div>
                              <div style="font-size:12px; color:#64748b;">
                                <i class="fa-regular fa-file"></i> ${l.hwCount||0} Bài tập đính kèm
                              </div>
                            </div>
                          </div>
                          <button class="btn-primary-sm go-to-hw-btn" onclick="window.location.hash='#homework-attempt'" style="padding:4px 12px; font-size:12px; background:#0066cc;">
                            Làm bài tập <i class="fa-solid fa-chevron-right"></i>
                          </button>
                        </div>
                      `).join("")}
                    </div>
                  </div>
                `}).join("")}
              </div>

              <!-- Right Column: Class Homeworks / Assignments -->
              <div>
                <div class="card">
                  <h3 style="font-family:var(--font-heading); font-size:16px; font-weight:700; margin-bottom:16px; color:#0f172a;">
                    <i class="fa-solid fa-list-check" style="color:#0066cc;"></i> Danh sách bài tập
                  </h3>

                  <div style="display:flex; flex-direction:column; gap:12px;">
                    ${d.map(o=>`
                      <div style="padding:14px; background:#f8fafc; border:1px solid #e2e8f0; border-radius:12px;">
                        <div style="font-weight:700; font-size:14px; color:#0f172a; margin-bottom:4px;">${o.title}</div>
                        <div style="font-size:12px; color:#64748b; margin-bottom:12px;">
                          <i class="fa-regular fa-clock"></i> Thời gian: ${o.durationMinutes||45} phút
                        </div>
                        <button class="btn-primary" onclick="window.location.hash='#homework-attempt'" style="padding:8px 14px; font-size:13px; width:100%;">
                          Vào làm bài ngay <i class="fa-solid fa-arrow-right"></i>
                        </button>
                      </div>
                    `).join("")}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    `}return`
    <div class="app-layout">
      ${b("my-classes")}
      <div class="main-content">
        ${x("Nền tảng / Bảng điều khiển")}
        <div class="content-body">
          <div class="page-header">
            <div>
              <h1 class="page-title">Lớp học của tôi</h1>
              <p class="page-description">Danh sách các lớp học đã đăng ký. Nhấn vào lớp để xem bài học và bài tập chi tiết.</p>
            </div>
            <div style="display:flex; gap:12px;">
              <button class="btn-secondary"><i class="fa-solid fa-sliders"></i> Bộ lọc</button>
            </div>
          </div>

          <!-- Classes Cards Grid -->
          <div class="grid-4" style="margin-bottom:28px;">
            ${t.map(n=>`
              <div class="class-card select-class-card" data-id="${n.id}" style="cursor:pointer;">
                <div class="class-card-header">
                  <span class="badge badge-period">${n.period}</span>
                </div>
                <div class="class-card-body">
                  <div class="class-category">${n.category}</div>
                  <h3 class="class-title">${n.name}</h3>
                  <div class="class-teacher"><i class="fa-regular fa-user"></i> ${n.teacher}</div>

                  <div style="font-size:12px; display:flex; justify-content:space-between; margin-bottom:6px; color:#64748b;">
                    <span>Tiến độ môn học</span>
                    <span style="font-weight:700; color:#0066cc;">${n.progress}%</span>
                  </div>
                  <div class="progress-bar-bg">
                    <div class="progress-bar-fill" style="width: ${n.progress}%;"></div>
                  </div>

                  <div class="class-footer">
                    <span><i class="fa-solid fa-users"></i> ${n.studentsCount} Học sinh</span>
                    <div class="enter-class-btn" style="color:#0066cc; font-weight:700;">
                      Xem bài học <i class="fa-solid fa-arrow-right"></i>
                    </div>
                  </div>
                </div>
              </div>
            `).join("")}
          </div>

          <!-- Bottom Summary Panel -->
          <div class="card">
            <h3 style="font-family:var(--font-heading); font-size:17px; font-weight:700; margin-bottom:12px;">
              <i class="fa-solid fa-bullhorn" style="color:#0066cc;"></i> Thông báo học tập
            </h3>
            <p style="font-size:13px; color:#64748b;">
              Hãy chọn lớp học của bạn ở trên để kiểm tra toàn bộ danh sách bài học và bài tập về nhà chưa hoàn thành.
            </p>
          </div>
        </div>
      </div>
    </div>
  `}function L(){var t;C(),document.querySelectorAll(".select-class-card").forEach(e=>{e.addEventListener("click",()=>{S=e.getAttribute("data-id");const n=document.getElementById("app");n&&(n.innerHTML=H(),L())})}),(t=document.getElementById("back-to-classes-btn"))==null||t.addEventListener("click",()=>{S=null;const e=document.getElementById("app");e&&(e.innerHTML=H(),L())})}function B(t,e,i=null){var a,d,o,c;let n=document.getElementById("modal-container");n||(n=document.createElement("div"),n.id="modal-container",document.body.appendChild(n)),n.innerHTML=`
    <div class="modal-backdrop" id="active-modal-backdrop">
      <div class="modal-content" onclick="event.stopPropagation()">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:20px; padding-bottom:14px; border-bottom:1px solid #e2e8f0;">
          <h3 style="font-family:var(--font-heading); font-size:20px; font-weight:700; color:#0f172a;">${t}</h3>
          <button id="modal-close-btn" style="background:none; border:none; font-size:20px; color:#94a3b8; cursor:pointer; padding:4px;"><i class="fa-solid fa-xmark"></i></button>
        </div>
        <div class="modal-body" style="margin-bottom:24px;">
          ${e}
        </div>
        <div style="display:flex; justify-content:flex-end; gap:12px; padding-top:14px; border-top:1px solid #f1f5f9;">
          <button id="modal-cancel-btn" class="btn-secondary" style="padding:10px 20px;">Hủy</button>
          ${i?'<button id="modal-confirm-btn" class="btn-primary" style="width:auto; padding:10px 24px; background:#0066cc;">Xác nhận</button>':""}
        </div>
      </div>
    </div>
  `;const s=()=>{n.innerHTML=""};(a=document.getElementById("modal-close-btn"))==null||a.addEventListener("click",s),(d=document.getElementById("modal-cancel-btn"))==null||d.addEventListener("click",s),(o=document.getElementById("active-modal-backdrop"))==null||o.addEventListener("click",s),i&&((c=document.getElementById("modal-confirm-btn"))==null||c.addEventListener("click",async()=>{await i()!==!1&&s()}))}window.openModal=B;function et(){const t=r.classes;return`
    <div class="app-layout">
      ${b("classes-admin")}
      <div class="main-content">
        ${x("Nền tảng / Bảng điều khiển")}
        <div class="content-body">
          <div class="page-header">
            <div>
              <h1 class="page-title">Quản lý lớp học</h1>
              <p class="page-description">Quản lý danh sách các lớp học, giáo viên phụ trách và phân bổ học sinh.</p>
            </div>
            <button class="btn-primary" id="open-create-class-btn" style="width:auto; cursor:pointer;">
              <i class="fa-solid fa-plus"></i> Tạo lớp học mới
            </button>
          </div>

          <div class="card">
            <!-- Filter Bar -->
            <div style="display:flex; gap:16px; margin-bottom:20px; align-items:center;">
              <div class="search-box" style="width:320px;">
                <i class="fa-solid fa-magnifying-glass"></i>
                <input type="text" id="class-search-input" placeholder="Tìm tên lớp hoặc giáo viên...">
              </div>
              <select id="category-filter-select" style="padding:10px 14px; border:1px solid var(--border-color); border-radius:10px; font-size:14px; outline:none; background:#ffffff;">
                <option value="">Tất cả phân loại</option>
                <option value="NÂNG CAO">Nâng cao</option>
                <option value="CƠ BẢN">Cơ bản</option>
              </select>
            </div>

            <!-- Class Data Table -->
            <div class="table-responsive">
              <table class="data-table">
                <thead>
                  <tr>
                    <th>Tên lớp học <i class="fa-solid fa-arrow-down-short-wide"></i></th>
                    <th>Phân loại</th>
                    <th>Tiết học</th>
                    <th>Giáo viên phụ trách</th>
                    <th>Số học sinh</th>
                    <th>Tiến độ</th>
                    <th>Thao tác</th>
                  </tr>
                </thead>
                <tbody id="classes-table-body">
                  ${t.map(e=>j(e)).join("")}
                </tbody>
              </table>
            </div>

            <!-- Summary Bar -->
            <div style="display:flex; align-items:center; justify-content:space-between; margin-top:20px; font-size:13px; color:#64748b;">
              <div id="class-count-summary">Hiển thị 1 đến ${t.length} trong tổng số ${t.length} lớp học</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  `}function j(t){return`
    <tr id="row-class-${t.id}">
      <td>
        <div style="font-weight:700; color:#0f172a;">${t.name}</div>
      </td>
      <td>
        <span class="badge" style="background:#e0f2fe; color:#0284c7; font-weight:600; font-size:12px; padding:4px 10px; border-radius:6px;">
          ${t.category}
        </span>
      </td>
      <td style="color:#475569; font-weight:500;">${t.period}</td>
      <td style="color:#334155; font-weight:600;"><i class="fa-regular fa-user" style="color:#0066cc;"></i> ${t.teacher}</td>
      <td style="font-weight:600; color:#0f172a;"><i class="fa-solid fa-users" style="color:#64748b;"></i> ${t.studentsCount} học sinh</td>
      <td>
        <div style="display:flex; align-items:center; gap:8px;">
          <div class="progress-bar-bg" style="width:100px; height:8px;">
            <div class="progress-bar-fill" style="width: ${t.progress}%;"></div>
          </div>
          <span style="font-size:12px; font-weight:700; color:#0066cc;">${t.progress}%</span>
        </div>
      </td>
      <td>
        <div style="display:flex; gap:10px;">
          <button class="btn-delete-class" data-id="${t.id}" data-name="${t.name}" title="Xóa lớp học" style="background:none; border:none; color:#ef4444; cursor:pointer;"><i class="fa-solid fa-trash"></i></button>
        </div>
      </td>
    </tr>
  `}function it(){B("Tạo Lớp Học Mới",`
    <form id="create-class-modal-form" onsubmit="return false;" style="display:flex; flex-direction:column; gap:16px;">
      <div>
        <label style="font-size:13px; font-weight:600; color:#334155; display:block; margin-bottom:6px;">
          <i class="fa-solid fa-book-bookmark" style="color:#0066cc;"></i> Tên lớp học <span style="color:#ef4444;">*</span>
        </label>
        <input type="text" id="modal-class-name" class="form-input" placeholder="Ví dụ: Sinh học 11" required>
      </div>

      <div>
        <label style="font-size:13px; font-weight:600; color:#334155; display:block; margin-bottom:6px;">
          <i class="fa-solid fa-sliders" style="color:#0066cc;"></i> Phân loại môn <span style="color:#ef4444;">*</span>
        </label>
        <select id="modal-class-category" class="form-input" style="background:#ffffff; cursor:pointer;" required>
          <option value="NÂNG CAO">NÂNG CAO</option>
          <option value="CƠ BẢN">CƠ BẢN</option>
        </select>
      </div>

      <div>
        <label style="font-size:13px; font-weight:600; color:#334155; display:block; margin-bottom:6px;">
          <i class="fa-regular fa-clock" style="color:#0066cc;"></i> Tiết học <span style="color:#ef4444;">*</span>
        </label>
        <input type="text" id="modal-class-period" class="form-input" placeholder="Ví dụ: Tiết 3" value="Tiết 1" required>
      </div>

      <div>
        <label style="font-size:13px; font-weight:600; color:#334155; display:block; margin-bottom:6px;">
          <i class="fa-regular fa-user" style="color:#0066cc;"></i> Giáo viên phụ trách <span style="color:#ef4444;">*</span>
        </label>
        <input type="text" id="modal-class-teacher" class="form-input" placeholder="Ví dụ: ThS. Nguyễn Văn A" required>
      </div>
    </form>
  `,async()=>{var d,o,c,l;const e=(d=document.getElementById("modal-class-name"))==null?void 0:d.value.trim(),i=(o=document.getElementById("modal-class-category"))==null?void 0:o.value,n=(c=document.getElementById("modal-class-period"))==null?void 0:c.value.trim(),s=(l=document.getElementById("modal-class-teacher"))==null?void 0:l.value.trim();if(!e||!n||!s)return f("Vui lòng nhập đầy đủ thông tin lớp học!","error"),!1;const a={id:"c_"+Date.now(),name:e,category:i||"CƠ BẢN",period:n,teacher:s,studentsCount:0,progress:0};r.classes.unshift(a),st(a),f(`Đã tạo thành công lớp học "${e}"!`,"success")})}function nt(){C(),M();const t=document.getElementById("open-create-class-btn");t&&t.addEventListener("click",s=>{s.preventDefault(),it()});const e=document.getElementById("class-search-input"),i=document.getElementById("category-filter-select"),n=()=>{const s=(e==null?void 0:e.value.toLowerCase().trim())||"",a=(i==null?void 0:i.value)||"",d=r.classes.filter(l=>{const p=!s||l.name.toLowerCase().includes(s)||l.teacher&&l.teacher.toLowerCase().includes(s),g=!a||l.category===a;return p&&g}),o=document.getElementById("classes-table-body");o&&(o.innerHTML=d.map(l=>j(l)).join(""));const c=document.getElementById("class-count-summary");c&&(c.textContent=`Hiển thị 1 đến ${d.length} trong tổng số ${r.classes.length} lớp học`),M()};e==null||e.addEventListener("input",n),i==null||i.addEventListener("change",n)}function st(t){const e=document.getElementById("classes-table-body");if(e){const n=document.createElement("tbody");n.innerHTML=j(t),n.firstElementChild&&e.prepend(n.firstElementChild)}const i=document.getElementById("class-count-summary");i&&(i.textContent=`Hiển thị 1 đến ${r.classes.length} trong tổng số ${r.classes.length} lớp học`),M()}function M(){document.querySelectorAll(".btn-delete-class").forEach(t=>{t.onclick=()=>{var n;const e=t.getAttribute("data-id"),i=t.getAttribute("data-name");confirm(`Bạn có chắc chắn muốn xóa lớp học ${i}?`)&&(r.classes=r.classes.filter(s=>s.id!==e),(n=document.getElementById(`row-class-${e}`))==null||n.remove(),f(`Đã xóa lớp học ${i}`,"success"))}})}function ot(){const t=r.students;return`
    <div class="app-layout">
      ${b("students")}
      <div class="main-content">
        ${x("Nền tảng / Bảng điều khiển")}
        <div class="content-body">
          <div class="page-header">
            <div>
              <h1 class="page-title">Quản lý học sinh</h1>
              <p class="page-description">Quản lý tài khoản học sinh, phân lớp và quyền truy cập.</p>
            </div>
            <button class="btn-primary" id="open-create-student-btn" onclick="window.showCreateStudentModal()" style="width:auto; cursor:pointer;">
              <i class="fa-solid fa-user-plus"></i> Tạo học sinh mới
            </button>
          </div>

          <div class="card">
            <!-- Filter Bar -->
            <div style="display:flex; gap:16px; margin-bottom:20px; align-items:center;">
              <div class="search-box" style="width:320px;">
                <i class="fa-solid fa-magnifying-glass"></i>
                <input type="text" id="student-search-input" placeholder="Tìm theo tên hoặc mã học sinh...">
              </div>
              <select id="class-filter-select" style="padding:10px 14px; border:1px solid var(--border-color); border-radius:10px; font-size:14px; outline:none; background:#ffffff;">
                <option value="">Tất cả các lớp</option>
                ${r.classes.map(e=>`<option value="${e.id}">${e.name}</option>`).join("")}
              </select>
              <button class="btn-secondary" style="margin-left:auto;"><i class="fa-solid fa-sliders"></i> Bộ lọc khác</button>
            </div>

            <!-- Student Data Table -->
            <div class="table-responsive">
              <table class="data-table">
                <thead>
                  <tr>
                    <th>Họ và tên <i class="fa-solid fa-arrow-down-short-wide"></i></th>
                    <th>Mã học sinh</th>
                    <th>Lớp học</th>
                    <th>Trạng thái</th>
                    <th>Ngày tạo</th>
                    <th>Thao tác</th>
                  </tr>
                </thead>
                <tbody id="students-table-body">
                  ${t.map(e=>P(e)).join("")}
                </tbody>
              </table>
            </div>

            <!-- Pagination Bar -->
            <div style="display:flex; align-items:center; justify-content:space-between; margin-top:20px; font-size:13px; color:#64748b;">
              <div id="student-count-summary">Hiển thị 1 đến ${t.length} trong tổng số ${t.length} học sinh</div>
              <div style="display:flex; gap:6px; align-items:center;">
                <button class="btn-secondary" style="padding:4px 10px;">&lt;</button>
                <button class="btn-primary" style="width:auto; padding:4px 12px; border-radius:6px;">1</button>
                <button class="btn-secondary" style="padding:4px 10px;">2</button>
                <button class="btn-secondary" style="padding:4px 10px;">3</button>
                <span>...</span>
                <button class="btn-secondary" style="padding:4px 10px;">12</button>
                <button class="btn-secondary" style="padding:4px 10px;">&gt;</button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  `}function P(t){const e=t.fullName.split(" ").map(i=>i[0]).join("").substring(0,2).toUpperCase();return`
    <tr id="row-student-${t.id}">
      <td>
        <div class="student-info-cell">
          <div class="avatar-circle">${e}</div>
          <div>
            <div style="font-weight:700; color:#0f172a;">${t.fullName}</div>
            <div style="font-size:12px; color:#64748b;">${t.email||`${t.username}@eduportal.vn`}</div>
          </div>
        </div>
      </td>
      <td style="font-family:monospace; font-weight:600; color:#334155;">${t.studentCode||"STU-8942"}</td>
      <td>
        <span style="background:#e0f2fe; color:#0369a1; padding:4px 10px; border-radius:6px; font-size:12px; font-weight:600;">
          ${t.className}
        </span>
      </td>
      <td>
        <span class="badge ${t.status==="Hoạt động"?"badge-active":"badge-inactive"}">
          <i class="fa-solid fa-circle" style="font-size:6px;"></i> ${t.status||"Hoạt động"}
        </span>
      </td>
      <td style="color:#64748b;">${t.createdAt||"Mới khởi tạo"}</td>
      <td>
        <div style="display:flex; gap:10px;">
          <button class="btn-reset-pw" data-id="${t.id}" data-name="${t.fullName}" title="Đặt lại mật khẩu" style="background:none; border:none; color:#0066cc; cursor:pointer;"><i class="fa-solid fa-key"></i></button>
          <button class="btn-delete-student" data-id="${t.id}" data-name="${t.fullName}" title="Xóa" style="background:none; border:none; color:#ef4444; cursor:pointer;"><i class="fa-solid fa-trash"></i></button>
        </div>
      </td>
    </tr>
  `}function K(){const e=`
    <form id="create-student-modal-form" onsubmit="return false;" style="display:flex; flex-direction:column; gap:16px;">
      <div>
        <label style="font-size:13px; font-weight:600; color:#334155; display:block; margin-bottom:6px;">
          <i class="fa-regular fa-user" style="color:#0066cc;"></i> Tên đăng nhập (Username) <span style="color:#ef4444;">*</span>
        </label>
        <input type="text" id="modal-student-username" class="form-input" placeholder="Ví dụ: nguyen_van_a" required>
      </div>

      <div>
        <label style="font-size:13px; font-weight:600; color:#334155; display:block; margin-bottom:6px;">
          <i class="fa-solid fa-lock" style="color:#0066cc;"></i> Mật khẩu (Password) <span style="color:#ef4444;">*</span>
        </label>
        <input type="password" id="modal-student-password" class="form-input" placeholder="Tối thiểu 6 ký tự" required>
      </div>

      <div>
        <label style="font-size:13px; font-weight:600; color:#334155; display:block; margin-bottom:6px;">
          <i class="fa-solid fa-id-card" style="color:#0066cc;"></i> Tên học sinh (Họ và tên) <span style="color:#ef4444;">*</span>
        </label>
        <input type="text" id="modal-student-fullname" class="form-input" placeholder="Ví dụ: Nguyễn Văn An" required>
      </div>

      <div>
        <label style="font-size:13px; font-weight:600; color:#334155; display:block; margin-bottom:6px;">
          <i class="fa-solid fa-graduation-cap" style="color:#0066cc;"></i> Chọn lớp học (Danh sách lớp đã có) <span style="color:#ef4444;">*</span>
        </label>
        <select id="modal-student-class" class="form-input" style="background:#ffffff; cursor:pointer;" required>
          ${r.classes.length>0?r.classes.map(i=>`<option value="${i.id}">${i.name} (${i.teacher||"Giáo viên lớp"})</option>`).join(""):'<option value="">Chưa có lớp học</option>'}
        </select>
      </div>
    </form>
  `;B("Tạo Học Sinh Mới",e,async()=>{var c,l,p,g;const i=(c=document.getElementById("modal-student-username"))==null?void 0:c.value.trim(),n=(l=document.getElementById("modal-student-password"))==null?void 0:l.value.trim(),s=(p=document.getElementById("modal-student-fullname"))==null?void 0:p.value.trim(),a=(g=document.getElementById("modal-student-class"))==null?void 0:g.value;if(!i||!n||!s||!a)return f("Vui lòng nhập đầy đủ Username, Password, Tên học sinh và Chọn lớp!","error"),!1;const d=r.classes.find(y=>y.id===a),o=d?d.name:"Toán 11";try{f("Đang tạo tài khoản học sinh...","info");const v={id:(await A.createStudent({username:i,password:n,fullName:s,classId:a})).id||"s_"+Date.now(),username:i,fullName:s,studentCode:"STU-"+Math.floor(1e3+Math.random()*9e3),email:`${i}@eduportal.vn`,className:o,classId:a,status:"Hoạt động",createdAt:new Date().toLocaleDateString("vi-VN")};r.students.unshift(v),V(v),f(`Tạo thành công học sinh "${s}" cho lớp ${o}!`,"success")}catch{const v={id:"s_"+Date.now(),username:i,fullName:s,studentCode:"STU-"+Math.floor(1e3+Math.random()*9e3),email:`${i}@eduportal.vn`,className:o,classId:a,status:"Hoạt động",createdAt:new Date().toLocaleDateString("vi-VN")};r.students.unshift(v),V(v),f(`Tạo thành công học sinh "${s}" cho lớp ${o}! (Chế độ Demo)`,"success")}})}window.showCreateStudentModal=K;function at(){C(),q();const t=document.getElementById("open-create-student-btn");t&&t.addEventListener("click",s=>{s.preventDefault(),K()});const e=document.getElementById("student-search-input"),i=document.getElementById("class-filter-select"),n=()=>{const s=(e==null?void 0:e.value.toLowerCase().trim())||"",a=(i==null?void 0:i.value)||"",d=r.students.filter(l=>{const p=!s||l.fullName.toLowerCase().includes(s)||l.studentCode&&l.studentCode.toLowerCase().includes(s)||l.username&&l.username.toLowerCase().includes(s),g=!a||l.classId===a;return p&&g}),o=document.getElementById("students-table-body");o&&(o.innerHTML=d.map(l=>P(l)).join(""));const c=document.getElementById("student-count-summary");c&&(c.textContent=`Hiển thị 1 đến ${d.length} trong tổng số ${r.students.length} học sinh`),q()};e==null||e.addEventListener("input",n),i==null||i.addEventListener("change",n)}function V(t){const e=document.getElementById("students-table-body");if(e){const n=document.createElement("tbody");n.innerHTML=P(t),n.firstElementChild&&e.prepend(n.firstElementChild)}const i=document.getElementById("student-count-summary");i&&(i.textContent=`Hiển thị 1 đến ${r.students.length} trong tổng số ${r.students.length} học sinh`),q()}function q(){document.querySelectorAll(".btn-reset-pw").forEach(t=>{t.onclick=()=>{const e=t.getAttribute("data-name");f(`Đã gửi liên kết đặt lại mật khẩu cho ${e}`,"info")}}),document.querySelectorAll(".btn-delete-student").forEach(t=>{t.onclick=()=>{var n;const e=t.getAttribute("data-id"),i=t.getAttribute("data-name");confirm(`Bạn có chắc chắn muốn xóa học sinh ${i}?`)&&(r.students=r.students.filter(s=>s.id!==e),(n=document.getElementById(`row-student-${e}`))==null||n.remove(),f(`Đã xóa học sinh ${i}`,"success"))}})}let u={mcCount:10,tfCount:4,saCount:2},E={},k={},I={};function dt(){E={};for(let t=1;t<=u.mcCount;t++)E[t]="A";k={};for(let t=1;t<=u.tfCount;t++)k[t]={a:!0,b:!0,c:!1,d:!0};I={};for(let t=1;t<=u.saCount;t++)I[t]=""}dt();function lt(){const t=r.classes.map(e=>`<option value="${e.id}">${e.name}</option>`).join("");return`
    <div class="app-layout">
      ${b("create-homework")}
      <div class="main-content">
        ${x("Nền tảng / Bảng điều khiển")}
        <div class="content-body">
          <div class="page-header">
            <div>
              <h1 class="page-title">Tạo bài tập về nhà mới</h1>
              <p class="page-description">Cấu hình số lượng câu hỏi và nhập đáp án chuẩn cho 3 loại bài tập (Trắc nghiệm ABCD, Đúng/Sai 4 ý, Trả lời ngắn).</p>
            </div>
            <button class="btn-primary" id="save-homework-btn" style="width:auto;">
              <i class="fa-solid fa-cloud-arrow-up"></i> Lưu & Xuất bản bài tập
            </button>
          </div>

          <!-- General Homework Info -->
          <div class="card">
            <h3 style="font-family:var(--font-heading); font-size:18px; font-weight:700; margin-bottom:16px;">
              <i class="fa-regular fa-clipboard" style="color:#0066cc;"></i> Thông tin chung bài tập
            </h3>

            <div style="display:flex; flex-direction:column; gap:16px;">
              <div class="grid-3">
                <div style="grid-column: span 2;">
                  <label style="font-size:13px; font-weight:600; display:block; margin-bottom:6px;">Tên bài tập <span style="color:#ef4444;">*</span></label>
                  <input type="text" id="hw-title" class="form-input" placeholder="Ví dụ: Kiểm tra Chương 3: Con lắc đơn & Động lực học" value="Bài tập Kiểm tra Tổng hợp">
                </div>
                <div>
                  <label style="font-size:13px; font-weight:600; display:block; margin-bottom:6px;">Chọn lớp học <span style="color:#ef4444;">*</span></label>
                  <select id="hw-class-select" class="form-input" style="background:#ffffff; cursor:pointer;">
                    ${t}
                  </select>
                </div>
              </div>

              <div class="grid-3">
                <div>
                  <label style="font-size:13px; font-weight:600; display:block; margin-bottom:6px;">Thời gian làm bài (Phút)</label>
                  <input type="number" id="hw-duration" class="form-input" value="45" min="5">
                </div>
                <div style="grid-column: span 2;">
                  <label style="font-size:13px; font-weight:600; display:block; margin-bottom:6px;">Tài liệu đính kèm (File đề bài PDF)</label>
                  <input type="file" id="hw-pdf-file" accept=".pdf" class="form-input" style="padding:7px 12px; background:#ffffff;">
                </div>
              </div>
            </div>
          </div>

          <!-- Config Section: Select Quantities for 3 Question Types -->
          <div class="card" style="border:2px solid #e0f2fe; background:#fafdfm;">
            <h3 style="font-family:var(--font-heading); font-size:18px; font-weight:700; color:#0369a1; margin-bottom:14px; display:flex; align-items:center; gap:8px;">
              <i class="fa-solid fa-sliders"></i> Cấu hình số lượng câu hỏi theo loại
            </h3>
            
            <div class="grid-3" style="margin-bottom:16px;">
              <div style="background:#ffffff; padding:14px; border:1px solid #e2e8f0; border-radius:12px;">
                <label style="font-size:13px; font-weight:700; color:#0f172a; display:block; margin-bottom:6px;">
                  1. Trắc nghiệm A/B/C/D
                </label>
                <div style="display:flex; align-items:center; gap:10px;">
                  <input type="number" id="cfg-mc-count" class="form-input" value="${u.mcCount}" min="0" max="100" style="font-weight:700; text-align:center;">
                  <span style="font-size:13px; color:#64748b;">Câu</span>
                </div>
              </div>

              <div style="background:#ffffff; padding:14px; border:1px solid #e2e8f0; border-radius:12px;">
                <label style="font-size:13px; font-weight:700; color:#0f172a; display:block; margin-bottom:6px;">
                  2. Đúng / Sai (4 ý / câu)
                </label>
                <div style="display:flex; align-items:center; gap:10px;">
                  <input type="number" id="cfg-tf-count" class="form-input" value="${u.tfCount}" min="0" max="50" style="font-weight:700; text-align:center;">
                  <span style="font-size:13px; color:#64748b;">Câu</span>
                </div>
              </div>

              <div style="background:#ffffff; padding:14px; border:1px solid #e2e8f0; border-radius:12px;">
                <label style="font-size:13px; font-weight:700; color:#0f172a; display:block; margin-bottom:6px;">
                  3. Trả lời ngắn
                </label>
                <div style="display:flex; align-items:center; gap:10px;">
                  <input type="number" id="cfg-sa-count" class="form-input" value="${u.saCount}" min="0" max="50" style="font-weight:700; text-align:center;">
                  <span style="font-size:13px; color:#64748b;">Câu</span>
                </div>
              </div>
            </div>

            <div style="text-align:right;">
              <button class="btn-primary" id="update-config-btn" style="width:auto; padding:8px 20px; background:#0066cc;">
                <i class="fa-solid fa-arrows-rotate"></i> Cập nhật số lượng câu hỏi
              </button>
            </div>
          </div>

          <!-- Answer Key Matrix Section -->
          <div id="answer-matrix-container">
            ${X()}
          </div>
        </div>
      </div>
    </div>
  `}function X(){return`
    <!-- PART 1: Multiple Choice ABCD -->
    <div class="card">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px; padding-bottom:12px; border-bottom:1px solid #f1f5f9;">
        <h3 style="font-family:var(--font-heading); font-size:18px; font-weight:700; color:#0f172a;">
          <span style="background:#0066cc; color:#ffffff; padding:4px 10px; border-radius:8px; font-size:14px; margin-right:8px;">Phần I</span>
          Trắc nghiệm A/B/C/D (${u.mcCount} Câu)
        </h3>
        <span style="font-size:13px; color:#64748b;">Chọn 1 đáp án đúng cho mỗi câu</span>
      </div>

      ${u.mcCount===0?`
        <div style="font-size:13px; color:#94a3b8; text-align:center; padding:16px;">Không có câu hỏi Trắc nghiệm ABCD.</div>
      `:`
        <div style="display:grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap:14px;">
          ${Array.from({length:u.mcCount},(t,e)=>e+1).map(t=>{const e=E[t]||"A";return`
              <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:12px; padding:12px; display:flex; align-items:center; justify-content:space-between;">
                <span style="font-weight:700; font-size:15px; color:#334155; width:60px;">Câu ${t}</span>
                <div style="display:flex; gap:6px;">
                  ${["A","B","C","D"].map(i=>`
                    <button type="button" class="mc-option-btn ${e===i?"active":""}" data-qnum="${t}" data-option="${i}" style="
                      width:32px; height:32px; border-radius:8px; border:1px solid ${e===i?"#0066cc":"#cbd5e1"};
                      background:${e===i?"#0066cc":"#ffffff"};
                      color:${e===i?"#ffffff":"#334155"};
                      font-weight:700; font-size:13px; cursor:pointer; transition:all 0.15s ease;
                    ">${i}</button>
                  `).join("")}
                </div>
              </div>
            `}).join("")}
        </div>
      `}
    </div>

    <!-- PART 2: True / False (4 sub-items: a, b, c, d) -->
    <div class="card">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px; padding-bottom:12px; border-bottom:1px solid #f1f5f9;">
        <h3 style="font-family:var(--font-heading); font-size:18px; font-weight:700; color:#0f172a;">
          <span style="background:#0284c7; color:#ffffff; padding:4px 10px; border-radius:8px; font-size:14px; margin-right:8px;">Phần II</span>
          Trắc nghiệm Đúng / Sai (${u.tfCount} Câu - Mỗi câu 4 ý a, b, c, d)
        </h3>
        <span style="font-size:13px; color:#64748b;">Chọn Đúng (Đ) hoặc Sai (S) cho từng ý</span>
      </div>

      ${u.tfCount===0?`
        <div style="font-size:13px; color:#94a3b8; text-align:center; padding:16px;">Không có câu hỏi Đúng / Sai.</div>
      `:`
        <div style="display:grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap:16px;">
          ${Array.from({length:u.tfCount},(t,e)=>e+1).map(t=>{const e=k[t]||{a:!0,b:!0,c:!1,d:!0};return`
              <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:12px; padding:14px;">
                <div style="font-weight:700; font-size:15px; color:#0f172a; margin-bottom:10px; border-bottom:1px solid #e2e8f0; padding-bottom:6px;">
                  Câu ${t}
                </div>

                <div style="display:flex; flex-direction:column; gap:8px;">
                  ${["a","b","c","d"].map(i=>{const n=e[i]!==!1;return`
                      <div style="display:flex; justify-content:space-between; align-items:center; background:#ffffff; padding:6px 12px; border-radius:8px; border:1px solid #f1f5f9;">
                        <span style="font-weight:600; font-size:13px; color:#334155;">Ý ${i})</span>
                        <div style="display:flex; gap:6px;">
                          <button type="button" class="tf-option-btn ${n?"active-true":""}" data-qnum="${t}" data-sub="${i}" data-val="true" style="
                            padding:4px 14px; border-radius:6px; font-weight:700; font-size:12px; cursor:pointer;
                            border:1px solid ${n?"#16a34a":"#cbd5e1"};
                            background:${n?"#16a34a":"#ffffff"};
                            color:${n?"#ffffff":"#475569"};
                          ">Đúng</button>
                          
                          <button type="button" class="tf-option-btn ${n?"":"active-false"}" data-qnum="${t}" data-sub="${i}" data-val="false" style="
                            padding:4px 14px; border-radius:6px; font-weight:700; font-size:12px; cursor:pointer;
                            border:1px solid ${n?"#cbd5e1":"#dc2626"};
                            background:${n?"#ffffff":"#dc2626"};
                            color:${n?"#475569":"#ffffff"};
                          ">Sai</button>
                        </div>
                      </div>
                    `}).join("")}
                </div>
              </div>
            `}).join("")}
        </div>
      `}
    </div>

    <!-- PART 3: Short Answer -->
    <div class="card">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px; padding-bottom:12px; border-bottom:1px solid #f1f5f9;">
        <h3 style="font-family:var(--font-heading); font-size:18px; font-weight:700; color:#0f172a;">
          <span style="background:#059669; color:#ffffff; padding:4px 10px; border-radius:8px; font-size:14px; margin-right:8px;">Phần III</span>
          Trả lời ngắn (${u.saCount} Câu)
        </h3>
        <span style="font-size:13px; color:#64748b;">Nhập đáp án số hoặc chuỗi văn bản chuẩn</span>
      </div>

      ${u.saCount===0?`
        <div style="font-size:13px; color:#94a3b8; text-align:center; padding:16px;">Không có câu hỏi Trả lời ngắn.</div>
      `:`
        <div style="display:grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap:14px;">
          ${Array.from({length:u.saCount},(t,e)=>e+1).map(t=>{const e=I[t]||"";return`
              <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:12px; padding:12px;">
                <div style="font-weight:700; font-size:14px; color:#0f172a; margin-bottom:6px;">Câu ${t}</div>
                <input type="text" class="form-input sa-input" data-qnum="${t}" value="${e}" placeholder="Nhập đáp án chuẩn..." style="background:#ffffff;">
              </div>
            `}).join("")}
        </div>
      `}
    </div>
  `}function ct(){var e,i;C();const t=()=>{var o,c,l;const n=parseInt(((o=document.getElementById("cfg-mc-count"))==null?void 0:o.value)||"0",10),s=parseInt(((c=document.getElementById("cfg-tf-count"))==null?void 0:c.value)||"0",10),a=parseInt(((l=document.getElementById("cfg-sa-count"))==null?void 0:l.value)||"0",10);u.mcCount=Math.max(0,n),u.tfCount=Math.max(0,s),u.saCount=Math.max(0,a);for(let p=1;p<=u.mcCount;p++)E[p]||(E[p]="A");for(let p=1;p<=u.tfCount;p++)k[p]||(k[p]={a:!0,b:!0,c:!1,d:!0});for(let p=1;p<=u.saCount;p++)I[p]===void 0&&(I[p]="");const d=document.getElementById("answer-matrix-container");d&&(d.innerHTML=X(),G())};(e=document.getElementById("update-config-btn"))==null||e.addEventListener("click",()=>{t(),f("Đã cập nhật số lượng câu hỏi và bảng đáp án!","info")}),G(),(i=document.getElementById("save-homework-btn"))==null||i.addEventListener("click",async()=>{var g,y,v;const n=(g=document.getElementById("hw-title"))==null?void 0:g.value.trim(),s=(y=document.getElementById("hw-class-select"))==null?void 0:y.value,a=parseInt(((v=document.getElementById("hw-duration"))==null?void 0:v.value)||"45",10);if(!n){f("Vui lòng nhập tên bài tập!","error");return}const d=u.mcCount+u.tfCount+u.saCount;if(d===0){f("Bài tập phải có ít nhất 1 câu hỏi!","error");return}const o=[];let c=1;for(let h=1;h<=u.mcCount;h++)o.push({id:`q_${c}`,questionNumber:c,questionType:"MULTIPLE_CHOICE",mcAnswer:E[h]||"A",points:1}),c++;for(let h=1;h<=u.tfCount;h++)o.push({id:`q_${c}`,questionNumber:c,questionType:"TRUE_FALSE",tfAnswers:k[h]||{a:!0,b:!0,c:!1,d:!0},points:1}),c++;for(let h=1;h<=u.saCount;h++)o.push({id:`q_${c}`,questionNumber:c,questionType:"SHORT_ANSWER",saAnswer:I[h]||"",points:1}),c++;const l=r.classes.find(h=>h.id===s),p={id:"hw_"+Date.now(),title:n,classId:s,className:(l==null?void 0:l.name)||"Toán 11",durationMinutes:a,totalQuestions:d,questions:o};r.homeworks.unshift(p);try{f("Đang lưu cấu hình bài tập...","info"),await A.createHomework({lessonId:"00000000-0000-0000-0000-000000000000",title:n,pdfPath:"Homework_Attachment.pdf",durationMinutes:a,passScore:5,maxScore:10,isPublished:!0,questions:o}),f(`Đã xuất bản bài tập "${n}" thành công!`,"success"),window.location.hash="#homework-attempt"}catch{f(`Đã tạo bài tập "${n}" thành công (Chế độ Demo)!`,"success"),window.location.hash="#homework-attempt"}})}function G(){document.querySelectorAll(".mc-option-btn").forEach(t=>{t.addEventListener("click",()=>{const e=parseInt(t.getAttribute("data-qnum"),10),i=t.getAttribute("data-option");E[e]=i,document.querySelectorAll(`.mc-option-btn[data-qnum="${e}"]`).forEach(n=>{const s=n.getAttribute("data-option")===i;n.style.background=s?"#0066cc":"#ffffff",n.style.color=s?"#ffffff":"#334155",n.style.borderColor=s?"#0066cc":"#cbd5e1"})})}),document.querySelectorAll(".tf-option-btn").forEach(t=>{t.addEventListener("click",()=>{const e=parseInt(t.getAttribute("data-qnum"),10),i=t.getAttribute("data-sub"),n=t.getAttribute("data-val")==="true";k[e]||(k[e]={a:!0,b:!0,c:!1,d:!0}),k[e][i]=n;const s=t.parentElement;s&&s.querySelectorAll(".tf-option-btn").forEach(a=>{a.getAttribute("data-val")===(n?"true":"false")?(a.style.background=n?"#16a34a":"#dc2626",a.style.color="#ffffff",a.style.borderColor=n?"#16a34a":"#dc2626"):(a.style.background="#ffffff",a.style.color="#475569",a.style.borderColor="#cbd5e1")})})}),document.querySelectorAll(".sa-input").forEach(t=>{t.addEventListener("input",e=>{const i=parseInt(t.getAttribute("data-qnum"),10);I[i]=e.target.value})})}var F;let $=((F=r.classes[0])==null?void 0:F.id)||"c1";function T(){var a;const t=r.classes.find(d=>d.id===$)||r.classes[0]||{id:"c1",name:"Toán 11: Đại số & Giải tích",teacher:"ThS. Nguyễn Văn Thắng",studentsCount:28},i=(((a=r.curriculums)==null?void 0:a.find(d=>d.classId===t.id))||{chapters:[]}).chapters||[],n=i.reduce((d,o)=>{var c;return d+(((c=o.lessons)==null?void 0:c.length)||0)},0),s=r.classes.map(d=>`
    <option value="${d.id}" ${d.id===t.id?"selected":""}>
      ${d.name} (${d.teacher})
    </option>
  `).join("");return`
    <div class="app-layout">
      ${b("curriculum")}
      <div class="main-content">
        ${x("Nền tảng / Bảng điều khiển")}
        <div class="content-body">
          <!-- Class Selector Header Bar -->
          <div class="card" style="margin-bottom:20px; padding:16px 20px; display:flex; justify-content:space-between; align-items:center;">
            <div style="display:flex; align-items:center; gap:12px;">
              <i class="fa-solid fa-graduation-cap" style="font-size:20px; color:#0066cc;"></i>
              <span style="font-weight:700; font-size:15px; color:#0f172a;">Chọn lớp học quản lý:</span>
            </div>
            <select id="curriculum-class-select" style="padding:10px 16px; border:2px solid #0066cc; border-radius:10px; font-weight:700; font-size:14px; color:#0066cc; outline:none; background:#ffffff; cursor:pointer; min-width:280px;">
              ${s}
            </select>
          </div>

          <!-- Course Header Banner -->
          <div class="card" style="display:flex; justify-content:space-between; align-items:center; background:linear-gradient(135deg, #ffffff 0%, #f0f7ff 100%); margin-bottom:24px;">
            <div style="display:flex; align-items:center; gap:20px;">
              <div style="width:56px; height:56px; background:#0066cc; color:#ffffff; border-radius:14px; display:flex; align-items:center; justify-content:center; font-size:24px;">
                <i class="fa-solid fa-book-open"></i>
              </div>
              <div>
                <h1 class="page-title" style="font-size:22px;">${t.name}</h1>
                <div style="font-size:13px; color:#64748b; margin-top:2px;">
                  <i class="fa-regular fa-user"></i> ${t.teacher} &nbsp;•&nbsp; <i class="fa-solid fa-users"></i> ${t.studentsCount||0} Học sinh
                </div>
              </div>
            </div>

            <div style="display:flex; gap:16px; text-align:center;">
              <div style="background:#e0f2fe; padding:10px 20px; border-radius:12px;">
                <div style="font-size:11px; font-weight:700; color:#0369a1; text-transform:uppercase;">Chương</div>
                <div style="font-family:var(--font-heading); font-size:22px; font-weight:700; color:#0284c7;">${i.length}</div>
              </div>
              <div style="background:#e0f2fe; padding:10px 20px; border-radius:12px;">
                <div style="font-size:11px; font-weight:700; color:#0369a1; text-transform:uppercase;">Bài học</div>
                <div style="font-family:var(--font-heading); font-size:22px; font-weight:700; color:#0284c7;">${n}</div>
              </div>
              <div style="background:#e0f2fe; padding:10px 20px; border-radius:12px;">
                <div style="font-size:11px; font-weight:700; color:#0369a1; text-transform:uppercase;">Tiến độ</div>
                <div style="font-family:var(--font-heading); font-size:22px; font-weight:700; color:#0284c7;">${t.progress||0}%</div>
              </div>
            </div>
          </div>

          <!-- Main Grid: Curriculum Plan + Sidebar Panels -->
          <div class="grid-3">
            <div style="grid-column: span 2;">
              <div class="page-header" style="margin-bottom:16px;">
                <h2 style="font-family:var(--font-heading); font-size:20px; font-weight:700;">Chương trình & Kế hoạch giảng dạy</h2>
                <button class="btn-primary" id="add-chapter-btn" style="width:auto; padding:8px 16px;">
                  <i class="fa-solid fa-plus"></i> Tạo chương mới
                </button>
              </div>

              <div id="chapters-container">
                ${i.length===0?`
                  <div class="card" style="text-align:center; padding:32px; color:#64748b;">
                    <i class="fa-solid fa-folder-open" style="font-size:36px; color:#94a3b8; margin-bottom:12px;"></i>
                    <p style="font-weight:600;">Chưa có chương học nào cho lớp học này.</p>
                    <p style="font-size:13px; margin-top:4px;">Nhấn nút "Tạo chương mới" ở trên để bắt đầu thêm bài học.</p>
                  </div>
                `:i.map(d=>rt(d)).join("")}
              </div>
            </div>

            <!-- Right Column Panels -->
            <div>
              <div class="card">
                <h3 style="font-family:var(--font-heading); font-size:16px; font-weight:700; margin-bottom:14px;">Thao tác nhanh</h3>
                <div style="display:flex; flex-direction:column; gap:10px;">
                  <button class="btn-secondary" style="justify-content:flex-start;" onclick="window.location.hash='#create-homework'"><i class="fa-solid fa-file-export"></i> Tạo bài tập mới</button>
                  <button class="btn-secondary" style="justify-content:flex-start;" onclick="alert('Tính năng nhập file Excel đang được phát triển')"><i class="fa-solid fa-file-import"></i> Nhập chương trình học</button>
                  <button class="btn-secondary" style="justify-content:flex-start;" onclick="window.print()"><i class="fa-solid fa-print"></i> Xuất đề cương học tập</button>
                </div>
              </div>

              <div class="card" style="text-align:center;">
                <h3 style="font-family:var(--font-heading); font-size:16px; font-weight:700; margin-bottom:14px;">Độ phủ đề cương</h3>
                <div style="width:100px; height:100px; border-radius:50%; border:8px solid #0066cc; border-right-color:#e2e8f0; border-bottom-color:#e2e8f0; display:flex; align-items:center; justify-content:center; margin:0 auto 12px auto; font-family:var(--font-heading); font-size:22px; font-weight:700; color:#0066cc;">
                  ${i.length>0?Math.min(100,i.length*25):0}%
                </div>
                <div style="font-size:13px; color:#64748b;">${i.length} Chương đang hoạt động</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  `}function rt(t){var e;return`
    <div class="card" style="padding:18px; margin-bottom:16px;" id="chapter-card-${t.id}">
      <div style="display:flex; justify-content:space-between; align-items:center;">
        <div>
          <span style="background:#e0f2fe; color:#0369a1; font-size:11px; font-weight:700; padding:2px 8px; border-radius:4px; text-transform:uppercase;">${t.code||"CHƯƠNG"}</span>
          <h3 style="font-size:17px; font-weight:700; color:#0f172a; margin-top:4px;">${t.title}</h3>
          <div style="font-size:12px; color:#64748b;">${((e=t.lessons)==null?void 0:e.length)||0} Bài học</div>
        </div>
        <button class="btn-delete-chapter" data-id="${t.id}" title="Xóa chương" style="background:none; border:none; color:#ef4444; cursor:pointer; font-size:16px;">
          <i class="fa-solid fa-trash"></i>
        </button>
      </div>

      <div style="margin-top:16px; padding-top:16px; border-top:1px solid #f1f5f9; display:flex; flex-direction:column; gap:12px;">
        ${(t.lessons||[]).map(i=>`
          <div style="display:flex; align-items:center; justify-content:space-between; padding:12px; background:#f8fafc; border-radius:10px;">
            <div style="display:flex; align-items:center; gap:12px;">
              <span style="width:28px; height:28px; background:#ffffff; border:1px solid #cbd5e1; border-radius:50%; display:flex; align-items:center; justify-content:center; font-size:12px; font-weight:700;">${i.code||"1.1"}</span>
              <div>
                <div style="font-weight:600; font-size:14px;">${i.title}</div>
                <div style="font-size:12px; color:#64748b;">
                  <i class="fa-regular fa-file"></i> ${i.hwCount||0} Bài tập &nbsp;•&nbsp; 
                  <i class="fa-solid fa-paperclip"></i> ${i.refCount||0} Tài liệu tham khảo
                  ${i.missingDocs?'&nbsp;•&nbsp; <span style="color:#ef4444; font-weight:600;"><i class="fa-solid fa-triangle-exclamation"></i> Thiếu tài liệu</span>':""}
                </div>
              </div>
            </div>
            <button class="btn-secondary btn-edit-lesson" data-chapter-id="${t.id}" data-lesson-id="${i.id}" style="padding:4px 10px; font-size:12px; cursor:pointer;"><i class="fa-solid fa-pen-to-square"></i> Sửa</button>
          </div>
        `).join("")}

        <div style="text-align:center; padding-top:4px;">
          <button class="btn-secondary btn-add-lesson" data-chapter-id="${t.id}" style="font-size:12px; border:dashed 1px #cbd5e1; color:#0066cc;">
            <i class="fa-solid fa-plus"></i> Thêm bài học vào ${t.title}
          </button>
        </div>
      </div>
    </div>
  `}function z(){var e;C();const t=document.getElementById("curriculum-class-select");t&&t.addEventListener("change",i=>{$=i.target.value;const n=document.getElementById("app");n&&(n.innerHTML=T(),z())}),(e=document.getElementById("add-chapter-btn"))==null||e.addEventListener("click",()=>{B("Thêm Chương Mới",`
      <div style="display:flex; flex-direction:column; gap:14px;">
        <div>
          <label style="font-size:13px; font-weight:600; display:block; margin-bottom:6px;">Mã chương</label>
          <input type="text" id="modal-chapter-code" class="form-input" placeholder="Ví dụ: CHƯƠNG 3">
        </div>
        <div>
          <label style="font-size:13px; font-weight:600; display:block; margin-bottom:6px;">Tên chương <span style="color:#ef4444;">*</span></label>
          <input type="text" id="modal-chapter-title" class="form-input" placeholder="Ví dụ: Phương trình & Hệ phương trình" required>
        </div>
      </div>
    `,async()=>{var c,l;const n=((c=document.getElementById("modal-chapter-code"))==null?void 0:c.value.trim())||"CHƯƠNG",s=(l=document.getElementById("modal-chapter-title"))==null?void 0:l.value.trim();if(!s)return f("Vui lòng nhập tên chương học!","error"),!1;let a=r.curriculums.find(p=>p.classId===$);a||(a={classId:$,chapters:[]},r.curriculums.push(a));const d={id:"ch_"+Date.now(),code:n,title:s,lessons:[]};a.chapters.push(d),f(`Đã thêm thành công chương "${s}"!`,"success");const o=document.getElementById("app");o&&(o.innerHTML=T(),z())})}),document.querySelectorAll(".btn-edit-lesson").forEach(i=>{i.addEventListener("click",()=>{const n=i.getAttribute("data-chapter-id"),s=i.getAttribute("data-lesson-id"),a=r.curriculums.find(l=>l.classId===$),d=a==null?void 0:a.chapters.find(l=>l.id===n),o=d==null?void 0:d.lessons.find(l=>l.id===s);if(!o)return;const c=`
        <div style="display:flex; flex-direction:column; gap:14px;">
          <div>
            <label style="font-size:13px; font-weight:600; display:block; margin-bottom:6px;">Mã bài học</label>
            <input type="text" id="modal-edit-lesson-code" class="form-input" value="${o.code||"1.1"}" placeholder="Ví dụ: 1.1">
          </div>
          <div>
            <label style="font-size:13px; font-weight:600; display:block; margin-bottom:6px;">Tên bài học <span style="color:#ef4444;">*</span></label>
            <input type="text" id="modal-edit-lesson-title" class="form-input" value="${o.title||""}" placeholder="Nhập tên bài học..." required>
          </div>
          <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px;">
            <div>
              <label style="font-size:13px; font-weight:600; display:block; margin-bottom:6px;">Số bài tập</label>
              <input type="number" id="modal-edit-lesson-hw" class="form-input" value="${o.hwCount||0}" min="0">
            </div>
            <div>
              <label style="font-size:13px; font-weight:600; display:block; margin-bottom:6px;">Tài liệu tham khảo</label>
              <input type="number" id="modal-edit-lesson-ref" class="form-input" value="${o.refCount||0}" min="0">
            </div>
          </div>
          <div style="padding-top:10px; border-top:1px solid #e2e8f0; display:flex; justify-content:space-between; align-items:center;">
            <button id="modal-delete-lesson-btn" type="button" class="btn-secondary" style="color:#ef4444; border-color:#fca5a5;"><i class="fa-solid fa-trash"></i> Xóa bài học này</button>
          </div>
        </div>
      `;B("Chỉnh Sửa Bài Học",c,async()=>{var h,_,D,O;const l=((h=document.getElementById("modal-edit-lesson-code"))==null?void 0:h.value.trim())||"1.1",p=(_=document.getElementById("modal-edit-lesson-title"))==null?void 0:_.value.trim(),g=parseInt(((D=document.getElementById("modal-edit-lesson-hw"))==null?void 0:D.value)||"0",10),y=parseInt(((O=document.getElementById("modal-edit-lesson-ref"))==null?void 0:O.value)||"0",10);if(!p)return f("Vui lòng nhập tên bài học!","error"),!1;o.code=l,o.title=p,o.hwCount=g,o.refCount=y,f(`Cập nhật bài học "${p}" thành công!`,"success");const v=document.getElementById("app");v&&(v.innerHTML=T(),z())}),setTimeout(()=>{var l;(l=document.getElementById("modal-delete-lesson-btn"))==null||l.addEventListener("click",()=>{var p;if(confirm(`Bạn có chắc chắn muốn xóa bài học "${o.title}"?`)){d.lessons=d.lessons.filter(y=>y.id!==s),(p=document.getElementById("modal-close-btn"))==null||p.click(),f("Đã xóa bài học","success");const g=document.getElementById("app");g&&(g.innerHTML=T(),z())}})},50)})}),document.querySelectorAll(".btn-add-lesson").forEach(i=>{i.addEventListener("click",()=>{const n=i.getAttribute("data-chapter-id");B("Thêm Bài Học Mới",`
        <div style="display:flex; flex-direction:column; gap:14px;">
          <div>
            <label style="font-size:13px; font-weight:600; display:block; margin-bottom:6px;">Mã bài học</label>
            <input type="text" id="modal-lesson-code" class="form-input" placeholder="Ví dụ: 1.3">
          </div>
          <div>
            <label style="font-size:13px; font-weight:600; display:block; margin-bottom:6px;">Tên bài học <span style="color:#ef4444;">*</span></label>
            <input type="text" id="modal-lesson-title" class="form-input" placeholder="Ví dụ: Bài tập tự luyện tổng hợp" required>
          </div>
        </div>
      `,async()=>{var l,p;const a=((l=document.getElementById("modal-lesson-code"))==null?void 0:l.value.trim())||"1.1",d=(p=document.getElementById("modal-lesson-title"))==null?void 0:p.value.trim();if(!d)return f("Vui lòng nhập tên bài học!","error"),!1;const o=r.curriculums.find(g=>g.classId===$),c=o==null?void 0:o.chapters.find(g=>g.id===n);if(c){c.lessons.push({id:"l_"+Date.now(),code:a,title:d,hwCount:0,refCount:0}),f(`Đã thêm bài học "${d}"!`,"success");const g=document.getElementById("app");g&&(g.innerHTML=T(),z())}})})}),document.querySelectorAll(".btn-delete-chapter").forEach(i=>{i.addEventListener("click",()=>{const n=i.getAttribute("data-id");if(confirm("Bạn có chắc chắn muốn xóa chương này?")){const s=r.curriculums.find(a=>a.classId===$);if(s){s.chapters=s.chapters.filter(d=>d.id!==n),f("Đã xóa chương học","success");const a=document.getElementById("app");a&&(a.innerHTML=T(),z())}}})})}let w={mc:{},tf:{},sa:{}};function pt(){const t=r.homeworks[0]||{title:"Bài kiểm tra Tổng hợp",pdfPath:"Physics_Midterm_Ch3_Review.pdf",durationMinutes:45,questions:[]},e=(t.questions||[]).filter(o=>o.questionType==="MULTIPLE_CHOICE"),i=(t.questions||[]).filter(o=>o.questionType==="TRUE_FALSE"),n=(t.questions||[]).filter(o=>o.questionType==="SHORT_ANSWER"),s=e.length>0?e.length:10,a=i.length>0?i.length:4,d=n.length>0?n.length:2;return`
    <div class="app-layout">
      ${b("homework-attempt")}
      <div class="main-content">
        ${x("Nền tảng / Bảng điều khiển")}
        <div class="content-body" style="padding:16px 24px;">
          <div class="split-homework-layout">
            
            <!-- LEFT COLUMN: PDF VIEWER (LARGER PORTION ~60%) -->
            <div class="pdf-viewer-container" style="box-shadow: 0 4px 12px rgba(0,0,0,0.05); border:1px solid #cbd5e1;">
              <div class="pdf-toolbar">
                <div style="font-weight:700; color:#0f172a; display:flex; align-items:center; gap:8px;">
                  <i class="fa-solid fa-file-pdf" style="color:#ef4444; font-size:18px;"></i>
                  <span>${t.pdfPath||"De_Bai_Kiem_Tra.pdf"}</span>
                </div>
                <div style="display:flex; gap:8px; align-items:center;">
                  <button class="btn-secondary" style="padding:2px 8px; font-size:12px;">-</button>
                  <span style="font-weight:600; font-size:12px; color:#475569;">100%</span>
                  <button class="btn-secondary" style="padding:2px 8px; font-size:12px;">+</button>
                  <button class="btn-secondary" style="padding:2px 8px; font-size:12px;" onclick="window.open('#', '_blank')"><i class="fa-solid fa-expand"></i></button>
                </div>
              </div>

              <!-- PDF Canvas Mockup Preview -->
              <div class="pdf-page-mockup">
                <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:2px solid #0f172a; padding-bottom:12px; margin-bottom:20px;">
                  <div>
                    <h2 style="font-family:var(--font-heading); font-size:20px; font-weight:700; color:#0f172a;">ĐỀ BÀI KIỂM TRA CHÍNH THỨC</h2>
                    <div style="font-size:12px; color:#64748b;">Môn học: Toán & Khoa học Tự nhiên &nbsp;|&nbsp; Thời gian: ${t.durationMinutes||45} phút</div>
                  </div>
                  <div style="text-align:right; font-size:12px; font-weight:600; color:#334155;">
                    Mã đề: 8942<br>Học kỳ I
                  </div>
                </div>

                <div style="line-height:1.8; color:#334155; font-size:14px;">
                  <div style="font-weight:700; color:#0066cc; margin-bottom:8px;">PHẦN I. TRẮC NGHIỆM KHÁCH QUAN (A, B, C, D)</div>
                  <p style="margin-bottom:12px; font-size:13px; color:#475569;">
                    Học sinh đọc kỹ các câu hỏi trong tờ đề bài này và chọn 1 đáp án đúng duy nhất (A, B, C hoặc D) tương ứng trên Phiếu điền đáp án phía bên phải.
                  </p>
                  
                  <div style="background:#f8fafc; border:1px solid #cbd5e1; border-radius:10px; padding:14px; margin-bottom:16px;">
                    <div style="font-weight:600; margin-bottom:6px;">Ví dụ nội dung đề bài PDF:</div>
                    <div style="font-size:13px; color:#475569;">
                      • Câu 1: Cho hàm số y = f(x) liên tục trên R. Tìm tập xác định D của hàm số.<br>
                      • Câu 2: Tính gia tốc trọng trường g tại độ cao h so với mặt đất.<br>
                      • Câu 3: Phương trình sin(x) = 1 có bao nhiêu nghiệm trên đoạn [0; 2π]?
                    </div>
                  </div>

                  <div style="font-weight:700; color:#0284c7; margin:20px 0 8px 0;">PHẦN II. TRẮC NGHIỆM ĐÚNG / SAI</div>
                  <p style="margin-bottom:12px; font-size:13px; color:#475569;">
                    Trong mỗi câu hỏi có 4 ý a), b), c), d). Học sinh chọn Đúng hoặc Sai cho từng ý tương ứng trên phiếu đáp án.
                  </p>

                  <div style="font-weight:700; color:#059669; margin:20px 0 8px 0;">PHẦN III. CÂU HỎI TRẢ LỜI NGẮN</div>
                  <p style="margin-bottom:12px; font-size:13px; color:#475569;">
                    Nhập kết quả số hoặc đáp án văn bản ngắn gọn vào ô tương ứng trên phiếu đáp án.
                  </p>
                </div>
              </div>
            </div>

            <!-- RIGHT COLUMN: ANSWER ENTRY SHEET (SMALLER PORTION ~40%) -->
            <div class="question-column" style="overflow-y:auto; max-height:calc(100vh - 120px);">
              <div>
                <!-- Header Info & Timer -->
                <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:16px; padding-bottom:12px; border-bottom:1px solid #e2e8f0;">
                  <div>
                    <span class="badge" style="background:#e0f2fe; color:#0369a1; font-weight:700;">PHIẾU ĐIỀN ĐÁP ÁN</span>
                    <h3 style="font-family:var(--font-heading); font-size:18px; font-weight:700; margin-top:4px;">${t.title}</h3>
                  </div>
                  <div class="timer-box" style="flex-shrink:0;">
                    <i class="fa-regular fa-clock"></i> <span id="exam-timer-display">44:58</span>
                  </div>
                </div>

                <!-- Section 1: MC ABCD Answer Inputs -->
                <div style="margin-bottom:20px;">
                  <div style="font-weight:700; font-size:14px; color:#0066cc; margin-bottom:10px; display:flex; align-items:center; justify-content:space-between;">
                    <span>PHẦN I: TRẮC NGHIỆM A/B/C/D (${s} câu)</span>
                  </div>

                  <div style="display:flex; flex-direction:column; gap:8px;">
                    ${Array.from({length:s},(o,c)=>c+1).map(o=>{const c=w.mc[o]||"";return`
                        <div style="display:flex; align-items:center; justify-content:space-between; padding:8px 12px; background:#f8fafc; border:1px solid #e2e8f0; border-radius:10px;">
                          <span style="font-weight:700; font-size:13px; color:#334155; width:54px;">Câu ${o}</span>
                          <div style="display:flex; gap:6px;">
                            ${["A","B","C","D"].map(l=>`
                              <button type="button" class="student-mc-btn ${c===l?"selected":""}" data-qnum="${o}" data-option="${l}" style="
                                width:30px; height:30px; border-radius:6px; border:1px solid ${c===l?"#0066cc":"#cbd5e1"};
                                background:${c===l?"#0066cc":"#ffffff"};
                                color:${c===l?"#ffffff":"#334155"};
                                font-weight:700; font-size:12px; cursor:pointer; transition:all 0.15s ease;
                              ">${l}</button>
                            `).join("")}
                          </div>
                        </div>
                      `}).join("")}
                  </div>
                </div>

                <!-- Section 2: True / False Answer Inputs -->
                <div style="margin-bottom:20px;">
                  <div style="font-weight:700; font-size:14px; color:#0284c7; margin-bottom:10px;">
                    PHẦN II: ĐÚNG / SAI (${a} câu - 4 ý a,b,c,d)
                  </div>

                  <div style="display:flex; flex-direction:column; gap:12px;">
                    ${Array.from({length:a},(o,c)=>c+1).map(o=>{const c=w.tf[o]||{};return`
                        <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:10px; padding:10px;">
                          <div style="font-weight:700; font-size:13px; color:#0f172a; margin-bottom:8px;">Câu ${o}</div>
                          <div style="display:grid; grid-template-columns:1fr 1fr; gap:6px;">
                            ${["a","b","c","d"].map(l=>{const p=c[l];return`
                                <div style="display:flex; items-center; justify-content:space-between; background:#ffffff; padding:4px 8px; border-radius:6px; border:1px solid #e2e8f0; font-size:12px;">
                                  <span style="font-weight:700; color:#475569;">${l})</span>
                                  <div style="display:flex; gap:4px;">
                                    <button type="button" class="student-tf-btn" data-qnum="${o}" data-sub="${l}" data-val="true" style="
                                      padding:2px 8px; border-radius:4px; font-weight:700; font-size:11px; cursor:pointer;
                                      border:1px solid ${p===!0?"#16a34a":"#cbd5e1"};
                                      background:${p===!0?"#16a34a":"#ffffff"};
                                      color:${p===!0?"#ffffff":"#475569"};
                                    ">Đ</button>
                                    <button type="button" class="student-tf-btn" data-qnum="${o}" data-sub="${l}" data-val="false" style="
                                      padding:2px 8px; border-radius:4px; font-weight:700; font-size:11px; cursor:pointer;
                                      border:1px solid ${p===!1?"#dc2626":"#cbd5e1"};
                                      background:${p===!1?"#dc2626":"#ffffff"};
                                      color:${p===!1?"#ffffff":"#475569"};
                                    ">S</button>
                                  </div>
                                </div>
                              `}).join("")}
                          </div>
                        </div>
                      `}).join("")}
                  </div>
                </div>

                <!-- Section 3: Short Answer Inputs -->
                <div style="margin-bottom:20px;">
                  <div style="font-weight:700; font-size:14px; color:#059669; margin-bottom:10px;">
                    PHẦN III: TRẢ LỜI NGẮN (${d} câu)
                  </div>

                  <div style="display:flex; flex-direction:column; gap:8px;">
                    ${Array.from({length:d},(o,c)=>c+1).map(o=>{const c=w.sa[o]||"";return`
                        <div style="display:flex; align-items:center; justify-content:space-between; padding:8px 12px; background:#f8fafc; border:1px solid #e2e8f0; border-radius:10px;">
                          <span style="font-weight:700; font-size:13px; color:#334155; width:54px;">Câu ${o}</span>
                          <input type="text" class="form-input student-sa-input" data-qnum="${o}" value="${c}" placeholder="Điền đáp án..." style="padding:6px 10px; font-size:13px; background:#ffffff;">
                        </div>
                      `}).join("")}
                  </div>
                </div>
              </div>

              <!-- Footer Bar with Submit Button -->
              <div style="padding-top:16px; border-top:1px solid #f1f5f9; margin-top:auto;">
                <button class="btn-primary" id="submit-answers-btn" style="width:100%; padding:12px 20px; font-size:15px;">
                  <i class="fa-solid fa-paper-plane"></i> Nộp bài làm ngay
                </button>
              </div>
            </div>

          </div>
        </div>
      </div>
    </div>
  `}function ft(){var t;C(),document.querySelectorAll(".student-mc-btn").forEach(e=>{e.addEventListener("click",()=>{const i=parseInt(e.getAttribute("data-qnum"),10),n=e.getAttribute("data-option");w.mc[i]=n,document.querySelectorAll(`.student-mc-btn[data-qnum="${i}"]`).forEach(s=>{const a=s.getAttribute("data-option")===n;s.style.background=a?"#0066cc":"#ffffff",s.style.color=a?"#ffffff":"#334155",s.style.borderColor=a?"#0066cc":"#cbd5e1"})})}),document.querySelectorAll(".student-tf-btn").forEach(e=>{e.addEventListener("click",()=>{const i=parseInt(e.getAttribute("data-qnum"),10),n=e.getAttribute("data-sub"),s=e.getAttribute("data-val")==="true";w.tf[i]||(w.tf[i]={}),w.tf[i][n]=s;const a=e.parentElement;a&&a.querySelectorAll(".student-tf-btn").forEach(d=>{d.getAttribute("data-val")===(s?"true":"false")?(d.style.background=s?"#16a34a":"#dc2626",d.style.color="#ffffff",d.style.borderColor=s?"#16a34a":"#dc2626"):(d.style.background="#ffffff",d.style.color="#475569",d.style.borderColor="#cbd5e1")})})}),document.querySelectorAll(".student-sa-input").forEach(e=>{e.addEventListener("input",i=>{const n=parseInt(e.getAttribute("data-qnum"),10);w.sa[n]=i.target.value})}),(t=document.getElementById("submit-answers-btn"))==null||t.addEventListener("click",async()=>{try{f("Đang gửi bài làm lên máy chủ chấm điểm...","info"),await A.submitHomework({homeworkId:"hw1",answers:w}),f("Nộp bài thành công! Đang tải kết quả chấm điểm...","success"),window.location.hash="#assignment-review"}catch{f("Nộp bài làm thành công! (Chế độ Demo)","success"),window.location.hash="#assignment-review"}})}function ut(){return`
    <div class="app-layout">
      ${b("history")}
      <div class="main-content">
        ${x("Nền tảng / Bảng điều khiển")}
        <div class="content-body">
          <div class="page-header">
            <div>
              <h1 class="page-title">Xem lại kết quả bài tập</h1>
              <p class="page-description">Giải tích nâng cao: Phép tính tích phân</p>
            </div>
            <button class="btn-secondary" onclick="window.location.hash='#history'">
              <i class="fa-solid fa-arrow-left"></i> Quay lại lịch sử
            </button>
          </div>

          <!-- Top Overview Banner -->
          <div class="card" style="display:flex; justify-content:space-between; align-items:center; background:linear-gradient(135deg, #ffffff 0%, #f0f7ff 100%);">
            <div style="display:flex; align-items:center; gap:24px;">
              <div>
                <div style="font-size:12px; font-weight:700; color:#64748b; text-transform:uppercase;">TỔNG ĐIỂM SỐ</div>
                <div style="font-family:var(--font-heading); font-size:42px; font-weight:700; color:#0f172a;">
                  85 <span style="font-size:20px; color:#64748b; font-weight:400;">/ 100</span>
                </div>
                <div class="badge badge-graded" style="font-size:13px;">
                  <i class="fa-solid fa-circle-check"></i> Xuất sắc! Bạn đã nắm vững hầu hết các kiến thức trọng tâm.
                </div>
              </div>

              <!-- Circular 85% Score Dial -->
              <div class="score-circle-widget">
                85%
              </div>
            </div>

            <!-- Detailed Stat Badges -->
            <div style="display:flex; gap:32px;">
              <div>
                <div style="font-size:12px; color:#047857; font-weight:700;"><i class="fa-solid fa-circle-check"></i> Số câu đúng</div>
                <div style="font-family:var(--font-heading); font-size:26px; font-weight:700;">17</div>
              </div>
              <div>
                <div style="font-size:12px; color:#ef4444; font-weight:700;"><i class="fa-solid fa-circle-xmark"></i> Số câu sai</div>
                <div style="font-family:var(--font-heading); font-size:26px; font-weight:700;">3</div>
              </div>
              <div>
                <div style="font-size:12px; color:#64748b; font-weight:700;"><i class="fa-regular fa-clock"></i> Thời gian làm</div>
                <div style="font-family:var(--font-heading); font-size:26px; font-weight:700;">24:15</div>
              </div>
              <div>
                <div style="font-size:12px; color:#64748b; font-weight:700;"><i class="fa-solid fa-gauge"></i> Tốc độ trung bình</div>
                <div style="font-family:var(--font-heading); font-size:20px; font-weight:700;">1m 12s <span style="font-size:12px; font-weight:400; color:#64748b;">/câu</span></div>
              </div>
            </div>
          </div>

          <!-- Main Layout: Question Reviews + Right Sidebar Navigator -->
          <div class="grid-3">
            <div style="grid-column: span 2;">
              <!-- Question 1 (Correct) -->
              <div class="card" style="border-left:4px solid #10b981;">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
                  <div>
                    <span class="question-badge">1</span>
                    <span style="font-size:12px; font-weight:700; color:#64748b; text-transform:uppercase;">TRẮC NGHIỆM</span>
                  </div>
                  <span class="badge badge-graded"><i class="fa-solid fa-check"></i> 1 / 1 điểm</span>
                </div>

                <div style="font-size:15px; font-weight:600; color:#0f172a; margin-bottom:16px;">
                  Tính tích phân: ∫ x^2(x^3 - 2)^4 dx
                </div>

                <div style="display:flex; flex-direction:column; gap:10px;">
                  <div style="display:flex; justify-content:space-between; align-items:center; padding:12px 16px; background:#e0f2fe; border:1px solid #0066cc; border-radius:10px;">
                    <div style="display:flex; align-items:center; gap:10px; font-weight:600; color:#0f172a;">
                      <i class="fa-solid fa-circle-check" style="color:#0066cc;"></i> 1/15 (x^3 - 2)^5 + C
                    </div>
                    <span class="badge" style="background:#ffffff; color:#0066cc;">Đáp án của bạn</span>
                  </div>

                  <div style="padding:12px 16px; background:#f8fafc; border:1px solid #e2e8f0; border-radius:10px; color:#64748b; font-size:14px;">
                    1/5 (x^3 - 2)^5 + C
                  </div>
                </div>
              </div>

              <!-- Question 2 (Incorrect with Solution Explanation) -->
              <div class="card" style="border-left:4px solid #ef4444;">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
                  <div>
                    <span class="question-badge" style="background:#ef4444;">2</span>
                    <span style="font-size:12px; font-weight:700; color:#64748b; text-transform:uppercase;">TRẮC NGHIỆM</span>
                  </div>
                  <span class="badge" style="background:#fee2e2; color:#ef4444;"><i class="fa-solid fa-xmark"></i> 0 / 1 điểm</span>
                </div>

                <div style="font-size:15px; font-weight:600; color:#0f172a; margin-bottom:16px;">
                  Tính diện tích hình phẳng giới hạn bởi các đường y = x^2 và y = 4x - x^2.
                </div>

                <div style="display:flex; flex-direction:column; gap:10px; margin-bottom:16px;">
                  <div style="display:flex; justify-content:space-between; align-items:center; padding:12px 16px; background:#fee2e2; border:1px solid #ef4444; border-radius:10px;">
                    <div style="display:flex; align-items:center; gap:10px; font-weight:600; color:#ef4444;">
                      <i class="fa-solid fa-circle-xmark"></i> 16/3
                    </div>
                    <span class="badge" style="background:#ffffff; color:#ef4444;">Đáp án của bạn</span>
                  </div>

                  <div style="display:flex; justify-content:space-between; align-items:center; padding:12px 16px; background:#e0f2fe; border:1px solid #0066cc; border-radius:10px;">
                    <div style="display:flex; align-items:center; gap:10px; font-weight:600; color:#0f172a;">
                      <i class="fa-solid fa-circle-check" style="color:#0066cc;"></i> 8/3
                    </div>
                    <span class="badge" style="background:#ffffff; color:#0066cc;">Đáp án đúng</span>
                  </div>
                </div>

                <!-- Solution Explanation Box -->
                <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:10px; padding:16px;">
                  <div style="font-size:13px; font-weight:700; color:#0f172a; margin-bottom:6px; display:flex; align-items:center; gap:6px;">
                    <i class="fa-regular fa-lightbulb" style="color:#f59e0b;"></i> Lời giải chi tiết
                  </div>
                  <div style="font-size:13px; color:#475569; line-height:1.6;">
                    Cho 2 phương trình hoành độ giao điểm bằng nhau: x^2 = 4x - x^2 ⇒ 2x^2 - 4x = 0 ⇒ 2x(x - 2) = 0. Tọa độ cận x = 0 và x = 2.
                    Diện tích S = ∫₀² (4x - x^2 - x^2) dx = ∫₀² (4x - 2x^2) dx = [2x^2 - (2/3)x^3]₀² = 8 - 16/3 = 8/3.
                  </div>
                </div>
              </div>
            </div>

            <!-- Right Column: Question Navigator -->
            <div>
              <div class="card">
                <h3 style="font-family:var(--font-heading); font-size:16px; font-weight:700; margin-bottom:12px;">Sơ đồ câu hỏi</h3>
                
                <div class="question-nav-grid">
                  <div class="nav-grid-item nav-grid-correct">1</div>
                  <div class="nav-grid-item nav-grid-wrong">2</div>
                  <div class="nav-grid-item nav-grid-correct">3</div>
                  <div class="nav-grid-item nav-grid-correct">4</div>
                  <div class="nav-grid-item nav-grid-correct">5</div>
                  <div class="nav-grid-item nav-grid-correct">6</div>
                  <div class="nav-grid-item nav-grid-wrong">7</div>
                  <div class="nav-grid-item nav-grid-correct">8</div>
                  <div class="nav-grid-item nav-grid-correct">9</div>
                  <div class="nav-grid-item nav-grid-correct">10</div>
                  <div class="nav-grid-item nav-grid-correct">11</div>
                  <div class="nav-grid-item nav-grid-correct">12</div>
                  <div class="nav-grid-item nav-grid-correct">13</div>
                  <div class="nav-grid-item nav-grid-wrong">14</div>
                  <div class="nav-grid-item nav-grid-correct">15</div>
                </div>

                <div style="display:flex; gap:16px; margin-top:16px; font-size:12px;">
                  <div style="display:flex; align-items:center; gap:6px;">
                    <div style="width:12px; height:12px; background:#0066cc; border-radius:3px;"></div> Đúng
                  </div>
                  <div style="display:flex; align-items:center; gap:6px;">
                    <div style="width:12px; height:12px; background:#ef4444; border-radius:3px;"></div> Sai
                  </div>
                </div>
              </div>

              <!-- Refresher Card -->
              <div class="card" style="background:#0066cc; color:#ffffff; text-align:center;">
                <h3 style="font-family:var(--font-heading); font-size:18px; font-weight:700; margin-bottom:8px;">Cần ôn tập thêm?</h3>
                <p style="font-size:13px; opacity:0.9; margin-bottom:16px;">
                  Xem lại lý thuyết chương Ứng dụng tích phân để củng cố điểm số của bạn.
                </p>
                <button class="btn-secondary" style="width:100%; border:none; color:#0066cc; font-weight:700;" onclick="window.location.hash='#curriculum'">
                  Đến trang bài học
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  `}function gt(){C()}function ht(){const t=r.submissions;return`
    <div class="app-layout">
      ${b("history")}
      <div class="main-content">
        ${x("Nền tảng / Bảng điều khiển")}
        <div class="content-body">
          <div class="page-header">
            <div>
              <h1 class="page-title">Lịch sử học tập</h1>
              <p class="page-description">Xem lại các bài tập đã làm và kết quả học tập của bạn</p>
            </div>

            <div style="display:flex; gap:16px;">
              <div style="background:#e0f2fe; padding:10px 20px; border-radius:12px; text-align:center;">
                <div style="font-size:11px; font-weight:700; color:#0369a1; text-transform:uppercase;">ĐIỂM TRUNG BÌNH</div>
                <div style="font-family:var(--font-heading); font-size:22px; font-weight:700; color:#0284c7;">88.4%</div>
              </div>
              <div style="background:#e0f2fe; padding:10px 20px; border-radius:12px; text-align:center;">
                <div style="font-size:11px; font-weight:700; color:#0369a1; text-transform:uppercase;">TỔNG BÀI TẬP</div>
                <div style="font-family:var(--font-heading); font-size:22px; font-weight:700; color:#0284c7;">42</div>
              </div>
            </div>
          </div>

          <!-- Table Container -->
          <div class="card">
            <!-- Filter Bar -->
            <div style="display:flex; gap:16px; margin-bottom:20px; align-items:center;">
              <div class="search-box" style="width:320px;">
                <i class="fa-solid fa-magnifying-glass"></i>
                <input type="text" placeholder="Tìm tên bài tập...">
              </div>
              <button class="btn-primary" style="width:auto; padding:8px 16px;"><i class="fa-solid fa-check"></i> Đã hoàn thành</button>
              <select style="padding:8px 14px; border:1px solid var(--border-color); border-radius:10px; font-size:14px; outline:none; background:#ffffff;">
                <option>Chương</option>
              </select>
              <button class="btn-secondary"><i class="fa-regular fa-calendar"></i> Khoảng thời gian</button>
            </div>

            <!-- Table -->
            <div class="table-responsive">
              <table class="data-table">
                <thead>
                  <tr>
                    <th>Tên bài tập</th>
                    <th>Bài học</th>
                    <th>Ngày nộp</th>
                    <th>Điểm số</th>
                    <th>Trạng thái</th>
                    <th>Thao tác</th>
                  </tr>
                </thead>
                <tbody>
                  ${t.map(e=>{const i=typeof e.score=="number"?e.score>=70:!0;return`
                      <tr>
                        <td style="font-weight:700; color:#0f172a;">${e.homeworkTitle}</td>
                        <td style="color:#64748b;">${e.lesson}</td>
                        <td style="color:#64748b;">${e.submittedAt}</td>
                        <td style="font-family:var(--font-heading); font-weight:700; font-size:16px; color:${i?"#0066cc":"#ef4444"};">
                          ${e.score}/100
                        </td>
                        <td>
                          <span class="badge ${e.status==="ĐÃ CHẤM"?"badge-graded":"badge-submitted"}">
                            ${e.status}
                          </span>
                        </td>
                        <td>
                          <button class="btn-secondary" onclick="window.location.hash='#assignment-review'" style="padding:4px 10px; font-size:12px;">
                            Xem kết quả
                          </button>
                        </td>
                      </tr>
                    `}).join("")}
                </tbody>
              </table>
            </div>

            <!-- Pagination -->
            <div style="display:flex; align-items:center; justify-content:space-between; margin-top:20px; font-size:13px; color:#64748b;">
              <div>Hiển thị 1 đến ${t.length} trong tổng số 42 bài tập</div>
              <div style="display:flex; gap:6px; align-items:center;">
                <button class="btn-secondary" style="padding:4px 10px;">&lt;</button>
                <button class="btn-primary" style="width:auto; padding:4px 12px; border-radius:6px;">1</button>
                <button class="btn-secondary" style="padding:4px 10px;">2</button>
                <button class="btn-secondary" style="padding:4px 10px;">3</button>
                <button class="btn-secondary" style="padding:4px 10px;">&gt;</button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  `}function mt(){C()}function R(){return`
    <div class="app-layout">
      ${b("admin-dashboard")}
      <div class="main-content">
        ${x("Nền tảng / Bảng điều khiển Quản trị viên")}
        <div class="content-body">
          <div class="page-header">
            <div>
              <h1 class="page-title">Bảng điều khiển Quản trị viên</h1>
              <p class="page-description">Thống kê thời gian thực, danh sách nộp bài gần đây và tổng quan hệ thống.</p>
            </div>
            <button class="btn-primary" onclick="window.location.hash='#create-homework'" style="width:auto;">
              <i class="fa-solid fa-plus"></i> Tạo bài tập về nhà mới
            </button>
          </div>

          <!-- Overview Stat Cards -->
          <div class="grid-4" style="margin-bottom:28px;">
            <div class="card" style="display:flex; align-items:center; gap:16px;">
              <div style="width:50px; height:50px; background:#e0f2fe; color:#0284c7; border-radius:12px; display:flex; align-items:center; justify-content:center; font-size:22px;">
                <i class="fa-solid fa-users"></i>
              </div>
              <div>
                <div style="font-size:12px; font-weight:700; color:#64748b; text-transform:uppercase;">Tổng học sinh</div>
                <div style="font-family:var(--font-heading); font-size:26px; font-weight:700; color:#0f172a;">124</div>
              </div>
            </div>

            <div class="card" style="display:flex; align-items:center; gap:16px;">
              <div style="width:50px; height:50px; background:#e0f2fe; color:#0284c7; border-radius:12px; display:flex; align-items:center; justify-content:center; font-size:22px;">
                <i class="fa-solid fa-graduation-cap"></i>
              </div>
              <div>
                <div style="font-size:12px; font-weight:700; color:#64748b; text-transform:uppercase;">Tổng lớp học</div>
                <div style="font-family:var(--font-heading); font-size:26px; font-weight:700; color:#0f172a;">4</div>
              </div>
            </div>

            <div class="card" style="display:flex; align-items:center; gap:16px;">
              <div style="width:50px; height:50px; background:#e0f2fe; color:#0284c7; border-radius:12px; display:flex; align-items:center; justify-content:center; font-size:22px;">
                <i class="fa-solid fa-book-open"></i>
              </div>
              <div>
                <div style="font-size:12px; font-weight:700; color:#64748b; text-transform:uppercase;">Tổng bài tập</div>
                <div style="font-family:var(--font-heading); font-size:26px; font-weight:700; color:#0f172a;">36</div>
              </div>
            </div>

            <div class="card" style="display:flex; align-items:center; gap:16px;">
              <div style="width:50px; height:50px; background:#d1fae5; color:#047857; border-radius:12px; display:flex; align-items:center; justify-content:center; font-size:22px;">
                <i class="fa-solid fa-star"></i>
              </div>
              <div>
                <div style="font-size:12px; font-weight:700; color:#64748b; text-transform:uppercase;">Điểm trung bình</div>
                <div style="font-family:var(--font-heading); font-size:26px; font-weight:700; color:#047857;">88.4%</div>
              </div>
            </div>
          </div>

          <!-- Recent Submissions Card -->
          <div class="card">
            <h3 style="font-family:var(--font-heading); font-size:18px; font-weight:700; margin-bottom:16px;">Lượt nộp bài gần đây</h3>
            
            <div class="table-responsive">
              <table class="data-table">
                <thead>
                  <tr>
                    <th>Học sinh</th>
                    <th>Tên bài tập</th>
                    <th>Điểm số</th>
                    <th>Thời gian nộp</th>
                    <th>Thao tác</th>
                  </tr>
                </thead>
                <tbody>
                  ${r.students.map((t,e)=>`
                    <tr>
                      <td style="font-weight:700;">${t.fullName}</td>
                      <td style="color:#64748b;">Kiểm tra Chương 3: Con lắc đơn & Động lực học</td>
                      <td>
                        <span style="font-family:var(--font-heading); font-weight:700; color:${e===2?"#ef4444":"#0066cc"};">
                          ${e===2?"65":"85"}/100
                        </span>
                      </td>
                      <td style="color:#64748b;">12/10/2023 14:30</td>
                      <td>
                        <button class="btn-secondary" onclick="window.location.hash='#assignment-review'" style="padding:4px 10px; font-size:12px;">Xem lại</button>
                      </td>
                    </tr>
                  `).join("")}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  `}function U(){C()}const Q={login:{render:Z,bind:tt},"my-classes":{render:H,bind:L},students:{render:ot,bind:at},"classes-admin":{render:et,bind:nt},"create-homework":{render:lt,bind:ct},curriculum:{render:T,bind:z},"homework-attempt":{render:pt,bind:ft},"assignment-review":{render:ut,bind:gt},history:{render:ht,bind:mt},"admin-dashboard":{render:R,bind:U},statistics:{render:R,bind:U}};function J(){var n;const t=window.location.hash.replace("#","")||(r.token?((n=r.user)==null?void 0:n.role)==="ADMIN"?"admin-dashboard":"homework-attempt":"login"),e=Q[t]||Q.login,i=document.getElementById("app");i&&(i.innerHTML=e.render(),e.bind())}window.addEventListener("hashchange",J);window.addEventListener("DOMContentLoaded",J);

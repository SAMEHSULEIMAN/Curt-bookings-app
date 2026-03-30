// -------------------- الإعدادات العامة --------------------
const WORKING_HOURS_START = 7; // 7:00
const WORKING_HOURS_END = 24;   // 24:00
const MIN_BOOKING_DURATION = 30; // دقيقة
const MAX_BOOKING_DURATION = 12 * 60; // 12 ساعة

let bookings = {
  "ازاريطة 1": { data: {}, price: { morning: 0, evening: 0 } },
  "ازاريطة 2": { data: {}, price: { morning: 0, evening: 0 } },
  "ازاريطة رملى": { data: {}, price: { morning: 0, evening: 0 } },
  "ازاريطة نجيل": { data: {}, price: { morning: 0, evening: 0 } },
  "مواساة": { data: {}, price: { morning: 0, evening: 0 } },
  "شاطبى": { data: {}, price: { morning: 0, evening: 0 } }
};

let revenueChart = null;
let notificationTimeouts = [];

// -------------------- دوال مساعدة --------------------
function getLocalDateKey(date) {
  const d = new Date(date);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatDateForInput(date) {
  const d = new Date(date);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

function parseDateFromInput(dateString) {
  return new Date(dateString);
}

function calculateBookingCost(booking, fieldName) {
  // إذا كان هناك سعر مخصص (من الحجز المتكرر) استخدمه
  if (booking.customPrice !== undefined && booking.customPrice !== null) {
    const start = new Date(booking.dateFrom);
    const end = new Date(booking.dateTo);
    const totalHours = (end - start) / (1000 * 60 * 60);
    return { cost: booking.customPrice, totalHours, morningDuration: 0, eveningDuration: 0 };
  }

  const start = new Date(booking.dateFrom);
  const end = new Date(booking.dateTo);
  const field = bookings[fieldName];

  const morningStart = new Date(start);
  morningStart.setHours(7, 0, 0, 0);
  const morningEnd = new Date(start);
  morningEnd.setHours(17, 0, 0, 0);
  const eveningStart = new Date(start);
  eveningStart.setHours(17, 0, 0, 0);
  const eveningEnd = new Date(start);
  eveningEnd.setHours(24, 0, 0, 0);

  let morningDuration = Math.max(0, (Math.min(end, morningEnd) - Math.max(start, morningStart)) / (1000 * 60 * 60));
  let eveningDuration = Math.max(0, (Math.min(end, eveningEnd) - Math.max(start, eveningStart)) / (1000 * 60 * 60));
  const totalHours = morningDuration + eveningDuration;

  const morningRate = field.price.morning;
  const eveningRate = field.price.evening;
  const cost = (morningDuration * morningRate) + (eveningDuration * eveningRate);

  return { cost, totalHours, morningDuration, eveningDuration };
}

function updateEstimatedCost() {
  const field = document.getElementById("field").value;
  const dateFromStr = document.getElementById("date-from").value;
  const dateToStr = document.getElementById("date-to").value;
  const costDiv = document.getElementById("estimated-cost");

  if (!field || !dateFromStr || !dateToStr) {
    costDiv.textContent = "التكلفة التقديرية: 0";
    return;
  }

  const dateFrom = parseDateFromInput(dateFromStr);
  const dateTo = parseDateFromInput(dateToStr);

  if (dateFrom >= dateTo) {
    costDiv.textContent = "التكلفة التقديرية: 0 (وقت غير صحيح)";
    return;
  }

  const { cost } = calculateBookingCost({ dateFrom, dateTo }, field);
  costDiv.textContent = `التكلفة التقديرية: ${cost.toFixed(2)}`;
}

// -------------------- التحقق من صحة الحجز --------------------
function validateBooking(field, dateFrom, dateTo, editIndex = null, originalField = null) {
  if (!bookings[field]) {
    alert("الملعب غير موجود.");
    return false;
  }

  if (dateFrom >= dateTo) {
    alert("يجب أن يكون وقت النهاية بعد وقت البداية.");
    return false;
  }

  const now = new Date();
  if (dateFrom < now && (now - dateFrom) > 5 * 60 * 1000) {
    alert("لا يمكن حجز وقت في الماضي.");
    return false;
  }

  const fromHour = dateFrom.getHours() + dateFrom.getMinutes() / 60;
  const toHour = dateTo.getHours() + dateTo.getMinutes() / 60;
  if (fromHour < WORKING_HOURS_START || toHour > WORKING_HOURS_END) {
    alert(`ساعات العمل من ${WORKING_HOURS_START}:00 إلى ${WORKING_HOURS_END}:00.`);
    return false;
  }

  const durationMinutes = (dateTo - dateFrom) / (1000 * 60);
  if (durationMinutes < MIN_BOOKING_DURATION) {
    alert(`الحد الأدنى لمدة الحجز ${MIN_BOOKING_DURATION} دقيقة.`);
    return false;
  }
  if (durationMinutes > MAX_BOOKING_DURATION) {
    alert(`الحد الأقصى لمدة الحجز ${MAX_BOOKING_DURATION / 60} ساعة.`);
    return false;
  }

  const bookingDateKey = getLocalDateKey(dateFrom);
  const dayBookings = bookings[field].data[bookingDateKey] || [];

  for (let i = 0; i < dayBookings.length; i++) {
    if (editIndex !== null && originalField === field && i === editIndex) continue;

    const existing = dayBookings[i];
    const existingStart = new Date(existing.dateFrom);
    const existingEnd = new Date(existing.dateTo);

    if (dateFrom < existingEnd && dateTo > existingStart) {
      alert("هذا الوقت محجوز بالفعل. يرجى اختيار وقت آخر.");
      return false;
    }
  }

  return true;
}

// -------------------- حفظ/تحديث الحجز --------------------
function saveBooking() {
  const field = document.getElementById("field").value;
  const name = document.getElementById("name").value.trim();
  const phone = document.getElementById("phone").value.trim();
  const activityType = document.getElementById("activity-type").value.trim();
  const dateFromStr = document.getElementById("date-from").value;
  const dateToStr = document.getElementById("date-to").value;
  const editIndex = document.getElementById("edit-index").value;
  const originalField = document.getElementById("original-field").value;
  const isRecurring = document.getElementById("recurring-checkbox")?.checked || false;
  const recurringFreq = document.getElementById("recurring-frequency")?.value;
  const recurringCount = parseInt(document.getElementById("recurring-count")?.value) || 1;
  const recurringTotalPrice = document.getElementById("recurring-total-price")?.value;
  let customTotalPrice = recurringTotalPrice ? parseFloat(recurringTotalPrice) : null;
  if (customTotalPrice && isNaN(customTotalPrice)) customTotalPrice = null;

  if (!field || !name || !phone || !dateFromStr || !dateToStr) {
    alert("يرجى ملء جميع الحقول.");
    return;
  }

  const dateFrom = parseDateFromInput(dateFromStr);
  const dateTo = parseDateFromInput(dateToStr);
  const bookingDateKey = getLocalDateKey(dateFrom);

  // التعامل مع التعديل: إذا كان هناك تعديل وحقل أصلي مختلف، احذف القديم أولاً
  if (editIndex !== "") {
    if (originalField && originalField !== field) {
      const oldDateKey = getLocalDateKey(dateFrom); // نفترض أن التاريخ لم يتغير
      const oldBooking = bookings[originalField]?.data[oldDateKey]?.[parseInt(editIndex)];
      if (oldBooking) {
        bookings[originalField].data[oldDateKey].splice(parseInt(editIndex), 1);
        if (bookings[originalField].data[oldDateKey].length === 0) {
          delete bookings[originalField].data[oldDateKey];
        }
      }
    }
  }

  if (!validateBooking(field, dateFrom, dateTo, editIndex !== "" ? parseInt(editIndex) : null, field)) {
    return;
  }

  const booking = { name, phone, activityType, dateFrom, dateTo, field };

  if (isRecurring && recurringCount > 1) {
    let currentDateFrom = new Date(dateFrom);
    let currentDateTo = new Date(dateTo);
    let individualCosts = [];
    let totalCalculatedCost = 0;

    // حساب التكلفة الفردية لكل حجز (للتوزيع إذا لزم الأمر)
    for (let i = 0; i < recurringCount; i++) {
      if (i > 0) {
        switch (recurringFreq) {
          case 'daily':
            currentDateFrom.setDate(currentDateFrom.getDate() + 1);
            currentDateTo.setDate(currentDateTo.getDate() + 1);
            break;
          case 'weekly':
            currentDateFrom.setDate(currentDateFrom.getDate() + 7);
            currentDateTo.setDate(currentDateTo.getDate() + 7);
            break;
          case 'monthly':
            currentDateFrom.setMonth(currentDateFrom.getMonth() + 1);
            currentDateTo.setMonth(currentDateTo.getMonth() + 1);
            break;
        }
      }
      const { cost } = calculateBookingCost({ dateFrom: currentDateFrom, dateTo: currentDateTo }, field);
      individualCosts.push(cost);
      totalCalculatedCost += cost;
    }

    // إعادة تعيين التواريخ للتكرار الفعلي
    currentDateFrom = new Date(dateFrom);
    currentDateTo = new Date(dateTo);
    for (let i = 0; i < recurringCount; i++) {
      if (i > 0) {
        switch (recurringFreq) {
          case 'daily':
            currentDateFrom.setDate(currentDateFrom.getDate() + 1);
            currentDateTo.setDate(currentDateTo.getDate() + 1);
            break;
          case 'weekly':
            currentDateFrom.setDate(currentDateFrom.getDate() + 7);
            currentDateTo.setDate(currentDateTo.getDate() + 7);
            break;
          case 'monthly':
            currentDateFrom.setMonth(currentDateFrom.getMonth() + 1);
            currentDateTo.setMonth(currentDateTo.getMonth() + 1);
            break;
        }
      }
      const newBooking = { 
        ...booking, 
        dateFrom: new Date(currentDateFrom), 
        dateTo: new Date(currentDateTo)
      };
      if (customTotalPrice !== null && totalCalculatedCost > 0) {
        // توزيع السعر الإجمالي حسب الوزن النسبي لكل حجز
        const weight = individualCosts[i] / totalCalculatedCost;
        newBooking.customPrice = customTotalPrice * weight;
      }
      const newDateKey = getLocalDateKey(currentDateFrom);
      if (!bookings[field].data[newDateKey]) {
        bookings[field].data[newDateKey] = [];
      }
      bookings[field].data[newDateKey].push(newBooking);
    }
  } else {
    // حجز عادي
    if (!bookings[field].data[bookingDateKey]) {
      bookings[field].data[bookingDateKey] = [];
    }
    if (editIndex === "") {
      bookings[field].data[bookingDateKey].push(booking);
    } else {
      bookings[field].data[bookingDateKey][parseInt(editIndex)] = booking;
    }
  }

  document.getElementById("booking-form").reset();
  document.getElementById("edit-index").value = "";
  document.getElementById("original-field").value = "";
  document.getElementById("estimated-cost").textContent = "التكلفة التقديرية: 0";
  if (document.getElementById("recurring-details")) {
    document.getElementById("recurring-details").style.display = "none";
  }
  document.getElementById("recurring-checkbox").checked = false;

  updateTable();
  updateTimeline();
  updateQuickSummary();
  updateChart();
  scheduleNotification(booking);
  saveToLocalStorage();

  alert(editIndex === "" ? "تم إضافة الحجز بنجاح!" : "تم تحديث الحجز بنجاح!");
}

// -------------------- تحديث الجدول --------------------
function updateTable() {
  const selectedField = document.getElementById("field-select").value;
  const selectedDate = document.getElementById("date-select").value;
  const table = document.getElementById("booking-table");
  const tbody = table.querySelector("tbody");

  if (!selectedField || !selectedDate) {
    table.style.display = "none";
    return;
  }

  if (!bookings[selectedField]) {
    console.error("الملعب غير موجود:", selectedField);
    alert("الملعب المختار غير موجود.");
    return;
  }

  table.style.display = "table";
  tbody.innerHTML = "";
  const bookingsForDate = bookings[selectedField].data[selectedDate] || [];
  const now = new Date();

  bookingsForDate.forEach((booking, index) => {
    const row = tbody.insertRow();
    const isPast = new Date(booking.dateTo) < now;
    row.classList.toggle("past-booking", isPast);

    row.innerHTML = `
      <td>${escapeHtml(booking.name)}</td>
      <td>${escapeHtml(booking.phone)}</td>
      <td>${escapeHtml(booking.activityType || "")}</td>
      <td>${new Date(booking.dateFrom).toLocaleString()}</td>
      <td>${new Date(booking.dateTo).toLocaleString()}</td>
      <td>
        <button class="edit" onclick="editBooking('${selectedField}', '${selectedDate}', ${index})">تعديل</button>
        <button class="delete" onclick="deleteBooking('${selectedField}', '${selectedDate}', ${index})">حذف</button>
      </td>
    `;
  });

  if (document.getElementById("search-input").value.trim() !== "") {
    filterTable();
  }
}

function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/[&<>]/g, function(m) {
    if (m === '&') return '&amp;';
    if (m === '<') return '&lt;';
    if (m === '>') return '&gt;';
    return m;
  });
}

function filterTable() {
  const input = document.getElementById("search-input");
  const filter = input.value.trim().toLowerCase();
  const table = document.getElementById("booking-table");
  const rows = table.querySelectorAll("tbody tr");

  rows.forEach(row => {
    const name = row.cells[0].textContent.toLowerCase();
    const phone = row.cells[1].textContent.toLowerCase();
    const activity = row.cells[2].textContent.toLowerCase();
    if (name.includes(filter) || phone.includes(filter) || activity.includes(filter)) {
      row.style.display = "";
    } else {
      row.style.display = "none";
    }
  });
}

function editBooking(field, date, index) {
  const booking = bookings[field].data[date][index];
  document.getElementById("field").value = field;
  document.getElementById("name").value = booking.name;
  document.getElementById("phone").value = booking.phone;
  document.getElementById("activity-type").value = booking.activityType || "";
  document.getElementById("date-from").value = formatDateForInput(new Date(booking.dateFrom));
  document.getElementById("date-to").value = formatDateForInput(new Date(booking.dateTo));
  document.getElementById("edit-index").value = index;
  document.getElementById("original-field").value = field;
  updateEstimatedCost();
}

function deleteBooking(field, date, index) {
  if (confirm("هل أنت متأكد من حذف هذا الحجز؟")) {
    bookings[field].data[date].splice(index, 1);
    if (bookings[field].data[date].length === 0) {
      delete bookings[field].data[date];
    }
    updateTable();
    updateTimeline();
    updateQuickSummary();
    updateChart();
    saveToLocalStorage();
    alert("تم حذف الحجز بنجاح!");
  }
}

// -------------------- الجدول الزمني (Timeline) --------------------
function updateTimeline() {
  const selectedField = document.getElementById("field-select").value;
  const selectedDate = document.getElementById("date-select").value;
  const timeline = document.getElementById("timeline");
  timeline.innerHTML = "";

  if (!selectedField || !selectedDate) return;

  for (let hour = WORKING_HOURS_START; hour < WORKING_HOURS_END; hour++) {
    const slot = document.createElement("div");
    slot.classList.add("slot");
    slot.textContent = `${hour}:00 - ${hour + 1}:00`;

    const isBooked = bookings[selectedField].data[selectedDate]?.some(booking => {
      const start = new Date(booking.dateFrom);
      const end = new Date(booking.dateTo);
      const slotStart = hour;
      const slotEnd = hour + 1;
      const bookingStart = start.getHours() + start.getMinutes() / 60;
      const bookingEnd = end.getHours() + end.getMinutes() / 60;
      return (bookingStart < slotEnd && bookingEnd > slotStart);
    });

    slot.classList.add(isBooked ? "booked" : "available");
    timeline.appendChild(slot);
  }
}

// -------------------- الإشعارات --------------------
function scheduleNotification(booking) {
  const now = new Date();
  const bookingStart = new Date(booking.dateFrom);
  const timeUntilNotification = bookingStart - now - 10 * 60 * 1000; // قبل 10 دقائق

  if (timeUntilNotification > 0) {
    const timeoutId = setTimeout(() => {
      showNotification(booking, "قبل 10 دقائق من الحجز");
    }, timeUntilNotification);
    notificationTimeouts.push(timeoutId);
  }

  const timeUntilStart = bookingStart - now;
  if (timeUntilStart > 0) {
    const timeoutId = setTimeout(() => {
      showNotification(booking, "موعد الحجز الآن");
    }, timeUntilStart);
    notificationTimeouts.push(timeoutId);
  }
}

function showNotification(booking, messagePrefix) {
  const message = `${messagePrefix}: ملعب ${booking.field} الساعة ${new Date(booking.dateFrom).toLocaleTimeString()} باسم ${booking.name}.`;
  if (Notification.permission === "granted") {
    new Notification("تذكير بالحجز", { body: message });
  }
  playVoiceNotification(message);
}

function playVoiceNotification(message) {
  if ("speechSynthesis" in window) {
    const utterance = new SpeechSynthesisUtterance(message);
    utterance.lang = "ar-SA";
    window.speechSynthesis.speak(utterance);
  }
}

function requestNotificationPermission() {
  if (Notification.permission !== "granted") {
    Notification.requestPermission();
  }
}

function checkForUpcomingBookings() {
  const now = new Date();
  for (let field in bookings) {
    for (let date in bookings[field].data) {
      bookings[field].data[date].forEach(booking => {
        const bookingStartTime = new Date(booking.dateFrom);
        const timeDiff = (bookingStartTime - now) / (1000 * 60);
        if (timeDiff > 0 && timeDiff <= 10) {
          const message = `تنبيه! لديك حجز على ملعب "${field}" سيبدأ في ${bookingStartTime.toLocaleTimeString()} باسم "${booking.name}".`;
          showDesktopNotification("تنبيه حجز", message);
          playVoiceNotification(message);
        }
      });
    }
  }
}
setInterval(checkForUpcomingBookings, 60 * 1000);

function showDesktopNotification(title, body) {
  if (Notification.permission === "granted") {
    new Notification(title, { body });
  }
}

// -------------------- حفظ واستيراد البيانات --------------------
function saveToLocalStorage() {
  localStorage.setItem("bookings", JSON.stringify(bookings, null, 2));
}

function loadBookings() {
  const savedData = localStorage.getItem("bookings");
  if (savedData) {
    bookings = JSON.parse(savedData);
    updateTable();
    updateTimeline();
    updateFieldDropdowns();
    updateFieldsManagementUI();
    updateQuickSummary();
    updateChart();
    alert("تم استرجاع البيانات من الحفظ المحلي!");
  } else {
    alert("لا توجد بيانات محفوظة محليًا.");
  }
}

function saveAsJson() {
  disableButton("save-json-btn", true);
  try {
    const data = JSON.stringify(bookings, null, 2);
    const blob = new Blob([data], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "bookings.json";
    link.click();
    URL.revokeObjectURL(url);
    alert("تم حفظ البيانات بنجاح!");
  } finally {
    disableButton("save-json-btn", false);
  }
}

function importFromJson(event) {
  const file = event.target.files[0];
  if (file) {
    const reader = new FileReader();
    reader.onload = function(e) {
      bookings = JSON.parse(e.target.result);
      updateTable();
      updateTimeline();
      updateFieldDropdowns();
      updateFieldsManagementUI();
      updateQuickSummary();
      updateChart();
      saveToLocalStorage();
      alert("تم استيراد البيانات بنجاح!");
    };
    reader.readAsText(file);
  }
}

// -------------------- تصدير إلى Excel و PDF --------------------
function exportToExcel() {
  disableButton("export-excel-btn", true);
  try {
    let data = [];
    for (let field in bookings) {
      for (let date in bookings[field].data) {
        bookings[field].data[date].forEach(booking => {
          data.push({
            "الملعب": field,
            "اسم الحاجز": booking.name,
            "رقم الهاتف": booking.phone,
            "نوع النشاط": booking.activityType,
            "تاريخ البداية": new Date(booking.dateFrom).toLocaleString(),
            "تاريخ النهاية": new Date(booking.dateTo).toLocaleString(),
          });
        });
      }
    }
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "حجوزات الملاعب");
    XLSX.writeFile(wb, "bookings.xlsx");
  } finally {
    disableButton("export-excel-btn", false);
  }
}

function exportToPDF() {
  disableButton("export-pdf-btn", true);
  try {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    doc.text("تقرير الحجوزات", 10, 10);

    let data = [];
    for (let field in bookings) {
      for (let date in bookings[field].data) {
        bookings[field].data[date].forEach(booking => {
          data.push([
            field,
            booking.name,
            booking.phone,
            booking.activityType || "",
            new Date(booking.dateFrom).toLocaleString(),
            new Date(booking.dateTo).toLocaleString()
          ]);
        });
      }
    }

    doc.autoTable({
      head: [['الملعب', 'اسم الحاجز', 'رقم الهاتف', 'نوع النشاط', 'تاريخ البداية', 'تاريخ النهاية']],
      body: data,
      theme: 'striped',
      styles: { font: 'helvetica', fontSize: 8 },
      headStyles: { fillColor: [0, 123, 255] }
    });

    doc.save('bookings.pdf');
  } finally {
    disableButton("export-pdf-btn", false);
  }
}

// -------------------- التقارير والفواتير --------------------
function generateReport() {
  const field = document.getElementById("report-field").value;
  const period = document.getElementById("report-period").value;
  const reportContainer = document.getElementById("report-results");

  if (!field) {
    alert("يرجى اختيار الملعب.");
    return;
  }

  let startDate, endDate;

  if (period === "custom") {
    const fromDateStr = document.getElementById("report-from-date").value;
    const toDateStr = document.getElementById("report-to-date").value;
    if (!fromDateStr || !toDateStr) {
      alert("يرجى تحديد تاريخ البداية والنهاية.");
      return;
    }
    startDate = new Date(fromDateStr);
    endDate = new Date(toDateStr);
    endDate.setDate(endDate.getDate() + 1);
  } else {
    let now = new Date();
    switch (period) {
      case "daily":
        startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        endDate = new Date(startDate);
        endDate.setDate(startDate.getDate() + 1);
        break;
      case "weekly":
        startDate = new Date(now);
        startDate.setDate(now.getDate() - now.getDay());
        endDate = new Date(startDate);
        endDate.setDate(startDate.getDate() + 7);
        break;
      case "monthly":
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
        endDate = new Date(now.getFullYear(), now.getMonth() + 1, 1);
        break;
      default:
        startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        endDate = new Date(startDate);
        endDate.setDate(startDate.getDate() + 1);
        break;
    }
  }

  let reportData = [];
  let totalRevenue = 0;
  let totalBookings = 0;

  for (let date in bookings[field].data) {
    const bookingDateObj = new Date(date);
    if (bookingDateObj >= startDate && bookingDateObj < endDate) {
      bookings[field].data[date].forEach((booking, index) => {
        const { cost } = calculateBookingCost(booking, field);
        totalRevenue += cost;
        totalBookings++;
        reportData.push({
          "اسم الحاجز": booking.name,
          "رقم الهاتف": booking.phone,
          "نوع النشاط": booking.activityType,
          "تاريخ البداية": new Date(booking.dateFrom).toLocaleString(),
          "تاريخ النهاية": new Date(booking.dateTo).toLocaleString(),
          "التكلفة": cost.toFixed(2),
          _field: field,
          _date: date,
          _index: index
        });
      });
    }
  }

  if (reportData.length === 0) {
    reportContainer.innerHTML = "<p>لا توجد حجوزات لهذه الفترة.</p>";
    return;
  }

  let table = `<table>
    <thead>
      <tr>
        <th>اختيار</th>
        <th>اسم الحاجز</th>
        <th>رقم الهاتف</th>
        <th>نوع النشاط</th>
        <th>تاريخ البداية</th>
        <th>تاريخ النهاية</th>
        <th>التكلفة</th>
      </tr>
    </thead>
    <tbody>`;
  reportData.forEach(row => {
    table += `<tr>
      <td>
        <input type="checkbox" class="invoice-checkbox" 
               data-field="${row._field}" 
               data-date="${row._date}" 
               data-index="${row._index}">
      </td>
      <td>${escapeHtml(row["اسم الحاجز"])}</td>
      <td>${escapeHtml(row["رقم الهاتف"])}</td>
      <td>${escapeHtml(row["نوع النشاط"] || "")}</td>
      <td>${row["تاريخ البداية"]}</td>
      <td>${row["تاريخ النهاية"]}</td>
      <td>${row["التكلفة"]}</td>
    </tr>`;
  });
  table += `</tbody></table>`;
  table += `<div class="report-summary">إجمالي الحجوزات: ${totalBookings} | إجمالي الإيرادات: ${totalRevenue.toFixed(2)}</div>`;
  table += `<button onclick="generateInvoice()">تحرير فاتورة للمختار</button>`;
  table += `<button onclick="showPastBookings()">عرض الحجوزات السابقة</button>`;
  reportContainer.innerHTML = table;
}

function generateInvoice() {
  const checkboxes = document.querySelectorAll(".invoice-checkbox:checked");
  if (checkboxes.length === 0) {
    alert("يرجى اختيار حجز واحد على الأقل لتحرير الفاتورة.");
    return;
  }

  let invoiceData = [];
  let totalAmount = 0;

  checkboxes.forEach(checkbox => {
    const field = checkbox.getAttribute("data-field");
    const date = checkbox.getAttribute("data-date");
    const index = parseInt(checkbox.getAttribute("data-index"));

    const booking = bookings[field].data[date][index];
    const { cost, totalHours, morningDuration, eveningDuration } = calculateBookingCost(booking, field);
    totalAmount += cost;

    invoiceData.push({
      field,
      name: booking.name,
      phone: booking.phone,
      activityType: booking.activityType,
      dateFrom: new Date(booking.dateFrom).toLocaleString(),
      dateTo: new Date(booking.dateTo).toLocaleString(),
      totalHours: totalHours.toFixed(2),
      cost: cost.toFixed(2),
      morningDuration: morningDuration.toFixed(2),
      eveningDuration: eveningDuration.toFixed(2)
    });
  });

  let invoiceHtml = `<div class="invoice">
    <h2>فاتورة الحجوزات</h2>
    <table>
      <thead>
        <tr>
          <th>الملعب</th>
          <th>اسم الحاجز</th>
          <th>رقم الهاتف</th>
          <th>نوع النشاط</th>
          <th>تاريخ البداية</th>
          <th>تاريخ النهاية</th>
          <th>ساعات صباح</th>
          <th>ساعات مساء</th>
          <th>إجمالي الساعات</th>
          <th>السعر</th>
        </tr>
      </thead>
      <tbody>`;
  invoiceData.forEach(item => {
    invoiceHtml += `<tr>
      <td>${escapeHtml(item.field)}</td>
      <td>${escapeHtml(item.name)}</td>
      <td>${escapeHtml(item.phone)}</td>
      <td>${escapeHtml(item.activityType || "")}</td>
      <td>${item.dateFrom}</td>
      <td>${item.dateTo}</td>
      <td>${item.morningDuration}</td>
      <td>${item.eveningDuration}</td>
      <td>${item.totalHours}</td>
      <td>${item.cost}</td>
    </tr>`;
  });
  invoiceHtml += `</tbody>
    </table>
    <h3>المجموع: ${totalAmount.toFixed(2)}</h3>
    <button onclick="printInvoice()">طباعة الفاتورة</button>
    <button onclick="exportInvoiceToPDF()">تصدير الفاتورة PDF</button>
  </div>`;

  const reportContainer = document.getElementById("report-results");
  reportContainer.innerHTML += invoiceHtml;
}

function printInvoice() {
  const invoiceElement = document.querySelector(".invoice");
  if (!invoiceElement) {
    alert("لا توجد فاتورة لطباعة.");
    return;
  }
  const printWindow = window.open("", "", "height=600,width=800");
  printWindow.document.write("<html><head><title>فاتورة الحجوزات</title>");
  printWindow.document.write("<style>body{font-family: Arial, sans-serif;} table {width: 100%;border-collapse: collapse;} table, th, td {border: 1px solid #ddd;padding: 8px;text-align: center;} h2, h3 {text-align: center;}</style>");
  printWindow.document.write("</head><body>");
  printWindow.document.write(invoiceElement.outerHTML);
  printWindow.document.write("</body></html>");
  printWindow.document.close();
  printWindow.focus();
  printWindow.print();
  printWindow.close();
}

function exportInvoiceToPDF() {
  const invoiceElement = document.querySelector(".invoice");
  if (!invoiceElement) {
    alert("لا توجد فاتورة لتصدير.");
    return;
  }

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();

  doc.html(invoiceElement, {
    callback: function(doc) {
      doc.save("invoice.pdf");
    },
    x: 10,
    y: 10,
    html2canvas: { scale: 0.5 }
  });
}

function showPastBookings() {
  const now = new Date();
  let pastBookings = [];

  for (let field in bookings) {
    for (let date in bookings[field].data) {
      bookings[field].data[date].forEach((booking, index) => {
        if (new Date(booking.dateTo) < now) {
          pastBookings.push({
            field,
            ...booking,
            index,
            dateKey: date
          });
        }
      });
    }
  }

  if (pastBookings.length === 0) {
    alert("لا توجد حجوزات سابقة.");
    return;
  }

  let html = `<h3>الحجوزات السابقة</h3><table>
    <thead>
      <tr>
        <th>الملعب</th>
        <th>اسم الحاجز</th>
        <th>رقم الهاتف</th>
        <th>نوع النشاط</th>
        <th>تاريخ البداية</th>
        <th>تاريخ النهاية</th>
      </tr>
    </thead>
    <tbody>`;
  pastBookings.forEach(b => {
    html += `<tr>
      <td>${escapeHtml(b.field)}</td>
      <td>${escapeHtml(b.name)}</td>
      <td>${escapeHtml(b.phone)}</td>
      <td>${escapeHtml(b.activityType || "")}</td>
      <td>${new Date(b.dateFrom).toLocaleString()}</td>
      <td>${new Date(b.dateTo).toLocaleString()}</td>
    </tr>`;
  });
  html += "</tbody></table>";
  document.getElementById("report-results").innerHTML = html;
}

// -------------------- إدارة الملاعب --------------------
function updateFieldDropdowns() {
  const dropdownIds = ["field", "field-select", "report-field"];
  dropdownIds.forEach(id => {
    const dropdown = document.getElementById(id);
    if (!dropdown) return;
    const currentValue = dropdown.value;
    dropdown.innerHTML = "";
    if (id === "field-select" || id === "report-field") {
      const placeholder = document.createElement("option");
      placeholder.value = "";
      placeholder.textContent = "اختر الملعب";
      dropdown.appendChild(placeholder);
    }
    Object.keys(bookings).forEach(field => {
      const option = document.createElement("option");
      option.value = field;
      option.textContent = field;
      dropdown.appendChild(option);
    });
    dropdown.value = currentValue;
  });

  const chartFieldSelect = document.getElementById('chart-field-select');
  if (chartFieldSelect) {
    chartFieldSelect.innerHTML = '';
    Object.keys(bookings).forEach(field => {
      const option = document.createElement('option');
      option.value = field;
      option.textContent = field;
      chartFieldSelect.appendChild(option);
    });
  }
}

function updateFieldsManagementUI() {
  const fieldsList = document.getElementById("fields-list");
  fieldsList.innerHTML = "";
  Object.keys(bookings).forEach(field => {
    const li = document.createElement("li");
    li.innerHTML = `
      <span class="field-name">${escapeHtml(field)}</span>
      <span class="field-price">صباح: ${bookings[field].price.morning} | مساء: ${bookings[field].price.evening}</span>
      <button onclick="editField('${field.replace(/'/g, "\\'")}')">تعديل</button>
      <button onclick="removeField('${field.replace(/'/g, "\\'")}')">حذف</button>
    `;
    fieldsList.appendChild(li);
  });
}

function editField(field) {
  const newName = prompt("أدخل الاسم الجديد للملعب (اتركه فارغاً إذا لم ترد التغيير):", field);
  const newMorningPrice = prompt("أدخل السعر الجديد للفترة الصباحية:", bookings[field].price.morning);
  const newEveningPrice = prompt("أدخل السعر الجديد للفترة المسائية:", bookings[field].price.evening);

  if (newName !== null && newName.trim() !== "" && newName !== field) {
    bookings[newName.trim()] = bookings[field];
    delete bookings[field];
    field = newName.trim();
  }

  if (newMorningPrice !== null) {
    const morning = parseFloat(newMorningPrice);
    if (!isNaN(morning)) bookings[field].price.morning = morning;
  }
  if (newEveningPrice !== null) {
    const evening = parseFloat(newEveningPrice);
    if (!isNaN(evening)) bookings[field].price.evening = evening;
  }

  updateFieldDropdowns();
  updateFieldsManagementUI();
  saveToLocalStorage();
  alert("تم تعديل بيانات الملعب بنجاح!");
}

function removeField(fieldName) {
  let bookingCount = 0;
  for (let date in bookings[fieldName].data) {
    bookingCount += bookings[fieldName].data[date].length;
  }
  if (confirm(`هل أنت متأكد من حذف الملعب "${fieldName}"؟ سيؤدي ذلك إلى حذف ${bookingCount} حجز/حجوزات مرتبطة به.`)) {
    delete bookings[fieldName];
    updateFieldDropdowns();
    updateFieldsManagementUI();
    updateTable();
    updateTimeline();
    updateQuickSummary();
    updateChart();
    saveToLocalStorage();
    alert("تم حذف الملعب بنجاح!");
  }
}

function addField() {
  const newFieldName = document.getElementById("new-field-name").value.trim();
  const morningPriceInput = document.getElementById("new-field-morning-price").value.trim();
  const eveningPriceInput = document.getElementById("new-field-evening-price").value.trim();

  if (newFieldName === "" || morningPriceInput === "" || eveningPriceInput === "") {
    alert("يرجى إدخال اسم الملعب والسعرين للفترتين.");
    return;
  }
  if (bookings.hasOwnProperty(newFieldName)) {
    alert("هذا الملعب موجود بالفعل.");
    return;
  }

  const morningPrice = parseFloat(morningPriceInput);
  const eveningPrice = parseFloat(eveningPriceInput);
  if (isNaN(morningPrice) || isNaN(eveningPrice)) {
    alert("يجب إدخال أرقام صحيحة للسعر.");
    return;
  }

  bookings[newFieldName] = {
    data: {},
    price: { morning: morningPrice, evening: eveningPrice }
  };

  document.getElementById("new-field-name").value = "";
  document.getElementById("new-field-morning-price").value = "";
  document.getElementById("new-field-evening-price").value = "";

  updateFieldDropdowns();
  updateFieldsManagementUI();
  saveToLocalStorage();
  alert("تم إضافة الملعب بنجاح!");
}

// -------------------- الملخص السريع --------------------
function updateQuickSummary() {
  const today = new Date();
  const todayKey = getLocalDateKey(today);
  let totalBookingsToday = 0;
  let totalRevenueToday = 0;

  for (let field in bookings) {
    if (bookings[field].data[todayKey]) {
      bookings[field].data[todayKey].forEach(booking => {
        totalBookingsToday++;
        const { cost } = calculateBookingCost(booking, field);
        totalRevenueToday += cost;
      });
    }
  }

  document.getElementById("today-bookings").textContent = totalBookingsToday;
  document.getElementById("today-revenue").textContent = totalRevenueToday.toFixed(2);
}

// -------------------- الرسم البياني --------------------
function updateChart() {
  const ctx = document.getElementById('revenueChart').getContext('2d');
  if (revenueChart) revenueChart.destroy();

  const chartViewMode = document.getElementById('chart-view-mode').value;
  const chartPeriod = document.getElementById('chart-period').value;

  // إظهار/إخفاء قائمة اختيار الملعب في وضع single
  const container = document.getElementById('chart-field-select-container');
  if (chartViewMode === 'single') {
    container.style.display = 'block';
  } else {
    container.style.display = 'none';
  }

  // تحديد نطاق التواريخ حسب الفترة
  const endDate = new Date();
  let startDate;
  switch (chartPeriod) {
    case 'week':
      startDate = new Date();
      startDate.setDate(endDate.getDate() - 7);
      break;
    case 'month':
      startDate = new Date();
      startDate.setMonth(endDate.getMonth() - 1);
      break;
    case 'year':
      startDate = new Date();
      startDate.setFullYear(endDate.getFullYear() - 1);
      break;
    default:
      startDate = new Date();
      startDate.setDate(endDate.getDate() - 7);
  }

  // إنشاء قائمة الأيام بين startDate و endDate
  const labels = [];
  const dateMap = new Map(); // تاريخ -> فهرس
  let currentDate = new Date(startDate);
  while (currentDate <= endDate) {
    const dateKey = getLocalDateKey(currentDate);
    labels.push(dateKey);
    dateMap.set(dateKey, labels.length - 1);
    currentDate.setDate(currentDate.getDate() + 1);
  }

  let datasets = [];

  if (chartViewMode === 'all') {
    // مجموعة بيانات لكل ملعب
    const colors = ['#007bff', '#28a745', '#dc3545', '#ffc107', '#17a2b8', '#6f42c1'];
    let colorIndex = 0;
    for (let field in bookings) {
      const revenueByDay = new Array(labels.length).fill(0);
      for (let date in bookings[field].data) {
        if (dateMap.has(date)) {
          const idx = dateMap.get(date);
          bookings[field].data[date].forEach(booking => {
            const { cost } = calculateBookingCost(booking, field);
            revenueByDay[idx] += cost;
          });
        }
      }
      datasets.push({
        label: field,
        data: revenueByDay,
        borderColor: colors[colorIndex % colors.length],
        backgroundColor: 'transparent',
        tension: 0.1,
        pointRadius: 2,
      });
      colorIndex++;
    }
  } else {
    // ملعب واحد محدد
    const selectedField = document.getElementById('chart-field-select').value;
    if (!selectedField) {
      alert('يرجى اختيار ملعب');
      return;
    }
    const revenueByDay = new Array(labels.length).fill(0);
    for (let date in bookings[selectedField]?.data || {}) {
      if (dateMap.has(date)) {
        const idx = dateMap.get(date);
        bookings[selectedField].data[date].forEach(booking => {
          const { cost } = calculateBookingCost(booking, selectedField);
          revenueByDay[idx] += cost;
        });
      }
    }
    datasets.push({
      label: selectedField,
      data: revenueByDay,
      borderColor: '#007bff',
      backgroundColor: 'rgba(0,123,255,0.1)',
      fill: true,
    });
  }

  revenueChart = new Chart(ctx, {
    type: 'line',
    data: { labels, datasets },
    options: {
      responsive: true,
      plugins: {
        legend: { display: chartViewMode === 'all' },
        title: { display: true, text: 'تحليل الإيرادات' }
      },
      scales: {
        y: { beginAtZero: true }
      }
    }
  });
}

// -------------------- Firebase (اختياري) --------------------
const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_AUTH_DOMAIN",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_STORAGE_BUCKET",
  messagingSenderId: "YOUR_SENDER_ID",
  appId: "YOUR_APP_ID"
};

let db;
try {
  firebase.initializeApp(firebaseConfig);
  db = firebase.firestore();
  console.log("Firebase initialized");
} catch (e) {
  console.warn("Firebase not configured", e);
}

function saveToFirebase() {
  if (!db) {
    alert("Firebase غير مهيأ. يرجى إضافة الإعدادات في script.js");
    return;
  }
  disableButton("firebase-save-btn", true);
  db.collection("bookings").doc("main").set(bookings)
    .then(() => {
      alert("تم حفظ البيانات في Firebase بنجاح!");
    })
    .catch(error => {
      alert("خطأ في الحفظ: " + error.message);
    })
    .finally(() => {
      disableButton("firebase-save-btn", false);
    });
}

function loadFromFirebase() {
  if (!db) {
    alert("Firebase غير مهيأ. يرجى إضافة الإعدادات في script.js");
    return;
  }
  disableButton("firebase-load-btn", true);
  db.collection("bookings").doc("main").get()
    .then(doc => {
      if (doc.exists) {
        bookings = doc.data();
        updateTable();
        updateTimeline();
        updateFieldDropdowns();
        updateFieldsManagementUI();
        updateQuickSummary();
        updateChart();
        saveToLocalStorage();
        alert("تم تحميل البيانات من Firebase بنجاح!");
      } else {
        alert("لا توجد بيانات في Firebase.");
      }
    })
    .catch(error => {
      alert("خطأ في التحميل: " + error.message);
    })
    .finally(() => {
      disableButton("firebase-load-btn", false);
    });
}

// -------------------- دوال مساعدة للواجهة --------------------
function disableButton(id, disabled) {
  const btn = document.getElementById(id);
  if (btn) {
    btn.disabled = disabled;
    const originalText = btn.getAttribute("data-original-text");
    if (disabled) {
      btn.setAttribute("data-original-text", btn.textContent);
      btn.textContent = "جاري التنفيذ...";
    } else if (originalText) {
      btn.textContent = originalText;
      btn.removeAttribute("data-original-text");
    }
  }
}

// -------------------- أحداث وإظهار/إخفاء --------------------
document.getElementById("toggle-fields").addEventListener("change", function() {
  const fieldsList = document.getElementById("fields-list");
  fieldsList.style.display = this.checked ? "block" : "none";
  localStorage.setItem("showFieldsList", this.checked);
});

document.getElementById("report-period").addEventListener("change", function() {
  const customRange = document.getElementById("custom-date-range");
  customRange.style.display = this.value === "custom" ? "block" : "none";
});

document.getElementById("recurring-checkbox")?.addEventListener("change", function() {
  const details = document.getElementById("recurring-details");
  details.style.display = this.checked ? "block" : "none";
});

document.getElementById('chart-view-mode').addEventListener('change', updateChart);
document.getElementById('chart-period').addEventListener('change', updateChart);
document.getElementById('chart-field-select').addEventListener('change', updateChart);

// -------------------- تحميل البيانات عند بدء التشغيل --------------------
window.onload = function() {
  loadBookings();

  const savedState = localStorage.getItem("showFieldsList");
  const toggleFields = document.getElementById("toggle-fields");
  if (savedState !== null) {
    toggleFields.checked = savedState === "true";
    document.getElementById("fields-list").style.display = toggleFields.checked ? "block" : "none";
  }

  updateFieldDropdowns();
  updateFieldsManagementUI();
  requestNotificationPermission();
  updateQuickSummary();
  updateChart();

  document.getElementById("field").addEventListener("change", updateEstimatedCost);
  document.getElementById("date-from").addEventListener("input", updateEstimatedCost);
  document.getElementById("date-to").addEventListener("input", updateEstimatedCost);
};

function exportReportToExcel() {
  alert("سيتم تنفيذ تصدير التقرير إلى Excel لاحقاً");
}
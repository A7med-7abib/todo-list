// ===== App State =====
let deliveries = JSON.parse(
  localStorage.getItem("routeTracker_deliveries") || "[]",
);
let currentFilter = "all";
let currentMonthFilter = "all";
let currentEngineerFilter = "all";
let currentDateSort = "desc";
let editingId = null;

function getDayName(dateStr) {
  if (!dateStr) return "";
  const date = new Date(dateStr + "T00:00:00");
  return date.toLocaleDateString("en-US", {
    weekday: "long",
  });
}

// ===== Initialize =====
document.addEventListener("DOMContentLoaded", async () => {
  // Set today's date and day name as default
  const today = new Date().toISOString().split("T")[0];
  const dateInput = document.getElementById("deliveryDate");
  const dayInput = document.getElementById("deliveryDays");

  if (dateInput) {
    dateInput.value = today;
    dateInput.addEventListener("change", (e) => {
      if (e.target.value && dayInput) {
        dayInput.value = getDayName(e.target.value);
      }
    });
  }
  if (dayInput && !dayInput.value) {
    dayInput.value = getDayName(today);
  }

  updateEngineerFilterOptions();
  updateMonthFilterOptions();
  renderDeliveries(); // Render local first
  updateStats();

  // Fetch from Supabase
  const dbData = await fetchDeliveries();
  if (dbData && dbData.length > 0) {
    deliveries = dbData;
    saveToStorage(); // Sync local cache
    updateEngineerFilterOptions();
    updateMonthFilterOptions();
    renderDeliveries();
    updateStats();
  } else if (dbData && dbData.length === 0 && deliveries.length > 0) {
    console.log("Supabase is empty, keeping local data");
  }
});

// ===== Form Toggle =====
function toggleForm() {
  const body = document.getElementById("formBody");
  const icon = document.getElementById("formToggleIcon");
  body.classList.toggle("collapsed");
  icon.classList.toggle("rotated");
}

// ===== Route Stops Management =====
function addStop() {
  const container = document.getElementById("stopsContainer");
  const stops = container.querySelectorAll(".stop-item");
  const newIndex = stops.length + 1;

  const segmentEl = document.createElement("div");
  segmentEl.className = "route-segment";
  segmentEl.innerHTML = `
    <div class="segment-line"></div>
    <div class="segment-cost">
      <span class="segment-cost-icon"><i class="bi bi-cash-coin"></i></span>
      <input type="number" class="segment-cost-input" placeholder="Cost to next stop..." min="0" step="0.01" oninput="calculateTotalCost()" />
    </div>
  `;

  const stopEl = document.createElement("div");
  stopEl.className = "stop-item";
  stopEl.setAttribute("data-stop", newIndex);
  stopEl.innerHTML = `
        <div class="stop-marker mid"><span>${newIndex}</span></div>
        <input type="text" class="stop-input stop-name"
            placeholder="Stop ${newIndex}...">
        <button class="btn-remove-stop" onclick="removeStop(this)" title="Remove">✕</button>
    `;

  // Insert the new stop, then the segment connecting it to the final destination
  const lastStop = stops[stops.length - 1];
  container.insertBefore(stopEl, lastStop);
  container.insertBefore(segmentEl, lastStop);

  updateStopNumbers();
  updateRemoveButtons();
}

function removeStop(btn) {
  const stopItem = btn.closest(".stop-item");
  // Remove the segment line preceding it if it's not the first stop
  const prevSegment = stopItem.previousElementSibling;
  if (prevSegment && prevSegment.classList.contains("route-segment")) {
    prevSegment.remove();
  } else {
    // If it was the first stop, remove the segment after it
    const nextSegment = stopItem.nextElementSibling;
    if (nextSegment && nextSegment.classList.contains("route-segment")) {
      nextSegment.remove();
    }
  }

  stopItem.style.animation = "slideOut 0.3s ease forwards";
  setTimeout(() => {
    stopItem.remove();
    updateStopNumbers();
    updateRemoveButtons();
    calculateTotalCost();
  }, 300);
}

function calculateTotalCost() {
  const costInputs = document.querySelectorAll(
    "#stopsContainer .segment-cost-input",
  );
  let total = 0;
  costInputs.forEach((input) => {
    total += parseFloat(input.value) || 0;
  });
  document.getElementById("deliveryCost").value = total.toFixed(2);
}

function updateStopNumbers() {
  const container = document.getElementById("stopsContainer");
  const stops = container.querySelectorAll(".stop-item");

  stops.forEach((stop, i) => {
    const marker = stop.querySelector(".stop-marker");
    const span = marker.querySelector("span");
    span.textContent = i + 1;

    // Update marker class
    marker.className = "stop-marker";
    if (i === 0) {
      marker.classList.add("start");
    } else if (i === stops.length - 1) {
      marker.classList.add("end");
    } else {
      marker.classList.add("mid");
    }

    stop.setAttribute("data-stop", i + 1);
  });
}

function updateRemoveButtons() {
  const container = document.getElementById("stopsContainer");
  const stops = container.querySelectorAll(".stop-item");
  const removeBtns = container.querySelectorAll(".btn-remove-stop");

  removeBtns.forEach((btn) => {
    btn.style.display = stops.length > 2 ? "flex" : "none";
  });
}

// ===== Save Delivery =====
async function saveDelivery() {
  const date = document.getElementById("deliveryDate").value;
  const doctor = document.getElementById("doctorName").value.trim();
  const engineer = document.getElementById("engineerName").value.trim();
  const days = document.getElementById("deliveryDays").value.trim();
  const cost = parseFloat(document.getElementById("deliveryCost").value) || 0;
  const notes = document.getElementById("notes").value.trim();
  const status = document.querySelector('input[name="status"]:checked').value;

  // Gather stops
  const stopItems = document.querySelectorAll("#stopsContainer .stop-item");
  const costInputs = document.querySelectorAll(
    "#stopsContainer .segment-cost-input",
  );
  const stops = [];
  stopItems.forEach((item, index) => {
    const nameInput = item.querySelector(".stop-name");
    const name = nameInput.value.trim();
    if (name) {
      const stopObj = { name: name };
      if (index < costInputs.length) {
        stopObj.nextCost = parseFloat(costInputs[index].value) || 0;
      }
      stops.push(stopObj);
    }
  });

  if (!date) {
    showToast("Please select a date");
    return;
  }
  if (!doctor) {
    showToast("Please enter doctor name");
    document.getElementById("doctorName").focus();
    return;
  }
  if (stops.length < 2) {
    showToast("Please enter at least 2 stops");
    return;
  }

  const delivery = {
    date,
    doctor,
    engineer: engineer || "",
    days,
    cost,
    stops,
    notes,
    status,
  };

  const btn = document.getElementById("btnSubmit");
  const originalText = btn.innerHTML;
  btn.innerHTML = "Saving...";
  btn.disabled = true;

  const inserted = await insertDelivery(delivery);

  btn.innerHTML = originalText;
  btn.disabled = false;

  if (inserted) {
    deliveries.unshift(inserted);
    saveToStorage();
    updateEngineerFilterOptions();
    updateMonthFilterOptions();
    renderDeliveries();
    updateStats();
    resetForm();
    showToast("Delivery saved!");
  } else {
    // Fallback: save locally so user never loses their data
    const localDelivery = {
      ...delivery,
      id: "local_" + Date.now(),
      created_at: new Date().toISOString(),
    };
    deliveries.unshift(localDelivery);
    saveToStorage();
    updateEngineerFilterOptions();
    updateMonthFilterOptions();
    renderDeliveries();
    updateStats();
    resetForm();
    showToast("Saved locally (Check Supabase schema)");
  }
}

function resetForm() {
  document.getElementById("doctorName").value = "";
  document.getElementById("engineerName").value = "";
  const today = new Date().toISOString().split("T")[0];
  const dateInput = document.getElementById("deliveryDate");
  if (dateInput) dateInput.value = today;
  const dayInput = document.getElementById("deliveryDays");
  if (dayInput) dayInput.value = getDayName(today);
  document.getElementById("deliveryCost").value = "0.00";
  document.getElementById("notes").value = "";
  document.querySelector('input[name="status"][value="pending"]').checked =
    true;

  // Reset stops to 2
  const container = document.getElementById("stopsContainer");
  container.innerHTML = `
        <div class="stop-item" data-stop="1">
            <div class="stop-marker start"><span>1</span></div>
            <input type="text" class="stop-input stop-name"
                placeholder="Starting point...">
            <button class="btn-remove-stop" onclick="removeStop(this)" title="Remove" style="display:none;">✕</button>
        </div>
        <div class="route-segment">
          <div class="segment-line"></div>
          <div class="segment-cost">
            <span class="segment-cost-icon"><i class="bi bi-cash-coin"></i></span>
            <input type="number" class="segment-cost-input" placeholder="Cost to next stop..." min="0" step="0.01" oninput="calculateTotalCost()" />
          </div>
        </div>
        <div class="stop-item" data-stop="2">
            <div class="stop-marker end"><span>2</span></div>
            <input type="text" class="stop-input stop-name"
                placeholder="Final destination...">
            <button class="btn-remove-stop" onclick="removeStop(this)" title="Remove" style="display:none;">✕</button>
        </div>
    `;

  // Set today's date
  document.getElementById("deliveryDate").value = today;
}

// ===== Render Deliveries =====
function renderDeliveries() {
  const list = document.getElementById("deliveriesList");
  const emptyState = document.getElementById("emptyState");
  const searchTerm = document.getElementById("searchInput").value.toLowerCase();

  let filtered = [...deliveries];

  // Filter by status
  if (currentFilter !== "all") {
    filtered = filtered.filter((d) => d.status === currentFilter);
  }

  // Filter by month
  if (currentMonthFilter !== "all") {
    filtered = filtered.filter(
      (d) => d.date && d.date.startsWith(currentMonthFilter),
    );
  }

  // Filter by engineer
  if (currentEngineerFilter !== "all") {
    filtered = filtered.filter(
      (d) =>
        d.engineer &&
        d.engineer.trim().toLowerCase() === currentEngineerFilter.toLowerCase(),
    );
  }

  // Filter by search
  if (searchTerm) {
    filtered = filtered.filter(
      (d) =>
        d.doctor.toLowerCase().includes(searchTerm) ||
        d.stops.some((s) => {
          const name = typeof s === "string" ? s : s.name;
          return name.toLowerCase().includes(searchTerm);
        }) ||
        (d.engineer && d.engineer.toLowerCase().includes(searchTerm)) ||
        (d.days && String(d.days).toLowerCase().includes(searchTerm)) ||
        (d.notes && d.notes.toLowerCase().includes(searchTerm)),
    );
  }

  // Arrange / Sort by date
  filtered.sort((a, b) => {
    const timeA = a.date ? new Date(a.date).getTime() : 0;
    const timeB = b.date ? new Date(b.date).getTime() : 0;
    if (currentDateSort === "asc") {
      return timeA - timeB;
    }
    return timeB - timeA;
  });

  if (filtered.length === 0) {
    list.innerHTML = "";
    emptyState.classList.add("show");
    return;
  }

  emptyState.classList.remove("show");

  list.innerHTML = filtered
    .map((d) => {
      const formattedDate = formatDate(d.date);
      const routeHtml = d.stops
        .map((stop, i) => {
          const isString = typeof stop === "string";
          const name = isString ? stop : stop.name;

          let html = `<span class="route-stop-tag">${escapeHtml(name)}</span>`;
          if (i < d.stops.length - 1) {
            html += `<span class="route-arrow">→</span>`;
          }
          return html;
        })
        .join("");

      const statusText = {
        pending: "Pending",
        "in-progress": "In Progress",
        completed: "Completed",
      };

      const stopsLabel = `${d.stops.length} stops`;

      let dayDisplay = "";
      if (d.days) {
        if (!isNaN(d.days) && typeof d.days === "number") {
          dayDisplay = ` &nbsp;•&nbsp; ${d.days} Days`;
        } else {
          dayDisplay = ` &nbsp;•&nbsp; ${escapeHtml(String(d.days))}`;
        }
      }

      return `
            <div class="delivery-card status-${d.status}" id="card-${d.id}">
                <div class="delivery-card-header">
                    <div class="delivery-card-info">
                        <h3>${escapeHtml(d.doctor)}</h3>
                        <div class="delivery-card-date">${d.engineer ? escapeHtml(d.engineer) + " &nbsp;•&nbsp; " : ""}${formattedDate}${dayDisplay} &nbsp;•&nbsp; Cost: ${d.cost || 0}</div>
                    </div>
                    <div class="delivery-card-actions">
                        <button class="btn-action" onclick="openEditModal('${d.id}')" title="Edit">Edit</button>
                        <button class="btn-action" onclick="cycleStatus('${d.id}')" title="Change Status">Status</button>
                        <button class="btn-action delete" onclick="deleteDelivery('${d.id}')" title="Delete">Del</button>
                    </div>
                </div>
                <div class="delivery-route">${routeHtml}</div>
                ${d.notes ? `<div class="delivery-notes">"${escapeHtml(d.notes)}"</div>` : ""}
                <div class="delivery-card-footer">
                    <span class="delivery-status-badge ${d.status}">${statusText[d.status]}</span>
                    <span class="delivery-stops-count">${stopsLabel}</span>
                </div>
            </div>
        `;
    })
    .join("");
}

// ===== Filter & Sort Functions =====
function filterByStatus(status, chipEl) {
  currentFilter = status;

  document
    .querySelectorAll(".chip")
    .forEach((c) => c.classList.remove("active"));
  chipEl.classList.add("active");

  renderDeliveries();
}

function filterByEngineer(engineer) {
  currentEngineerFilter = engineer;
  renderDeliveries();
}

function filterByMonth(month) {
  currentMonthFilter = month;
  renderDeliveries();
}

function changeDateSort(sortOrder) {
  currentDateSort = sortOrder;
  renderDeliveries();
}

function updateMonthFilterOptions() {
  const select = document.getElementById("monthFilter");
  if (!select) return;
  const currentVal = select.value || "all";

  const monthsSet = new Set();
  deliveries.forEach((d) => {
    if (d.date && typeof d.date === "string" && d.date.length >= 7) {
      monthsSet.add(d.date.substring(0, 7));
    }
  });

  const sortedMonths = Array.from(monthsSet).sort().reverse();

  let options = `<option value="all">All Months</option>`;
  sortedMonths.forEach((m) => {
    const parts = m.split("-");
    const year = parseInt(parts[0]);
    const month = parseInt(parts[1]);
    const dateObj = new Date(year, month - 1, 1);
    const monthName = dateObj.toLocaleDateString("en-US", {
      month: "long",
      year: "numeric",
    });
    options += `<option value="${m}">${monthName}</option>`;
  });

  select.innerHTML = options;
  if (sortedMonths.includes(currentVal)) {
    select.value = currentVal;
    currentMonthFilter = currentVal;
  } else {
    select.value = "all";
    currentMonthFilter = "all";
  }
}

function updateEngineerFilterOptions() {
  const select = document.getElementById("engineerFilter");
  if (!select) return;
  const currentVal = select.value || "all";
  const uniqueEngineers = Array.from(
    new Set(
      deliveries
        .map((d) => (d.engineer || "").trim())
        .filter((eng) => eng.length > 0),
    ),
  ).sort((a, b) => a.localeCompare(b));

  let options = `<option value="all">All Engineers</option>`;
  uniqueEngineers.forEach((eng) => {
    options += `<option value="${escapeHtml(eng)}">${escapeHtml(eng)}</option>`;
  });
  select.innerHTML = options;

  if (uniqueEngineers.includes(currentVal)) {
    select.value = currentVal;
    currentEngineerFilter = currentVal;
  } else {
    select.value = "all";
    currentEngineerFilter = "all";
  }
}

// ===== Export to Excel / CSV =====
function exportToExcel() {
  if (!deliveries || deliveries.length === 0) {
    showToast("No deliveries to export");
    return;
  }

  const headers = [
    "Date",
    "Day",
    "Doctor Name",
    "Engineer Name",
    "Route Stops",
    "Total Cost",
    "Status",
    "Notes",
  ];

  const rows = deliveries.map((d) => {
    const stopsStr = (d.stops || [])
      .map((s) => (typeof s === "string" ? s : s.name))
      .join(" -> ");

    return [
      `"${d.date || ""}"`,
      `"${d.days || ""}"`,
      `"${(d.doctor || "").replace(/"/g, '""')}"`,
      `"${(d.engineer || "").replace(/"/g, '""')}"`,
      `"${stopsStr.replace(/"/g, '""')}"`,
      `"${d.cost || 0}"`,
      `"${d.status || ""}"`,
      `"${(d.notes || "").replace(/"/g, '""')}"`,
    ];
  });

  const csvContent =
    "\uFEFF" + [headers.join(","), ...rows.map((r) => r.join(","))].join("\r\n");

  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  const today = new Date().toISOString().split("T")[0];
  link.setAttribute("href", url);
  link.setAttribute("download", `VIEW_TEC_Deliveries_${today}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  showToast("Excel export downloaded!");
}

// ===== Print Report =====
function printReport() {
  window.print();
}

function filterDeliveries() {
  renderDeliveries();
}

// ===== Status Cycle =====
async function cycleStatus(id) {
  const delivery = deliveries.find((d) => d.id === id);
  if (!delivery) return;

  const statusOrder = ["pending", "in-progress", "completed"];
  const currentIndex = statusOrder.indexOf(delivery.status);
  const newStatus = statusOrder[(currentIndex + 1) % statusOrder.length];

  // Optimistic UI update
  const oldStatus = delivery.status;
  delivery.status = newStatus;
  renderDeliveries();
  updateStats();

  const success = await updateDelivery(id, { status: newStatus });

  if (success) {
    saveToStorage();
    const statusLabels = {
      pending: "Pending",
      "in-progress": "In Progress",
      completed: "Completed",
    };
    showToast(`${statusLabels[newStatus]}`);
  } else {
    // Revert on fail
    delivery.status = oldStatus;
    renderDeliveries();
    updateStats();
    showToast("Error updating status");
  }
}

// ===== Delete =====
async function deleteDelivery(id) {
  const card = document.getElementById("card-" + id);
  if (card) {
    card.classList.add("removing");
    const success = await deleteDeliveryDb(id);
    if (success) {
      setTimeout(() => {
        deliveries = deliveries.filter((d) => d.id !== id);
        saveToStorage();
        updateEngineerFilterOptions();
        updateMonthFilterOptions();
        renderDeliveries();
        updateStats();
        showToast("Delivery deleted");
      }, 400);
    } else {
      card.classList.remove("removing");
      showToast("Error deleting delivery");
    }
  }
}

// ===== Edit Modal =====
function openEditModal(id) {
  editingId = id;
  const delivery = deliveries.find((d) => d.id === id);
  if (!delivery) return;

  const modal = document.getElementById("editModal");
  const body = document.getElementById("modalBody");

  const stopsHtml = delivery.stops
    .map((stop, i) => {
      const isString = typeof stop === "string";
      const name = isString ? stop : stop.name;
      const nextCost = isString ? 0 : stop.nextCost || 0;

      let html = `
        <div class="form-group stop-edit-item">
            <label>Stop ${i + 1}</label>
            <input type="text" class="edit-stop-input edit-stop-name" value="${escapeHtml(name)}"
                style="width:100%;padding:12px 16px;background:var(--bg-input);border:1px solid var(--border-color);border-radius:var(--radius-sm);color:var(--text-primary);font-family:inherit;font-size:0.9rem;outline:none;">
        </div>
      `;

      if (i < delivery.stops.length - 1) {
        html += `
        <div class="route-segment" style="margin-bottom:16px;">
          <div class="segment-line"></div>
          <div class="segment-cost" style="border-color:var(--border-color);">
            <span class="segment-cost-icon"><i class="bi bi-cash-coin"></i></span>
            <input type="number" class="edit-segment-cost-input" value="${nextCost}" min="0" step="0.01" oninput="calculateEditTotalCost()"
                style="flex:1;background:transparent;border:none;color:var(--text-primary);font-family:inherit;font-size:0.85rem;outline:none;min-width:0;" placeholder="Cost to next stop...">
          </div>
        </div>
        `;
      }
      return html;
    })
    .join("");

  body.innerHTML = `
        <div class="form-group">
            <label>Date</label>
            <input type="date" id="editDate" value="${delivery.date}"
                style="width:100%;padding:12px 16px;background:var(--bg-input);border:1px solid var(--border-color);border-radius:var(--radius-sm);color:var(--text-primary);font-family:inherit;font-size:0.9rem;outline:none;">
        </div>
        <div class="form-group">
            <label>Doctor Name</label>
            <input type="text" id="editDoctor" value="${escapeHtml(delivery.doctor)}"
                style="width:100%;padding:12px 16px;background:var(--bg-input);border:1px solid var(--border-color);border-radius:var(--radius-sm);color:var(--text-primary);font-family:inherit;font-size:0.9rem;outline:none;">
        </div>
        <div class="form-group">
            <label>Engineer Name</label>
            <input type="text" id="editEngineer" value="${escapeHtml(delivery.engineer || "")}"
                style="width:100%;padding:12px 16px;background:var(--bg-input);border:1px solid var(--border-color);border-radius:var(--radius-sm);color:var(--text-primary);font-family:inherit;font-size:0.9rem;outline:none;">
        </div>
        <div class="form-group">
            <label>Day</label>
            <input type="text" id="editDays" value="${escapeHtml(String(delivery.days || ""))}" list="daysList" placeholder="e.g. Saturday..."
                style="width:100%;padding:12px 16px;background:var(--bg-input);border:1px solid var(--border-color);border-radius:var(--radius-sm);color:var(--text-primary);font-family:inherit;font-size:0.9rem;outline:none;">
        </div>
        <div class="form-group">
            <label>Total Cost</label>
            <input type="number" id="editCost" value="${delivery.cost || 0}" min="0" step="0.01" readonly
                style="width:100%;padding:12px 16px;background:var(--bg-input);border:1px solid var(--border-color);border-radius:var(--radius-sm);color:var(--text-primary);font-family:inherit;font-size:0.9rem;outline:none;">
        </div>
        ${stopsHtml}
        <div class="form-group">
            <label>Notes</label>
            <textarea id="editNotes" rows="2"
                style="width:100%;padding:12px 16px;background:var(--bg-input);border:1px solid var(--border-color);border-radius:var(--radius-sm);color:var(--text-primary);font-family:inherit;font-size:0.9rem;outline:none;resize:vertical;">${escapeHtml(delivery.notes)}</textarea>
        </div>
        <div class="form-group">
            <label>Status</label>
            <div class="status-options">
                <label class="status-radio">
                    <input type="radio" name="editStatus" value="pending" ${delivery.status === "pending" ? "checked" : ""}>
                    <span class="status-badge pending">Pending</span>
                </label>
                <label class="status-radio">
                    <input type="radio" name="editStatus" value="in-progress" ${delivery.status === "in-progress" ? "checked" : ""}>
                    <span class="status-badge in-progress">In Progress</span>
                </label>
                <label class="status-radio">
                    <input type="radio" name="editStatus" value="completed" ${delivery.status === "completed" ? "checked" : ""}>
                    <span class="status-badge completed">Completed</span>
                </label>
            </div>
        </div>
        <button class="btn-submit" onclick="saveEdit()">Save Changes</button>
    `;

  modal.classList.add("show");
}

function calculateEditTotalCost() {
  const costInputs = document.querySelectorAll(".edit-segment-cost-input");
  let total = 0;
  costInputs.forEach((input) => {
    total += parseFloat(input.value) || 0;
  });
  document.getElementById("editCost").value = total.toFixed(2);
}

function closeEditModal() {
  document.getElementById("editModal").classList.remove("show");
  editingId = null;
}

async function saveEdit() {
  if (!editingId) return;
  const delivery = deliveries.find((d) => d.id === editingId);
  if (!delivery) return;

  const updates = {
    date: document.getElementById("editDate").value,
    doctor: document.getElementById("editDoctor").value.trim(),
    engineer: document.getElementById("editEngineer").value.trim(),
    days: document.getElementById("editDays").value.trim(),
    cost: parseFloat(document.getElementById("editCost").value) || 0,
    notes: document.getElementById("editNotes").value.trim(),
    status: document.querySelector('input[name="editStatus"]:checked').value,
  };

  // Gather edited stops
  const editStopItems = document.querySelectorAll(".stop-edit-item");
  const editCostInputs = document.querySelectorAll(".edit-segment-cost-input");
  const newStops = [];
  editStopItems.forEach((item, index) => {
    const nameInput = item.querySelector(".edit-stop-name");
    const name = nameInput.value.trim();
    if (name) {
      const stopObj = { name: name };
      if (index < editCostInputs.length) {
        stopObj.nextCost = parseFloat(editCostInputs[index].value) || 0;
      }
      newStops.push(stopObj);
    }
  });
  if (newStops.length >= 2) {
    updates.stops = newStops;
  }

  const success = await updateDelivery(editingId, updates);

  Object.assign(delivery, updates);
  saveToStorage();
  updateEngineerFilterOptions();
  updateMonthFilterOptions();
  renderDeliveries();
  updateStats();
  closeEditModal();

  if (success) {
    showToast("Changes saved!");
  } else {
    showToast("Saved locally (Check Supabase schema)");
  }
}

// Close modal on overlay click
document.getElementById("editModal").addEventListener("click", (e) => {
  if (e.target === e.currentTarget) closeEditModal();
});

// ===== Stats =====
function updateStats() {
  const total = deliveries.length;
  const today = new Date().toISOString().split("T")[0];
  const todayCount = deliveries.filter((d) => d.date === today).length;
  const uniqueDoctors = new Set(deliveries.map((d) => d.doctor.toLowerCase()))
    .size;

  animateNumber("totalDeliveries", total);
  animateNumber("todayDeliveries", todayCount);
  animateNumber("totalDoctors", uniqueDoctors);
}

function animateNumber(elementId, target) {
  const el = document.getElementById(elementId);
  if (!el) return;
  const current = parseInt(el.textContent) || 0;
  const diff = target - current;
  const steps = 20;
  const stepTime = 30;
  let step = 0;

  if (diff === 0) return;

  const interval = setInterval(() => {
    step++;
    const progress = step / steps;
    const eased = 1 - Math.pow(1 - progress, 3); // easeOutCubic
    el.textContent = Math.round(current + diff * eased);
    if (step >= steps) {
      el.textContent = target;
      clearInterval(interval);
    }
  }, stepTime);
}

// ===== Storage =====
function saveToStorage() {
  localStorage.setItem("routeTracker_deliveries", JSON.stringify(deliveries));
}

// ===== Utilities =====
function formatDate(dateStr) {
  const date = new Date(dateStr + "T00:00:00");
  const options = {
    year: "numeric",
    month: "short",
    day: "numeric",
    weekday: "short",
  };
  return date.toLocaleDateString("en-US", options);
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

function showToast(message) {
  const toast = document.getElementById("toast");
  toast.textContent = message;
  toast.classList.add("show");
  setTimeout(() => toast.classList.remove("show"), 2500);
}

// ===== Keyboard Shortcuts =====
document.addEventListener("keydown", (e) => {
  // Escape to close modal
  if (e.key === "Escape") {
    closeEditModal();
  }
  // Ctrl+Enter to save
  if (e.ctrlKey && e.key === "Enter") {
    if (editingId) {
      saveEdit();
    } else {
      saveDelivery();
    }
  }
});

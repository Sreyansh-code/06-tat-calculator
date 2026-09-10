async function loadHolidays() {
  try {
    const res = await fetch("/api/holidays");
    if (!res.ok) return;
    const holidays = await res.json();
    const listEl = document.getElementById("holidays-list");
    if (listEl && Array.isArray(holidays)) {
      listEl.innerHTML = holidays
        .map((h) => {
          const d = new Date(`${h.date}T00:00:00`);
          const formatted = d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
          return `<li>${formatted} — ${h.name}</li>`;
        })
        .join("");
    }
  } catch (err) {
    // Keep fallback HTML if fetch fails
  }
}

document.addEventListener("DOMContentLoaded", loadHolidays);
loadHolidays();

document.getElementById("tat-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const startDate = document.getElementById("start-date").value;
  const tatDays = Number(document.getElementById("tat-days").value);
  const errorEl = document.getElementById("form-error");
  errorEl.textContent = "";

  try {
    const res = await fetch("/api/tat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ startDate, tatDays })
    });

    const data = await res.json();

    if (!res.ok) {
      errorEl.textContent = data.error || "Failed to calculate TAT.";
      document.getElementById("due-date").textContent = "-";
      document.getElementById("days-used").textContent = "-";
      document.getElementById("overdue-badge").innerHTML =
        '<span class="badge badge-ontrack">On Track</span>';
      return;
    }

    document.getElementById("due-date").textContent = data.dueDate;
    document.getElementById("days-used").textContent = data.businessDaysUsed;

    const isOverdue = data.overdue ?? data.isOverdue;
    if (isOverdue) {
      document.getElementById("overdue-badge").innerHTML =
        '<span class="badge badge-overdue">Overdue</span>';
    } else {
      document.getElementById("overdue-badge").innerHTML =
        '<span class="badge badge-ontrack">On Track</span>';
    }
  } catch (err) {
    errorEl.textContent = "Network error. Please try again.";
  }
});

// --- Tooling: reset button (utility only, not part of the app under test) ---
function showToast(msg) {
  let toast = document.getElementById("__toast");
  if (!toast) {
    toast = document.createElement("div");
    toast.id = "__toast";
    toast.style.cssText =
      "position:fixed;bottom:20px;right:20px;background:#333;color:#fff;padding:10px 16px;" +
      "border-radius:4px;font-family:sans-serif;z-index:9999;opacity:0;transition:opacity .2s;";
    document.body.appendChild(toast);
  }
  toast.textContent = msg;
  toast.style.opacity = "1";
  clearTimeout(toast.__timer);
  toast.__timer = setTimeout(() => {
    toast.style.opacity = "0";
  }, 2000);
}

document.getElementById("reset-btn").addEventListener("click", async () => {
  await fetch("/api/reset", { method: "POST" });
  document.getElementById("tat-form").reset();
  document.getElementById("form-error").textContent = "";
  document.getElementById("due-date").textContent = "-";
  document.getElementById("days-used").textContent = "-";
  document.getElementById("overdue-badge").innerHTML =
    '<span class="badge badge-ontrack">On Track</span>';
  showToast("Data reset");
});

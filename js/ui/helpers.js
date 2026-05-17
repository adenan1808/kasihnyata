/* ================= GENERAL UI HELPERS ================= */

function openModal(id) {
    const el = document.getElementById(id);
    if(el) el.style.display = 'flex';
}

function closeModal(id) {
    const el = document.getElementById(id);
    if(el) el.style.display = 'none';
}

window.openModal = openModal;
window.closeModal = closeModal;

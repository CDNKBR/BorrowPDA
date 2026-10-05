
/* BorrowPDA GitHub Admin API bridge
 * Frontend: GitHub Pages
 * Backend: Google Apps Script Web App
 *
 * IMPORTANT:
 * Replace GAS_URL below if the deployment URL changes.
 */
const GAS_URL = "https://script.google.com/macros/s/AKfycbzkgWzwmv768EfzxMhZU-TzuLrMCx73zJOByDFDFcnzbbLJsOaCNkaHzVcxbncB_-b2/exec";

(function () {
  function normalizeResult(raw) {
    if (typeof raw === 'string') {
      try { return JSON.parse(raw); } catch (_) {}
    }
    return raw;
  }

  function buildUrl(params) {
    const u = new URL(GAS_URL);
    Object.entries(params || {}).forEach(([k, v]) => {
      if (v === undefined || v === null) return;
      u.searchParams.set(k, typeof v === 'object' ? JSON.stringify(v) : String(v));
    });
    return u.toString();
  }

  // JSONP is used as the transport so the GitHub Pages origin does not
  // depend on permissive CORS headers from Apps Script.
  window.gasApi = function (params) {
    return new Promise((resolve, reject) => {
      const cb = '__borrowPdaAdminCb_' + Date.now() + '_' + Math.random().toString(36).slice(2);
      const script = document.createElement('script');
      const timeout = setTimeout(() => {
        cleanup();
        reject(new Error('GAS API timeout'));
      }, 20000);

      function cleanup() {
        clearTimeout(timeout);
        try { delete window[cb]; } catch (_) { window[cb] = undefined; }
        script.remove();
      }

      window[cb] = function (payload) {
        cleanup();
        resolve(normalizeResult(payload));
      };

      script.onerror = function () {
        cleanup();
        reject(new Error('GAS API request failed'));
      };

      script.src = buildUrl(Object.assign({}, params, { callback: cb }));
      document.head.appendChild(script);
    });
  };

  /*
   * Compatibility implementation for the existing page.
   * Existing calls such as:
   *   google.script.run.withSuccessHandler(...).someFunction(...)
   * continue to work, but are sent to the GAS API instead.
   */
  const googleCompat = {
    script: {
      run: {
        _success: null,
        _failure: null,
        withSuccessHandler(fn) { this._success = fn; return this; },
        withFailureHandler(fn) { this._failure = fn; return this; }
      }
    }
  };

  const proxy = new Proxy(googleCompat.script.run, {
    get(target, prop) {
      if (prop in target) return target[prop];
      return function (...args) {
        const params = { api: 'borrowPdaAdmin',
          action: String(prop),
          args: JSON.stringify(args)
        };
        window.gasApi(params)
          .then(result => target._success && target._success(result))
          .catch(err => target._failure && target._failure(err));
        return proxy;
      };
    }
  });

  googleCompat.script.run = proxy;
  window.google = googleCompat;
})();


let adminPass = '';
  let modalDevice;
  let modalPrint;
  let devicesCache = [];
  let usersCache = [];
  let logoDataUrl = '';   // <== เก็บโลโก้จาก GAS

  const LIFF_BASE_URL = 'https://liff.line.me/2008359490-qm3K4L5x?device=';
  const WEB_BASE_URL  = 'https://script.google.com/macros/s/AKfycbzkgWzwmv768EfzxMhZU-TzuLrMCx73zJOByDFDFcnzbbLJsOaCNkaHzVcxbncB_-b2/exec?device=';

  document.addEventListener('DOMContentLoaded', () => {
    modalDevice = new bootstrap.Modal(document.getElementById('modal-device'));
    modalPrint  = new bootstrap.Modal(document.getElementById('modal-print'));

    const macInput = document.getElementById('dev-mac');
    if (macInput) {
      macInput.addEventListener('input', () => {
        macInput.value = macInput.value.toUpperCase();
      });
    }

    // โหลดโลโก้จากฝั่ง GAS มาครั้งเดียว
    google.script.run
      .withSuccessHandler(url => { logoDataUrl = url || ''; })
      .withFailureHandler(err => {
        console.log('โหลดโลโก้ไม่สำเร็จ:', err);
        logoDataUrl = '';
      })
      .getLogoDataUrl();
  });

  function showLoading(){
    document.getElementById('loading').classList.add('show');
  }
  function hideLoading(){
    document.getElementById('loading').classList.remove('show');
  }

  function showLoginError(msg){
    const el = document.getElementById('login-error');
    el.textContent = msg;
    el.classList.remove('d-none');
  }
  function hideLoginPanel(){
    document.getElementById('login-overlay').style.display = 'none';
  }

  function doAdminLogin(){
    const pass = document.getElementById('admin-pass').value.trim();
    if(!pass){
      showLoginError('กรุณากรอกรหัสผ่าน');
      return;
    }
    showLoading();
    google.script.run
      .withSuccessHandler(res=>{
        if(res && res.ok){
          adminPass = pass;
          hideLoginPanel();
          loadDashboard();
        }else{
          hideLoading();
          showLoginError('รหัสผ่านไม่ถูกต้อง');
        }
      })
      .withFailureHandler(err=>{
        hideLoading();
        showAdminNotice('เข้าสู่ระบบไม่สำเร็จ', 'เกิดข้อผิดพลาดในการตรวจสอบรหัสผ่าน: ' + errorText(err), 'danger');
      })
      .adminLogin(pass);
  }

  function loadDashboard(){
    showLoading();
    google.script.run
      .withSuccessHandler(renderDashboard)
      .withFailureHandler(err=>{
        hideLoading();
        showAdminNotice('โหลดข้อมูลไม่สำเร็จ', 'โหลดข้อมูลล้มเหลว: ' + errorText(err), 'danger');
      })
      .getDashboardData(adminPass);
  }

  function refreshDashboard(){
    if(!adminPass){
      showAdminNotice('ยังไม่ได้เข้าสู่ระบบ', 'กรุณาเข้าสู่ระบบก่อนรีเฟรชข้อมูล', 'warning');
      return;
    }
    const btn = document.getElementById('refresh-btn');
    const status = document.getElementById('refresh-status');
    if(btn) {
      btn.disabled = true;
      btn.classList.add('is-refreshing');
      btn.innerHTML = '<i class="bi bi-arrow-clockwise me-1"></i> กำลังรีเฟรช...';
    }
    if(status) status.textContent = 'กำลังโหลดข้อมูลล่าสุด...';
    google.script.run
      .withSuccessHandler(data => {
        renderDashboard(data);
        const now = new Date();
        if(status) status.textContent = 'อัปเดต ' + now.toLocaleTimeString('th-TH', {hour:'2-digit', minute:'2-digit', second:'2-digit'});
        if(btn) {
          btn.disabled = false;
          btn.classList.remove('is-refreshing');
          btn.innerHTML = '<i class="bi bi-arrow-clockwise me-1"></i> รีเฟรช';
        }
      })
      .withFailureHandler(err => {
        hideLoading();
        if(status) status.textContent = 'รีเฟรชไม่สำเร็จ';
        if(btn) {
          btn.disabled = false;
          btn.classList.remove('is-refreshing');
          btn.innerHTML = '<i class="bi bi-arrow-clockwise me-1"></i> รีเฟรช';
        }
        showAdminNotice('รีเฟรชข้อมูลไม่สำเร็จ', errorText(err), 'danger');
      })
      .getDashboardData(adminPass);
    showLoading();
  }

  function esc(s){
    return String(s ?? '').replace(/[&<>"']/g, m => ({
      '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
    }[m]));
  }

  function pickIconClass(dev){
    const iconType = dev.Icon || dev.Category || '';
    const t = String(iconType).toLowerCase();
    if(t.includes('pda'))     return 'bi-phone';
    if(t.includes('laptop'))  return 'bi-laptop';
    if(t.includes('notebook'))return 'bi-laptop';
    if(t.includes('monitor')) return 'bi-display';
    if(t.includes('print'))   return 'bi-printer';
    return 'bi-box2';
  }

  function renderDeviceCards(devices){
    const grid = document.getElementById('device-grid');
    grid.innerHTML = '';

    if(!devices || !devices.length){
      grid.innerHTML = '<div class="text-muted small">ไม่มีข้อมูลอุปกรณ์</div>';
      return;
    }

    devices.forEach(d=>{
      const status = String(d.Status || '').trim();
      let badgeClass = 'badge-st-ava';
      let badgeText  = 'ว่าง';

      if(status === 'Borrowed'){
        badgeClass = 'badge-st-bor';
        badgeText  = 'กำลังยืม';
      }else if(status === 'Repair'){
        badgeClass = 'badge-st-rep';
        badgeText  = 'เสีย/ส่งซ่อม';
      }
      if(d.IsOverdue){
        badgeClass = 'badge-st-over';
        badgeText  = 'เกินกำหนดส่งคืน';
      }

      const iconClass = pickIconClass(d);

      const meta1 = d.CurrentUser
        ? '<div class="device-meta"><strong>ผู้ยืม:</strong> ' + esc(d.CurrentUser) + '</div>'
        : '';

      const meta2 = d.BorrowedAt
        ? '<div class="device-meta"><strong>ยืมเมื่อ:</strong> ' + esc(d.BorrowedAt) + '</div>'
        : '';

      const meta3 = d.DueAt
        ? '<div class="device-meta"><strong>กำหนดคืน:</strong> ' + esc(d.DueAt) + '</div>'
        : '';

      const meta4 = d.SerialNo
        ? '<div class="device-meta"><strong>Serial:</strong> ' + esc(d.SerialNo) + '</div>'
        : '';

      const meta5 = d.MacAddress
        ? '<div class="device-meta"><strong>MAC:</strong> ' + esc(d.MacAddress) + '</div>'
        : '';

      const html = `
        <div class="device-card">
          <div class="device-badge-status ${badgeClass}">
            ${esc(badgeText)}
          </div>
          <div class="device-icon-wrap">
            <i class="bi ${iconClass}"></i>
          </div>
          <div class="device-id">${esc(d.DeviceID || '-')}</div>
          <div class="device-name">${esc(d.Name || '')}</div>
          ${meta1}${meta2}${meta3}${meta4}${meta5}
          <div class="device-actions">
            <button type="button" class="btn btn-sm btn-outline-primary flex-fill" onclick="openEditDeviceModal('${esc(d.DeviceID || '')}')"><i class="bi bi-pencil-square me-1"></i>แก้ไข</button>
            <button type="button" class="btn btn-sm btn-outline-danger" ${status === 'Borrowed' ? 'disabled title="ห้ามลบอุปกรณ์ที่กำลังถูกยืม"' : ''} onclick="confirmDeleteDevice('${esc(d.DeviceID || '')}')"><i class="bi bi-trash3 me-1"></i>ลบ</button>
          </div>
        </div>
      `;
      grid.insertAdjacentHTML('beforeend', html);
    });
  }


  function applyDeviceFilters(){
    const q = (document.getElementById('device-search')?.value || '').trim().toLowerCase();
    const st = document.getElementById('device-status-filter')?.value || '';
    const filtered = devicesCache.filter(d => {
      const hay = [d.DeviceID,d.Name,d.Category,d.CurrentUser].join(' ').toLowerCase();
      const status = String(d.Status || '').trim();
      const statusMatch = !st || (st === 'Overdue' ? !!d.IsOverdue : status === st);
      return hay.includes(q) && statusMatch;
    });
    renderDeviceCards(filtered);
  }

  function resetDeviceFilters(){
    document.getElementById('device-search').value = '';
    document.getElementById('device-status-filter').value = '';
    applyDeviceFilters();
  }

  function openEditDeviceModal(deviceId){
    const d = devicesCache.find(x => String(x.DeviceID) === String(deviceId));
    if(!d) return;
    document.getElementById('dev-id').value = d.DeviceID || '';
    document.getElementById('dev-name').value = d.Name || '';
    document.getElementById('dev-cat').value = d.Category || '';
    document.getElementById('dev-serial').value = d.SerialNo || '';
    document.getElementById('dev-mac').value = d.MacAddress || '';
    document.getElementById('dev-icon').value = d.Icon || 'box';
    document.getElementById('dev-status').value = d.Status || 'Available';
    document.getElementById('dev-id').readOnly = true;
    document.getElementById('dev-modal-msg').classList.add('d-none');
    modalDevice.show();
  }

  function confirmDeleteDevice(deviceId){
    const d = devicesCache.find(x => String(x.DeviceID) === String(deviceId));
    if(!d) return;
    if(String(d.Status || '') === 'Borrowed'){
      showAdminNotice('ไม่สามารถลบได้','อุปกรณ์นี้กำลังถูกยืมอยู่ ต้องคืนอุปกรณ์ก่อนจึงจะลบได้','warning');
      return;
    }
    showAdminConfirm(
      'ยืนยันการลบอุปกรณ์',
      'ต้องการลบ ' + (d.DeviceID || '') + ' — ' + (d.Name || '') + ' ใช่หรือไม่? การลบนี้ไม่สามารถย้อนกลับได้',
      () => {
        showLoading();
        google.script.run
          .withSuccessHandler(() => loadDashboard())
          .withFailureHandler(err => {
            hideLoading();
            showAdminNotice('ลบไม่สำเร็จ', errorText(err), 'danger');
          })
          .deleteDeviceFromAdmin(deviceId, adminPass);
      }
    );
  }

  function errorText(err){
    return err && err.message ? err.message : String(err || 'เกิดข้อผิดพลาด');
  }

  function showAdminNotice(title, message, kind){
    const modalEl = document.getElementById('modal-admin-notice');
    document.getElementById('admin-notice-title').textContent = title || 'แจ้งเตือน';
    document.getElementById('admin-notice-message').textContent = message || '';
    const icon = document.getElementById('admin-notice-icon');
    icon.className = 'bi ' + (kind === 'danger' ? 'bi-x-circle text-danger' : kind === 'warning' ? 'bi-exclamation-triangle text-warning' : 'bi-check-circle text-success') + ' fs-1';
    bootstrap.Modal.getOrCreateInstance(modalEl).show();
  }

  function showAdminConfirm(title, message, onConfirm){
    const modalEl = document.getElementById('modal-admin-confirm');
    document.getElementById('admin-confirm-title').textContent = title;
    document.getElementById('admin-confirm-message').textContent = message;
    const yes = document.getElementById('admin-confirm-yes');
    yes.onclick = () => {
      bootstrap.Modal.getOrCreateInstance(modalEl).hide();
      onConfirm();
    };
    bootstrap.Modal.getOrCreateInstance(modalEl).show();
  }

  function renderDashboard(data){
    hideLoading();
    if(!data) return;

    devicesCache = data.devices || [];
    usersCache = data.users || [];
    window.dashboardTransactions = data.transactions || [];
    renderRegisteredUsers(usersCache);
    const refreshStatus = document.getElementById('refresh-status');
    if (refreshStatus) refreshStatus.textContent = 'อัปเดต ' + new Date().toLocaleTimeString('th-TH', {hour:'2-digit', minute:'2-digit', second:'2-digit'});

    const sum = data.summary || { total:0, borrowed:0, available:0, overdue:0 };
    document.getElementById('sum-total').textContent     = sum.total;
    document.getElementById('sum-borrowed').textContent  = sum.borrowed;
    document.getElementById('sum-available').textContent = sum.available;
    document.getElementById('sum-overdue').textContent   = sum.overdue;

    applyDeviceFilters();

    const txTable = $('#tbl-tx').DataTable({
      destroy:true,
      data: data.transactions || [],
      columns:[
        {data:'Timestamp'},
        {data:'DeviceID'},
        {data:'Action'},
        {data:'UserName'},
        {data:'LineUserId'},
        {data:'Note'},
        {data:'BorrowedAt'},
        {data:'DueAt'}
      ],
      order:[[0,'desc']],
      responsive:true,
      createdRow: function(row, rowData) {
        row.setAttribute('title', 'คลิกเพื่อดูรายละเอียดผู้ใช้และอุปกรณ์');
        row.dataset.txIndex = String((data.transactions || []).indexOf(rowData));
      }
    });

    $('#tbl-tx tbody').off('click.txdetail').on('click.txdetail', 'tr', function() {
      const rowData = txTable.row(this).data();
      if (rowData) openTransactionDetail(rowData);
    });
  }

  function openTransactionDetail(tx){
    const setText = (id, value) => {
      const el = document.getElementById(id);
      if (el) el.textContent = value == null || value === '' ? '-' : String(value);
    };
    const photo = document.getElementById('tx-detail-photo');
    const picture = String(tx.Picture || '').trim();
    photo.classList.remove('photo-empty');
    photo.onerror = () => {
      photo.onerror = null;
      photo.classList.add('photo-empty');
      photo.removeAttribute('src');
    };
    if (picture) {
      photo.src = picture;
    } else {
      photo.classList.add('photo-empty');
      photo.removeAttribute('src');
    }

    setText('tx-detail-title', 'รายละเอียดรายการ ' + (tx.Action || 'ยืม–คืน'));
    setText('tx-detail-user', tx.LineDisplayName || tx.UserName || 'ไม่พบชื่อผู้ใช้');
    setText('tx-detail-lineid', 'LINE User ID: ' + (tx.LineUserId || '-'));
    setText('tx-detail-dept', 'แผนก: ' + (tx.Dept || tx.Note || '-'));
    setText('tx-detail-device', (tx.DeviceID || '-') + (tx.DeviceName ? ' · ' + tx.DeviceName : ''));
    setText('tx-detail-category', tx.Category || 'ไม่ระบุประเภทอุปกรณ์');
    setText('tx-detail-action', tx.Action || '-');
    setText('tx-detail-time', 'ทำรายการเมื่อ ' + (tx.Timestamp || '-'));
    setText('tx-detail-borrowed', tx.BorrowedAt || '-');
    setText('tx-detail-due', tx.DueAt || '-');
    setText('tx-detail-note', tx.Note || tx.Dept || '-');

    bootstrap.Modal.getOrCreateInstance(document.getElementById('modal-tx-detail')).show();
  }

  function switchTab(tab){
    const panels = {
      devices: document.getElementById('wrap-devices'),
      tx: document.getElementById('wrap-tx'),
      users: document.getElementById('wrap-users')
    };
    const titles = { devices:'รายการอุปกรณ์', tx:'ประวัติยืม–คืน', users:'ผู้ลงทะเบียน' };
    const tabs = {
      devices: document.getElementById('tab-dev'),
      tx: document.getElementById('tab-tx'),
      users: document.getElementById('tab-users')
    };
    Object.keys(panels).forEach(key => {
      panels[key].style.display = key === tab ? '' : 'none';
      tabs[key].classList.toggle('active', key === tab);
    });
    document.getElementById('table-title').textContent = titles[tab] || titles.devices;
    if (tab === 'tx') {
      setTimeout(() => { if ($.fn.DataTable.isDataTable('#tbl-tx')) $('#tbl-tx').DataTable().columns.adjust().draw(false); }, 50);
    }
    if (tab === 'users') {
      applyUserFilters();
      setTimeout(() => { if ($.fn.DataTable.isDataTable('#tbl-users')) $('#tbl-users').DataTable().columns.adjust().draw(false); }, 50);
    }
  }

  function renderRegisteredUsers(users){
    const rows = (users || []).map(u => ({
      ...u,
      _photo: u.PictureUrl || '',
      _activityCount: (window.dashboardTransactions || []).filter(t => String(t.LineUserId || '') === String(u.LineUserId || '')).length
    }));
    if ($.fn.DataTable.isDataTable('#tbl-users')) {
      $('#tbl-users').DataTable().clear().rows.add(rows).draw();
    } else {
      $('#tbl-users').DataTable({
        data: rows,
        columns: [
          {data:null, render:(d,t,row) => '<div class="d-flex align-items-center gap-2"><img src="' + esc(row.PictureUrl || '') + '" onerror="this.style.visibility=\'hidden\'" class="rounded-circle border" style="width:38px;height:38px;object-fit:cover"><div><div class="fw-semibold">' + esc(row.LineDisplayName || 'ไม่ระบุชื่อ') + '</div><div class="small text-secondary">' + esc(row._activityCount) + ' รายการยืม–คืน</div></div></div>'},
          {data:'Dept', render:d => esc(d || '-')},
          {data:'LineUserId', render:d => '<span class="small">' + esc(d || '-') + '</span>'},
          {data:'CreatedAt', render:d => esc(d || '-')},
          {data:null, orderable:false, searchable:false, render:() => '<button type="button" class="btn btn-sm btn-outline-primary rounded-pill px-3"><i class="bi bi-person-vcard me-1"></i>รายละเอียด</button>'}
        ],
        order:[[0,'asc']],
        responsive:true,
        pageLength:10,
        createdRow:(row, rowData) => { row.style.cursor='pointer'; row.title='คลิกเพื่อดูรายละเอียดผู้ใช้'; }
      });
      $('#tbl-users tbody').on('click', 'tr', function(){
        const user = $('#tbl-users').DataTable().row(this).data();
        if (user) openRegisteredUserDetail(user);
      });
    }
  }

  function applyUserFilters(){
    if (!$.fn.DataTable.isDataTable('#tbl-users')) return;
    const q = (document.getElementById('user-search')?.value || '').trim();
    $('#tbl-users').DataTable().search(q).draw();
  }

  function openRegisteredUserDetail(user){
    const set = (id, value) => { const el=document.getElementById(id); if(el) el.textContent = value == null || value === '' ? '-' : String(value); };
    const img = document.getElementById('user-detail-photo');
    img.onerror = () => { img.onerror=null; img.removeAttribute('src'); img.style.visibility='hidden'; };
    img.style.visibility = user.PictureUrl ? 'visible' : 'hidden';
    if (user.PictureUrl) img.src = user.PictureUrl; else img.removeAttribute('src');
    set('user-detail-name', user.LineDisplayName || 'ไม่ระบุชื่อ');
    set('user-detail-lineid', user.LineUserId || '-');
    set('user-detail-dept', 'แผนก: ' + (user.Dept || '-'));
    set('user-detail-created', user.CreatedAt || '-');
    set('user-detail-updated', user.UpdatedAt || '-');

    const activity = (window.dashboardTransactions || []).filter(t => String(t.LineUserId || '') === String(user.LineUserId || '')).sort((a,b) => String(b.Timestamp || '').localeCompare(String(a.Timestamp || '')));
    const activityEl = document.getElementById('user-detail-activity');
    if (!activity.length) {
      activityEl.innerHTML = '<div class="text-secondary py-2">ยังไม่มีประวัติยืม–คืน</div>';
    } else {
      activityEl.innerHTML = '<div class="d-flex flex-column gap-2">' + activity.slice(0,30).map(t =>
        '<div class="d-flex justify-content-between align-items-start gap-3 border-bottom pb-2"><div><div class="fw-semibold text-dark">' + esc(t.Action || '-') + ' · ' + esc(t.DeviceID || '-') + '</div><div>' + esc(t.DeviceName || '') + '</div><div class="text-secondary">' + esc(t.Timestamp || '-') + '</div></div><span class="badge text-bg-light border">' + esc(t.Dept || user.Dept || '-') + '</span></div>'
      ).join('') + '</div>';
    }
    bootstrap.Modal.getOrCreateInstance(document.getElementById('modal-user-detail')).show();
  }

  function openAddDeviceModal(){
    document.getElementById('dev-id').readOnly = false;
    document.getElementById('dev-id').value     = '';
    document.getElementById('dev-name').value   = '';
    document.getElementById('dev-cat').value    = '';
    document.getElementById('dev-serial').value = '';
    document.getElementById('dev-mac').value    = '';
    document.getElementById('dev-icon').value   = 'box';
    document.getElementById('dev-status').value = 'Available';
    document.getElementById('dev-modal-msg').classList.add('d-none');
    modalDevice.show();
  }

  function saveDeviceFromAdmin(){
    const id  = document.getElementById('dev-id').value.trim();
    const nm  = document.getElementById('dev-name').value.trim();
    const cat = document.getElementById('dev-cat').value.trim();
    const serial = document.getElementById('dev-serial').value.trim();
    const mac = document.getElementById('dev-mac').value.trim().toUpperCase();
    const st  = document.getElementById('dev-status').value;
    const icon= document.getElementById('dev-icon').value;
    const msg = document.getElementById('dev-modal-msg');

    if(!id){
      msg.textContent = 'กรุณาระบุรหัสอุปกรณ์';
      msg.classList.remove('d-none');
      return;
    }
    const payload = {
      DeviceID:id,
      Name:nm,
      Category:cat,
      SerialNo:serial,
      MacAddress:mac,
      Status:st,
      Icon:icon
    };
    showLoading();
    google.script.run
      .withSuccessHandler(res=>{
        hideLoading();
        modalDevice.hide();
        loadDashboard();
      })
      .withFailureHandler(err=>{
        hideLoading();
        msg.textContent = 'บันทึกไม่สำเร็จ: ' + err;
        msg.classList.remove('d-none');
      })
      .addOrUpdateDeviceFromAdmin(payload, adminPass);
  }

  // ---------- QR Sticker ----------

  function openPrintModal(){
    if(!devicesCache.length){
      showAdminNotice('ไม่มีข้อมูลอุปกรณ์', 'ยังไม่มีรายการอุปกรณ์สำหรับพิมพ์ QR', 'warning');
      return;
    }
    const list = document.getElementById('print-device-list');
    list.innerHTML = '';

    // แถว Select All
    list.insertAdjacentHTML('beforeend', `
      <label class="select-all-row text-light small">
        <input type="checkbox" id="chk-all" class="form-check-input me-2">
        <strong>เลือกทั้งหมด</strong>
      </label>
    `);

    devicesCache.forEach(d=>{
      const id = esc(d.DeviceID || '');
      const name = esc(d.Name || '');
      const row = `
        <label class="list-group-item bg-transparent text-light border-secondary d-flex align-items-center gap-2 small">
          <input type="checkbox" class="form-check-input dev-check" value="${id}">
          <span class="fw-semibold">${id}</span>
          <span class="text-secondary">- ${name}</span>
        </label>`;
      list.insertAdjacentHTML('beforeend', row);
    });

    document.getElementById('chk-all').addEventListener('change', e=>{
      const st = e.target.checked;
      document.querySelectorAll('.dev-check').forEach(c=> c.checked = st);
    });

    modalPrint.show();
  }

  function handlePrintStickers(){
    const type = document.getElementById('qr-type').value;
    const checks = document.querySelectorAll('#print-device-list .dev-check:checked');
    if(!checks.length){
      showAdminNotice('ยังไม่ได้เลือกอุปกรณ์', 'กรุณาเลือกอุปกรณ์อย่างน้อย 1 รายการ', 'warning');
      return;
    }
    const selectedIds = Array.from(checks).map(c=>c.value);
    buildStickers(selectedIds, type);
    modalPrint.hide();
  }

  function createSticker(dev, mode, url){
    const card = document.createElement('div');
    const id   = dev.DeviceID || '';
    const name = dev.Name || '';
    const label = (mode === 'liff') ? 'LINE LIFF' : 'Web Browser';
    const logoSrc = logoDataUrl || ''; // ถ้าโหลดไม่ทัน จะไม่ใส่รูป แต่ส่วนใหญ่จะทัน

    card.className = 'sticker-card';

    card.innerHTML = `
      <div class="sticker-logo-wrap">
        ${logoSrc ? `<img src="${logoSrc}" class="sticker-logo" alt="Logo">` : ''}
      </div>
      <div class="sticker-qr"></div>
      <div class="sticker-info">
        <div class="sticker-id">${esc(name)}</div>
        <div class="sticker-name">${esc(id)}</div>
        <!-- <div class="sticker-type">${label}</div> -->
        <div class="sticker-brand">Scan เพื่อตรวจสอบ / ยืม-คืนอุปกรณ์</div>
      </div>
    `;

    const qrEl = card.querySelector('.sticker-qr');
    new QRCode(qrEl, {
      text: url,
      width:150,
      height:150,
      margin:0
    });

    return card;
  }

  function buildStickers(selectedIds, type){
    const layer = document.getElementById('print-layer');
    const cont  = document.getElementById('sticker-container');
    cont.innerHTML = '';

    selectedIds.forEach(id=>{
      const dev = devicesCache.find(d=>String(d.DeviceID) === String(id));
      if(!dev) return;

      const devIdNorm = String(dev.DeviceID || '').replace(/[^A-Za-z0-9]/g,'').toUpperCase();
      const linkWeb  = dev.LinkWeb  || (WEB_BASE_URL  + devIdNorm);
      const linkLiff = dev.LinkLiff || (LIFF_BASE_URL + devIdNorm);

      if(type === 'liff' || type === 'both'){
        cont.appendChild(createSticker(dev, 'liff', linkLiff));
      }
      if(type === 'web' || type === 'both'){
        cont.appendChild(createSticker(dev, 'web', linkWeb));
      }
    });

    layer.style.display = 'block';
    setTimeout(()=>{ window.print(); }, 400);
  }

  function closePrintLayer(){
    document.getElementById('print-layer').style.display = 'none';
  }
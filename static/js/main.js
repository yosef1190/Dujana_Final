/* ═══════════════════════════════════════════════════════════════
   DUJANA SPARE PARTS — MAIN JS
   Light/Dark Theme · Mobile Nav · Bilingual EN/AM
═══════════════════════════════════════════════════════════════ */

/* ── STATE ───────────────────────────────────────────────────── */
let currentLang    = 'en';
let isDark         = false;
let isAdmin        = false;
let adminData      = null;
let allProducts    = [];
let categories     = [];
let currentSlide   = 0;
let slideTimer     = null;
let searchDebounce = null;

/* ── INIT ────────────────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', async () => {
  // Restore theme preference
  const saved = localStorage.getItem('dujana-theme');
  if (saved === 'dark') applyDark(true, false);

  initSlideshow();
  await checkAuth();
  await loadCategories();
  await loadProducts();
  hideSpinner();
  initNavScroll();
});

/* ── SPINNER ─────────────────────────────────────────────────── */
function showSpinner() { document.getElementById('spinner').classList.remove('hidden'); }
function hideSpinner() {
  const s = document.getElementById('spinner');
  s.style.opacity = '0'; s.style.transition = 'opacity .4s';
  setTimeout(() => s.classList.add('hidden'), 420);
}

/* ── TOAST ───────────────────────────────────────────────────── */
function showToast(msg, type = 'success') {
  const icons = { success:'fa-circle-check', error:'fa-circle-xmark', warning:'fa-triangle-exclamation' };
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.innerHTML = `<i class="fas ${icons[type]||icons.success}"></i><span>${msg}</span>`;
  document.getElementById('toast-container').appendChild(el);
  setTimeout(() => { el.classList.add('toast-out'); setTimeout(() => el.remove(), 280); }, 3400);
}

/* ── THEME ───────────────────────────────────────────────────── */
function toggleTheme() { applyDark(!isDark, true); }

function applyDark(dark, save = true) {
  isDark = dark;
  const root = document.documentElement;
  const icon = document.getElementById('themeIcon');
  if (dark) {
    root.setAttribute('data-theme', 'dark');
    icon.className = 'fas fa-sun';
  } else {
    root.setAttribute('data-theme', 'light');
    icon.className = 'fas fa-moon';
  }
  if (save) localStorage.setItem('dujana-theme', dark ? 'dark' : 'light');
}

/* ── NAV SCROLL EFFECT ───────────────────────────────────────── */
function initNavScroll() {
  const navbar = document.getElementById('navbar');
  window.addEventListener('scroll', () => {
    if (window.scrollY > 20) navbar.style.boxShadow = 'var(--shadow)';
    else navbar.style.boxShadow = 'none';
  }, { passive: true });
}

/* ── MOBILE NAV ──────────────────────────────────────────────── */
function toggleMobileNav() {
  const nav = document.getElementById('mobileNav');
  const btn = document.getElementById('hamburgerBtn');
  const open = nav.classList.toggle('open');
  btn.innerHTML = open ? '<i class="fas fa-xmark"></i>' : '<i class="fas fa-bars"></i>';
}
function closeMobileNav() {
  document.getElementById('mobileNav').classList.remove('open');
  document.getElementById('hamburgerBtn').innerHTML = '<i class="fas fa-bars"></i>';
}

/* ── LANGUAGE ────────────────────────────────────────────────── */
function toggleLanguage() {
  currentLang = currentLang === 'en' ? 'am' : 'en';
  document.body.classList.toggle('lang-en', currentLang === 'en');
  document.body.classList.toggle('lang-am', currentLang === 'am');
  renderProducts();
  populateCategoryFilter();
  updateResultsCount();
}

/* ── SLIDESHOW ───────────────────────────────────────────────── */
function initSlideshow() {
  const slides = document.querySelectorAll('.slide');
  const dotsEl = document.getElementById('slideDots');
  dotsEl.innerHTML = '';
  slides.forEach((_, i) => {
    const d = document.createElement('button');
    d.className = 'slide-dot' + (i === 0 ? ' active' : '');
    d.setAttribute('aria-label', `Slide ${i+1}`);
    d.onclick = () => goToSlide(i);
    dotsEl.appendChild(d);
  });
  startSlideTimer();
}
function startSlideTimer() {
  clearInterval(slideTimer);
  slideTimer = setInterval(() => changeSlide(1), 5500);
}
function changeSlide(dir) {
  const slides = document.querySelectorAll('.slide');
  slides[currentSlide].classList.remove('active');
  currentSlide = (currentSlide + dir + slides.length) % slides.length;
  slides[currentSlide].classList.add('active');
  updateDots(); startSlideTimer();
}
function goToSlide(idx) {
  document.querySelectorAll('.slide')[currentSlide].classList.remove('active');
  currentSlide = idx;
  document.querySelectorAll('.slide')[currentSlide].classList.add('active');
  updateDots(); startSlideTimer();
}
function updateDots() {
  document.querySelectorAll('.slide-dot').forEach((d,i) => d.classList.toggle('active', i===currentSlide));
}

/* ── AUTH ────────────────────────────────────────────────────── */
async function checkAuth() {
  try {
    const data = await fetchJSON('/api/check-auth');
    if (data.authenticated) { isAdmin=true; adminData=data.admin; showAdminUI(); }
    else { isAdmin=false; adminData=null; hideAdminUI(); }
  } catch(e) {}
}
function showAdminUI() {
  document.getElementById('adminNavBtn').classList.add('hidden');
  document.getElementById('logoutBtn').classList.remove('hidden');
  document.getElementById('adminBanner').classList.remove('hidden');
  document.getElementById('adminName').textContent = adminData?.full_name ?? 'Admin';
}
function hideAdminUI() {
  document.getElementById('adminNavBtn').classList.remove('hidden');
  document.getElementById('logoutBtn').classList.add('hidden');
  document.getElementById('adminBanner').classList.add('hidden');
}

async function handleLogin() {
  const username = document.getElementById('loginUsername').value.trim();
  const password = document.getElementById('loginPassword').value;
  if (!username||!password) {
    showFormError('loginError', currentLang==='en'?'Enter username and password.':'ያስፈልጋሉ።'); return;
  }
  hideFormError('loginError');
  const btn = document.getElementById('loginBtn');
  btn.disabled=true; btn.innerHTML='<i class="fas fa-spinner fa-spin"></i>';
  try {
    const data = await fetchJSON('/api/login','POST',{username,password});
    isAdmin=true; adminData=data.admin; showAdminUI();
    closeModal('loginModal');
    document.getElementById('loginUsername').value='';
    document.getElementById('loginPassword').value='';
    showToast(currentLang==='en'?`Welcome, ${data.admin.full_name}!`:`እንኳን ደህና, ${data.admin.full_name}!`,'success');
    renderProducts();
  } catch(e) {
    showFormError('loginError', e.message||(currentLang==='en'?'Invalid credentials.':'ትክክለኛ ያልሆነ።'));
  } finally {
    btn.disabled=false;
    btn.innerHTML='<i class="fas fa-arrow-right-to-bracket"></i><span class="lang-en-text">Sign In</span><span class="lang-am-text">ግባ</span>';
  }
}

async function handleLogout() {
  try {
    await fetchJSON('/api/logout','POST');
    isAdmin=false; adminData=null; hideAdminUI();
    showToast(currentLang==='en'?'Logged out.':'ወጥተዋል።','success');
    renderProducts();
  } catch(e) { showToast('Logout failed.','error'); }
}

/* ── PRODUCTS ────────────────────────────────────────────────── */
async function loadProducts() {
  try {
    const p = new URLSearchParams();
    const s = document.getElementById('searchInput').value.trim();
    const c = document.getElementById('categoryFilter').value;
    const mn= document.getElementById('minPrice').value;
    const mx= document.getElementById('maxPrice').value;
    if(s) p.set('search',s); if(c) p.set('category',c);
    if(mn) p.set('min_price',mn); if(mx) p.set('max_price',mx);
    const data = await fetchJSON(`/api/products?${p}`);
    allProducts = data.products||[];
    const cnt = document.getElementById('productsCount');
    if(cnt) cnt.textContent = allProducts.length;
    renderProducts();
  } catch(e) { showToast('Failed to load products.','error'); }
}

async function loadCategories() {
  try {
    const data = await fetchJSON('/api/categories');
    categories = data.categories||[];
    populateCategoryFilter();
  } catch(e) {}
}

function populateCategoryFilter() {
  const sel = document.getElementById('categoryFilter');
  const cur = sel.value;
  sel.innerHTML = `<option value="">${currentLang==='en'?'All Categories':'ሁሉም ምድቦች'}</option>`;
  categories.forEach(c => {
    const o = document.createElement('option');
    o.value=c.en; o.textContent=currentLang==='en'?c.en:c.am;
    if(o.value===cur) o.selected=true;
    sel.appendChild(o);
  });
}

function renderProducts() {
  const grid  = document.getElementById('productsGrid');
  const empty = document.getElementById('emptyState');
  grid.innerHTML = '';
  if(!allProducts.length) { empty.classList.remove('hidden'); updateResultsCount(); return; }
  empty.classList.add('hidden');
  allProducts.forEach(p => grid.appendChild(makeCard(p)));
  updateResultsCount();
}

function updateResultsCount() {
  const n  = allProducts.length;
  const el = document.getElementById('resultsCount');
  if(!el) return;
  const cnt = document.getElementById('productsCount');
  if(cnt) cnt.textContent = n;
  el.textContent = n===0?'':(currentLang==='en'?`${n} product${n!==1?'s':''} found`:`${n} ምርቶች ተገኝተዋል`);
}

function makeCard(p) {
  const name    = currentLang==='en'?p.name_en:p.name_am;
  const nameAlt = currentLang==='en'?p.name_am:p.name_en;
  const cat     = currentLang==='en'?p.category_en:p.category_am;
  const price   = Number(p.price).toLocaleString('en-ET',{minimumFractionDigits:2});

  let stockCls, stockLbl;
  if(p.stock===0){ stockCls='no-stock'; stockLbl=currentLang==='en'?'Out of Stock':'አቅርቦት አልቋል'; }
  else if(p.stock<=5){ stockCls='low-stock'; stockLbl=currentLang==='en'?`Low (${p.stock})`:`ትንሽ (${p.stock})`; }
  else { stockCls='in-stock'; stockLbl=currentLang==='en'?`${p.stock} in stock`:`${p.stock} አለ`; }

  const imgHTML = p.image_path
    ? `<img src="${p.image_path}" alt="${name}" loading="lazy"
         onerror="this.style.display='none';this.nextElementSibling.style.display='flex'" />
       <div class="card-no-img" style="display:none"><i class="fas fa-gear"></i></div>`
    : `<div class="card-no-img"><i class="fas fa-gear"></i></div>`;

  const adminRow = isAdmin ? `
    <div class="card-admin-row">
      <button class="btn-edit" onclick="event.stopPropagation();openProductModal('${p.id}')">
        <i class="fas fa-pen-to-square"></i>${currentLang==='en'?'Edit':'አርትዕ'}
      </button>
      <button class="btn-delete" onclick="event.stopPropagation();openConfirmDelete('${p.id}')">
        <i class="fas fa-trash-can"></i>${currentLang==='en'?'Delete':'ሰርዝ'}
      </button>
    </div>` : '';

  const card = document.createElement('div');
  card.className = 'product-card';
  card.onclick = e => { if(!e.target.closest('.card-admin-row,.btn-contact-seller,.seller-reveal')) openDetailModal(p); };
  card.innerHTML = `
    <div class="card-img-wrap">
      ${imgHTML}
      <div class="card-cat-badge">${cat}</div>
    </div>
    <div class="card-body">
      <div class="card-name">${name}</div>
      <div class="card-name-am amharic">${nameAlt}</div>
    </div>
    <div class="card-footer">
      <div>
        <div class="card-price-label">ETB</div>
        <div class="card-price">${price}</div>
      </div>
      <div class="card-stock ${stockCls}">
        <div class="stock-dot"></div>${stockLbl}
      </div>
    </div>
    ${adminRow}`;
  return card;
}

/* ── SEARCH / FILTER ─────────────────────────────────────────── */
function debounceSearch(val) {
  clearTimeout(searchDebounce);
  document.getElementById('searchClear').style.display = val?'block':'none';
  searchDebounce = setTimeout(loadProducts, 360);
}
function clearSearch() {
  document.getElementById('searchInput').value='';
  document.getElementById('searchClear').style.display='none';
  loadProducts();
}
function applyFilters() { clearTimeout(searchDebounce); searchDebounce=setTimeout(loadProducts,260); }
function clearFilters() {
  document.getElementById('searchInput').value='';
  document.getElementById('categoryFilter').value='';
  document.getElementById('minPrice').value='';
  document.getElementById('maxPrice').value='';
  document.getElementById('searchClear').style.display='none';
  loadProducts();
}

/* ── IMAGE UPLOAD ────────────────────────────────────────────── */
async function uploadImage(input) {
  if(!input.files?.[0]) return;
  const file = input.files[0];
  if(file.size>16*1024*1024){ showToast('Image must be under 16MB.','error'); return; }
  const reader = new FileReader();
  reader.onload = e => {
    const img=document.getElementById('imagePreview');
    img.src=e.target.result; img.classList.remove('hidden');
    document.getElementById('imagePlaceholder').classList.add('hidden');
  };
  reader.readAsDataURL(file);
  const fd = new FormData(); fd.append('image',file);
  try {
    const res  = await fetch('/api/upload-image',{method:'POST',body:fd});
    const data = await res.json();
    if(res.ok){ 
      document.getElementById('productImagePath').value = data.image_path;
      showToast('Image uploaded!','success'); 
    }
    else showToast(data.error||'Upload failed.','error');
  } catch(e){ showToast('Upload error.','error'); }
}

/* ── PRODUCT MODAL ───────────────────────────────────────────── */
async function openProductModal(pid=null) {
  if(!isAdmin){ openLoginModal(); return; }
  ['productId','pNameEn','pNameAm','pPrice','pStock','pCategoryEn','pCategoryAm',
   'pSellerEn','pSellerAm','pPhone','pDescEn','pDescAm','productImagePath']
    .forEach(id=>{ document.getElementById(id).value=''; });
  document.getElementById('imagePreview').classList.add('hidden');
  document.getElementById('imagePlaceholder').classList.remove('hidden');
  hideFormError('productError');

  document.getElementById('productModalTitle').innerHTML = pid
    ? '<span class="lang-en-text">Edit Product</span><span class="lang-am-text">ምርት አርትዕ</span>'
    : '<span class="lang-en-text">Add Product</span><span class="lang-am-text">ምርት ጨምር</span>';

  if(pid) {
    try {
      const {product:p} = await fetchJSON(`/api/products/${pid}`);
      document.getElementById('productId').value       = p.id;
      document.getElementById('pNameEn').value         = p.name_en;
      document.getElementById('pNameAm').value         = p.name_am;
      document.getElementById('pPrice').value          = p.price;
      document.getElementById('pStock').value          = p.stock;
      document.getElementById('pCategoryEn').value     = p.category_en;
      document.getElementById('pCategoryAm').value     = p.category_am;
      document.getElementById('pSellerEn').value       = p.seller_en;
      document.getElementById('pSellerAm').value       = p.seller_am;
      document.getElementById('pPhone').value          = p.phone;
      document.getElementById('pDescEn').value         = p.desc_en;
      document.getElementById('pDescAm').value         = p.desc_am;
      document.getElementById('productImagePath').value= p.image_path;
      if(p.image_path) {
        const img=document.getElementById('imagePreview');
        img.src=p.image_path; img.classList.remove('hidden');
        document.getElementById('imagePlaceholder').classList.add('hidden');
      }
    } catch(e){ showToast('Failed to load product.','error'); }
  }
  openModal('productModal');
}

async function saveProduct() {
  const id = document.getElementById('productId').value;
  const payload = {
    name_en:     document.getElementById('pNameEn').value.trim(),
    name_am:     document.getElementById('pNameAm').value.trim(),
    price:       parseFloat(document.getElementById('pPrice').value)||0,
    stock:       parseInt(document.getElementById('pStock').value)||0,
    category_en: document.getElementById('pCategoryEn').value.trim(),
    category_am: document.getElementById('pCategoryAm').value.trim(),
    seller_en:   document.getElementById('pSellerEn').value.trim(),
    seller_am:   document.getElementById('pSellerAm').value.trim(),
    phone:       document.getElementById('pPhone').value.trim(),
    desc_en:     document.getElementById('pDescEn').value.trim(),
    desc_am:     document.getElementById('pDescAm').value.trim(),
    image_filename: document.getElementById('productImagePath').value.split('/').pop() || '',
  };
  if(!payload.name_en||!payload.name_am){ showFormError('productError','Both language names required.'); return; }
  if(!payload.category_en||!payload.category_am){ showFormError('productError','Both language categories required.'); return; }
  if(payload.price<=0){ showFormError('productError','Enter a valid price.'); return; }
  hideFormError('productError');
  const btn=document.getElementById('saveProductBtn');
  btn.disabled=true; btn.innerHTML='<i class="fas fa-spinner fa-spin"></i>';
  try {
    await fetchJSON(id?`/api/products/${id}`:'/api/products', id?'PUT':'POST', payload);
    closeModal('productModal');
    showToast(id?(currentLang==='en'?'Product updated!':'ተዘምኗል!'):(currentLang==='en'?'Product added!':'ተጨምሯል!'),'success');
    await loadCategories(); await loadProducts();
  } catch(e){ showFormError('productError',e.message||'Save failed.'); }
  finally {
    btn.disabled=false;
    btn.innerHTML='<i class="fas fa-floppy-disk"></i><span class="lang-en-text">Save Product</span><span class="lang-am-text">ምርት አስቀምጥ</span>';
  }
}

/* ── DELETE ──────────────────────────────────────────────────── */
function openConfirmDelete(pid) { document.getElementById('deleteProductId').value=pid; openModal('confirmModal'); }
async function confirmDelete() {
  const id=document.getElementById('deleteProductId').value;
  closeModal('confirmModal'); closeModal('detailModal');
  try {
    await fetchJSON(`/api/products/${id}`,'DELETE');
    showToast(currentLang==='en'?'Product deleted.':'ምርቱ ተሰርዟል።','success');
    await loadCategories(); await loadProducts();
  } catch(e){ showToast(e.message||'Delete failed.','error'); }
}

/* ── DETAIL MODAL ────────────────────────────────────────────── */
function openDetailModal(p) {
  const name   = currentLang==='en'?p.name_en:p.name_am;
  const cat    = currentLang==='en'?p.category_en:p.category_am;
  const desc   = currentLang==='en'?p.desc_en:p.desc_am;
  const seller = currentLang==='en'?p.seller_en:p.seller_am;
  const price  = Number(p.price).toLocaleString('en-ET',{minimumFractionDigits:2});

  document.getElementById('detailTitle').textContent   = name;
  document.getElementById('detailCategory').textContent= cat;
  document.getElementById('detailDesc').textContent    = desc||'—';
  document.getElementById('detailPrice').textContent   = `${price} ETB`;
  document.getElementById('detailSeller').textContent  = seller;
  const ph=document.getElementById('detailPhone');
  ph.textContent=p.phone; ph.href=`tel:${p.phone}`;

  const stockEl=document.getElementById('detailStock');
  if(p.stock===0){ stockEl.textContent=currentLang==='en'?'Out of Stock':'አቅርቦት አልቋል'; stockEl.className='detail-stock-badge card-stock out-stock'; }
  else if(p.stock<=5){ stockEl.textContent=currentLang==='en'?`Only ${p.stock} left`:`ቀሪ ${p.stock}`; stockEl.className='detail-stock-badge card-stock low-stock'; }
  else{ stockEl.textContent=currentLang==='en'?`In Stock (${p.stock})`:`አለ (${p.stock})`; stockEl.className='detail-stock-badge card-stock in-stock'; }

  const imgEl=document.getElementById('detailImage');
  if(p.image_path){ imgEl.src=p.image_path; imgEl.style.display='block'; imgEl.onerror=()=>{ imgEl.style.display='none'; }; }
  else imgEl.style.display='none';

  document.getElementById('detailContact').classList.add('hidden');

  const adminAct=document.getElementById('detailAdminActions');
  if(isAdmin){
    adminAct.classList.remove('hidden');
    document.getElementById('detailEditBtn').onclick  = ()=>{ closeModal('detailModal'); openProductModal(p.id); };
    document.getElementById('detailDeleteBtn').onclick= ()=>{ closeModal('detailModal'); openConfirmDelete(p.id); };
  } else adminAct.classList.add('hidden');

  openModal('detailModal');
}

/* ── SELLER TOGGLE ───────────────────────────────────────────── */
function toggleSellerInfo(id) { document.getElementById(id)?.classList.toggle('hidden'); }

/* ── MODALS ──────────────────────────────────────────────────── */
function openLoginModal() { if(isAdmin) return; openModal('loginModal'); setTimeout(()=>document.getElementById('loginUsername').focus(),80); }
function openChangePasswordModal() {
  if(!isAdmin) return;
  // Clear previous values and errors
  document.getElementById('currentPassword').value = '';
  document.getElementById('newPassword').value = '';
  document.getElementById('confirmPassword').value = '';
  hideFormError('changePasswordError');
  document.getElementById('changePasswordSuccess').classList.add('hidden');
  openModal('changePasswordModal');
  setTimeout(()=>document.getElementById('currentPassword').focus(), 80);
}
function openModal(id) { document.getElementById(id).classList.remove('hidden'); document.body.style.overflow='hidden'; }
function closeModal(id) {
  document.getElementById(id).classList.add('hidden');
  if(!document.querySelector('.modal-overlay:not(.hidden)')) document.body.style.overflow='';
}
document.querySelectorAll('.modal-overlay').forEach(o=>{
  o.addEventListener('click', e=>{ if(e.target===o) closeModal(o.id); });
});
document.addEventListener('keydown', e=>{
  if(e.key!=='Escape') return;
  ['confirmModal','productModal','detailModal','loginModal','changePasswordModal'].forEach(id=>{
    const el=document.getElementById(id);
    if(el&&!el.classList.contains('hidden')) closeModal(id);
  });
});

/* ── FORM HELPERS ────────────────────────────────────────────── */
function showFormError(id,msg){ const e=document.getElementById(id); if(!e) return; e.textContent=msg; e.classList.remove('hidden'); }
function hideFormError(id){ document.getElementById(id)?.classList.add('hidden'); }
function togglePw(inputId,btn){
  const inp=document.getElementById(inputId);
  const ico=btn.querySelector('i');
  if(inp.type==='password'){ inp.type='text'; ico.className='fas fa-eye-slash'; }
  else { inp.type='password'; ico.className='fas fa-eye'; }
}

async function handleChangePassword() {
  const oldPwd = document.getElementById('currentPassword').value;
  const newPwd = document.getElementById('newPassword').value;
  const confPwd = document.getElementById('confirmPassword').value;
  
  // Validate inputs
  if (!oldPwd) {
    showFormError('changePasswordError', currentLang==='en'?'Current password is required.':'የአሁኑ የይለፍ ቃል ያስፈልጋል።');
    return;
  }
  if (!newPwd) {
    showFormError('changePasswordError', currentLang==='en'?'New password is required.':'አዲስ የይለፍ ቃል ያስፈልጋል።');
    return;
  }
  if (newPwd.length < 6) {
    showFormError('changePasswordError', currentLang==='en'?'Password must be at least 6 characters.':'የይለፍ ቃል ቢያንስ 6 ቁምፊዎች መሆን አለበት።');
    return;
  }
  if (newPwd !== confPwd) {
    showFormError('changePasswordError', currentLang==='en'?'Passwords do not match.':'የይለፍ ቃሎች አይዛመዱም።');
    return;
  }
  if (oldPwd === newPwd) {
    showFormError('changePasswordError', currentLang==='en'?'New password must be different.':'አዲስ የይለፍ ቃል የተለየ መሆን አለበት።');
    return;
  }
  
  hideFormError('changePasswordError');
  const btn = document.getElementById('changePasswordBtn');
  btn.disabled = true;
  btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
  
  try {
    await fetchJSON('/api/change-password', 'POST', {
      old_password: oldPwd,
      new_password: newPwd,
      confirm_password: confPwd
    });
    
    // Show success message
    const successEl = document.getElementById('changePasswordSuccess');
    successEl.textContent = currentLang==='en'?'Password updated successfully!':'የይለፍ ቃል በተሳካ ሁኔታ ወደሸ!';
    successEl.classList.remove('hidden');
    
    // Clear inputs
    document.getElementById('currentPassword').value = '';
    document.getElementById('newPassword').value = '';
    document.getElementById('confirmPassword').value = '';
    
    showToast(currentLang==='en'?'Password changed successfully!':'የይለፍ ቃል በተሳካ ሁኔታ ተቀይሮ!', 'success');
    
    // Close modal after 2 seconds
    setTimeout(() => closeModal('changePasswordModal'), 2000);
  } catch(e) {
    showFormError('changePasswordError', e.message || (currentLang==='en'?'Failed to change password.':'የይለፍ ቃል ለመቀየር ወደደ።'));
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i class="fas fa-check"></i><span class="lang-en-text">Update Password</span><span class="lang-am-text">የይለፍ ቃል ይልወጡ</span>';
  }
}

/* ── FETCH HELPER ────────────────────────────────────────────── */
async function fetchJSON(url, method='GET', body=null) {
  const opts={method,headers:{}};
  if(body){ opts.headers['Content-Type']='application/json'; opts.body=JSON.stringify(body); }
  const res  = await fetch(url,opts);
  const data = await res.json();
  if(!res.ok) throw new Error(data.error||data.message||`HTTP ${res.status}`);
  return data;
}
